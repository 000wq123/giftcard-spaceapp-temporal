import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { newVaultHandle, type AuthUser, type Pane, type VaultHostFillResult, type VaultHostTarget } from "@space/contracts";
import { PostgresVaultRepository } from "@space/db";
import { cookieName, verifySession } from "../auth.js";
import { parseBody, parseQuery } from "../route-parsing.js";
import { GitControlError } from "../source-control/errors.js";
import { vaultAgentFillGate, type VaultAgentFillGate } from "./agent-fill-gate.js";
import { VaultBrokerUnavailableError, createSocketVaultBroker, type VaultBroker } from "./broker-client.js";
import { createVaultProtection, registerVaultFences, type VaultProtection, type VaultProtectionStore } from "./protection.js";
import { registerVaultAgentRoutes, registerVaultRoutes, type VaultStore } from "./routes.js";
import { runVaultSignup } from "./signup.js";
import type { NotificationService } from "../notifications/service.js";

/** Tests replace the storage, the broker and the custody gate. */
export interface VaultOverrides { repository?: (VaultStore & VaultProtectionStore) | null; broker?: VaultBroker; agentFillGate?: () => Promise<VaultAgentFillGate> }
export type VaultModule = { repository: VaultStore | null; agentFillGate: () => Promise<VaultAgentFillGate>; protection: VaultProtection; broker: VaultBroker; notifications?: Pick<NotificationService, "raise" | "resolve"> };

const unavailable = () => Promise.reject(new VaultBrokerUnavailableError());
/** Dev never reaches stable's sockets, so it has no broker: enrollment and unlock fail closed there. */
const noBroker: VaultBroker = { transportKey: unavailable, delegationKey: unavailable, delegate: unavailable, revoke: unavailable, issueUse: unavailable, openFill: unavailable, sealServerShare: unavailable, unlock: unavailable,
  signupGrant: unavailable, signup: unavailable, signupRevoke: unavailable };

export function registerVault(app: FastifyInstance, deps: {
  config: { databaseUrl?: string | null; instance: string; vaultAgentFillEnabled?: boolean; internalApiToken?: string | null };
  auth: { sessionSecret: string };
  store: {
    upsertUser(user: AuthUser): Promise<AuthUser> | AuthUser;
    getPane(paneId: string): Promise<{ roomId: string }> | { roomId: string };
    getRoom(roomId: string): Promise<{ ownerUserId?: string | null }> | { ownerUserId?: string | null };
    getPaneOwner?(paneId: string): Promise<string | null> | string | null;
  };
  routeOptions: Record<string, unknown>;
  overrides?: VaultOverrides;
  notifications?: Pick<NotificationService, "raise" | "resolve">;
}): VaultModule {
  const { config, overrides = {} } = deps;
  const repository = overrides.repository !== undefined ? overrides.repository
    : config.databaseUrl ? PostgresVaultRepository.fromConnectionString(config.databaseUrl) : null;
  if (repository && overrides.repository === undefined) app.addHook("onClose", async () => (repository as PostgresVaultRepository).dispose());
  const agentFillGate = overrides.agentFillGate ?? (() => vaultAgentFillGate(config.vaultAgentFillEnabled === true));
  const broker = overrides.broker ?? (config.instance === "stable" ? createSocketVaultBroker() : noBroker);
  const protection = createVaultProtection(repository as (VaultStore & VaultProtectionStore) | null);
  registerVaultFences(app, { protection, config: { internalApiToken: config.internalApiToken ?? null } });
  const paneOwner = async (paneId: string) => {
    try {
      const pane = await deps.store.getPane(paneId);
      return (await deps.store.getPaneOwner?.(paneId)) ?? (await deps.store.getRoom(pane.roomId)).ownerUserId ?? null;
    } catch { return null; }
  };
  registerVaultRoutes(app, {
    notifications: deps.notifications,
    repository, agentFillGate, parseBody, parseQuery, protection, paneOwner, broker,
    routeOptions: deps.routeOptions,
    strictRouteOptions: { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    owner: async (request) => {
      if (!request.user || !verifySession(request.cookies[cookieName], deps.auth.sessionSecret)) throw new GitControlError("UNAUTHENTICATED", "Sign in to use the Vault.", 401);
      // Proof and capture sessions act for the operator but never hold a key to their Vault.
      if (request.user.automationScope) throw new GitControlError("VAULT_AUTOMATION_REFUSED", "Automation sessions cannot use the Vault.", 403);
      return (await deps.store.upsertUser(request.user)).id;
    }
  });
  return { repository, agentFillGate, protection, broker, notifications: deps.notifications };
}

/** Agent routes on the CLI bridge: the owner is the pane's explicit owner, else the room's, from the verified token only. */
export function registerVaultAgentBridge(app: FastifyInstance, vault: VaultModule, deps: {
  store: {
    getRoom(roomId: string): Promise<{ ownerUserId?: string | null }> | { ownerUserId?: string | null };
    getPaneOwner?(paneId: string): Promise<string | null> | string | null;
    listPanes(roomId: string): Promise<Pane[]> | Pane[];
  };
  requireBridge(request: FastifyRequest, reply: FastifyReply): Promise<{ claims: { roomId: string; paneId: string } } | null>;
  /** The Browser Host's sealed fill (absent where no Browser Host runs). */
  browser?: { vaultTarget?(pane: Pane): Promise<VaultHostTarget>; vaultFill?(pane: Pane, request: unknown, traceId: string): Promise<VaultHostFillResult> };
}): void {
  const recent = new Map<string, number[]>();
  registerVaultAgentRoutes(app, {
    repository: vault.repository, agentFillGate: vault.agentFillGate, parseBody, notifications: vault.notifications,
    routeOptions: { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    requireOwner: async (request, reply) => {
      const bridge = await deps.requireBridge(request, reply);
      if (!bridge) return null;
      const owner = (await deps.store.getPaneOwner?.(bridge.claims.paneId)) ?? (await deps.store.getRoom(bridge.claims.roomId)).ownerUserId ?? null;
      return { owner, paneId: bridge.claims.paneId, roomId: bridge.claims.roomId };
    },
    // Reached only while the custody gate is open (agent-fill-gate.ts).
    fill: async ({ owner, cliPaneId, roomId, path, body, traceId }) => {
      const blocked = (reason: string) => ({ status: "BLOCKED" as const, reason });
      if (path !== "fill" && path !== "totp-fill" && path !== "generate-fill") return blocked("NOT_A_FILL");
      if (!vault.repository || !deps.browser?.vaultTarget || !deps.browser.vaultFill) return blocked("FILL_PATH_UNAVAILABLE");
      // The browser to fill: the calling pane's own when protected, else the one protected browser in its room.
      const panes = (await deps.store.listPanes(roomId)).filter((pane) => !pane.isClosed);
      const owned = [];
      for (const pane of panes) if (await vault.protection.ownerOf(pane.id) === owner) owned.push(pane);
      const pane = owned.find((candidate) => candidate.id === cliPaneId) ?? (owned.length === 1 ? owned[0] : undefined);
      if (!pane) return blocked(owned.length > 1 ? "AMBIGUOUS_BROWSER" : "NOT_PROTECTED");
      // A new account has no item yet: it runs only under a sign-up grant the operator signed (option B, signup.ts).
      if (path === "generate-fill" && body.purpose === "NEW_ACCOUNT") {
        const target = await deps.browser.vaultTarget(pane);
        if (!target.eligible || !target.targetId || !target.frameId || !target.origin) return blocked(target.reason ?? "NOT_ELIGIBLE");
        const { vaultFill } = deps.browser;
        return runVaultSignup({ repository: vault.repository, fill: (request) => vaultFill(pane, { mode: "SIGNUP", ...request }, traceId) },
          { owner, paneId: pane.id, target: { targetId: target.targetId, frameId: target.frameId, origin: target.origin }, label: String(body.label),
            username: typeof body.username === "string" ? body.username : null, roles: Array.isArray(body.roles) && body.roles.length ? body.roles as Array<"NEW_PASSWORD" | "CONFIRM_PASSWORD"> : ["NEW_PASSWORD"],
            submit: body.submit === true });
      }
      const handle = String(body.handle);
      const fields = path === "totp-fill" ? ["OTP"] : path === "generate-fill" ? ["PASSWORD"] : (body.fields as string[]);
      const delegation = await vault.repository.getActiveDelegation(owner);
      const delegated = delegation?.certificate.claims.items.find((item) => item.handle === handle);
      if (!delegation || !delegated || fields.some((field) => !delegated.fields.includes(field as never))) return blocked("NOT_DELEGATED");
      // Assist: one operator approval for this item, pane and fields, spent by this fill.
      if (delegated.approvalMode === "ASSIST" && !await vault.repository.consumeApproval(owner, { handle, paneId: cliPaneId, fields })) return blocked("APPROVAL_REQUIRED");
      const submit = body.submit === true;
      if (submit && !delegated.submit) return blocked("SUBMIT_NOT_ALLOWED");
      // Per item, the item's own hourly limit (in memory: a restart only makes the window start again).
      const item = await vault.repository.getItem(owner, handle);
      const limit = item?.metadata.policy.maxFillsPerHour ?? 0;
      const window = (recent.get(`${owner}|${handle}`) ?? []).filter((at) => Date.now() - at < 3_600_000);
      if (window.length >= limit) return { status: "RATE_LIMITED" as const, reason: "ITEM_LIMIT" };
      recent.set(`${owner}|${handle}`, [...window, Date.now()]);
      const target = await deps.browser.vaultTarget(pane);
      if (!target.eligible || !target.targetId || !target.frameId || !target.origin) return blocked(target.reason ?? "NOT_ELIGIBLE");
      if (!delegated.origins.includes(target.origin)) return { status: "ORIGIN_MISMATCH" as const, reason: "ORIGIN_NOT_DELEGATED" };
      // A generated password is sealed by the Browser Host to the operator's inbox key; the dock keeps or discards it.
      const inbox = path === "generate-fill" ? await vault.repository.getInbox(owner) : null;
      if (path === "generate-fill" && !inbox) return blocked("INBOX_NOT_READY");
      const epoch = (await vault.repository.getVault(owner))?.epoch;
      if (!epoch) return blocked("NOT_ENROLLED");
      const roles = Array.isArray(body.roles) && body.roles.length ? body.roles as string[] : ["NEW_PASSWORD"];
      const { capability } = await vault.broker.issueUse({ ownerUserId: owner, vaultId: delegation.certificate.claims.vaultId, certificate: delegation.certificate, epoch,
        handle, fields, submit, paneId: pane.id, targetId: target.targetId, pageId: target.targetId, frameId: target.frameId, origin: target.origin,
        ...(inbox ? { generate: { roles, inboxPublicKey: inbox.publicKey } } : {}) });
      const result = await deps.browser.vaultFill(pane, { mode: path === "totp-fill" ? "TOTP" : path === "generate-fill" ? "GENERATE" : "FILL", capability,
        keyEnvelope: delegation.keyEnvelope, fieldEnvelopes: delegation.fillEnvelopes[handle] ?? {} }, traceId);
      if (result.sealedGenerated && (result.status === "FILLED" || result.status === "SUBMITTED")) {
        await vault.repository.addPending(owner, { id: newVaultHandle("vault_pending"), kind: "CHANGE_PASSWORD", handle, label: item?.metadata.label ?? "Changed password",
          origin: target.origin, sealedUsername: null, sealedPassword: result.sealedGenerated, paneId: pane.id, createdAt: new Date().toISOString() });
      }
      return { status: result.status, reason: result.reason };
    }
  });
}

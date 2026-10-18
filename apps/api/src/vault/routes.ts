import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  vaultAgentApprovalRequestSchema, vaultAgentAuditRequestSchema, vaultAgentEmptyRequestSchema, vaultAgentFillRequestSchema,
  vaultAgentGenerateRequestSchema, vaultAgentResultSchema, vaultAgentTotpRequestSchema, vaultAuditQuerySchema, vaultEnrollRequestSchema,
  vaultItemIdSchema, vaultItemRecordSchema, vaultPasswordRotateRequestSchema, vaultRecoverySchema, vaultUnlockRequestSchema,
  vaultBase64url, vaultCanonicalJson, vaultDelegateRequestSchema, vaultInboxKeyRequestSchema, vaultPendingIdSchema, vaultApprovalIdSchema,
  vaultApprovalDecisionSchema, vaultAgentListResultSchema, newVaultHandle, vaultDelegationCertificateSchema, vaultDigest, verifyVaultCertificate,
  vaultSignupGrantCertificateSchema, vaultSignupGrantIdSchema, vaultSignupGrantRequestSchema, VAULT_SIGNUP_GRANT_LIMITS,
  type VaultAgentResult, type VaultAuditEvent
} from "@space/contracts";
import { VaultConflictError, type PostgresVaultRepository } from "@space/db";
import { GitControlError } from "../source-control/errors.js";
import { VaultBrokerUnavailableError, type VaultBroker } from "./broker-client.js";
import type { VaultAgentFillGate } from "./agent-fill-gate.js";
import type { VaultProtection } from "./protection.js";
import type { NotificationService } from "../notifications/service.js";

// Vault routes (plan clipboard:vEYtT6-bEN0J step 4, ADR-012). Operator routes under /api/space-vault/* move ciphertext,
// public keys and metadata only (the browser decrypts); session, CSRF and same-site checks are the API's global hook.
// Agent routes under /api/cli/space-vault/* answer only the fixed VaultAgentResult; while the custody gate is closed
// (always, until the operator's install and per-user CLI containers) every agent call is BLOCKED and audited.

export const cliVaultPathPrefix = "/api/cli/space-vault/";
export type VaultStore = Pick<PostgresVaultRepository,
  "getVault" | "enroll" | "rotateUnlock" | "setRecovery" | "bumpEpoch" | "saveItem" | "getItem" | "listItems" | "deleteItem"
  | "revokeAgentAccess" | "issueNonce" | "consumeNonce" | "appendAudit" | "listAudit" | "verifyAudit" | "createDelegation" | "getActiveDelegation"
  | "setInbox" | "getInbox" | "addPending" | "listPending" | "deletePending" | "addApproval" | "listApprovals" | "decideApproval" | "consumeApproval"
  | "addSignupGrant" | "listSignupGrants" | "revokeSignupGrant">;

const notEnrolled = (): never => { throw new GitControlError("VAULT_NOT_ENROLLED", "Set up the Vault first.", 404); };
const itemNotFound = (): never => { throw new GitControlError("VAULT_ITEM_NOT_FOUND", "This Vault item was not found.", 404); };
const itemParams = z.object({ id: vaultItemIdSchema }).strict();
const conflict = (error: unknown): never => {
  if (error instanceof VaultConflictError) throw new GitControlError(error.code, "The Vault changed meanwhile or the request does not match it.", 409);
  throw error;
};

export interface VaultRouteDependencies {
  /** null without a database: every route answers VAULT_STORAGE_UNAVAILABLE. */
  repository: VaultStore | null;
  broker: VaultBroker;
  agentFillGate(): Promise<VaultAgentFillGate>;
  /** The signed-in user (never an automation session); a vault is personal, so this is the only owner. */
  owner(request: FastifyRequest): Promise<string>;
  routeOptions: Record<string, unknown>;
  /** Unlock, enrollment and key changes: a tighter per-client limit. */
  strictRouteOptions: Record<string, unknown>;
  parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema>;
  parseQuery<TSchema extends z.ZodTypeAny>(schema: TSchema, query: unknown): z.infer<TSchema>;
  protection: VaultProtection;
  /** The pane's owner (its explicit owner, else its room's); null when the pane does not exist. */
  paneOwner(paneId: string): Promise<string | null>;
  notifications?: Pick<NotificationService, "raise" | "resolve">;
}

const paneParams = z.object({ paneId: z.string().regex(/^pane:[A-Za-z0-9_-]{6,80}$/) }).strict();

export function registerVaultRoutes(app: FastifyInstance, deps: VaultRouteDependencies): void {
  const { routeOptions, strictRouteOptions, parseBody, parseQuery, broker } = deps;
  const route = (path: string) => `/api/space-vault${path}`;
  const repository = () => {
    if (!deps.repository) throw new GitControlError("VAULT_STORAGE_UNAVAILABLE", "The Vault needs the Space database.", 503);
    return deps.repository;
  };
  const vaultOf = async (owner: string) => (await repository().getVault(owner)) ?? notEnrolled();

  app.get(route("/state"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const vault = await repository().getVault(owner);
    const gate = await deps.agentFillGate();
    const brokerAvailable = await broker.transportKey().then(() => true, () => false);
    return {
      ownerUserId: owner, enrolled: vault !== null, brokerAvailable, agentFill: gate.enabled ? "ENABLED" : gate.reason,
      vault: vault && { vaultId: vault.vaultId, epoch: vault.epoch, delegationGeneration: vault.delegationGeneration, kdf: vault.kdf,
        unlockKeyVersion: vault.unlockKeyVersion, hasRecovery: vault.recovery !== null, auditSeq: vault.auditSeq, createdAt: vault.createdAt, updatedAt: vault.updatedAt }
    };
  });

  app.get(route("/broker"), routeOptions, async (request) => {
    await deps.owner(request);
    return broker.transportKey();
  });

  app.post(route("/enroll"), strictRouteOptions, async (request, reply) => {
    const owner = await deps.owner(request);
    const body = parseBody(vaultEnrollRequestSchema, request.body);
    if (await repository().getVault(owner)) throw new GitControlError("VAULT_EXISTS", "This account already has a Vault.", 409);
    const serverShareEnvelope = await broker.sealServerShare({ ownerUserId: owner, vaultId: body.vaultId, keyVersion: 1, sealedServerShare: body.sealedServerShare, unlockPublicKey: body.unlockPublicKey });
    const { sealedServerShare: _sealed, ...rest } = body;
    const vault = await repository().enroll(owner, { ...rest, serverShareEnvelope }).catch(conflict);
    return reply.code(201).send({ vaultId: vault.vaultId, epoch: vault.epoch });
  });

  app.post(route("/unlock/challenge"), strictRouteOptions, async (request) => {
    const owner = await deps.owner(request);
    const vault = await vaultOf(owner);
    const issued = (await repository().issueNonce(owner, "UNLOCK_CHALLENGE", 120_000)) ?? notEnrolled();
    // The browser opens its password envelope (ciphertext under the master password) to sign the challenge.
    return { challenge: issued.nonce, epoch: issued.epoch, expiresAt: issued.expiresAt, vaultId: vault.vaultId, passwordEnvelope: vault.passwordEnvelope, kdf: vault.kdf, unlockKeyVersion: vault.unlockKeyVersion };
  });

  app.post(route("/unlock"), strictRouteOptions, async (request) => {
    const owner = await deps.owner(request);
    const body = parseBody(vaultUnlockRequestSchema, request.body);
    const vault = await vaultOf(owner);
    const blocked = async (reason: string) => {
      await repository().appendAudit(owner, { actor: "OPERATOR", action: "UNLOCK", result: "BLOCKED", reason });
      return new GitControlError("VAULT_UNLOCK_REFUSED", "The unlock was refused. Start again.", 409);
    };
    if (!await repository().consumeNonce(owner, body.challenge, "UNLOCK_CHALLENGE")) throw await blocked("CHALLENGE_INVALID");
    let sealedServerShare;
    try {
      sealedServerShare = await broker.unlock({ ownerUserId: owner, vaultId: vault.vaultId, epoch: vault.epoch, ...body,
        unlockPublicKey: vault.unlockPublicKey, serverShareEnvelope: vault.serverShareEnvelope });
    } catch (error) {
      await repository().appendAudit(owner, { actor: "OPERATOR", action: "UNLOCK", result: "BLOCKED", reason: "BROKER_REFUSED" });
      throw error;
    }
    await repository().appendAudit(owner, { actor: "OPERATOR", action: "UNLOCK", result: "OK" });
    return { sealedServerShare, epoch: vault.epoch };
  });

  app.post(route("/lock"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    return { epoch: (await repository().bumpEpoch(owner, "OPERATOR_LOCK", "LOCK")) ?? notEnrolled() };
  });

  app.get(route("/items"), routeOptions, async (request) => ({ items: await repository().listItems(await deps.owner(request)) }));

  app.get(route("/items/:id"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    return { item: (await repository().getItem(owner, parseQuery(itemParams, request.params).id)) ?? itemNotFound() };
  });

  app.put(route("/items/:id"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const { id } = parseQuery(itemParams, request.params);
    const item = parseBody(vaultItemRecordSchema, request.body);
    if (item.metadata.id !== id) throw new GitControlError("VAULT_ITEM_MISMATCH", "The item id does not match the address.", 422);
    await vaultOf(owner);
    return { item: (await repository().saveItem(owner, item)) ?? itemNotFound() };
  });

  app.delete(route("/items/:id"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    if (!await repository().deleteItem(owner, parseQuery(itemParams, request.params).id)) itemNotFound();
    return { deleted: true };
  });

  app.post(route("/password"), strictRouteOptions, async (request) => {
    const owner = await deps.owner(request);
    const { expectedEpoch, ...next } = parseBody(vaultPasswordRotateRequestSchema, request.body);
    const vault = await vaultOf(owner);
    const rotated = await repository().rotateUnlock(owner, expectedEpoch, { ...next, serverShareEnvelope: vault.serverShareEnvelope }).catch(conflict);
    return { epoch: (rotated ?? notEnrolled()).epoch };
  });

  app.put(route("/recovery"), strictRouteOptions, async (request) => {
    const owner = await deps.owner(request);
    if (!await repository().setRecovery(owner, parseBody(vaultRecoverySchema, request.body))) notEnrolled();
    return { recovery: true };
  });

  // Delegate items to agents. The broker signs the certificate; the API checks that signature against the broker's key and
  // that it names exactly the requested, agent-allowed items, their stored origins and fields, before anything is stored.
  app.post(route("/delegations"), strictRouteOptions, async (request) => {
    const owner = await deps.owner(request);
    const body = parseBody(vaultDelegateRequestSchema, request.body);
    const vault = await vaultOf(owner);
    const refuse = async (reason: string) => {
      await repository().appendAudit(owner, { actor: "OPERATOR", action: "DELEGATE", result: "BLOCKED", reason });
      return new GitControlError("VAULT_DELEGATION_REFUSED", "The delegation was refused; nothing changed.", 409);
    };
    const items = [];
    for (const requested of body.items) {
      const stored = await repository().getItem(owner, requested.handle);
      const metadata = stored?.metadata;
      if (!metadata || !metadata.policy.agentUse || metadata.status !== "ACTIVE" || requested.fields.some((field) => !metadata.fieldRoles.includes(field))
        || (requested.submit && !metadata.policy.submitAllowed)) throw await refuse("ITEM_NOT_DELEGABLE");
      if (Object.keys(body.fillEnvelopes[requested.handle] ?? {}).sort().join() !== [...requested.fields].sort().join()) throw await refuse("ENVELOPES_MISMATCH");
      // The operator signs the item's own exact origins; any other set never reaches the broker.
      if ([...requested.origins].sort().join("\n") !== [...metadata.origins].sort().join("\n")) throw await refuse("ORIGINS_MISMATCH");
      items.push({ handle: requested.handle, origins: metadata.origins, fields: requested.fields, approvalMode: requested.approvalMode, submit: requested.submit });
    }
    if (Object.keys(body.fillEnvelopes).some((handle) => !body.items.some((item) => item.handle === handle))) throw await refuse("ENVELOPES_MISMATCH");
    // Generation, epoch and expiry are part of what the operator signed; they must also be this vault's next ones.
    const expires = Date.parse(body.expiresAt);
    if (body.generation !== vault.delegationGeneration + 1 || body.unlockEpoch !== vault.epoch || !(expires > Date.now() && expires <= Date.now() + 720 * 3_600_000)) {
      throw await refuse("DELEGATION_STALE");
    }
    const asked = { generation: body.generation, unlockEpoch: body.unlockEpoch, envelopeDigest: await vaultDigest(body.fillEnvelopes), expiresAt: body.expiresAt };
    const signed = await broker.delegate({ ownerUserId: owner, vaultId: vault.vaultId, ...asked, items, sealedFillKey: body.sealedFillKey,
      operatorSignature: body.operatorSignature, unlockPublicKey: vault.unlockPublicKey, serverShareEnvelope: vault.serverShareEnvelope })
      .catch(async (error) => { if (error instanceof VaultBrokerUnavailableError) throw error; throw await refuse("BROKER_REFUSED"); });
    const brokerKey = await broker.delegationKey();
    let claims;
    try { claims = await verifyVaultCertificate(vaultBase64url.decode(brokerKey.publicKey), signed.certificate, vaultDelegationCertificateSchema); } catch { throw await refuse("CERTIFICATE_INVALID"); }
    if (vaultCanonicalJson(claims.items) !== vaultCanonicalJson(items) || claims.generation !== asked.generation || claims.envelopeDigest !== asked.envelopeDigest
      || claims.unlockEpoch !== asked.unlockEpoch || claims.expiresAt !== asked.expiresAt) throw await refuse("CERTIFICATE_MISMATCH");
    const stored = await repository().createDelegation(owner, { certificate: signed.certificate, keyEnvelope: signed.keyEnvelope, fillEnvelopes: body.fillEnvelopes })
      .catch(async (error) => { if (error instanceof VaultConflictError) throw await refuse("CERTIFICATE_MISMATCH"); throw error; });
    return stored ?? notEnrolled();
  });

  // Revoke agent access: no password needed, effective at once (new generation and epoch, delegated envelopes deleted).
  app.post(route("/revoke"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const vault = await vaultOf(owner);
    const revoked = (await repository().revokeAgentAccess(owner, "OPERATOR")) ?? notEnrolled();
    // The broker raises its own floor too; revocation never waits for it (the stored delegation is already gone).
    await broker.revoke({ ownerUserId: owner, vaultId: vault.vaultId, generation: revoked.generation }).catch(() => undefined);
    return revoked;
  });

  // Sign-up grants (NEW_ACCOUNT option B, operator decision 2026-10-18): the dock's unlock key signs exact https sites, a
  // daily cap and an expiry; the broker certifies them and enforces each use. Listing never returns the certificate.
  app.get(route("/signup-grants"), routeOptions, async (request) => ({
    grants: (await repository().listSignupGrants(await deps.owner(request))).map(({ certificate: _certificate, ...grant }) => grant)
  }));
  app.post(route("/signup-grants"), strictRouteOptions, async (request, reply) => {
    const owner = await deps.owner(request);
    const body = parseBody(vaultSignupGrantRequestSchema, request.body);
    const vault = await vaultOf(owner);
    const refuse = async (reason: string) => {
      await repository().appendAudit(owner, { actor: "OPERATOR", action: "SIGNUP_GRANT", result: "BLOCKED", reason });
      return new GitControlError("VAULT_GRANT_REFUSED", "The sign-up grant was refused; nothing changed.", 409);
    };
    const expires = Date.parse(body.expiresAt);
    if (body.unlockEpoch !== vault.epoch || !(expires > Date.now() && expires <= Date.now() + VAULT_SIGNUP_GRANT_LIMITS.maxDays * 86_400_000)) throw await refuse("GRANT_STALE");
    const signed = await broker.signupGrant({ ownerUserId: owner, vaultId: vault.vaultId, ...body, unlockPublicKey: vault.unlockPublicKey, serverShareEnvelope: vault.serverShareEnvelope })
      .catch(async (error) => { if (error instanceof VaultBrokerUnavailableError) throw error; throw await refuse("BROKER_REFUSED"); });
    const brokerKey = await broker.delegationKey();
    let claims;
    try { claims = await verifyVaultCertificate(vaultBase64url.decode(brokerKey.publicKey), signed.certificate, vaultSignupGrantCertificateSchema); } catch { throw await refuse("CERTIFICATE_INVALID"); }
    if (claims.grantId !== body.grantId || claims.ownerUserId !== owner || claims.vaultId !== vault.vaultId || claims.dailyCap !== body.dailyCap || claims.expiresAt !== body.expiresAt
      || claims.unlockEpoch !== body.unlockEpoch || vaultCanonicalJson(claims.sites) !== vaultCanonicalJson([...body.sites].sort())) throw await refuse("CERTIFICATE_MISMATCH");
    if (!await repository().addSignupGrant(owner, signed.certificate).catch(() => false)) throw await refuse("GRANT_NOT_STORED");
    return reply.code(201).send({ grant: { id: claims.grantId, sites: claims.sites, dailyCap: claims.dailyCap, createdAt: claims.issuedAt, expiresAt: claims.expiresAt, revokedAt: null } });
  });
  app.delete(route("/signup-grants/:id"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const { id } = parseQuery(z.object({ id: vaultSignupGrantIdSchema }).strict(), request.params);
    const vault = await vaultOf(owner);
    if (!await repository().revokeSignupGrant(owner, id)) throw new GitControlError("VAULT_GRANT_NOT_FOUND", "This sign-up grant was not found or is already revoked.", 404);
    // The fill path uses only grants the store still lists, so revocation never waits for the broker.
    await broker.signupRevoke({ ownerUserId: owner, vaultId: vault.vaultId, grantId: id }).catch(() => undefined);
    return { revoked: true };
  });

  app.get(route("/audit"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const query = parseQuery(vaultAuditQuerySchema, request.query);
    const entries = await repository().listAudit(owner, query);
    return { entries, nextBeforeSeq: entries.length === query.limit ? entries.at(-1)!.seq : null };
  });

  // Protected browser for the Vault: only its owner sees it, agents get no generic read surface (protection.ts).
  app.get(route("/protected-panes"), routeOptions, async (request) => ({ paneIds: await deps.protection.list(await deps.owner(request)) }));
  app.put(route("/protected-panes/:paneId"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const { paneId } = parseQuery(paneParams, request.params);
    await vaultOf(owner);
    if (await deps.paneOwner(paneId) !== owner) throw new GitControlError("VAULT_PANE_NOT_FOUND", "This pane was not found among yours.", 404);
    if (!await deps.protection.protect(owner, paneId)) throw new GitControlError("VAULT_PANE_PROTECTED_ELSEWHERE", "This pane is already protected by another account.", 409);
    await repository().appendAudit(owner, { actor: "OPERATOR", action: "EPOCH_BUMP", result: "OK", reason: "PANE_PROTECTED", paneId });
    return { protected: true };
  });
  app.delete(route("/protected-panes/:paneId"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const { paneId } = parseQuery(paneParams, request.params);
    if (!await deps.protection.unprotect(owner, paneId)) throw new GitControlError("VAULT_PANE_NOT_FOUND", "This pane is not protected by you.", 404);
    // Leaving protection ends every outstanding capability for it.
    await repository().bumpEpoch(owner, "PANE_UNPROTECTED");
    return { protected: false };
  });

  // The inbox key (public half for fills, private half sealed under the VRK) and the passwords waiting in it.
  app.get(route("/inbox"), routeOptions, async (request) => ({ inbox: await repository().getInbox(await deps.owner(request)) }));
  app.put(route("/inbox"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    if (!await repository().setInbox(owner, parseBody(vaultInboxKeyRequestSchema, request.body))) notEnrolled();
    return { inbox: true };
  });
  app.get(route("/pending"), routeOptions, async (request) => ({ pending: await repository().listPending(await deps.owner(request)) }));
  app.delete(route("/pending/:id"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const { id } = parseQuery(z.object({ id: vaultPendingIdSchema }).strict(), request.params);
    if (!await repository().deletePending(owner, id)) throw new GitControlError("VAULT_PENDING_NOT_FOUND", "This waiting password was not found.", 404);
    return { deleted: true };
  });

  // Assist approvals the agents asked for; one approval allows one fill of those fields in that pane.
  app.get(route("/approvals"), routeOptions, async (request) => ({ approvals: await repository().listApprovals(await deps.owner(request)) }));
  app.post(route("/approvals/:id"), routeOptions, async (request) => {
    const owner = await deps.owner(request);
    const { id } = parseQuery(z.object({ id: vaultApprovalIdSchema }).strict(), request.params);
    const { decision } = parseBody(vaultApprovalDecisionSchema, request.body);
    if (!await repository().decideApproval(owner, id, decision)) throw new GitControlError("VAULT_APPROVAL_CLOSED", "This request was already decided or has expired.", 409);
    await repository().appendAudit(owner, { actor: "OPERATOR", action: "APPROVAL", result: "OK", reason: decision === "APPROVE" ? "APPROVED" : "DENIED" });
    await deps.notifications?.resolve(owner, `vault:approval:${id}`).catch(() => undefined);
    return { decided: decision };
  });

  app.get(route("/audit/verify"), routeOptions, async (request) => repository().verifyAudit(await deps.owner(request)));
}

export interface VaultAgentRouteDependencies {
  repository: VaultStore | null;
  agentFillGate(): Promise<VaultAgentFillGate>;
  /** The verified bridge's pane owner (the pane's explicit owner, else the room's); null when the pane has none. */
  requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<{ owner: string | null; paneId: string; roomId: string } | null>;
  /** The sealed fill through the Browser Host; used only while the custody gate is open. */
  fill?(input: { owner: string; cliPaneId: string; roomId: string; path: string; body: Record<string, unknown>; traceId: string }): Promise<{ status: VaultAgentResult["status"]; reason: string | null }>;
  routeOptions: Record<string, unknown>;
  parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema>;
  notifications?: Pick<NotificationService, "raise" | "resolve">;
}

const agentRoutes: Array<{ path: string; schema: z.ZodTypeAny; action: VaultAuditEvent["action"] }> = [
  { path: "status", schema: vaultAgentEmptyRequestSchema, action: "AGENT_LIST" },
  { path: "list", schema: vaultAgentEmptyRequestSchema, action: "AGENT_LIST" },
  { path: "fill", schema: vaultAgentFillRequestSchema, action: "FILL" },
  { path: "totp-fill", schema: vaultAgentTotpRequestSchema, action: "FILL" },
  { path: "generate-fill", schema: vaultAgentGenerateRequestSchema, action: "GENERATE" },
  { path: "approval", schema: vaultAgentApprovalRequestSchema, action: "APPROVAL" },
  { path: "audit", schema: vaultAgentAuditRequestSchema, action: "AGENT_LIST" }
];

/** Every agent call is validated, audited and answered with BLOCKED until the sealed fill path exists behind an open gate. */
export function registerVaultAgentRoutes(app: FastifyInstance, deps: VaultAgentRouteDependencies): void {
  for (const { path, schema, action } of agentRoutes) {
    app.post(`${cliVaultPathPrefix}${path}`, deps.routeOptions, async (request, reply) => {
      const context = await deps.requireOwner(request, reply);
      if (!context) return reply;
      const body = deps.parseBody(schema, request.body ?? {}) as { handle?: string; fields?: string[] };
      const gate = await deps.agentFillGate();
      const repo = deps.repository;
      // While agent fills are on: the delegated items as handles, and Assist requests for the operator.
      if (gate.enabled && context.owner && repo && (path === "list" || path === "approval")) {
        const delegation = await repo.getActiveDelegation(context.owner);
        const delegated = delegation?.certificate.claims.items ?? [];
        if (path === "list") {
          const items = [];
          for (const item of delegated) {
            const stored = await repo.getItem(context.owner, item.handle);
            if (stored) items.push({ handle: item.handle, label: stored.metadata.label, origins: item.origins, fields: item.fields, approvalMode: item.approvalMode });
          }
          const audited = await repo.appendAudit(context.owner, { actor: "AGENT", action, result: "LISTED", paneId: context.paneId });
          return vaultAgentListResultSchema.parse({ status: "LISTED", auditId: audited?.id ?? null, items });
        }
        const item = delegated.find((entry) => entry.handle === body.handle);
        const allowed = item && (body.fields ?? []).every((field) => item.fields.includes(field as never));
        if (allowed) {
          const id = newVaultHandle("vault_approval");
          await repo.addApproval(context.owner, { id, handle: body.handle!, fields: body.fields!, paneId: context.paneId, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() });
          // The operator decides in the Vault dock; the card names the item and fields only, never a value.
          const label = (await repo.getItem(context.owner, body.handle!))?.metadata.label ?? "A Vault item";
          await deps.notifications?.raise({ ownerUserId: context.owner, paneId: context.paneId, source: "SYSTEM", kind: "VAULT_APPROVAL", severity: "ATTENTION",
            title: "An agent asks to use a Vault item", body: `${label}: ${body.fields!.map((field) => field.toLowerCase()).join(" and ")}, once, within 10 minutes.`,
            link: { surface: "vault", paneId: context.paneId }, dedupeKey: `vault:approval:${id}`, roomId: null, payload: {}, telegram: null }).catch(() => undefined);
        }
        const audited = await repo.appendAudit(context.owner, { actor: "AGENT", action, result: allowed ? "APPROVAL_REQUESTED" : "BLOCKED", reason: allowed ? null : "NOT_DELEGATED", itemId: body.handle ?? null, paneId: context.paneId });
        return vaultAgentResultSchema.parse({ status: allowed ? "APPROVAL_REQUESTED" : "BLOCKED", auditId: audited?.id ?? null });
      }
      const outcome = gate.enabled && deps.fill && context.owner
        ? await deps.fill({ owner: context.owner, cliPaneId: context.paneId, roomId: context.roomId, path, body: body as Record<string, unknown>, traceId: request.requestIdForSpace ?? "" })
          .catch(() => ({ status: "BLOCKED" as const, reason: "FILL_FAILED" }))
        : { status: "BLOCKED" as const, reason: gate.enabled ? "FILL_PATH_UNAVAILABLE" : gate.reason };
      const audited = context.owner && deps.repository
        ? await deps.repository.appendAudit(context.owner, { actor: "AGENT", action, result: outcome.status, reason: outcome.reason, itemId: body.handle ?? null, paneId: context.paneId })
        : null;
      const result: VaultAgentResult = { status: outcome.status, auditId: audited?.id ?? null };
      return vaultAgentResultSchema.parse(result);
    });
  }
}

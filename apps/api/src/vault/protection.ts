import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PostgresVaultRepository } from "@space/db";
import { cliBrowserBridgeTokenHeader, verifyCliBrowserBridgeToken } from "../cli-browser-bridge.js";
import type { SpaceApiConfig } from "../config.js";
import { sendApiError } from "../http-errors.js";

// Vault protected panes (plan clipboard:vEYtT6-bEN0J step 3, ADR-012). One hook fences every generic read of a protected
// pane's browser: agents may only navigate it (no CDP, Playwright, page lists, captures, diagnostics or text), and only
// its owner sees it (live view); nobody records or diagnoses it. The sealed fill is the only way a value reaches it.

export type VaultProtectionStore = Pick<PostgresVaultRepository, "protectPane" | "unprotectPane" | "protectedPaneOwner" | "listProtectedPanes">;

const CACHE_MS = 5_000;

export function createVaultProtection(repository: VaultProtectionStore | null) {
  const cache = new Map<string, { owner: string | null; at: number }>();
  const listeners = new Set<(paneId: string) => void>();
  const ownerOf = async (paneId: string): Promise<string | null> => {
    if (!repository) return null;
    const hit = cache.get(paneId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.owner;
    const owner = await repository.protectedPaneOwner(paneId);
    cache.set(paneId, { owner, at: Date.now() });
    return owner;
  };
  return {
    ownerOf,
    list: (owner: string) => repository ? repository.listProtectedPanes(owner) : Promise.resolve([]),
    async protect(owner: string, paneId: string): Promise<boolean> {
      if (!repository || !await repository.protectPane(owner, paneId)) return false;
      cache.set(paneId, { owner, at: Date.now() });
      // Open automation connections to this browser close now (the CLI CDP proxy listens).
      for (const listener of listeners) listener(paneId);
      return true;
    },
    async unprotect(owner: string, paneId: string): Promise<boolean> {
      const removed = repository ? await repository.unprotectPane(owner, paneId) : false;
      if (removed) cache.delete(paneId);
      return removed;
    },
    onProtected(listener: (paneId: string) => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
export type VaultProtection = ReturnType<typeof createVaultProtection>;

const paneBrowserRoute = /^\/api\/panes\/:id\/browser(\/|$)/;
// The owner keeps the live view and control; recordings, captures and diagnostics stay off (no redaction proof yet).
const ownerRefused = /^\/api\/panes\/:id\/browser\/(captures|diagnostics)(\/|$)/;
const cliBrowserRoutes = new Set(["/api/cli/browser/actions", "/api/cli/browser/commands", "/api/cli/browser/cdp", "/api/cli/browser/cdp/status", "/api/cli/browser/context"]);

export function registerVaultFences(app: FastifyInstance, deps: { protection: VaultProtection; config: Pick<SpaceApiConfig, "internalApiToken"> }): void {
  const refuse = (reply: FastifyReply, code: "VAULT_PROTECTED_PANE_PRIVATE" | "VAULT_PROTECTED_SESSION_REQUIRED", message: string) =>
    sendApiError(reply, code === "VAULT_PROTECTED_PANE_PRIVATE" ? 403 : 409, code, message);
  // preHandler: the session user is known (onRequest auth ran) and bodies are parsed; WebSocket upgrades pass here too.
  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    const route = request.routeOptions.url ?? "";
    if (paneBrowserRoute.test(route)) {
      const paneId = (request.params as { id?: unknown } | undefined)?.id;
      if (typeof paneId !== "string") return;
      const owner = await deps.protection.ownerOf(paneId);
      if (!owner) return;
      if (request.user?.id !== owner || request.user?.automationScope) return refuse(reply, "VAULT_PROTECTED_PANE_PRIVATE", "This browser is private while the Vault protects it.");
      if (ownerRefused.test(route)) return refuse(reply, "VAULT_PROTECTED_PANE_PRIVATE", "Recordings and diagnostics are off while the Vault protects this browser.");
      return;
    }
    if (cliBrowserRoutes.has(route)) {
      const token = request.headers[cliBrowserBridgeTokenHeader] ?? (request.query as { token?: unknown } | undefined)?.token;
      const claims = verifyCliBrowserBridgeToken(deps.config, typeof token === "string" ? token : null);
      if (!claims) return;
      // Every pane the request can reach: the token's own pane and any browser pane it names.
      const body = (request.body ?? {}) as { targetPaneId?: unknown; actions?: Array<{ targetPaneId?: unknown; action?: { type?: unknown } }> };
      const named = [claims.paneId, (request.query as { paneId?: unknown } | undefined)?.paneId, body.targetPaneId, ...(body.actions ?? []).map((entry) => entry?.targetPaneId)]
        .filter((id): id is string => typeof id === "string");
      const protectedPanes = new Set<string>();
      for (const id of new Set(named)) if (await deps.protection.ownerOf(id)) protectedPanes.add(id);
      if (protectedPanes.size === 0) return;
      // Opening the login page is the one generic step an agent takes on a protected browser.
      const onlyNavigate = route === "/api/cli/browser/actions" && Array.isArray(body.actions) && body.actions.length > 0
        && body.actions.every((entry) => !protectedPanes.has(String(entry?.targetPaneId)) || entry?.action?.type === "navigate");
      if (onlyNavigate) return;
      return refuse(reply, "VAULT_PROTECTED_SESSION_REQUIRED", "This browser is protected for the Vault: use the space_vault tools; reading or automating it is off.");
    }
  });
}

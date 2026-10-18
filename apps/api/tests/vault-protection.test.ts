import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { newVaultHandle, type Pane } from "@space/contracts";
import { issueCliBrowserBridgeToken, cliBrowserBridgeTokenHeader } from "../src/cli-browser-bridge.js";
import { getApiConfig } from "../src/config.js";
import { createVaultProtection, registerVaultFences } from "../src/vault/protection.js";
import { registerVaultAgentBridge, type VaultModule } from "../src/vault/wiring.js";

// Plan clipboard:vEYtT6-bEN0J step 3: a protected browser is private and has no generic agent surface; the open-gate fill
// path reaches the Browser Host only with a delegation, an allowed approval mode, the live exact origin and a capability.
const config = getApiConfig({ SPACE_LOG_LEVEL: "silent", SPACE_BROWSER_TOOL_BRIDGE_ENABLED: "true", SPACE_INTERNAL_API_TOKEN: "vault-protection-internal-token" });
const PROTECTED = "pane:protected01";
const OTHER = "pane:otherpane01";

function memoryProtection() {
  const rows = new Map<string, string>();
  return createVaultProtection({
    protectPane: async (owner, paneId) => { if (rows.has(paneId) && rows.get(paneId) !== owner) return false; rows.set(paneId, owner); return true; },
    unprotectPane: async (owner, paneId) => rows.get(paneId) === owner && rows.delete(paneId),
    protectedPaneOwner: async (paneId) => rows.get(paneId) ?? null,
    listProtectedPanes: async (owner) => [...rows].filter(([, value]) => value === owner).map(([key]) => key)
  });
}

async function fencedApp(user: { id: string; automationScope?: string } | null) {
  const app = Fastify();
  const protection = memoryProtection();
  app.addHook("onRequest", async (request) => { (request as { user?: unknown }).user = user ?? undefined; });
  registerVaultFences(app, { protection, config });
  for (const path of ["/api/panes/:id/browser/session", "/api/panes/:id/browser/diagnostics", "/api/panes/:id/browser/captures"]) app.get(path, async () => ({ ok: true }));
  for (const path of ["/api/cli/browser/actions", "/api/cli/browser/commands"]) app.post(path, async () => ({ ok: true }));
  app.get("/api/cli/browser/cdp/status", async () => ({ ok: true }));
  await protection.protect("user:alice", PROTECTED);
  return { app, protection };
}
const agentToken = (paneId: string) => issueCliBrowserBridgeToken(config, { roomId: "room:vaultroom1", paneId, cliSessionId: "cli_session:vault01" })!;

describe("Vault protected browser", () => {
  it("is private to its owner, who keeps the live view but no recordings or diagnostics", async () => {
    for (const [user, expected] of [[{ id: "user:bob" }, 403], [{ id: "user:alice", automationScope: "MEDIA_CAPTURE" }, 403], [null, 403]] as const) {
      const { app } = await fencedApp(user as never);
      expect((await app.inject({ url: `/api/panes/${PROTECTED}/browser/session` })).statusCode).toBe(expected);
      await app.close();
    }
    const { app, protection } = await fencedApp({ id: "user:alice" });
    expect((await app.inject({ url: `/api/panes/${PROTECTED}/browser/session` })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/panes/${PROTECTED}/browser/diagnostics` })).json().error.code).toBe("VAULT_PROTECTED_PANE_PRIVATE");
    expect((await app.inject({ url: `/api/panes/${PROTECTED}/browser/captures` })).statusCode).toBe(403);
    expect((await app.inject({ url: `/api/panes/${OTHER}/browser/diagnostics` })).statusCode).toBe(200);
    // Unprotecting gives everything back (after the cache's few seconds; the same process forgets at once).
    await protection.unprotect("user:alice", PROTECTED);
    expect((await app.inject({ url: `/api/panes/${PROTECTED}/browser/diagnostics` })).statusCode).toBe(200);
    await app.close();
  });

  it("leaves agents only navigation on a protected browser", async () => {
    const { app } = await fencedApp(null);
    const headers = { [cliBrowserBridgeTokenHeader]: agentToken(OTHER), "content-type": "application/json" };
    const action = (type: string, targetPaneId = PROTECTED) => app.inject({ method: "POST", url: "/api/cli/browser/actions", headers,
      payload: { actions: [{ targetPaneId, action: { type, url: "https://login.example" } }] } });
    expect((await action("navigate")).statusCode).toBe(200);
    for (const type of ["click", "type", "extract_text", "diagnostics", "record"]) expect((await action(type)).json().error.code, type).toBe("VAULT_PROTECTED_SESSION_REQUIRED");
    expect((await action("extract_text", OTHER)).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/cli/browser/commands", headers, payload: { targetPaneId: PROTECTED, command: "LIST_PAGES" } })).statusCode).toBe(409);
    expect((await app.inject({ url: `/api/cli/browser/cdp/status?paneId=${PROTECTED}`, headers })).statusCode).toBe(409);
    expect((await app.inject({ url: `/api/cli/browser/cdp/status?paneId=${OTHER}`, headers })).statusCode).toBe(200);
    // A CLI whose own pane is the protected browser gets no CDP either.
    expect((await app.inject({ url: "/api/cli/browser/cdp/status", headers: { [cliBrowserBridgeTokenHeader]: agentToken(PROTECTED) } })).statusCode).toBe(409);
    await app.close();
  });

  it("tells listeners when a pane becomes protected, so open automation connections close", async () => {
    const protection = memoryProtection();
    const closed = vi.fn();
    protection.onProtected(closed);
    expect(await protection.protect("user:alice", PROTECTED)).toBe(true);
    expect(closed).toHaveBeenCalledWith(PROTECTED);
    expect(await protection.protect("user:bob", PROTECTED)).toBe(false);
    expect(await protection.ownerOf(PROTECTED)).toBe("user:alice");
  });
});

describe("Vault open-gate fill path", () => {
  async function bridgeApp(options: { approvalMode?: "ASSIST" | "FULL"; origin?: string; protect?: boolean; approved?: boolean; grants?: string[][];
    signup?: (request: { certificate: unknown }) => { status: "FILLED" | "BLOCKED"; reason: string | null } } = {}) {
    const handle = newVaultHandle("vault_item");
    const protection = memoryProtection();
    if (options.protect !== false) await protection.protect("user:alice", PROTECTED);
    const audits: unknown[] = [];
    const delegation = {
      generation: 1, keyEnvelope: { sealed: "key" }, fillEnvelopes: { [handle]: { PASSWORD: { sealed: "field" } } },
      certificate: { claims: { vaultId: newVaultHandle("vault"), items: [{ handle, origins: ["https://login.example"], fields: ["USERNAME", "PASSWORD"], approvalMode: options.approvalMode ?? "FULL", submit: false }] } }
    };
    const pending: unknown[] = [];
    const grants = (options.grants ?? []).map((sites, index) => ({ id: `vault_grant:grant${index}AAAAAAAAAAAAAAAA`, sites, certificate: { grant: index } }));
    let approvals = options.approved ? 1 : 0;
    const repository = {
      appendAudit: async (_owner: string, event: unknown) => { audits.push(event); return { id: newVaultHandle("vault_audit"), seq: audits.length }; },
      getActiveDelegation: async () => delegation,
      getItem: async () => ({ metadata: { label: "Synthetic", policy: { maxFillsPerHour: 2 } } }),
      getVault: async () => ({ epoch: 4 }),
      consumeApproval: async () => approvals-- > 0,
      getInbox: async () => ({ publicKey: "I".repeat(43), privateKeyEnvelope: {} }),
      addPending: async (_owner: string, entry: unknown) => { pending.push(entry); return true; },
      listSignupGrants: async () => grants
    };
    const issueUse = vi.fn(async () => ({ capability: { claims: "signed by the broker" } }));
    const sealed = { v: 1, alg: "X25519-HKDF-A256GCM", purpose: "TRANSPORT", keyVersion: 1, epk: "E".repeat(43), nonce: "N".repeat(16), ct: "C".repeat(40) };
    const vaultFill = vi.fn(async (_pane: unknown, request: { mode: string; certificate?: unknown }) => {
      if (request.mode === "SIGNUP" && options.signup) { const answer = options.signup(request as { certificate: unknown }); return { ...answer, sealedGenerated: answer.status === "FILLED" ? sealed : null }; }
      return { status: "FILLED" as const, reason: null, sealedGenerated: request.mode === "GENERATE" || request.mode === "SIGNUP" ? sealed : null };
    });
    const vault = { repository, agentFillGate: async () => ({ enabled: true }), protection, broker: { issueUse } } as unknown as VaultModule;
    const app = Fastify();
    registerVaultAgentBridge(app, vault, {
      store: { getRoom: () => ({ ownerUserId: "user:alice" }), listPanes: () => [{ id: PROTECTED, isClosed: false }, { id: OTHER, isClosed: false }] as Pane[] },
      requireBridge: async () => ({ claims: { roomId: "room:vaultroom1", paneId: OTHER } }),
      browser: { vaultTarget: async () => ({ eligible: true, reason: null, targetId: "target-1", frameId: "frame-1", origin: options.origin ?? "https://login.example" }), vaultFill }
    });
    const fill = () => app.inject({ method: "POST", url: "/api/cli/space-vault/fill", payload: { handle, fields: ["PASSWORD"] } });
    const generate = (purpose: "NEW_ACCOUNT" | "CHANGE_PASSWORD") => app.inject({ method: "POST", url: "/api/cli/space-vault/generate-fill",
      payload: purpose === "CHANGE_PASSWORD" ? { purpose, handle, roles: ["NEW_PASSWORD", "CONFIRM_PASSWORD"] } : { purpose, label: "Synthetic new", username: "synthetic@example.com" } });
    return { app, fill, generate, issueUse, vaultFill, audits, pending, sealed, handle, delegation };
  }

  it("fills through the Browser Host with a broker capability for the live target, within the item's limit", async () => {
    const { app, fill, issueUse, vaultFill, audits } = await bridgeApp();
    expect((await fill()).json()).toMatchObject({ status: "FILLED" });
    expect(issueUse).toHaveBeenCalledWith(expect.objectContaining({ paneId: PROTECTED, targetId: "target-1", frameId: "frame-1", origin: "https://login.example", fields: ["PASSWORD"], epoch: 4 }));
    expect((issueUse.mock.calls[0] as unknown[])[0]).toHaveProperty("certificate");
    expect(vaultFill).toHaveBeenCalledWith(expect.objectContaining({ id: PROTECTED }), expect.objectContaining({ mode: "FILL", keyEnvelope: { sealed: "key" } }), expect.any(String));
    expect((await fill()).json().status).toBe("FILLED");
    expect((await fill()).json().status).toBe("RATE_LIMITED");
    expect(audits.at(-1)).toMatchObject({ actor: "AGENT", action: "FILL", result: "RATE_LIMITED", reason: "ITEM_LIMIT" });
    await app.close();
  });

  it("asks the operator under Assist, and refuses another origin or an unprotected browser before the broker is asked", async () => {
    for (const [options, status, reason] of [[{ approvalMode: "ASSIST" }, "BLOCKED", "APPROVAL_REQUIRED"], [{ origin: "https://evil.example" }, "ORIGIN_MISMATCH", "ORIGIN_NOT_DELEGATED"],
      [{ protect: false }, "BLOCKED", "NOT_PROTECTED"]] as const) {
      const { app, fill, issueUse, audits } = await bridgeApp(options);
      expect((await fill()).json().status).toBe(status);
      expect(audits.at(-1)).toMatchObject({ reason });
      expect(issueUse).not.toHaveBeenCalled();
      await app.close();
    }
  });

  it("spends one operator approval per Assist fill", async () => {
    const { app, fill, issueUse } = await bridgeApp({ approvalMode: "ASSIST", approved: true });
    expect((await fill()).json().status).toBe("FILLED");
    expect((await fill()).json().status).toBe("BLOCKED");
    expect(issueUse).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("NEW_ACCOUNT runs only under a sign-up grant for the live site, through the Browser Host, into the inbox as a pending entry", async () => {
    const none = await bridgeApp({ grants: [["https://other.example"]] });
    expect((await none.generate("NEW_ACCOUNT")).json().status).toBe("BLOCKED");
    expect(none.audits.at(-1)).toMatchObject({ action: "GENERATE", result: "BLOCKED", reason: "NO_SIGNUP_GRANT" });
    expect(none.vaultFill).not.toHaveBeenCalled();
    await none.app.close();
    // The first grant is used up today, the second one still has uses.
    const two = await bridgeApp({ grants: [["https://login.example"], ["https://login.example"]],
      signup: (request) => (request.certificate as { grant: number }).grant === 0 ? { status: "BLOCKED", reason: "DAILY_CAP" } : { status: "FILLED", reason: null } });
    expect((await two.generate("NEW_ACCOUNT")).json().status).toBe("FILLED");
    expect(two.vaultFill).toHaveBeenLastCalledWith(expect.objectContaining({ id: PROTECTED }), expect.objectContaining({ mode: "SIGNUP", certificate: { grant: 1 }, origin: "https://login.example",
      targetId: "target-1", frameId: "frame-1", paneId: PROTECTED, inboxPublicKey: "I".repeat(43) }), expect.any(String));
    expect(two.issueUse).not.toHaveBeenCalled();
    expect(two.pending).toEqual([expect.objectContaining({ kind: "NEW_ACCOUNT", label: "Synthetic new", origin: "https://login.example", sealedPassword: two.sealed, paneId: PROTECTED })]);
    await two.app.close();
    const capped = await bridgeApp({ grants: [["https://login.example"]], signup: () => ({ status: "BLOCKED", reason: "DAILY_CAP" }) });
    expect((await capped.generate("NEW_ACCOUNT")).json().status).toBe("RATE_LIMITED");
    expect(capped.pending).toEqual([]);
    await capped.app.close();
  });

  it("generates a changed password into the operator's inbox as a pending entry", async () => {
    const { app, generate, issueUse, vaultFill, pending, sealed, handle } = await bridgeApp();
    expect((await generate("CHANGE_PASSWORD")).json().status).toBe("FILLED");
    expect(issueUse).toHaveBeenCalledWith(expect.objectContaining({ fields: ["PASSWORD"], generate: { roles: ["NEW_PASSWORD", "CONFIRM_PASSWORD"], inboxPublicKey: "I".repeat(43) } }));
    expect(vaultFill).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode: "GENERATE" }), expect.any(String));
    expect(pending).toEqual([expect.objectContaining({ kind: "CHANGE_PASSWORD", handle, origin: "https://login.example", sealedPassword: sealed, paneId: PROTECTED })]);
    await app.close();
  });
});

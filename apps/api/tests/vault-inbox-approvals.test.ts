import { describe, expect, it } from "vitest";
import { generateVaultTransportKey, newVaultHandle, sealToVaultPublicKey, sealVaultEnvelope, vaultRandomBytes } from "@space/contracts";
import { cliBrowserBridgeTokenHeader, issueCliBrowserBridgeToken } from "../src/cli-browser-bridge.js";
import { SENTINEL, enrollment, fixture, itemRecord } from "./support/vault-fakes.js";

// Plan clipboard:vEYtT6-bEN0J steps 3-4: the inbox for generated passwords, the agent list and Assist approvals.
// Synthetic values only.
async function setup(agentFills: boolean) {
  const harness = await fixture({ agentFills });
  const alice = await harness.session({ id: "user:alice", email: "alice@space.local", role: "OPERATOR" });
  const { body } = await enrollment(harness.brokerKey.publicKey, "user:alice");
  await harness.app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: body });
  const room = (await harness.app.inject({ method: "POST", url: "/api/rooms", headers: alice.headers, payload: { name: "Vault inbox", initialPaneCount: 0 } })).json();
  const pane = harness.store.createPane({ roomId: room.id, title: "Claude", mode: "TERMINAL", terminalRuntimeId: "cli:claude" });
  const cli = harness.store.createPaneCliSession({ paneId: pane.id, roomId: room.id, runtimeId: "cli:claude", providerId: "claude", agentId: "claude", status: "RUNNING", purpose: "NORMAL" });
  const token = issueCliBrowserBridgeToken(harness.config, { roomId: room.id, paneId: pane.id, cliSessionId: cli.sessionId })!;
  const agent = (path: string, payload: unknown) => harness.app.inject({ method: "POST", url: `/api/cli/space-vault/${path}`, headers: { [cliBrowserBridgeTokenHeader]: token, "content-type": "application/json" }, payload: payload as never });
  const as = (method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: unknown) => harness.app.inject({ method, url, headers: alice.headers, payload: payload as never });
  // One agent-allowed item, delegated through the route (the fake broker signs exactly what it is asked).
  const base = await itemRecord("user:alice", body.vaultId);
  const item = { ...base, metadata: { ...base.metadata, policy: { ...base.metadata.policy, approvalMode: "ASSIST" as const } } };
  await as("PUT", `/api/space-vault/items/${encodeURIComponent(item.metadata.id)}`, item);
  const handle = item.metadata.id;
  const fillEnvelopes = { [handle]: { PASSWORD: await sealVaultEnvelope(vaultRandomBytes(32), vaultRandomBytes(32), { ownerUserId: "user:alice", vaultId: body.vaultId, keyVersion: 1, purpose: "FILL_FIELD", itemId: handle, field: "PASSWORD", generation: 1 }) } };
  const sealedFillKey = await sealToVaultPublicKey(harness.brokerKey.publicKey, vaultRandomBytes(32), { ownerUserId: "user:alice", vaultId: body.vaultId, keyVersion: 1 });
  await as("POST", "/api/space-vault/delegations", { items: [{ handle, origins: ["https://example.com"], fields: ["PASSWORD"], approvalMode: "ASSIST", submit: false }], fillEnvelopes, sealedFillKey,
    operatorSignature: "s".repeat(86), generation: 1, unlockEpoch: 1, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  return { ...harness, vaultId: body.vaultId, pane, handle, agent, as };
}

describe("Vault agent list and approvals", () => {
  it("answer BLOCKED and record nothing while the custody gate is closed", async () => {
    const vault = await setup(false);
    try {
      expect((await vault.agent("list", {})).json()).toMatchObject({ status: "BLOCKED" });
      expect((await vault.agent("approval", { handle: vault.handle, fields: ["PASSWORD"] })).json()).toMatchObject({ status: "BLOCKED" });
      expect((await vault.as("GET", "/api/space-vault/approvals")).json().approvals).toEqual([]);
    } finally {
      await vault.app.close();
    }
  });

  it("list delegated items as handles only and turn an Assist request into a one-time operator decision once fills are on", async () => {
    const vault = await setup(true);
    try {
      const listed = (await vault.agent("list", {})).json();
      expect(listed).toMatchObject({ status: "LISTED", items: [{ handle: vault.handle, label: "Synthetic", origins: ["https://example.com"], fields: ["PASSWORD"], approvalMode: "ASSIST" }] });
      expect(Object.keys(listed.items[0]).sort()).toEqual(["approvalMode", "fields", "handle", "label", "origins"]);
      expect(JSON.stringify(listed)).not.toContain(SENTINEL);
      expect((await vault.agent("approval", { handle: newVaultHandle("vault_item"), fields: ["PASSWORD"] })).json().status).toBe("BLOCKED");
      expect((await vault.agent("approval", { handle: vault.handle, fields: ["USERNAME"] })).json().status).toBe("BLOCKED");
      expect((await vault.agent("approval", { handle: vault.handle, fields: ["PASSWORD"] })).json().status).toBe("APPROVAL_REQUESTED");
      const [request] = (await vault.as("GET", "/api/space-vault/approvals")).json().approvals;
      expect(request).toMatchObject({ handle: vault.handle, fields: ["PASSWORD"], paneId: vault.pane.id, status: "PENDING" });
      // The operator hears about it: one ATTENTION card naming the item and fields, never a value; deciding resolves it.
      const card = async () => ((await vault.as("GET", "/api/notifications")).json().notifications as Array<{ kind: string; severity: string; status: string; title: string; body: string; dedupeKey: string | null }>)
        .find((entry) => entry.dedupeKey === `vault:approval:${request.id}`);
      expect(await card()).toMatchObject({ kind: "VAULT_APPROVAL", severity: "ATTENTION", title: "An agent asks to use a Vault item", body: expect.stringContaining("Synthetic: password") });
      expect(JSON.stringify(await card())).not.toContain(SENTINEL);
      const before = (await card())!.status;
      expect((await vault.as("POST", `/api/space-vault/approvals/${encodeURIComponent(request.id)}`, { decision: "APPROVE" })).json()).toEqual({ decided: "APPROVE" });
      expect(before).toBe("OPEN");
      expect(["RESOLVED", undefined]).toContain((await card())?.status);
      expect((await vault.as("POST", `/api/space-vault/approvals/${encodeURIComponent(request.id)}`, { decision: "DENY" })).json().error.code).toBe("VAULT_APPROVAL_CLOSED");
      expect((await vault.as("GET", "/api/space-vault/audit?limit=1")).json().entries[0].event).toMatchObject({ actor: "OPERATOR", action: "APPROVAL", reason: "APPROVED" });
    } finally {
      await vault.app.close();
    }
  });
});

describe("Vault inbox for generated passwords", () => {
  it("keeps the inbox key as ciphertext and lets the operator take or drop waiting passwords", async () => {
    const vault = await setup(false);
    try {
      const inbox = await generateVaultTransportKey();
      const privateKeyEnvelope = await sealVaultEnvelope(vaultRandomBytes(32), inbox.privateKey, { ownerUserId: "user:alice", vaultId: vault.vaultId, keyVersion: 1, purpose: "INBOX_KEY" });
      const publicKey = Buffer.from(inbox.publicKey).toString("base64url");
      expect((await vault.as("PUT", "/api/space-vault/inbox", { publicKey, privateKeyEnvelope: { plaintext: SENTINEL } })).statusCode).toBe(422);
      expect((await vault.as("PUT", "/api/space-vault/inbox", { publicKey, privateKeyEnvelope })).json()).toEqual({ inbox: true });
      expect((await vault.as("GET", "/api/space-vault/inbox")).json().inbox).toEqual({ publicKey, privateKeyEnvelope });

      // A fill (phase 3) seals the generated password to the inbox key; here one is stored the same way.
      const sealedPassword = await sealToVaultPublicKey(inbox.publicKey, new TextEncoder().encode(SENTINEL), { ownerUserId: "user:alice", vaultId: vault.vaultId, keyVersion: 1 });
      const pending = { id: newVaultHandle("vault_pending"), kind: "NEW_ACCOUNT" as const, handle: newVaultHandle("vault_item"), label: "Synthetic shop", origin: "https://shop.example",
        sealedUsername: null, sealedPassword, paneId: vault.pane.id, createdAt: new Date().toISOString() };
      await vault.repository.addPending("user:alice", pending);
      const listed = await vault.as("GET", "/api/space-vault/pending");
      expect(listed.json().pending).toEqual([pending]);
      expect(listed.body).not.toContain(SENTINEL);
      expect((await vault.as("DELETE", `/api/space-vault/pending/${encodeURIComponent(newVaultHandle("vault_pending"))}`)).statusCode).toBe(404);
      expect((await vault.as("DELETE", `/api/space-vault/pending/${encodeURIComponent(pending.id)}`)).json()).toEqual({ deleted: true });
      expect((await vault.as("GET", "/api/space-vault/pending")).json().pending).toEqual([]);
    } finally {
      await vault.app.close();
    }
  });
});

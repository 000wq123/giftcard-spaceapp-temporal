import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateVaultPassword, generateVaultSigningKey, newVaultHandle, openVaultEnvelope, sealToVaultPublicKey, sealVaultEnvelope, vaultRandomBytes,
  type VaultItemRecord
} from "@space/contracts";
import { cliBrowserBridgeTokenHeader, issueCliBrowserBridgeToken } from "../src/cli-browser-bridge.js";
import { enrollment, fixture, itemRecord } from "./support/vault-fakes.js";

// Plan clipboard:vEYtT6-bEN0J step 6, the checks that need no Browser Host. Synthetic values only.
const mcpPath = fileURLToPath(new URL("../../../scripts/space-vault-mcp.mjs", import.meta.url));
afterEach(() => { vi.restoreAllMocks(); });

async function enrolledFixture() {
  const harness = await fixture();
  const alice = await harness.session({ id: "user:alice", email: "alice@space.local", role: "OPERATOR" });
  const { body } = await enrollment(harness.brokerKey.publicKey, "user:alice");
  await harness.app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: body });
  const room = (await harness.app.inject({ method: "POST", url: "/api/rooms", headers: alice.headers, payload: { name: "Vault proof", initialPaneCount: 0 } })).json();
  const pane = harness.store.createPane({ roomId: room.id, title: "Claude", mode: "TERMINAL", terminalRuntimeId: "cli:claude" });
  const cli = harness.store.createPaneCliSession({ paneId: pane.id, roomId: room.id, runtimeId: "cli:claude", providerId: "claude", agentId: "claude", status: "RUNNING", purpose: "NORMAL" });
  const token = issueCliBrowserBridgeToken(harness.config, { roomId: room.id, paneId: pane.id, cliSessionId: cli.sessionId })!;
  const agent = (path: string, payload: unknown) => harness.app.inject({ method: "POST", url: `/api/cli/space-vault/${path}`, headers: { [cliBrowserBridgeTokenHeader]: token, "content-type": "application/json" }, payload: payload as never });
  const as = (method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: unknown) => harness.app.inject({ method, url, headers: alice.headers, payload: payload as never });
  return { ...harness, alice, vaultId: body.vaultId, token, agent, as };
}

/** An item whose password is `password`, sealed like the dock does; `dek` lets the test open it again. */
async function passwordItem(vaultId: string, password: string, previous?: { record: VaultItemRecord; dek: Uint8Array }) {
  const id = previous?.record.metadata.id ?? newVaultHandle("vault_item");
  const dek = previous?.dek ?? vaultRandomBytes(32);
  const scope = { ownerUserId: "user:alice", vaultId, keyVersion: 1, itemId: id };
  const base = await itemRecord("user:alice", vaultId, id);
  const record: VaultItemRecord = {
    ...base, metadata: { ...base.metadata, policy: { ...base.metadata.policy, agentUse: true } },
    dekEnvelope: previous?.record.dekEnvelope ?? await sealVaultEnvelope(vaultRandomBytes(32), dek, { ...scope, purpose: "ITEM_KEY" }),
    fields: { PASSWORD: await sealVaultEnvelope(dek, new TextEncoder().encode(password), { ...scope, purpose: "ITEM_FIELD", field: "PASSWORD" }) },
    history: previous ? [...previous.record.history, { fields: previous.record.fields, replacedAt: new Date().toISOString() }] : []
  };
  return { record, dek, open: async (fields = record.fields) => new TextDecoder().decode(await openVaultEnvelope(dek, fields.PASSWORD, { ...scope, purpose: "ITEM_FIELD", field: "PASSWORD" })) };
}

describe("Vault phase 6 checks without the Browser Host", () => {
  it("never puts a generated password in HTTP answers, MCP results, events, notifications or logs", async () => {
    const logged: string[] = [];
    const write = fs.writeSync.bind(fs);
    vi.spyOn(fs, "writeSync").mockImplementation(((fd: number, data: unknown, ...rest: unknown[]) => { logged.push(String(data)); return (write as (...args: unknown[]) => number)(fd, data, ...rest); }) as typeof fs.writeSync);
    const stdout = process.stdout.write.bind(process.stdout);
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown, ...rest: unknown[]) => { logged.push(String(chunk)); return (stdout as (...args: unknown[]) => boolean)(chunk, ...rest); }) as typeof process.stdout.write);
    const harness = await enrolledFixture();
    const generated = [generateVaultPassword(), generateVaultPassword({ maxLength: 16 })];
    const encodings = generated.flatMap((value) => [value, Buffer.from(value).toString("base64"), Buffer.from(value).toString("hex")]);
    const seen: string[] = [];
    const record = async <T extends { body: string }>(response: Promise<T>) => { const answer = await response; seen.push(answer.body); return answer; };
    try {
      const first = await passwordItem(harness.vaultId, generated[0]!);
      const url = `/api/space-vault/items/${encodeURIComponent(first.record.metadata.id)}`;
      await record(harness.as("PUT", url, first.record));
      // A rejected body that carries the value in a plaintext field: the 422 and its log line name only paths.
      expect((await record(harness.as("PUT", url, { ...first.record, fields: { PASSWORD: { plaintext: generated[0] } } }))).statusCode).toBe(422);
      const second = await passwordItem(harness.vaultId, generated[1]!, first);
      await record(harness.as("PUT", url, second.record));
      for (const read of ["/api/space-vault/items", url, "/api/space-vault/audit", "/api/space-vault/state", "/api/notifications"]) await record(harness.as("GET", read));
      for (const [path, payload] of [["generate-fill", { purpose: "CHANGE_PASSWORD", handle: first.record.metadata.id, roles: ["NEW_PASSWORD", "CONFIRM_PASSWORD"] }],
        ["fill", { handle: first.record.metadata.id, fields: ["PASSWORD"] }], ["list", {}], ["audit", {}]] as const) await record(harness.agent(path, payload));

      // The MCP server against the real API: the agent's whole view of a generate-and-fill.
      await harness.app.listen({ port: 0, host: "127.0.0.1" });
      const port = (harness.app.server.address() as { port: number }).port;
      const child = spawn(process.execPath, [mcpPath], { env: { PATH: process.env.PATH, SPACE_VAULT_ENDPOINT: `http://127.0.0.1:${port}/api/cli/space-vault`, SPACE_BROWSER_ACTION_TOKEN: harness.token }, stdio: ["pipe", "pipe", "pipe"] });
      let mcpOut = "";
      child.stdout.on("data", (chunk) => { mcpOut += chunk.toString("utf8"); });
      const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
      send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "space_vault_generate_fill", arguments: { purpose: "NEW_ACCOUNT", label: "Synthetic shop", username: "synthetic@example.com" } } });
      send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "space_vault_list", arguments: {} } });
      await vi.waitFor(() => expect(mcpOut.split("\n").filter(Boolean)).toHaveLength(3), { timeout: 10_000 });
      child.kill();
      expect(JSON.parse(mcpOut.split("\n")[1]!).result.structuredContent).toMatchObject({ status: "BLOCKED", auditId: expect.stringMatching(/^vault_audit:/) });

      const sinks = { http: seen.join("\n"), mcp: mcpOut, events: JSON.stringify(await harness.store.listEvents()), logs: logged.join("") };
      expect(sinks.logs.length).toBeGreaterThan(0);
      for (const [sink, text] of Object.entries(sinks)) {
        for (const value of encodings) expect(text.includes(value), `${sink} holds a generated value`).toBe(false);
      }
      // The server kept only ciphertext, and it still opens to the newest password.
      expect(await second.open()).toBe(generated[1]);
    } finally {
      await harness.app.close();
    }
  });

  it("refuses an agent write while the Vault is locked and leaves the items as they were", async () => {
    const harness = await enrolledFixture();
    try {
      expect((await harness.as("POST", "/api/space-vault/lock", {})).json().epoch).toBe(2);
      const before = (await harness.as("GET", "/api/space-vault/items")).json().items;
      const answer = await harness.agent("generate-fill", { purpose: "NEW_ACCOUNT", label: "Created while locked", username: "synthetic@example.com" });
      expect(answer.json()).toMatchObject({ status: "BLOCKED" });
      expect((await harness.as("GET", "/api/space-vault/items")).json().items).toEqual(before);
      expect((await harness.as("GET", "/api/space-vault/audit?limit=1")).json().entries[0].event).toMatchObject({ actor: "AGENT", action: "GENERATE", result: "BLOCKED" });
    } finally {
      await harness.app.close();
    }
  });

  it("moves a PENDING item to ACTIVE only on the operator's Keep, and rolls a changed password back", async () => {
    const harness = await enrolledFixture();
    try {
      const first = await passwordItem(harness.vaultId, "SYNTHETIC-old-password");
      const changed = await passwordItem(harness.vaultId, "SYNTHETIC-new-password", first);
      const url = `/api/space-vault/items/${encodeURIComponent(first.record.metadata.id)}`;
      await harness.as("PUT", url, { ...changed.record, metadata: { ...changed.record.metadata, status: "PENDING" } });
      expect((await harness.as("GET", "/api/space-vault/items")).json().items[0].status).toBe("PENDING");
      // Agents have no route that changes an item's status.
      expect((await harness.agent("approval", { handle: first.record.metadata.id, fields: ["PASSWORD"] })).json().status).toBe("BLOCKED");
      expect((await harness.as("GET", "/api/space-vault/items")).json().items[0].status).toBe("PENDING");
      // Rollback: the previous fields come back from the history, under the same item key.
      const stored: VaultItemRecord = (await harness.as("GET", url)).json().item;
      expect(stored.history).toHaveLength(1);
      expect(await changed.open(stored.history[0]!.fields)).toBe("SYNTHETIC-old-password");
      const restored = { ...stored, metadata: { ...stored.metadata, status: "ACTIVE" }, fields: stored.history[0]!.fields, history: [] };
      await harness.as("PUT", url, restored);
      const after: VaultItemRecord = (await harness.as("GET", url)).json().item;
      expect(after.metadata.status).toBe("ACTIVE");
      expect(after.history).toEqual([]);
      expect(await changed.open(after.fields)).toBe("SYNTHETIC-old-password");
    } finally {
      await harness.app.close();
    }
  });

  it("refuses a delegation whose certificate is forged, widened or for items agents may not use", async () => {
    const forger = await generateVaultSigningKey();
    const harness = await enrolledFixture();
    try {
      const allowed = await passwordItem(harness.vaultId, "SYNTHETIC-delegated");
      await harness.as("PUT", `/api/space-vault/items/${encodeURIComponent(allowed.record.metadata.id)}`, allowed.record);
      const handle = allowed.record.metadata.id;
      const fillEnvelopes = { [handle]: { PASSWORD: await sealVaultEnvelope(vaultRandomBytes(32), vaultRandomBytes(32), { ownerUserId: "user:alice", vaultId: harness.vaultId, keyVersion: 1, purpose: "FILL_FIELD", itemId: handle, field: "PASSWORD", generation: 1 }) } };
      const sealedFillKey = await sealToVaultPublicKey(harness.brokerKey.publicKey, vaultRandomBytes(32), { ownerUserId: "user:alice", vaultId: harness.vaultId, keyVersion: 1 });
      const request = { items: [{ handle, origins: ["https://example.com"], fields: ["PASSWORD"], approvalMode: "ASSIST", submit: false }], fillEnvelopes, sealedFillKey, operatorSignature: "s".repeat(86),
        generation: 1, unlockEpoch: 1, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
      const delegate = () => harness.as("POST", "/api/space-vault/delegations", request);
      const reasons = async () => (await harness.as("GET", "/api/space-vault/audit?limit=50")).json().entries
        .filter((entry: { event: { action: string } }) => entry.event.action === "DELEGATE").map((entry: { event: { result: string; reason: string | null } }) => `${entry.event.result}:${entry.event.reason}`);
      // A certificate signed by anyone but the broker.
      harness.tamper.signWith = forger.privateKey;
      const forged = await delegate();
      expect(forged.statusCode).toBe(409);
      expect(forged.json().error.code).toBe("VAULT_DELEGATION_REFUSED");
      harness.tamper.signWith = undefined;

      // A real broker signature over wider claims than asked (submit, another origin) is refused too.
      harness.tamper.widen = (claims) => ({ ...claims, items: claims.items.map((item: { origins: string[] }) => ({ ...item, submit: true, origins: [...item.origins, "https://evil.example"] })) });
      expect((await delegate()).json().error.code).toBe("VAULT_DELEGATION_REFUSED");
      harness.tamper.widen = undefined;

      // An item agents may not use.
      const privateItem = await passwordItem(harness.vaultId, "SYNTHETIC-private");
      const privateRecord = { ...privateItem.record, metadata: { ...privateItem.record.metadata, policy: { ...privateItem.record.metadata.policy, agentUse: false } } };
      await harness.as("PUT", `/api/space-vault/items/${encodeURIComponent(privateRecord.metadata.id)}`, privateRecord);
      const notDelegable = await harness.as("POST", "/api/space-vault/delegations", { ...request, items: [{ ...request.items[0], handle: privateRecord.metadata.id }],
        fillEnvelopes: { [privateRecord.metadata.id]: fillEnvelopes[handle] } });
      expect(notDelegable.json().error.code).toBe("VAULT_DELEGATION_REFUSED");
      expect((await harness.as("GET", "/api/space-vault/state")).json().vault.delegationGeneration).toBe(0);

      // Review 2026-10-17 H1/M2: other origins than the item's, or a stale generation, epoch or expiry, never reach the broker.
      const refused = async (patch: Record<string, unknown>) => (await harness.as("POST", "/api/space-vault/delegations", { ...request, ...patch })).json().error.code;
      expect(await refused({ items: [{ ...request.items[0], origins: ["https://phish.example"] }] })).toBe("VAULT_DELEGATION_REFUSED");
      expect(await refused({ generation: 2 })).toBe("VAULT_DELEGATION_REFUSED");
      expect(await refused({ unlockEpoch: 2 })).toBe("VAULT_DELEGATION_REFUSED");
      expect(await refused({ expiresAt: new Date(Date.now() + 31 * 24 * 3_600_000).toISOString() })).toBe("VAULT_DELEGATION_REFUSED");

      // The broker's own signature over exactly the request is stored as generation 1.
      expect((await delegate()).json()).toEqual({ generation: 1 });
      expect(await reasons()).toEqual(["OK:null", "BLOCKED:DELEGATION_STALE", "BLOCKED:DELEGATION_STALE", "BLOCKED:DELEGATION_STALE", "BLOCKED:ORIGINS_MISMATCH",
        "BLOCKED:ITEM_NOT_DELEGABLE", "BLOCKED:CERTIFICATE_MISMATCH", "BLOCKED:CERTIFICATE_INVALID"]);
    } finally {
      await harness.app.close();
    }
  });
});

import { describe, expect, it } from "vitest";
import { generateVaultTransportKey, newVaultHandle, sealVaultEnvelope, vaultBase64url, vaultRandomBytes } from "@space/contracts";
import { cliBrowserBridgeTokenHeader, issueCliBrowserBridgeToken } from "../src/cli-browser-bridge.js";
import { VaultBrokerUnavailableError } from "../src/vault/broker-client.js";
import { SENTINEL, enrollment, fakeRepository, fixture, itemRecord } from "./support/vault-fakes.js";

describe("Vault operator routes", () => {
  it("needs a session and CSRF, enrolls through the broker and unlocks once per challenge", async () => {
    const { app, brokerKey, brokerCalls, session } = await fixture();
    try {
      expect((await app.inject({ method: "GET", url: "/api/space-vault/state" })).statusCode).toBe(401);
      const alice = await session({ id: "user:alice", email: "alice@space.local", role: "OPERATOR" });
      expect((await app.inject({ method: "GET", url: "/api/space-vault/state", headers: alice.headers })).json()).toMatchObject({ ownerUserId: "user:alice", enrolled: false, brokerAvailable: true, agentFill: "FLAG_OFF", vault: null });
      const { body, signing } = await enrollment(brokerKey.publicKey, "user:alice");
      expect((await app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: { cookie: alice.cookie }, payload: body })).json().error.code).toBe("CSRF_INVALID");
      // The server share travels only sealed: a plaintext share field is refused before the broker is asked.
      expect((await app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: { ...body, serverShare: SENTINEL } })).statusCode).toBe(422);
      const enrolled = await app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: body });
      expect(enrolled.statusCode).toBe(201);
      expect(brokerCalls).toEqual(["seal:user:alice"]);
      expect((await app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: body })).json().error.code).toBe("VAULT_EXISTS");

      const challenge = (await app.inject({ method: "POST", url: "/api/space-vault/unlock/challenge", headers: alice.headers, payload: {} })).json();
      const reply = await generateVaultTransportKey();
      const unlockBody = { challenge: challenge.challenge, replyPublicKey: vaultBase64url.encode(reply.publicKey), signature: "s".repeat(86) };
      const unlocked = (await app.inject({ method: "POST", url: "/api/space-vault/unlock", headers: alice.headers, payload: unlockBody })).json();
      expect(unlocked.sealedServerShare).toMatchObject({ alg: "X25519-HKDF-A256GCM", purpose: "TRANSPORT" });
      expect(challenge).toMatchObject({ vaultId: body.vaultId, passwordEnvelope: body.passwordEnvelope, kdf: body.kdf, unlockKeyVersion: 1, epoch: 1 });
      expect(brokerCalls).toEqual(["seal:user:alice", "unlock:1"]);
      // A challenge works once; a reused one is refused and audited without asking the broker.
      expect((await app.inject({ method: "POST", url: "/api/space-vault/unlock", headers: alice.headers, payload: unlockBody })).json().error.code).toBe("VAULT_UNLOCK_REFUSED");
      expect(brokerCalls).toHaveLength(2);
      const audit = (await app.inject({ method: "GET", url: "/api/space-vault/audit?limit=10", headers: alice.headers })).json();
      expect(audit.entries.map((entry: { event: { action: string; result: string; reason: string | null } }) => `${entry.event.action}:${entry.event.result}:${entry.event.reason}`))
        .toEqual(["UNLOCK:BLOCKED:CHALLENGE_INVALID", "UNLOCK:OK:null", "ENROLL:OK:null"]);
      // A lock starts a new epoch, so an unused older challenge dies with it.
      const stale = (await app.inject({ method: "POST", url: "/api/space-vault/unlock/challenge", headers: alice.headers, payload: {} })).json();
      expect((await app.inject({ method: "POST", url: "/api/space-vault/lock", headers: alice.headers, payload: {} })).json().epoch).toBe(2);
      expect((await app.inject({ method: "POST", url: "/api/space-vault/unlock", headers: alice.headers, payload: { ...unlockBody, challenge: stale.challenge } })).statusCode).toBe(409);
      void signing;
    } finally {
      await app.close();
    }
  });

  it("fails closed without the broker", async () => {
    const unavailable = () => Promise.reject(new VaultBrokerUnavailableError());
    const { app, session } = await fixture({ broker: { transportKey: unavailable, sealServerShare: unavailable, unlock: unavailable } });
    try {
      const alice = await session({ id: "user:alice", email: "alice@space.local", role: "OPERATOR" });
      const { body } = await enrollment((await generateVaultTransportKey()).publicKey, "user:alice");
      const refused = await app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: body });
      expect(refused.statusCode).toBe(503);
      expect(refused.json().error.code).toBe("VAULT_BROKER_UNAVAILABLE");
      expect((await app.inject({ method: "GET", url: "/api/space-vault/state", headers: alice.headers })).json()).toMatchObject({ enrolled: false, brokerAvailable: false });
    } finally {
      await app.close();
    }
  });

  it("keeps items ciphertext-only and per owner, and revokes agent access without a password", async () => {
    const { app, brokerKey, session } = await fixture();
    try {
      const alice = await session({ id: "user:alice", email: "alice@space.local", role: "OPERATOR" });
      const bob = await session({ id: "user:bob", email: "bob@space.local", role: "USER" });
      const { body } = await enrollment(brokerKey.publicKey, "user:alice");
      await app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: body });
      const item = await itemRecord("user:alice", body.vaultId);
      const url = `/api/space-vault/items/${encodeURIComponent(item.metadata.id)}`;
      expect((await app.inject({ method: "PUT", url, headers: alice.headers, payload: { ...item, fields: { PASSWORD: { plaintext: SENTINEL } } } })).statusCode).toBe(422);
      expect((await app.inject({ method: "PUT", url: `/api/space-vault/items/${encodeURIComponent(newVaultHandle("vault_item"))}`, headers: alice.headers, payload: item })).json().error.code).toBe("VAULT_ITEM_MISMATCH");
      expect((await app.inject({ method: "PUT", url, headers: alice.headers, payload: item })).statusCode).toBe(200);
      const listed = await app.inject({ method: "GET", url: "/api/space-vault/items", headers: alice.headers });
      expect(listed.json().items).toEqual([item.metadata]);
      expect(listed.body).not.toContain(SENTINEL);
      expect((await app.inject({ method: "GET", url, headers: bob.headers })).json().error.code).toBe("VAULT_ITEM_NOT_FOUND");
      expect((await app.inject({ method: "DELETE", url, headers: bob.headers })).statusCode).toBe(404);
      expect((await app.inject({ method: "POST", url: "/api/space-vault/revoke", headers: alice.headers, payload: {} })).json()).toEqual({ generation: 1, epoch: 2 });
      expect((await app.inject({ method: "POST", url: "/api/space-vault/revoke", headers: bob.headers, payload: {} })).json().error.code).toBe("VAULT_NOT_ENROLLED");
    } finally {
      await app.close();
    }
  });
});

describe("Vault agent routes", () => {
  it("answer only BLOCKED with an audit id while the custody gate is closed, and refuse anything but handles", async () => {
    const { app, store, config, brokerKey, session } = await fixture();
    try {
      const alice = await session({ id: "user:alice", email: "alice@space.local", role: "OPERATOR" });
      const room = (await app.inject({ method: "POST", url: "/api/rooms", headers: alice.headers, payload: { name: "Vault", initialPaneCount: 0 } })).json();
      const pane = store.createPane({ roomId: room.id, title: "Claude", mode: "TERMINAL", terminalRuntimeId: "cli:claude" });
      const cliSession = store.createPaneCliSession({ paneId: pane.id, roomId: room.id, runtimeId: "cli:claude", providerId: "claude", agentId: "claude", status: "RUNNING", purpose: "NORMAL" });
      const agent = { [cliBrowserBridgeTokenHeader]: issueCliBrowserBridgeToken(config, { roomId: room.id, paneId: pane.id, cliSessionId: cliSession.sessionId })!, "content-type": "application/json" };
      const call = (path: string, payload: unknown, headers: Record<string, string> = agent) => app.inject({ method: "POST", url: `/api/cli/space-vault/${path}`, headers, payload: payload as never });

      expect((await call("fill", { handle: newVaultHandle("vault_item"), fields: ["PASSWORD"] }, { "content-type": "application/json" })).statusCode).toBe(401);
      // No vault yet: still the fixed result, with nothing to audit in.
      expect((await call("list", {})).json()).toEqual({ status: "BLOCKED", auditId: null });
      const { body } = await enrollment(brokerKey.publicKey, (await store.getRoom(room.id)).ownerUserId!);
      await app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: body });
      const handle = newVaultHandle("vault_item");
      for (const [path, payload] of [["status", {}], ["list", {}], ["fill", { handle, fields: ["USERNAME", "PASSWORD"] }], ["totp-fill", { handle }],
        ["generate-fill", { purpose: "NEW_ACCOUNT", label: "Synthetic shop", username: "synthetic@example.com", roles: ["NEW_PASSWORD", "CONFIRM_PASSWORD"] }],
        ["generate-fill", { purpose: "CHANGE_PASSWORD", handle }], ["approval", { handle, fields: ["PASSWORD"] }], ["audit", {}]] as const) {
        const answer = await call(path, payload);
        expect(answer.statusCode, path).toBe(200);
        expect(Object.keys(answer.json()).sort(), path).toEqual(["auditId", "status"]);
        expect(answer.json(), path).toMatchObject({ status: "BLOCKED", auditId: expect.stringMatching(/^vault_audit:/) });
      }
      // Selectors, URLs, values and unknown keys never pass the schema.
      for (const [path, payload] of [["fill", { handle, fields: ["PASSWORD"], selector: "#password" }], ["fill", { handle, fields: ["PASSWORD"], origin: "https://evil.example" }],
        ["generate-fill", { purpose: "NEW_ACCOUNT" }], ["generate-fill", { purpose: "CHANGE_PASSWORD" }], ["fill", { handle: "vault_item:../x", fields: ["PASSWORD"] }],
        ["list", { paneId: "pane:other" }]] as const) {
        expect((await call(path, payload)).statusCode, JSON.stringify(payload)).toBe(422);
      }
      const audit = (await app.inject({ method: "GET", url: "/api/space-vault/audit?limit=3", headers: alice.headers })).json();
      expect(audit.entries[0].event).toMatchObject({ actor: "AGENT", result: "BLOCKED", reason: "FLAG_OFF", paneId: pane.id });
    } finally {
      await app.close();
    }
  });
});

describe("Vault protected panes", () => {
  it("lets only the pane's owner protect it, and then only that owner sees its browser", async () => {
    const { app, store, brokerKey, session } = await fixture();
    try {
      const alice = await session({ id: "user:alice", email: "alice@space.local", role: "OPERATOR" });
      const { body } = await enrollment(brokerKey.publicKey, "user:alice");
      await app.inject({ method: "POST", url: "/api/space-vault/enroll", headers: alice.headers, payload: body });
      const room = (await app.inject({ method: "POST", url: "/api/rooms", headers: alice.headers, payload: { name: "Protected", initialPaneCount: 0 } })).json();
      const pane = store.createPane({ roomId: room.id, title: "Browser", mode: "BROWSER" });
      const url = `/api/space-vault/protected-panes/${encodeURIComponent(pane.id)}`;
      expect((await app.inject({ method: "PUT", url: "/api/space-vault/protected-panes/pane:notmine0001", headers: alice.headers })).json().error.code).toBe("VAULT_PANE_NOT_FOUND");
      expect((await app.inject({ method: "PUT", url, headers: alice.headers })).json()).toEqual({ protected: true });
      expect((await app.inject({ url: "/api/space-vault/protected-panes", headers: alice.headers })).json()).toEqual({ paneIds: [pane.id] });
      expect((await app.inject({ url: `/api/panes/${encodeURIComponent(pane.id)}/browser/diagnostics`, headers: alice.headers })).json().error.code).toBe("VAULT_PROTECTED_PANE_PRIVATE");
      expect((await app.inject({ method: "DELETE", url, headers: alice.headers })).json()).toEqual({ protected: false });
      expect((await app.inject({ url: `/api/panes/${encodeURIComponent(pane.id)}/browser/diagnostics`, headers: alice.headers })).json().error?.code).not.toBe("VAULT_PROTECTED_PANE_PRIVATE");
    } finally {
      await app.close();
    }
  });
});

describe("Nous's handle-only Vault tool", () => {
  it("answers only {status, auditId}: BLOCKED with the gate's reason while it fails, and BLOCKED while no fill path exists", async () => {
    const { createNousTools } = await import("../src/nous/tools.js");
    const repository = fakeRepository();
    const { body } = await enrollment((await generateVaultTransportKey()).publicKey, "user:alice");
    const { sealedServerShare: _sealed, ...rest } = body;
    await repository.enroll("user:alice", { ...rest, serverShareEnvelope: await sealVaultEnvelope(vaultRandomBytes(32), vaultRandomBytes(32), { ownerUserId: "user:alice", vaultId: body.vaultId, keyVersion: 1, purpose: "SERVER_SHARE" }) });
    const room = { id: "room:a", name: "Work" };
    const pane = { id: "pane:a", roomId: room.id, paneName: "Andy", title: "Andy", isClosed: false };
    let gate: { enabled: true } | { enabled: false; reason: "CUSTODY_NOT_PROVEN" } = { enabled: false, reason: "CUSTODY_NOT_PROVEN" };
    const tools = createNousTools({ rooms: async (owner: string) => owner === "user:alice" ? [room] : [], listPanes: async () => [pane],
      vault: { repository, agentFillGate: async () => gate } } as never);
    const ctx = { owner: "user:alice", turnId: "t", callId: "c", traceId: "trace" };
    const handle = newVaultHandle("vault_item");
    const call = (owner = ctx.owner) => tools.execute("space_vault_fill", { room: "Work", pane: "Andy", handle, fields: ["PASSWORD"] }, { ...ctx, owner });
    const closed = await call();
    expect(closed).toMatchObject({ ok: false, refused: true });
    expect(Object.keys(JSON.parse(closed.result)).sort()).toEqual(["auditId", "status"]);
    expect(JSON.parse(closed.result).status).toBe("BLOCKED");
    gate = { enabled: true };
    expect(JSON.parse((await call()).result).status).toBe("BLOCKED");
    const audit = await repository.listAudit("user:alice", { limit: 10 });
    expect(audit.map((entry) => entry.event.reason)).toEqual(expect.arrayContaining(["CUSTODY_NOT_PROVEN", "FILL_PATH_UNAVAILABLE"]));
    expect(audit[0]!.event).toMatchObject({ actor: "AGENT", action: "FILL", itemId: handle, paneId: pane.id });
    // Another owner reaches neither the room nor the audit; a value, URL or selector is not an argument.
    expect((await call("user:bob")).ok).toBe(false);
    expect((await tools.execute("space_vault_fill", { room: "Work", pane: "Andy", handle, fields: ["PASSWORD"], url: "https://example.com" }, ctx)).result).toContain("Invalid arguments");
  });
});

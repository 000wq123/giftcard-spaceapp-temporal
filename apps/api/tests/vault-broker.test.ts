import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  generateVaultSigningKey, generateVaultTransportKey, newVaultHandle, openWithVaultPrivateKey, sealToVaultPublicKey,
  sealVaultEnvelope, signVaultMessage, splitVaultRootKey, vaultBase64url, vaultDelegationCertificateSchema, vaultDelegationOperatorMessage,
  vaultDigest, vaultRandomBytes, vaultUnlockChallengeMessage, verifyVaultCertificate, vaultSignupGrantOperatorMessage, vaultSignupGrantCertificateSchema
} from "@space/contracts";
import { createVaultBroker, createVaultBrokerHttpServer, vaultSocketPosture, type VaultBrokerCore } from "../src/vault/broker-server.js";
import { VaultBrokerRefusedError, createSocketVaultBroker } from "../src/vault/broker-client.js";

// The broker (ADR-012) over its real HTTP-on-unix-socket protocol, driven by the API's own client where it has the call.
// Synthetic ARK and secrets only.
const SENTINEL = "SYNTHETIC-broker-sentinel-password";
const b64 = vaultBase64url;
const roots: string[] = [];
const servers: Array<{ close(): void }> = [];
afterEach(async () => {
  for (const server of servers.splice(0)) server.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function start(ark = vaultRandomBytes(32), stateDir?: string, custody: () => Promise<{ enabled: true } | { enabled: false; reason: "CUSTODY_NOT_PROVEN" }> = async () => ({ enabled: true }), now?: () => Date) {
  const root = await mkdtemp(join(tmpdir(), "space-vault-broker-"));
  roots.push(root);
  const state = stateDir ?? join(root, "state");
  const core = await createVaultBroker({ ark, stateDir: state, custody, ...(now ? { now } : {}) });
  const socketPath = join(root, "broker.sock");
  const server = createVaultBrokerHttpServer(core);
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  servers.push(server);
  return { ark, state, core, client: createSocketVaultBroker(socketPath) };
}

// Fills go over the Browser Host's own socket (H2 Option A); everything else over the API's.
const post = async (core: VaultBrokerCore, path: string, body: unknown, channel: "api" | "host" = path === "/v1/fill" ? "host" : "api") => core.handle("POST", path, body, channel);
const owner = "user:alice";

async function enrolled(custody?: Parameters<typeof start>[2], now?: () => Date) {
  const broker = await start(undefined, undefined, custody, now);
  const vaultId = newVaultHandle("vault");
  const scope = { ownerUserId: owner, vaultId, keyVersion: 1 };
  const { serverShare } = splitVaultRootKey(vaultRandomBytes(32));
  const unlock = await generateVaultSigningKey();
  const unlockPublicKey = b64.encode(unlock.publicKey);
  const transport = await broker.client.transportKey();
  const serverShareEnvelope = await broker.client.sealServerShare({ ...scope, sealedServerShare: await sealToVaultPublicKey(b64.decode(transport.publicKey), serverShare, scope), unlockPublicKey });
  return { ...broker, vaultId, scope, serverShare, unlock, unlockPublicKey, serverShareEnvelope, transport };
}

async function delegation(vault: Awaited<ReturnType<typeof enrolled>>, generation = 1) {
  const handle = newVaultHandle("vault_item");
  const fillKey = vaultRandomBytes(32);
  const field = (role: "USERNAME" | "PASSWORD", text: string) => sealVaultEnvelope(fillKey, new TextEncoder().encode(text), { ...vault.scope, purpose: "FILL_FIELD", itemId: handle, field: role, generation });
  const fillEnvelopes = { [handle]: { USERNAME: await field("USERNAME", "synthetic@example.com"), PASSWORD: await field("PASSWORD", SENTINEL) } };
  const items = [{ handle, origins: ["https://login.example"], fields: ["USERNAME", "PASSWORD"] as Array<"USERNAME" | "PASSWORD">, approvalMode: "FULL", submit: false }];
  const envelopeDigest = await vaultDigest(fillEnvelopes);
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  const operatorSignature = await signVaultMessage(vault.unlock.privateKey, vaultDelegationOperatorMessage({ ownerUserId: owner, vaultId: vault.vaultId, envelopeDigest, generation, unlockEpoch: 1, expiresAt, items }));
  const request = {
    ownerUserId: owner, vaultId: vault.vaultId, generation, unlockEpoch: 1, envelopeDigest, expiresAt, items,
    sealedFillKey: await sealToVaultPublicKey(b64.decode(vault.transport.publicKey), fillKey, vault.scope), operatorSignature,
    unlockPublicKey: vault.unlockPublicKey, serverShareEnvelope: vault.serverShareEnvelope
  };
  return { handle, fillEnvelopes, request };
}

const useRequest = (vault: Awaited<ReturnType<typeof enrolled>>, certificate: unknown, handle: string, overrides: Record<string, unknown> = {}) => ({
  ownerUserId: owner, vaultId: vault.vaultId, certificate, epoch: 1, handle, fields: ["PASSWORD"], submit: false, paneId: "pane:vaultpane1",
  targetId: "target-1", pageId: "target-1", frameId: "frame-1", origin: "https://login.example", ...overrides
});

describe("space-vault-broker", () => {
  it("returns the server share only to the browser that signed the challenge with the enrolled unlock key", async () => {
    const vault = await enrolled();
    const reply = await generateVaultTransportKey();
    const message = { ownerUserId: owner, vaultId: vault.vaultId, epoch: 2, challenge: b64.encode(vaultRandomBytes(32)), replyPublicKey: b64.encode(reply.publicKey) };
    const signature = await signVaultMessage(vault.unlock.privateKey, vaultUnlockChallengeMessage(message));
    const sealed = await vault.client.unlock({ ...message, signature, unlockPublicKey: vault.unlockPublicKey, serverShareEnvelope: vault.serverShareEnvelope });
    expect(await openWithVaultPrivateKey(reply.privateKey, reply.publicKey, sealed, vault.scope)).toEqual(vault.serverShare);
    // Another epoch than the one signed, or a swapped unlock key with its own valid signature: refused.
    await expect(vault.client.unlock({ ...message, epoch: 3, signature, unlockPublicKey: vault.unlockPublicKey, serverShareEnvelope: vault.serverShareEnvelope })).rejects.toBeInstanceOf(VaultBrokerRefusedError);
    const attacker = await generateVaultSigningKey();
    const forged = await signVaultMessage(attacker.privateKey, vaultUnlockChallengeMessage(message));
    await expect(vault.client.unlock({ ...message, signature: forged, unlockPublicKey: b64.encode(attacker.publicKey), serverShareEnvelope: vault.serverShareEnvelope })).rejects.toBeInstanceOf(VaultBrokerRefusedError);
  });

  it("signs a delegation only with the operator's unlock signature and wraps the fill key per generation", async () => {
    const vault = await enrolled();
    const { request } = await delegation(vault);
    const forged = await signVaultMessage((await generateVaultSigningKey()).privateKey, new TextEncoder().encode("anything"));
    await expect(vault.client.delegate({ ...request, operatorSignature: forged })).rejects.toBeInstanceOf(VaultBrokerRefusedError);
    // A signature over other items (here: submit added) does not cover this request.
    await expect(vault.client.delegate({ ...request, items: [{ ...request.items[0]!, submit: true }] })).rejects.toBeInstanceOf(VaultBrokerRefusedError);
    const signed = await vault.client.delegate(request);
    const key = await vault.client.delegationKey();
    expect((await verifyVaultCertificate(b64.decode(key.publicKey), signed.certificate, vaultDelegationCertificateSchema)).items).toEqual(request.items);
    expect(signed.keyEnvelope).toMatchObject({ purpose: "FILL_KEY" });
  });

  it("issues one-time use capabilities and releases only the named fields, sealed to the host's key", async () => {
    const vault = await enrolled();
    const { handle, fillEnvelopes, request } = await delegation(vault);
    const { certificate, keyEnvelope } = await vault.client.delegate(request);
    expect((await post(vault.core, "/v1/use", useRequest(vault, certificate, handle, { origin: "https://evil.example" }))).body).toEqual({ error: "NOT_DELEGATED" });
    expect((await post(vault.core, "/v1/use", useRequest(vault, certificate, handle, { submit: true }))).body).toEqual({ error: "NOT_DELEGATED" });
    const host = await generateVaultTransportKey();
    const use = await post(vault.core, "/v1/use", useRequest(vault, certificate, handle));
    expect(use.status).toBe(200);
    const fill = { capability: (use.body as { capability: unknown }).capability, keyEnvelope, fieldEnvelopes: fillEnvelopes[handle], replyPublicKey: b64.encode(host.publicKey) };
    const answer = await post(vault.core, "/v1/fill", fill);
    expect(JSON.stringify(answer.body)).not.toContain(SENTINEL);
    const opened = JSON.parse(new TextDecoder().decode(await openWithVaultPrivateKey(host.privateKey, host.publicKey, (answer.body as { sealedFields: unknown }).sealedFields, vault.scope)));
    expect(opened).toEqual({ PASSWORD: SENTINEL });
    expect((await post(vault.core, "/v1/fill", fill)).body).toEqual({ error: "CAPABILITY_USED" });
  });

  it("keeps its keys and generation floor across a restart, but no outstanding capability", async () => {
    const vault = await enrolled();
    const { handle, fillEnvelopes, request } = await delegation(vault);
    const { certificate, keyEnvelope } = await vault.client.delegate(request);
    const host = await generateVaultTransportKey();
    const use = await post(vault.core, "/v1/use", useRequest(vault, certificate, handle));
    const restarted = await start(vault.ark, vault.state);
    expect(restarted.core.signingPublicKey).toEqual(vault.core.signingPublicKey);
    expect(restarted.core.transportPublicKey).toEqual(vault.core.transportPublicKey);
    expect((await post(restarted.core, "/v1/fill", { capability: (use.body as { capability: unknown }).capability, keyEnvelope, fieldEnvelopes: fillEnvelopes[handle], replyPublicKey: b64.encode(host.publicKey) })).body).toEqual({ error: "CAPABILITY_USED" });
    // Revoking raises the floor: the old certificate, and a delegation reusing its generation, stop working, also after a restart.
    expect(await restarted.client.revoke({ ownerUserId: owner, vaultId: vault.vaultId, generation: 2 })).toEqual({ generation: 2 });
    const again = await start(vault.ark, vault.state);
    expect((await post(again.core, "/v1/use", useRequest(vault, certificate, handle))).body).toEqual({ error: "GENERATION_RETIRED" });
    await expect(again.client.delegate(request)).rejects.toBeInstanceOf(VaultBrokerRefusedError);
    const next = await delegation(vault, 3);
    expect((await again.client.delegate(next.request)).certificate).toBeTruthy();
  });

  it("audits ids and results in a hash chain, never a value or the ARK", async () => {
    const vault = await enrolled();
    const { handle, fillEnvelopes, request } = await delegation(vault);
    const { certificate, keyEnvelope } = await vault.client.delegate(request);
    const host = await generateVaultTransportKey();
    const use = await post(vault.core, "/v1/use", useRequest(vault, certificate, handle));
    await post(vault.core, "/v1/fill", { capability: (use.body as { capability: unknown }).capability, keyEnvelope, fieldEnvelopes: fillEnvelopes[handle], replyPublicKey: b64.encode(host.publicKey) });
    await post(vault.core, "/v1/unlock", { nonsense: true });
    const lines = (await readFile(join(vault.state, "audit.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { op: string; result: string; prev: string; hash: string });
    expect(lines.map((line) => `${line.op}:${line.result}`)).toEqual(["server-share:OK", "delegate:OK", "use:OK", "fill:OK", "unlock:BAD_REQUEST"]);
    for (const [index, line] of lines.entries()) if (index > 0) expect(line.prev).toBe(lines[index - 1]!.hash);
    const text = lines.map((line) => JSON.stringify(line)).join("\n");
    for (const secret of [SENTINEL, Buffer.from(vault.ark).toString("hex"), b64.encode(vault.ark), b64.encode(vault.serverShare)]) expect(text).not.toContain(secret);
  });

  // Review 2026-10-17 (reports/2026-10-17-vault-broker-review): one regression test per finding.
  it("H1/M2: the operator signature fixes origins, generation, epoch and expiry", async () => {
    const vault = await enrolled();
    const { request } = await delegation(vault);
    for (const altered of [{ items: [{ ...request.items[0]!, origins: ["https://phish.example"] }] }, { items: [{ ...request.items[0]!, origins: [...request.items[0]!.origins, "https://phish.example"] }] },
      { expiresAt: new Date(Date.now() + 700 * 3_600_000).toISOString() }, { generation: 2 }, { unlockEpoch: 2 }]) {
      await expect(vault.client.delegate({ ...request, ...altered }), JSON.stringify(altered)).rejects.toBeInstanceOf(VaultBrokerRefusedError);
    }
    expect((await vault.client.delegate(request)).certificate).toBeTruthy();
  });

  it("H2 (Option A): a fill answers only on the Browser Host's socket, sealed to that caller's own reply key", async () => {
    const vault = await enrolled();
    const { handle, fillEnvelopes, request } = await delegation(vault);
    const { certificate, keyEnvelope } = await vault.client.delegate(request);
    // The capability names no reply key: the caller on the host socket is the only one who can ask.
    expect((await post(vault.core, "/v1/use", useRequest(vault, certificate, handle, { replyPublicKey: b64.encode(vaultRandomBytes(32)) }))).body).toEqual({ error: "BAD_REQUEST" });
    const use = await post(vault.core, "/v1/use", useRequest(vault, certificate, handle));
    const capability = (use.body as { capability: { claims: Record<string, unknown> } }).capability;
    expect(capability.claims).not.toHaveProperty("replyPublicKey");
    const relay = await generateVaultTransportKey();
    const fill = (replyPublicKey: Uint8Array) => ({ capability, keyEnvelope, fieldEnvelopes: fillEnvelopes[handle], replyPublicKey: b64.encode(replyPublicKey) });
    // Over the API's socket a fill is not served at all (and the capability stays unspent).
    expect(await post(vault.core, "/v1/fill", fill(relay.publicKey), "api")).toEqual({ status: 404, body: { error: "FILL_HOST_ONLY" } });
    const host = await generateVaultTransportKey();
    const answer = await post(vault.core, "/v1/fill", fill(host.publicKey), "host");
    expect(JSON.parse(new TextDecoder().decode(await openWithVaultPrivateKey(host.privateKey, host.publicKey, (answer.body as { sealedFields: unknown }).sealedFields, vault.scope)))).toEqual({ PASSWORD: SENTINEL });
    // The host socket serves nothing else.
    expect((await vault.core.handle("POST", "/v1/use", useRequest(vault, certificate, handle), "host")).status).toBe(404);
  });

  it("M3: use and fill stop at the broker itself while custody is not proven; operator unlock and delegation do not", async () => {
    const vault = await enrolled(async () => ({ enabled: false, reason: "CUSTODY_NOT_PROVEN" }));
    const { handle, request } = await delegation(vault);
    const { certificate } = await vault.client.delegate(request);
    expect((await post(vault.core, "/v1/use", useRequest(vault, certificate, handle))).body).toEqual({ error: "CUSTODY_NOT_PROVEN" });
    // Without a stub the broker reads the root-owned report, which does not exist here: refused too.
    const root = await mkdtemp(join(tmpdir(), "space-vault-broker-default-"));
    roots.push(root);
    const real = await createVaultBroker({ ark: vault.ark, stateDir: join(root, "state") });
    expect((await real.handle("POST", "/v1/use", useRequest(vault, certificate, handle))).body).toEqual({ error: "CUSTODY_NOT_PROVEN" });
  });
});

describe("space-vault-broker socket posture and daily custody (M1, operator decision Option B)", () => {
  async function socketFixture() {
    const { createServer } = await import("node:net");
    const { chmod, writeFile } = await import("node:fs/promises");
    const root = await mkdtemp(join(tmpdir(), "space-vault-socket-"));
    roots.push(root);
    const dir = join(root, "run");
    await (await import("node:fs/promises")).mkdir(dir, { mode: 0o755 });
    await chmod(dir, 0o755);
    const path = join(dir, "broker.sock");
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(path, resolve));
    servers.push(server);
    await chmod(path, 0o660);
    const gid = process.getgid!();
    const groupFile = () => `root:x:0:\nspace-vault-client:x:${gid}:space\n`;
    const posture = (overrides: Record<string, unknown> = {}) => vaultSocketPosture({ path, ownerUid: process.getuid!(), dirOwnerUid: process.getuid!(), groupFile, ...overrides });
    return { root, dir, path, chmod, writeFile, posture };
  }

  it("accepts only the broker's own 0660 socket of group space-vault-client in a directory nobody else can write", async () => {
    const socket = await socketFixture();
    expect(socket.posture()).toEqual({ ok: true, reason: null });
    expect(socket.posture({ ownerUid: 0 }).reason).toBe("SOCKET_OWNER");
    expect(socket.posture({ groupFile: () => `space:x:${process.getgid!()}:\n` }).reason).toBe("SOCKET_GROUP");
    await socket.chmod(socket.path, 0o666);
    expect(socket.posture().reason).toBe("SOCKET_MODE");
    await socket.chmod(socket.path, 0o660);
    await socket.chmod(socket.dir, 0o777);
    expect(socket.posture().reason).toBe("SOCKET_DIR");
    expect(socket.posture({ path: join(socket.root, "missing.sock") }).reason).toBe("SOCKET_MISSING");
    const file = join(socket.root, "plain");
    await socket.writeFile(file, "x");
    expect(socket.posture({ path: file }).reason).toBe("NOT_A_SOCKET");
  });

  it("serves agent use only while the socket keeps its posture and the daily custody report is fresh and passing", async () => {
    const socket = await socketFixture();
    const { chmod, writeFile, mkdir } = await import("node:fs/promises");
    const reportDir = join(socket.root, "custody");
    await mkdir(reportDir, { mode: 0o755 });
    await chmod(reportDir, 0o755);
    const reportPath = join(reportDir, "custody-preflight.json");
    const report = async (checkedAt: Date, ok = true) => {
      await writeFile(reportPath, JSON.stringify({ kind: "space-vault-custody-preflight", version: 1, checkedAt: checkedAt.toISOString(), passed: ok, checks: [{ id: "x", ok, detail: "" }] }), { mode: 0o644 });
      await chmod(reportPath, 0o644);
    };
    const vault = await enrolled();
    const { handle, request } = await delegation(vault);
    const { certificate } = await vault.client.delegate(request);
    const brokerWith = async (posture = socket.posture) => {
      const state = await mkdtemp(join(tmpdir(), "space-vault-broker-m1-"));
      roots.push(state);
      return createVaultBroker({ ark: vault.ark, stateDir: state, socketPosture: () => posture(), custodyReport: { path: reportPath, ownerUid: process.getuid!() } });
    };
    const use = async (core: VaultBrokerCore) => (await post(core, "/v1/use", useRequest(vault, certificate, handle))).body;
    await report(new Date());
    expect(await use(await brokerWith())).toHaveProperty("capability");
    // A day without a fresh preflight closes it again: the report must be under 26 hours old.
    await report(new Date(Date.now() - 27 * 3_600_000));
    expect(await use(await brokerWith())).toEqual({ error: "CUSTODY_NOT_PROVEN" });
    await report(new Date(), false);
    expect(await use(await brokerWith())).toEqual({ error: "CUSTODY_NOT_PROVEN" });
    await report(new Date());
    expect(await use(await brokerWith(() => ({ ok: false, reason: "SOCKET_MODE" })))).toEqual({ error: "CUSTODY_NOT_PROVEN" });
  });

  it("keeps the report's 26-hour limit above the daily timer's period, so one missed run closes fills", async () => {
    const timer = await readFile(new URL("../../../deploy/space-vault-custody-preflight.timer", import.meta.url), "utf8");
    expect(timer).toMatch(/^OnCalendar=daily$/m);
    expect(timer).toMatch(/^Persistent=true$/m);
    const jitterMinutes = Number(/^RandomizedDelaySec=(\d+)m$/m.exec(timer)?.[1]);
    const { VAULT_CUSTODY_REPORT_MAX_AGE_MS } = await import("../src/vault/agent-fill-gate.js");
    expect(VAULT_CUSTODY_REPORT_MAX_AGE_MS).toBeGreaterThan((24 * 60 + jitterMinutes) * 60_000);
    expect(VAULT_CUSTODY_REPORT_MAX_AGE_MS).toBeLessThan(48 * 3_600_000);
  });
});

describe("space-vault-broker sign-up grants (NEW_ACCOUNT option B, operator decision 2026-10-18)", () => {
  async function granted(options: { sites?: string[]; dailyCap?: number; days?: number; custody?: Parameters<typeof start>[2] } = {}) {
    let clock = Date.parse("2026-10-18T10:00:00.000Z");
    const vault = await enrolled(options.custody, () => new Date(clock));
    const grant = { grantId: newVaultHandle("vault_grant"), sites: options.sites ?? ["https://shop.example", "https://accounts.example"], dailyCap: options.dailyCap ?? 2,
      unlockEpoch: 1, expiresAt: new Date(clock + (options.days ?? 30) * 86_400_000).toISOString() };
    const message = vaultSignupGrantOperatorMessage({ ownerUserId: owner, vaultId: vault.vaultId, ...grant });
    const request = (signature: string) => ({ ownerUserId: owner, vaultId: vault.vaultId, ...grant, operatorSignature: signature, unlockPublicKey: vault.unlockPublicKey, serverShareEnvelope: vault.serverShareEnvelope });
    const issued = await post(vault.core, "/v1/signup-grant", request(await signVaultMessage(vault.unlock.privateKey, message)));
    const inbox = await generateVaultTransportKey();
    const reply = await generateVaultTransportKey();
    // The Browser Host's channel: /v1/signup returns plaintext sealed to the caller's key, so it answers only there (H2).
    const signup = (overrides: Record<string, unknown> = {}, channel: "api" | "host" = "host") => vault.core.handle("POST", "/v1/signup", { ownerUserId: owner, vaultId: vault.vaultId, certificate: (issued.body as { certificate: unknown }).certificate,
      origin: "https://shop.example", paneId: "pane:vaultpane1", roles: ["NEW_PASSWORD", "CONFIRM_PASSWORD"], inboxPublicKey: b64.encode(inbox.publicKey), replyPublicKey: b64.encode(reply.publicKey), ...overrides }, channel);
    return { vault, grant, request, message, issued, inbox, reply, signup, advance: (ms: number) => { clock += ms; } };
  }

  it("certifies only a grant the operator's unlock key signed, with the sites, cap and expiry it signed", async () => {
    const { vault, grant, request, message, issued } = await granted();
    expect(issued.status).toBe(200);
    const claims = await verifyVaultCertificate(vault.core.signingPublicKey, (issued.body as { certificate: unknown }).certificate, vaultSignupGrantCertificateSchema, new Date(Date.parse("2026-10-18T10:00:00.000Z")));
    expect(claims).toMatchObject({ kind: "SIGNUP_GRANT", grantId: grant.grantId, sites: ["https://accounts.example", "https://shop.example"], dailyCap: 2, expiresAt: grant.expiresAt });
    const other = await signVaultMessage((await generateVaultSigningKey()).privateKey, message);
    expect((await post(vault.core, "/v1/signup-grant", request(other))).body).toEqual({ error: "OPERATOR_SIGNATURE_REFUSED" });
    // A changed site, cap or expiry no longer matches what was signed.
    const signed = await signVaultMessage(vault.unlock.privateKey, message);
    expect((await post(vault.core, "/v1/signup-grant", { ...request(signed), sites: ["https://evil.example"] })).body).toEqual({ error: "OPERATOR_SIGNATURE_REFUSED" });
    expect((await post(vault.core, "/v1/signup-grant", { ...request(signed), dailyCap: 10 })).body).toEqual({ error: "OPERATOR_SIGNATURE_REFUSED" });
    // A wildcard, http or path site never parses.
    for (const site of ["https://*.example", "http://shop.example", "https://shop.example/signup"]) expect((await post(vault.core, "/v1/signup-grant", { ...request(signed), sites: [site] })).body).toEqual({ error: "BAD_REQUEST" });
    const tooLong = await granted({ days: 91 });
    expect(tooLong.issued.body).toEqual({ error: "EXPIRED" });
  });

  it("generates the password itself, seals it to the inbox and the reply key only, and enforces site, daily cap and expiry", async () => {
    const { vault, inbox, reply, signup, advance, grant } = await granted();
    expect((await signup({}, "api")).body).toEqual({ error: "FILL_HOST_ONLY" });
    const first = await signup();
    expect(first.status).toBe(200);
    const body = first.body as { sealedPassword: unknown; sealedFields: unknown };
    const password = new TextDecoder().decode(await openWithVaultPrivateKey(inbox.privateKey, inbox.publicKey, body.sealedPassword, vault.scope));
    const fields = JSON.parse(new TextDecoder().decode(await openWithVaultPrivateKey(reply.privateKey, reply.publicKey, body.sealedFields, vault.scope)));
    expect(password.length).toBeGreaterThanOrEqual(16);
    expect(fields).toEqual({ NEW_PASSWORD: password, CONFIRM_PASSWORD: password });
    await expect(openWithVaultPrivateKey(reply.privateKey, reply.publicKey, body.sealedPassword, vault.scope)).rejects.toThrow();
    expect((await signup({ origin: "https://shop.example.evil" })).body).toEqual({ error: "ORIGIN_MISMATCH" });
    expect((await signup({ origin: "https://www.shop.example" })).body).toEqual({ error: "ORIGIN_MISMATCH" });
    // The page field's length limit shapes the password; an impossible one spends no use.
    expect((await signup({ field: { minLength: 20, maxLength: 8 } })).body).toEqual({ error: "POLICY_UNSATISFIABLE" });
    const short = (await signup({ field: { minLength: null, maxLength: 12 } })).body as { sealedPassword: unknown };
    expect(new TextDecoder().decode(await openWithVaultPrivateKey(inbox.privateKey, inbox.publicKey, short.sealedPassword, vault.scope))).toHaveLength(12);
    expect((await signup({ origin: "https://accounts.example" })).body).toEqual({ error: "DAILY_CAP" });
    // The next UTC day has a fresh count; after the expiry nothing works.
    advance(86_400_000);
    expect((await signup()).status).toBe(200);
    advance(30 * 86_400_000);
    expect((await signup()).body).toEqual({ error: "EXPIRED" });
    // Each use and each refusal is one audit line, ids and results only.
    const lines = (await readFile(join(vault.state, "audit.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line)).filter((line) => line.op === "signup");
    expect(lines.map((line) => line.result)).toEqual(["OK", "ORIGIN_MISMATCH", "ORIGIN_MISMATCH", "POLICY_UNSATISFIABLE", "OK", "DAILY_CAP", "OK", "EXPIRED"]);
    expect(JSON.stringify(lines)).not.toContain(password);
    expect(JSON.stringify(lines)).not.toContain(grant.sites[0]);
  });

  it("stops a revoked grant, every grant after revoke-all, and every use while custody is not proven", async () => {
    const one = await granted();
    expect((await post(one.vault.core, "/v1/signup-revoke", { ownerUserId: owner, vaultId: one.vault.vaultId, grantId: one.grant.grantId })).status).toBe(200);
    expect((await one.signup()).body).toEqual({ error: "REVOKED" });
    const two = await granted();
    expect((await post(two.vault.core, "/v1/revoke", { ownerUserId: owner, vaultId: two.vault.vaultId, generation: 5 })).status).toBe(200);
    expect((await two.signup()).body).toEqual({ error: "REVOKED" });
    const closed = await granted({ custody: async () => ({ enabled: false, reason: "CUSTODY_NOT_PROVEN" }) });
    expect(closed.issued.status).toBe(200);
    expect((await closed.signup()).body).toEqual({ error: "CUSTODY_NOT_PROVEN" });
    // Another owner's request never uses this grant.
    expect((await one.signup({ ownerUserId: "user:bob" })).body).toEqual({ error: "CERTIFICATE_REFUSED" });
  });
});

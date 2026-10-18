import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getApiConfig } from "../src/config.js";
import { VAULT_CUSTODY_REPORT_MAX_AGE_MS, vaultAgentFillGate } from "../src/vault/agent-fill-gate.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const now = new Date("2026-10-17T12:00:00Z");
const report = (overrides: Record<string, unknown> = {}) => ({
  kind: "space-vault-custody-preflight", version: 1, checkedAt: "2026-10-17T06:00:00Z", passed: true,
  checks: [{ id: "runs-as-root", ok: true, detail: "" }, { id: "ark-not-exposed", ok: true, detail: "" }], ...overrides
});

async function reportFile(content: unknown) {
  const root = await mkdtemp(join(tmpdir(), "space-vault-gate-"));
  roots.push(root);
  await chmod(root, 0o755);
  const path = join(root, "custody-preflight.json");
  await writeFile(path, typeof content === "string" ? content : JSON.stringify(content), { mode: 0o644 });
  return path;
}

// Tests own their temp files, so they stand in the test user for root.
const gate = (path: string, flag = true, at = now) => vaultAgentFillGate(flag, { now: at, path, ownerUid: process.getuid!() });

describe("Vault agent-fill gate", () => {
  it("is off by default in the API config", () => {
    expect(getApiConfig({ SPACE_LOG_LEVEL: "silent" }).vaultAgentFillEnabled).toBe(false);
    expect(getApiConfig({ SPACE_LOG_LEVEL: "silent", SPACE_VAULT_AGENT_FILL_ENABLED: "true" }).vaultAgentFillEnabled).toBe(true);
  });

  it("opens only with the flag and a fresh, fully passing report", async () => {
    const path = await reportFile(report());
    await expect(gate(path)).resolves.toEqual({ enabled: true });
    await expect(gate(path, false)).resolves.toEqual({ enabled: false, reason: "FLAG_OFF" });
  });

  it("fails closed on every unproven custody state", async () => {
    await expect(gate("/nonexistent/vault/report.json")).resolves.toMatchObject({ reason: "REPORT_MISSING" });
    await expect(gate(await reportFile("{not json"))).resolves.toMatchObject({ reason: "REPORT_INVALID" });
    await expect(gate(await reportFile(report({ version: 2 })))).resolves.toMatchObject({ reason: "REPORT_INVALID" });
    await expect(gate(await reportFile(report({ passed: false })))).resolves.toMatchObject({ reason: "CUSTODY_NOT_PROVEN" });
    // A report claiming passed with any failed check stays closed.
    const lying = report({ checks: [{ id: "cli:spaceapp-user:sudo", ok: false, detail: "" }] });
    await expect(gate(await reportFile(lying))).resolves.toMatchObject({ reason: "CUSTODY_NOT_PROVEN" });
    await expect(gate(await reportFile(report({ checks: [] })))).resolves.toMatchObject({ reason: "CUSTODY_NOT_PROVEN" });
    const path = await reportFile(report());
    await expect(gate(path, true, new Date(Date.parse("2026-10-17T06:00:00Z") + VAULT_CUSTODY_REPORT_MAX_AGE_MS + 1)))
      .resolves.toMatchObject({ reason: "REPORT_STALE" });
    await expect(gate(path, true, new Date("2026-10-17T05:00:00Z"))).resolves.toMatchObject({ reason: "REPORT_STALE" });
  });

  it("rejects a report another user could have written", async () => {
    const path = await reportFile(report());
    await chmod(path, 0o666);
    await expect(gate(path)).resolves.toMatchObject({ reason: "REPORT_NOT_ROOT_OWNED" });
    // The production default requires uid 0; the test user's own file never opens it.
    await chmod(path, 0o644);
    if (process.getuid!() !== 0) await expect(vaultAgentFillGate(true, { now, path })).resolves.toMatchObject({ reason: "REPORT_NOT_ROOT_OWNED" });
  });
});

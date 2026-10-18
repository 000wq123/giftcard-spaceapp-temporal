import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

/** Written as root by scripts/space-vault-custody-preflight.mjs (ADR-012); nothing else is trusted to open the gate. */
export const VAULT_CUSTODY_REPORT_PATH = "/etc/space-vault-broker/custody-preflight.json";
// The preflight re-runs daily; a missed run closes the gate instead of trusting old host posture.
export const VAULT_CUSTODY_REPORT_MAX_AGE_MS = 26 * 60 * 60 * 1000;

export type VaultAgentFillGate =
  | { enabled: true }
  | { enabled: false; reason: "FLAG_OFF" | "REPORT_MISSING" | "REPORT_NOT_ROOT_OWNED" | "REPORT_INVALID" | "REPORT_STALE" | "CUSTODY_NOT_PROVEN" };

const ownedBy = async (path: string, uid: number) => {
  const info = await stat(path);
  return info.uid === uid && (info.mode & 0o022) === 0;
};

/**
 * Agent fills run only with SPACE_VAULT_AGENT_FILL_ENABLED=true AND a fresh, fully passing custody report owned by
 * root. Every error closes the gate. Operator-only Vault never consults it.
 */
export async function vaultAgentFillGate(
  flagEnabled: boolean,
  { now = new Date(), path = VAULT_CUSTODY_REPORT_PATH, ownerUid = 0 }: { now?: Date; path?: string; ownerUid?: number } = {}
): Promise<VaultAgentFillGate> {
  if (!flagEnabled) return { enabled: false, reason: "FLAG_OFF" };
  let text: string;
  try {
    if (!(await ownedBy(path, ownerUid)) || !(await ownedBy(dirname(path), ownerUid))) return { enabled: false, reason: "REPORT_NOT_ROOT_OWNED" };
    text = await readFile(path, "utf8");
  } catch {
    return { enabled: false, reason: "REPORT_MISSING" };
  }
  let report: { kind?: unknown; version?: unknown; checkedAt?: unknown; passed?: unknown; checks?: unknown };
  try { report = JSON.parse(text); } catch { return { enabled: false, reason: "REPORT_INVALID" }; }
  const checkedAt = typeof report.checkedAt === "string" ? Date.parse(report.checkedAt) : Number.NaN;
  if (report.kind !== "space-vault-custody-preflight" || report.version !== 1 || !Array.isArray(report.checks) || Number.isNaN(checkedAt)) {
    return { enabled: false, reason: "REPORT_INVALID" };
  }
  const age = now.getTime() - checkedAt;
  if (age < 0 || age > VAULT_CUSTODY_REPORT_MAX_AGE_MS) return { enabled: false, reason: "REPORT_STALE" };
  const allPassed = report.passed === true && report.checks.length > 0
    && report.checks.every((check) => typeof check === "object" && check !== null && (check as { ok?: unknown }).ok === true);
  return allPassed ? { enabled: true } : { enabled: false, reason: "CUSTODY_NOT_PROVEN" };
}

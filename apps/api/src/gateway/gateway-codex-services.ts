import {
  codexResetCreditAvailabilitySchema, codexResetCreditRedemptionResponseSchema, codexUsageAccountListSchema,
  type CodexResetCreditAvailability, type CodexUsageAccountList
} from "@space/contracts";
import type { GatewayRepository } from "@space/db";
import { SpaceConflictError } from "@space/runtime";
import { CodexResetCreditsError, type CodexResetCreditsRedemptionResult, type CodexResetCreditsService } from "../codex-reset-credits.js";
import type { GatewayAdminService } from "./gateway-service.js";

/**
 * Codex account quotas and weekly reset credits from Space Gateway, with the contracts the toolbar and the reset
 * dialog already use (they came from codex-lb on public-host before codex-lb was retired).
 */
const remaining = (used: number | null) => (used === null ? null : Math.max(0, Math.min(100, Math.round((100 - used) * 10) / 10)));

export function createGatewayCodexUsageProvider(options: { repository: GatewayRepository; now?: () => Date }): () => Promise<CodexUsageAccountList> {
  const now = options.now ?? (() => new Date());
  return async () => {
    const checkedAt = now().toISOString();
    try {
      const accounts = (await options.repository.listAccounts()).filter((account) => account.provider === "CODEX" && account.status !== "PAUSED");
      return codexUsageAccountListSchema.parse({
        data: accounts.slice(0, 100).map((account) => ({
          id: account.id, label: account.label, planType: account.planType,
          fiveHourRemainingPercent: remaining(account.primaryWindow.usedPercent), weeklyRemainingPercent: remaining(account.secondaryWindow.usedPercent),
          fiveHourResetAt: account.primaryWindow.resetAt, weeklyResetAt: account.secondaryWindow.resetAt, sampledAt: account.lastRefreshAt ?? account.lastUsedAt
        })),
        pagination: { page: 1, pageSize: 100, totalItems: Math.min(accounts.length, 100), totalPages: 1 },
        source: "space-gateway", isStale: false, error: null, checkedAt
      });
    } catch {
      return codexUsageAccountListSchema.parse({ data: [], pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 }, source: "space-gateway",
        isStale: true, error: "Space Gateway accounts are unavailable.", checkedAt });
    }
  };
}

const outcomes = new Set(["RESET", "ALREADY_REDEEMED", "NOTHING_TO_RESET", "NO_CREDIT"]);

export function createGatewayCodexResetCreditsService(options: { repository: GatewayRepository; admin: Pick<GatewayAdminService, "gatewayAdmin">; now?: () => Date }): CodexResetCreditsService {
  const now = options.now ?? (() => new Date());
  // One redemption per account at a time: a repeated click (same idempotency key) joins the running one, another
  // click is refused until it ends, so a double click can never spend two credits.
  const running = new Map<string, { idempotencyKey: string; result: Promise<CodexResetCreditsRedemptionResult> }>();

  async function redeemOnce(accountId: string, idempotencyKey: string): Promise<CodexResetCreditsRedemptionResult> {
    const result = await options.admin.gatewayAdmin(`/__space-gateway/admin/accounts/${accountId}/reset-credit`, { idempotencyKey });
    const outcome = (result.body as { outcome?: unknown } | null)?.outcome;
    if (result.status === 404) throw new CodexResetCreditsError("STALE_CREDIT");
    if (result.status >= 500 || typeof outcome !== "string" || !outcomes.has(outcome)) {
      throw new CodexResetCreditsError(result.status >= 500 ? "UNKNOWN_OUTCOME" : "PROVIDER_UNAVAILABLE");
    }
    const typed = outcome as "RESET" | "ALREADY_REDEEMED" | "NOTHING_TO_RESET" | "NO_CREDIT";
    return {
      response: codexResetCreditRedemptionResponseSchema.parse({ accountId, outcome: typed, completedAt: now().toISOString() }),
      audit: { outcome: typed, usageVerified: typed === "RESET", creditIdHash: null }
    };
  }

  return {
    async availability(): Promise<CodexResetCreditAvailability> {
      const accounts = (await options.repository.listAccounts()).filter((account) => account.provider === "CODEX");
      return codexResetCreditAvailabilitySchema.parse({
        data: accounts.slice(0, 100).map((account) => ({ accountId: account.id, availableCreditCount: account.resetCreditsAvailable })),
        source: "space-gateway", isStale: false, error: null, checkedAt: now().toISOString()
      });
    },
    async redeem(accountId, idempotencyKey) {
      if (!/^gw_account:[a-f0-9]{32}$/.test(accountId)) throw new CodexResetCreditsError("STALE_CREDIT");
      const current = running.get(accountId);
      if (current) {
        if (current.idempotencyKey === idempotencyKey) return current.result;
        throw new SpaceConflictError("A reset credit redemption is already running for this account.");
      }
      const result = redeemOnce(accountId, idempotencyKey);
      running.set(accountId, { idempotencyKey, result });
      const clear = () => { if (running.get(accountId)?.result === result) running.delete(accountId); };
      void result.then(clear, clear);
      return result;
    }
  };
}

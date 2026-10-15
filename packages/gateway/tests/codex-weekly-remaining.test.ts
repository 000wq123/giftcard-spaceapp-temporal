import { describe, expect, it, vi } from "vitest";
import { InMemoryGatewayRepository } from "@space/db";
import { AccountPool } from "../src/accounts/account-pool.js";
import { generateGatewayApiKey } from "../src/api-keys.js";
import { registerWeeklyRemainingRoute } from "../src/providers/codex/weekly-remaining.js";
import { createGatewayServer } from "../src/server.js";

describe("Codex weekly remaining", () => {
  it("pools weekly usage by plan capacity, counts active accounts and needs a key", async () => {
    const repository = new InMemoryGatewayRepository();
    const accounts: Array<[string, string, number | null]> = [["1", "plus", 50], ["2", "prolite", 10], ["3", "plus", 100], ["4", "free", 0]];
    for (const [digit, plan, used] of accounts) {
      const id = `gw_account:${digit.repeat(32)}`;
      await repository.upsertAccount({ accountId: id, provider: "CODEX", label: digit, email: null, externalAccountId: digit, planType: plan, credentialsEncrypted: "v1.x",
        credentialsExpiresAt: null, source: "OAUTH", sourceRef: null, lastRefreshAt: null });
      await repository.saveUsageWindows(id, [{ window: "SECONDARY", usedPercent: used, resetAt: `2030-01-1${digit}T00:00:00.000Z`, windowMinutes: 10080 }]);
    }
    const pool = new AccountPool({ provider: "CODEX", repository, cipher: () => null, refresher: { needsRefresh: () => false, refresh: vi.fn() } });
    const { plainKey, keyHash, keyPrefix } = generateGatewayApiKey();
    await repository.createApiKey({ keyId: `gw_key:${"d".repeat(32)}`, name: "Space", keyHash, keyPrefix, trafficClass: "BACKGROUND", allowedModels: [],
      enforcedModel: null, allowedReasoningEfforts: [], enforcedReasoningEffort: null, accountIds: [], compressionOverride: null, limits: [], expiresAt: null, createdBy: null });
    const server = createGatewayServer({ repository, version: "test", credentialKeyPresent: () => true,
      routes: (app, helpers) => registerWeeklyRemainingRoute(app, helpers, { pool }) });
    expect((await server.app.inject({ method: "GET", url: "/api/codex/weekly-remaining" })).statusCode).toBe(401);
    const response = await server.app.inject({ method: "GET", url: "/v1/api/codex/weekly-remaining", headers: { authorization: `Bearer ${plainKey}` } });
    // plus 7560 + prolite 37800 + plus 7560 = 52920 credits; used 3780 + 3780 + 7560 = 15120.
    expect(response.json()).toMatchObject({ remaining_percent: 71.43, capacity_credits: 52920, used_credits: 15120, all_accounts_count: 3,
      active_accounts_count: 2, active_capacity_credits: 45360, active_used_credits: 7560, reset_at: "2030-01-11T00:00:00.000Z",
      all_accounts_remaining_percent: 46.67 });
  });
});

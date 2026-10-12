import { randomBytes } from "node:crypto";
import {
  gatewayAccountListSchema, gatewayApiKeyCreatedResponseSchema, gatewayApiKeyListSchema, gatewayRequestLogListSchema,
  gatewayCompressionStatsSchema, gatewayReportSchema, gatewaySettingsSchema, type GatewayCompressionStats, gatewayStatusSchema, type GatewayReport, type GatewayReportRow, type GatewayAccount, type GatewayApiKey, type GatewayApiKeyCreateRequest,
  type GatewayApiKeyCreatedResponse, type GatewayApiKeyUpdateRequest, type GatewayProvider, type GatewayRequestLogList,
  type GatewaySettings, type GatewaySettingsUpdateRequest, type GatewayStatus
} from "@space/contracts";
import type { GatewayAccountRecord, GatewayApiKeyRecord, GatewayRepository } from "@space/db";
import { readFile } from "node:fs/promises";
import { generateGatewayApiKey } from "@space/gateway";
import { discoverAntigravityProfiles, extractEmailFromIdToken, type AntigravityProfileLocation } from "../antigravity-usage-services.js";

export interface GatewayAdminService {
  status(): Promise<GatewayStatus>;
  listAccounts(): Promise<{ data: GatewayAccount[] }>;
  setAccountPaused(accountId: string, paused: boolean): Promise<GatewayAccount | null>;
  listApiKeys(): Promise<{ data: GatewayApiKey[] }>;
  createApiKey(input: GatewayApiKeyCreateRequest, actorUserId: string | null): Promise<GatewayApiKeyCreatedResponse>;
  updateApiKey(keyId: string, patch: GatewayApiKeyUpdateRequest): Promise<GatewayApiKey | null>;
  deleteApiKey(keyId: string): Promise<boolean>;
  listRequestLogs(query: { limit: number; cursor?: string | null; accountId?: string | null; apiKeyId?: string | null }): Promise<GatewayRequestLogList>;
  getSettings(): Promise<GatewaySettings>;
  updateSettings(patch: GatewaySettingsUpdateRequest): Promise<GatewaySettings>;
  deleteAccount(accountId: string): Promise<boolean>;
  report(from: string, to: string): Promise<GatewayReport>;
  compressionStats(hours: number): Promise<GatewayCompressionStats>;
  /** Calls a gateway admin endpoint (loopback, internal token). Credentials stay inside the gateway. */
  gatewayAdmin(path: string, body?: Record<string, unknown>): Promise<{ status: number; body: unknown }>;
  /** Space Antigravity profiles that are signed in, and whether their account is already in Space Gateway. */
  antigravityProfiles(): Promise<{ data: Array<{ profileId: string; email: string | null; inGateway: boolean }> }>;
  /** Hands a profile's Antigravity sign-in to the gateway (Google refresh tokens do not rotate, so the profile keeps working). */
  importAntigravityProfile(profileId: string): Promise<{ status: number; body: unknown }>;
  /** Adds an OpenAI API key account: a pasted key, or the server's Space OpenAI key file. */
  addOpenAiApiKey(input: { apiKey?: string; useSpaceKey?: boolean; label?: string }): Promise<{ status: number; body: unknown }>;
}

export class GatewayAccountNotFoundError extends Error {}

/** Strips the encrypted credential envelope and the key hash before anything leaves the API. */
function publicAccount(record: GatewayAccountRecord): GatewayAccount {
  const { externalAccountId: _external, credentialsEncrypted: _credentials, credentialsExpiresAt: _expires, source: _source,
    sourceRef: _sourceRef, blockedUntil: _blocked, ...account } = record;
  return account;
}

function publicKey(record: GatewayApiKeyRecord): GatewayApiKey {
  const { keyHash: _hash, ...key } = record;
  return key;
}

function nextReset(window: "DAILY" | "WEEKLY" | "MONTHLY", now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (window === "DAILY") next.setUTCDate(next.getUTCDate() + 1);
  else if (window === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1, 1);
  return next.toISOString();
}

export function createGatewayAdminService(options: {
  repository: GatewayRepository;
  gatewayUrl: string;
  internalToken?: string | null;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  statusTimeoutMs?: number;
  antigravityProfileSource?: { list(): Promise<AntigravityProfileLocation[]>; read(path: string): Promise<string> };
  /** The server's own OpenAI API key (the one Space uses for voice). */
  spaceOpenAiKeyFile?: string;
}): GatewayAdminService {
  const { repository } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  const profileSource = options.antigravityProfileSource ?? { list: () => discoverAntigravityProfiles(), read: (path: string) => readFile(path, "utf8") };

  /** Profiles with a readable sign-in file; the file contents never leave the API except to the gateway. */
  async function signedInAntigravityProfiles() {
    const found: Array<{ profileId: string; email: string | null; tokenJson: string }> = [];
    for (const location of await profileSource.list().catch(() => [])) {
      const tokenJson = await profileSource.read(location.tokenPath).catch(() => null);
      if (!tokenJson) continue;
      let email: string | null = null;
      try { email = extractEmailFromIdToken((JSON.parse(tokenJson) as { id_token?: string }).id_token); } catch { continue; }
      found.push({ profileId: location.profileId, email, tokenJson });
    }
    return found;
  }

  async function gatewayAdmin(path: string, body: Record<string, unknown> = {}): Promise<{ status: number; body: unknown }> {
    if (!options.internalToken) {
      return { status: 503, body: { error: { code: "gateway_admin_unavailable", message: "SPACE_INTERNAL_API_TOKEN is not configured." } } };
    }
    try {
      const response = await fetchImpl(`${options.gatewayUrl}${path}`, {
        method: "POST", signal: AbortSignal.timeout(45_000), body: JSON.stringify(body),
        headers: { "content-type": "application/json", "x-space-internal-token": options.internalToken }
      });
      const text = await response.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = { error: { code: "gateway_invalid_response", message: "Space Gateway returned an invalid response." } }; }
      return { status: response.status, body: parsed };
    } catch {
      return { status: 503, body: { error: { code: "gateway_unreachable", message: "Space Gateway is not running." } } };
    }
  }

  async function serviceState(): Promise<GatewayStatus["service"]> {
    try {
      const response = await fetchImpl(`${options.gatewayUrl}/__space-gateway/status`, {
        signal: AbortSignal.timeout(options.statusTimeoutMs ?? 1500)
      });
      if (!response.ok) {
        return { state: "UNREACHABLE", version: null, startedAt: null, inFlightRequests: null, listen: null, error: `Status check returned HTTP ${response.status}.` };
      }
      const body = await response.json() as { version?: unknown; startedAt?: unknown; inFlightRequests?: unknown; draining?: unknown; listen?: unknown };
      return {
        state: body.draining === true ? "DRAINING" : "RUNNING",
        version: typeof body.version === "string" ? body.version.slice(0, 80) : null,
        startedAt: typeof body.startedAt === "string" ? body.startedAt.slice(0, 40) : null,
        inFlightRequests: typeof body.inFlightRequests === "number" ? Math.max(0, Math.trunc(body.inFlightRequests)) : null,
        listen: typeof body.listen === "string" ? body.listen.slice(0, 120) : null,
        error: null
      };
    } catch (error) {
      const refused = error instanceof Error && /ECONNREFUSED/.test(String((error as { cause?: unknown }).cause ?? error.message));
      return {
        state: refused ? "NOT_INSTALLED" : "UNREACHABLE", version: null, startedAt: null, inFlightRequests: null, listen: null,
        error: refused ? "Space Gateway is not running." : "Space Gateway did not answer the status check."
      };
    }
  }

  return {
    async status() {
      const [service, accounts, keys, usage, settings] = await Promise.all([
        serviceState(), repository.listAccounts(), repository.listApiKeys(),
        repository.usageSince(new Date(now().getTime() - 86_400_000).toISOString()), repository.getSettings()
      ]);
      const providers = new Map<GatewayProvider, { total: number; active: number }>();
      for (const account of accounts) {
        const entry = providers.get(account.provider) ?? { total: 0, active: 0 };
        entry.total += 1;
        if (account.status === "ACTIVE") entry.active += 1;
        providers.set(account.provider, entry);
      }
      return gatewayStatusSchema.parse({
        service,
        accounts: {
          total: accounts.length,
          active: accounts.filter((account) => account.status === "ACTIVE").length,
          byProvider: [...providers].map(([provider, counts]) => ({ provider, ...counts }))
        },
        apiKeys: { total: keys.length, active: keys.filter((key) => key.isActive).length },
        last24h: usage,
        settings,
        checkedAt: now().toISOString()
      });
    },

    async listAccounts() {
      return gatewayAccountListSchema.parse({ data: (await repository.listAccounts()).map(publicAccount) });
    },

    async setAccountPaused(accountId, paused) {
      const updated = await repository.setAccountStatus(accountId, paused ? "PAUSED" : "ACTIVE", paused ? "Paused by an administrator." : null);
      return updated ? publicAccount(updated) : null;
    },

    async listApiKeys() {
      return gatewayApiKeyListSchema.parse({ data: (await repository.listApiKeys()).map(publicKey) });
    },

    async createApiKey(input, actorUserId) {
      const known = new Set((await repository.listAccounts()).map((account) => account.id));
      const unknown = input.accountIds.find((accountId) => !known.has(accountId));
      if (unknown) throw new GatewayAccountNotFoundError("One of the selected accounts no longer exists.");
      const generated = generateGatewayApiKey();
      const current = now();
      const record = await repository.createApiKey({
        keyId: `gw_key:${randomBytes(16).toString("hex")}`,
        name: input.name,
        keyHash: generated.keyHash,
        keyPrefix: generated.keyPrefix,
        trafficClass: input.trafficClass,
        allowedModels: input.allowedModels,
        enforcedModel: input.enforcedModel,
        allowedReasoningEfforts: input.allowedReasoningEfforts,
        enforcedReasoningEffort: input.enforcedReasoningEffort,
        accountIds: input.accountIds,
        compressionOverride: input.compressionOverride,
        limits: input.limits.map((limit) => ({ ...limit, resetAt: nextReset(limit.limitWindow, current) })),
        expiresAt: input.expiresAt,
        createdBy: actorUserId
      });
      return gatewayApiKeyCreatedResponseSchema.parse({ key: publicKey(record), plainKey: generated.plainKey });
    },

    async updateApiKey(keyId, patch) {
      const updated = await repository.updateApiKey(keyId, patch);
      return updated ? publicKey(updated) : null;
    },

    deleteApiKey: (keyId) => repository.deleteApiKey(keyId),

    async listRequestLogs(query) {
      const beforeId = query.cursor && /^\d{1,19}$/.test(query.cursor) ? Number(query.cursor) : null;
      const limit = Math.max(1, Math.min(query.limit, 200));
      const rows = await repository.listRequestLogs({ limit: limit + 1, beforeId, accountId: query.accountId, apiKeyId: query.apiKeyId });
      const data = rows.slice(0, limit);
      return gatewayRequestLogListSchema.parse({ data, nextCursor: rows.length > limit ? data[data.length - 1]!.id : null });
    },

    deleteAccount: (accountId) => repository.deleteAccount(accountId),

    async compressionStats(hours) {
      const rows = await repository.compressionSince(new Date(now().getTime() - hours * 3_600_000).toISOString());
      const totals = (mode: "ON" | "SHADOW") => {
        const requestRows = rows.filter((row) => row.mode === mode && row.strategy === "");
        const blockRows = rows.filter((row) => row.mode === mode && row.strategy !== "");
        const sum = (list: typeof rows, pick: (row: (typeof rows)[number]) => number) => list.reduce((total, row) => total + pick(row), 0);
        const originalTokens = sum(requestRows, (row) => row.originalTokens);
        const compressedTokens = sum(requestRows, (row) => row.compressedTokens);
        const requests = sum(requestRows, (row) => row.requests);
        return {
          requests, modifiedRequests: sum(requestRows, (row) => row.modifiedRequests), blocks: sum(blockRows, (row) => row.blocks),
          rejectedBlocks: sum(blockRows, (row) => row.rejectedBlocks), errorBlocks: sum(blockRows, (row) => row.errorBlocks),
          timedOut: sum(requestRows, (row) => row.timedOut), originalTokens, compressedTokens, tokensSaved: Math.max(0, originalTokens - compressedTokens),
          savingsPercent: originalTokens > 0 ? Math.min(100, ((originalTokens - compressedTokens) / originalTokens) * 100) : 0,
          averageOverheadMs: requests > 0 ? sum(requestRows, (row) => row.overheadMs) / requests : 0,
          maxOverheadMs: requestRows.reduce((max, row) => Math.max(max, row.maxOverheadMs), 0)
        };
      };
      const strategies = new Map<string, { mode: "SHADOW" | "ON"; strategy: string; blocks: number; rejectedBlocks: number; errorBlocks: number; original: number; compressed: number }>();
      for (const row of rows.filter((item) => item.strategy !== "")) {
        const key = `${row.mode}:${row.strategy}`;
        const entry = strategies.get(key) ?? { mode: row.mode, strategy: row.strategy, blocks: 0, rejectedBlocks: 0, errorBlocks: 0, original: 0, compressed: 0 };
        entry.blocks += row.blocks; entry.rejectedBlocks += row.rejectedBlocks; entry.errorBlocks += row.errorBlocks;
        entry.original += row.originalTokens; entry.compressed += row.compressedTokens;
        strategies.set(key, entry);
      }
      const history = new Map<string, { hour: string; appliedSaved: number; shadowSaved: number; requests: number }>();
      for (const row of rows.filter((item) => item.strategy === "")) {
        const entry = history.get(row.hour) ?? { hour: row.hour, appliedSaved: 0, shadowSaved: 0, requests: 0 };
        const saved = Math.max(0, row.originalTokens - row.compressedTokens);
        if (row.mode === "ON") entry.appliedSaved += saved; else entry.shadowSaved += saved;
        entry.requests += row.requests;
        history.set(row.hour, entry);
      }
      return gatewayCompressionStatsSchema.parse({
        hours, applied: totals("ON"), shadow: totals("SHADOW"),
        byStrategy: [...strategies.values()].map((entry) => ({ mode: entry.mode, strategy: entry.strategy, blocks: entry.blocks, rejectedBlocks: entry.rejectedBlocks,
          errorBlocks: entry.errorBlocks, tokensSaved: Math.max(0, entry.original - entry.compressed),
          savingsPercent: entry.original > 0 ? Math.min(100, ((entry.original - entry.compressed) / entry.original) * 100) : 0 })),
        history: [...history.values()]
      });
    },

    async report(from, to) {
      const { days, models, accounts } = await repository.usageReport(from, to);
      const zero: GatewayReportRow = { key: "total", requests: 0, errors: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
        reasoningTokens: 0, reasoningReported: 0, costUsd: 0, compressionTokensSaved: 0 };
      const totals = days.reduce<GatewayReportRow>((sum, row) => ({
        key: "total", requests: sum.requests + row.requests, errors: sum.errors + row.errors, inputTokens: sum.inputTokens + row.inputTokens,
        cachedInputTokens: sum.cachedInputTokens + row.cachedInputTokens, outputTokens: sum.outputTokens + row.outputTokens,
        reasoningTokens: sum.reasoningTokens + row.reasoningTokens, reasoningReported: sum.reasoningReported + row.reasoningReported,
        costUsd: sum.costUsd + row.costUsd, compressionTokensSaved: sum.compressionTokensSaved + row.compressionTokensSaved
      }), zero);
      return gatewayReportSchema.parse({ from, to, days, models, accounts, totals });
    },

    gatewayAdmin,

    async antigravityProfiles() {
      const profiles = await signedInAntigravityProfiles();
      const emails = new Set((await repository.listAccounts()).filter((account) => account.provider === "ANTIGRAVITY" && account.email)
        .map((account) => account.email!.toLowerCase()));
      return { data: profiles.map(({ profileId, email }) => ({ profileId, email, inGateway: Boolean(email && emails.has(email.toLowerCase())) })) };
    },

    async importAntigravityProfile(profileId) {
      const profile = (await signedInAntigravityProfiles()).find((item) => item.profileId === profileId);
      if (!profile) return { status: 404, body: { error: { code: "profile_not_found", message: "That Antigravity profile is not signed in." } } };
      return gatewayAdmin("/__space-gateway/admin/antigravity/import", { tokenJson: profile.tokenJson, sourceRef: profileId });
    },

    async addOpenAiApiKey(input) {
      let apiKey = input.apiKey?.trim() ?? "";
      let sourceRef: string | undefined;
      if (input.useSpaceKey) {
        apiKey = (await readFile(options.spaceOpenAiKeyFile ?? "/opt/spaceapp/secrets/space-openai-voice.key", "utf8").catch(() => "")).trim();
        if (!apiKey) return { status: 404, body: { error: { code: "space_key_missing", message: "This server has no Space OpenAI key." } } };
        sourceRef = "space-openai-voice";
      }
      return gatewayAdmin("/__space-gateway/admin/api-key/add", { provider: "OPENAI_API", apiKey, ...(input.label ? { label: input.label } : {}), ...(sourceRef ? { sourceRef } : {}) });
    },

    async getSettings() { return gatewaySettingsSchema.parse(await repository.getSettings()); },
    async updateSettings(patch) { return gatewaySettingsSchema.parse(await repository.updateSettings(patch)); }
  };
}

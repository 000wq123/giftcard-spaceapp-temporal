import type {
  GatewayAccount, GatewayAccountStatus, GatewayApiKey, GatewayApiKeyLimit, GatewayCompressionMode, GatewayLimitType,
  GatewayLimitWindow, GatewayProvider, GatewayReasoningEffort, GatewayRequestLog, GatewaySettings, GatewaySettingsUpdateRequest,
  GatewayTrafficClass
} from "@space/contracts";
import { createSpacePgPool, type PgPoolLike } from "./space-store.js";

/**
 * Space Gateway storage, shared by the gateway process (routing, logging) and the API (admin views).
 * Account credentials stay encrypted; only the gateway can decrypt them.
 */
export interface GatewayAccountRecord extends GatewayAccount {
  externalAccountId: string | null;
  credentialsEncrypted: string;
  credentialsExpiresAt: string | null;
  source: "OAUTH" | "IMPORT_AUTH_JSON" | "IMPORT_CODEX_LB" | "PROFILE_ADOPTION" | "API_KEY";
  sourceRef: string | null;
  blockedUntil: string | null;
}

export interface GatewayAccountInsert {
  accountId: string;
  provider: GatewayProvider;
  label: string;
  email: string | null;
  externalAccountId: string | null;
  planType: string | null;
  credentialsEncrypted: string;
  credentialsExpiresAt: string | null;
  source: GatewayAccountRecord["source"];
  sourceRef: string | null;
  lastRefreshAt: string | null;
}

export interface GatewayCredentialUpdate {
  credentialsEncrypted?: string;
  credentialsExpiresAt?: string | null;
  lastRefreshAt?: string | null;
  planType?: string | null;
  email?: string | null;
  status?: GatewayAccountStatus;
  statusReason?: string | null;
}

export interface GatewayUsageWindowInput {
  quotaKey?: string;
  window: "PRIMARY" | "SECONDARY";
  usedPercent: number | null;
  resetAt: string | null;
  windowMinutes: number | null;
}

export interface GatewayApiKeyRecord extends GatewayApiKey {
  keyHash: string;
}

export interface GatewayApiKeyInsert {
  keyId: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  trafficClass: GatewayTrafficClass;
  allowedModels: string[];
  enforcedModel: string | null;
  allowedReasoningEfforts: GatewayReasoningEffort[];
  enforcedReasoningEffort: GatewayReasoningEffort | null;
  accountIds: string[];
  compressionOverride: GatewayCompressionMode | null;
  limits: { limitType: GatewayLimitType; limitWindow: GatewayLimitWindow; maxValue: number; modelFilter: string | null; resetAt: string }[];
  expiresAt: string | null;
  createdBy: string | null;
}

export type GatewayRequestLogInsert = Omit<GatewayRequestLog, "id"> & {
  planType?: string | null;
  requestedServiceTier?: string | null;
  upstreamTransport?: string | null;
  errorMessage?: string | null;
  stickyKeySource?: string | null;
};

export type GatewayStickyKind = "CODEX_SESSION" | "STICKY_THREAD" | "PROMPT_CACHE" | "CONTINUATION";

/** Which account a conversation key (SHA-256 hex, never the raw key) belongs to. */
export interface GatewayStickyBinding {
  keyHash: string;
  kind: GatewayStickyKind;
  provider: GatewayProvider;
  accountId: string;
  expiresAt: string | null;
}

export interface GatewayReportRowInput {
  key: string;
  requests: number;
  errors: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  reasoningReported: number;
  costUsd: number;
  compressionTokensSaved: number;
}

export interface GatewayCompressionRow {
  hour: string;
  mode: "SHADOW" | "ON";
  provider: string;
  strategy: string;
  requests: number;
  modifiedRequests: number;
  blocks: number;
  rejectedBlocks: number;
  errorBlocks: number;
  timedOut: number;
  originalTokens: number;
  compressedTokens: number;
  overheadMs: number;
  maxOverheadMs: number;
}

export interface GatewayUsageSummary {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  compressionTokensSaved: number;
}

/** Request aggregates for the Headroom-compatible statistics. */
export interface GatewayRequestStats {
  total: number;
  failed: number;
  rateLimited: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  compressionTokensSaved: number;
  latency: { count: number; averageMs: number; minMs: number; maxMs: number };
  ttfb: { count: number; averageMs: number; minMs: number; maxMs: number };
}

export interface GatewayRepository {
  getSettings(): Promise<GatewaySettings>;
  updateSettings(patch: GatewaySettingsUpdateRequest): Promise<GatewaySettings>;
  listAccounts(): Promise<GatewayAccountRecord[]>;
  setAccountStatus(accountId: string, status: GatewayAccountStatus, reason: string | null): Promise<GatewayAccountRecord | null>;
  /** Adds an account, or replaces the credentials of the same upstream account (provider + external id). */
  upsertAccount(input: GatewayAccountInsert): Promise<GatewayAccountRecord>;
  deleteAccount(accountId: string): Promise<boolean>;
  /**
   * Runs `update` with the freshest row while holding a per-account lock, so only one holder refreshes a rotating
   * token at a time. Returning null leaves the row unchanged.
   */
  withAccountCredentialLock(accountId: string, update: (current: GatewayAccountRecord) => Promise<GatewayCredentialUpdate | null>): Promise<GatewayAccountRecord | null>;
  saveUsageWindows(accountId: string, windows: GatewayUsageWindowInput[]): Promise<void>;
  recordAccountState(accountId: string, state: { status: GatewayAccountStatus; statusReason: string | null; blockedUntil: string | null }): Promise<void>;
  touchAccounts(accountIds: string[], usedAt: string): Promise<void>;
  saveResetCredits(accountId: string, available: number | null): Promise<void>;
  listApiKeys(): Promise<GatewayApiKeyRecord[]>;
  findApiKeyByHash(keyHash: string): Promise<GatewayApiKeyRecord | null>;
  createApiKey(input: GatewayApiKeyInsert): Promise<GatewayApiKeyRecord>;
  updateApiKey(keyId: string, patch: { name?: string; isActive?: boolean }): Promise<GatewayApiKeyRecord | null>;
  deleteApiKey(keyId: string): Promise<boolean>;
  /**
   * Adds one request's usage to the key's limits (windows that already reset start again from this request) and
   * stamps last use. COST_USD limits count micro-dollars.
   */
  settleApiKeyUsage(keyId: string, usage: { inputTokens: number; outputTokens: number; costMicros: number; model: string | null; at: string }): Promise<void>;
  insertRequestLogs(rows: GatewayRequestLogInsert[]): Promise<void>;
  listRequestLogs(query: { limit: number; beforeId?: number | null; accountId?: string | null; apiKeyId?: string | null }): Promise<GatewayRequestLog[]>;
  usageSince(since: string): Promise<GatewayUsageSummary>;
  /** Counts, token totals and latency/TTFB over request logs since the given time. */
  requestStatsSince(since: string): Promise<GatewayRequestStats>;
  /** Daily rollups between two UTC dates (inclusive), grouped by day, model and account. */
  usageReport(from: string, to: string): Promise<{ days: GatewayReportRowInput[]; models: GatewayReportRowInput[]; accounts: GatewayReportRowInput[] }>;
  /** Adds compression results to the hourly rollups. */
  recordCompression(rows: GatewayCompressionRow[]): Promise<void>;
  /** Hourly compression rollups since the given time, oldest first. */
  compressionSince(since: string): Promise<GatewayCompressionRow[]>;
  /** Deletes request logs older than the cutoff in bounded batches; returns rows removed. */
  pruneRequestLogs(before: string, batchSize?: number): Promise<number>;
  /** Stores conversation-to-account bindings, so affinity survives a gateway restart; bindings to removed accounts are skipped. */
  saveStickyBindings(rows: GatewayStickyBinding[]): Promise<void>;
  /** The unexpired binding for a key, or null. */
  findStickyBinding(keyHash: string, nowIso: string): Promise<GatewayStickyBinding | null>;
  /** Deletes expired bindings; returns rows removed. */
  pruneStickyBindings(nowIso: string): Promise<number>;
  dispose(): Promise<void>;
}

export const defaultGatewaySettings: Omit<GatewaySettings, "updatedAt"> = {
  routingStrategy: "CAPACITY_WEIGHTED",
  stickyThreadsEnabled: true,
  preferEarlierReset: false,
  planPriority: ["plus", "prolite", "pro"],
  stickyReallocationBudgetThresholdPercent: 95,
  exhaustionFloorPercent: 3,
  compressionMode: "OFF",
  compressionProfile: "TOKEN",
  compressionTimeBudgetMs: 250,
  requestLogRetentionDays: 30
};

const settingsColumns: Record<keyof Omit<GatewaySettings, "updatedAt">, string> = {
  routingStrategy: "routing_strategy",
  stickyThreadsEnabled: "sticky_threads_enabled",
  preferEarlierReset: "prefer_earlier_reset",
  planPriority: "plan_priority",
  stickyReallocationBudgetThresholdPercent: "sticky_reallocation_budget_threshold_percent",
  exhaustionFloorPercent: "exhaustion_floor_percent",
  compressionMode: "compression_mode",
  compressionProfile: "compression_profile",
  compressionTimeBudgetMs: "compression_time_budget_ms",
  requestLogRetentionDays: "request_log_retention_days"
};

const iso = (value: unknown): string | null => value === null || value === undefined ? null : new Date(value as string).toISOString();
const num = (value: unknown): number | null => value === null || value === undefined ? null : Number(value);

function settingsRecord(row: Record<string, unknown>): GatewaySettings {
  return {
    routingStrategy: row.routing_strategy as GatewaySettings["routingStrategy"],
    stickyThreadsEnabled: Boolean(row.sticky_threads_enabled),
    preferEarlierReset: Boolean(row.prefer_earlier_reset),
    planPriority: (row.plan_priority as string[] | null) ?? [],
    stickyReallocationBudgetThresholdPercent: Number(row.sticky_reallocation_budget_threshold_percent),
    exhaustionFloorPercent: Number(row.exhaustion_floor_percent),
    compressionMode: row.compression_mode as GatewaySettings["compressionMode"],
    compressionProfile: row.compression_profile as GatewaySettings["compressionProfile"],
    compressionTimeBudgetMs: Number(row.compression_time_budget_ms),
    requestLogRetentionDays: Number(row.request_log_retention_days),
    updatedAt: iso(row.updated_at)!
  };
}

const emptyWindow = { usedPercent: null, resetAt: null, windowMinutes: null };

function accountRecord(row: Record<string, unknown>, windows: Record<string, unknown>[]): GatewayAccountRecord {
  const window = (name: string, quotaKey = "") => {
    const found = windows.find((item) => item.account_id === row.account_id && item.usage_window === name && item.quota_key === quotaKey);
    return found
      ? { usedPercent: num(found.used_percent), resetAt: iso(found.reset_at), windowMinutes: num(found.window_minutes) }
      : { ...emptyWindow };
  };
  const quotaKeys = [...new Set(windows.filter((item) => item.account_id === row.account_id && item.quota_key !== "").map((item) => String(item.quota_key)))].sort();
  return {
    id: row.account_id as string,
    provider: row.provider as GatewayProvider,
    label: row.label as string,
    email: (row.email as string | null) ?? null,
    planType: (row.plan_type as string | null) ?? null,
    status: row.status as GatewayAccountStatus,
    statusReason: (row.status_reason as string | null) ?? null,
    priority: Number(row.priority),
    warmupEnabled: Boolean(row.warmup_enabled),
    resetCreditsAvailable: num(row.reset_credits_available),
    primaryWindow: window("PRIMARY"),
    secondaryWindow: window("SECONDARY"),
    ...(quotaKeys.length > 0 ? { quotaGroups: quotaKeys.map((key) => ({ key, primaryWindow: window("PRIMARY", key), secondaryWindow: window("SECONDARY", key) })) } : {}),
    lastRefreshAt: iso(row.last_refresh_at),
    lastUsedAt: iso(row.last_used_at),
    createdAt: iso(row.created_at)!,
    externalAccountId: (row.external_account_id as string | null) ?? null,
    credentialsEncrypted: row.credentials_encrypted as string,
    credentialsExpiresAt: iso(row.credentials_expires_at),
    source: row.source as GatewayAccountRecord["source"],
    sourceRef: (row.source_ref as string | null) ?? null,
    blockedUntil: iso(row.blocked_until)
  };
}

function apiKeyRecord(row: Record<string, unknown>, accounts: Record<string, unknown>[], limits: Record<string, unknown>[]): GatewayApiKeyRecord {
  const keyId = row.key_id as string;
  return {
    id: keyId,
    name: row.name as string,
    keyPrefix: row.key_prefix as string,
    keyHash: row.key_hash as string,
    isActive: Boolean(row.is_active),
    trafficClass: row.traffic_class as GatewayTrafficClass,
    allowedModels: (row.allowed_models as string[] | null) ?? [],
    enforcedModel: (row.enforced_model as string | null) ?? null,
    allowedReasoningEfforts: ((row.allowed_reasoning_efforts as string[] | null) ?? []) as GatewayReasoningEffort[],
    enforcedReasoningEffort: (row.enforced_reasoning_effort as GatewayReasoningEffort | null) ?? null,
    accountScopeEnabled: Boolean(row.account_scope_enabled),
    accountIds: accounts.filter((item) => item.key_id === keyId).map((item) => item.account_id as string),
    compressionOverride: (row.compression_override as GatewayCompressionMode | null) ?? null,
    limits: limits.filter((item) => item.key_id === keyId).map((item): GatewayApiKeyLimit => ({
      limitType: item.limit_type as GatewayLimitType,
      limitWindow: item.limit_window as GatewayLimitWindow,
      maxValue: Number(item.max_value),
      currentValue: Number(item.current_value),
      modelFilter: (item.model_filter as string | null) ?? null,
      resetAt: iso(item.reset_at)!
    })),
    expiresAt: iso(row.expires_at),
    lastUsedAt: iso(row.last_used_at),
    createdAt: iso(row.created_at)!
  };
}

function requestLogRecord(row: Record<string, unknown>): GatewayRequestLog {
  return {
    id: String(row.id),
    requestId: row.request_id as string,
    requestedAt: iso(row.requested_at)!,
    provider: row.provider as GatewayProvider,
    accountId: (row.account_id as string | null) ?? null,
    apiKeyId: (row.api_key_id as string | null) ?? null,
    model: row.model as string,
    reasoningEffort: (row.reasoning_effort as string | null) ?? null,
    serviceTier: (row.service_tier as string | null) ?? null,
    transport: (row.transport as string | null) ?? null,
    status: row.status as string,
    errorCode: (row.error_code as string | null) ?? null,
    latencyMs: num(row.latency_ms),
    firstTokenMs: num(row.first_token_ms),
    inputTokens: num(row.input_tokens),
    cachedInputTokens: num(row.cached_input_tokens),
    outputTokens: num(row.output_tokens),
    reasoningTokens: num(row.reasoning_tokens),
    costUsd: num(row.cost_usd),
    compressionTokensSaved: num(row.compression_tokens_saved),
    stickyKind: (row.sticky_kind as string | null) ?? null,
    stickyKeyHash: (row.sticky_key_hash as string | null) ?? null
  };
}

function reportRow(row: Record<string, unknown>): GatewayReportRowInput {
  return {
    key: String(row.key ?? ""), requests: Number(row.requests ?? 0), errors: Number(row.errors ?? 0), inputTokens: Number(row.input_tokens ?? 0),
    cachedInputTokens: Number(row.cached_input_tokens ?? 0), outputTokens: Number(row.output_tokens ?? 0), reasoningTokens: Number(row.reasoning_tokens ?? 0),
    reasoningReported: Number(row.reasoning_reported ?? 0), costUsd: Number(row.cost_usd ?? 0), compressionTokensSaved: Number(row.compression_tokens_saved ?? 0)
  };
}

export class PostgresGatewayRepository implements GatewayRepository {
  constructor(private pool: PgPoolLike) {}
  static fromConnectionString(url: string, max = 4) { return new PostgresGatewayRepository(createSpacePgPool(url, { max })); }

  async getSettings() {
    const row = (await this.pool.query<Record<string, unknown>>(
      `INSERT INTO space_gateway_settings(settings_id) VALUES (1) ON CONFLICT (settings_id) DO UPDATE SET settings_id=1 RETURNING *`)).rows[0]!;
    return settingsRecord(row);
  }

  async updateSettings(patch: GatewaySettingsUpdateRequest) {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as [keyof typeof settingsColumns, unknown][];
    if (entries.length === 0) return this.getSettings();
    const assignments = entries.map(([key], index) => `${settingsColumns[key]}=$${index + 1}`);
    const row = (await this.pool.query<Record<string, unknown>>(
      `UPDATE space_gateway_settings SET ${assignments.join(", ")}, updated_at=now() WHERE settings_id=1 RETURNING *`,
      entries.map(([, value]) => value))).rows[0];
    return row ? settingsRecord(row) : this.getSettings();
  }

  async listAccounts() {
    const rows = (await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM space_gateway_accounts ORDER BY provider, priority, label`)).rows;
    const windows = (await this.pool.query<Record<string, unknown>>(`SELECT * FROM space_gateway_usage_windows`)).rows;
    return rows.map((row) => accountRecord(row, windows));
  }

  async setAccountStatus(accountId: string, status: GatewayAccountStatus, reason: string | null) {
    const row = (await this.pool.query<Record<string, unknown>>(
      `UPDATE space_gateway_accounts SET status=$2, status_reason=$3, updated_at=now() WHERE account_id=$1 RETURNING *`,
      [accountId, status, reason])).rows[0];
    if (!row) return null;
    const windows = (await this.pool.query<Record<string, unknown>>(`SELECT * FROM space_gateway_usage_windows WHERE account_id=$1`, [accountId])).rows;
    return accountRecord(row, windows);
  }

  private async accountById(accountId: string) {
    const row = (await this.pool.query<Record<string, unknown>>(`SELECT * FROM space_gateway_accounts WHERE account_id=$1`, [accountId])).rows[0];
    if (!row) return null;
    const windows = (await this.pool.query<Record<string, unknown>>(`SELECT * FROM space_gateway_usage_windows WHERE account_id=$1`, [accountId])).rows;
    return accountRecord(row, windows);
  }

  async upsertAccount(input: GatewayAccountInsert) {
    const row = (await this.pool.query<Record<string, unknown>>(`INSERT INTO space_gateway_accounts(account_id,provider,label,email,
        external_account_id,plan_type,credentials_encrypted,credentials_expires_at,source,source_ref,last_refresh_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (provider, external_account_id) WHERE external_account_id IS NOT NULL DO UPDATE SET
        email=EXCLUDED.email, plan_type=COALESCE(EXCLUDED.plan_type, space_gateway_accounts.plan_type),
        credentials_encrypted=EXCLUDED.credentials_encrypted, credentials_expires_at=EXCLUDED.credentials_expires_at,
        last_refresh_at=EXCLUDED.last_refresh_at, status=CASE WHEN space_gateway_accounts.status='PAUSED' THEN 'PAUSED' ELSE 'ACTIVE' END,
        status_reason=CASE WHEN space_gateway_accounts.status='PAUSED' THEN space_gateway_accounts.status_reason ELSE NULL END, updated_at=now()
      RETURNING account_id`,
      [input.accountId, input.provider, input.label, input.email, input.externalAccountId, input.planType, input.credentialsEncrypted,
        input.credentialsExpiresAt, input.source, input.sourceRef, input.lastRefreshAt])).rows[0]!;
    return (await this.accountById(row.account_id as string))!;
  }

  async deleteAccount(accountId: string) {
    return (await this.pool.query(`DELETE FROM space_gateway_accounts WHERE account_id=$1 RETURNING account_id`, [accountId])).rows.length === 1;
  }

  async withAccountCredentialLock(accountId: string, update: (current: GatewayAccountRecord) => Promise<GatewayCredentialUpdate | null>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 4920))", [accountId]);
      const row = (await client.query<Record<string, unknown>>(`SELECT * FROM space_gateway_accounts WHERE account_id=$1 FOR UPDATE`, [accountId])).rows[0];
      if (!row) { await client.query("ROLLBACK"); return null; }
      const windows = (await client.query<Record<string, unknown>>(`SELECT * FROM space_gateway_usage_windows WHERE account_id=$1`, [accountId])).rows;
      const change = await update(accountRecord(row, windows));
      if (change) {
        await client.query(`UPDATE space_gateway_accounts SET
            credentials_encrypted=COALESCE($2, credentials_encrypted),
            credentials_expires_at=CASE WHEN $3::boolean THEN $4::timestamptz ELSE credentials_expires_at END,
            last_refresh_at=CASE WHEN $5::boolean THEN $6::timestamptz ELSE last_refresh_at END,
            plan_type=CASE WHEN $7::boolean THEN $8 ELSE plan_type END,
            email=CASE WHEN $9::boolean THEN $10 ELSE email END,
            status=COALESCE($11, status),
            status_reason=CASE WHEN $12::boolean THEN $13 ELSE status_reason END,
            updated_at=now()
          WHERE account_id=$1`,
          [accountId, change.credentialsEncrypted ?? null, change.credentialsExpiresAt !== undefined, change.credentialsExpiresAt ?? null,
            change.lastRefreshAt !== undefined, change.lastRefreshAt ?? null, change.planType !== undefined, change.planType ?? null,
            change.email !== undefined, change.email ?? null, change.status ?? null, change.statusReason !== undefined, change.statusReason ?? null]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      (client as { release?: () => void }).release?.();
    }
    return this.accountById(accountId);
  }

  async saveUsageWindows(accountId: string, windows: GatewayUsageWindowInput[]) {
    for (const window of windows) {
      const quotaKey = window.quotaKey ?? "";
      await this.pool.query(`INSERT INTO space_gateway_usage_windows(account_id,quota_key,usage_window,used_percent,reset_at,window_minutes,recorded_at)
        VALUES ($1,$2,$3,$4,$5,$6,now()) ON CONFLICT (account_id,quota_key,usage_window) DO UPDATE SET used_percent=EXCLUDED.used_percent,
        reset_at=EXCLUDED.reset_at, window_minutes=COALESCE(EXCLUDED.window_minutes, space_gateway_usage_windows.window_minutes), recorded_at=now()`,
        [accountId, quotaKey, window.window, window.usedPercent === null ? null : Math.max(0, Math.min(100, window.usedPercent)), window.resetAt, window.windowMinutes]);
      if (window.usedPercent !== null) {
        await this.pool.query(`INSERT INTO space_gateway_usage_history(account_id,quota_key,usage_window,used_percent,reset_at) VALUES ($1,$2,$3,$4,$5)`,
          [accountId, quotaKey, window.window, Math.max(0, Math.min(100, window.usedPercent)), window.resetAt]);
      }
    }
  }

  async recordAccountState(accountId: string, state: { status: GatewayAccountStatus; statusReason: string | null; blockedUntil: string | null }) {
    // A paused account stays paused: only the operator resumes it.
    await this.pool.query(`UPDATE space_gateway_accounts SET status=$2, status_reason=$3, blocked_until=$4, updated_at=now()
      WHERE account_id=$1 AND status <> 'PAUSED'`, [accountId, state.status, state.statusReason?.slice(0, 500) ?? null, state.blockedUntil]);
  }

  async saveResetCredits(accountId: string, available: number | null) {
    await this.pool.query(`UPDATE space_gateway_accounts SET reset_credits_available=$2 WHERE account_id=$1`, [accountId, available]);
  }

  async touchAccounts(accountIds: string[], usedAt: string) {
    if (accountIds.length === 0) return;
    await this.pool.query(`UPDATE space_gateway_accounts SET last_used_at=GREATEST(COALESCE(last_used_at, $2::timestamptz), $2::timestamptz)
      WHERE account_id = ANY($1)`, [accountIds, usedAt]);
  }

  private async keysWhere(where: string, values: unknown[]) {
    const rows = (await this.pool.query<Record<string, unknown>>(`SELECT * FROM space_gateway_api_keys ${where} ORDER BY created_at DESC`, values)).rows;
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.key_id as string);
    const accounts = (await this.pool.query<Record<string, unknown>>(`SELECT key_id, account_id FROM space_gateway_api_key_accounts WHERE key_id = ANY($1)`, [ids])).rows;
    const limits = (await this.pool.query<Record<string, unknown>>(`SELECT * FROM space_gateway_api_key_limits WHERE key_id = ANY($1) ORDER BY limit_id`, [ids])).rows;
    return rows.map((row) => apiKeyRecord(row, accounts, limits));
  }

  listApiKeys() { return this.keysWhere("", []); }

  async findApiKeyByHash(keyHash: string) {
    return (await this.keysWhere("WHERE key_hash=$1", [keyHash]))[0] ?? null;
  }

  async createApiKey(input: GatewayApiKeyInsert) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO space_gateway_api_keys(key_id,name,key_hash,key_prefix,traffic_class,allowed_models,enforced_model,
          allowed_reasoning_efforts,enforced_reasoning_effort,account_scope_enabled,compression_override,expires_at,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [input.keyId, input.name, input.keyHash, input.keyPrefix, input.trafficClass, input.allowedModels, input.enforcedModel,
          input.allowedReasoningEfforts, input.enforcedReasoningEffort, input.accountIds.length > 0, input.compressionOverride,
          input.expiresAt, input.createdBy]);
      for (const accountId of input.accountIds) {
        await client.query(`INSERT INTO space_gateway_api_key_accounts(key_id,account_id) VALUES ($1,$2)`, [input.keyId, accountId]);
      }
      for (const limit of input.limits) {
        await client.query(`INSERT INTO space_gateway_api_key_limits(key_id,limit_type,limit_window,max_value,model_filter,reset_at)
          VALUES ($1,$2,$3,$4,$5,$6)`, [input.keyId, limit.limitType, limit.limitWindow, limit.maxValue, limit.modelFilter, limit.resetAt]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      (client as { release?: () => void }).release?.();
    }
    return (await this.keysWhere("WHERE key_id=$1", [input.keyId]))[0]!;
  }

  async updateApiKey(keyId: string, patch: { name?: string; isActive?: boolean }) {
    const row = (await this.pool.query<Record<string, unknown>>(`UPDATE space_gateway_api_keys SET name=COALESCE($2,name),
      is_active=COALESCE($3,is_active), updated_at=now() WHERE key_id=$1 RETURNING key_id`, [keyId, patch.name ?? null, patch.isActive ?? null])).rows[0];
    return row ? (await this.keysWhere("WHERE key_id=$1", [keyId]))[0] ?? null : null;
  }

  async deleteApiKey(keyId: string) {
    return (await this.pool.query(`DELETE FROM space_gateway_api_keys WHERE key_id=$1 RETURNING key_id`, [keyId])).rows.length === 1;
  }

  async settleApiKeyUsage(keyId: string, usage: { inputTokens: number; outputTokens: number; costMicros: number; model: string | null; at: string }) {
    await this.pool.query(`UPDATE space_gateway_api_key_limits SET
        current_value = (CASE WHEN reset_at <= $2::timestamptz THEN 0 ELSE current_value END) + (CASE limit_type
          WHEN 'TOTAL_TOKENS' THEN $3::bigint + $4::bigint WHEN 'INPUT_TOKENS' THEN $3::bigint WHEN 'OUTPUT_TOKENS' THEN $4::bigint
          WHEN 'COST_USD' THEN $5::bigint ELSE 0 END),
        reset_at = CASE WHEN reset_at > $2::timestamptz THEN reset_at
          WHEN limit_window = 'DAILY' THEN date_trunc('day', $2::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 day'
          WHEN limit_window = 'WEEKLY' THEN date_trunc('day', $2::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '7 days'
          ELSE date_trunc('month', $2::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 month' END
      WHERE key_id=$1 AND (model_filter IS NULL OR model_filter=$6)`,
      [keyId, usage.at, Math.max(0, Math.round(usage.inputTokens)), Math.max(0, Math.round(usage.outputTokens)), Math.max(0, Math.round(usage.costMicros)), usage.model]);
    await this.pool.query(`UPDATE space_gateway_api_keys SET last_used_at=GREATEST(COALESCE(last_used_at, $2::timestamptz), $2::timestamptz) WHERE key_id=$1`, [keyId, usage.at]);
  }

  async insertRequestLogs(rows: GatewayRequestLogInsert[]) {
    if (rows.length === 0) return;
    const columns = ["request_id", "requested_at", "provider", "account_id", "api_key_id", "model", "plan_type", "reasoning_effort",
      "requested_service_tier", "service_tier", "transport", "upstream_transport", "status", "error_code", "error_message", "latency_ms",
      "first_token_ms", "input_tokens", "cached_input_tokens", "output_tokens", "reasoning_tokens", "cost_usd", "compression_tokens_saved",
      "sticky_key_source", "sticky_kind", "sticky_key_hash"];
    const values: unknown[] = [];
    const tuples = rows.map((row) => {
      const tuple = [row.requestId, row.requestedAt, row.provider, row.accountId, row.apiKeyId, row.model, row.planType ?? null,
        row.reasoningEffort, row.requestedServiceTier ?? null, row.serviceTier, row.transport, row.upstreamTransport ?? null, row.status,
        row.errorCode, row.errorMessage?.slice(0, 1000) ?? null, row.latencyMs, row.firstTokenMs, row.inputTokens, row.cachedInputTokens,
        row.outputTokens, row.reasoningTokens, row.costUsd, row.compressionTokensSaved, row.stickyKeySource ?? null, row.stickyKind,
        row.stickyKeyHash];
      const placeholders = tuple.map((value) => { values.push(value); return `$${values.length}`; });
      return `(${placeholders.join(",")})`;
    });
    await this.pool.query(`INSERT INTO space_gateway_request_logs(${columns.join(",")}) VALUES ${tuples.join(",")}`, values);
    const daily = new Map<string, GatewayRequestLogInsert[]>();
    for (const row of rows) {
      const key = JSON.stringify([row.requestedAt.slice(0, 10), row.provider, row.accountId ?? "", row.apiKeyId ?? "", row.model]);
      daily.set(key, [...(daily.get(key) ?? []), row]);
    }
    for (const [key, group] of daily) {
      const [day, provider, accountId, apiKeyId, model] = JSON.parse(key) as string[];
      const sum = (pick: (row: GatewayRequestLogInsert) => number | null) => group.reduce((total, row) => total + (pick(row) ?? 0), 0);
      await this.pool.query(`INSERT INTO space_gateway_usage_daily(day,provider,account_id,api_key_id,model,requests,errors,input_tokens,
          cached_input_tokens,output_tokens,reasoning_tokens,reasoning_reported,cost_usd,compression_tokens_saved)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (day,provider,account_id,api_key_id,model) DO UPDATE SET requests=space_gateway_usage_daily.requests+EXCLUDED.requests,
          errors=space_gateway_usage_daily.errors+EXCLUDED.errors, input_tokens=space_gateway_usage_daily.input_tokens+EXCLUDED.input_tokens,
          cached_input_tokens=space_gateway_usage_daily.cached_input_tokens+EXCLUDED.cached_input_tokens,
          output_tokens=space_gateway_usage_daily.output_tokens+EXCLUDED.output_tokens,
          reasoning_tokens=space_gateway_usage_daily.reasoning_tokens+EXCLUDED.reasoning_tokens,
          reasoning_reported=space_gateway_usage_daily.reasoning_reported+EXCLUDED.reasoning_reported,
          cost_usd=space_gateway_usage_daily.cost_usd+EXCLUDED.cost_usd,
          compression_tokens_saved=space_gateway_usage_daily.compression_tokens_saved+EXCLUDED.compression_tokens_saved`,
        [day, provider, accountId, apiKeyId, model, group.length, group.filter((row) => row.status !== "success").length,
          sum((row) => row.inputTokens), sum((row) => row.cachedInputTokens), sum((row) => row.outputTokens), sum((row) => row.reasoningTokens),
          group.filter((row) => row.reasoningTokens !== null).length, sum((row) => row.costUsd), sum((row) => row.compressionTokensSaved)]);
    }
  }

  async listRequestLogs(query: { limit: number; beforeId?: number | null; accountId?: string | null; apiKeyId?: string | null }) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (query.beforeId) { values.push(query.beforeId); conditions.push(`id < $${values.length}`); }
    if (query.accountId) { values.push(query.accountId); conditions.push(`account_id = $${values.length}`); }
    if (query.apiKeyId) { values.push(query.apiKeyId); conditions.push(`api_key_id = $${values.length}`); }
    values.push(Math.max(1, Math.min(query.limit, 500)));
    const rows = (await this.pool.query<Record<string, unknown>>(`SELECT * FROM space_gateway_request_logs
      ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY id DESC LIMIT $${values.length}`, values)).rows;
    return rows.map(requestLogRecord);
  }

  async usageSince(since: string) {
    const row = (await this.pool.query<Record<string, unknown>>(`SELECT count(*) AS requests,
        count(*) FILTER (WHERE status <> 'success') AS errors, COALESCE(sum(input_tokens),0) AS input_tokens,
        COALESCE(sum(output_tokens),0) AS output_tokens, COALESCE(sum(cost_usd),0) AS cost_usd,
        COALESCE(sum(compression_tokens_saved),0) AS compression_tokens_saved
      FROM space_gateway_request_logs WHERE requested_at >= $1`, [since])).rows[0]!;
    return {
      requests: Number(row.requests), errors: Number(row.errors), inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens), costUsd: Number(row.cost_usd), compressionTokensSaved: Number(row.compression_tokens_saved)
    };
  }

  async requestStatsSince(since: string) {
    const totals = (await this.pool.query<Record<string, unknown>>(`SELECT count(*) AS total,
        count(*) FILTER (WHERE status <> 'success') AS failed,
        count(*) FILTER (WHERE error_code IN ('rate_limit_exceeded','usage_limit_reached','rate_limit_error')) AS rate_limited,
        COALESCE(sum(input_tokens),0) AS input_tokens, COALESCE(sum(cached_input_tokens),0) AS cached_input_tokens,
        COALESCE(sum(output_tokens),0) AS output_tokens, COALESCE(sum(compression_tokens_saved),0) AS compression_tokens_saved,
        count(latency_ms) AS latency_count, COALESCE(avg(latency_ms),0) AS latency_avg, COALESCE(min(latency_ms),0) AS latency_min, COALESCE(max(latency_ms),0) AS latency_max,
        count(first_token_ms) AS ttfb_count, COALESCE(avg(first_token_ms),0) AS ttfb_avg, COALESCE(min(first_token_ms),0) AS ttfb_min, COALESCE(max(first_token_ms),0) AS ttfb_max
      FROM space_gateway_request_logs WHERE requested_at >= $1`, [since])).rows[0]!;
    const counts = async (column: "provider" | "model") => Object.fromEntries((await this.pool.query<Record<string, unknown>>(
      `SELECT ${column} AS key, count(*) AS n FROM space_gateway_request_logs WHERE requested_at >= $1 GROUP BY 1 ORDER BY 1`, [since])).rows
      .map((row) => [String(row.key), Number(row.n)]));
    const round = (value: unknown) => Math.round(Number(value) * 100) / 100;
    return {
      total: Number(totals.total), failed: Number(totals.failed), rateLimited: Number(totals.rate_limited),
      byProvider: await counts("provider"), byModel: await counts("model"),
      inputTokens: Number(totals.input_tokens), cachedInputTokens: Number(totals.cached_input_tokens), outputTokens: Number(totals.output_tokens),
      compressionTokensSaved: Number(totals.compression_tokens_saved),
      latency: { count: Number(totals.latency_count), averageMs: round(totals.latency_avg), minMs: Number(totals.latency_min), maxMs: Number(totals.latency_max) },
      ttfb: { count: Number(totals.ttfb_count), averageMs: round(totals.ttfb_avg), minMs: Number(totals.ttfb_min), maxMs: Number(totals.ttfb_max) }
    };
  }

  async usageReport(from: string, to: string) {
    const group = async (expression: string) => (await this.pool.query<Record<string, unknown>>(`SELECT ${expression} AS key,
        sum(requests) AS requests, sum(errors) AS errors, sum(input_tokens) AS input_tokens, sum(cached_input_tokens) AS cached_input_tokens,
        sum(output_tokens) AS output_tokens, sum(reasoning_tokens) AS reasoning_tokens, sum(reasoning_reported) AS reasoning_reported,
        sum(cost_usd) AS cost_usd, sum(compression_tokens_saved) AS compression_tokens_saved
      FROM space_gateway_usage_daily WHERE day BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 1`, [from, to])).rows.map(reportRow);
    return { days: await group("to_char(day, 'YYYY-MM-DD')"), models: await group("model"), accounts: await group("account_id") };
  }

  async recordCompression(rows: GatewayCompressionRow[]) {
    for (const row of rows) {
      await this.pool.query(`INSERT INTO space_gateway_compression_rollups(hour,mode,provider,strategy,requests,modified_requests,blocks,
          rejected_blocks,error_blocks,timed_out,original_tokens,compressed_tokens,overhead_ms,max_overhead_ms)
        VALUES (date_trunc('hour', $1::timestamptz),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (hour,mode,provider,strategy) DO UPDATE SET requests=space_gateway_compression_rollups.requests+EXCLUDED.requests,
          modified_requests=space_gateway_compression_rollups.modified_requests+EXCLUDED.modified_requests,
          blocks=space_gateway_compression_rollups.blocks+EXCLUDED.blocks,
          rejected_blocks=space_gateway_compression_rollups.rejected_blocks+EXCLUDED.rejected_blocks,
          error_blocks=space_gateway_compression_rollups.error_blocks+EXCLUDED.error_blocks,
          timed_out=space_gateway_compression_rollups.timed_out+EXCLUDED.timed_out,
          original_tokens=space_gateway_compression_rollups.original_tokens+EXCLUDED.original_tokens,
          compressed_tokens=space_gateway_compression_rollups.compressed_tokens+EXCLUDED.compressed_tokens,
          overhead_ms=space_gateway_compression_rollups.overhead_ms+EXCLUDED.overhead_ms,
          max_overhead_ms=GREATEST(space_gateway_compression_rollups.max_overhead_ms, EXCLUDED.max_overhead_ms)`,
        [row.hour, row.mode, row.provider, row.strategy, row.requests, row.modifiedRequests, row.blocks, row.rejectedBlocks, row.errorBlocks,
          row.timedOut, row.originalTokens, row.compressedTokens, row.overheadMs, row.maxOverheadMs]);
    }
  }

  async compressionSince(since: string) {
    const rows = (await this.pool.query<Record<string, unknown>>(`SELECT * FROM space_gateway_compression_rollups WHERE hour >= date_trunc('hour', $1::timestamptz)
      ORDER BY hour, mode, provider, strategy`, [since])).rows;
    return rows.map((row): GatewayCompressionRow => ({
      hour: iso(row.hour)!, mode: row.mode as "SHADOW" | "ON", provider: String(row.provider), strategy: String(row.strategy),
      requests: Number(row.requests), modifiedRequests: Number(row.modified_requests), blocks: Number(row.blocks), rejectedBlocks: Number(row.rejected_blocks),
      errorBlocks: Number(row.error_blocks), timedOut: Number(row.timed_out), originalTokens: Number(row.original_tokens),
      compressedTokens: Number(row.compressed_tokens), overheadMs: Number(row.overhead_ms), maxOverheadMs: Number(row.max_overhead_ms)
    }));
  }

  async pruneRequestLogs(before: string, batchSize = 5000) {
    let removed = 0;
    for (;;) {
      const count = (await this.pool.query(`DELETE FROM space_gateway_request_logs WHERE id IN
        (SELECT id FROM space_gateway_request_logs WHERE requested_at < $1 ORDER BY id LIMIT $2)`, [before, batchSize])).rowCount ?? 0;
      removed += count;
      if (count < batchSize) return removed;
    }
  }

  async saveStickyBindings(rows: GatewayStickyBinding[]) {
    if (rows.length === 0) return;
    await this.pool.query(`INSERT INTO space_gateway_sticky_bindings(key_hash, kind, provider, account_id, expires_at)
      SELECT b.key_hash, b.kind, b.provider, b.account_id, b.expires_at
      FROM jsonb_to_recordset($1::jsonb) AS b(key_hash text, kind text, provider text, account_id text, expires_at timestamptz)
      WHERE EXISTS (SELECT 1 FROM space_gateway_accounts a WHERE a.account_id = b.account_id)
      ON CONFLICT (key_hash) DO UPDATE SET kind = EXCLUDED.kind, provider = EXCLUDED.provider, account_id = EXCLUDED.account_id,
        expires_at = EXCLUDED.expires_at, updated_at = now()`,
    [JSON.stringify(rows.map((row) => ({ key_hash: row.keyHash, kind: row.kind, provider: row.provider, account_id: row.accountId, expires_at: row.expiresAt })))]);
  }

  async findStickyBinding(keyHash: string, nowIso: string) {
    const row = (await this.pool.query<Record<string, unknown>>(`SELECT key_hash, kind, provider, account_id, expires_at FROM space_gateway_sticky_bindings
      WHERE key_hash = $1 AND (expires_at IS NULL OR expires_at > $2)`, [keyHash, nowIso])).rows[0];
    return row ? { keyHash: String(row.key_hash), kind: row.kind as GatewayStickyKind, provider: row.provider as GatewayProvider,
      accountId: String(row.account_id), expiresAt: iso(row.expires_at) } : null;
  }

  async pruneStickyBindings(nowIso: string) {
    return (await this.pool.query("DELETE FROM space_gateway_sticky_bindings WHERE expires_at IS NOT NULL AND expires_at <= $1", [nowIso])).rowCount ?? 0;
  }

  async dispose() { await (this.pool as PgPoolLike & { end?: () => Promise<void> }).end?.(); }
}

/** In-memory twin for tests and demo mode. */
export class InMemoryGatewayRepository implements GatewayRepository {
  settings: GatewaySettings = { ...defaultGatewaySettings, planPriority: [...defaultGatewaySettings.planPriority], updatedAt: new Date(0).toISOString() };
  accounts: GatewayAccountRecord[] = [];
  keys: GatewayApiKeyRecord[] = [];
  logs: GatewayRequestLog[] = [];
  private nextLogId = 1;

  async getSettings() { return { ...this.settings, planPriority: [...this.settings.planPriority] }; }
  async updateSettings(patch: GatewaySettingsUpdateRequest) {
    const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    this.settings = { ...this.settings, ...defined, updatedAt: new Date().toISOString() };
    return this.getSettings();
  }
  async listAccounts() { return this.accounts.map((account) => ({ ...account })); }
  async setAccountStatus(accountId: string, status: GatewayAccountStatus, reason: string | null) {
    const account = this.accounts.find((item) => item.id === accountId);
    if (!account) return null;
    account.status = status;
    account.statusReason = reason;
    return { ...account };
  }
  private locks = new Map<string, Promise<unknown>>();
  async upsertAccount(input: GatewayAccountInsert) {
    const existing = input.externalAccountId
      ? this.accounts.find((account) => account.provider === input.provider && account.externalAccountId === input.externalAccountId) : undefined;
    if (existing) {
      Object.assign(existing, {
        email: input.email, planType: input.planType ?? existing.planType, credentialsEncrypted: input.credentialsEncrypted,
        credentialsExpiresAt: input.credentialsExpiresAt, lastRefreshAt: input.lastRefreshAt,
        status: existing.status === "PAUSED" ? "PAUSED" : "ACTIVE", statusReason: existing.status === "PAUSED" ? existing.statusReason : null
      });
      return { ...existing };
    }
    const record: GatewayAccountRecord = {
      id: input.accountId, provider: input.provider, label: input.label, email: input.email, planType: input.planType, status: "ACTIVE",
      statusReason: null, priority: 100, warmupEnabled: false, resetCreditsAvailable: null, primaryWindow: { ...emptyWindow }, secondaryWindow: { ...emptyWindow },
      lastRefreshAt: input.lastRefreshAt, lastUsedAt: null, createdAt: new Date().toISOString(), externalAccountId: input.externalAccountId,
      credentialsEncrypted: input.credentialsEncrypted, credentialsExpiresAt: input.credentialsExpiresAt, source: input.source,
      sourceRef: input.sourceRef, blockedUntil: null
    };
    this.accounts.push(record);
    return { ...record };
  }
  async deleteAccount(accountId: string) {
    const before = this.accounts.length;
    this.accounts = this.accounts.filter((account) => account.id !== accountId);
    for (const [key, binding] of this.sticky) if (binding.accountId === accountId) this.sticky.delete(key);
    return this.accounts.length < before;
  }
  async withAccountCredentialLock(accountId: string, update: (current: GatewayAccountRecord) => Promise<GatewayCredentialUpdate | null>) {
    const previous = this.locks.get(accountId) ?? Promise.resolve();
    const run = previous.then(async () => {
      const account = this.accounts.find((item) => item.id === accountId);
      if (!account) return null;
      const change = await update({ ...account });
      if (change) {
        const defined = Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined));
        Object.assign(account, defined);
      }
      return { ...account };
    });
    this.locks.set(accountId, run.catch(() => undefined));
    return run;
  }
  async saveUsageWindows(accountId: string, windows: GatewayUsageWindowInput[]) {
    const account = this.accounts.find((item) => item.id === accountId);
    if (!account) return;
    for (const window of windows) {
      const target = window.window === "PRIMARY" ? "primaryWindow" : "secondaryWindow";
      const quotaKey = window.quotaKey ?? "";
      if (quotaKey !== "") {
        const groups = account.quotaGroups ?? [];
        let group = groups.find((item) => item.key === quotaKey);
        if (!group) {
          group = { key: quotaKey, primaryWindow: { ...emptyWindow }, secondaryWindow: { ...emptyWindow } };
          groups.push(group);
          groups.sort((a, b) => a.key.localeCompare(b.key));
        }
        group[target] = { usedPercent: window.usedPercent, resetAt: window.resetAt, windowMinutes: window.windowMinutes ?? group[target].windowMinutes };
        account.quotaGroups = groups;
        continue;
      }
      account[target] = { usedPercent: window.usedPercent, resetAt: window.resetAt, windowMinutes: window.windowMinutes ?? account[target].windowMinutes };
    }
  }
  async recordAccountState(accountId: string, state: { status: GatewayAccountStatus; statusReason: string | null; blockedUntil: string | null }) {
    const account = this.accounts.find((item) => item.id === accountId);
    if (!account || account.status === "PAUSED") return;
    account.status = state.status;
    account.statusReason = state.statusReason;
    account.blockedUntil = state.blockedUntil;
  }
  async touchAccounts(accountIds: string[], usedAt: string) {
    for (const account of this.accounts) if (accountIds.includes(account.id)) account.lastUsedAt = usedAt;
  }
  async saveResetCredits(accountId: string, available: number | null) {
    const account = this.accounts.find((item) => item.id === accountId);
    if (account) account.resetCreditsAvailable = available;
  }
  async listApiKeys() { return this.keys.map((key) => ({ ...key })); }
  async findApiKeyByHash(keyHash: string) { const key = this.keys.find((item) => item.keyHash === keyHash); return key ? { ...key } : null; }
  async createApiKey(input: GatewayApiKeyInsert) {
    if (this.keys.some((key) => key.keyHash === input.keyHash)) throw new Error("duplicate key hash");
    const record: GatewayApiKeyRecord = {
      id: input.keyId, name: input.name, keyPrefix: input.keyPrefix, keyHash: input.keyHash, isActive: true, trafficClass: input.trafficClass,
      allowedModels: [...input.allowedModels], enforcedModel: input.enforcedModel, allowedReasoningEfforts: [...input.allowedReasoningEfforts],
      enforcedReasoningEffort: input.enforcedReasoningEffort, accountScopeEnabled: input.accountIds.length > 0, accountIds: [...input.accountIds],
      compressionOverride: input.compressionOverride,
      limits: input.limits.map((limit) => ({ ...limit, currentValue: 0 })),
      expiresAt: input.expiresAt, lastUsedAt: null, createdAt: new Date().toISOString()
    };
    this.keys.unshift(record);
    return { ...record };
  }
  async updateApiKey(keyId: string, patch: { name?: string; isActive?: boolean }) {
    const key = this.keys.find((item) => item.id === keyId);
    if (!key) return null;
    if (patch.name !== undefined) key.name = patch.name;
    if (patch.isActive !== undefined) key.isActive = patch.isActive;
    return { ...key };
  }
  async deleteApiKey(keyId: string) {
    const before = this.keys.length;
    this.keys = this.keys.filter((key) => key.id !== keyId);
    return this.keys.length < before;
  }
  async settleApiKeyUsage(keyId: string, usage: { inputTokens: number; outputTokens: number; costMicros: number; model: string | null; at: string }) {
    const key = this.keys.find((item) => item.id === keyId);
    if (!key) return;
    for (const limit of key.limits) {
      if (limit.modelFilter !== null && limit.modelFilter !== usage.model) continue;
      const delta = limit.limitType === "TOTAL_TOKENS" ? usage.inputTokens + usage.outputTokens : limit.limitType === "INPUT_TOKENS" ? usage.inputTokens
        : limit.limitType === "OUTPUT_TOKENS" ? usage.outputTokens : usage.costMicros;
      if (limit.resetAt <= usage.at) {
        limit.currentValue = 0;
        const next = new Date(usage.at);
        next.setUTCHours(0, 0, 0, 0);
        if (limit.limitWindow === "DAILY") next.setUTCDate(next.getUTCDate() + 1);
        else if (limit.limitWindow === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
        else next.setUTCMonth(next.getUTCMonth() + 1, 1);
        limit.resetAt = next.toISOString();
      }
      limit.currentValue += Math.max(0, Math.round(delta));
    }
    key.lastUsedAt = usage.at;
  }
  async insertRequestLogs(rows: GatewayRequestLogInsert[]) {
    for (const row of rows) {
      this.logs.unshift({
        id: String(this.nextLogId++), requestId: row.requestId, requestedAt: row.requestedAt, provider: row.provider, accountId: row.accountId,
        apiKeyId: row.apiKeyId, model: row.model, reasoningEffort: row.reasoningEffort, serviceTier: row.serviceTier, transport: row.transport,
        status: row.status, errorCode: row.errorCode, latencyMs: row.latencyMs, firstTokenMs: row.firstTokenMs, inputTokens: row.inputTokens,
        cachedInputTokens: row.cachedInputTokens, outputTokens: row.outputTokens, reasoningTokens: row.reasoningTokens, costUsd: row.costUsd,
        compressionTokensSaved: row.compressionTokensSaved, stickyKind: row.stickyKind, stickyKeyHash: row.stickyKeyHash
      });
    }
  }
  async listRequestLogs(query: { limit: number; beforeId?: number | null; accountId?: string | null; apiKeyId?: string | null }) {
    return this.logs
      .filter((log) => !query.beforeId || Number(log.id) < query.beforeId)
      .filter((log) => !query.accountId || log.accountId === query.accountId)
      .filter((log) => !query.apiKeyId || log.apiKeyId === query.apiKeyId)
      .slice(0, Math.max(1, Math.min(query.limit, 500)));
  }
  async usageSince(since: string) {
    const recent = this.logs.filter((log) => log.requestedAt >= since);
    const sum = (pick: (log: GatewayRequestLog) => number | null) => recent.reduce((total, log) => total + (pick(log) ?? 0), 0);
    return {
      requests: recent.length, errors: recent.filter((log) => log.status !== "success").length, inputTokens: sum((log) => log.inputTokens),
      outputTokens: sum((log) => log.outputTokens), costUsd: sum((log) => log.costUsd), compressionTokensSaved: sum((log) => log.compressionTokensSaved)
    };
  }
  async requestStatsSince(since: string) {
    const recent = this.logs.filter((log) => log.requestedAt >= since);
    const sum = (pick: (log: GatewayRequestLog) => number | null) => recent.reduce((total, log) => total + (pick(log) ?? 0), 0);
    const counts = (pick: (log: GatewayRequestLog) => string) => {
      const map: Record<string, number> = {};
      for (const log of recent) map[pick(log)] = (map[pick(log)] ?? 0) + 1;
      return map;
    };
    const timing = (pick: (log: GatewayRequestLog) => number | null) => {
      const values = recent.map(pick).filter((value): value is number => value !== null);
      return values.length === 0 ? { count: 0, averageMs: 0, minMs: 0, maxMs: 0 }
        : { count: values.length, averageMs: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
          minMs: Math.min(...values), maxMs: Math.max(...values) };
    };
    return {
      total: recent.length, failed: recent.filter((log) => log.status !== "success").length,
      rateLimited: recent.filter((log) => ["rate_limit_exceeded", "usage_limit_reached", "rate_limit_error"].includes(log.errorCode ?? "")).length,
      byProvider: counts((log) => log.provider), byModel: counts((log) => log.model),
      inputTokens: sum((log) => log.inputTokens), cachedInputTokens: sum((log) => log.cachedInputTokens), outputTokens: sum((log) => log.outputTokens),
      compressionTokensSaved: sum((log) => log.compressionTokensSaved), latency: timing((log) => log.latencyMs), ttfb: timing((log) => log.firstTokenMs)
    };
  }
  async usageReport(from: string, to: string) {
    const rows = this.logs.filter((log) => log.requestedAt.slice(0, 10) >= from && log.requestedAt.slice(0, 10) <= to);
    const group = (keyOf: (log: GatewayRequestLog) => string) => {
      const map = new Map<string, GatewayReportRowInput>();
      for (const log of rows) {
        const key = keyOf(log);
        const row = map.get(key) ?? { key, requests: 0, errors: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, reasoningReported: 0, costUsd: 0, compressionTokensSaved: 0 };
        row.requests += 1;
        if (log.status !== "success") row.errors += 1;
        row.inputTokens += log.inputTokens ?? 0;
        row.cachedInputTokens += log.cachedInputTokens ?? 0;
        row.outputTokens += log.outputTokens ?? 0;
        row.reasoningTokens += log.reasoningTokens ?? 0;
        if (log.reasoningTokens !== null) row.reasoningReported += 1;
        row.costUsd += log.costUsd ?? 0;
        row.compressionTokensSaved += log.compressionTokensSaved ?? 0;
        map.set(key, row);
      }
      return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
    };
    return { days: group((log) => log.requestedAt.slice(0, 10)), models: group((log) => log.model), accounts: group((log) => log.accountId ?? "") };
  }
  compression: GatewayCompressionRow[] = [];
  async recordCompression(rows: GatewayCompressionRow[]) {
    for (const row of rows) {
      const hour = new Date(row.hour);
      hour.setUTCMinutes(0, 0, 0);
      const key = { ...row, hour: hour.toISOString() };
      const existing = this.compression.find((item) => item.hour === key.hour && item.mode === key.mode && item.provider === key.provider && item.strategy === key.strategy);
      if (!existing) { this.compression.push(key); continue; }
      for (const field of ["requests", "modifiedRequests", "blocks", "rejectedBlocks", "errorBlocks", "timedOut", "originalTokens", "compressedTokens", "overheadMs"] as const) {
        existing[field] += key[field];
      }
      existing.maxOverheadMs = Math.max(existing.maxOverheadMs, key.maxOverheadMs);
    }
  }
  async compressionSince(since: string) {
    const from = new Date(since);
    from.setUTCMinutes(0, 0, 0);
    return this.compression.filter((row) => row.hour >= from.toISOString()).map((row) => ({ ...row }))
      .sort((a, b) => a.hour.localeCompare(b.hour) || a.mode.localeCompare(b.mode) || a.strategy.localeCompare(b.strategy));
  }
  async pruneRequestLogs(before: string) {
    const kept = this.logs.filter((log) => log.requestedAt >= before);
    const removed = this.logs.length - kept.length;
    this.logs = kept;
    return removed;
  }
  sticky = new Map<string, GatewayStickyBinding>();
  async saveStickyBindings(rows: GatewayStickyBinding[]) {
    for (const row of rows) if (this.accounts.some((account) => account.id === row.accountId)) this.sticky.set(row.keyHash, { ...row });
  }
  async findStickyBinding(keyHash: string, nowIso: string) {
    const row = this.sticky.get(keyHash);
    return row && (row.expiresAt === null || row.expiresAt > nowIso) ? { ...row } : null;
  }
  async pruneStickyBindings(nowIso: string) {
    let removed = 0;
    for (const [key, row] of this.sticky) if (row.expiresAt !== null && row.expiresAt <= nowIso) { this.sticky.delete(key); removed += 1; }
    return removed;
  }
  async dispose() {}
}

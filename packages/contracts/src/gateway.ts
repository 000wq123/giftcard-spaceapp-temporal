import { z } from "zod";

/**
 * Space Gateway: the native TypeScript account load balancer (codex-lb rewrite) with built-in context
 * compression (Headroom rewrite). These schemas are the admin view; credentials never appear in them.
 */

export const gatewayProviderSchema = z.enum([
  "CODEX", "CLAUDE", "ANTIGRAVITY", "COPILOT", "OPENAI_API", "ANTHROPIC_API", "DEEPSEEK", "OPENROUTER", "GOOGLE_AI", "KIMI", "QWEN"
]);

/** Same states as codex-lb accounts. */
export const gatewayAccountStatusSchema = z.enum(["ACTIVE", "RATE_LIMITED", "QUOTA_EXCEEDED", "PAUSED", "REAUTH_REQUIRED", "DEACTIVATED"]);

export const gatewayRoutingStrategySchema = z.enum([
  "CAPACITY_WEIGHTED", "RELATIVE_AVAILABILITY", "USAGE_WEIGHTED", "ROUND_ROBIN", "FILL_FIRST", "SEQUENTIAL_DRAIN", "RESET_DRAIN", "SINGLE_ACCOUNT"
]);

export const gatewayTrafficClassSchema = z.enum(["INTERACTIVE", "BACKGROUND", "TRANSLATION"]);
export const gatewayCompressionModeSchema = z.enum(["OFF", "SHADOW", "ON"]);
export const gatewayCompressionProfileSchema = z.enum(["CACHE", "TOKEN"]);
export const gatewayLimitTypeSchema = z.enum(["TOTAL_TOKENS", "INPUT_TOKENS", "OUTPUT_TOKENS", "COST_USD"]);
export const gatewayLimitWindowSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);
export const gatewayReasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

const isoSchema = z.string().max(40);
const gatewayIdSchema = z.string().regex(/^gw_[a-z]+:[a-f0-9]{32}$/);

export const gatewayUsageWindowSchema = z.object({
  usedPercent: z.number().min(0).max(100).nullable(),
  resetAt: isoSchema.nullable(),
  windowMinutes: z.number().int().min(1).max(60 * 24 * 31).nullable()
}).strict();

export const gatewayAccountSchema = z.object({
  id: gatewayIdSchema,
  provider: gatewayProviderSchema,
  label: z.string().min(1).max(120),
  email: z.string().max(320).nullable(),
  planType: z.string().max(40).nullable(),
  status: gatewayAccountStatusSchema,
  statusReason: z.string().max(500).nullable(),
  priority: z.number().int().min(0).max(1000),
  warmupEnabled: z.boolean(),
  resetCreditsAvailable: z.number().int().min(0).nullable(),
  primaryWindow: gatewayUsageWindowSchema,
  secondaryWindow: gatewayUsageWindowSchema,
  /** Separate quotas inside one account (Antigravity: Gemini models and Claude/GPT models). */
  quotaGroups: z.array(z.object({
    key: z.string().min(1).max(80),
    primaryWindow: gatewayUsageWindowSchema,
    secondaryWindow: gatewayUsageWindowSchema
  }).strict()).max(10).optional(),
  lastRefreshAt: isoSchema.nullable(),
  lastUsedAt: isoSchema.nullable(),
  createdAt: isoSchema
}).strict();

export const gatewayApiKeyLimitSchema = z.object({
  limitType: gatewayLimitTypeSchema,
  limitWindow: gatewayLimitWindowSchema,
  maxValue: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  currentValue: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  modelFilter: z.string().max(120).nullable(),
  resetAt: isoSchema
}).strict();

export const gatewayApiKeySchema = z.object({
  id: gatewayIdSchema,
  name: z.string().min(1).max(120),
  keyPrefix: z.string().min(4).max(20),
  isActive: z.boolean(),
  trafficClass: gatewayTrafficClassSchema,
  allowedModels: z.array(z.string().min(1).max(120)).max(100),
  enforcedModel: z.string().max(120).nullable(),
  allowedReasoningEfforts: z.array(gatewayReasoningEffortSchema).max(8),
  enforcedReasoningEffort: gatewayReasoningEffortSchema.nullable(),
  accountScopeEnabled: z.boolean(),
  accountIds: z.array(gatewayIdSchema).max(500),
  compressionOverride: gatewayCompressionModeSchema.nullable(),
  limits: z.array(gatewayApiKeyLimitSchema).max(20),
  expiresAt: isoSchema.nullable(),
  lastUsedAt: isoSchema.nullable(),
  createdAt: isoSchema
}).strict();

export const gatewayApiKeyCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trafficClass: gatewayTrafficClassSchema.default("INTERACTIVE"),
  allowedModels: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  enforcedModel: z.string().trim().min(1).max(120).nullable().default(null),
  allowedReasoningEfforts: z.array(gatewayReasoningEffortSchema).max(8).default([]),
  enforcedReasoningEffort: gatewayReasoningEffortSchema.nullable().default(null),
  accountIds: z.array(gatewayIdSchema).max(500).default([]),
  compressionOverride: gatewayCompressionModeSchema.nullable().default(null),
  limits: z.array(z.object({
    limitType: gatewayLimitTypeSchema,
    limitWindow: gatewayLimitWindowSchema,
    maxValue: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    modelFilter: z.string().trim().min(1).max(120).nullable().default(null)
  }).strict()).max(20).default([]),
  expiresAt: isoSchema.nullable().default(null)
}).strict();

export const gatewayApiKeyUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional()
}).strict().refine((input) => Object.keys(input).length > 0, { message: "Nothing to update." });

/** The plain key is returned exactly once, at creation. */
export const gatewayApiKeyCreatedResponseSchema = z.object({
  key: gatewayApiKeySchema,
  plainKey: z.string().regex(/^sk-sgw-[A-Za-z0-9_-]{32,64}$/)
}).strict();

export const gatewaySettingsSchema = z.object({
  routingStrategy: gatewayRoutingStrategySchema,
  stickyThreadsEnabled: z.boolean(),
  preferEarlierReset: z.boolean(),
  planPriority: z.array(z.string().min(1).max(40)).max(20),
  stickyReallocationBudgetThresholdPercent: z.number().min(0).max(100),
  exhaustionFloorPercent: z.number().min(0).max(50),
  compressionMode: gatewayCompressionModeSchema,
  compressionProfile: gatewayCompressionProfileSchema,
  compressionTimeBudgetMs: z.number().int().min(10).max(5000),
  requestLogRetentionDays: z.number().int().min(1).max(365),
  updatedAt: isoSchema
}).strict();

export const gatewaySettingsUpdateRequestSchema = gatewaySettingsSchema.omit({ updatedAt: true }).partial().strict()
  .refine((input) => Object.keys(input).length > 0, { message: "Nothing to update." });

export const gatewayRequestLogSchema = z.object({
  id: z.string().max(80),
  requestId: z.string().max(120),
  requestedAt: isoSchema,
  provider: gatewayProviderSchema,
  accountId: gatewayIdSchema.nullable(),
  apiKeyId: gatewayIdSchema.nullable(),
  model: z.string().max(160),
  reasoningEffort: z.string().max(20).nullable(),
  serviceTier: z.string().max(40).nullable(),
  transport: z.string().max(40).nullable(),
  status: z.string().max(40),
  errorCode: z.string().max(120).nullable(),
  latencyMs: z.number().int().min(0).nullable(),
  firstTokenMs: z.number().int().min(0).nullable(),
  inputTokens: z.number().int().min(0).nullable(),
  cachedInputTokens: z.number().int().min(0).nullable(),
  outputTokens: z.number().int().min(0).nullable(),
  reasoningTokens: z.number().int().min(0).nullable(),
  costUsd: z.number().min(0).nullable(),
  compressionTokensSaved: z.number().int().min(0).nullable(),
  stickyKind: z.string().max(40).nullable(),
  stickyKeyHash: z.string().max(16).nullable()
}).strict();

export const gatewayRequestLogListSchema = z.object({
  data: z.array(gatewayRequestLogSchema).max(500),
  nextCursor: z.string().max(200).nullable()
}).strict();

export const gatewayServiceStateSchema = z.enum(["RUNNING", "DRAINING", "UNREACHABLE", "NOT_INSTALLED"]);

export const gatewayStatusSchema = z.object({
  service: z.object({
    state: gatewayServiceStateSchema,
    version: z.string().max(80).nullable(),
    startedAt: isoSchema.nullable(),
    inFlightRequests: z.number().int().min(0).nullable(),
    listen: z.string().max(120).nullable(),
    error: z.string().max(500).nullable()
  }).strict(),
  accounts: z.object({
    total: z.number().int().min(0),
    active: z.number().int().min(0),
    byProvider: z.array(z.object({ provider: gatewayProviderSchema, total: z.number().int().min(0), active: z.number().int().min(0) }).strict()).max(20)
  }).strict(),
  apiKeys: z.object({ total: z.number().int().min(0), active: z.number().int().min(0) }).strict(),
  last24h: z.object({
    requests: z.number().int().min(0),
    errors: z.number().int().min(0),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    costUsd: z.number().min(0),
    compressionTokensSaved: z.number().int().min(0)
  }).strict(),
  settings: gatewaySettingsSchema,
  checkedAt: isoSchema
}).strict();

export const gatewayReportRowSchema = z.object({
  key: z.string().max(200),
  requests: z.number().int().min(0),
  errors: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  reasoningTokens: z.number().int().min(0),
  reasoningReported: z.number().int().min(0),
  costUsd: z.number().min(0),
  compressionTokensSaved: z.number().int().min(0)
}).strict();

export const gatewayReportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.array(gatewayReportRowSchema).max(400),
  models: z.array(gatewayReportRowSchema).max(500),
  accounts: z.array(gatewayReportRowSchema).max(1000),
  totals: gatewayReportRowSchema
}).strict();

const gatewayCompressionTotalsSchema = z.object({
  requests: z.number().int().min(0),
  modifiedRequests: z.number().int().min(0),
  blocks: z.number().int().min(0),
  rejectedBlocks: z.number().int().min(0),
  errorBlocks: z.number().int().min(0),
  timedOut: z.number().int().min(0),
  originalTokens: z.number().int().min(0),
  compressedTokens: z.number().int().min(0),
  tokensSaved: z.number().int().min(0),
  savingsPercent: z.number().min(0).max(100),
  averageOverheadMs: z.number().min(0),
  maxOverheadMs: z.number().min(0)
}).strict();

/** Compression statistics (Headroom-equivalent) over a window, for applied (ON) and measured-only (SHADOW) traffic. */
export const gatewayCompressionStatsSchema = z.object({
  hours: z.number().int().min(1).max(24 * 90),
  applied: gatewayCompressionTotalsSchema,
  shadow: gatewayCompressionTotalsSchema,
  byStrategy: z.array(z.object({ mode: z.enum(["SHADOW", "ON"]), strategy: z.string().max(40), blocks: z.number().int().min(0),
    rejectedBlocks: z.number().int().min(0), errorBlocks: z.number().int().min(0), tokensSaved: z.number().int().min(0),
    savingsPercent: z.number().min(0).max(100) }).strict()).max(40),
  history: z.array(z.object({ hour: isoSchema, appliedSaved: z.number().int().min(0), shadowSaved: z.number().int().min(0),
    requests: z.number().int().min(0) }).strict()).max(24 * 90)
}).strict();

export const gatewayAccountListSchema = z.object({ data: z.array(gatewayAccountSchema).max(1000) }).strict();
export const gatewayApiKeyListSchema = z.object({ data: z.array(gatewayApiKeySchema).max(1000) }).strict();

export type GatewayProvider = z.infer<typeof gatewayProviderSchema>;
export type GatewayAccountStatus = z.infer<typeof gatewayAccountStatusSchema>;
export type GatewayRoutingStrategy = z.infer<typeof gatewayRoutingStrategySchema>;
export type GatewayTrafficClass = z.infer<typeof gatewayTrafficClassSchema>;
export type GatewayCompressionMode = z.infer<typeof gatewayCompressionModeSchema>;
export type GatewayCompressionProfile = z.infer<typeof gatewayCompressionProfileSchema>;
export type GatewayLimitType = z.infer<typeof gatewayLimitTypeSchema>;
export type GatewayLimitWindow = z.infer<typeof gatewayLimitWindowSchema>;
export type GatewayReasoningEffort = z.infer<typeof gatewayReasoningEffortSchema>;
export type GatewayUsageWindow = z.infer<typeof gatewayUsageWindowSchema>;
export type GatewayAccount = z.infer<typeof gatewayAccountSchema>;
export type GatewayApiKeyLimit = z.infer<typeof gatewayApiKeyLimitSchema>;
export type GatewayApiKey = z.infer<typeof gatewayApiKeySchema>;
export type GatewayApiKeyCreateRequest = z.infer<typeof gatewayApiKeyCreateRequestSchema>;
export type GatewayApiKeyUpdateRequest = z.infer<typeof gatewayApiKeyUpdateRequestSchema>;
export type GatewayApiKeyCreatedResponse = z.infer<typeof gatewayApiKeyCreatedResponseSchema>;
export type GatewaySettings = z.infer<typeof gatewaySettingsSchema>;
export type GatewaySettingsUpdateRequest = z.infer<typeof gatewaySettingsUpdateRequestSchema>;
export type GatewayRequestLog = z.infer<typeof gatewayRequestLogSchema>;
export type GatewayRequestLogList = z.infer<typeof gatewayRequestLogListSchema>;
export type GatewayServiceState = z.infer<typeof gatewayServiceStateSchema>;
export type GatewayStatus = z.infer<typeof gatewayStatusSchema>;
export type GatewayAccountList = z.infer<typeof gatewayAccountListSchema>;
export type GatewayApiKeyList = z.infer<typeof gatewayApiKeyListSchema>;
export type GatewayReportRow = z.infer<typeof gatewayReportRowSchema>;
export type GatewayReport = z.infer<typeof gatewayReportSchema>;
export type GatewayCompressionStats = z.infer<typeof gatewayCompressionStatsSchema>;

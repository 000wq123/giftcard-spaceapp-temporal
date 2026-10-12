import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewaySettings } from "@space/contracts";
import type { GatewayAccountRecord, GatewayCompressionRow, GatewayRequestLogInsert } from "@space/db";
import type { AccountPool } from "../../accounts/account-pool.js";
import { compressAnthropicBodyAsync, type AsyncBlockRunner, type CompressionCache } from "../../compression/engine.js";
import { compressionRows } from "../../compression/recorder.js";
import { gatewayError, gatewayErrors, type GatewayErrorEnvelope } from "../../errors.js";
import { checkKeyLimits, PolicyRejection } from "../../policy.js";
import { claudeCostUsd } from "../../pricing/pricing.js";
import { StickyStore } from "../../accounts/sticky-store.js";
import { hashKey, header, readBounded } from "../../proxy-util.js";
import type { RequestLogWriter } from "../../request-log-writer.js";
import { permanentFailureCodes, selectAccount, USAGE_LIMIT_REACHED, type UpstreamError } from "../../router/balancer.js";
import type { GatewayRouteHelpers } from "../../server.js";
import { buildClaudeUpstreamHeaders, CLAUDE_API_BASE_URL } from "./headers.js";
import { ClaudeStreamInspector, claudeResponseUsage, readClaudeRateLimitHeaders, type ClaudeUsageTokens } from "./stream.js";

/**
 * Anthropic Messages proxy (`/v1/messages`, `/v1/messages/count_tokens`) over pooled Claude subscription accounts:
 * pick an account, swap in its token, stream the reply through, and move to another account when a failure
 * happens before any content reached the client. A conversation stays on one account while it can, because the
 * prompt cache belongs to the account.
 */
const FIVE_HOURS_MINUTES = 300;
const WEEK_MINUTES = 7 * 24 * 60;

export interface ClaudeProxyOptions {
  pool: AccountPool;
  logs: RequestLogWriter;
  settings: () => Promise<GatewaySettings>;
  upstreamBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  maxAccountAttempts?: number;
  preOutputBufferBytes?: number;
  compression?: { run: AsyncBlockRunner; cache?: CompressionCache; record: (rows: GatewayCompressionRow[]) => Promise<void> };
  settleKeyUsage?: (keyId: string, usage: { inputTokens: number; outputTokens: number; costMicros: number; model: string | null; at: string }) => Promise<void>;
  /** Session affinity for the prompt cache; without it bindings live in memory only. */
  sticky?: StickyStore;
}

type FailureKind = "rate_limit" | "transient" | "permanent" | "surface";

interface UpstreamFailure {
  kind: FailureKind;
  status: number;
  code: string;
  message: string;
  error: UpstreamError;
  body: string | null;
}

function parseClaudeError(text: string, status: number, headers: Headers | null): UpstreamFailure {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
  const error = (payload.error && typeof payload.error === "object" ? payload.error : {}) as Record<string, unknown>;
  const code = typeof error.type === "string" ? error.type : status >= 500 ? "api_error" : `http_${status}`;
  const message = typeof error.message === "string" ? error.message : text.slice(0, 300) || `Upstream returned HTTP ${status}`;
  const limits = headers ? readClaudeRateLimitHeaders(headers) : null;
  const retryAfter = Number(headers?.get("retry-after") ?? Number.NaN);
  const upstreamError: UpstreamError = {
    message,
    resetsAt: limits?.rejected && limits.resetAt !== null ? limits.resetAt : undefined,
    resetsInSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
  };
  let kind: FailureKind;
  if (status === 429 || code === "rate_limit_error") kind = "rate_limit";
  else if (status === 401 || code === "authentication_error") kind = "permanent";
  else if (status >= 500 || code === "overloaded_error" || code === "api_error") kind = "transient";
  else kind = "surface";
  return { kind, status, code, message, error: upstreamError, body: text || null };
}

/** Claude Code sends a session id header; older clients carry the session in `metadata.user_id`. */
function stickySource(request: FastifyRequest, body: Record<string, unknown>): { source: string; raw: string } | null {
  const session = header(request, "x-claude-code-session-id");
  if (session) return { source: "x-claude-code-session-id", raw: session };
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : null;
  const userId = typeof metadata?.user_id === "string" ? metadata.user_id : null;
  if (!userId) return null;
  const sessionPart = /session_([0-9a-f-]{8,})/i.exec(userId)?.[1];
  return { source: "metadata.user_id", raw: sessionPart ?? userId };
}

/** Anthropic clients read `{ type: "error", error: { type, message } }`. */
function anthropicError(envelope: GatewayErrorEnvelope) {
  return { type: "error", error: { type: envelope.error.type, message: envelope.error.message, code: envelope.error.code } };
}

function totalInput(usage: ClaudeUsageTokens): number | null {
  if (usage.inputTokens === null) return null;
  return usage.inputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0);
}

export function registerClaudeProxyRoutes(app: FastifyInstance, helpers: GatewayRouteHelpers, options: ClaudeProxyOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const baseUrl = (options.upstreamBaseUrl ?? CLAUDE_API_BASE_URL).replace(/\/+$/, "");
  const maxAttempts = options.maxAccountAttempts ?? 3;
  const bufferLimit = options.preOutputBufferBytes ?? 4 * 1024 * 1024;
  /** conversation key hash -> account, so the prompt cache keeps hitting. */
  const stickyAccounts = options.sticky ?? new StickyStore({ provider: "CLAUDE", kind: "PROMPT_CACHE" });

  const queryOf = (request: FastifyRequest) => {
    const index = request.url.indexOf("?");
    return index >= 0 ? request.url.slice(index) : "";
  };

  async function pickAccount(settings: GatewaySettings, scope: Set<string> | null, tried: Set<string>, stickyHash: string | null) {
    const accounts = (await options.pool.accounts()).filter((account) => (!scope || scope.has(account.id)) && !tried.has(account.id));
    const states = accounts.map((candidate) => options.pool.toBalancerState(candidate));
    const stickyId = stickyHash ? await stickyAccounts.get(stickyHash) : undefined;
    const stickyState = stickyId ? states.find((state) => state.accountId === stickyId) : undefined;
    if (stickyState) {
      const check = selectAccount([stickyState], { now: now() / 1000, routingStrategy: "SINGLE_ACCOUNT", allowUsageExhaustionError: false });
      const used = Math.max(stickyState.usedPercent ?? 0, stickyState.secondaryUsedPercent ?? 0);
      if (check.account && used < settings.stickyReallocationBudgetThresholdPercent) {
        return { account: accounts.find((candidate) => candidate.id === stickyState.accountId), result: null };
      }
    }
    const result = selectAccount(states, { now: now() / 1000, routingStrategy: settings.routingStrategy, preferEarlierReset: settings.preferEarlierReset });
    for (const state of states) options.pool.absorb(state);
    return { account: result.account ? accounts.find((candidate) => candidate.id === result.account!.accountId) : undefined, result };
  }

  async function messages(request: FastifyRequest, reply: FastifyReply) {
    if (!(await helpers.authenticate(request, reply))) return reply;
    const key = request.gatewayApiKey!;
    const startedAt = now();
    const requestId = header(request, "x-request-id") ?? `req_${randomUUID().replace(/-/g, "")}`;
    const input = request.body;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return reply.code(400).send(anthropicError(gatewayError("invalid_request", "The request body must be a JSON object.", "invalid_request_error")));
    }
    const body: Record<string, unknown> = { ...(input as Record<string, unknown>) };
    if (key.enforcedModel) body.model = key.enforcedModel;
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
    try {
      if (key.allowedModels.length > 0 && model !== null && !key.allowedModels.includes(model)) {
        throw new PolicyRejection(403, gatewayError("model_not_allowed", `This API key does not have access to model '${model}'`, "invalid_request_error"));
      }
      checkKeyLimits(key, model, new Date(startedAt).toISOString());
    } catch (error) {
      if (error instanceof PolicyRejection) return reply.code(error.statusCode).send(anthropicError(error.envelope));
      throw error;
    }

    const settings = await options.settings();
    const compressionMode = header(request, "x-space-gateway-compression")?.toLowerCase() === "off" ? "OFF" : key.compressionOverride ?? settings.compressionMode;
    let compressionSaved: number | null = null;
    let outgoing = body;
    if (compressionMode !== "OFF" && options.compression) {
      try {
        const outcome = await compressAnthropicBodyAsync(body, { run: options.compression.run, cache: options.compression.cache,
          timeBudgetMs: settings.compressionTimeBudgetMs });
        if (compressionMode === "ON" && outcome.modified) {
          outgoing = outcome.body;
          compressionSaved = outcome.tokensBefore - outcome.tokensAfter;
        }
        void options.compression.record(compressionRows(outcome, { at: new Date(startedAt).toISOString(), mode: compressionMode, provider: "CLAUDE" }))
          .catch(() => undefined);
      } catch {
        // Compression never blocks a request: the original body goes upstream.
      }
    }
    const upstreamBody = JSON.stringify(outgoing);
    const sticky = stickySource(request, body);
    const stickyHash = sticky ? hashKey(`claude:${sticky.raw}`) : null;
    const scope = key.accountScopeEnabled ? new Set(key.accountIds) : null;
    const tried = new Set<string>();
    const controller = new AbortController();
    request.raw.once("close", () => { if (!reply.raw.writableEnded) controller.abort(); });
    const upstreamUrl = `${baseUrl}/v1/messages${queryOf(request)}`;

    const baseLog = (): Omit<GatewayRequestLogInsert, "status" | "errorCode" | "errorMessage"> => ({
      requestId, requestedAt: new Date(startedAt).toISOString(), provider: "CLAUDE", accountId: null, apiKeyId: key.id,
      model: model ?? "unknown", reasoningEffort: null, requestedServiceTier: null, serviceTier: null, transport: "http", upstreamTransport: "http",
      latencyMs: null, firstTokenMs: null, inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, costUsd: null,
      compressionTokensSaved: null, stickyKeySource: sticky?.source ?? null, stickyKind: stickyHash ? "PROMPT_CACHE" : null,
      stickyKeyHash: stickyHash ? stickyHash.slice(0, 16) : null
    });

    let lastFailure: UpstreamFailure | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { account, result } = await pickAccount(settings, scope, tried, stickyHash);
      if (!account) {
        if (attempt === 0 && result) {
          const status = result.errorCode === USAGE_LIMIT_REACHED ? 429 : 503;
          options.logs.add({ ...baseLog(), status: "error", errorCode: result.errorCode ?? "no_accounts", errorMessage: result.errorMessage, latencyMs: now() - startedAt });
          return reply.code(status).send(anthropicError(gatewayError(result.errorCode ?? "no_accounts",
            result.errorMessage ?? gatewayErrors.noAccounts().error.message, status === 429 ? "rate_limit_error" : "api_error")));
        }
        break;
      }
      tried.add(account.id);
      options.pool.markSelected(account.id);

      let credentials;
      try {
        credentials = await options.pool.credentials(account);
      } catch (error) {
        lastFailure = { kind: "permanent", status: 401, code: String((error as { code?: unknown }).code ?? "credential_error"),
          message: error instanceof Error ? error.message : "Account credentials are unavailable.", error: {}, body: null };
        continue;
      }

      let upstream: Response;
      try {
        upstream = await fetchImpl(upstreamUrl, {
          method: "POST", body: upstreamBody, signal: controller.signal,
          headers: buildClaudeUpstreamHeaders(request.headers, credentials.accessToken, body.stream === true ? "text/event-stream" : "application/json")
        });
      } catch (error) {
        if (controller.signal.aborted) return reply;
        options.pool.markTransientError(account.id);
        lastFailure = { kind: "transient", status: 502, code: "upstream_unavailable", message: error instanceof Error ? error.message : "Upstream unavailable",
          error: {}, body: null };
        continue;
      }

      const passive = readClaudeRateLimitHeaders(upstream.headers);
      void options.pool.recordUsage(account.id, {
        primaryUsedPercent: passive.fiveHourUsedPercent, secondaryUsedPercent: passive.weeklyUsedPercent,
        primaryResetAt: passive.fiveHourResetAt, secondaryResetAt: passive.weeklyResetAt,
        primaryWindowMinutes: FIVE_HOURS_MINUTES, secondaryWindowMinutes: WEEK_MINUTES
      }).catch(() => undefined);

      if (!upstream.ok) {
        const failure = parseClaudeError(await readBounded(upstream), upstream.status, upstream.headers);
        lastFailure = failure;
        if (failure.kind === "surface") break;
        await recordFailure(account, failure);
        continue;
      }

      const upstreamRequestId = upstream.headers.get("request-id");
      if (!(upstream.headers.get("content-type") ?? "").includes("text/event-stream")) {
        const text = await upstream.text();
        let parsed: unknown = null;
        try { parsed = JSON.parse(text); } catch { /* passed through as is */ }
        const usage = claudeResponseUsage(parsed);
        const responseModel = parsed && typeof (parsed as { model?: unknown }).model === "string" ? (parsed as { model: string }).model : model;
        finish(account, usage, responseModel, null, null);
        if (stickyHash) stickyAccounts.set(stickyHash, account.id);
        void options.pool.markSuccess(account.id).catch(() => undefined);
        reply.code(upstream.status).header("content-type", upstream.headers.get("content-type") ?? "application/json").header("x-request-id", requestId);
        if (upstreamRequestId) reply.header("request-id", upstreamRequestId);
        return reply.send(text);
      }

      // Stream: hold the start of the reply until content begins, so a failure before that can still move accounts.
      const reader = upstream.body!.getReader();
      const inspector = new ClaudeStreamInspector();
      const held: Uint8Array[] = [];
      let heldBytes = 0;
      let committed = false;
      let firstTokenAt: number | null = null;
      const commit = () => {
        committed = true;
        reply.hijack();
        reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-request-id": requestId,
          "x-accel-buffering": "no", ...(upstreamRequestId ? { "request-id": upstreamRequestId } : {}) });
        for (const chunk of held) reply.raw.write(chunk);
        held.length = 0;
      };
      let movedOn = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const startedOutput = inspector.push(value);
          if (startedOutput && firstTokenAt === null) firstTokenAt = now();
          if (committed) { reply.raw.write(value); continue; }
          held.push(value);
          heldBytes += value.byteLength;
          if (inspector.status === "failed" && !inspector.outputStarted) {
            const failure = parseClaudeError(JSON.stringify({ error: { type: inspector.errorType, message: inspector.errorMessage } }), 200, null);
            if (failure.kind !== "surface" && attempt + 1 < maxAttempts) {
              await reader.cancel().catch(() => undefined);
              lastFailure = failure;
              await recordFailure(account, failure);
              movedOn = true;
              break;
            }
          }
          if (inspector.outputStarted || heldBytes > bufferLimit) commit();
        }
      } catch (error) {
        if (controller.signal.aborted) {
          finish(account, inspector.usage, inspector.model ?? model, firstTokenAt, "client_closed");
          return reply;
        }
        if (!committed) {
          options.pool.markTransientError(account.id);
          lastFailure = { kind: "transient", status: 502, code: "stream_incomplete", message: error instanceof Error ? error.message : "Stream interrupted", error: {}, body: null };
          continue;
        }
        reply.raw.end();
        finish(account, inspector.usage, inspector.model ?? model, firstTokenAt, "stream_incomplete");
        return reply;
      }
      if (movedOn) continue;
      if (!committed) commit();
      reply.raw.end();
      const failed = inspector.status === "failed" ? inspector.errorType ?? "api_error" : inspector.status === "unterminated" ? "stream_incomplete" : null;
      finish(account, inspector.usage, inspector.model ?? model, firstTokenAt, failed, inspector.errorMessage);
      if (stickyHash) stickyAccounts.set(stickyHash, account.id);
      if (!failed) void options.pool.markSuccess(account.id).catch(() => undefined);
      return reply;
    }

    // Every attempt failed before any content reached the client.
    const failure = lastFailure ?? { kind: "transient" as const, status: 503, code: "no_accounts", message: gatewayErrors.noAccounts().error.message, error: {}, body: null };
    options.logs.add({ ...baseLog(), status: "error", errorCode: failure.code, errorMessage: failure.message, latencyMs: now() - startedAt });
    if (failure.kind === "surface" && failure.body) {
      return reply.code(failure.status).header("content-type", "application/json").header("x-request-id", requestId).send(failure.body);
    }
    const status = failure.kind === "rate_limit" ? 429 : failure.status >= 400 ? failure.status : 502;
    return reply.code(status).header("x-request-id", requestId).send(anthropicError(gatewayError(failure.code, failure.message,
      status === 429 ? "rate_limit_error" : "api_error")));

    async function recordFailure(account: GatewayAccountRecord, failure: UpstreamFailure) {
      if (failure.kind === "rate_limit") await options.pool.markRateLimited(account, failure.error);
      else if (failure.kind === "permanent") await options.pool.markPermanentFailure(account, failure.code in permanentFailureCodes ? failure.code : "token_invalidated");
      else options.pool.markTransientError(account.id);
    }

    function finish(account: GatewayAccountRecord, usage: ClaudeUsageTokens, responseModel: string | null, firstTokenAt: number | null,
      errorCode: string | null, errorMessage: string | null = null) {
      const cost = claudeCostUsd(usage, responseModel);
      const inputTokens = totalInput(usage);
      if (inputTokens !== null && options.settleKeyUsage) {
        void options.settleKeyUsage(key.id, {
          inputTokens, outputTokens: usage.outputTokens ?? 0, costMicros: Math.round((cost ?? 0) * 1e6), model: responseModel, at: new Date(startedAt).toISOString()
        }).catch(() => undefined);
      }
      options.logs.add({
        ...baseLog(), accountId: account.id, planType: account.planType, model: responseModel ?? "unknown", status: errorCode ? "error" : "success",
        errorCode, errorMessage: errorCode ? errorMessage : null, latencyMs: now() - startedAt,
        firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt, inputTokens, cachedInputTokens: usage.cacheReadInputTokens,
        outputTokens: usage.outputTokens, costUsd: cost, compressionTokensSaved: compressionSaved
      });
      void options.pool.touch(account.id, new Date(startedAt).toISOString()).catch(() => undefined);
    }
  }

  /** Token counting costs no quota; any usable account answers it. */
  async function countTokens(request: FastifyRequest, reply: FastifyReply) {
    if (!(await helpers.authenticate(request, reply))) return reply;
    const key = request.gatewayApiKey!;
    const scope = key.accountScopeEnabled ? new Set(key.accountIds) : null;
    const accounts = (await options.pool.accounts()).filter((account) => (!scope || scope.has(account.id))
      && account.status !== "PAUSED" && account.status !== "DEACTIVATED" && account.status !== "REAUTH_REQUIRED");
    const body = request.body && typeof request.body === "object" ? { ...(request.body as Record<string, unknown>) } : {};
    if (key.enforcedModel) body.model = key.enforcedModel;
    for (const account of accounts.slice(0, 2)) {
      try {
        const credentials = await options.pool.credentials(account);
        const upstream = await fetchImpl(`${baseUrl}/v1/messages/count_tokens${queryOf(request)}`, {
          method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
          headers: buildClaudeUpstreamHeaders(request.headers, credentials.accessToken)
        });
        if (upstream.status >= 500) continue;
        return reply.code(upstream.status).header("content-type", upstream.headers.get("content-type") ?? "application/json").send(await upstream.text());
      } catch {
        // Try the next account.
      }
    }
    return reply.code(503).send(anthropicError(gatewayError("no_accounts", gatewayErrors.noAccounts().error.message, "api_error")));
  }

  /** Anthropic model list (`GET /v1/models` from Anthropic clients), from any usable account. */
  async function models(request: FastifyRequest, reply: FastifyReply) {
    if (!(await helpers.authenticate(request, reply))) return reply;
    const accounts = (await options.pool.accounts()).filter((account) => account.status !== "PAUSED" && account.status !== "DEACTIVATED"
      && account.status !== "REAUTH_REQUIRED");
    for (const account of accounts.slice(0, 2)) {
      try {
        const credentials = await options.pool.credentials(account);
        const upstream = await fetchImpl(`${baseUrl}/v1/models${queryOf(request)}`, {
          method: "GET", signal: AbortSignal.timeout(15_000), headers: buildClaudeUpstreamHeaders(request.headers, credentials.accessToken)
        });
        if (upstream.status >= 500) continue;
        return reply.code(upstream.status).header("content-type", upstream.headers.get("content-type") ?? "application/json").send(await upstream.text());
      } catch {
        // Try the next account.
      }
    }
    return reply.code(503).send(anthropicError(gatewayError("no_accounts", gatewayErrors.noAccounts().error.message, "api_error")));
  }

  app.post("/v1/messages", messages);
  app.post("/v1/messages/count_tokens", countTokens);
  return { models };
}

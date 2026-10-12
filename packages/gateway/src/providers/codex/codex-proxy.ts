import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewaySettings } from "@space/contracts";
import type { GatewayAccountRecord, GatewayCompressionRow, GatewayRequestLogInsert } from "@space/db";
import type { AccountPool } from "../../accounts/account-pool.js";
import { gatewayError, gatewayErrors } from "../../errors.js";
import { applyRequestPolicy, checkKeyLimits, PolicyRejection, type PolicyResult } from "../../policy.js";
import { compressResponsesBodyAsync, type AsyncBlockRunner, type CompressionCache } from "../../compression/engine.js";
import { compressionRows } from "../../compression/recorder.js";
import { costUsd } from "../../pricing/pricing.js";
import { StickyStore } from "../../accounts/sticky-store.js";
import { hashKey, header, readBounded } from "../../proxy-util.js";
import type { RequestLogWriter } from "../../request-log-writer.js";
import { selectAccount, USAGE_LIMIT_REACHED, permanentFailureCodes, type UpstreamError } from "../../router/balancer.js";
import type { GatewayRouteHelpers } from "../../server.js";
import { ChatRequestError, ChatStreamTranslator, chatToResponses, responseToChatCompletion } from "./chat.js";
import { buildCodexUpstreamHeaders } from "./headers.js";
import type { CodexModelPlans } from "./model-plans.js";
import { readCodexRateLimitHeaders, readResponseUsage, ResponseStreamInspector } from "./stream.js";
import { CODEX_UPSTREAM_BASE_URL } from "./usage.js";

/**
 * Codex Responses proxy (`/backend-api/codex/responses`, `/v1/responses`), after codex-lb's proxy service
 * (MIT, Soju06/codex-lb): pick an account, swap in its credentials, stream the reply through, and move to another
 * account when a failure happens before the client has seen any output.
 */
const rateLimitCodes = new Set(["rate_limit_exceeded", USAGE_LIMIT_REACHED]);
const quotaCodes = new Set(["insufficient_quota", "usage_not_included", "quota_exceeded"]);
const transientCodes = new Set(["server_error", "upstream_error", "stream_incomplete", "overloaded_error", "server_is_overloaded"]);
const usageLimitMessage = /usage limit|you've hit your limit|purchase more credits/i;

export interface CodexProxyOptions {
  pool: AccountPool;
  logs: RequestLogWriter;
  settings: () => Promise<GatewaySettings>;
  upstreamBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  maxAccountAttempts?: number;
  preOutputBufferBytes?: number;
  /** Context compression (the Headroom rewrite); absent means requests are never compressed. */
  compression?: { run: AsyncBlockRunner; cache?: CompressionCache; record: (rows: GatewayCompressionRow[]) => Promise<void> };
  /** Conversation affinity; without it bindings live in memory only. */
  sticky?: { threads: StickyStore; continuations: StickyStore };
  /** Which plans offer which models; without it every account may serve every model. */
  modelPlans?: CodexModelPlans;
  /** Counts a finished request against the key's limits. */
  settleKeyUsage?: (keyId: string, usage: { inputTokens: number; outputTokens: number; costMicros: number; model: string | null; at: string }) => Promise<void>;
}

type FailureKind = "rate_limit" | "quota" | "transient" | "permanent" | "surface";

interface UpstreamFailure {
  kind: FailureKind;
  status: number;
  code: string;
  message: string;
  error: UpstreamError;
  body: string | null;
}

function classify(code: string, message: string, status: number): FailureKind {
  if (code in permanentFailureCodes) return "permanent";
  if (rateLimitCodes.has(code)) return "rate_limit";
  if (quotaCodes.has(code)) return "quota";
  if (usageLimitMessage.test(message)) return "rate_limit";
  if (transientCodes.has(code) || status >= 500 || /selected model is at capacity/i.test(message)) return "transient";
  if (status === 429) return "transient";
  if (status === 401) return "permanent";
  return "surface";
}

function parseUpstreamError(text: string, status: number): UpstreamFailure {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
  const error = (payload.error && typeof payload.error === "object" ? payload.error : payload) as Record<string, unknown>;
  const code = String(error.code ?? error.type ?? (status === 401 ? "token_invalidated" : status >= 500 ? "upstream_error" : `http_${status}`));
  const message = typeof error.message === "string" ? error.message : text.slice(0, 300) || `Upstream returned HTTP ${status}`;
  const resetsAt = typeof error.resets_at === "number" ? error.resets_at : undefined;
  const resetsInSeconds = typeof error.resets_in_seconds === "number" ? error.resets_in_seconds : undefined;
  return { kind: classify(code, message, status), status, code, message, error: { message, resetsAt, resetsInSeconds }, body: text || null };
}

export function registerCodexProxyRoutes(app: FastifyInstance, helpers: GatewayRouteHelpers, options: CodexProxyOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const upstreamUrl = `${(options.upstreamBaseUrl ?? CODEX_UPSTREAM_BASE_URL).replace(/\/+$/, "")}/codex/responses`;
  const maxAttempts = options.maxAccountAttempts ?? 3;
  const bufferLimit = options.preOutputBufferBytes ?? 4 * 1024 * 1024;
  /** previous_response_id hash -> owning account (hard continuation affinity). */
  const responseOwners = options.sticky?.continuations ?? new StickyStore({ provider: "CODEX", kind: "CONTINUATION" });
  /** prompt cache / session key hash -> account (soft sticky threads). */
  const stickyAccounts = options.sticky?.threads ?? new StickyStore({ provider: "CODEX", kind: "STICKY_THREAD" });

  /**
   * The account for one attempt: the continuation owner when there is one, else the sticky thread's account while
   * it has budget, else the routing strategy's pick. `none` explains an empty pool.
   */
  async function pickAccount(settings: GatewaySettings, scope: Set<string> | null, tried: Set<string>, stickyHash: string | null,
    ownerAccountId: string | null, model: string | null): Promise<{ account?: GatewayAccountRecord; none?: { errorCode: string | null; errorMessage: string | null } }> {
    const inScope = (await options.pool.accounts()).filter((account) => (!scope || scope.has(account.id)) && !tried.has(account.id));
    if (ownerAccountId) return { account: inScope.find((candidate) => candidate.id === ownerAccountId) };
    const accounts = options.modelPlans ? options.modelPlans.eligible(inScope, model) : inScope;
    if (accounts.length === 0 && inScope.length > 0) {
      return { none: { errorCode: "no_plan_support_for_model", errorMessage: `No accounts with a plan supporting model '${model}'` } };
    }
    const states = accounts.map((candidate) => options.pool.toBalancerState(candidate));
    const stickyId = stickyHash && settings.stickyThreadsEnabled ? await stickyAccounts.get(stickyHash) : undefined;
    const stickyState = stickyId ? states.find((state) => state.accountId === stickyId) : undefined;
    if (stickyState) {
      const check = selectAccount([stickyState], { now: now() / 1000, routingStrategy: "SINGLE_ACCOUNT", allowUsageExhaustionError: false });
      const used = Math.max(stickyState.usedPercent ?? 0, stickyState.secondaryUsedPercent ?? 0);
      if (check.account && used < settings.stickyReallocationBudgetThresholdPercent) {
        return { account: accounts.find((candidate) => candidate.id === stickyState.accountId) };
      }
    }
    const result = selectAccount(states, {
      now: now() / 1000, routingStrategy: settings.routingStrategy, planPriority: settings.planPriority, preferEarlierReset: settings.preferEarlierReset
    });
    for (const state of states) options.pool.absorb(state);
    if (!result.account) return { none: { errorCode: result.errorCode ?? null, errorMessage: result.errorMessage ?? null } };
    return { account: accounts.find((candidate) => candidate.id === result.account!.accountId) };
  }

  async function handle(request: FastifyRequest, reply: FastifyReply, dialect: "responses" | "chat") {
    if (!(await helpers.authenticate(request, reply))) return reply;
    const key = request.gatewayApiKey!;
    const startedAt = now();
    const requestId = header(request, "x-request-id") ?? `req_${randomUUID().replace(/-/g, "")}`;
    const input = request.body;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return reply.code(400).send(gatewayError("invalid_request", "The request body must be a JSON object.", "invalid_request_error"));
    }
    let policy: PolicyResult;
    const chatBody = dialect === "chat" ? input as Record<string, unknown> : null;
    try {
      const responsesBody = chatBody ? chatToResponses(chatBody) : input as Record<string, unknown>;
      policy = applyRequestPolicy(responsesBody, key);
      checkKeyLimits(key, policy.model, new Date(startedAt).toISOString());
    } catch (error) {
      if (error instanceof PolicyRejection) return reply.code(error.statusCode).send(error.envelope);
      if (error instanceof ChatRequestError) return reply.code(400).send(gatewayError("invalid_request", error.message, "invalid_request_error"));
      throw error;
    }
    const clientStreams = chatBody ? chatBody.stream === true : policy.body.stream === true;
    const includeUsage = Boolean((chatBody?.stream_options as { include_usage?: unknown } | undefined)?.include_usage);
    const settings = await options.settings();
    const compressionMode = header(request, "x-space-gateway-compression")?.toLowerCase() === "off" ? "OFF" : key.compressionOverride ?? settings.compressionMode;
    let compressionSaved: number | null = null;
    let outgoing = policy.body;
    if (compressionMode !== "OFF" && options.compression) {
      try {
        const outcome = await compressResponsesBodyAsync(policy.body, { run: options.compression.run, cache: options.compression.cache,
          timeBudgetMs: settings.compressionTimeBudgetMs });
        if (compressionMode === "ON" && outcome.modified) {
          outgoing = outcome.body;
          compressionSaved = outcome.tokensBefore - outcome.tokensAfter;
        }
        void options.compression.record(compressionRows(outcome, { at: new Date(startedAt).toISOString(), mode: compressionMode, provider: "CODEX" }))
          .catch(() => undefined);
      } catch {
        // Compression never blocks a request: the original body goes upstream.
      }
    }
    const upstreamBody = JSON.stringify({ ...outgoing, stream: true });
    const previousResponseId = typeof policy.body.previous_response_id === "string" ? policy.body.previous_response_id : null;
    const ownerAccountId = previousResponseId ? await responseOwners.get(hashKey(`codex-response:${previousResponseId}`)) ?? null : null;
    const stickySource = typeof policy.body.prompt_cache_key === "string" ? "prompt_cache_key"
      : header(request, "session_id") ? "session_id" : header(request, "x-codex-session-id") ? "x-codex-session-id" : null;
    const stickyRaw = stickySource === "prompt_cache_key" ? String(policy.body.prompt_cache_key) : stickySource ? header(request, stickySource) : null;
    const stickyHash = stickyRaw ? hashKey(`codex:${stickyRaw}`) : null;
    const scope = key.accountScopeEnabled ? new Set(key.accountIds) : null;
    const tried = new Set<string>();
    const controller = new AbortController();
    request.raw.once("close", () => { if (!reply.raw.writableEnded) controller.abort(); });

    const baseLog = (): Omit<GatewayRequestLogInsert, "status" | "errorCode" | "errorMessage"> => ({
      requestId, requestedAt: new Date(startedAt).toISOString(), provider: "CODEX", accountId: null, apiKeyId: key.id,
      model: policy.model ?? "unknown", reasoningEffort: policy.reasoningEffort, requestedServiceTier: policy.requestedServiceTier,
      serviceTier: policy.serviceTier, transport: "http", upstreamTransport: "http", latencyMs: null, firstTokenMs: null, inputTokens: null,
      cachedInputTokens: null, outputTokens: null, reasoningTokens: null, costUsd: null, compressionTokensSaved: null,
      stickyKeySource: stickySource, stickyKind: ownerAccountId ? "CONTINUATION" : stickyHash ? "STICKY_THREAD" : null,
      stickyKeyHash: stickyHash ? stickyHash.slice(0, 16) : null
    });

    let lastFailure: UpstreamFailure | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { account, none } = await pickAccount(settings, scope, tried, stickyHash, ownerAccountId, policy.model);
      if (!account) {
        if (attempt === 0 && none) {
          const status = none.errorCode === USAGE_LIMIT_REACHED ? 429 : 503;
          options.logs.add({ ...baseLog(), status: "error", errorCode: none.errorCode ?? "no_accounts", errorMessage: none.errorMessage, latencyMs: now() - startedAt });
          return reply.code(status).send(gatewayError(none.errorCode ?? "no_accounts", none.errorMessage ?? gatewayErrors.noAccounts().error.message,
            status === 429 ? "rate_limit_error" : "server_error"));
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
        if (ownerAccountId) break;
        continue;
      }

      let upstream: Response;
      try {
        upstream = await fetchImpl(upstreamUrl, {
          method: "POST", body: upstreamBody, signal: controller.signal,
          headers: buildCodexUpstreamHeaders(request.headers, credentials.accessToken, credentials.upstreamAccountId)
        });
      } catch (error) {
        if (controller.signal.aborted) return reply;
        options.pool.markTransientError(account.id);
        lastFailure = { kind: "transient", status: 502, code: "upstream_unavailable", message: error instanceof Error ? error.message : "Upstream unavailable",
          error: {}, body: null };
        if (ownerAccountId) break;
        continue;
      }

      const passive = readCodexRateLimitHeaders(upstream.headers);
      const nowSeconds = now() / 1000;
      void options.pool.recordUsage(account.id, {
        primaryUsedPercent: passive.primaryUsedPercent, secondaryUsedPercent: passive.secondaryUsedPercent,
        primaryResetAt: passive.primaryResetAfterSeconds !== null ? new Date((nowSeconds + passive.primaryResetAfterSeconds) * 1000).toISOString() : null,
        secondaryResetAt: passive.secondaryResetAfterSeconds !== null ? new Date((nowSeconds + passive.secondaryResetAfterSeconds) * 1000).toISOString() : null,
        primaryWindowMinutes: passive.primaryWindowMinutes, secondaryWindowMinutes: passive.secondaryWindowMinutes
      }).catch(() => undefined);

      if (!upstream.ok) {
        const failure = parseUpstreamError(await readBounded(upstream), upstream.status);
        lastFailure = failure;
        if (failure.kind === "surface") break;
        await recordFailure(account, failure);
        if (ownerAccountId) break;
        continue;
      }

      // Stream: hold the start of the reply until output begins, so a failure before that can still move accounts.
      const reader = upstream.body!.getReader();
      const inspector = new ResponseStreamInspector();
      const held: Uint8Array[] = [];
      let heldBytes = 0;
      let committed = false;
      let firstTokenAt: number | null = null;
      const translator = chatBody ? new ChatStreamTranslator(policy.model ?? "unknown", Math.floor(startedAt / 1000), includeUsage) : null;
      const forward = (chunk: Uint8Array) => {
        const out = translator ? translator.push(chunk) : chunk;
        if (out.byteLength > 0) reply.raw.write(out);
      };
      const commit = () => {
        committed = true;
        if (!clientStreams) return;
        reply.hijack();
        reply.raw.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-request-id": requestId,
          "x-accel-buffering": "no" });
        for (const chunk of held) forward(chunk);
        held.length = 0;
      };
      let movedOn = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const startedOutput = inspector.push(value);
          if (startedOutput && firstTokenAt === null) firstTokenAt = now();
          if (committed) {
            if (clientStreams) forward(value);
            continue;
          }
          held.push(value);
          heldBytes += value.byteLength;
          const failedEarly = inspector.outcome.status === "failed" && !inspector.outputStarted;
          if (failedEarly && !ownerAccountId) {
            const failure = parseUpstreamError(JSON.stringify({ error: { code: inspector.outcome.errorCode, message: inspector.outcome.errorMessage } }), 200);
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
          finish(account, inspector, firstTokenAt, "client_closed");
          return reply;
        }
        if (!committed && !ownerAccountId) {
          options.pool.markTransientError(account.id);
          lastFailure = { kind: "transient", status: 502, code: "stream_incomplete", message: error instanceof Error ? error.message : "Stream interrupted", error: {}, body: null };
          continue;
        }
        if (clientStreams && committed) {
          if (translator) reply.raw.write(translator.finish());
          reply.raw.end();
        }
        finish(account, inspector, firstTokenAt, "stream_incomplete");
        return reply;
      }
      if (movedOn) continue;

      if (!committed) commit();
      finish(account, inspector, firstTokenAt, null);
      if (inspector.outcome.responseId) responseOwners.set(hashKey(`codex-response:${inspector.outcome.responseId}`), account.id);
      if (stickyHash) stickyAccounts.set(stickyHash, account.id);
      if (inspector.outcome.status === "success") void options.pool.markSuccess(account.id).catch(() => undefined);
      if (clientStreams) {
        if (translator) reply.raw.write(translator.finish());
        reply.raw.end();
        return reply;
      }
      if (inspector.outcome.status === "success" && inspector.finalResponse) {
        const body = chatBody ? responseToChatCompletion(inspector.finalResponse, policy.model ?? "unknown", Math.floor(startedAt / 1000)) : inspector.finalResponse;
        return reply.header("x-request-id", requestId).send(body);
      }
      return reply.code(502).header("x-request-id", requestId).send(gatewayError(inspector.outcome.errorCode ?? "upstream_error",
        inspector.outcome.errorMessage ?? "The upstream response did not complete."));
    }

    // Every attempt failed before any output reached the client.
    const failure = lastFailure ?? { kind: "transient" as const, status: 503, code: "no_accounts", message: gatewayErrors.noAccounts().error.message, error: {}, body: null };
    options.logs.add({ ...baseLog(), status: "error", errorCode: failure.code, errorMessage: failure.message, latencyMs: now() - startedAt });
    if (failure.kind === "surface" && failure.body) {
      return reply.code(failure.status).header("content-type", "application/json").header("x-request-id", requestId).send(failure.body);
    }
    const status = failure.kind === "rate_limit" || failure.kind === "quota" ? 429 : failure.status >= 400 ? failure.status : 502;
    return reply.code(status).header("x-request-id", requestId).send(gatewayError(failure.code, failure.message, status === 429 ? "rate_limit_error" : "server_error"));

    async function recordFailure(account: GatewayAccountRecord, failure: UpstreamFailure) {
      if (failure.kind === "rate_limit") await options.pool.markRateLimited(account, failure.error);
      else if (failure.kind === "quota") await options.pool.markQuotaExceeded(account, failure.error);
      else if (failure.kind === "permanent") await options.pool.markPermanentFailure(account, failure.code in permanentFailureCodes ? failure.code : "token_invalidated");
      else options.pool.markTransientError(account.id);
    }

    function finish(account: GatewayAccountRecord, inspector: ResponseStreamInspector, firstTokenAt: number | null, forcedError: string | null) {
      const outcome = inspector.outcome;
      const ok = forcedError === null && outcome.status === "success";
      const cost = costUsd(outcome.usage, outcome.model ?? policy.model, outcome.serviceTier ?? policy.serviceTier);
      if (outcome.usage && options.settleKeyUsage) {
        void options.settleKeyUsage(key.id, {
          inputTokens: outcome.usage.inputTokens ?? 0, outputTokens: outcome.usage.outputTokens ?? 0, costMicros: Math.round((cost ?? 0) * 1e6),
          model: outcome.model ?? policy.model, at: new Date(startedAt).toISOString()
        }).catch(() => undefined);
      }
      options.logs.add({
        ...baseLog(), accountId: account.id, planType: account.planType, model: outcome.model ?? policy.model ?? "unknown",
        serviceTier: outcome.serviceTier ?? policy.serviceTier, status: ok ? "success" : "error",
        errorCode: forcedError ?? (ok ? null : outcome.errorCode ?? outcome.status), errorMessage: ok ? null : outcome.errorMessage,
        latencyMs: now() - startedAt, firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
        inputTokens: outcome.usage?.inputTokens ?? null, cachedInputTokens: outcome.usage?.cachedInputTokens ?? null,
        outputTokens: outcome.usage?.outputTokens ?? null, reasoningTokens: outcome.usage?.reasoningTokens ?? null,
        costUsd: cost, compressionTokensSaved: compressionSaved
      });
      void options.pool.touch(account.id, new Date(startedAt).toISOString()).catch(() => undefined);
    }
  }

  /**
   * Remote context compaction (`/responses/compact`), after codex-lb: a JSON request and reply, moved to another
   * account on rate limits, 5xx and dead credentials.
   */
  async function compact(request: FastifyRequest, reply: FastifyReply) {
    if (!(await helpers.authenticate(request, reply))) return reply;
    const key = request.gatewayApiKey!;
    const startedAt = now();
    const requestId = header(request, "x-request-id") ?? `req_${randomUUID().replace(/-/g, "")}`;
    const input = request.body;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return reply.code(400).send(gatewayError("invalid_request", "The request body must be a JSON object.", "invalid_request_error"));
    }
    let policy: PolicyResult;
    try {
      policy = applyRequestPolicy(input as Record<string, unknown>, key);
      checkKeyLimits(key, policy.model, new Date(startedAt).toISOString());
    } catch (error) {
      if (error instanceof PolicyRejection) return reply.code(error.statusCode).send(error.envelope);
      throw error;
    }
    const settings = await options.settings();
    const body = { ...policy.body };
    delete body.stream;
    const upstreamBody = JSON.stringify(body);
    const stickyRaw = typeof body.prompt_cache_key === "string" ? body.prompt_cache_key : header(request, "session_id") ?? header(request, "x-codex-session-id");
    const stickyHash = stickyRaw ? hashKey(`codex:${stickyRaw}`) : null;
    const scope = key.accountScopeEnabled ? new Set(key.accountIds) : null;
    const tried = new Set<string>();
    const log = (fields: Partial<GatewayRequestLogInsert> & Pick<GatewayRequestLogInsert, "status" | "errorCode">) => options.logs.add({
      requestId, requestedAt: new Date(startedAt).toISOString(), provider: "CODEX", accountId: null, apiKeyId: key.id, model: policy.model ?? "unknown",
      reasoningEffort: policy.reasoningEffort, requestedServiceTier: policy.requestedServiceTier, serviceTier: policy.serviceTier, transport: "http",
      upstreamTransport: "http", latencyMs: now() - startedAt, firstTokenMs: null, inputTokens: null, cachedInputTokens: null, outputTokens: null,
      reasoningTokens: null, costUsd: null, compressionTokensSaved: null, stickyKeySource: null, stickyKind: stickyHash ? "STICKY_THREAD" : null,
      stickyKeyHash: stickyHash ? stickyHash.slice(0, 16) : null, errorMessage: null, ...fields
    });
    let lastFailure: UpstreamFailure | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { account, none } = await pickAccount(settings, scope, tried, stickyHash, null, policy.model);
      if (!account) {
        if (attempt === 0 && none) {
          const status = none.errorCode === USAGE_LIMIT_REACHED ? 429 : 503;
          log({ status: "error", errorCode: none.errorCode ?? "no_accounts", errorMessage: none.errorMessage });
          return reply.code(status).send(gatewayError(none.errorCode ?? "no_accounts", none.errorMessage ?? gatewayErrors.noAccounts().error.message,
            status === 429 ? "rate_limit_error" : "server_error"));
        }
        break;
      }
      tried.add(account.id);
      options.pool.markSelected(account.id);
      let upstream: Response;
      try {
        const credentials = await options.pool.credentials(account);
        upstream = await fetchImpl(`${upstreamUrl}/compact`, {
          method: "POST", body: upstreamBody, signal: AbortSignal.timeout(300_000),
          headers: buildCodexUpstreamHeaders(request.headers, credentials.accessToken, credentials.upstreamAccountId, "application/json")
        });
      } catch (error) {
        options.pool.markTransientError(account.id);
        lastFailure = { kind: "transient", status: 502, code: "upstream_unavailable", message: error instanceof Error ? error.message : "Upstream unavailable", error: {}, body: null };
        continue;
      }
      if (!upstream.ok) {
        const failure = parseUpstreamError(await readBounded(upstream), upstream.status);
        lastFailure = failure;
        if (failure.kind === "surface") break;
        if (failure.kind === "rate_limit") await options.pool.markRateLimited(account, failure.error);
        else if (failure.kind === "quota") await options.pool.markQuotaExceeded(account, failure.error);
        else if (failure.kind === "permanent") await options.pool.markPermanentFailure(account, failure.code in permanentFailureCodes ? failure.code : "token_invalidated");
        else options.pool.markTransientError(account.id);
        continue;
      }
      const text = await upstream.text();
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { /* passed through as is */ }
      const usage = readResponseUsage(parsed);
      const model = typeof parsed?.model === "string" ? parsed.model : policy.model;
      const cost = costUsd(usage, model, policy.serviceTier);
      if (usage && options.settleKeyUsage) {
        void options.settleKeyUsage(key.id, { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0,
          costMicros: Math.round((cost ?? 0) * 1e6), model, at: new Date(startedAt).toISOString() }).catch(() => undefined);
      }
      log({ status: "success", errorCode: null, accountId: account.id, planType: account.planType, model: model ?? "unknown", inputTokens: usage?.inputTokens ?? null,
        cachedInputTokens: usage?.cachedInputTokens ?? null, outputTokens: usage?.outputTokens ?? null, reasoningTokens: usage?.reasoningTokens ?? null, costUsd: cost });
      if (stickyHash) stickyAccounts.set(stickyHash, account.id);
      void options.pool.markSuccess(account.id).catch(() => undefined);
      void options.pool.touch(account.id, new Date(startedAt).toISOString()).catch(() => undefined);
      return reply.code(upstream.status).header("content-type", upstream.headers.get("content-type") ?? "application/json").header("x-request-id", requestId).send(text);
    }
    const failure = lastFailure ?? { kind: "transient" as const, status: 503, code: "no_accounts", message: gatewayErrors.noAccounts().error.message, error: {}, body: null };
    log({ status: "error", errorCode: failure.code, errorMessage: failure.message });
    if (failure.kind === "surface" && failure.body) {
      return reply.code(failure.status).header("content-type", "application/json").header("x-request-id", requestId).send(failure.body);
    }
    const status = failure.kind === "rate_limit" || failure.kind === "quota" ? 429 : failure.status >= 400 ? failure.status : 502;
    return reply.code(status).header("x-request-id", requestId).send(gatewayError(failure.code, failure.message, status === 429 ? "rate_limit_error" : "server_error"));
  }

  app.post("/backend-api/codex/responses/compact", compact);
  app.post("/v1/responses/compact", compact);
  app.post("/backend-api/codex/responses", (request, reply) => handle(request, reply, "responses"));
  app.post("/v1/responses", (request, reply) => handle(request, reply, "responses"));
  app.post("/v1/chat/completions", (request, reply) => handle(request, reply, "chat"));
}

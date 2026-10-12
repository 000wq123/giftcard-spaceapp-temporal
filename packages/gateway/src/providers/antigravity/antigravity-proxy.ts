import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewaySettings } from "@space/contracts";
import type { GatewayAccountRecord, GatewayRepository } from "@space/db";
import type { AccountPool } from "../../accounts/account-pool.js";
import { StickyStore } from "../../accounts/sticky-store.js";
import { hashKey, readBounded } from "../../proxy-util.js";
import type { RequestLogWriter } from "../../request-log-writer.js";
import { selectAccount } from "../../router/balancer.js";
import { CODE_ASSIST_BASE_URL, quotaGroupForModel, type AntigravityQuotaGroup } from "./code-assist.js";
import { ANTIGRAVITY_CLIENT_ID } from "./oauth.js";
import { CodeAssistStreamInspector, parseResetsIn, type GeminiUsage } from "./stream.js";

/**
 * Antigravity through Space Gateway. The CLI is pointed here with `CLOUD_CODE_URL=http://127.0.0.1:4920/antigravity`.
 * Model calls (`generateContent`, `streamGenerateContent`) go to a pooled account chosen by the model's quota group,
 * with the request's `project` rewritten to that account's Code Assist project, and move to another account when one
 * runs out of quota before any content reached the client. Every other call (settings, trajectories, experiments,
 * quota) goes upstream unchanged with the client's own sign-in, because it belongs to that account.
 * Only clients signed in to Antigravity as one of the pool's Google accounts are balanced; any other signed-in client
 * passes straight through with its own sign-in, so routing Antigravity here never breaks a profile outside the pool.
 */
const MODEL_METHODS = new Set(["generateContent", "streamGenerateContent"]);
const IDENTITY_CACHE_MS = 10 * 60_000;
const hopByHop = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "proxy-connection",
  "host", "content-length", "accept-encoding"]);

type Json = Record<string, unknown>;

export interface AntigravityProxyOptions {
  pool: AccountPool;
  repository: GatewayRepository;
  logs: RequestLogWriter;
  settings: () => Promise<GatewaySettings>;
  upstreamBaseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  maxAccountAttempts?: number;
  sticky?: StickyStore;
  /** Google token -> identity; defaults to Google's tokeninfo endpoint. */
  verifyIdentity?: (accessToken: string) => Promise<{ subject: string | null; email: string | null; clientId: string | null } | null>;
}

async function googleTokenInfo(accessToken: string, fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return null;
    const info = await response.json() as Json;
    return { subject: typeof info.sub === "string" ? info.sub : null, email: typeof info.email === "string" ? info.email : null,
      clientId: typeof info.azp === "string" ? info.azp : typeof info.aud === "string" ? info.aud : null };
  } catch {
    return null;
  }
}

function forwardHeaders(inbound: Record<string, string | string[] | undefined>, accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, raw] of Object.entries(inbound)) {
    if (raw === undefined) continue;
    const lowered = key.toLowerCase();
    if (hopByHop.has(lowered) || lowered.startsWith("x-forwarded-") || lowered.startsWith("x-space-gateway-")) continue;
    headers[lowered] = Array.isArray(raw) ? raw.join(", ") : raw;
  }
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

function bearer(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  const match = /^Bearer\s+(\S+)$/i.exec(Array.isArray(value) ? value[0] ?? "" : value ?? "");
  return match ? match[1]! : null;
}

export function registerAntigravityProxyRoutes(app: FastifyInstance, options: AntigravityProxyOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const baseUrl = (options.upstreamBaseUrl ?? CODE_ASSIST_BASE_URL).replace(/\/+$/, "");
  const maxAttempts = options.maxAccountAttempts ?? 3;
  const sticky = options.sticky ?? new StickyStore({ provider: "ANTIGRAVITY", kind: "PROMPT_CACHE" });
  const verify = options.verifyIdentity ?? ((token: string) => googleTokenInfo(token, fetchImpl));
  const identities = new Map<string, { at: number; allowed: boolean }>();

  /** Whether the client's Google sign-in is one of the pool's accounts (and was issued to the Antigravity client). */
  async function pooled(token: string): Promise<boolean> {
    const key = hashKey(token);
    const cached = identities.get(key);
    if (cached && now() - cached.at < IDENTITY_CACHE_MS) return cached.allowed;
    const identity = await verify(token);
    const accounts = await options.pool.accounts();
    const allowed = Boolean(identity && (identity.clientId === null || identity.clientId === ANTIGRAVITY_CLIENT_ID) && accounts.some((account) =>
      (identity.subject && account.externalAccountId === identity.subject) || (identity.email && account.email?.toLowerCase() === identity.email.toLowerCase())));
    if (identities.size > 1000) identities.clear();
    identities.set(key, { at: now(), allowed });
    return allowed;
  }

  async function passthrough(request: FastifyRequest, reply: FastifyReply, upstreamPath: string, body: Buffer | undefined) {
    let upstream: Response;
    try {
      upstream = await fetchImpl(`${baseUrl}${upstreamPath}`, { method: request.method, headers: forwardHeaders(request.headers, null),
        body: body && body.length > 0 ? new Uint8Array(body) : undefined, signal: AbortSignal.timeout(300_000) });
    } catch {
      return reply.code(502).send({ error: { code: 502, message: "Code Assist is unreachable.", status: "UNAVAILABLE" } });
    }
    reply.hijack();
    const headers: Record<string, string> = {};
    upstream.headers.forEach((value, name) => { if (!hopByHop.has(name) && name !== "content-encoding") headers[name] = value; });
    reply.raw.writeHead(upstream.status, headers);
    if (upstream.body) {
      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(value);
      }
    }
    reply.raw.end();
    return reply;
  }

  async function pick(group: AntigravityQuotaGroup, tried: Set<string>, stickyHash: string | null, settings: GatewaySettings): Promise<GatewayAccountRecord | undefined> {
    const accounts = (await options.pool.accounts()).filter((account) => !tried.has(account.id));
    const states = accounts.map((account) => options.pool.toBalancerState(account, group));
    const stickyId = stickyHash ? await sticky.get(stickyHash) : undefined;
    const stickyState = stickyId ? states.find((state) => state.accountId === stickyId) : undefined;
    if (stickyState) {
      const check = selectAccount([stickyState], { now: now() / 1000, routingStrategy: "SINGLE_ACCOUNT", allowUsageExhaustionError: false });
      const used = Math.max(stickyState.usedPercent ?? 0, stickyState.secondaryUsedPercent ?? 0);
      if (check.account && used < settings.stickyReallocationBudgetThresholdPercent) return accounts.find((account) => account.id === stickyState.accountId);
    }
    const result = selectAccount(states, { now: now() / 1000, routingStrategy: settings.routingStrategy, preferEarlierReset: settings.preferEarlierReset });
    for (const state of states) options.pool.absorb(state);
    return result.account ? accounts.find((account) => account.id === result.account!.accountId) : undefined;
  }

  async function handle(request: FastifyRequest, reply: FastifyReply) {
    const token = bearer(request);
    if (!token) return reply.code(401).send({ error: { code: 401, message: "Antigravity is not signed in.", status: "UNAUTHENTICATED" } });
    const upstreamPath = request.url.replace(/^\/antigravity/, "") || "/";
    const raw = Buffer.isBuffer(request.body) ? request.body : undefined;
    const method = /^\/v1internal:([A-Za-z]+)/.exec(upstreamPath)?.[1] ?? "";
    if (request.method !== "POST" || !MODEL_METHODS.has(method) || !raw || !(await pooled(token))) return passthrough(request, reply, upstreamPath, raw);

    let body: Json;
    try { body = JSON.parse(raw.toString("utf8")) as Json; } catch { return passthrough(request, reply, upstreamPath, raw); }
    const startedAt = now();
    const requestId = `req_${randomUUID().replace(/-/g, "")}`;
    const model = typeof body.model === "string" ? body.model : null;
    const group = quotaGroupForModel(model);
    const inner = body.request && typeof body.request === "object" ? body.request as Json : {};
    const sessionId = typeof inner.sessionId === "string" ? inner.sessionId : null;
    const stickyHash = sessionId ? hashKey(`antigravity:${sessionId}`) : null;
    const settings = await options.settings();
    const tried = new Set<string>();
    const log = (account: GatewayAccountRecord | null, status: "success" | "error", errorCode: string | null, usage: GeminiUsage | null, extra: { firstTokenMs?: number | null; model?: string | null; errorMessage?: string | null } = {}) =>
      options.logs.add({
        requestId, requestedAt: new Date(startedAt).toISOString(), provider: "ANTIGRAVITY", accountId: account?.id ?? null, apiKeyId: null,
        model: extra.model ?? model ?? "unknown", reasoningEffort: null, serviceTier: null, transport: "http", upstreamTransport: "http", status, errorCode,
        errorMessage: extra.errorMessage ?? null, latencyMs: now() - startedAt, firstTokenMs: extra.firstTokenMs ?? null,
        inputTokens: usage?.promptTokens ?? null, cachedInputTokens: usage?.cachedTokens ?? null, outputTokens: usage?.outputTokens ?? null,
        reasoningTokens: usage?.thoughtsTokens ?? null, costUsd: null, compressionTokensSaved: null, planType: account?.planType ?? null,
        stickyKeySource: sessionId ? "request.sessionId" : null, stickyKind: stickyHash ? "PROMPT_CACHE" : null, stickyKeyHash: stickyHash ? stickyHash.slice(0, 16) : null
      });

    let lastError: { status: number; body: string; headers: Headers | null } | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const account = await pick(group, tried, stickyHash, settings);
      if (!account) break;
      tried.add(account.id);
      options.pool.markSelected(account.id);
      let credentials;
      try {
        credentials = await options.pool.credentials(account);
      } catch (error) {
        lastError = { status: 401, body: JSON.stringify({ error: { code: 401, message: error instanceof Error ? error.message : "Account sign-in is unavailable.", status: "UNAUTHENTICATED" } }), headers: null };
        continue;
      }
      const outgoing = JSON.stringify({ ...body, project: credentials.upstreamAccountId ?? body.project });
      let upstream: Response;
      try {
        upstream = await fetchImpl(`${baseUrl}${upstreamPath}`, { method: "POST", body: outgoing, headers: forwardHeaders(request.headers, credentials.accessToken),
          signal: AbortSignal.timeout(600_000) });
      } catch {
        options.pool.markTransientError(account.id);
        lastError = { status: 502, body: JSON.stringify({ error: { code: 502, message: "Code Assist is unreachable.", status: "UNAVAILABLE" } }), headers: null };
        continue;
      }
      if (!upstream.ok) {
        const text = await readBounded(upstream);
        lastError = { status: upstream.status, body: text, headers: upstream.headers };
        if (await recordFailure(account, upstream.status, text)) continue;
        break;
      }

      const inspector = new CodeAssistStreamInspector();
      const reader = upstream.body!.getReader();
      const held: Uint8Array[] = [];
      let committed = false;
      let firstTokenAt: number | null = null;
      const commit = () => {
        committed = true;
        reply.hijack();
        const headers: Record<string, string> = {};
        upstream.headers.forEach((value, name) => { if (!hopByHop.has(name) && name !== "content-encoding") headers[name] = value; });
        reply.raw.writeHead(upstream.status, headers);
        for (const chunk of held) reply.raw.write(chunk);
        held.length = 0;
      };
      let movedOn = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (inspector.push(value) && firstTokenAt === null) firstTokenAt = now();
          if (committed) { reply.raw.write(value); continue; }
          held.push(value);
          if (inspector.errorStatus !== null && !inspector.outputStarted && attempt + 1 < maxAttempts) {
            const failoverable = await recordFailure(account, inspector.errorStatus, JSON.stringify({ error: { code: inspector.errorStatus, message: inspector.errorMessage } }));
            if (failoverable) { await reader.cancel().catch(() => undefined); movedOn = true; break; }
          }
          if (inspector.outputStarted) commit();
        }
      } catch {
        if (!committed) { options.pool.markTransientError(account.id); continue; }
        reply.raw.end();
        log(account, "error", "stream_incomplete", inspector.usage, { firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt, model: inspector.model });
        return reply;
      }
      if (movedOn) continue;
      if (!committed) commit();
      reply.raw.end();
      const failed = inspector.errorStatus !== null && !inspector.outputStarted;
      log(account, failed ? "error" : "success", failed ? `http_${inspector.errorStatus}` : null, inspector.usage,
        { firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt, model: inspector.model, errorMessage: failed ? inspector.errorMessage : null });
      if (!failed) {
        if (stickyHash) sticky.set(stickyHash, account.id);
        void options.pool.markSuccess(account.id).catch(() => undefined);
      }
      void options.pool.touch(account.id, new Date(startedAt).toISOString()).catch(() => undefined);
      return reply;
    }

    const status = lastError?.status ?? 503;
    log(null, "error", lastError ? `http_${status}` : "no_accounts", null);
    if (lastError) return reply.code(status).header("content-type", "application/json").send(lastError.body);
    return reply.code(503).send({ error: { code: 503, message: "No Antigravity account in Space Gateway can serve this model right now.", status: "UNAVAILABLE" } });

    /** Notes what the failure says about the account; returns whether another account may serve the request. */
    async function recordFailure(account: GatewayAccountRecord, status: number, text: string): Promise<boolean> {
      let message = "";
      try { message = String(((JSON.parse(text) as Json).error as Json | undefined)?.message ?? ""); } catch { message = text.slice(0, 300); }
      if (status === 429) {
        const resetIn = parseResetsIn(message);
        const quota = /quota|RESOURCE_EXHAUSTED/i.test(message) || text.includes("RESOURCE_EXHAUSTED");
        if (quota) {
          await options.repository.saveUsageWindows(account.id, [{ quotaKey: group, window: "PRIMARY", usedPercent: 100,
            resetAt: new Date(now() + (resetIn ?? 3600) * 1000).toISOString(), windowMinutes: 300 }]);
          options.pool.invalidate();
        } else {
          options.pool.markTransientError(account.id);
        }
        return true;
      }
      if (status === 401) {
        await options.pool.markPermanentFailure(account, "token_invalidated");
        return true;
      }
      if (status === 403 || status >= 500) {
        options.pool.markTransientError(account.id);
        return true;
      }
      return false;
    }
  }

  app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: 64 * 1024 * 1024 }, (_request, payload, done) => done(null, payload));
    scope.all("/antigravity/*", handle);
  });
}

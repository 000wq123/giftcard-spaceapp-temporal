import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { GatewayRepository } from "@space/db";
import type { AccountPool, StoredCredentials } from "../accounts/account-pool.js";
import type { CredentialCipher } from "../credential-cipher.js";
import { OPENAI_API_BASE_URL } from "../providers/openai-api/embeddings-proxy.js";
import { createAdminGuard, publicAccountSummary, type ProviderAccountActions } from "./codex-sign-in.js";

/**
 * Provider API keys as gateway accounts (first: OpenAI API, for embeddings). The key is checked with a free
 * model listing, stored encrypted, and identified only by a hash prefix and its last four characters.
 */
async function checkOpenAiKey(apiKey: string, fetchImpl: typeof fetch, baseUrl = OPENAI_API_BASE_URL): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetchImpl(`${baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
    await response.body?.cancel().catch(() => undefined);
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function registerApiKeyAccountRoutes(app: FastifyInstance, options: {
  repository: GatewayRepository; pool: AccountPool; cipher: () => CredentialCipher | null; internalToken: string | null; fetchImpl?: typeof fetch; now?: () => number;
}) {
  const guard = createAdminGuard(options.internalToken);
  const now = options.now ?? Date.now;
  app.post("/__space-gateway/admin/api-key/add", async (request, reply) => {
    if (!(await guard(request, reply))) return reply;
    const body = (request.body ?? {}) as { provider?: unknown; apiKey?: unknown; label?: unknown; sourceRef?: unknown };
    if (body.provider !== "OPENAI_API") return reply.code(422).send({ error: { code: "unsupported_provider", message: "Only OpenAI API keys can be added for now." } });
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!/^sk-[A-Za-z0-9_-]{20,300}$/.test(apiKey)) return reply.code(422).send({ error: { code: "invalid_api_key", message: "This does not look like an OpenAI API key." } });
    const cipher = options.cipher();
    if (!cipher) return reply.code(503).send({ error: { code: "credential_key_missing", message: "The Space Gateway encryption key is missing. Redeploy Space to create it." } });
    const check = await checkOpenAiKey(apiKey, options.fetchImpl ?? fetch);
    if (!check.ok) {
      return reply.code(check.status === 0 || check.status >= 500 ? 502 : 422)
        .send({ error: { code: "api_key_rejected", message: check.status === 0 ? "OpenAI could not be reached." : `OpenAI rejected the key (HTTP ${check.status}).` } });
    }
    const externalAccountId = `key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 32)}`;
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : `OpenAI API key …${apiKey.slice(-4)}`;
    const sourceRef = typeof body.sourceRef === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(body.sourceRef) ? body.sourceRef : null;
    const existing = (await options.repository.listAccounts()).find((account) => account.provider === "OPENAI_API" && account.externalAccountId === externalAccountId);
    const boundId = existing?.id ?? `gw_account:${randomBytes(16).toString("hex")}`;
    const credentials: StoredCredentials = { accessToken: apiKey, refreshToken: null, idToken: null, upstreamAccountId: null, accessExpiresAtMs: null };
    const saved = await options.repository.upsertAccount({ accountId: boundId, provider: "OPENAI_API", label, email: null, externalAccountId, planType: "api",
      credentialsEncrypted: cipher.encrypt(JSON.stringify(credentials), boundId), credentialsExpiresAt: null, source: "API_KEY", sourceRef,
      lastRefreshAt: new Date(now()).toISOString() });
    options.pool.invalidate();
    return { status: "CONNECTED", account: publicAccountSummary(saved) };
  });
}

/** Test (a free model listing) for OpenAI API key accounts; there are no usage windows to refresh. */
export function openAiApiAccountActions(options: { pool: AccountPool; fetchImpl?: typeof fetch; now?: () => number }): ProviderAccountActions {
  const now = options.now ?? Date.now;
  return {
    async test(account) {
      const startedAt = now();
      const credentials = await options.pool.credentials(account);
      const check = await checkOpenAiKey(credentials.accessToken, options.fetchImpl ?? fetch);
      if (check.ok) await options.pool.markSuccess(account.id);
      return { ok: check.ok, model: null, status: check.status || 502, latencyMs: now() - startedAt, error: check.ok ? null : `OpenAI answered HTTP ${check.status}` };
    },
    async refreshUsage() { /* API keys have no usage windows. */ }
  };
}

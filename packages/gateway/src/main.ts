import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { PostgresGatewayRepository } from "@space/db";
import type { GatewaySettings } from "@space/contracts";
import { AccountPool } from "./accounts/account-pool.js";
import { StickyStore } from "./accounts/sticky-store.js";
import { antigravityAccountActions, registerAntigravitySignInRoutes } from "./admin/antigravity-sign-in.js";
import { openAiApiAccountActions, registerApiKeyAccountRoutes } from "./admin/api-key-accounts.js";
import { claudeAccountActions, registerClaudeSignInRoutes } from "./admin/claude-sign-in.js";
import { registerCodexSignInRoutes } from "./admin/codex-sign-in.js";
import { loadGatewayConfig } from "./config.js";
import { loadCredentialCipher, type CredentialCipher } from "./credential-cipher.js";
import { registerCodexProxyRoutes } from "./providers/codex/codex-proxy.js";
import { CodexModelPlans } from "./providers/codex/model-plans.js";
import { registerWeeklyRemainingRoute } from "./providers/codex/weekly-remaining.js";
import { registerCodexModelRoutes } from "./providers/codex/models.js";
import { createCodexRefresher } from "./providers/codex/credentials.js";
import { startCodexUsagePoller } from "./providers/codex/usage-refresh.js";
import { registerAntigravityProxyRoutes } from "./providers/antigravity/antigravity-proxy.js";
import { createAntigravityRefresher } from "./providers/antigravity/credentials.js";
import { startAntigravityUsagePoller } from "./providers/antigravity/usage-refresh.js";
import { registerClaudeProxyRoutes } from "./providers/claude/claude-proxy.js";
import { apiKeyRefresher, registerEmbeddingsRoute } from "./providers/openai-api/embeddings-proxy.js";
import { createClaudeRefresher } from "./providers/claude/credentials.js";
import { startClaudeUsagePoller } from "./providers/claude/usage-refresh.js";
import { CompressionCache } from "./compression/engine.js";
import { CompressionPool } from "./compression/pool.js";
import { RequestLogWriter } from "./request-log-writer.js";
import { createGatewayServer } from "./server.js";
import { DRAIN_MESSAGE } from "./supervisor.js";
import { registerStatsRoute } from "./stats.js";

async function readVersion(): Promise<string> {
  try {
    const raw = JSON.parse(await readFile(new URL("../../../version.json", import.meta.url), "utf8")) as { platform?: { version?: string } };
    return raw.platform?.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function main() {
  const config = loadGatewayConfig();
  if (!config.databaseUrl) throw new Error("SPACE_DATABASE_URL is required for Space Gateway.");
  const repository = PostgresGatewayRepository.fromConnectionString(config.databaseUrl);
  let credentialKeyPresent = false;
  let cipher: CredentialCipher | null = null;
  const checkKey = async () => {
    credentialKeyPresent = await access(config.encryptionKeyFile, constants.R_OK).then(() => true, () => false);
    if (credentialKeyPresent && !cipher) cipher = await loadCredentialCipher(config.encryptionKeyFile).catch(() => null);
  };
  await checkKey();
  let settingsCache: { at: number; value: GatewaySettings } | null = null;
  const settings = async () => {
    if (!settingsCache || Date.now() - settingsCache.at > 5_000) settingsCache = { at: Date.now(), value: await repository.getSettings() };
    return settingsCache.value;
  };
  const logs = new RequestLogWriter(repository, {
    onError: (error) => process.stderr.write(`space-gateway request log write failed: ${error instanceof Error ? error.message : "unknown"}\n`)
  });
  const compressionPool = new CompressionPool(new URL("./compression-worker.mjs", import.meta.url), config.compressionWorkers);
  const compressionCache = new CompressionCache();
  const codexPool = new AccountPool({ provider: "CODEX", repository, cipher: () => cipher, refresher: createCodexRefresher() });
  const claudePool = new AccountPool({ provider: "CLAUDE", repository, cipher: () => cipher, refresher: createClaudeRefresher() });
  const antigravityPool = new AccountPool({ provider: "ANTIGRAVITY", repository, cipher: () => cipher, refresher: createAntigravityRefresher() });
  const openAiApiPool = new AccountPool({ provider: "OPENAI_API", repository, cipher: () => cipher, refresher: apiKeyRefresher });
  const onStickyError = (error: unknown) =>
    process.stderr.write(`space-gateway sticky binding storage failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  const sticky = {
    codexThreads: new StickyStore({ repository, provider: "CODEX", kind: "STICKY_THREAD", onError: onStickyError }),
    codexContinuations: new StickyStore({ repository, provider: "CODEX", kind: "CONTINUATION", onError: onStickyError }),
    claudeSessions: new StickyStore({ repository, provider: "CLAUDE", kind: "PROMPT_CACHE", onError: onStickyError }),
    antigravitySessions: new StickyStore({ repository, provider: "ANTIGRAVITY", kind: "PROMPT_CACHE", onError: onStickyError })
  };
  const settleKeyUsage = (keyId: string, usage: Parameters<typeof repository.settleApiKeyUsage>[1]) => repository.settleApiKeyUsage(keyId, usage);
  const compression = { run: compressionPool.run, cache: compressionCache, record: (rows: Parameters<typeof repository.recordCompression>[0]) => repository.recordCompression(rows) };
  const server = createGatewayServer({
    repository, version: await readVersion(), credentialKeyPresent: () => credentialKeyPresent, logger: false,
    routes: (app, helpers) => {
      let clientVersion = () => "0.150.1";
      const modelPlans = new CodexModelPlans({ pool: codexPool, clientVersion: () => clientVersion() });
      registerCodexProxyRoutes(app, helpers, { pool: codexPool, logs, settings, settleKeyUsage, compression, modelPlans,
        sticky: { threads: sticky.codexThreads, continuations: sticky.codexContinuations } });
      const claude = registerClaudeProxyRoutes(app, helpers, { pool: claudePool, logs, settings, settleKeyUsage, compression, sticky: sticky.claudeSessions });
      clientVersion = registerCodexModelRoutes(app, helpers, { pool: codexPool, anthropicModels: claude.models }).clientVersion;
      registerWeeklyRemainingRoute(app, helpers, { pool: codexPool });
      registerCodexSignInRoutes(app, { repository, pool: codexPool, cipher: () => cipher, internalToken: config.internalToken,
        otherProviders: { CLAUDE: claudeAccountActions({ repository, pool: claudePool }), ANTIGRAVITY: antigravityAccountActions({ repository, pool: antigravityPool }),
          OPENAI_API: openAiApiAccountActions({ pool: openAiApiPool }) } });
      registerEmbeddingsRoute(app, helpers, { pool: openAiApiPool, logs, settings, settleKeyUsage });
      registerApiKeyAccountRoutes(app, { repository, pool: openAiApiPool, cipher: () => cipher, internalToken: config.internalToken });
      registerAntigravityProxyRoutes(app, { pool: antigravityPool, repository, logs, settings, sticky: sticky.antigravitySessions });
      registerAntigravitySignInRoutes(app, { repository, pool: antigravityPool, cipher: () => cipher, internalToken: config.internalToken });
      registerClaudeSignInRoutes(app, { repository, pool: claudePool, cipher: () => cipher, internalToken: config.internalToken });
      registerStatsRoute(app, { repository, cache: compressionCache, compressionMode: async () => (await settings()).compressionMode });
    }
  });
  await server.app.listen({ host: config.host, port: config.port });
  server.setListen(`${config.host}:${config.port}`);
  process.stdout.write(`space-gateway listening on ${config.host}:${config.port}\n`);
  const onUsageError = (accountId: string, error: unknown) =>
    process.stderr.write(`space-gateway usage refresh failed for ${accountId}: ${error instanceof Error ? error.message : "unknown"}\n`);
  const usagePollers = [
    startCodexUsagePoller({ repository, pool: codexPool, intervalMs: config.usagePollIntervalMs, onError: onUsageError }),
    startClaudeUsagePoller({ repository, pool: claudePool, intervalMs: config.usagePollIntervalMs, onError: onUsageError }),
    startAntigravityUsagePoller({ repository, pool: antigravityPool, intervalMs: config.usagePollIntervalMs, onError: onUsageError })
  ];

  const retention = setInterval(() => {
    void (async () => {
      await checkKey();
      const current = await settings();
      const cutoff = new Date(Date.now() - current.requestLogRetentionDays * 86_400_000).toISOString();
      const removed = await repository.pruneRequestLogs(cutoff);
      if (removed > 0) process.stdout.write(`space-gateway retention removed ${removed} request logs\n`);
      await repository.pruneStickyBindings(new Date().toISOString());
    })().catch((error: unknown) => process.stderr.write(`space-gateway retention failed: ${error instanceof Error ? error.message : "unknown"}\n`));
  }, config.retentionIntervalMs);
  retention.unref();

  let stopping = false;
  const stop = (signal: string, drainTimeoutMs = config.drainTimeoutMs) => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`space-gateway ${signal}: draining ${server.inFlight()} request(s)\n`);
    server.startDraining();
    clearInterval(retention);
    for (const poller of usagePollers) poller.stop();
    const deadline = setTimeout(() => {
      process.stderr.write("space-gateway drain timeout reached; closing remaining connections\n");
      server.app.server.closeAllConnections();
    }, drainTimeoutMs);
    deadline.unref();
    server.app.close()
      .then(() => logs.flush())
      .then(() => Promise.all(Object.values(sticky).map((store) => store.flush())))
      .then(() => compressionPool.close())
      .then(() => repository.dispose())
      .then(() => process.exit(0), () => process.exit(1));
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  // Under the supervisor, a newer worker took over: stop accepting and finish open streams, however long they run.
  process.on("message", (message: { type?: unknown; reason?: unknown } | null) => {
    if (message?.type === DRAIN_MESSAGE) stop(message.reason === "reload" ? "handoff" : "stop", message.reason === "reload" ? config.reloadDrainTimeoutMs : undefined);
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`space-gateway failed to start: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exit(1);
});

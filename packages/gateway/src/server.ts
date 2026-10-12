import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { GatewayRepository, GatewayApiKeyRecord } from "@space/db";
import { hashGatewayApiKey, readPresentedApiKey } from "./api-keys.js";
import { gatewayErrors } from "./errors.js";

export interface GatewayRuntimeStatus {
  version: string;
  startedAt: string;
  inFlightRequests: number;
  draining: boolean;
  listen: string | null;
  credentialKey: "PRESENT" | "MISSING";
}

export interface GatewayRouteHelpers {
  /** Validates the presented gateway key; on failure it has already replied and returns false. */
  authenticate(request: FastifyRequest, reply: FastifyReply): Promise<boolean>;
  isDraining(): boolean;
}

export interface GatewayServerOptions {
  repository: GatewayRepository;
  /** Provider routes (Codex, Claude, ...) registered ahead of the codex-lb-compatible catch-all. */
  routes?: (app: FastifyInstance, helpers: GatewayRouteHelpers) => void;
  version: string;
  credentialKeyPresent: () => boolean;
  now?: () => Date;
  logger?: boolean;
}

export interface GatewayServer {
  app: FastifyInstance;
  status(): GatewayRuntimeStatus;
  /** Stops admitting proxy requests; in-flight requests finish. */
  startDraining(): void;
  inFlight(): number;
  setListen(address: string): void;
}

/** Proxy route prefixes served by codex-lb today; Space Gateway answers on the same paths. */
export const gatewayProxyPrefixes = ["/v1", "/backend-api/codex", "/backend-api/transcribe"] as const;

declare module "fastify" {
  interface FastifyRequest {
    gatewayApiKey?: GatewayApiKeyRecord;
  }
}

export function createGatewayServer(options: GatewayServerOptions): GatewayServer {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024 * 1024, trustProxy: false });
  let inFlight = 0;
  let draining = false;
  let listen: string | null = null;

  app.addHook("onRequest", async () => { inFlight += 1; });
  app.addHook("onResponse", async () => { inFlight = Math.max(0, inFlight - 1); });

  app.get("/health", async () => ({ status: draining ? "draining" : "ok" }));

  app.get("/readyz", async (_request, reply) => {
    try {
      await options.repository.getSettings();
      return { status: draining ? "draining" : "ready" };
    } catch {
      return reply.code(503).send({ status: "storage_unavailable" });
    }
  });

  const status = (): GatewayRuntimeStatus => ({
    version: options.version,
    startedAt,
    inFlightRequests: inFlight,
    draining,
    listen,
    credentialKey: options.credentialKeyPresent() ? "PRESENT" : "MISSING"
  });

  /** Non-sensitive runtime state for the Space API; it never includes keys, tokens or account data. */
  app.get("/__space-gateway/status", async () => status());

  async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    if (draining) return reply.code(503).header("connection", "close").header("retry-after", "1").send(gatewayErrors.draining());
    const presented = readPresentedApiKey(request.headers);
    if (!presented) return reply.code(401).send(gatewayErrors.missingApiKey());
    let key: GatewayApiKeyRecord | null;
    try {
      key = await options.repository.findApiKeyByHash(hashGatewayApiKey(presented));
    } catch {
      return reply.code(503).send(gatewayErrors.unavailable());
    }
    if (!key) return reply.code(401).send(gatewayErrors.invalidApiKey());
    if (!key.isActive) return reply.code(401).send(gatewayErrors.inactiveApiKey());
    if (key.expiresAt && Date.parse(key.expiresAt) <= now().getTime()) return reply.code(401).send(gatewayErrors.expiredApiKey());
    request.gatewayApiKey = key;
  }

  options.routes?.(app, {
    async authenticate(request, reply) {
      await authenticate(request, reply);
      return !reply.sent;
    },
    isDraining: () => draining
  });

  for (const prefix of gatewayProxyPrefixes) {
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
      await authenticate(request, reply);
      if (reply.sent) return reply;
      // Provider adapters attach here; until an account pool serves the route, answer like codex-lb with no accounts.
      return reply.code(503).send(gatewayErrors.noAccounts());
    };
    app.all(prefix, handler);
    app.all(`${prefix}/*`, handler);
  }

  return {
    app,
    status,
    startDraining() { draining = true; },
    inFlight: () => inFlight,
    setListen(address) { listen = address; }
  };
}

import type {} from "../request-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from "fastify";
import { z } from "zod";
import { gatewayApiKeyCreateRequestSchema, gatewayApiKeyUpdateRequestSchema, gatewaySettingsUpdateRequestSchema } from "@space/contracts";
import type { AuditRecorder } from "../request-audit.js";
import { sendApiError } from "../http-errors.js";
import { GatewayAccountNotFoundError, type GatewayAdminService } from "./gateway-service.js";

const accountParamsSchema = z.object({ accountId: z.string().regex(/^gw_account:[a-f0-9]{32}$/) }).strict();
const keyParamsSchema = z.object({ keyId: z.string().regex(/^gw_key:[a-f0-9]{32}$/) }).strict();
const pauseSchema = z.object({ paused: z.boolean() }).strict();
const logsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().regex(/^\d{1,19}$/).optional(),
  accountId: z.string().regex(/^gw_account:[a-f0-9]{32}$/).optional(),
  apiKeyId: z.string().regex(/^gw_key:[a-f0-9]{32}$/).optional()
}).strict();

/** Space Gateway administration. Administrators only; every change is audited. */
export function registerGatewayAdminRoutes(app: FastifyInstance, options: {
  service: GatewayAdminService;
  recordAudit: AuditRecorder;
  routeOptions: Pick<RouteShorthandOptions, "config">;
}) {
  const { service, recordAudit, routeOptions } = options;
  const writeOptions = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };
  const requireAdmin = (request: FastifyRequest, reply: FastifyReply) => {
    if (request.user?.role === "ADMIN") return true;
    void sendApiError(reply, 403, "ADMIN_REQUIRED", "Administrator permissions are required.");
    return false;
  };

  app.get("/api/admin/gateway/status", routeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return service.status();
  });

  app.get("/api/admin/gateway/accounts", routeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return service.listAccounts();
  });

  app.patch("/api/admin/gateway/accounts/:accountId", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { accountId } = accountParamsSchema.parse(request.params);
    const { paused } = pauseSchema.parse(request.body);
    const account = await service.setAccountPaused(accountId, paused);
    if (!account) return sendApiError(reply, 404, "GATEWAY_ACCOUNT_NOT_FOUND", "Account not found.");
    await recordAudit(request, { action: paused ? "admin.gateway.account.pause" : "admin.gateway.account.resume", targetType: "gateway_account", targetId: accountId });
    return account;
  });

  const flowParamsSchema = z.object({ flowId: z.string().regex(/^[a-f0-9]{32}$/) }).strict();
  const signInLimits = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };
  const relay = async (reply: FastifyReply, result: { status: number; body: unknown }) => reply.code(result.status).header("cache-control", "no-store").send(result.body);
  const connected = (body: unknown): { id?: string; provider?: string } | null => {
    const record = body as { status?: unknown; account?: { id?: string; provider?: string } } | null;
    return record?.status === "CONNECTED" && record.account ? record.account : null;
  };

  app.post("/api/admin/gateway/codex/device", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return relay(reply, await service.gatewayAdmin("/__space-gateway/admin/codex/device"));
  });

  app.post("/api/admin/gateway/codex/device/:flowId/poll", signInLimits, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { flowId } = flowParamsSchema.parse(request.params);
    const result = await service.gatewayAdmin(`/__space-gateway/admin/codex/device/${flowId}/poll`);
    const account = connected(result.body);
    if (account) await recordAudit(request, { action: "admin.gateway.account.add", targetType: "gateway_account", targetId: account.id ?? null, metadata: { provider: "CODEX", method: "device_code" } });
    return relay(reply, result);
  });

  app.post("/api/admin/gateway/codex/browser", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return relay(reply, await service.gatewayAdmin("/__space-gateway/admin/codex/browser"));
  });

  app.post("/api/admin/gateway/codex/browser/:flowId/complete", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { flowId } = flowParamsSchema.parse(request.params);
    const { callbackUrl } = z.object({ callbackUrl: z.string().trim().min(1).max(4000) }).strict().parse(request.body);
    const result = await service.gatewayAdmin(`/__space-gateway/admin/codex/browser/${flowId}/complete`, { callbackUrl });
    const account = connected(result.body);
    if (account) await recordAudit(request, { action: "admin.gateway.account.add", targetType: "gateway_account", targetId: account.id ?? null, metadata: { provider: "CODEX", method: "browser" } });
    return relay(reply, result);
  });

  app.post("/api/admin/gateway/claude/browser", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return relay(reply, await service.gatewayAdmin("/__space-gateway/admin/claude/browser"));
  });

  app.post("/api/admin/gateway/claude/browser/:flowId/complete", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { flowId } = flowParamsSchema.parse(request.params);
    const { code } = z.object({ code: z.string().trim().min(1).max(4000) }).strict().parse(request.body);
    const result = await service.gatewayAdmin(`/__space-gateway/admin/claude/browser/${flowId}/complete`, { code });
    const account = connected(result.body);
    if (account) await recordAudit(request, { action: "admin.gateway.account.add", targetType: "gateway_account", targetId: account.id ?? null, metadata: { provider: "CLAUDE", method: "browser" } });
    return relay(reply, result);
  });

  app.get("/api/admin/gateway/antigravity/profiles", routeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return service.antigravityProfiles();
  });

  app.post("/api/admin/gateway/antigravity/import", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { profileId } = z.object({ profileId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/) }).strict().parse(request.body);
    const result = await service.importAntigravityProfile(profileId);
    const account = connected(result.body);
    if (account) await recordAudit(request, { action: "admin.gateway.account.add", targetType: "gateway_account", targetId: account.id ?? null, metadata: { provider: "ANTIGRAVITY", method: "profile" } });
    return relay(reply, result);
  });

  app.post("/api/admin/gateway/api-key/add", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const input = z.object({
      provider: z.literal("OPENAI_API"),
      apiKey: z.string().trim().min(20).max(400).optional(),
      useSpaceKey: z.boolean().optional(),
      label: z.string().trim().min(1).max(80).optional()
    }).strict().refine((value) => Boolean(value.apiKey) !== Boolean(value.useSpaceKey), "Give an API key or choose the Space key.").parse(request.body);
    const result = await service.addOpenAiApiKey(input);
    const account = connected(result.body);
    if (account) await recordAudit(request, { action: "admin.gateway.account.add", targetType: "gateway_account", targetId: account.id ?? null,
      metadata: { provider: "OPENAI_API", method: input.useSpaceKey ? "space-key" : "api-key" } });
    return relay(reply, result);
  });

  app.post("/api/admin/gateway/codex/import", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { authJson } = z.object({ authJson: z.string().trim().min(2).max(64_000) }).strict().parse(request.body);
    const result = await service.gatewayAdmin("/__space-gateway/admin/codex/import", { authJson });
    const account = connected(result.body);
    if (account) await recordAudit(request, { action: "admin.gateway.account.add", targetType: "gateway_account", targetId: account.id ?? null, metadata: { provider: "CODEX", method: "auth_json" } });
    return relay(reply, result);
  });

  app.post("/api/admin/gateway/accounts/:accountId/usage", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { accountId } = accountParamsSchema.parse(request.params);
    return relay(reply, await service.gatewayAdmin(`/__space-gateway/admin/accounts/${accountId}/usage`));
  });

  app.post("/api/admin/gateway/accounts/:accountId/test", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { accountId } = accountParamsSchema.parse(request.params);
    const { model } = z.object({ model: z.string().regex(/^[A-Za-z0-9._:-]{1,80}$/).optional() }).strict().parse(request.body ?? {});
    const result = await service.gatewayAdmin(`/__space-gateway/admin/accounts/${accountId}/test`, model ? { model } : {});
    await recordAudit(request, { action: "admin.gateway.account.test", targetType: "gateway_account", targetId: accountId, metadata: { model: model ?? null } });
    return relay(reply, result);
  });

  app.post("/api/admin/gateway/accounts/:accountId/reset-credit", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { accountId } = accountParamsSchema.parse(request.params);
    const { idempotencyKey } = z.object({ idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{8,80}$/) }).strict().parse(request.body);
    const result = await service.gatewayAdmin(`/__space-gateway/admin/accounts/${accountId}/reset-credit`, { idempotencyKey });
    await recordAudit(request, { action: "admin.gateway.account.reset_credit", targetType: "gateway_account", targetId: accountId,
      metadata: { outcome: (result.body as { outcome?: unknown } | null)?.outcome ?? null, status: result.status } });
    return relay(reply, result);
  });

  app.delete("/api/admin/gateway/accounts/:accountId", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { accountId } = accountParamsSchema.parse(request.params);
    if (!(await service.deleteAccount(accountId))) return sendApiError(reply, 404, "GATEWAY_ACCOUNT_NOT_FOUND", "Account not found.");
    await recordAudit(request, { action: "admin.gateway.account.delete", targetType: "gateway_account", targetId: accountId });
    return { id: accountId, deleted: true };
  });

  app.get("/api/admin/gateway/keys", routeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return service.listApiKeys();
  });

  app.post("/api/admin/gateway/keys", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const input = gatewayApiKeyCreateRequestSchema.parse(request.body);
    try {
      const created = await service.createApiKey(input, request.user?.id ?? null);
      await recordAudit(request, {
        action: "admin.gateway.key.create", targetType: "gateway_api_key", targetId: created.key.id,
        metadata: { name: created.key.name, trafficClass: created.key.trafficClass, keyPrefix: created.key.keyPrefix }
      });
      return reply.code(201).header("cache-control", "no-store").send(created);
    } catch (error) {
      if (error instanceof GatewayAccountNotFoundError) return sendApiError(reply, 422, "GATEWAY_ACCOUNT_NOT_FOUND", error.message);
      throw error;
    }
  });

  app.patch("/api/admin/gateway/keys/:keyId", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { keyId } = keyParamsSchema.parse(request.params);
    const patch = gatewayApiKeyUpdateRequestSchema.parse(request.body);
    const key = await service.updateApiKey(keyId, patch);
    if (!key) return sendApiError(reply, 404, "GATEWAY_KEY_NOT_FOUND", "API key not found.");
    await recordAudit(request, { action: "admin.gateway.key.update", targetType: "gateway_api_key", targetId: keyId, metadata: { ...patch } });
    return key;
  });

  app.delete("/api/admin/gateway/keys/:keyId", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { keyId } = keyParamsSchema.parse(request.params);
    if (!(await service.deleteApiKey(keyId))) return sendApiError(reply, 404, "GATEWAY_KEY_NOT_FOUND", "API key not found.");
    await recordAudit(request, { action: "admin.gateway.key.delete", targetType: "gateway_api_key", targetId: keyId });
    return { id: keyId, deleted: true };
  });

  app.get("/api/admin/gateway/logs", routeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const query = logsQuerySchema.parse(request.query);
    return service.listRequestLogs(query);
  });

  app.get("/api/admin/gateway/reports", routeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const { from, to } = z.object({ from: day, to: day }).strict().parse(request.query);
    if (from > to) return sendApiError(reply, 422, "INVALID_RANGE", "The start date must not be after the end date.");
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) return sendApiError(reply, 422, "INVALID_RANGE", "Reports cover at most one year.");
    return service.report(from, to);
  });

  app.get("/api/admin/gateway/compression-stats", routeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const { hours } = z.object({ hours: z.coerce.number().int().min(1).max(24 * 90).default(24) }).strict().parse(request.query);
    return service.compressionStats(hours);
  });

  app.get("/api/admin/gateway/settings", routeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    return service.getSettings();
  });

  app.patch("/api/admin/gateway/settings", writeOptions, async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply;
    const patch = gatewaySettingsUpdateRequestSchema.parse(request.body);
    const settings = await service.updateSettings(patch);
    await recordAudit(request, { action: "admin.gateway.settings.update", targetType: "gateway_settings", targetId: "space-gateway", metadata: { ...patch } });
    return settings;
  });
}

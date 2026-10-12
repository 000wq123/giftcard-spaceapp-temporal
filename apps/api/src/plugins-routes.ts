import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { connectPluginInputSchema, agentPluginConfigSchema, isRepositoryProviderId, setRepositoryProviderEnabledSchema } from "@space/contracts";
import { pluginsService } from "./plugins-service.js";
import type { SourceControlService } from "./source-control/service.js";
import type { FastifyRequest } from "fastify";
import { GitControlError } from "./source-control/errors.js";

const pluginIdParamSchema = z.object({
  id: z.string().min(1).max(80)
});

const paneIdParamSchema = z.object({
  paneId: z.string().min(1).max(160)
});

export function registerPluginRoutes(app: FastifyInstance, rateLimitOptions: Record<string, unknown>, personal?: { service: SourceControlService; owner: (request: FastifyRequest) => Promise<string> }): void {
  const isGitProvider = isRepositoryProviderId;
  app.post("/api/plugins/:id/enabled", rateLimitOptions, async (request, reply) => {
    const params = pluginIdParamSchema.safeParse(request.params);
    const body = setRepositoryProviderEnabledSchema.safeParse(request.body);
    if (!params.success || !isGitProvider(params.data.id) || !body.success) {
      return reply.code(400).send({ error: "INVALID_INPUT", message: "Choose a repository provider and a boolean enabled value." });
    }
    if (!personal) return reply.code(503).send({ error: "SOURCE_CONTROL_UNAVAILABLE", message: "Personal repository providers are unavailable." });
    return personal.service.setEnabled(await personal.owner(request), params.data.id, body.data.enabled);
  });
  // Get all plugins with current connection states
  app.get("/api/plugins", rateLimitOptions, async (request) => {
    const catalog = await pluginsService.getPlugins();
    if (!personal) return catalog;
    const owner = await personal.owner(request);
    const providers = await personal.service.providers(owner);
    return Promise.all(catalog.map(async plugin => !isGitProvider(plugin.id) ? plugin : ({
      ...plugin,
      enabled: providers.find(p => p.id === plugin.id)!.enabled,
      available: providers.find(p => p.id === plugin.id)!.available,
      authFields: plugin.authFields.map(field => field.key === "serverUrl" ? { ...field, placeholder: personal.service.defaultGiteaUrl } : field),
      connection: await personal.service.pluginState(owner, plugin.id)
    })));
  });

  // Connect a plugin with credentials
  app.post("/api/plugins/:id/connect", rateLimitOptions, async (request, reply) => {
    const params = pluginIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_PARAM", message: "Invalid plugin id" });
    }

    const body = connectPluginInputSchema.safeParse({
      ...(request.body as object),
      pluginId: params.data.id
    });

    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_BODY", message: body.error.message });
    }

    try {
      if (isGitProvider(params.data.id) && !personal) return reply.code(503).send({ error: "SOURCE_CONTROL_UNAVAILABLE", message: "Personal repository providers are unavailable." });
      if (isGitProvider(params.data.id) && personal) {
        const owner = await personal.owner(request);
        await personal.service.connect(owner, params.data.id, body.data.credentials);
        return personal.service.pluginState(owner, params.data.id);
      }
      const state = await pluginsService.connectPlugin(body.data);
      return state;
    } catch (err: unknown) {
      if (err instanceof GitControlError && err.code === "PROVIDER_NOT_AVAILABLE") return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      const message = err instanceof Error ? err.message : "Failed to connect plugin";
      return reply.code(400).send({ error: "CONNECT_FAILED", message });
    }
  });

  // Disconnect a plugin
  app.post("/api/plugins/:id/disconnect", rateLimitOptions, async (request, reply) => {
    const params = pluginIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_PARAM", message: "Invalid plugin id" });
    }

    if (isGitProvider(params.data.id) && !personal) return reply.code(503).send({ error: "SOURCE_CONTROL_UNAVAILABLE", message: "Personal repository providers are unavailable." });
    if (isGitProvider(params.data.id) && personal) {
      const owner = await personal.owner(request); await personal.service.disconnect(owner, params.data.id);
      return personal.service.pluginState(owner, params.data.id);
    }
    const state = await pluginsService.disconnectPlugin(params.data.id);
    return state;
  });

  // Test connection / health check
  app.post("/api/plugins/:id/test", rateLimitOptions, async (request, reply) => {
    const params = pluginIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_PARAM", message: "Invalid plugin id" });
    }

    if (isGitProvider(params.data.id) && !personal) return reply.code(503).send({ error: "SOURCE_CONTROL_UNAVAILABLE", message: "Personal repository providers are unavailable." });
    if (isGitProvider(params.data.id) && personal) return personal.service.test(await personal.owner(request), params.data.id);
    return await pluginsService.testConnection(params.data.id);
  });

  // Upgrade all plugins with available updates
  app.post("/api/plugins/upgrade-all", rateLimitOptions, async () => {
    return await pluginsService.upgradeAllPlugins();
  });

  // Update plugin to latest version
  app.post("/api/plugins/:id/update", rateLimitOptions, async (request, reply) => {
    const params = pluginIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_PARAM", message: "Invalid plugin id" });
    }

    try {
      return await pluginsService.updatePlugin(params.data.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update plugin";
      return reply.code(400).send({ error: "UPDATE_FAILED", message });
    }
  });

  // Check plugin for updates
  app.post("/api/plugins/:id/check-update", rateLimitOptions, async (request, reply) => {
    const params = pluginIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_PARAM", message: "Invalid plugin id" });
    }

    try {
      return await pluginsService.checkPluginUpdate(params.data.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to check update";
      return reply.code(400).send({ error: "CHECK_UPDATE_FAILED", message });
    }
  });

  // Get agent plugin config
  app.get("/api/plugins/agent/:paneId", rateLimitOptions, async (request, reply) => {
    const params = paneIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_PARAM", message: "Invalid pane id" });
    }

    return await pluginsService.getAgentConfig(params.data.paneId);
  });

  // Set agent plugin config
  app.post("/api/plugins/agent/:paneId", rateLimitOptions, async (request, reply) => {
    const params = paneIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "INVALID_PARAM", message: "Invalid pane id" });
    }

    const body = agentPluginConfigSchema.safeParse({
      ...(request.body as object),
      paneId: params.data.paneId
    });

    if (!body.success) {
      return reply.code(400).send({ error: "INVALID_BODY", message: body.error.message });
    }

    return await pluginsService.setAgentConfig(body.data);
  });
}

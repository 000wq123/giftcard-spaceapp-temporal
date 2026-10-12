import type {} from "./request-context.js";
import type { FastifyInstance, RouteShorthandOptions } from "fastify";
import type { SpaceStore } from "@space/runtime";
import { exportConfigOptionsSchema, importConfigRequestSchema, spaceConfigBundleSchema } from "@space/contracts";
import { sendApiError } from "./http-errors.js";
import type { AuditRecorder } from "./request-audit.js";

/** Parent authentication and CSRF hooks run before these domain authorization checks. */
export function registerConfigurationRoutes(app: FastifyInstance, options: {
  store: Pick<SpaceStore, "exportConfigurationBundle" | "importConfigurationBundle">;
  routeOptions: { config: NonNullable<RouteShorthandOptions["config"]> };
  recordAudit: AuditRecorder;
}) {
  const { store, routeOptions: defaultRouteRateLimitOptions, recordAudit } = options;
  const configurationRouteRateLimitOptions = {
    ...defaultRouteRateLimitOptions,
    bodyLimit: 50 * 1024 * 1024
  };

  app.get("/api/configuration/export", defaultRouteRateLimitOptions, async (request, reply) => {
    if (!request.user) return sendApiError(reply, 401, "UNAUTHORIZED", "Authentication required.");
    const bundle = await store.exportConfigurationBundle({
      userId: request.user.id
    });
    const filename = `spaceapp-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.header("Content-Type", "application/json; charset=utf-8");
    return bundle;
  });

  app.post("/api/configuration/export", defaultRouteRateLimitOptions, async (request, reply) => {
    if (!request.user) return sendApiError(reply, 401, "UNAUTHORIZED", "Authentication required.");
    const input = exportConfigOptionsSchema.parse(request.body ?? {});
    const isAdmin = request.user.role === "ADMIN" || request.user.role === "OPERATOR";
    if (!isAdmin && (input.includeApiKeys || input.includeCredentials)) {
      return sendApiError(reply, 403, "CONFIGURATION_PRIVILEGED_ACCESS_REQUIRED", "Exporting installation secrets requires ADMIN or OPERATOR access.");
    }
    const userId = (isAdmin && input.userId) ? input.userId : request.user.id;
    const bundle = await store.exportConfigurationBundle({
      ...input,
      userId
    });
    return bundle;
  });

  app.post("/api/configuration/inspect", { ...configurationRouteRateLimitOptions, config: { rateLimit: defaultRouteRateLimitOptions.config.rateLimit } }, async (request, reply) => {
    if (!request.user) return sendApiError(reply, 401, "UNAUTHORIZED", "Authentication required.");
    const rawBundle = (request.body && typeof request.body === "object" && "bundle" in (request.body as Record<string, unknown>))
      ? (request.body as Record<string, unknown>).bundle
      : request.body;
    const parsed = spaceConfigBundleSchema.safeParse(rawBundle);
    if (!parsed.success) {
      return reply.status(400).send({
        valid: false,
        error: "Invalid configuration bundle structure.",
        issues: parsed.error.issues
      });
    }
    const b = parsed.data;
    return {
      valid: true,
      version: b.version,
      exportedAt: b.exportedAt,
      source: b.source,
      summary: {
        roomsCount: b.metadata.roomsCount,
        panesCount: b.metadata.panesCount,
        hasUserSettings: Boolean(b.data.userSettings),
        userLinksCount: b.metadata.userLinksCount,
        clipboardItemsCount: b.metadata.clipboardItemsCount,
        taskItemsCount: b.metadata.taskItemsCount,
        cliRuntimeSettingsCount: b.metadata.cliRuntimesCount,
        hasCodexCliModeDefaults: Boolean(b.data.codexCliModeDefaults),
        providersCount: b.metadata.providersCount,
        apiKeysCount: b.metadata.apiKeysCount ?? (b.data.apiKeys ? Object.keys(b.data.apiKeys).length : 0),
        credentialsCount: b.metadata.credentialsCount ?? (b.data.credentials ? Object.keys(b.data.credentials).length : 0)
      },
      rooms: b.data.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        order: r.order,
        panesCount: r.panes?.length || 0
      }))
    };
  });

  app.post("/api/configuration/import", { ...configurationRouteRateLimitOptions, config: { rateLimit: defaultRouteRateLimitOptions.config.rateLimit } }, async (request, reply) => {
    if (!request.user) return sendApiError(reply, 401, "UNAUTHORIZED", "Authentication required.");
    const isAdmin = request.user.role === "ADMIN" || request.user.role === "OPERATOR";
    // A bundle can replace installation-wide runtimes/providers and write credentials.
    // Scoping targetUserId alone cannot make an import safe for a regular USER.
    if (!isAdmin) {
      return sendApiError(reply, 403, "CONFIGURATION_PRIVILEGED_ACCESS_REQUIRED", "Importing installation configuration requires ADMIN or OPERATOR access.");
    }
    const input = importConfigRequestSchema.parse(request.body);
    const targetUserId = (isAdmin && input.targetUserId) ? input.targetUserId : request.user.id;
    const result = await store.importConfigurationBundle(input.bundle, {
      mode: input.mode,
      targetUserId,
      pathRewrite: input.pathRewrite,
      sections: input.sections,
      importApiKeys: input.importApiKeys,
      importCredentials: input.importCredentials,
      secretsDir: input.secretsDir,
      credentialsDir: input.credentialsDir
    });
    await recordAudit(request, {
      action: "configuration.import",
      targetType: "configuration",
      targetId: request.user.id,
      metadata: {
        mode: result.mode,
        stats: result.stats
      }
    });
    return result;
  });

}

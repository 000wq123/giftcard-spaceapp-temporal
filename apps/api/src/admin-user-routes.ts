import type {} from "./request-context.js";
import type { FastifyInstance, RouteShorthandOptions } from "fastify";
import { z } from "zod";
import { adminUserListResponseSchema, updateUserRoleInputSchema } from "@space/contracts";
import type { SpaceStore } from "@space/runtime";
import type { AuditRecorder } from "./request-audit.js";
import { sendApiError } from "./http-errors.js";

export type UserRoleCache = Pick<Map<string, { role: "ADMIN" | "USER" | "OPERATOR"; cachedAt: number }>, "set">;

/** Administrator user management; the parent retains authentication, CSRF, errors and rate limits. */
export function registerAdminUserRoutes(app: FastifyInstance, options: {
  store: Pick<SpaceStore, "listUsersWithRoomCounts" | "updateUserRole" | "getControlActor" | "listUserLinks" |
    "createUserLink" | "listClipboardItems" | "upsertClipboardItem">;
  userRoleCache: UserRoleCache;
  recordAudit: AuditRecorder;
  routeOptions: Pick<RouteShorthandOptions, "config">;
}) {
  const { store, userRoleCache, recordAudit, routeOptions: defaultRouteRateLimitOptions } = options;
  app.get("/api/admin/users", defaultRouteRateLimitOptions, async (request, reply) => {
    if (!request.user || (request.user.role !== "ADMIN" && request.user.role !== "OPERATOR")) {
      return sendApiError(reply, 403, "ADMIN_REQUIRED", "Administrator permissions are required.");
    }
    if (!store.listUsersWithRoomCounts) {
      return { users: [] };
    }
    const users = await store.listUsersWithRoomCounts();
    return adminUserListResponseSchema.parse({ users });
  });

  const roleRank: Record<"USER" | "OPERATOR" | "ADMIN", number> = { USER: 0, OPERATOR: 1, ADMIN: 2 };

  app.patch("/api/admin/users/:id/role", defaultRouteRateLimitOptions, async (request, reply) => {
    if (!request.user || (request.user.role !== "ADMIN" && request.user.role !== "OPERATOR")) {
      return sendApiError(reply, 403, "ADMIN_REQUIRED", "Administrator permissions are required.");
    }
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const input = updateUserRoleInputSchema.parse(request.body);
    const callerRank = roleRank[request.user.role];

    if (params.id === request.user.id && input.role !== "ADMIN") {
      return sendApiError(reply, 400, "CANNOT_DEMOTE_SELF", "You cannot remove admin permissions from your own account.");
    }
    // Nobody grants a role above their own, and nobody changes a user who outranks them.
    if (roleRank[input.role] > callerRank) {
      return sendApiError(reply, 403, "ROLE_ESCALATION_FORBIDDEN", "You cannot grant a role above your own.");
    }
    const target = await store.getControlActor(params.id);
    if (target && roleRank[target.role] > callerRank) {
      return sendApiError(reply, 403, "ROLE_ESCALATION_FORBIDDEN", "You cannot change the role of a user who outranks you.");
    }

    if (!store.updateUserRole) {
      return sendApiError(reply, 501, "NOT_IMPLEMENTED", "User role modification not supported.");
    }

    const updated = await store.updateUserRole(params.id, input.role);
    userRoleCache.set(params.id, { role: input.role, cachedAt: Date.now() });
    await recordAudit(request, {
      actorUserId: request.user.id,
      action: "admin.user.role_change",
      targetType: "user",
      targetId: params.id,
      metadata: { newRole: input.role }
    });

    return { user: updated };
  });

  app.post("/api/admin/users/:id/copy-from-operator", defaultRouteRateLimitOptions, async (request, reply) => {
    if (!request.user || (request.user.role !== "ADMIN" && request.user.role !== "OPERATOR")) {
      return sendApiError(reply, 403, "ADMIN_REQUIRED", "Administrator permissions are required.");
    }
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const targetUser = await store.getControlActor(params.id);
    if (!targetUser) {
      return sendApiError(reply, 404, "USER_NOT_FOUND", "Target user was not found.");
    }
    let copiedLinks = 0;
    let linkPage = 1;
    while (true) {
      const pageResult = await store.listUserLinks("user:operator", { isQuick: undefined, page: linkPage, pageSize: 100 });
      for (const link of pageResult.items) {
        try {
          await store.createUserLink({
            ownerUserId: targetUser.id,
            url: link.url,
            title: link.title,
            description: link.description,
            openMode: link.openMode,
            isQuick: link.isQuick,
            category: link.category
          });
          copiedLinks++;
        } catch {
          // Ignore duplicate links
        }
      }
      if (pageResult.items.length < 100) break;
      linkPage++;
    }

    let copiedClipboard = 0;
    let clipPage = 1;
    while (true) {
      const pageResult = await store.listClipboardItems("user:operator", { page: clipPage, pageSize: 100 });
      for (const item of pageResult.items) {
        try {
          await store.upsertClipboardItem({
            ownerUserId: targetUser.id,
            text: item.text,
            source: item.source,
            title: item.title,
            minimumModel: item.minimumModel ?? undefined,
            minimumReasoning: item.minimumReasoning ?? undefined,
            roomId: item.roomId ?? undefined,
            paneId: item.paneId ?? undefined,
            paneTitle: item.paneTitle ?? undefined
          });
          copiedClipboard++;
        } catch {
          // Ignore duplicate items
        }
      }
      if (pageResult.items.length < 100) break;
      clipPage++;
    }
    await recordAudit(request, {
      actorUserId: request.user.id,
      action: "admin.user.copy_from_operator",
      targetType: "user",
      targetId: params.id,
      metadata: { copiedLinks, copiedClipboard }
    });
    return { ok: true, copiedLinks, copiedClipboard };
  });
}

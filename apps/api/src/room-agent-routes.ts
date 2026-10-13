import type {} from "./request-context.js";
import type { FastifyInstance, RouteShorthandOptions } from "fastify";
import { z } from "zod";
import {
  type AuthUser, roomAgentControlInputSchema, roomAgentMessageInputSchema, roomAgentStartMissionInputSchema,
  roomAgentStopInputSchema
} from "@space/contracts";
import type { InMemoryControlRepository, PostgresControlRepository } from "@space/db";
import { SpaceConflictError, type SpaceStore } from "@space/runtime";
import { operatorBrowserActor } from "./browser-actors.js";
import { recordAudit } from "./request-audit.js";
import type { RoomAgentService } from "./room-agent.js";
import { idParamSchema, parseBody, parseQuery } from "./route-parsing.js";

/**
 * Room Agent session, missions, messages, command acknowledgements, stop, control and transcript; the parent
 * retains authentication, CSRF, errors and rate limits.
 */
export function registerRoomAgentRoutes(app: FastifyInstance, options: {
  store: SpaceStore;
  controlRepository: PostgresControlRepository | InMemoryControlRepository;
  controlUser: (id: string, verifiedEmail?: string) => Promise<AuthUser>;
  roomAgentService: RoomAgentService;
  routeOptions: Pick<RouteShorthandOptions, "config">;
}) {
  const { store, controlRepository, controlUser, roomAgentService, routeOptions: defaultRouteRateLimitOptions } = options;
  app.get("/api/rooms/:id/room-agent", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    return roomAgentService.load(params.id);
  });
  app.get("/api/rooms/:id/room-agent/missions", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    return roomAgentService.inspectMission(params.id);
  });
  app.post("/api/rooms/:id/room-agent/missions", defaultRouteRateLimitOptions, async (request, reply) => {
    if (!request.user || request.user.role !== "ADMIN" || request.user.automationScope) {
      throw new SpaceConflictError("Only an authenticated operator may start a Live mission.");
    }
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(roomAgentStartMissionInputSchema, request.body);
    await store.getRoom(params.id);
    const actor = await controlUser(request.user.id, request.user.email);
    const key = `room-agent:${params.id}`;
    const previous = await controlRepository.get("grant", "shared", key);
    const previousGrant = z.object({ actorId: z.string().nullable() }).safeParse(previous?.value);
    if (previous && !previousGrant.success) throw new SpaceConflictError("Room Agent control grant is invalid.");
    if (previousGrant.success && previousGrant.data.actorId && previousGrant.data.actorId !== actor.id &&
      (await store.listRoomAgentMissions(params.id)).some(mission => ["QUEUED", "RUNNING", "PAUSED"].includes(mission.status))) {
      throw new SpaceConflictError("This room already has an active mission for another operator.");
    }
    if (!await controlRepository.write({ kind: "grant", actorId: "shared", key, roomId: params.id,
      version: (previous?.version ?? 0) + 1, value: { actorId: actor.id } }, previous?.version ?? 0)) {
      throw new SpaceConflictError("Room Agent control grant changed. Retry the same request.");
    }
    const session = await roomAgentService.startMission(params.id, input.objective, input.clientRequestId,
      request.requestIdForSpace, { holderType: "OPERATOR", holderId: actor.id });
    await recordAudit(store, request, { action: "room.agent.mission.start", targetType: "room", targetId: params.id,
      metadata: { sessionId: session.sessionId, missionId: session.missionSnapshot?.mission.id ?? null } });
    return reply.code(202).send(session);
  });
  app.post("/api/rooms/:id/room-agent/messages", defaultRouteRateLimitOptions, async (request, reply) => {
    const params = parseQuery(idParamSchema, request.params);
    if(request.user?.role==="ADMIN"&&!request.user.automationScope){
      const actor=await controlUser(request.user.id,request.user.email);
      const key=`room-agent:${params.id}`,previous=await controlRepository.get("grant","shared",key);
      if (!await controlRepository.write({kind:"grant",actorId:"shared",key,roomId:params.id,version:(previous?.version??0)+1,value:{actorId:actor.id}},previous?.version??0)) {
        throw new SpaceConflictError("Room Agent control grant changed. Retry the same request.");
      }
    }
    const input = parseBody(roomAgentMessageInputSchema, request.body);
    const session = await roomAgentService.send(params.id, input.content, input.clientRequestId, request.requestIdForSpace, operatorBrowserActor(request), input.selectedBrowserPaneId);
    await recordAudit(store, request, {
      action: "room.agent.message",
      targetType: "room",
      targetId: params.id,
      metadata: { sessionId: session.sessionId, queuedMissionCount: session.queuedMissionCount }
    });
    return reply.code(202).send(session);
  });
  app.post("/api/rooms/:id/room-agent/commands/:clientRequestId/ack", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(z.object({ id: z.string().min(1), clientRequestId: z.string().min(1).max(200) }), request.params);
    const input = parseBody(z.object({ ok: z.boolean() }).strict(), request.body);
    return roomAgentService.acknowledgeCommand(params.id, params.clientRequestId, input.ok, operatorBrowserActor(request));
  });
  app.post("/api/rooms/:id/room-agent/stop", defaultRouteRateLimitOptions, async (request) => {
    if (!request.user || request.user.role !== "ADMIN" || request.user.automationScope) throw new SpaceConflictError("Only an authenticated operator may stop a mission.");
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(roomAgentStopInputSchema, request.body ?? {});
    const actor = await controlUser(request.user.id, request.user.email);
    const session = await roomAgentService.stop(params.id, input.reason, request.requestIdForSpace, { expectedMissionId: input.expectedMissionId, actorId: actor.id });
    await recordAudit(store, request, {
      action: "room.agent.stop",
      targetType: "room",
      targetId: params.id,
      metadata: { sessionId: session.sessionId, expectedMissionId: input.expectedMissionId ?? null }
    });
    return session;
  });
  app.post("/api/rooms/:id/room-agent/control", defaultRouteRateLimitOptions, async (request) => {
    if (!request.user || request.user.role !== "ADMIN" || request.user.automationScope) throw new SpaceConflictError("Only an authenticated operator may control a mission.");
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(roomAgentControlInputSchema, request.body ?? {});
    const actor = await controlUser(request.user.id, request.user.email);
    const session = await roomAgentService.control(params.id, input.action, "reason" in input ? input.reason : undefined, request.requestIdForSpace,
      { expectedMissionId: input.expectedMissionId, actorId: actor.id });
    await recordAudit(store, request, {
      action: `room.agent.${input.action.toLowerCase()}`,
      targetType: "room",
      targetId: params.id,
      metadata: { sessionId: session.sessionId, missionId: session.missionSnapshot?.mission.id ?? null, expectedMissionId: input.expectedMissionId ?? null }
    });
    return session;
  });
  app.delete("/api/rooms/:id/room-agent/transcript", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const session = await roomAgentService.clearTranscript(params.id, request.requestIdForSpace);
    await recordAudit(store, request, {
      action: "room.agent.transcript.clear",
      targetType: "room",
      targetId: params.id,
      metadata: { sessionId: session.sessionId }
    });
    return session;
  });
}

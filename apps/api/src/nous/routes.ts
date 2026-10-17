import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { nousDecisionAnswerInputSchema, nousDecisionFeedbackInputSchema, nousDecisionIdSchema, nousSendInputSchema, nousSettingsInputSchema } from "@space/contracts";
import type { NousScorecard } from "./progress.js";
import type { NousService } from "./service.js";

export interface NousRouteDependencies {
  routeOptions: Record<string, unknown>;
  /** The signed-in ADMIN or OPERATOR's user id. */
  owner(request: FastifyRequest): Promise<string>;
  /** A person at the dock, never a proof or automation session: only they answer Nous's critical decisions. */
  assertPerson(request: FastifyRequest): void;
  parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema>;
  parseQuery<TSchema extends z.ZodTypeAny>(schema: TSchema, query: unknown): z.infer<TSchema>;
  /** Nous's scorecard against its 2026-10-17 baseline (read only). */
  progress(owner: string): Promise<NousScorecard>;
}

const decisionParams = z.object({ id: nousDecisionIdSchema }).strict();

/** The Nous dock: state, conversation, settings, decisions and the overview. */
export function registerNousRoutes(app: FastifyInstance, service: NousService, deps: NousRouteDependencies): void {
  const { routeOptions, parseBody, parseQuery } = deps;

  app.get("/api/nous", routeOptions, async (request) => ({ state: await service.state(await deps.owner(request)) }));

  app.get("/api/nous/messages", routeOptions, async (request) => ({ messages: await service.messages(await deps.owner(request)) }));

  app.post("/api/nous/messages", routeOptions, async (request, reply) => {
    const owner = await deps.owner(request);
    const message = await service.send(owner, parseBody(nousSendInputSchema, request.body).content);
    return reply.code(202).send({ message });
  });

  app.delete("/api/nous/messages", routeOptions, async (request) => ({ cleared: await service.clear(await deps.owner(request)) }));

  app.post("/api/nous/stop", routeOptions, async (request) => ({ stopped: service.stop(await deps.owner(request)) }));

  app.patch("/api/nous/settings", routeOptions, async (request) => {
    const owner = await deps.owner(request);
    return { settings: await service.saveSettings(owner, parseBody(nousSettingsInputSchema, request.body)) };
  });

  app.get("/api/nous/overview", routeOptions, async (request) => ({ overview: await service.overview(await deps.owner(request)) }));

  app.get("/api/nous/progress", routeOptions, async (request) => ({ progress: await deps.progress(await deps.owner(request)) }));

  app.get("/api/nous/decisions", routeOptions, async (request) => ({ decisions: await service.decisions(await deps.owner(request)) }));

  app.post("/api/nous/decisions/:id/answer", routeOptions, async (request) => {
    const owner = await deps.owner(request);
    deps.assertPerson(request);
    const { id } = parseQuery(decisionParams, request.params);
    return { decision: await service.answer(owner, id, parseBody(nousDecisionAnswerInputSchema, request.body)) };
  });

  app.post("/api/nous/decisions/:id/feedback", routeOptions, async (request) => {
    const owner = await deps.owner(request);
    deps.assertPerson(request);
    const { id } = parseQuery(decisionParams, request.params);
    return { decision: await service.feedback(owner, id, parseBody(nousDecisionFeedbackInputSchema, request.body).couldHaveDecided) };
  });
}

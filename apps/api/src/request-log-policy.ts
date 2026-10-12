import { LogController, type FastifyReply, type FastifyRequest } from "fastify";

/** Requests slower than this are logged even when they succeed. */
export const SLOW_REQUEST_LOG_MS = 1_000;

/** Errors and slow requests are logged; fast successful requests are not. */
export function shouldLogRequest(statusCode: number, responseTimeMs: number): boolean {
  return statusCode >= 400 || responseTimeMs >= SLOW_REQUEST_LOG_MS;
}

/**
 * Fastify's per-request lines, minus the noise: no "incoming request" line, and
 * "request completed" only for errors and slow requests (with the request
 * fields, since the incoming line is gone). Error-handler and stream-error
 * logs are unchanged.
 */
export class QuietRequestLogController extends LogController {
  override incomingRequest(): void {}

  override requestCompleted(error: Error | null | undefined, request: FastifyRequest, reply: FastifyReply): void {
    if (this.isLogDisabled(request)) return;
    if (error) {
      reply.log.error({ req: request, res: reply, err: error, responseTime: reply.elapsedTime }, "request errored");
      return;
    }
    if (!shouldLogRequest(reply.statusCode, reply.elapsedTime)) return;
    const entry = { req: request, res: reply, responseTime: reply.elapsedTime };
    if (reply.statusCode >= 500) reply.log.warn(entry, "request completed");
    else reply.log.info(entry, "request completed");
  }
}

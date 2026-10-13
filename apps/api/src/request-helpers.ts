/** Request address and header helpers shared by the API composition root and route domains (moved verbatim from it). */
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";

export function requestIpForLog(request: FastifyRequest): string | undefined {
  try {
    return request.ip;
  } catch {
    return undefined;
  }
}

export function headerString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export function secureTokenMatches(expected: string | null, submitted: string | string[] | undefined): boolean {
  const actual = headerString(submitted);
  if (!expected || !actual) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const actualHash = createHash("sha256").update(actual).digest();
  return timingSafeEqual(expectedHash, actualHash);
}

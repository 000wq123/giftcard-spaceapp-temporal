import { z } from "zod";
import {
  claudeUsageAccountListSchema,
  isoDateTimeSchema,
  type ClaudeUsageAccount,
  type ClaudeUsageAccountList
} from "@space/contracts";
import type { ClaudeProfileUsage } from "./claude-usage.js";

const usageCacheTtlMs = 120_000;
const usageStaleFallbackMs = 10 * 60_000;
const percentSchema = z.number().min(0).max(100).nullable();
const timeSchema = isoDateTimeSchema.nullable();

// The wrapper's stdout is the only thing that crosses from the CLI owner into the API.
export const claudeProfileUsageSchema = z
  .object({
    status: z.enum(["CONNECTED", "NOT_CONNECTED", "EXPIRED", "API_KEY", "ERROR"]),
    email: z.string().email().nullable(),
    plan: z.string().max(120).nullable(),
    fiveHourUsedPercent: percentSchema,
    fiveHourResetAt: timeSchema,
    weeklyUsedPercent: percentSchema,
    weeklyResetAt: timeSchema,
    weeklyScope: z.string().max(60).nullable()
  })
  .strict();

export interface ClaudeUsageProviderOptions {
  listProfiles: () => Promise<Array<{ profileId: string; displayName: string }>>;
  readUsage: (profileId: string) => Promise<ClaudeProfileUsage>;
  now?: () => Date;
}

function remaining(used: number | null): number | null {
  return used === null ? null : Math.round((100 - used) * 10) / 10;
}

export function createClaudeUsageAccountProvider(
  options: ClaudeUsageProviderOptions
): () => Promise<ClaudeUsageAccountList> {
  const now = options.now ?? (() => new Date());
  let cached: { value: ClaudeUsageAccountList; collectedAtMs: number } | null = null;
  let inFlight: Promise<ClaudeUsageAccountList> | null = null;

  async function account(profile: { profileId: string; displayName: string }): Promise<ClaudeUsageAccount> {
    const usage = await options.readUsage(profile.profileId)
      .then((value) => claudeProfileUsageSchema.parse(value))
      .catch(() => null);
    return {
      id: profile.profileId,
      label: profile.displayName,
      email: usage?.email ?? null,
      plan: usage?.plan ?? null,
      status: usage?.status ?? "ERROR",
      fiveHourRemainingPercent: remaining(usage?.fiveHourUsedPercent ?? null),
      fiveHourResetAt: usage?.fiveHourResetAt ?? null,
      weeklyRemainingPercent: remaining(usage?.weeklyUsedPercent ?? null),
      weeklyResetAt: usage?.weeklyResetAt ?? null,
      weeklyScope: usage?.weeklyScope ?? null,
      sampledAt: now().toISOString()
    };
  }

  async function collect(): Promise<ClaudeUsageAccountList> {
    const profiles = await options.listProfiles();
    const data = await Promise.all(profiles.slice(0, 100).map(account));
    const collectedAt = now();
    const value = claudeUsageAccountListSchema.parse({
      data,
      pagination: { page: 1, pageSize: 100, totalItems: data.length, totalPages: data.length ? 1 : 0 },
      source: "space-claude-profiles",
      isStale: false,
      error: null,
      checkedAt: collectedAt.toISOString()
    });
    cached = { value, collectedAtMs: collectedAt.getTime() };
    return value;
  }

  function unavailable(): ClaudeUsageAccountList {
    const current = now();
    const error = "Claude usage data is temporarily unavailable.";
    if (cached && current.getTime() - cached.collectedAtMs <= usageStaleFallbackMs) {
      return claudeUsageAccountListSchema.parse({ ...cached.value, isStale: true, error, checkedAt: current.toISOString() });
    }
    return claudeUsageAccountListSchema.parse({
      data: [],
      pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      source: "space-claude-profiles",
      isStale: true,
      error,
      checkedAt: current.toISOString()
    });
  }

  function refresh(): Promise<ClaudeUsageAccountList> {
    if (inFlight) return inFlight;
    const request = collect().catch(() => unavailable());
    inFlight = request;
    const clear = () => {
      if (inFlight === request) inFlight = null;
    };
    void request.then(clear, clear);
    return request;
  }

  return async () => {
    const ageMs = cached ? now().getTime() - cached.collectedAtMs : Number.POSITIVE_INFINITY;
    if (cached && ageMs <= usageCacheTtlMs) return cached.value;
    if (cached && ageMs <= usageStaleFallbackMs) {
      void refresh();
      return cached.value;
    }
    return refresh();
  };
}

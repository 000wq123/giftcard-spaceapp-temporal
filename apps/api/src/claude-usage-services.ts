import { z } from "zod";
import {
  claudeUsageAccountListSchema,
  isoDateTimeSchema,
  type ClaudeGatewayPoolAccount,
  type ClaudeUsageAccount,
  type ClaudeUsageAccountList
} from "@space/contracts";
import type { GatewayAccountRecord } from "@space/db";
import type { ClaudeProfileUsage } from "./claude-usage.js";

const usageCacheTtlMs = 120_000;
const usageStaleFallbackMs = 10 * 60_000;
const percentSchema = z.number().min(0).max(100).nullable();
const timeSchema = isoDateTimeSchema.nullable();

// The wrapper's stdout is the only thing that crosses from the CLI owner into the API.
export const claudeProfileUsageSchema = z
  .object({
    status: z.enum(["CONNECTED", "IDLE", "NOT_CONNECTED", "EXPIRED", "API_KEY", "GATEWAY", "ERROR"]),
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
  /** The Claude accounts Space Gateway routes to, for the gateway profile. */
  gatewayPool?: () => Promise<ClaudeGatewayPoolAccount[]>;
  now?: () => Date;
}

type ProfileUsage = z.infer<typeof claudeProfileUsageSchema>;

function remaining(used: number | null): number | null {
  return used === null ? null : Math.round((100 - used) * 10) / 10;
}

// A quota window whose reset time has passed is full again.
function afterResets(usage: ProfileUsage, nowMs: number): ProfileUsage {
  const lapsed = (resetAt: string | null) => resetAt !== null && Date.parse(resetAt) <= nowMs;
  const fiveHour = lapsed(usage.fiveHourResetAt);
  const weekly = lapsed(usage.weeklyResetAt);
  return {
    ...usage,
    fiveHourUsedPercent: fiveHour ? 0 : usage.fiveHourUsedPercent,
    fiveHourResetAt: fiveHour ? null : usage.fiveHourResetAt,
    weeklyUsedPercent: weekly ? 0 : usage.weeklyUsedPercent,
    weeklyResetAt: weekly ? null : usage.weeklyResetAt,
    weeklyScope: weekly ? null : usage.weeklyScope
  };
}

const shortLabel = (label: string) => (label.includes("@") ? label.slice(0, label.indexOf("@")) || label : label).slice(0, 120);
const isoOrNull = (value: string | null) => (value && isoDateTimeSchema.safeParse(value).success ? value : null);

/**
 * The gateway's Claude accounts as the gateway holds them. A rate-limited account stays out of routing until its
 * blockedUntil, so it counts as used up until then even when its last usage sample says otherwise.
 */
export function claudeGatewayPool(accounts: GatewayAccountRecord[], nowMs: number): ClaudeGatewayPoolAccount[] {
  return accounts
    .filter((account) => account.provider === "CLAUDE" && account.status !== "PAUSED" && account.status !== "DEACTIVATED")
    .slice(0, 50)
    .map((account) => {
      const lapsed = (resetAt: string | null) => resetAt !== null && Date.parse(resetAt) <= nowMs;
      const window = (used: number | null, resetAt: string | null) => lapsed(resetAt)
        ? { remaining: 100, resetAt: null }
        : { remaining: remaining(used), resetAt: isoOrNull(resetAt) };
      let fiveHour = window(account.primaryWindow.usedPercent, account.primaryWindow.resetAt);
      const weekly = window(account.secondaryWindow.usedPercent, account.secondaryWindow.resetAt);
      const blockedUntil = (account.status === "RATE_LIMITED" || account.status === "QUOTA_EXCEEDED")
        && account.blockedUntil && !lapsed(account.blockedUntil) ? isoOrNull(account.blockedUntil) : null;
      if (blockedUntil && (fiveHour.remaining ?? 100) >= 1 && (weekly.remaining ?? 100) >= 1) fiveHour = { remaining: 0, resetAt: blockedUntil };
      return {
        label: shortLabel(account.alias ?? account.label),
        signInRequired: account.status === "REAUTH_REQUIRED",
        fiveHourRemainingPercent: fiveHour.remaining,
        fiveHourResetAt: fiveHour.resetAt,
        weeklyRemainingPercent: weekly.remaining,
        weeklyResetAt: weekly.resetAt
      };
    });
}

export function createClaudeUsageAccountProvider(
  options: ClaudeUsageProviderOptions
): () => Promise<ClaudeUsageAccountList> {
  const now = options.now ?? (() => new Date());
  let cached: { value: ClaudeUsageAccountList; collectedAtMs: number } | null = null;
  let inFlight: Promise<ClaudeUsageAccountList> | null = null;
  const lastConnected = new Map<string, { usage: ProfileUsage; sampledAt: Date }>();

  // An idle account is still signed in, but its expired token cannot ask for usage. Its last
  // sample is the best estimate until a pane uses it again, so it keeps that sample's time.
  function resolveIdle(profileId: string, usage: ProfileUsage | null): { usage: ProfileUsage | null; sampledAt: Date | null } {
    const current = now();
    if (usage?.status === "CONNECTED") lastConnected.set(profileId, { usage, sampledAt: current });
    else if (usage && usage.status !== "IDLE" && usage.status !== "ERROR") lastConnected.delete(profileId);
    if (usage?.status !== "IDLE") return { usage, sampledAt: current };
    const last = lastConnected.get(profileId);
    if (!last) return { usage: { ...usage, status: "CONNECTED" }, sampledAt: null };
    return {
      usage: { ...afterResets(last.usage, current.getTime()), email: usage.email ?? last.usage.email, plan: usage.plan ?? last.usage.plan, status: "CONNECTED" },
      sampledAt: last.sampledAt
    };
  }

  async function account(profile: { profileId: string; displayName: string },
    gatewayPool: () => Promise<ClaudeGatewayPoolAccount[] | null>): Promise<ClaudeUsageAccount> {
    const sampled = await options.readUsage(profile.profileId)
      .then((value) => claudeProfileUsageSchema.parse(value))
      .catch(() => null);
    const { usage, sampledAt } = resolveIdle(profile.profileId, sampled);
    const status = usage?.status ?? "ERROR";
    const pool = status === "GATEWAY" ? await gatewayPool() : null;
    return {
      id: profile.profileId,
      label: profile.displayName,
      email: usage?.email ?? null,
      plan: usage?.plan ?? null,
      status: status === "IDLE" ? "CONNECTED" : status,
      fiveHourRemainingPercent: remaining(usage?.fiveHourUsedPercent ?? null),
      fiveHourResetAt: usage?.fiveHourResetAt ?? null,
      weeklyRemainingPercent: remaining(usage?.weeklyUsedPercent ?? null),
      weeklyResetAt: usage?.weeklyResetAt ?? null,
      weeklyScope: usage?.weeklyScope ?? null,
      sampledAt: sampledAt?.toISOString() ?? null,
      ...(status === "GATEWAY" && pool ? { pool } : {})
    };
  }

  async function collect(): Promise<ClaudeUsageAccountList> {
    const profiles = await options.listProfiles();
    // Read once per collection, and only when a profile signs in through the gateway.
    let pool: Promise<ClaudeGatewayPoolAccount[] | null> | null = null;
    const gatewayPool = () => (pool ??= options.gatewayPool ? options.gatewayPool().catch(() => null) : Promise.resolve(null));
    const data = await Promise.all(profiles.slice(0, 100).map((profile) => account(profile, gatewayPool)));
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

import type {
  AntigravityUsageAccount,
  ClaudeUsageAccount,
  CliAccountBalance,
  CliAccountIdentity,
  CodexUsageAccount,
  CodexUsageAccountList,
} from "@space/contracts";
import type { SharedQuotaCache } from "../desktop-widgets/shared-quota-cache.js";
import { availabilityLabel, bestAvailability, classifyQuota, quotaCapacity, type AvailabilityState } from "../toolbar-metrics/account-availability.js";
import {
  antigravityAccountEntries,
  antigravityStatusLabel,
  claudeAccountEntries,
  claudeStatusLabel,
  codexAccountEntries,
} from "../toolbar-metrics/account-entries.js";

export type CliAccountRuntimeId = "cli:gemini" | "cli:claude" | "cli:copilot" | "cli:cursor" | "cli:kimi";
// The pane account menu also serves Codex, which has no account profiles: its panes reach the ChatGPT accounts of
// Space Gateway, which picks one for each thread.
export type CliAccountMenuRuntimeId = CliAccountRuntimeId | "cli:codex";
export const CODEX_GATEWAY_PROFILE_ID = "space-gateway";

// Antigravity meters Gemini models and Claude/GPT models separately.
export type AntigravityModelGroup = "gemini" | "claude";

export function antigravityModelGroup(modelId: string | null | undefined): AntigravityModelGroup | null {
  if (!modelId) return null;
  if (/gemini/i.test(modelId)) return "gemini";
  if (/claude|sonnet|opus|haiku|gpt/i.test(modelId)) return "claude";
  return null;
}

// ready: usable now; blocked: not usable right now (limit, expired, signed out);
// neutral: signed in without quota data; pending: nothing known yet;
// off: works, but kept out of use (a pay-per-token API key) and only used when picked by hand.
export type CliAccountTone = "ready" | "blocked" | "neutral" | "pending" | "off";

export interface CliAccountQuotaWindow {
  label: string;
  percent: number | null;
}

export interface CliAccountAvailability {
  tone: CliAccountTone;
  // Remaining share of the tightest quota window, when the provider reports one.
  percent: number | null;
  color: string;
  // Short status for the list, e.g. "82%", "Back in 2h", "Not signed in".
  label: string;
  // Longer sentence for tooltips and screen readers.
  description: string;
  // Short line under the name for accounts without an email or login; the description is too long for a narrow menu.
  detail?: string;
  windows: CliAccountQuotaWindow[];
}

// An account Space Gateway routes the CLI's requests to; the menu lists them under the gateway row.
export interface CliAccountPoolMember {
  id: string;
  name: string;
  plan: string | null;
  availability: CliAccountAvailability;
}

export const CLI_ACCOUNT_BLOCKED_COLOR = "hsl(0 82% 58%)";
export const CLI_ACCOUNT_NEUTRAL_COLOR = "hsl(186 34% 58%)";
export const CLI_ACCOUNT_PENDING_COLOR = "hsl(195 10% 50%)";
export const CLI_ACCOUNT_OFF_COLOR = "hsl(215 8% 46%)";

// Remaining quota maps continuously from deep orange (nearly empty) through amber and
// yellow to green (full); red itself is reserved for accounts that cannot be used now.
export function cliAccountAvailabilityColor(percent: number): string {
  const share = Math.min(Math.max(percent, 0), 100) / 100;
  const hue = 16 + share * (142 - 16);
  const saturation = 78 - share * 14;
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% 52%)`;
}

function percentText(value: number): string {
  return `${Math.round(value)}%`;
}

function tightest(...values: Array<number | null | undefined>): number | null {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return known.length ? Math.min(...known) : null;
}

function windowsSummary(windows: CliAccountQuotaWindow[]): string {
  return windows
    .filter((window) => window.percent != null)
    .map((window) => `${window.label} ${percentText(window.percent!)}`)
    .join(" · ");
}

function blocked(label: string, description: string, windows: CliAccountQuotaWindow[] = []): CliAccountAvailability {
  return { tone: "blocked", percent: windows.length ? tightest(...windows.map((window) => window.percent)) : null, color: CLI_ACCOUNT_BLOCKED_COLOR, label, description, windows };
}

type QuotaEntry = Pick<ReturnType<typeof claudeAccountEntries>[number], "availability" | "capacity" | "offlineLabel" | "hint">;

function poolDetail(states: AvailabilityState[], total: number): string {
  const ready = states.filter((state) => state.state === "available").length;
  return `${ready} of ${total} pooled ${total === 1 ? "account" : "accounts"} ready`;
}

function fromQuota(
  entry: QuotaEntry,
  windows: CliAccountQuotaWindow[],
  clock: number,
  scope = "",
): CliAccountAvailability {
  const summary = `${scope}${windowsSummary(windows)}`;
  switch (entry.availability.state) {
    case "available": {
      const percent = entry.capacity >= 0 ? entry.capacity : null;
      if (percent == null) {
        return { tone: "ready", percent: null, color: cliAccountAvailabilityColor(100), label: "Ready", description: "Available now", windows };
      }
      return {
        tone: "ready",
        percent,
        color: cliAccountAvailabilityColor(percent),
        label: percentText(percent),
        description: `Available now · ${percentText(percent)} left${summary ? ` · ${summary}` : ""}`,
        windows,
      };
    }
    case "soon":
    case "exhausted": {
      const label = availabilityLabel(entry.availability, clock);
      return blocked(label, `Not available now · ${label}${summary ? ` · ${summary}` : ""}`, windows);
    }
    case "unknown":
      return { tone: "neutral", percent: null, color: CLI_ACCOUNT_NEUTRAL_COLOR, label: "Signed in", description: "Signed in · no quota data reported", windows };
    default:
      return blocked(entry.offlineLabel ?? "Offline", entry.hint ?? "Not available now");
  }
}

function claudeAvailability(account: ClaudeUsageAccount, clock: number): CliAccountAvailability {
  if (account.status === "API_KEY") {
    const label = account.apiKeyVerified === false ? "Key rejected" : account.apiKeyVerified ? "Paid · ready" : "Paid · not used";
    const fallback = account.gatewayFallback === "ON" ? " · Space Gateway fallback on" : account.gatewayFallback === "OFF" ? " · Space Gateway fallback off" : "";
    return { tone: "off", percent: null, color: CLI_ACCOUNT_OFF_COLOR, label, description: `Paid per token · never chosen automatically${fallback}`,
      detail: account.gatewayFallback === "ON" ? "Per token · Space Gateway fallback on" : "Per token · only when picked by hand", windows: [] };
  }
  if (account.status === "GATEWAY" && account.pool) {
    const entry = claudeAccountEntries([account], clock)[0]!;
    const usable = account.pool.filter((member) => !member.signInRequired);
    const detail = account.pool.length ? poolDetail(usable.map((member) => classifyQuota(member, clock)), account.pool.length) : "No pooled accounts";
    return { ...fromQuota(entry, [], clock, detail), detail };
  }
  if (account.status === "GATEWAY") {
    return { tone: "ready", percent: null, color: cliAccountAvailabilityColor(100), label: "Ready", description: "Available now · Space Gateway picks a pooled Claude account",
      detail: "Picks a pooled Claude account", windows: [] };
  }
  if (account.status !== "CONNECTED") {
    const label = claudeStatusLabel(account);
    return blocked(label, `Not available now · ${label}`);
  }
  const entry = claudeAccountEntries([account], clock)[0]!;
  const windows: CliAccountQuotaWindow[] = [
    { label: "5h", percent: account.fiveHourRemainingPercent ?? null },
    { label: "Week", percent: account.weeklyRemainingPercent ?? null },
  ];
  return fromQuota(entry, windows, clock);
}

function codexWindows(account: CodexUsageAccount): CliAccountQuotaWindow[] {
  return [
    { label: "5h", percent: account.fiveHourRemainingPercent ?? null },
    { label: "Week", percent: account.weeklyRemainingPercent ?? null },
  ];
}

// The gateway is as available as the best ChatGPT account in its pool.
function codexGatewayAvailability(codex: CodexUsageAccountList | null, clock: number): CliAccountAvailability {
  if (!codex) {
    return { tone: "pending", percent: null, color: CLI_ACCOUNT_PENDING_COLOR, label: "Unknown", description: "Space Gateway did not report its ChatGPT accounts",
      detail: "Picks a pooled ChatGPT account", windows: [] };
  }
  if (!codex.data.length) return { ...blocked("No accounts", "Not available now · Space Gateway has no ChatGPT accounts"), detail: "No pooled accounts" };
  const entries = codexAccountEntries(codex.data, clock);
  const states = entries.map((entry) => entry.availability);
  const detail = poolDetail(states, entries.length);
  const entry: QuotaEntry = { availability: bestAvailability(states), capacity: Math.max(-1, ...entries.map((candidate) => candidate.capacity)) };
  return { ...fromQuota(entry, [], clock, detail), detail };
}

// The ChatGPT accounts behind a Codex pane, each judged like the toolbar's Codex cards; null without a sample.
export function cliAccountPool(runtimeId: CliAccountMenuRuntimeId, quota: SharedQuotaCache | null, clock: number): CliAccountPoolMember[] | null {
  if (runtimeId !== "cli:codex" || !quota?.codex) return null;
  return quota.codex.data.map((account) => {
    const entry = codexAccountEntries([account], clock)[0]!;
    const windows = codexWindows(account);
    const availability = fromQuota(entry, windows, clock);
    return {
      id: account.id,
      name: account.label,
      plan: account.planType ? `${account.planType[0]!.toUpperCase()}${account.planType.slice(1)}` : null,
      availability: { ...availability, detail: windowsSummary(windows) || undefined },
    };
  });
}

// A pane on a known model group is judged by that group's quota; otherwise by the best group.
function antigravityAvailability(
  account: AntigravityUsageAccount,
  clock: number,
  modelGroup: AntigravityModelGroup | null,
): CliAccountAvailability {
  if (account.status !== "CONNECTED") {
    const label = antigravityStatusLabel(account.status);
    return blocked(label, `Not available now · ${label}`);
  }
  const windows: CliAccountQuotaWindow[] = [
    { label: "Gemini", percent: tightest(account.gemini.fiveHourRemainingPercent, account.gemini.weeklyRemainingPercent) },
    { label: "Claude · GPT", percent: tightest(account.claude.fiveHourRemainingPercent, account.claude.weeklyRemainingPercent) },
  ].filter((window) => window.percent != null);
  const group = modelGroup === "gemini" ? account.gemini : modelGroup === "claude" ? account.claude : null;
  if (group && (group.fiveHourRemainingPercent != null || group.weeklyRemainingPercent != null)) {
    const entry: QuotaEntry = { availability: classifyQuota(group, clock), capacity: quotaCapacity([group]) };
    return fromQuota(entry, windows, clock, modelGroup === "gemini" ? "For Gemini models · " : "For Claude · GPT models · ");
  }
  const entry = antigravityAccountEntries([account], clock, { proOnly: false, geminiOnly: false })[0]!;
  return fromQuota(entry, windows, clock);
}

function identityAvailability(identity: CliAccountIdentity | null): CliAccountAvailability {
  switch (identity?.authStatus) {
    case "CONNECTED":
      return { tone: "neutral", percent: null, color: CLI_ACCOUNT_NEUTRAL_COLOR, label: "Signed in", description: "Signed in · no quota data reported", windows: [] };
    case "NOT_CONNECTED":
      return blocked("Not signed in", "Not available now · sign in from a pane that uses this account");
    case "UNAVAILABLE":
      return { tone: "pending", percent: null, color: CLI_ACCOUNT_PENDING_COLOR, label: "Unknown", description: "Sign-in status is unavailable", windows: [] };
    default:
      return { tone: "pending", percent: null, color: CLI_ACCOUNT_PENDING_COLOR, label: "Checking…", description: "Checking availability…", windows: [] };
  }
}

type BalanceEntry = CliAccountBalance["profiles"][number];

// Copilot, Cursor and Kimi Code: the quota each account's CLI reports, and the limits Space saw it hit. Null when the
// reading says nothing (no quota reported or a failed read), so the sign-in status speaks instead.
function balanceAvailability(entry: BalanceEntry, clock: number): CliAccountAvailability | null {
  const { usage } = entry;
  const windows: CliAccountQuotaWindow[] = usage.windows.map((window) => ({ label: window.label, percent: window.remainingPercent }));
  const summary = windowsSummary(windows);
  if (entry.exhaustedUntil && Date.parse(entry.exhaustedUntil) > clock) {
    const label = availabilityLabel({ state: "soon", backAt: entry.exhaustedUntil }, clock);
    return blocked(label, `Not available now · this account reached its limit · ${label}`, windows);
  }
  if (usage.status === "NOT_CONNECTED") return blocked("Not signed in", "Not available now · sign in from a pane that uses this account");
  if (usage.status === "GATEWAY") {
    return { tone: "ready", percent: null, color: cliAccountAvailabilityColor(100), label: "Ready", description: "Available now · served through Space Gateway", windows: [] };
  }
  if (usage.status !== "OK") return null;
  const percent = usage.remainingPercent;
  if (percent == null) {
    return { tone: "ready", percent: null, color: cliAccountAvailabilityColor(100), label: "Ready", description: "Available now", windows };
  }
  if (percent <= 0) {
    const label = usage.resetAt ? availabilityLabel({ state: "soon", backAt: usage.resetAt }, clock) : "Limit reached";
    return blocked(label, `Not available now · ${label}${summary ? ` · ${summary}` : ""}`, windows);
  }
  return {
    tone: "ready",
    percent,
    color: cliAccountAvailabilityColor(percent),
    label: percentText(percent),
    description: `Available now · ${percentText(percent)} left${summary ? ` · ${summary}` : ""}`,
    windows,
  };
}

export function cliAccountAvailability(input: {
  runtimeId: CliAccountMenuRuntimeId;
  profileId: string;
  quota: SharedQuotaCache | null;
  identity: CliAccountIdentity | null;
  clock: number;
  // Antigravity only: the model group the pane runs.
  modelGroup?: AntigravityModelGroup | null;
  // Copilot, Cursor and Kimi Code: the balance Auto works from.
  balance?: CliAccountBalance | null;
}): CliAccountAvailability {
  const { runtimeId, profileId, quota, identity, clock } = input;
  if (identity?.authStatus === "NOT_CONNECTED") return identityAvailability(identity);
  // Claude, Antigravity and Codex report quota; until the first sample arrives the account is still being checked.
  if (!quota && (runtimeId === "cli:claude" || runtimeId === "cli:gemini" || runtimeId === "cli:codex")) return identityAvailability(null);
  if (runtimeId === "cli:codex") return codexGatewayAvailability(quota?.codex ?? null, clock);
  if (runtimeId === "cli:claude") {
    const account = quota?.claude?.data.find((candidate) => candidate.id === profileId);
    if (account) return claudeAvailability(account, clock);
  }
  if (runtimeId === "cli:gemini") {
    const account = quota?.agy?.data.find((candidate) => candidate.id === profileId);
    if (account) return antigravityAvailability(account, clock, input.modelGroup ?? null);
  }
  const entry = input.balance?.runtimeId === runtimeId ? input.balance.profiles.find((candidate) => candidate.profileId === profileId) : undefined;
  return (entry ? balanceAvailability(entry, clock) : null) ?? identityAvailability(identity);
}

// The plan each provider reports, shortened for a badge: "Google AI Pro" -> "AI Pro".
export function cliAccountPlan(runtimeId: CliAccountMenuRuntimeId, profileId: string, quota: SharedQuotaCache | null, balance: CliAccountBalance | null = null): string | null {
  if (runtimeId === "cli:claude") {
    const account = quota?.claude?.data.find((candidate) => candidate.id === profileId);
    if (account?.status === "API_KEY") return "API key";
    // The account's name already says Space Gateway.
    if (account?.status === "GATEWAY") return null;
    return account?.plan?.trim() || null;
  }
  if (runtimeId === "cli:gemini") {
    const tier = quota?.agy?.data.find((candidate) => candidate.id === profileId)?.tier?.trim();
    return tier ? tier.replace(/^Google\s+/i, "") : null;
  }
  if (balance?.runtimeId !== runtimeId) return null;
  return balance.profiles.find((candidate) => candidate.profileId === profileId)?.usage.plan?.trim() || null;
}

export function cliAccountInitials(displayName: string): string {
  const words = displayName.trim().split(/[\s._@-]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

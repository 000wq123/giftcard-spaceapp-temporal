import type { GatewayCompressionMode, GatewayProvider, GatewayRoutingStrategy, GatewayServiceState, GatewayTrafficClass } from "@space/contracts";

export const routingStrategyOptions: { value: GatewayRoutingStrategy; label: string; description: string }[] = [
  { value: "CAPACITY_WEIGHTED", label: "Capacity weighted", description: "Prefer accounts with the most usable quota left. Recommended for mixed pools." },
  { value: "RELATIVE_AVAILABILITY", label: "Relative availability", description: "Draw from the strongest available accounts with smoothed weighting." },
  { value: "USAGE_WEIGHTED", label: "Usage weighted", description: "Use recent observed usage to spread load." },
  { value: "ROUND_ROBIN", label: "Round robin", description: "Cycle evenly through eligible accounts, ignoring quota shape." },
  { value: "FILL_FIRST", label: "Fill first", description: "Use one account heavily before moving to the next." },
  { value: "SEQUENTIAL_DRAIN", label: "Sequential drain", description: "Drain accounts in a fixed order." },
  { value: "RESET_DRAIN", label: "Reset drain", description: "Use capacity that is about to reset first." },
  { value: "SINGLE_ACCOUNT", label: "Single account", description: "Send all traffic to one selected account." }
];

export const compressionModeOptions: { value: GatewayCompressionMode; label: string; description: string }[] = [
  { value: "OFF", label: "Off", description: "Requests are forwarded unchanged." },
  { value: "SHADOW", label: "Shadow", description: "Measure what compression would save without changing any request." },
  { value: "ON", label: "On", description: "Compress tool output and other new context before it reaches the provider." }
];

export const trafficClassOptions: { value: GatewayTrafficClass; label: string }[] = [
  { value: "INTERACTIVE", label: "Interactive" },
  { value: "BACKGROUND", label: "Background" },
  { value: "TRANSLATION", label: "Translation" }
];

const providerLabels: Record<GatewayProvider, string> = {
  CODEX: "Codex", CLAUDE: "Claude", ANTIGRAVITY: "Antigravity", COPILOT: "Copilot", OPENAI_API: "OpenAI API",
  ANTHROPIC_API: "Anthropic API", DEEPSEEK: "DeepSeek", OPENROUTER: "OpenRouter", GOOGLE_AI: "Google AI", KIMI: "Kimi", QWEN: "Qwen"
};

export function providerLabel(provider: string): string {
  return providerLabels[provider as GatewayProvider] ?? provider;
}

export function serviceStateLabel(state: GatewayServiceState): string {
  switch (state) {
    case "RUNNING": return "Running";
    case "DRAINING": return "Restarting";
    case "NOT_INSTALLED": return "Not running";
    default: return "Unreachable";
  }
}

export function statusTone(state: GatewayServiceState): "ok" | "warn" | "muted" {
  if (state === "RUNNING") return "ok";
  if (state === "NOT_INSTALLED") return "muted";
  return "warn";
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}

export function formatCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  return value < 0.01 ? "<$0.01" : `$${value.toFixed(2)}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`;
}

export type GatewayTimeFormatPreference = "12H" | "24H";

/** Dates in English whatever the browser locale (the UI is English only); the operator picks 12- or 24-hour time. */
export function formatDateTime(value: string | null, timeFormat: GatewayTimeFormatPreference = "24H", options: { seconds?: boolean; date?: boolean } = {}): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    ...(options.date === false ? {} : { month: "short", day: "numeric" }),
    hour: "2-digit", minute: "2-digit", ...(options.seconds ? { second: "2-digit" } : {}), hour12: timeFormat === "12H"
  });
}

/** Time left until a reset: "in 2h 14m", "in 3d 4h", "now". */
export function formatCountdown(resetAt: string | null, now = Date.now()): string {
  if (!resetAt) return "No reset time";
  const ms = Date.parse(resetAt) - now;
  if (!Number.isFinite(ms)) return "No reset time";
  if (ms <= 0) return "Resetting now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Resets in under a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return `Resets in ${days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${rest}m` : `${rest}m`}`;
}

/** How long ago: "12s ago", "5 min ago", "3 h ago", or the date. */
export function formatAgo(value: string | null, now = Date.now(), timeFormat: GatewayTimeFormatPreference = "24H"): string {
  if (!value) return "Never";
  const ms = now - Date.parse(value);
  if (!Number.isFinite(ms)) return "Unknown";
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h ago`;
  return formatDateTime(value, timeFormat);
}

export function formatMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value >= 10_000 ? `${(value / 1000).toFixed(1)} s` : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

/** Precise cost for small amounts (four decimals under one dollar). */
export function formatCostPrecise(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "$0.00";
  return value < 1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

/** Plus-equivalent credits ("12.4"). */
export function formatCredits(value: number): string {
  return value >= 100 ? Math.round(value).toLocaleString("en-US") : value.toFixed(1).replace(/\.0$/, "");
}

const statusLabels: Record<string, string> = {
  ACTIVE: "Active", RATE_LIMITED: "Rate limited", QUOTA_EXCEEDED: "Quota used up", PAUSED: "Paused", REAUTH_REQUIRED: "Sign in again", DEACTIVATED: "Deactivated"
};
export function accountStatusLabel(status: string): string { return statusLabels[status] ?? status; }
export function accountStatusTone(status: string): "ok" | "warn" | "muted" { return status === "ACTIVE" ? "ok" : status === "PAUSED" ? "muted" : "warn"; }

const planLabels: Record<string, string> = { plus: "Plus", pro: "Pro", prolite: "Pro Lite", free: "Free", team: "Team", business: "Business",
  enterprise: "Enterprise", edu: "Edu", max5x: "Max 5x", max20x: "Max 20x" };
export function planLabel(planType: string | null): string {
  if (!planType) return "Unknown plan";
  return planLabels[planType.toLowerCase()] ?? planType.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function accountName(account: { alias: string | null; label: string }): string { return account.alias ?? account.label; }

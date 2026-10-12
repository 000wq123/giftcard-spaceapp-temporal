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

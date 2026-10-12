import snapshot from "./pricing-snapshot.json" with { type: "json" };

/**
 * API-equivalent request cost, ported from codex-lb `app/core/usage/pricing.py` (MIT, Soju06/codex-lb), with its
 * bundled price snapshot. Costs are what the same tokens would cost on the API, not subscription credits.
 */
export interface ModelPrice {
  input_per_1m: number;
  output_per_1m: number;
  cached_input_per_1m?: number;
  priority_multiplier?: number;
  priority_input_per_1m?: number;
  priority_output_per_1m?: number;
  priority_cached_input_per_1m?: number;
  flex_input_per_1m?: number;
  flex_output_per_1m?: number;
  flex_cached_input_per_1m?: number;
  long_context_threshold_tokens?: number;
  long_context_input_per_1m?: number;
  long_context_output_per_1m?: number;
  long_context_cached_input_per_1m?: number;
  priority_long_context_input_per_1m?: number;
  priority_long_context_output_per_1m?: number;
  priority_long_context_cached_input_per_1m?: number;
  flex_long_context_input_per_1m?: number;
  flex_long_context_output_per_1m?: number;
  flex_long_context_cached_input_per_1m?: number;
}

export interface CostUsage { inputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null }

const defaultPrices = (snapshot as { models: Record<string, ModelPrice> }).models;

/** Glob aliases (longest pattern wins), from codex-lb DEFAULT_MODEL_ALIASES. */
export const defaultModelAliases: Record<string, string> = {
  "gpt-5.6": "gpt-5.6-sol", "gpt-5.6-sol*": "gpt-5.6-sol", "gpt-5.6-terra*": "gpt-5.6-terra", "gpt-5.6-luna*": "gpt-5.6-luna",
  "gpt-5.5-pro*": "gpt-5.5-pro", "gpt-5.5*": "gpt-5.5", "gpt-5.4-pro*": "gpt-5.4-pro", "gpt-5.4-mini*": "gpt-5.4-mini",
  "gpt-5.4-nano*": "gpt-5.4-nano", "gpt-5.4*": "gpt-5.4", "gpt-5.3-codex*": "gpt-5.3-codex", "gpt-5.3-chat-latest*": "gpt-5.3-chat-latest",
  "gpt-5.2-codex*": "gpt-5.2-codex", "gpt-5.2-chat-latest*": "gpt-5.2-chat-latest", "gpt-5.3*": "gpt-5.3", "gpt-5.1-chat-latest*": "gpt-5.1-chat-latest",
  "gpt-5.2*": "gpt-5.2", "gpt-5-chat-latest*": "gpt-5-chat-latest", "gpt-5.1*": "gpt-5.1", "gpt-5*": "gpt-5",
  "gpt-5.1-codex-max*": "gpt-5.1-codex-max", "gpt-5.1-codex-mini*": "gpt-5.1-codex-mini", "gpt-5.1-codex*": "gpt-5.1-codex", "gpt-5-codex*": "gpt-5-codex"
};

function globToRegExp(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}

function resolveAlias(model: string, aliases: Record<string, string>): string | null {
  let best: { length: number; target: string } | null = null;
  for (const [pattern, target] of Object.entries(aliases)) {
    if (globToRegExp(pattern.toLowerCase()).test(model) && (!best || pattern.length > best.length)) best = { length: pattern.length, target };
  }
  return best?.target ?? null;
}

export function priceForModel(model: string | null, prices: Record<string, ModelPrice> = defaultPrices, aliases = defaultModelAliases): { model: string; price: ModelPrice } | null {
  if (!model) return null;
  const normalized = model.toLowerCase();
  for (const [key, price] of Object.entries(prices)) if (key.toLowerCase() === normalized) return { model: key, price };
  const dated = /^(.+)-\d{4}-\d{2}-\d{2}$/.exec(normalized);
  if (dated && prices[dated[1]!]) return { model: dated[1]!, price: prices[dated[1]!]! };
  const alias = resolveAlias(normalized, aliases);
  // A bare `gpt-5*` alias must not price an unknown gpt-5.x model as gpt-5.
  if (!alias || (alias === "gpt-5" && normalized.startsWith("gpt-5."))) return null;
  for (const [key, price] of Object.entries(prices)) if (key.toLowerCase() === alias.toLowerCase()) return { model: key, price };
  return null;
}

const tierOf = (serviceTier: string | null): "priority" | "flex" | null => {
  const normalized = serviceTier?.trim().toLowerCase() ?? null;
  if (normalized === "priority" || normalized === "fast") return "priority";
  if (normalized === "flex") return "flex";
  return null;
};

function effectiveRates(input: number, price: ModelPrice, serviceTier: string | null): [number, number, number] {
  const tier = tierOf(serviceTier);
  const isLong = (price.long_context_threshold_tokens ?? 0) > 0 && input > price.long_context_threshold_tokens!;
  const hasStandardLong = price.long_context_input_per_1m !== undefined && price.long_context_output_per_1m !== undefined;
  let inputRate = price.input_per_1m;
  let cachedRate = price.cached_input_per_1m ?? inputRate;
  let outputRate = price.output_per_1m;
  if (isLong && tier) {
    const longInput = price[`${tier}_long_context_input_per_1m`];
    const longOutput = price[`${tier}_long_context_output_per_1m`];
    const longCached = price[`${tier}_long_context_cached_input_per_1m`];
    if (longInput !== undefined && longOutput !== undefined) return [longInput, longCached ?? longInput, longOutput];
  }
  if (tier === "priority") {
    if (price.priority_input_per_1m !== undefined && price.priority_output_per_1m !== undefined) {
      return [price.priority_input_per_1m, price.priority_cached_input_per_1m ?? price.priority_input_per_1m, price.priority_output_per_1m];
    }
    if (price.priority_multiplier !== undefined) {
      return [inputRate * price.priority_multiplier, cachedRate * price.priority_multiplier, outputRate * price.priority_multiplier];
    }
  }
  if (tier === "flex" && price.flex_input_per_1m !== undefined && price.flex_output_per_1m !== undefined) {
    inputRate = price.flex_input_per_1m;
    cachedRate = price.flex_cached_input_per_1m ?? inputRate;
    outputRate = price.flex_output_per_1m;
    if (isLong && hasStandardLong) return [inputRate * 2, cachedRate * 2, outputRate * 1.5];
    return [inputRate, cachedRate, outputRate];
  }
  if (isLong && hasStandardLong) {
    inputRate = price.long_context_input_per_1m!;
    cachedRate = price.long_context_cached_input_per_1m ?? inputRate;
    outputRate = price.long_context_output_per_1m!;
  }
  return [inputRate, cachedRate, outputRate];
}

/** Cost in USD, or null when usage or the model's price is unknown (unknown stays unknown, never zero). */
export function costUsd(usage: CostUsage | null, model: string | null, serviceTier: string | null, prices?: Record<string, ModelPrice>): number | null {
  if (!usage || usage.inputTokens === null || usage.outputTokens === null) return null;
  const resolved = priceForModel(model, prices);
  if (!resolved) return null;
  const cached = Math.max(0, Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens));
  const [inputRate, cachedRate, outputRate] = effectiveRates(usage.inputTokens, resolved.price, serviceTier);
  return ((usage.inputTokens - cached) / 1e6) * inputRate + (cached / 1e6) * cachedRate + (usage.outputTokens / 1e6) * outputRate;
}

/** Anthropic API list prices per 1M tokens; cache reads cost 0.1x input and 5-minute cache writes 1.25x input. */
const anthropicPrices: Array<{ prefix: string; input: number; output: number }> = [
  { prefix: "claude-opus-4-5", input: 5, output: 25 },
  { prefix: "claude-opus-4-1", input: 15, output: 75 },
  { prefix: "claude-opus-4", input: 15, output: 75 },
  { prefix: "claude-sonnet-4-5", input: 3, output: 15 },
  { prefix: "claude-sonnet-4", input: 3, output: 15 },
  { prefix: "claude-haiku-4-5", input: 1, output: 5 },
  { prefix: "claude-3-7-sonnet", input: 3, output: 15 },
  { prefix: "claude-3-5-haiku", input: 0.8, output: 4 }
];

export interface ClaudeCostUsage {
  inputTokens: number | null;
  cacheReadInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  outputTokens: number | null;
}

/** API-equivalent cost of a Claude request, or null for an unknown model or incomplete usage. */
export function claudeCostUsd(usage: ClaudeCostUsage | null, model: string | null): number | null {
  if (!usage || usage.inputTokens === null || usage.outputTokens === null || !model) return null;
  const normalized = model.toLowerCase();
  // Exact ids, dated snapshots and `-latest` only, so a newer model is never priced as an older one.
  const price = anthropicPrices.find((entry) => new RegExp(`^${entry.prefix}(?:-\\d{8}|-latest)?$`).test(normalized));
  if (!price) return null;
  const read = usage.cacheReadInputTokens ?? 0;
  const write = usage.cacheCreationInputTokens ?? 0;
  return (usage.inputTokens * price.input + read * price.input * 0.1 + write * price.input * 1.25 + usage.outputTokens * price.output) / 1e6;
}

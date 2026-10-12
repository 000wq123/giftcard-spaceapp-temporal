import type { GatewayCompressionRow } from "@space/db";
import type { CompressionOutcome } from "./engine.js";

/** One evaluated request as hourly rollup rows: a request row (strategy '') plus one row per strategy used. */
export function compressionRows(outcome: CompressionOutcome, input: { at: string; mode: "SHADOW" | "ON"; provider: string }): GatewayCompressionRow[] {
  const base = { hour: input.at, mode: input.mode, provider: input.provider, requests: 0, modifiedRequests: 0, blocks: 0, rejectedBlocks: 0,
    errorBlocks: 0, timedOut: 0, originalTokens: 0, compressedTokens: 0, overheadMs: 0, maxOverheadMs: 0 };
  const rows = new Map<string, GatewayCompressionRow>();
  rows.set("", { ...base, strategy: "", requests: 1, modifiedRequests: outcome.modified ? 1 : 0, timedOut: outcome.timedOut ? 1 : 0,
    originalTokens: outcome.modified ? outcome.tokensBefore : 0, compressedTokens: outcome.modified ? outcome.tokensAfter : 0,
    overheadMs: outcome.durationMs, maxOverheadMs: outcome.durationMs });
  for (const block of outcome.blocks) {
    const action = block.action;
    if (action.kind !== "compressed" && action.kind !== "rejected_not_smaller" && action.kind !== "error") continue;
    const row = rows.get(action.strategy) ?? { ...base, strategy: action.strategy };
    if (action.kind === "compressed") {
      row.blocks += 1;
      row.originalTokens += action.originalTokens;
      row.compressedTokens += action.compressedTokens;
    } else if (action.kind === "rejected_not_smaller") row.rejectedBlocks += 1;
    else row.errorBlocks += 1;
    rows.set(action.strategy, row);
  }
  return [...rows.values()];
}

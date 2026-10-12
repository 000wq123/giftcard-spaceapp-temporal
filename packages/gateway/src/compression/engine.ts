import { createHash } from "node:crypto";
import { detectContentType, type ContentType } from "./content-detector.js";
import type { TokenizerKind } from "./tokenizer.js";

/**
 * Live-zone compression of a request body, after Headroom `live_zone.rs` (Apache-2.0, Headroom Contributors):
 * tool outputs are detected, routed to a compressor and kept only when they really need fewer tokens.
 * Compression is deterministic, so a tool output compressed in one turn is byte-identical in the next and the
 * provider prompt cache keeps hitting. Source code, plain text and HTML pass through, as in Headroom 0.37.
 */
export type Strategy = "smart_crusher" | "log_compressor" | "search_compressor" | "diff_compressor";

/** Each returns the compressed text, or null when it left the content unchanged. */
export interface Compressors {
  smartCrusher?: (text: string) => string | null;
  logCompressor?: (text: string) => string | null;
  searchCompressor?: (text: string) => string | null;
  diffCompressor?: (text: string) => string | null;
}

export interface TokenCounter {
  count(text: string): number;
}

export type BlockAction =
  | { kind: "compressed"; strategy: Strategy; contentType: ContentType; originalBytes: number; compressedBytes: number; originalTokens: number; compressedTokens: number }
  | { kind: "below_threshold"; contentType: ContentType | "output_item"; bytes: number; thresholdBytes: number }
  | { kind: "no_compression"; contentType: ContentType }
  | { kind: "rejected_not_smaller"; strategy: Strategy; originalTokens: number; compressedTokens: number }
  | { kind: "error"; strategy: Strategy; error: string };

export interface BlockOutcome { itemIndex: number; blockType: string; action: BlockAction }

export interface CompressionOutcome {
  /** The body to send: the compressed copy, or the original object when nothing changed. */
  body: Record<string, unknown>;
  modified: boolean;
  blocks: BlockOutcome[];
  tokensBefore: number;
  tokensAfter: number;
  durationMs: number;
  /** The time budget ran out; the original body is used. */
  timedOut: boolean;
}

const BLOCK_THRESHOLD_BYTES = 512;
const OUTPUT_ITEM_MIN_BYTES = 512;
const RETRIEVE_TOOL = "headroom_retrieve";

const byteLength = (text: string) => Buffer.byteLength(text, "utf8");

function dispatch(text: string, contentType: ContentType, compressors: Compressors): { strategy: Strategy; compressed: string | null } | null {
  switch (contentType) {
    case "json_array": return compressors.smartCrusher ? { strategy: "smart_crusher", compressed: compressors.smartCrusher(text) } : null;
    case "build": return compressors.logCompressor ? { strategy: "log_compressor", compressed: compressors.logCompressor(text) } : null;
    case "search": return compressors.searchCompressor ? { strategy: "search_compressor", compressed: compressors.searchCompressor(text) } : null;
    case "diff": return compressors.diffCompressor ? { strategy: "diff_compressor", compressed: compressors.diffCompressor(text) } : null;
    default: return null;
  }
}

/** Compresses one text block; returns the replacement text (or null) and what happened. */
export function compressBlock(text: string, compressors: Compressors, tokens: TokenCounter): { replacement: string | null; action: BlockAction } {
  const contentType = detectContentType(text).contentType;
  const bytes = byteLength(text);
  if (text.length > 0 && bytes < BLOCK_THRESHOLD_BYTES) {
    return { replacement: null, action: { kind: "below_threshold", contentType, bytes, thresholdBytes: BLOCK_THRESHOLD_BYTES } };
  }
  let routed: { strategy: Strategy; compressed: string | null } | null;
  try {
    routed = dispatch(text, contentType, compressors);
  } catch (error) {
    const strategy = (contentType === "json_array" ? "smart_crusher" : contentType === "build" ? "log_compressor" : contentType === "search" ? "search_compressor" : "diff_compressor") as Strategy;
    return { replacement: null, action: { kind: "error", strategy, error: error instanceof Error ? error.message : String(error) } };
  }
  if (!routed || routed.compressed === null || routed.compressed === text) return { replacement: null, action: { kind: "no_compression", contentType } };
  const originalTokens = tokens.count(text);
  const compressedTokens = tokens.count(routed.compressed);
  if (compressedTokens >= originalTokens) {
    return { replacement: null, action: { kind: "rejected_not_smaller", strategy: routed.strategy, originalTokens, compressedTokens } };
  }
  return {
    replacement: routed.compressed,
    action: { kind: "compressed", strategy: routed.strategy, contentType, originalBytes: bytes, compressedBytes: byteLength(routed.compressed), originalTokens, compressedTokens }
  };
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : null);

function finish(original: Json, copy: Json, blocks: BlockOutcome[], startedAt: number, now: () => number, timedOut: boolean): CompressionOutcome {
  const compressed = blocks.filter((block) => block.action.kind === "compressed");
  const tokensBefore = compressed.reduce((sum, block) => sum + (block.action.kind === "compressed" ? block.action.originalTokens : 0), 0);
  const tokensAfter = compressed.reduce((sum, block) => sum + (block.action.kind === "compressed" ? block.action.compressedTokens : 0), 0);
  const modified = !timedOut && compressed.length > 0;
  return { body: modified ? copy : original, modified, blocks, tokensBefore, tokensAfter, durationMs: now() - startedAt, timedOut };
}

/**
 * OpenAI Responses bodies (`input` items): every function/shell/patch call output of at least 512 bytes, except
 * outputs of Headroom's own retrieval tool, which must reach the model unchanged.
 */
export function compressResponsesBody(body: Json, options: { compressors: Compressors; tokens: TokenCounter; timeBudgetMs: number; now?: () => number }): CompressionOutcome {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const items = Array.isArray(body.input) ? body.input : null;
  if (!items || items.length === 0) return finish(body, body, [], startedAt, now, false);
  const retrieveCalls = new Set(items.map(obj).filter((item): item is Json => Boolean(item && item.type === "function_call"
    && typeof item.name === "string" && (item.name === RETRIEVE_TOOL || item.name.endsWith(`__${RETRIEVE_TOOL}`)))).map((item) => String(item.call_id)));
  const copy: Json = { ...body, input: [...items] };
  const blocks: BlockOutcome[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = obj(items[index]);
    const type = typeof item?.type === "string" ? item.type : "";
    if (!item || !["function_call_output", "local_shell_call_output", "apply_patch_call_output"].includes(type)) continue;
    if (retrieveCalls.has(String(item.call_id))) continue;
    if (typeof item.output !== "string") continue;
    if (now() - startedAt > options.timeBudgetMs) return finish(body, copy, blocks, startedAt, now, true);
    const bytes = byteLength(item.output);
    if (bytes < OUTPUT_ITEM_MIN_BYTES) {
      blocks.push({ itemIndex: index, blockType: type, action: { kind: "below_threshold", contentType: "output_item", bytes, thresholdBytes: OUTPUT_ITEM_MIN_BYTES } });
      continue;
    }
    const { replacement, action } = compressBlock(item.output, options.compressors, options.tokens);
    blocks.push({ itemIndex: index, blockType: type, action });
    if (replacement !== null) (copy.input as unknown[])[index] = { ...item, output: replacement };
  }
  if (now() - startedAt > options.timeBudgetMs) return finish(body, copy, blocks, startedAt, now, true);
  return finish(body, copy, blocks, startedAt, now, false);
}

export type AsyncBlockRunner = (text: string, deadline: number, options?: {
  tokenizer?: TokenizerKind;
  onLate?: (result: { replacement: string | null; action: BlockAction }) => void;
}) => Promise<{ replacement: string | null; action: BlockAction } | null>;

/** Results by content hash, so a tool output compressed once is reused byte-for-byte in later turns. */
export class CompressionCache {
  private entries = new Map<string, { replacement: string | null; action: BlockAction }>();
  hits = 0;
  misses = 0;
  constructor(private readonly limit = 2000) {}
  /** Token counts differ per tokenizer, so results are kept per tokenizer. */
  key(text: string, tokenizer: TokenizerKind = "o200k") { return `${tokenizer}:${createHash("sha256").update(text, "utf8").digest("hex")}`; }
  get(key: string) {
    const value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); this.hits += 1; } else this.misses += 1;
    return value;
  }
  set(key: string, value: { replacement: string | null; action: BlockAction }) {
    this.entries.set(key, value);
    if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
}

/**
 * The same live zone as `compressResponsesBody`, with blocks compressed concurrently off the event loop and
 * cached by content. Blocks that miss the deadline keep their original text.
 */
export async function compressResponsesBodyAsync(body: Json, options: {
  run: AsyncBlockRunner; cache?: CompressionCache; timeBudgetMs: number; now?: () => number;
}): Promise<CompressionOutcome> {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const deadline = Date.now() + options.timeBudgetMs;
  const items = Array.isArray(body.input) ? body.input : null;
  if (!items || items.length === 0) return finish(body, body, [], startedAt, now, false);
  const retrieveCalls = new Set(items.map(obj).filter((item): item is Json => Boolean(item && item.type === "function_call"
    && typeof item.name === "string" && (item.name === RETRIEVE_TOOL || item.name.endsWith(`__${RETRIEVE_TOOL}`)))).map((item) => String(item.call_id)));
  const copy: Json = { ...body, input: [...items] };
  const blocks: BlockOutcome[] = [];
  const pending: Promise<void>[] = [];
  let timedOut = false;
  for (let index = 0; index < items.length; index += 1) {
    const item = obj(items[index]);
    const type = typeof item?.type === "string" ? item.type : "";
    if (!item || !["function_call_output", "local_shell_call_output", "apply_patch_call_output"].includes(type)) continue;
    if (retrieveCalls.has(String(item.call_id)) || typeof item.output !== "string") continue;
    const text = item.output;
    const bytes = byteLength(text);
    if (bytes < OUTPUT_ITEM_MIN_BYTES) {
      blocks.push({ itemIndex: index, blockType: type, action: { kind: "below_threshold", contentType: "output_item", bytes, thresholdBytes: OUTPUT_ITEM_MIN_BYTES } });
      continue;
    }
    const key = options.cache?.key(text);
    const cached = key ? options.cache!.get(key) : undefined;
    const apply = (result: { replacement: string | null; action: BlockAction }) => {
      blocks.push({ itemIndex: index, blockType: type, action: result.action });
      if (result.replacement !== null) (copy.input as unknown[])[index] = { ...item, output: result.replacement };
    };
    if (cached) { apply(cached); continue; }
    pending.push(options.run(text, deadline, { onLate: key ? (late) => options.cache!.set(key, late) : undefined }).then((result) => {
      if (!result) { timedOut = true; return; }
      if (key) options.cache!.set(key, result);
      apply(result);
    }));
  }
  await Promise.all(pending);
  blocks.sort((a, b) => a.itemIndex - b.itemIndex);
  const outcome = finish(body, copy, blocks, startedAt, now, false);
  return { ...outcome, timedOut };
}

/** Block types that belong to the cached conversation and are never rewritten (Headroom HOT_ZONE_BLOCK_TYPES). */
const ANTHROPIC_HOT_ZONE_BLOCKS = new Set(["tool_use", "thinking", "redacted_thinking", "compaction"]);

/**
 * Messages before and including the last one that carries a `cache_control` marker are the cached prefix
 * (Headroom `compute_frozen_count`); system and tool markers do not move the floor.
 */
export function anthropicFrozenCount(body: Json): number {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  let highest = -1;
  messages.forEach((message, index) => {
    const content = obj(message)?.content;
    if (Array.isArray(content) && content.some((block) => obj(block)?.cache_control !== undefined)) highest = index;
  });
  return highest + 1;
}

/**
 * Anthropic Messages bodies, after Headroom `compress_anthropic_live_zone`: only the latest user message at or
 * above the frozen floor is live. Its string content, `text` blocks and `tool_result` blocks with string content
 * are compressed; tool_use, thinking and compaction blocks, and every earlier message, stay byte-identical so the
 * provider prompt cache keeps hitting.
 */
export async function compressAnthropicBodyAsync(body: Json, options: {
  run: AsyncBlockRunner; cache?: CompressionCache; timeBudgetMs: number; now?: () => number;
}): Promise<CompressionOutcome> {
  const tokenizer: TokenizerKind = "claude";
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const deadline = Date.now() + options.timeBudgetMs;
  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || messages.length === 0) return finish(body, body, [], startedAt, now, false);
  const floor = anthropicFrozenCount(body);
  let target = -1;
  for (let index = messages.length - 1; index >= floor; index -= 1) {
    if (obj(messages[index])?.role === "user") { target = index; break; }
  }
  if (target < 0) return finish(body, body, [], startedAt, now, false);
  const message = obj(messages[target])!;
  const copy: Json = { ...body, messages: [...messages] };
  const replaced: Json = { ...message };
  (copy.messages as unknown[])[target] = replaced;

  const slots: Array<{ blockIndex: number | null; blockType: string; text: string; apply: (text: string) => void }> = [];
  if (typeof message.content === "string") {
    slots.push({ blockIndex: null, blockType: "string_content", text: message.content, apply: (text) => { replaced.content = text; } });
  } else if (Array.isArray(message.content)) {
    const content = [...message.content];
    replaced.content = content;
    content.forEach((raw, blockIndex) => {
      const block = obj(raw);
      const blockType = typeof block?.type === "string" ? block.type : "unknown";
      if (!block || ANTHROPIC_HOT_ZONE_BLOCKS.has(blockType)) return;
      if (blockType === "tool_result" && typeof block.content === "string") {
        slots.push({ blockIndex, blockType, text: block.content, apply: (text) => { content[blockIndex] = { ...block, content: text }; } });
      } else if (blockType === "text" && typeof block.text === "string") {
        slots.push({ blockIndex, blockType, text: block.text, apply: (text) => { content[blockIndex] = { ...block, text }; } });
      }
    });
  }

  const blocks: BlockOutcome[] = [];
  const pending: Promise<void>[] = [];
  let timedOut = false;
  for (const slot of slots) {
    const blockType = slot.blockIndex === null ? slot.blockType : `${slot.blockType}#${slot.blockIndex}`;
    if (slot.text.length === 0) continue;
    const bytes = byteLength(slot.text);
    if (bytes < BLOCK_THRESHOLD_BYTES) {
      blocks.push({ itemIndex: target, blockType, action: { kind: "below_threshold", contentType: detectContentType(slot.text).contentType, bytes,
        thresholdBytes: BLOCK_THRESHOLD_BYTES } });
      continue;
    }
    const key = options.cache?.key(slot.text, tokenizer);
    const cached = key ? options.cache!.get(key) : undefined;
    const apply = (result: { replacement: string | null; action: BlockAction }) => {
      blocks.push({ itemIndex: target, blockType, action: result.action });
      if (result.replacement !== null) slot.apply(result.replacement);
    };
    if (cached) { apply(cached); continue; }
    pending.push(options.run(slot.text, deadline, { tokenizer, onLate: key ? (late) => options.cache!.set(key, late) : undefined }).then((result) => {
      if (!result) { timedOut = true; return; }
      if (key) options.cache!.set(key, result);
      apply(result);
    }));
  }
  await Promise.all(pending);
  blocks.sort((a, b) => a.blockType.localeCompare(b.blockType, "en", { numeric: true }));
  const outcome = finish(body, copy, blocks, startedAt, now, false);
  return { ...outcome, timedOut };
}

import { createHash } from "node:crypto";
import { detectContentType, type ContentType } from "./content-detector.js";
import { bestLosslessFold, looksLikeDiff } from "./lossless/index.js";
import { isMixedContent, splitIntoSections, type ContentSection } from "./mixed-content.js";
import { isReadCommand, READ_TOOL_NAMES, toolCallCommand } from "./read-protection.js";
import type { TokenizerKind } from "./tokenizer.js";
import { detectWasteSignals, REREAD_ADJACENT_GAP, REREAD_MIN_TOKENS, type WasteSignals } from "./waste-signals.js";

/**
 * Live-zone compression of a request body, after Headroom `live_zone.rs` (Apache-2.0, Headroom Contributors):
 * tool outputs are detected, routed to a compressor and kept only when they really need fewer tokens.
 * Compression is deterministic, so a tool output compressed in one turn is byte-identical in the next and the
 * provider prompt cache keeps hitting. Source code and plain text pass through, as in Headroom 0.37's live zone, unless
 * code and prose compression is on (Headroom's content router: lossless folds, CodeAware, mixed content, and
 * TextCrusher where Headroom runs its Kompress model). HTML passes through: Headroom extracts it with trafilatura.
 */
export type Strategy = "smart_crusher" | "log_compressor" | "search_compressor" | "diff_compressor" | "lossless_fold" | "code_aware" | "text_crusher" | "mixed";

/** Each returns the compressed text, or null when it left the content unchanged. */
export interface Compressors {
  smartCrusher?: (text: string) => string | null;
  logCompressor?: (text: string) => string | null;
  searchCompressor?: (text: string) => string | null;
  diffCompressor?: (text: string) => string | null;
  /** Source code with function bodies shortened (CodeAware); `language` comes from a code fence. */
  codeAware?: (text: string, language?: string | null) => string | null;
  /** Prose reduced to its most salient sentences (TextCrusher). */
  textCrusher?: (text: string) => string | null;
}

/** Code and prose compression: OFF (pass through), SHADOW (measured, never sent) or ON. */
export type CodeTextMode = "OFF" | "SHADOW" | "ON";

export interface BlockOptions {
  codeText?: CodeTextMode;
  /** Lossy code and prose transforms are allowed (Token profile, not a file read); otherwise only lossless folds. */
  lossy?: boolean;
}

export interface TokenCounter {
  count(text: string): number;
}

export type BlockAction =
  | { kind: "compressed"; strategy: Strategy; contentType: ContentType; originalBytes: number; compressedBytes: number; originalTokens: number; compressedTokens: number;
      /** Measured only: code and prose compression is in Shadow, so the original text is sent. */
      shadow?: boolean }
  | { kind: "below_threshold"; contentType: ContentType | "output_item"; bytes: number; thresholdBytes: number }
  | { kind: "no_compression"; contentType: ContentType }
  | { kind: "rejected_not_smaller"; strategy: Strategy; originalTokens: number; compressedTokens: number; shadow?: boolean }
  | { kind: "error"; strategy: Strategy; error: string; shadow?: boolean };

/** Waste signals of a block and how long each stage took (ms), measured where the block was compressed. */
export interface BlockAnalysis { waste: WasteSignals; stageMs: Record<string, number> }

export interface BlockResult { replacement: string | null; action: BlockAction; analysis?: BlockAnalysis }

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
  /** Waste signal tokens over the evaluated blocks (Headroom "What was removed"), re-reads included. */
  waste: Record<string, number>;
  /** Milliseconds per pipeline stage, summed over blocks compressed for this request (cache hits cost none). */
  stageMs: Record<string, number>;
  cacheHits: number;
}

const BLOCK_THRESHOLD_BYTES = 512;
const OUTPUT_ITEM_MIN_BYTES = 512;
const RETRIEVE_TOOL = "headroom_retrieve";
/**
 * Tool results in a Responses body. Headroom 0.37 covers the first three; current Codex sends its exec and patch
 * results as `custom_tool_call_output`, often as an array of text parts, so Space Gateway covers those too.
 */
const RESPONSES_OUTPUT_TYPES = new Set(["function_call_output", "local_shell_call_output", "apply_patch_call_output", "custom_tool_call_output"]);

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

/** Headroom `_lossy_min_extra_savings`: a lossy pass after a fold must save 5% more than the fold. */
const LOSSY_MIN_EXTRA_SAVINGS = 0.05;
/** Headroom trusts its detector over the mixed-content heuristics only at this confidence. */
const CODE_CONFIDENCE = 0.8;

const FENCE_LANGUAGES: Record<string, string> = {
  py: "python", python: "python", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", javascript: "javascript", node: "javascript",
  ts: "typescript", tsx: "typescript", mts: "typescript", typescript: "typescript", go: "go", golang: "go", rs: "rust", rust: "rust", java: "java",
  c: "c", h: "c", cpp: "cpp", "c++": "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp"
};

/** Prose: the lossless fold, then TextCrusher when lossy is allowed and it saves 5% more than the fold. */
function compressProse(text: string, compressors: Compressors, tokens: TokenCounter, lossy: boolean): { strategy: Strategy; compressed: string | null } {
  const fold = bestLosslessFold(text);
  const base = fold?.text ?? text;
  if (lossy && compressors.textCrusher && !looksLikeDiff(text)) {
    const crushed = compressors.textCrusher(base);
    if (crushed !== null && crushed !== base && (!fold || tokens.count(crushed) <= tokens.count(base) * (1 - LOSSY_MIN_EXTRA_SAVINGS))) {
      return { strategy: "text_crusher", compressed: crushed };
    }
  }
  return { strategy: "lossless_fold", compressed: fold?.text ?? null };
}

/**
 * Source code: the lossless fold, or CodeAware when lossy is allowed and it saves 5% more than the fold. CodeAware
 * reads the original (a folded file no longer parses); Headroom returns the fold without trying CodeAware.
 */
function compressSource(text: string, compressors: Compressors, tokens: TokenCounter, lossy: boolean, language: string | null = null): { strategy: Strategy; compressed: string | null } {
  const fold = bestLosslessFold(text);
  if (lossy && compressors.codeAware) {
    const compressed = compressors.codeAware(text, language);
    if (compressed !== null && compressed !== text && (!fold || tokens.count(compressed) <= tokens.count(fold.text) * (1 - LOSSY_MIN_EXTRA_SAVINGS))) {
      return { strategy: "code_aware", compressed };
    }
  }
  return { strategy: "lossless_fold", compressed: fold?.text ?? null };
}

/** One section of mixed content, by its type; lossy compressors only see sections above the block threshold. */
function compressSection(section: ContentSection, compressors: Compressors, tokens: TokenCounter, lossy: boolean): string | null {
  const big = byteLength(section.content) >= BLOCK_THRESHOLD_BYTES;
  switch (section.type) {
    case "json_array": return big && compressors.smartCrusher ? compressors.smartCrusher(section.content) : null;
    case "search": {
      if (big && compressors.searchCompressor) {
        const compressed = compressors.searchCompressor(section.content);
        if (compressed !== null) return compressed;
      }
      return bestLosslessFold(section.content, "search")?.text ?? null;
    }
    case "source_code": {
      const language = section.language && section.language !== "unknown" ? FENCE_LANGUAGES[section.language.toLowerCase()] ?? null : null;
      return compressSource(section.content, compressors, tokens, lossy && big, language).compressed;
    }
    case "text": return compressProse(section.content, compressors, tokens, lossy && big).compressed;
  }
}

/**
 * Mixed content (Headroom `_compress_mixed`): each section is compressed by its own type and put back in place of
 * its lines, so lines between sections and code fence markers stay byte-identical.
 */
function compressMixed(text: string, compressors: Compressors, tokens: TokenCounter, lossy: boolean): string | null {
  const lines = text.split("\n");
  const sections = splitIntoSections(text);
  for (const section of [...sections].reverse()) {
    const replacement = compressSection(section, compressors, tokens, lossy);
    if (replacement === null || replacement === section.content) continue;
    const start = section.isCodeFence ? section.startLine + 1 : section.startLine;
    const end = section.isCodeFence ? Math.min(section.endLine, lines.length) - 1 : section.endLine;
    lines.splice(start, end - start + 1, ...replacement.split("\n"));
  }
  const result = lines.join("\n");
  return result === text ? null : result;
}

/** Code and prose routing: mixed content by section, then source code and prose. */
function dispatchCodeText(text: string, detection: { contentType: ContentType; confidence: number }, compressors: Compressors, tokens: TokenCounter,
  lossy: boolean): { strategy: Strategy; compressed: string | null } {
  if (!(detection.contentType === "source_code" && detection.confidence >= CODE_CONFIDENCE) && isMixedContent(text)) {
    return { strategy: "mixed", compressed: compressMixed(text, compressors, tokens, lossy) };
  }
  return detection.contentType === "source_code" ? compressSource(text, compressors, tokens, lossy) : compressProse(text, compressors, tokens, lossy);
}

const CODE_TEXT_TYPES = new Set<ContentType>(["source_code", "text"]);

/**
 * Compresses one text block; returns the replacement text (or null), what happened, and the block's waste signals
 * with stage timings (content router, compressor, token count, waste detection).
 */
export function compressBlock(text: string, compressors: Compressors, tokens: TokenCounter, clock: () => number = () => performance.now(),
  options: BlockOptions = {}): BlockResult {
  const stageMs: Record<string, number> = {};
  const timed = <T>(stage: string, run: () => T): T => {
    const started = clock();
    try { return run(); } finally { stageMs[stage] = (stageMs[stage] ?? 0) + (clock() - started); }
  };
  const detection = timed("content_router", () => detectContentType(text));
  const contentType = detection.contentType;
  const codeText = options.codeText ?? "OFF";
  const extended = codeText !== "OFF" && CODE_TEXT_TYPES.has(contentType);
  const shadowFlag = extended && codeText === "SHADOW" ? { shadow: true } : {};
  const bytes = byteLength(text);
  if (text.length > 0 && bytes < BLOCK_THRESHOLD_BYTES) {
    return { replacement: null, action: { kind: "below_threshold", contentType, bytes, thresholdBytes: BLOCK_THRESHOLD_BYTES } };
  }
  const waste = timed("waste_signals", () => detectWasteSignals(text, tokens));
  const analysis = { waste, stageMs };
  let routed: { strategy: Strategy; compressed: string | null } | null;
  try {
    routed = timed("compressor", () => (extended ? dispatchCodeText(text, detection, compressors, tokens, options.lossy ?? false) : dispatch(text, contentType, compressors)));
  } catch (error) {
    const strategy: Strategy = extended ? (contentType === "source_code" ? "code_aware" : "text_crusher")
      : contentType === "json_array" ? "smart_crusher" : contentType === "build" ? "log_compressor" : contentType === "search" ? "search_compressor" : "diff_compressor";
    return { replacement: null, action: { kind: "error", strategy, error: error instanceof Error ? error.message : String(error), ...shadowFlag }, analysis };
  }
  if (!routed || routed.compressed === null || routed.compressed === text) return { replacement: null, action: { kind: "no_compression", contentType }, analysis };
  // Headroom names the stage after the strategy that ran.
  stageMs[`compressor:${routed.strategy}`] = stageMs.compressor ?? 0;
  delete stageMs.compressor;
  const [originalTokens, compressedTokens] = timed("token_count", () => [tokens.count(text), tokens.count(routed!.compressed!)]);
  if (compressedTokens >= originalTokens) {
    return { replacement: null, action: { kind: "rejected_not_smaller", strategy: routed.strategy, originalTokens, compressedTokens, ...shadowFlag }, analysis };
  }
  return {
    replacement: "shadow" in shadowFlag ? null : routed.compressed,
    action: { kind: "compressed", strategy: routed.strategy, contentType, originalBytes: bytes, compressedBytes: byteLength(routed.compressed), originalTokens, compressedTokens,
      ...shadowFlag },
    analysis
  };
}

/** Sums block analyses; re-reads add the estimated tokens (Headroom: count + 4) of results served again later. */
function summarize(results: Array<{ analysis?: BlockAnalysis; cached: boolean }>, rereads: number) {
  const waste: Record<string, number> = {};
  const stageMs: Record<string, number> = {};
  let cacheHits = 0;
  for (const result of results) {
    if (result.cached) cacheHits += 1;
    for (const [name, tokens] of Object.entries(result.analysis?.waste ?? {})) if (tokens > 0) waste[name] = (waste[name] ?? 0) + tokens;
    if (!result.cached) for (const [stage, ms] of Object.entries(result.analysis?.stageMs ?? {})) stageMs[stage] = (stageMs[stage] ?? 0) + ms;
  }
  if (rereads > 0) waste.reread = rereads;
  return { waste, stageMs, cacheHits };
}

interface ServedResult { position: number; text: string; callId: string | null }
interface IssuedCall { position: number; callId: string; key: string }

/** JSON with sorted object keys, so the same arguments compare equal however they were serialized. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Json)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Headroom `_canonical_call_key`: the tool name and its arguments with key order normalized. */
function callKey(name: string, args: unknown): string {
  let parsed = args;
  if (typeof parsed === "string") { try { parsed = JSON.parse(parsed); } catch { /* compared as text */ } }
  const canonical = parsed && typeof parsed === "object" ? canonicalJson(parsed) : String(parsed);
  return createHash("sha256").update(`${name}\u0000${canonical}`, "utf8").digest("hex");
}

/**
 * Re-read tokens (Headroom `parse_messages`): a tool result of 50+ estimated tokens served again more than three
 * positions after its last serve, and the result of a call re-issued with the same tool and arguments (its bytes
 * may differ: timestamps, ordering). Nearer repeats are polling and only move the baseline; a result is counted once.
 */
function rereadTokens(served: ServedResult[], calls: IssuedCall[] = []): number {
  const tokensOf = (text: string) => Math.ceil(text.length / 4);
  const last = new Map<string, number>();
  const counted = new Set<ServedResult>();
  let total = 0;
  for (const entry of served) {
    const hash = createHash("sha256").update(entry.text, "utf8").digest("hex");
    const tokens = tokensOf(entry.text);
    const previous = last.get(hash);
    if (previous !== undefined && previous !== entry.position && tokens >= REREAD_MIN_TOKENS && entry.position - previous > REREAD_ADJACENT_GAP) {
      total += tokens + 4;
      counted.add(entry);
    }
    if (previous !== entry.position) last.set(hash, entry.position);
  }
  const resultByCall = new Map<string, ServedResult>();
  for (const entry of served) if (entry.callId && !resultByCall.has(entry.callId)) resultByCall.set(entry.callId, entry);
  const lastCall = new Map<string, number>();
  for (const call of calls) {
    const previous = lastCall.get(call.key);
    if (previous === undefined || previous === call.position) { lastCall.set(call.key, call.position); continue; }
    lastCall.set(call.key, call.position);
    if (call.position - previous <= REREAD_ADJACENT_GAP) continue;
    const result = resultByCall.get(call.callId);
    if (!result || counted.has(result) || tokensOf(result.text) < REREAD_MIN_TOKENS) continue;
    total += tokensOf(result.text) + 4;
    counted.add(result);
  }
  return total;
}

/** Tool calls of a Responses input with their identity, for re-issued call detection. */
function responsesCalls(items: unknown[]): IssuedCall[] {
  const out: IssuedCall[] = [];
  items.forEach((raw, position) => {
    const item = obj(raw);
    if (!item || typeof item.call_id !== "string") return;
    if (item.type === "function_call" || item.type === "custom_tool_call") {
      out.push({ position, callId: item.call_id, key: callKey(String(item.name ?? ""), item.type === "function_call" ? item.arguments : item.input) });
    } else if (item.type === "local_shell_call") out.push({ position, callId: item.call_id, key: callKey("local_shell", obj(item.action)?.command ?? null) });
  });
  return out;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : null);

function finish(original: Json, copy: Json, blocks: BlockOutcome[], startedAt: number, now: () => number, timedOut: boolean,
  summary: { waste: Record<string, number>; stageMs: Record<string, number>; cacheHits: number } = { waste: {}, stageMs: {}, cacheHits: 0 }): CompressionOutcome {
  const compressed = blocks.filter((block) => block.action.kind === "compressed" && !block.action.shadow);
  const tokensBefore = compressed.reduce((sum, block) => sum + (block.action.kind === "compressed" ? block.action.originalTokens : 0), 0);
  const tokensAfter = compressed.reduce((sum, block) => sum + (block.action.kind === "compressed" ? block.action.compressedTokens : 0), 0);
  const modified = !timedOut && compressed.length > 0;
  return { body: modified ? copy : original, modified, blocks, tokensBefore, tokensAfter, durationMs: now() - startedAt, timedOut, ...summary };
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
  const analyses: Array<{ analysis?: BlockAnalysis; cached: boolean }> = [];
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
    const { replacement, action, analysis } = compressBlock(item.output, options.compressors, options.tokens);
    blocks.push({ itemIndex: index, blockType: type, action });
    analyses.push({ analysis, cached: false });
    if (replacement !== null) (copy.input as unknown[])[index] = { ...item, output: replacement };
  }
  const summary = summarize(analyses, rereadTokens(served(items), responsesCalls(items)));
  if (now() - startedAt > options.timeBudgetMs) return finish(body, copy, blocks, startedAt, now, true, summary);
  return finish(body, copy, blocks, startedAt, now, false, summary);
}

/** Every tool result text of a Responses input, with its position and call, for re-read detection. */
function served(items: unknown[]): ServedResult[] {
  const out: ServedResult[] = [];
  items.forEach((raw, position) => {
    const item = obj(raw);
    if (!item || !RESPONSES_OUTPUT_TYPES.has(String(item.type))) return;
    const callId = typeof item.call_id === "string" ? item.call_id : null;
    if (typeof item.output === "string") out.push({ position, text: item.output, callId });
    else if (Array.isArray(item.output)) {
      const text = item.output.map((part) => obj(part)?.text).filter((value): value is string => typeof value === "string").join("\n");
      if (text) out.push({ position, text, callId });
    }
  });
  return out;
}

export type AsyncBlockRunner = (text: string, deadline: number, options?: BlockOptions & {
  tokenizer?: TokenizerKind;
  onLate?: (result: BlockResult) => void;
}) => Promise<BlockResult | null>;

/** How a request's blocks are compressed: code and prose mode, and the profile (Token allows lossy transforms). */
export interface BodyCompressionOptions {
  run: AsyncBlockRunner;
  cache?: CompressionCache;
  timeBudgetMs: number;
  now?: () => number;
  codeText?: CodeTextMode;
  profile?: "CACHE" | "TOKEN";
}

/** Block options for a tool result; file reads, which agents patch byte for byte, get lossless folds only. */
function blockOptions(options: BodyCompressionOptions, read: boolean): BlockOptions {
  const codeText = options.codeText ?? "OFF";
  return codeText === "OFF" ? {} : { codeText, lossy: options.profile !== "CACHE" && !read };
}

const variant = (block: BlockOptions) => (block.codeText ? `${block.codeText}:${block.lossy ? "lossy" : "lossless"}` : "");

/** Results by content hash, so a tool output compressed once is reused byte-for-byte in later turns. */
export class CompressionCache {
  private entries = new Map<string, BlockResult>();
  hits = 0;
  misses = 0;
  constructor(private readonly limit = 2000) {}
  /** Token counts differ per tokenizer and results per block options, so both are part of the key. */
  key(text: string, tokenizer: TokenizerKind = "o200k", options = "") {
    return `${tokenizer}:${options ? `${options}:` : ""}${createHash("sha256").update(text, "utf8").digest("hex")}`;
  }
  get(key: string) {
    const value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); this.hits += 1; } else this.misses += 1;
    return value;
  }
  set(key: string, value: BlockResult) {
    this.entries.set(key, value);
    if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
}

/**
 * The same live zone as `compressResponsesBody`, with blocks compressed concurrently off the event loop and
 * cached by content. Blocks that miss the deadline keep their original text.
 */
export async function compressResponsesBodyAsync(body: Json, options: BodyCompressionOptions): Promise<CompressionOutcome> {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const deadline = Date.now() + options.timeBudgetMs;
  const items = Array.isArray(body.input) ? body.input : null;
  if (!items || items.length === 0) return finish(body, body, [], startedAt, now, false);
  const retrieveCalls = new Set(items.map(obj).filter((item): item is Json => Boolean(item && (item.type === "function_call" || item.type === "custom_tool_call")
    && typeof item.name === "string" && (item.name === RETRIEVE_TOOL || item.name.endsWith(`__${RETRIEVE_TOOL}`)))).map((item) => String(item.call_id)));
  const reads = responsesReadCalls(items);
  const copy: Json = { ...body, input: [...items] };
  const blocks: BlockOutcome[] = [];
  const analyses: Array<{ analysis?: BlockAnalysis; cached: boolean }> = [];
  const pending: Promise<void>[] = [];
  let timedOut = false;
  /** The item's copy in the outgoing body, made once so several parts of one output can be replaced. */
  const outgoingItem = (index: number, item: Json): Json => {
    const current = (copy.input as unknown[])[index];
    if (current !== item) return current as Json;
    const fresh: Json = { ...item, ...(Array.isArray(item.output) ? { output: [...item.output] } : {}) };
    (copy.input as unknown[])[index] = fresh;
    return fresh;
  };
  const evaluate = (index: number, blockType: string, text: string, block: BlockOptions, write: (replacement: string) => void) => {
    const bytes = byteLength(text);
    if (bytes < OUTPUT_ITEM_MIN_BYTES) {
      blocks.push({ itemIndex: index, blockType, action: { kind: "below_threshold", contentType: "output_item", bytes, thresholdBytes: OUTPUT_ITEM_MIN_BYTES } });
      return;
    }
    const key = options.cache?.key(text, "o200k", variant(block));
    const cached = key ? options.cache!.get(key) : undefined;
    const apply = (result: BlockResult, fromCache: boolean) => {
      blocks.push({ itemIndex: index, blockType, action: result.action });
      analyses.push({ analysis: result.analysis, cached: fromCache });
      if (result.replacement !== null) write(result.replacement);
    };
    if (cached) { apply(cached, true); return; }
    pending.push(options.run(text, deadline, { ...block, onLate: key ? (late) => options.cache!.set(key, late) : undefined }).then((result) => {
      if (!result) { timedOut = true; return; }
      if (key) options.cache!.set(key, result);
      apply(result, false);
    }));
  };
  for (let index = 0; index < items.length; index += 1) {
    const item = obj(items[index]);
    const type = typeof item?.type === "string" ? item.type : "";
    if (!item || !RESPONSES_OUTPUT_TYPES.has(type) || retrieveCalls.has(String(item.call_id))) continue;
    const block = blockOptions(options, reads.has(String(item.call_id)));
    if (typeof item.output === "string") {
      evaluate(index, type, item.output, block, (replacement) => { outgoingItem(index, item).output = replacement; });
    } else if (Array.isArray(item.output)) {
      // Current Codex sends tool results as content parts ({ type: "input_text", text }); each text part is a block.
      item.output.forEach((raw, part) => {
        const piece = obj(raw);
        if (!piece || (piece.type !== "input_text" && piece.type !== "output_text") || typeof piece.text !== "string") return;
        evaluate(index, `${type}#${part}`, piece.text, block, (replacement) => {
          (outgoingItem(index, item).output as unknown[])[part] = { ...piece, text: replacement };
        });
      });
    }
  }
  await Promise.all(pending);
  blocks.sort((a, b) => a.itemIndex - b.itemIndex || a.blockType.localeCompare(b.blockType, "en", { numeric: true }));
  const outcome = finish(body, copy, blocks, startedAt, now, false, summarize(analyses, rereadTokens(served(items), responsesCalls(items))));
  return { ...outcome, timedOut };
}

/** Call ids of Responses tool calls that read a file (`cat`, `sed -n`, … through a shell tool). */
function responsesReadCalls(items: unknown[]): Set<string> {
  const reads = new Set<string>();
  for (const raw of items) {
    const item = obj(raw);
    if (!item || typeof item.call_id !== "string") continue;
    const command = item.type === "function_call" ? toolCallCommand(item.arguments)
      : item.type === "custom_tool_call" ? toolCallCommand(item.input)
        : item.type === "local_shell_call" ? toolCallCommand(obj(item.action) ?? {}) : null;
    if (command === null) continue;
    if ((typeof item.name === "string" && READ_TOOL_NAMES.has(item.name)) || isReadCommand(command)) reads.add(item.call_id);
  }
  return reads;
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
export async function compressAnthropicBodyAsync(body: Json, options: BodyCompressionOptions): Promise<CompressionOutcome> {
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

  // Code and prose compression covers tool results only: the user's own words are never rewritten.
  const reads = anthropicReadCalls(messages);
  const slots: Array<{ blockIndex: number | null; blockType: string; text: string; block: BlockOptions; apply: (text: string) => void }> = [];
  if (typeof message.content === "string") {
    slots.push({ blockIndex: null, blockType: "string_content", text: message.content, block: {}, apply: (text) => { replaced.content = text; } });
  } else if (Array.isArray(message.content)) {
    const content = [...message.content];
    replaced.content = content;
    content.forEach((raw, blockIndex) => {
      const block = obj(raw);
      const blockType = typeof block?.type === "string" ? block.type : "unknown";
      if (!block || ANTHROPIC_HOT_ZONE_BLOCKS.has(blockType)) return;
      if (blockType === "tool_result" && typeof block.content === "string") {
        slots.push({ blockIndex, blockType, text: block.content, block: blockOptions(options, reads.has(String(block.tool_use_id))),
          apply: (text) => { content[blockIndex] = { ...block, content: text }; } });
      } else if (blockType === "text" && typeof block.text === "string") {
        slots.push({ blockIndex, blockType, text: block.text, block: {}, apply: (text) => { content[blockIndex] = { ...block, text }; } });
      }
    });
  }

  const blocks: BlockOutcome[] = [];
  const analyses: Array<{ analysis?: BlockAnalysis; cached: boolean }> = [];
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
    const key = options.cache?.key(slot.text, tokenizer, variant(slot.block));
    const cached = key ? options.cache!.get(key) : undefined;
    const apply = (result: BlockResult, fromCache: boolean) => {
      blocks.push({ itemIndex: target, blockType, action: result.action });
      analyses.push({ analysis: result.analysis, cached: fromCache });
      if (result.replacement !== null) slot.apply(result.replacement);
    };
    if (cached) { apply(cached, true); continue; }
    pending.push(options.run(slot.text, deadline, { ...slot.block, tokenizer, onLate: key ? (late) => options.cache!.set(key, late) : undefined }).then((result) => {
      if (!result) { timedOut = true; return; }
      if (key) options.cache!.set(key, result);
      apply(result, false);
    }));
  }
  await Promise.all(pending);
  blocks.sort((a, b) => a.blockType.localeCompare(b.blockType, "en", { numeric: true }));
  const outcome = finish(body, copy, blocks, startedAt, now, false, summarize(analyses, rereadTokens(anthropicServed(messages), anthropicCalls(messages))));
  return { ...outcome, timedOut };
}

/** Ids of Anthropic tool_use blocks that read a file: the Read tool, or a shell command such as `cat` or `sed -n`. */
function anthropicReadCalls(messages: unknown[]): Set<string> {
  const reads = new Set<string>();
  for (const raw of messages) {
    const content = obj(raw)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const block = obj(part);
      if (block?.type !== "tool_use" || typeof block.id !== "string") continue;
      if ((typeof block.name === "string" && READ_TOOL_NAMES.has(block.name)) || isReadCommand(toolCallCommand(block.input))) reads.add(block.id);
    }
  }
  return reads;
}

/** Every tool_result text of an Anthropic conversation, with its message position, for re-read detection. */
function anthropicServed(messages: unknown[]): ServedResult[] {
  const out: ServedResult[] = [];
  messages.forEach((raw, position) => {
    const content = obj(raw)?.content;
    if (!Array.isArray(content)) return;
    for (const part of content) {
      const block = obj(part);
      if (block?.type !== "tool_result") continue;
      const text = typeof block.content === "string" ? block.content
        : Array.isArray(block.content) ? block.content.map((item) => obj(item)?.text).filter((value): value is string => typeof value === "string").join("\n") : "";
      if (text) out.push({ position, text, callId: typeof block.tool_use_id === "string" ? block.tool_use_id : null });
    }
  });
  return out;
}

/** tool_use blocks of an Anthropic conversation with their identity, for re-issued call detection. */
function anthropicCalls(messages: unknown[]): IssuedCall[] {
  const out: IssuedCall[] = [];
  messages.forEach((raw, position) => {
    const content = obj(raw)?.content;
    if (!Array.isArray(content)) return;
    for (const part of content) {
      const block = obj(part);
      if (block?.type === "tool_use" && typeof block.id === "string") out.push({ position, callId: block.id, key: callKey(String(block.name ?? ""), block.input ?? null) });
    }
  });
  return out;
}

import { compressDiff } from "./diff-compressor/index.js";
import type { Compressors, TokenCounter } from "./engine.js";
import { compressLog } from "./log-compressor/index.js";
import { compressSearchResults } from "./search-compressor/index.js";
import { smartCrush } from "./smart-crusher/index.js";
import { createTokenCounter } from "./tokenizer.js";

/**
 * The compressors Space Gateway runs. Each Headroom transform joins this map once its TypeScript port matches
 * Headroom's parity fixtures; until then its content type passes through unchanged. Retrieval markers (CCR) stay
 * off, as Headroom ran in production (`--no-ccr`): clients have no tool to fetch the dropped original back.
 */
export function createCompressors(): Compressors {
  return {
    // Neutral bias (1.0): Headroom's live-zone dispatcher passes 0.0, which as a multiplier always shrinks arrays
    // to the minimum keep count; the library default keeps the adaptive count.
    smartCrusher: (text) => {
      const result = smartCrush({ content: text, bias: 1.0 }, { enableCcrMarker: false });
      return result.wasModified ? result.compressed : null;
    },
    logCompressor: (text) => {
      const result = compressLog(text, { config: { enableCcr: false } });
      return result.compressed === text ? null : result.compressed;
    },
    searchCompressor: (text) => {
      const { result } = compressSearchResults(text, "", 1.0);
      return result.compressed === text ? null : result.compressed;
    },
    diffCompressor: (text) => {
      const result = compressDiff(text, "", { enable_ccr: false });
      return result.compressed === text ? null : result.compressed;
    }
  };
}

/** Token estimate used by the "really smaller" gate until the tokenizer port lands (about 4 characters per token). */
/** OpenAI-model token counting (tiktoken o200k), as Headroom counts Codex traffic. */
export const tokenCounter: TokenCounter = createTokenCounter("o200k");

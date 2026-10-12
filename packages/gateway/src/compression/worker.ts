import { parentPort } from "node:worker_threads";
import { createCompressors } from "./compressors.js";
import { compressBlock } from "./engine.js";
import { countO200k, createTokenCounter, type TokenizerKind } from "./tokenizer.js";

/** Compression worker: runs one block at a time off the gateway's event loop. */
const compressors = createCompressors();
const counters = { o200k: createTokenCounter("o200k"), claude: createTokenCounter("claude") };
// Load the tiktoken ranks now, so the first request does not wait for them.
countO200k("warm up");
parentPort?.on("message", (job: { id: number; text: string; tokenizer?: TokenizerKind }) => {
  try {
    parentPort!.postMessage({ id: job.id, ...compressBlock(job.text, compressors, counters[job.tokenizer ?? "o200k"]) });
  } catch (error) {
    parentPort!.postMessage({ id: job.id, failure: error instanceof Error ? error.message : String(error) });
  }
});
parentPort?.postMessage({ ready: true });

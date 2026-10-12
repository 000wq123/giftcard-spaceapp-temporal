import { spawn } from "node:child_process";
import { access, constants, mkdir } from "node:fs/promises";

/**
 * SpaceApp CLI runtimes as chess players. One move is one `agent-chat` turn:
 * the same isolated path Chat panes use (sudo -> space-cli-vpn-broker ->
 * runtime network namespace -> the CLI wrapper as the operator account), with
 * the model and reasoning effort passed through SPACE_AGENT_CHAT_MODEL and
 * SPACE_AGENT_CHAT_REASONING_EFFORT. Catalogs come from each wrapper's
 * `models` action (TSV: id, name, efforts, default effort).
 */

export interface ChessCliProviderSpec {
  id: string;
  runtimeId: string;
  name: string;
  /** Effort levels the wrapper's agent-chat really applies; null = provider default only. */
  efforts: "tsv" | readonly string[] | null;
  /** The OpenCode wrapper has no `models` action; its free models come from the runtime itself. */
  catalog: "tsv" | "opencode";
  /** Catalog entries another provider already covers (or that the account cannot use). */
  excludeModelPrefixes?: readonly string[];
  /** Only these entries are the provider's own models; the rest are gateways other providers cover. */
  includeModelPrefixes?: readonly string[];
}

/**
 * Runtimes with an agent-chat one-shot mode. Codex plays through Codex-LB.
 * Muse (no sign-in) and Droid (no subscription) cannot answer yet and have no
 * agent-chat mode.
 */
export const CHESS_CLI_PROVIDERS: readonly ChessCliProviderSpec[] = [
  { id: "claude", runtimeId: "cli:claude", name: "Claude Code", efforts: ["low", "medium", "high", "xhigh", "max"], catalog: "tsv" },
  { id: "gemini", runtimeId: "cli:gemini", name: "Gemini", efforts: "tsv", catalog: "tsv" },
  // Reasonix also lists the OpenRouter, Vercel and Codex-LB gateways; DeepSeek's own models are deepseek-*.
  { id: "deepseek", runtimeId: "cli:deepseek", name: "DeepSeek", efforts: "tsv", catalog: "tsv", includeModelPrefixes: ["deepseek-"] },
  { id: "copilot", runtimeId: "cli:copilot", name: "GitHub Copilot", efforts: "tsv", catalog: "tsv" },
  { id: "grok", runtimeId: "cli:grok", name: "Grok", efforts: null, catalog: "tsv" },
  { id: "cursor", runtimeId: "cli:cursor", name: "Cursor", efforts: null, catalog: "tsv" },
  { id: "qwen", runtimeId: "cli:qwen", name: "Qwen Code", efforts: null, catalog: "tsv" },
  { id: "hermes", runtimeId: "cli:hermes", name: "Hermes", efforts: null, catalog: "tsv" },
  // Oh My Pi also lists the whole OpenRouter catalog; OpenRouter plays as its own provider with verified models.
  { id: "omp", runtimeId: "cli:omp", name: "Oh My Pi", efforts: "tsv", catalog: "tsv", excludeModelPrefixes: ["openrouter/"] },
  { id: "qoder", runtimeId: "cli:qoder", name: "Qoder", efforts: null, catalog: "tsv" },
  { id: "kimi", runtimeId: "cli:kimi", name: "Kimi Code", efforts: null, catalog: "tsv" },
  { id: "autohand", runtimeId: "cli:autohand", name: "Autohand", efforts: null, catalog: "tsv" },
  { id: "opencode", runtimeId: "cli:opencode", name: "OpenCode", efforts: null, catalog: "opencode" },
];

export const CLI_PROVIDER_IDS = new Set(CHESS_CLI_PROVIDERS.map((provider) => provider.id));

export interface ChessCliModel {
  id: string;
  name: string;
  efforts: string[];
}

// Contestant ids are `${provider}/${model}@${effort}`: model ids with "@" or "~" are left out.
const CLI_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,159}$/;
const EFFORT_PATTERN = /^[a-z][a-z0-9_-]{0,19}$/;

/** Parses a wrapper `models` TSV; "none" alone means the provider decides. */
export function parseCliModelCatalog(raw: string): ChessCliModel[] {
  const seen = new Set<string>();
  const models: ChessCliModel[] = [];
  for (const line of raw.split("\n")) {
    const columns = line.replace(/\r$/, "").split("\t");
    const id = (columns[0] ?? "").trim();
    if (!id || !CLI_MODEL_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    const efforts = (columns[2] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => EFFORT_PATTERN.test(value) && value !== "none");
    models.push({ id, name: (columns[1] ?? "").trim() || id, efforts: [...new Set(efforts)] });
  }
  return models;
}

export function cliModelEfforts(spec: ChessCliProviderSpec, model: ChessCliModel): string[] {
  if (spec.efforts === "tsv") return model.efforts.length > 0 ? model.efforts : ["default"];
  if (Array.isArray(spec.efforts)) return [...spec.efforts];
  return ["default"];
}

const BROKER = "/opt/spaceapp/bin/space-cli-vpn-broker";
const OPENCODE_CURRENT = "/opt/spaceapp/var/cli-versions/opencode/current/node_modules/.bin/opencode";
/** Empty directory the CLIs start in; the operator account can read it but not write to it. */
export const CHESS_CLI_WORKSPACE = "/opt/spaceapp/var/chess-benchmark/workspace";
const MAX_OUTPUT_BYTES = 64 * 1024;
const CLAUDE_PROFILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PROVIDER_FAILURE = /RESOURCE_EXHAUSTED|quota|rate.?limit|\b429\b|unauthori[sz]ed|authentication fail|invalid api key|no available tokens/i;
const PATH_ENV = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/** The current OpenCode runtime, used only to list its free models. */
export async function currentOpenCodeBinary(): Promise<string | null> {
  try {
    await access(OPENCODE_CURRENT, constants.X_OK);
    return OPENCODE_CURRENT;
  } catch {
    return null;
  }
}

function stripTerminalCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

/** First printable line of a CLI failure, short enough for a status note. */
export function cliFailureSummary(stderr: string, fallback: string): string {
  const line = stripTerminalCodes(stderr)
    .split("\n")
    .map((value) => value.replace(/[^\x20-\x7E]/g, " ").trim())
    .find((value) => value.length > 0);
  return (line ?? fallback).slice(0, 180);
}

export interface CliAgentChatInput {
  runtimeId: string;
  model: string | null;
  effort: string | null;
  /** Claude Code account profile (not "main"); the wrapper selects it through SPACE_CLAUDE_ACCOUNT_PROFILE. */
  claudeProfile?: string | null;
  prompt: string;
  signal: AbortSignal;
}

export async function runCliAgentChat(input: CliAgentChatInput): Promise<string> {
  input.signal.throwIfAborted();
  await mkdir(CHESS_CLI_WORKSPACE, { recursive: true, mode: 0o755 });
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/sudo", ["-n", BROKER, "exec", input.runtimeId, "agent-chat"], {
      cwd: CHESS_CLI_WORKSPACE,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: PATH_ENV,
        LANG: "C.UTF-8",
        SPACE_CLI_WORKSPACE: CHESS_CLI_WORKSPACE,
        ...(input.model ? { SPACE_AGENT_CHAT_MODEL: input.model } : {}),
        ...(input.effort ? { SPACE_AGENT_CHAT_REASONING_EFFORT: input.effort } : {}),
        ...(input.runtimeId === "cli:claude" && input.claudeProfile && CLAUDE_PROFILE_PATTERN.test(input.claudeProfile) && input.claudeProfile !== "main"
          ? { SPACE_CLAUDE_ACCOUNT_PROFILE: input.claudeProfile }
          : {}),
      },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error: Error | null) => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(stripTerminalCodes(stdout));
    };
    const onAbort = () => {
      try {
        child.kill("SIGTERM");
      } catch {}
      finish(new DOMException("The move was aborted.", "AbortError"));
    };
    input.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT_BYTES) {
        try {
          child.kill("SIGKILL");
        } catch {}
        finish(new Error("CLI answer exceeded the output limit."));
      }
    });
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 8_192) stderr += chunk.slice(0, 8_192 - stderr.length);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      // Some CLIs print the answer and then exit non-zero for terminal reasons; the answer still counts,
      // unless what they printed is a provider failure (quota, rate limit, authentication).
      const printedFailure = stdout.trim() !== "" && PROVIDER_FAILURE.test(stdout);
      if (code === 0 || (stdout.trim() && !printedFailure)) finish(null);
      else finish(new Error(cliFailureSummary(printedFailure ? stdout : stderr, `${input.runtimeId} exited with code ${code ?? "unknown"}.`)));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input.prompt);
  });
}

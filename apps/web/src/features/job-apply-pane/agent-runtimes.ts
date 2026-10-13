import { CLI_PANE_TYPES, type AgentRuntime, type AgentRuntimeRegistry, type Pane } from "@space/contracts";
import { getSpaceRuntime } from "../../runtime/SpaceRuntime.js";
import { isCliRuntimeTerminalLaunchable } from "../../cli-runtime-presentation.js";

/** Claude Code first: long, tool-heavy application loops (native MCP, skills, account profiles). */
export const JOB_COPILOT_PREFERRED_RUNTIME_ID = "cli:claude";

// Same key as the terminal pane's Claude account picker, so the copilot's choice is the pane's choice.
const CLAUDE_ACCOUNT_PROFILE_KEY = "space.cli.claude.account-profile";

export interface JobCopilotRuntimeOption {
  runtime: AgentRuntime;
  ready: boolean;
  recommended: boolean;
}

/** CLI runtimes in catalog order, Claude Code flagged as the recommended copilot agent. */
export function jobCopilotRuntimeOptions(registry: AgentRuntimeRegistry | null): JobCopilotRuntimeOption[] {
  if (!registry) return [];
  const byId = new Map(registry.data.map((runtime) => [runtime.id, runtime]));
  return CLI_PANE_TYPES.flatMap((type) => {
    const runtime = byId.get(type.id);
    if (!runtime || !runtime.capabilities.includes("CLI")) return [];
    return [{ runtime, ready: isCliRuntimeTerminalLaunchable(runtime), recommended: runtime.id === JOB_COPILOT_PREFERRED_RUNTIME_ID }];
  });
}

/** The runtime a new copilot should start on: Claude Code when ready, else the first ready CLI. */
export function defaultJobCopilotRuntimeId(options: JobCopilotRuntimeOption[]): string | null {
  const preferred = options.find((option) => option.recommended && option.ready);
  return (preferred ?? options.find((option) => option.ready))?.runtime.id ?? null;
}

export function readLastClaudeAccountProfileId(): string {
  try {
    return getSpaceRuntime().platform.localStorage.getItem(CLAUDE_ACCOUNT_PROFILE_KEY) || "main";
  } catch {
    return "main";
  }
}

export function writeLastClaudeAccountProfileId(profileId: string): void {
  try {
    getSpaceRuntime().platform.localStorage.setItem(CLAUDE_ACCOUNT_PROFILE_KEY, profileId);
  } catch {
    // Preference storage is optional.
  }
}

/** Short model label for the agent chip; a pane without its own pick shows nothing. */
export function paneModelLabel(pane: Pick<Pane, "modelId">): string | null {
  if (!pane.modelId) return null;
  const tail = pane.modelId.split(":").at(-1) ?? pane.modelId;
  return tail.length > 28 ? `${tail.slice(0, 27)}…` : tail;
}

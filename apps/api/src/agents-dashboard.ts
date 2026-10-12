import type { Pane, PaneCliSession } from "@space/contracts";
import type { SpaceStore } from "@space/runtime";

export type DashboardStatus = "working" | "waiting" | "done" | "idle";

/**
 * Why the dashboard shows a status. Only fixed reasons, timestamps and model ids:
 * never prompt, screen, transcript or error text.
 */
export interface DashboardActivityDetail {
  status: DashboardStatus;
  /** Short fixed English reason, e.g. "Permission prompt" or "Not running". */
  reason?: string | null;
  /** When the current status began: turn start, completion or block. */
  since?: string | null;
  modelId?: string | null;
  /** native: the CLI's own state; screen: terminal heuristic; session/run: Space records. */
  source: "native" | "screen" | "session" | "run";
}

export type DashboardCliActivity = DashboardStatus | DashboardActivityDetail | null;

function iso(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Normalize a runtime reader result; bare statuses come from screen heuristics. */
export function dashboardDetail(value: DashboardStatus | DashboardActivityDetail, fallbackSource: DashboardActivityDetail["source"] = "screen"): DashboardActivityDetail {
  if (typeof value === "string") return { status: value, source: fallbackSource };
  return { ...value, since: iso(value.since), reason: value.reason?.slice(0, 80) || null };
}

// Metadata reads only: never start a CLI, attach a transport or mount a room.
export async function readDashboardActivity(panes: Pane[], store: SpaceStore,
  readCliStatus: (session: PaneCliSession) => Promise<DashboardCliActivity>) {
  const activity: Record<string, DashboardStatus> = {};
  const details: Record<string, DashboardActivityDetail> = {};
  const set = (paneId: string, detail: DashboardActivityDetail) => { activity[paneId] = detail.status; details[paneId] = detail; };
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, panes.length) }, async () => {
    while (cursor < panes.length) {
      const pane = panes[cursor++]!;
      if (pane.isClosed) continue;
      if (pane.mode === "TERMINAL" && pane.terminalRuntimeId !== "cli:root") {
        const session = await store.getActivePaneCliSession(pane.id);
        if (!session || session.status === "EXITED") {
          set(pane.id, { status: "idle", reason: "Not running", source: "session" });
        } else if (session.purpose !== "NORMAL") {
          set(pane.id, { status: "idle", reason: session.purpose === "LOGIN" ? "Sign-in session" : "Not running", source: "session" });
        } else if (session.status === "ERROR") {
          set(pane.id, { status: "waiting", reason: "CLI error", since: iso(session.updatedAt), source: "session" });
        } else {
          // One unreadable CLI must not fail the whole room; its pane keeps the client fallback.
          const status = await readCliStatus(session).catch(() => null);
          if (status !== null) {
            const detail = dashboardDetail(status);
            set(pane.id, { ...detail, modelId: detail.modelId ?? session.modelId ?? null });
          }
        }
      } else if (pane.mode === "CHAT") {
        const session = await store.getActiveSpaceAgentSession(pane.id);
        if (!session?.isActive) continue;
        const run = await store.getLatestSpaceAgentRun(session.sessionId);
        const modelId = run?.runtimeModelAtStart ?? null;
        if (run?.status === "RUNNING" || run?.status === "QUEUED") {
          set(pane.id, { status: "working", since: iso(run.startedAt ?? run.createdAt), modelId, source: "run" });
        } else if (run?.status === "COMPLETED") {
          set(pane.id, { status: "done", since: iso(run.completedAt ?? run.updatedAt), modelId, source: "run" });
        } else if (run?.status === "FAILED") {
          set(pane.id, { status: "waiting", reason: "Run failed", since: iso(run.completedAt ?? run.updatedAt), modelId, source: "run" });
        } else if (run?.status === "INTERRUPTED") {
          set(pane.id, { status: "idle", reason: "Interrupted", since: iso(run.completedAt ?? run.updatedAt), modelId, source: "run" });
        } else {
          set(pane.id, { status: "idle", source: "run" });
        }
      }
    }
  }));
  return { activity, details };
}

/** Claude Code's own session status is authoritative over screen heuristics. */
export function claudeDashboardActivity(native: {
  status?: string | null; busy: boolean; waitingFor?: string | null; statusUpdatedAt?: string | null; modelId?: string | null;
  tasks: Array<{ status: string; timing: { startedAt: string | null; completedAt: string | null } }>;
}): DashboardActivityDetail {
  const latest = native.tasks.at(-1);
  const modelId = native.modelId ?? null;
  if (native.busy || native.status === "busy" || native.status === "shell") {
    return { status: "working", since: iso(latest?.status === "RUNNING" ? latest.timing.startedAt : null) ?? iso(native.statusUpdatedAt), modelId, source: "native" };
  }
  if (native.status === "waiting") {
    return { status: "waiting", reason: waitingReason(native.waitingFor), since: iso(native.statusUpdatedAt), modelId, source: "native" };
  }
  if (latest?.status === "COMPLETED") {
    return { status: "done", since: iso(latest.timing.completedAt) ?? iso(native.statusUpdatedAt), modelId, source: "native" };
  }
  return { status: "idle", reason: latest?.status === "INTERRUPTED" ? "Interrupted" : null, since: iso(native.statusUpdatedAt), modelId, source: "native" };
}

/** Claude names what it waits for in plain words; show a fixed label, never free text. */
function waitingReason(waitingFor: string | null | undefined): string {
  const value = waitingFor?.toLowerCase() ?? "";
  if (value.includes("permission")) return "Permission prompt";
  if (value.includes("plan")) return "Plan approval";
  if (value.includes("question") || value.includes("input")) return "Question for you";
  return "Needs input";
}

/** The last OpenCode message decides a non-busy session's outcome. */
export function openCodeDashboardActivity(messages: unknown[]): DashboardActivityDetail | null {
  const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const infos = messages.map(message => record(record(message).info))
    .sort((a, b) => Number(record(a.time).created ?? 0) - Number(record(b.time).created ?? 0));
  const last = infos.at(-1);
  if (!last || last.role !== "assistant") return null;
  const time = record(last.time);
  const modelId = typeof last.modelID === "string" && last.modelID ? last.modelID : null;
  if (last.error) {
    const aborted = record(last.error).name === "MessageAbortedError";
    return { status: aborted ? "idle" : "waiting", reason: aborted ? "Interrupted" : "Run failed", since: iso(time.completed ?? time.created), modelId, source: "native" };
  }
  if (iso(time.completed) && last.finish && last.finish !== "tool-calls") {
    return { status: "done", since: iso(time.completed), modelId, source: "native" };
  }
  return null;
}

type ScreenState = "RUNNING" | "IDLE" | "WAITING_FOR_INPUT" | "UNKNOWN";
interface NativeTurnLike { status: string; aborted?: boolean; timing: { startedAt: string | null; completedAt: string | null } }

export interface CliDashboardActivityReaders {
  /** Terminal heuristic from the bounded room screen; never starts or attaches a CLI. */
  screenState(session: PaneCliSession): Promise<ScreenState>;
  codexTurn(session: PaneCliSession): Promise<{ status: "PENDING" | "RUNNING" | "COMPLETED" | "ABORTED"; lastActivityAtMs?: number }>;
  /** Null when the OpenCode server is unavailable; `messages` holds at most the latest few. */
  openCode(session: PaneCliSession): Promise<{ busy: boolean; messages: () => Promise<unknown[]> } | null>;
  geminiTurns(session: PaneCliSession): Promise<NativeTurnLike[] | null>;
  claude(session: PaneCliSession): Promise<Parameters<typeof claudeDashboardActivity>[0] | null>;
}

const screenActivity = (state: ScreenState): DashboardActivityDetail =>
  state === "RUNNING" ? { status: "working", source: "screen" }
    : state === "WAITING_FOR_INPUT" ? { status: "waiting", reason: "Needs input", source: "screen" }
      : { status: "idle", source: "screen" };

/** One status resolver for every CLI runtime: native state first, the room screen as fallback. */
export function createCliDashboardActivityReader(read: CliDashboardActivityReaders) {
  return async (session: PaneCliSession): Promise<DashboardActivityDetail> => {
    const screen = async () => screenActivity(await read.screenState(session).catch(() => "UNKNOWN" as const));
    if (session.runtimeId === "cli:codex") {
      const turn = await read.codexTurn(session);
      const at = iso(turn.lastActivityAtMs);
      if (turn.status === "RUNNING") return { status: "working", source: "native" };
      if (turn.status === "COMPLETED") return { status: "done", since: at, source: "native" };
      if (turn.status === "ABORTED") return { status: "waiting", reason: "Interrupted", since: at, source: "native" };
      return screen();
    }
    if (session.runtimeId === "cli:opencode") {
      const server = await read.openCode(session).catch(() => null);
      if (server?.busy) return { status: "working", source: "native" };
      const fromScreen = await screen();
      if (fromScreen.status !== "idle" || !server) return fromScreen;
      return openCodeDashboardActivity(await server.messages().catch(() => [])) ?? { status: "idle", source: "native" };
    }
    if (session.runtimeId === "cli:gemini") {
      const latest = (await read.geminiTurns(session).catch(() => null))?.at(-1);
      if (latest?.status === "RUNNING") return { status: "working", since: iso(latest.timing.startedAt), source: "native" };
      if (latest && (latest.status === "INTERRUPTED" || latest.aborted)) {
        return { status: "waiting", reason: "Interrupted", since: iso(latest.timing.completedAt), source: "native" };
      }
      const fromScreen = await screen();
      if (latest?.status === "COMPLETED" && fromScreen.status === "idle") {
        return { status: "done", since: iso(latest.timing.completedAt), source: "native" };
      }
      return fromScreen;
    }
    if (session.runtimeId === "cli:claude") {
      const native = await read.claude(session).catch(() => null);
      if (native) return claudeDashboardActivity(native);
    }
    return screen();
  };
}

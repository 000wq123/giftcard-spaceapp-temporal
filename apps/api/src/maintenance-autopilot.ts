import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  maintenanceAutopilotRunSchema,
  maintenanceAutopilotScheduleUpdateSchema,
  maintenancePlanSchema,
  type AdminOperationRun,
  type CliSessionCleanupResponse,
  type HostMemoryDetails,
  type MaintenanceAction,
  type MaintenanceAutopilotRun,
  type MaintenanceAutopilotSchedule,
  type MaintenanceAutopilotStatus,
  type MaintenanceAutopilotStep,
  type MaintenanceAutopilotStepId,
  type MaintenanceAutopilotScheduleUpdate
} from "@space/contracts";
import { SpaceConflictError } from "@space/runtime";
import { CliMaintenanceError, type CliMaintenanceManager } from "./cli-maintenance.js";
import type { CliSessionCleanupService } from "./cli-session-cleanup.js";

/**
 * One-tap maintenance. Runs the safe steps in a fixed order on demand or
 * nightly: storage cleanup, memory relief, health check, then the guarded
 * update/repair of whatever the check recommended (with the runner's rollback).
 * It never purges history and never stops a running CLI.
 */
export const maintenanceAutopilotStepOrder: readonly MaintenanceAutopilotStepId[] = ["cleanup", "memory", "check", "update"];

export interface MaintenanceAutopilotContext {
  actorId: string;
  trigger: MaintenanceAutopilotRun["trigger"];
  plan: { planId: string; actions: MaintenanceAction[] } | null;
}

export interface MaintenanceAutopilotStepOutcome {
  status: "DONE" | "SKIPPED" | "WARNING" | "FAILED";
  summary: string;
}

export type MaintenanceAutopilotSteps = Record<
  MaintenanceAutopilotStepId,
  (context: MaintenanceAutopilotContext) => Promise<MaintenanceAutopilotStepOutcome>
>;

interface StoredSchedule extends MaintenanceAutopilotSchedule {
  actorUserId: string | null;
}

interface StoredState {
  version: 1;
  schedule: StoredSchedule;
  currentRun: MaintenanceAutopilotRun | null;
  currentActorId: string | null;
  lastRun: MaintenanceAutopilotRun | null;
}

export interface MaintenanceAutopilotOptions {
  steps: MaintenanceAutopilotSteps;
  /** JSON state file; null keeps state in memory only. */
  stateFile: string | null;
  now?: () => Date;
  defaultTimeZone?: string;
  defaultHour?: number;
  /** A scheduled run that was missed by more than this is skipped until the next night. */
  missedRunGraceMs?: number;
  onRunFinished?: (run: MaintenanceAutopilotRun, actorId: string) => Promise<void>;
  onError?: (error: unknown, message: string) => void;
}

const DEFAULT_HOUR = 4;
const DEFAULT_MISSED_RUN_GRACE_MS = 3 * 60 * 60 * 1000;

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The first moment strictly after `after` that is `hour`:00 in `timeZone` (DST and half-hour zones included). */
export function nextScheduledRun(after: Date, hour: number, timeZone: string): Date {
  const format = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const quarter = 15 * 60 * 1000;
  const start = Math.floor(after.getTime() / quarter) * quarter;
  for (let index = 1; index <= 4 * 50; index += 1) {
    const candidate = new Date(start + index * quarter);
    const parts = format.formatToParts(candidate);
    const localHour = Number(parts.find((part) => part.type === "hour")?.value);
    const localMinute = Number(parts.find((part) => part.type === "minute")?.value);
    if (localHour === hour && localMinute === 0) return candidate;
  }
  return new Date(start + 24 * 60 * 60 * 1000);
}

function boundedMessage(value: unknown, fallback: string): string {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const trimmed = text.replace(/\s+/g, " ").trim();
  return (trimmed || fallback).slice(0, 400);
}

function runStatus(steps: MaintenanceAutopilotStep[]): MaintenanceAutopilotRun["status"] {
  const finished = steps.filter((step) => step.status !== "SKIPPED");
  const failed = finished.filter((step) => step.status === "FAILED");
  if (finished.length > 0 && failed.length === finished.length) return "FAILED";
  if (failed.length > 0 || steps.some((step) => step.status === "WARNING")) return "PARTIAL";
  return "SUCCEEDED";
}

function runSummary(status: MaintenanceAutopilotRun["status"]): string {
  if (status === "SUCCEEDED") return "Maintenance finished. Space is clean and up to date.";
  if (status === "PARTIAL") return "Maintenance finished with warnings. Review the steps below.";
  return "Maintenance could not complete. Review the steps below.";
}

export class MaintenanceAutopilot {
  private readonly now: () => Date;
  private state: StoredState | null = null;
  private loading: Promise<StoredState> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private active: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(private readonly options: MaintenanceAutopilotOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private defaultState(): StoredState {
    const timeZone = this.options.defaultTimeZone && isValidTimeZone(this.options.defaultTimeZone)
      ? this.options.defaultTimeZone
      : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return {
      version: 1,
      schedule: { enabled: false, hour: this.options.defaultHour ?? DEFAULT_HOUR, timeZone, nextRunAt: null, actorUserId: null },
      currentRun: null,
      currentActorId: null,
      lastRun: null
    };
  }

  private async load(): Promise<StoredState> {
    if (this.state) return this.state;
    this.loading ??= (async () => {
      const state = this.defaultState();
      if (this.options.stateFile) {
        try {
          const raw = JSON.parse(await readFile(this.options.stateFile, "utf8")) as Partial<StoredState>;
          const schedule = raw.schedule;
          if (schedule && typeof schedule.enabled === "boolean" && Number.isInteger(schedule.hour)
            && schedule.hour >= 0 && schedule.hour <= 23 && typeof schedule.timeZone === "string" && isValidTimeZone(schedule.timeZone)) {
            state.schedule = {
              enabled: schedule.enabled,
              hour: schedule.hour,
              timeZone: schedule.timeZone,
              nextRunAt: typeof schedule.nextRunAt === "string" ? schedule.nextRunAt : null,
              actorUserId: typeof schedule.actorUserId === "string" ? schedule.actorUserId : null
            };
          }
          const lastRun = maintenanceAutopilotRunSchema.safeParse(raw.lastRun);
          if (lastRun.success) state.lastRun = lastRun.data;
          const interrupted = maintenanceAutopilotRunSchema.safeParse(raw.currentRun);
          if (interrupted.success) state.lastRun = this.interrupt(interrupted.data);
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
            this.options.onError?.(error, "Maintenance autopilot state could not be read; defaults are used.");
          }
        }
      }
      this.state = state;
      return state;
    })();
    return this.loading;
  }

  /** A run that was in progress when the API stopped is closed as interrupted. */
  private interrupt(run: MaintenanceAutopilotRun): MaintenanceAutopilotRun {
    const finishedAt = this.now().toISOString();
    const steps = run.steps.map((step) => step.status === "RUNNING"
      ? { ...step, status: "FAILED" as const, summary: "Interrupted by a Space service restart.", finishedAt }
      : step.status === "PENDING"
        ? { ...step, status: "SKIPPED" as const, summary: "Not started because Space restarted.", finishedAt }
        : step);
    return { ...run, steps, status: "FAILED", summary: "Maintenance was interrupted by a Space service restart.", finishedAt };
  }

  private persist(): Promise<void> {
    const file = this.options.stateFile;
    const state = this.state;
    if (!file || !state) return Promise.resolve();
    const body = `${JSON.stringify(state, null, 2)}\n`;
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await mkdir(dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        await writeFile(temporary, body, { mode: 0o640 });
        await rename(temporary, file);
      } catch (error) {
        this.options.onError?.(error, "Maintenance autopilot state could not be saved.");
      }
    });
    return this.writeQueue;
  }

  async status(): Promise<MaintenanceAutopilotStatus> {
    const state = await this.load();
    const { actorUserId: _actorUserId, ...schedule } = state.schedule;
    return {
      schedule,
      currentRun: state.currentRun ? structuredClone(state.currentRun) : null,
      lastRun: state.lastRun ? structuredClone(state.lastRun) : null,
      checkedAt: this.now().toISOString()
    };
  }

  /** Starts a run in the background and returns it immediately. */
  async start(trigger: MaintenanceAutopilotRun["trigger"], actorId: string): Promise<MaintenanceAutopilotRun> {
    const state = await this.load();
    if (state.currentRun || this.active) throw new SpaceConflictError("Maintenance is already running.");
    const startedAt = this.now().toISOString();
    const run: MaintenanceAutopilotRun = {
      id: `maintenance_${randomUUID()}`,
      trigger,
      status: "RUNNING",
      summary: "Maintenance is running.",
      steps: maintenanceAutopilotStepOrder.map((id) => ({ id, status: "PENDING", summary: "Waiting.", startedAt: null, finishedAt: null })),
      startedAt,
      finishedAt: null
    };
    state.currentRun = run;
    state.currentActorId = actorId;
    await this.persist();
    const execution = this.execute(run, actorId);
    this.active = execution;
    void execution.finally(() => {
      if (this.active === execution) this.active = null;
    });
    return structuredClone(run);
  }

  private async execute(run: MaintenanceAutopilotRun, actorId: string): Promise<void> {
    const state = await this.load();
    const context: MaintenanceAutopilotContext = { actorId, trigger: run.trigger, plan: null };
    for (const step of run.steps) {
      step.status = "RUNNING";
      step.summary = "Running…";
      step.startedAt = this.now().toISOString();
      void this.persist();
      try {
        const outcome = await this.options.steps[step.id](context);
        step.status = outcome.status;
        step.summary = boundedMessage(outcome.summary, "Finished.");
      } catch (error) {
        step.status = "FAILED";
        step.summary = boundedMessage(error, "This step failed.");
      }
      step.finishedAt = this.now().toISOString();
      void this.persist();
    }
    run.status = runStatus(run.steps);
    run.summary = runSummary(run.status);
    run.finishedAt = this.now().toISOString();
    state.lastRun = run;
    state.currentRun = null;
    state.currentActorId = null;
    await this.persist();
    try {
      await this.options.onRunFinished?.(structuredClone(run), actorId);
    } catch (error) {
      this.options.onError?.(error, "Maintenance autopilot run could not be recorded in the audit log.");
    }
  }

  async updateSchedule(input: MaintenanceAutopilotScheduleUpdate, actorId: string): Promise<MaintenanceAutopilotSchedule> {
    const parsed = maintenanceAutopilotScheduleUpdateSchema
      .refine((value) => value.timeZone === undefined || isValidTimeZone(value.timeZone), {
        message: "Choose a valid time zone for nightly maintenance.",
        path: ["timeZone"]
      })
      .parse(input);
    const state = await this.load();
    const hour = parsed.hour ?? state.schedule.hour;
    const timeZone = parsed.timeZone ?? state.schedule.timeZone;
    state.schedule = {
      enabled: parsed.enabled,
      hour,
      timeZone,
      nextRunAt: parsed.enabled ? nextScheduledRun(this.now(), hour, timeZone).toISOString() : null,
      actorUserId: parsed.enabled ? actorId : state.schedule.actorUserId
    };
    await this.persist();
    const { actorUserId: _actorUserId, ...schedule } = state.schedule;
    return schedule;
  }

  /** Starts the nightly run when it is due. Safe to call at any interval. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const state = await this.load();
      const schedule = state.schedule;
      if (!schedule.enabled || !schedule.actorUserId) return;
      const now = this.now();
      if (!schedule.nextRunAt) {
        schedule.nextRunAt = nextScheduledRun(now, schedule.hour, schedule.timeZone).toISOString();
        await this.persist();
        return;
      }
      const due = Date.parse(schedule.nextRunAt);
      if (!Number.isFinite(due) || now.getTime() < due) return;
      if (state.currentRun || this.active) return;
      schedule.nextRunAt = nextScheduledRun(now, schedule.hour, schedule.timeZone).toISOString();
      await this.persist();
      if (now.getTime() - due > (this.options.missedRunGraceMs ?? DEFAULT_MISSED_RUN_GRACE_MS)) return;
      await this.start("SCHEDULED", schedule.actorUserId);
    } catch (error) {
      this.options.onError?.(error, "Nightly maintenance could not start.");
    } finally {
      this.ticking = false;
    }
  }

  startScheduler(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
    void this.tick();
  }

  /** Resolves when the current run (if any) has finished. */
  async idle(): Promise<void> {
    await this.active;
    await this.writeQueue;
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.writeQueue;
  }
}

export interface CliMaintenanceAutopilotStepOptions {
  manager: Pick<CliMaintenanceManager, "createPlan" | "applyPlan" | "get">;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollMs?: number;
  checkTimeoutMs?: number;
  updateTimeoutMs?: number;
}

const finishedStatuses = new Set<AdminOperationRun["status"]>(["SUCCEEDED", "PARTIAL", "FAILED"]);

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function listLabels(labels: string[]): string {
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`;
}

/** The guarded health check and the update/repair of its recommendations, through the durable maintenance runner. */
export function createCliMaintenanceAutopilotSteps(options: CliMaintenanceAutopilotStepOptions): Pick<MaintenanceAutopilotSteps, "check" | "update"> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const pollMs = options.pollMs ?? 3_000;

  async function waitFor(run: AdminOperationRun, timeoutMs: number, label: string): Promise<AdminOperationRun> {
    const deadline = now() + timeoutMs;
    let current = run;
    while (!finishedStatuses.has(current.status)) {
      if (now() >= deadline) {
        throw new Error(`${label} is still running. It continues in the background; open Space & CLI maintenance for details.`);
      }
      await sleep(pollMs);
      current = await options.manager.get(run.id);
    }
    return current;
  }

  return {
    async check(context) {
      let run: AdminOperationRun;
      try {
        run = await options.manager.createPlan({ scope: "enabled" }, context.actorId);
      } catch (error) {
        if (error instanceof CliMaintenanceError && error.code === "CLI_MAINTENANCE_IN_PROGRESS") {
          return { status: "SKIPPED", summary: "Another maintenance check is already running. Try again when it finishes." };
        }
        throw error;
      }
      const finished = await waitFor(run, options.checkTimeoutMs ?? 20 * 60_000, "The health check");
      if (finished.status === "FAILED") return { status: "FAILED", summary: finished.summary };
      const plan = maintenancePlanSchema.safeParse(finished.result.plan);
      if (!plan.success) return { status: "FAILED", summary: "The health check finished without a maintenance plan." };
      context.plan = { planId: plan.data.planId, actions: plan.data.actions };
      const checked = Array.isArray(finished.result.runtimes) ? finished.result.runtimes.length : null;
      if (!plan.data.actions.length) {
        return {
          status: finished.status === "PARTIAL" ? "WARNING" : "DONE",
          summary: checked === null
            ? "Everything is healthy and up to date."
            : `${plural(checked, "tool")} checked. Everything is healthy and up to date.`
        };
      }
      return {
        status: "DONE",
        summary: `${plural(plan.data.actions.length, "fix", "fixes")} found: ${listLabels(plan.data.actions.map((action) => action.label))}.`
      };
    },
    async update(context) {
      if (!context.plan) return { status: "SKIPPED", summary: "Skipped because the health check did not finish." };
      const actions = context.plan.actions;
      if (!actions.length) return { status: "DONE", summary: "Nothing to update." };
      let run: AdminOperationRun;
      try {
        run = await options.manager.applyPlan(context.plan.planId, {
          selectedActionIds: actions.map((action) => action.id),
          idempotencyKey: randomUUID(),
          confirmation: "APPLY MAINTENANCE"
        }, context.actorId);
      } catch (error) {
        if (error instanceof CliMaintenanceError && error.code === "CLI_MAINTENANCE_REPAIR_DISABLED") {
          return { status: "SKIPPED", summary: "Automatic updates and repairs are turned off on this server." };
        }
        if (error instanceof CliMaintenanceError && error.code === "CLI_MAINTENANCE_IN_PROGRESS") {
          return { status: "SKIPPED", summary: "Another maintenance run is already in progress. Try again when it finishes." };
        }
        throw error;
      }
      const finished = await waitFor(run, options.updateTimeoutMs ?? 90 * 60_000, "The update");
      const labels = listLabels(actions.map((action) => action.label));
      if (finished.status === "SUCCEEDED") return { status: "DONE", summary: `Updated and verified: ${labels}.` };
      return { status: finished.status === "PARTIAL" ? "WARNING" : "FAILED", summary: finished.summary };
    }
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export interface StorageCleanupStepOptions {
  anyCliEnabled(): Promise<boolean>;
  /** Runs under the same exclusive history lock as the manual cleanup and purge. */
  withExclusive<T>(operation: () => Promise<T>): Promise<T>;
  protectedThreadIds(): Promise<string[]>;
  codexEnabled(): Promise<boolean>;
  service: CliSessionCleanupService;
  audit(result: CliSessionCleanupResponse, actorId: string): Promise<void>;
}

/** The same safe cleanup as "Clean CLI sessions & storage": empty tasks, orphaned pane homes and temp files only. */
export function createStorageCleanupStep(options: StorageCleanupStepOptions): MaintenanceAutopilotSteps["cleanup"] {
  return async (context) => {
    if (!(await options.anyCliEnabled())) return { status: "SKIPPED", summary: "No CLI is enabled, so there is nothing to clean." };
    return options.withExclusive(async () => {
      const [protectedThreadIds, codexEnabled] = await Promise.all([options.protectedThreadIds(), options.codexEnabled()]);
      const preview = await options.service.preview({ actorId: context.actorId, protectedThreadIds, codexEnabled });
      if (preview.status === "NOOP") return { status: "DONE", summary: "Already clean. Nothing to remove." };
      const result = await options.service.execute({ actorId: context.actorId, previewId: preview.previewId, protectedThreadIds, codexEnabled });
      await options.audit(result, context.actorId);
      const sessions = result.cleaned.codex.threads + result.cleaned.opencode.sessions;
      const parts = [
        sessions > 0 ? `${plural(sessions, "empty session")} removed` : null,
        `${formatBytes(result.totalBytes)} freed`
      ].filter(Boolean).join(" · ");
      if (result.status === "PARTIAL") return { status: "WARNING", summary: `${parts}. ${plural(result.failures.length, "item")} could not be removed.` };
      return { status: "DONE", summary: result.status === "NOOP" ? "Already clean. Nothing to remove." : `${parts}.` };
    });
  };
}

export interface MemoryReliefStepOptions {
  /** Returns false when another memory action is running. */
  acquire(): boolean;
  release(): void;
  readMemory(): Promise<HostMemoryDetails>;
  /** Stops detached CLIs whose pane is closed or gone; CLIs of open panes are never stopped. */
  stopClosedPaneClis?(): Promise<{ status: string; killedSessionIds: string[]; estimatedReclaimedBytes: number }>;
  reclaimPageCache(): Promise<{ status: string; reclaimedBytes: number; message: string | null }>;
  minimumReclaimBytes: number;
  audit(result: { status: string; reclaimedBytes: number; stoppedCliCount: number }, actorId: string): Promise<void>;
}

/**
 * Stops leftover CLIs of closed panes, then releases kernel page cache only
 * under real memory pressure. A CLI whose pane is still open keeps running,
 * because a nightly run happens while every pane is detached and agents may
 * still be working.
 */
export function createMemoryReliefStep(options: MemoryReliefStepOptions): MaintenanceAutopilotSteps["memory"] {
  return async (context) => {
    if (!options.acquire()) return { status: "SKIPPED", summary: "Another memory cleanup is running." };
    try {
      const stopped = options.stopClosedPaneClis ? await options.stopClosedPaneClis() : null;
      const stoppedCount = stopped?.killedSessionIds.length ?? 0;
      const leftover = stoppedCount > 0
        ? `Stopped ${plural(stoppedCount, "leftover CLI")} of closed panes (${formatBytes(stopped!.estimatedReclaimedBytes)}). `
        : "";
      const partial = stopped?.status === "PARTIAL";
      const before = await options.readMemory();
      const used = `${Math.round(before.memory.usagePercent)}% used`;
      const finish = (status: MaintenanceAutopilotStepOutcome["status"], summary: string): MaintenanceAutopilotStepOutcome => ({
        status: partial && status === "DONE" ? "WARNING" : status,
        summary: `${leftover}${summary}${partial ? " Some leftover CLIs could not be stopped." : ""}`
      });
      if (!before.pressure.isUnderPressure) {
        if (stoppedCount > 0) await options.audit({ status: "SKIPPED_LOW_PRESSURE", reclaimedBytes: 0, stoppedCliCount: stoppedCount }, context.actorId);
        return finish("DONE", `Memory is healthy (${used}).`);
      }
      if (!before.pressure.canDropPageCache || before.memory.reclaimableBytes < options.minimumReclaimBytes) {
        if (stoppedCount > 0) await options.audit({ status: "SKIPPED_SMALL_CACHE", reclaimedBytes: 0, stoppedCliCount: stoppedCount }, context.actorId);
        return finish("WARNING", `Memory is under pressure (${used}) and no safe cache is left to release. Close panes you no longer need.`);
      }
      const result = await options.reclaimPageCache();
      await options.audit({ status: result.status, reclaimedBytes: result.reclaimedBytes, stoppedCliCount: stoppedCount }, context.actorId);
      if (result.status === "CLEARED") return finish("DONE", `Released ${formatBytes(result.reclaimedBytes)} of cache (was ${used}).`);
      if (result.status === "FAILED") return finish("FAILED", result.message ?? "The cache could not be released.");
      return finish("DONE", result.message ?? `Memory is ${used}. Nothing to free right now.`);
    } finally {
      options.release();
    }
  };
}

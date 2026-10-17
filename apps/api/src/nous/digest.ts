import type { ClipboardItem, NousDecision, Pane, Room, SpaceNotification, TaskItem } from "@space/contracts";
import type { DashboardAgentsSample } from "../room-routes.js";
import type { NousNote } from "@space/db";

/**
 * The world as Nous sees it at the start of every turn: every room with its panes and their live state, what waits for
 * the operator (open notifications from every source), every open plan with its next step, tasks, release trains, the
 * decisions waiting for the operator and Nous's own notes (the plan map). Names, states and titles only, never screen text.
 */
export interface NousWorld {
  rooms: Array<{ room: Room; sample: DashboardAgentsSample | null }>;
  notifications: SpaceNotification[];
  plans: ClipboardItem[];
  tasks: TaskItem[];
  trains: string;
  decisions: NousDecision[];
  notes: NousNote[];
  now: string;
  /** The host's load, so Nous waits for a busy server before it starts new work (operator request 2026-10-17). */
  server?: NousServerLoad | null;
}

export interface NousServerLoad { load1: number; load5: number; cpus: number; memoryUsedPercent: number }

/** BUSY above 90% of the CPUs on the 1-minute load or 92% memory in use. */
export function serverBusy(load: NousServerLoad): boolean {
  return load.load1 > load.cpus * 0.9 || load.memoryUsedPercent > 92;
}

export const NOUS_DIGEST_MAX_CHARS = 40_000;
const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;
const oneLine = (text: string, max: number) => clip(text.replace(/\s+/g, " ").trim(), max);

export const paneLabel = (pane: Pick<Pane, "paneName" | "title">) => pane.paneName ?? pane.title;

/** "Claude CLI", "Mail Copilot", "Browser": what kind of pane it is, for the model. */
export function paneKind(pane: Pane): string {
  if (pane.mode === "TERMINAL") return pane.terminalRuntimeId ? `CLI ${pane.terminalRuntimeId.replace(/^cli:/, "")}` : "CLI";
  return pane.mode.toLowerCase().replace(/_/g, " ");
}

/** The first step that is not completed, as "3. Title (IN_PROGRESS)". */
export function nextPlanStep(plan: ClipboardItem): string | null {
  const step = [...plan.steps].sort((left, right) => left.order - right.order).find((entry) => entry.status !== "COMPLETED");
  return step ? `${step.order}. ${oneLine(step.title, 120)} (${step.status})` : null;
}

function paneLines(entry: NousWorld["rooms"][number], plans: ClipboardItem[]): string[] {
  const sample = entry.sample;
  if (!sample) return ["- (the room's panes could not be read now)"];
  if (!sample.data.length) return ["- no open panes"];
  return sample.data.map((pane) => {
    const detail = sample.details[pane.id];
    const status = sample.activity[pane.id];
    const state = status ? `${status}${detail?.reason ? `: ${detail.reason}` : ""}${detail?.since ? ` since ${detail.since.slice(11, 16)}` : ""}` : null;
    const plan = plans.find((item) => item.paneId === pane.id);
    return `- ${paneLabel(pane)} · ${paneKind(pane)}${state ? ` · ${state}` : ""}${detail?.modelId ?? pane.modelId ? ` · model ${detail?.modelId ?? pane.modelId}` : ""}`
      + `${plan ? ` · plan "${oneLine(plan.title ?? plan.text, 80)}" ${plan.progressPercentage}%` : ""}`;
  });
}

export function renderNousWorld(world: NousWorld): string {
  const roomName = new Map(world.rooms.map(({ room }) => [room.id, room.name]));
  const paneName = new Map(world.rooms.flatMap(({ sample }) => (sample?.data ?? []).map((pane) => [pane.id, paneLabel(pane)] as const)));
  const where = (roomId: string | null, paneId: string | null) =>
    [roomId ? `room "${roomName.get(roomId) ?? roomId}"` : null, paneId ? `pane ${paneName.get(paneId) ?? paneId}` : null].filter(Boolean).join(", ");
  const sections: string[] = [`# The world now (${world.now})`];
  if (world.server) {
    const load = world.server;
    sections.push(`Server: load ${load.load1.toFixed(1)} (5 min ${load.load5.toFixed(1)}) on ${load.cpus} CPUs, memory ${load.memoryUsedPercent}% in use.`
      + (serverBusy(load) ? " BUSY: start no new work in panes now (no new panes, plans or tasks); answer, record and pick it up in a later turn." : ""));
  }

  sections.push("## Rooms and panes", ...world.rooms.flatMap((entry) => [
    `### ${entry.room.name}${entry.room.kind === "AGENT_PROOF" ? " (an agent's test room: leave it alone unless the operator asks)" : ""}`,
    ...paneLines(entry, world.plans)
  ]));

  sections.push("## Waiting for the operator now (open notifications, newest first)",
    ...(world.notifications.length ? world.notifications.map((item) =>
      `- [${item.id}] ${item.source} ${item.kind} (${item.severity}): ${oneLine(item.title, 120)}${item.body ? ` — ${oneLine(item.body, 200)}` : ""}`
      + `${item.roomId || item.paneId ? ` · ${where(item.roomId, item.paneId)}` : ""}`) : ["- nothing"]));

  sections.push("## Open plans",
    ...(world.plans.length ? world.plans.map((plan) => {
      const next = nextPlanStep(plan);
      return `- [${plan.id}] "${oneLine(plan.title ?? plan.text, 100)}" ${plan.executionStatus} ${plan.progressPercentage}%`
        + `${plan.roomId || plan.paneId ? ` · ${where(plan.roomId, plan.paneId)}` : " · no pane"}${next ? ` · next: ${next}` : ""}`
        + `${plan.minimumModel ? ` · needs ${plan.minimumModel}${plan.minimumReasoning ? ` ${plan.minimumReasoning}` : ""}` : ""}`;
    }) : ["- none"]));

  sections.push("## Open tasks",
    ...(world.tasks.length ? world.tasks.map((task) => `- [${task.id}] ${task.status} "${oneLine(task.title, 100)}"${task.paneId || task.roomId ? ` · ${where(task.roomId, task.paneId)}` : ""}`
      + `${task.schedule?.nextRunAt ? ` · next run ${task.schedule.nextRunAt}` : ""}`) : ["- none"]));

  sections.push("## Release trains", world.trains.trim() || "No release trains.");

  sections.push("## Your decisions waiting for the operator",
    ...(world.decisions.length ? world.decisions.map((decision) => `- [${decision.id}] ${decision.category}: ${oneLine(decision.title, 120)} (asked ${decision.createdAt.slice(0, 16)})`) : ["- none"]));

  sections.push("## Your notes", ...(world.notes.length ? world.notes.map((note) => `### ${note.key}\n${clip(note.text, 4_000)}`) : ["- none yet (keep a plan-map note)"]));

  return clip(sections.join("\n"), NOUS_DIGEST_MAX_CHARS);
}

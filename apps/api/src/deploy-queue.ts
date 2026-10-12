import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  deployQueueReportSchema, deployQueueTicketStatusSchema,
  type DeployQueueReport, type DeployQueueTicket
} from "@space/contracts";

export const defaultDeployQueueRoot = "/opt/spaceapp/var/merge-queue";
const ACTIVE = new Set(["QUEUED", "INTEGRATING", "VERIFYING", "DEPLOYING"]);
const HEARTBEAT_STALE_MS = 90_000;
const MAX_TICKET_FILES = 500;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 50).map((item) => item.slice(0, 300)) : [];
}

async function readJson(path: string): Promise<JsonRecord | null> {
  try { return record(JSON.parse(await readFile(path, "utf8"))); } catch { return null; }
}

/** Only operator-facing fields: no logs, worktree paths or resolver output leave the queue directory. */
function toTicket(raw: JsonRecord): DeployQueueTicket | null {
  const status = deployQueueTicketStatusSchema.safeParse(raw.status);
  const id = text(raw.id, 80);
  if (!status.success || !id) return null;
  const history = Array.isArray(raw.history) ? raw.history.map(record).filter(Boolean) as JsonRecord[] : [];
  const result = record(raw.result);
  const autoResolved = record(raw.autoResolved);
  const remotes = result?.remotes === "ok" || result?.remotes === "failed" ? result.remotes : null;
  return {
    id,
    status: status.data,
    branch: text(raw.branch, 200),
    summary: text(raw.summary, 240),
    sha: text(raw.sha, 40),
    submittedAt: text(raw.submittedAt, 40),
    updatedAt: text(raw.updatedAt, 40) || text(raw.submittedAt, 40),
    note: text(history.at(-1)?.note, 1000) || null,
    deployedCommit: text(result?.commit, 40) || null,
    conflictFiles: status.data === "CONFLICT" ? stringList(result?.files) : [],
    autoResolvedFiles: stringList(autoResolved?.files),
    remotes
  };
}

export async function readDeployQueue(root = defaultDeployQueueRoot, now = Date.now()): Promise<DeployQueueReport> {
  const state = await readJson(join(root, "state.json"));
  let names: string[] = [];
  try {
    names = (await readdir(join(root, "tickets"))).filter((name) => name.endsWith(".json")).sort().slice(-MAX_TICKET_FILES);
  } catch {
    return deployQueueReportSchema.parse({
      available: false, daemonRunning: false, heartbeatAt: null, paused: null, current: null, active: [], recent: []
    });
  }
  const tickets = (await Promise.all(names.map((name) => readJson(join(root, "tickets", name)))))
    .map((raw) => (raw ? toTicket(raw) : null))
    .filter((ticket): ticket is DeployQueueTicket => ticket !== null);
  const heartbeatAt = text(state?.heartbeatAt, 40) || null;
  const heartbeatMs = heartbeatAt ? Date.parse(heartbeatAt) : Number.NaN;
  const paused = record(state?.paused);
  const current = record(state?.current);
  return deployQueueReportSchema.parse({
    available: true,
    // The daemon writes a heartbeat every poll; a busy batch keeps state.current set.
    daemonRunning: Number.isFinite(heartbeatMs) && (now - heartbeatMs < HEARTBEAT_STALE_MS || current !== null),
    heartbeatAt,
    paused: paused ? { reason: text(paused.reason, 500), at: text(paused.at, 40) } : null,
    current: current ? {
      batchId: text(current.batchId, 80), phase: text(current.phase, 20), ticketIds: stringList(current.tickets).slice(0, 20)
    } : null,
    active: tickets.filter((ticket) => ACTIVE.has(ticket.status)).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).slice(0, 200),
    recent: tickets.filter((ticket) => !ACTIVE.has(ticket.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30)
  });
}

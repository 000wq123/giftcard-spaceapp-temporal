import type { DeployQueueReport, DeployQueueTicket, DeployQueueTicketStatus } from "@space/contracts";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.js";
import { RefreshCw } from "../ui-theme/app-icons.js";
import "./deploy-queue.css";

export interface DeployQueueClient {
  deployQueue(): Promise<DeployQueueReport>;
}

const REFRESH_MS = 10_000;

const statusTone: Record<DeployQueueTicketStatus, string> = {
  QUEUED: "idle",
  INTEGRATING: "busy",
  VERIFYING: "busy",
  DEPLOYING: "busy",
  DEPLOYED: "ok",
  CONFLICT: "warn",
  FAILED: "bad",
  CANCELLED: "idle"
};

const statusLabel: Record<DeployQueueTicketStatus, string> = {
  QUEUED: "Queued",
  INTEGRATING: "Merging",
  VERIFYING: "Building",
  DEPLOYING: "Deploying",
  DEPLOYED: "Live",
  CONFLICT: "Conflict",
  FAILED: "Failed",
  CANCELLED: "Cancelled"
};

function relative(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return "unknown";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

function serviceState(report: DeployQueueReport): { tone: string; label: string; detail: string } {
  if (!report.available) return { tone: "idle", label: "Not installed", detail: "The merge queue service has no state on this server yet." };
  if (report.paused) return { tone: "warn", label: "Paused", detail: report.paused.reason };
  if (!report.daemonRunning) return { tone: "bad", label: "Not running", detail: "space-merge-queue.service has not reported a heartbeat recently." };
  if (report.current) return { tone: "busy", label: "Working", detail: `Batch ${report.current.batchId}: ${report.current.phase.toLowerCase()} ${report.current.ticketIds.length} change${report.current.ticketIds.length === 1 ? "" : "s"}.` };
  return { tone: "ok", label: "Idle", detail: "Waiting for agents to submit changes." };
}

function TicketRow({ ticket, now }: { ticket: DeployQueueTicket; now: number }) {
  const files = ticket.status === "CONFLICT" ? ticket.conflictFiles : ticket.autoResolvedFiles;
  return (
    <li className="deploy-queue-ticket" data-status={ticket.status}>
      <span className={`deploy-queue-chip tone-${statusTone[ticket.status]}`}>{statusLabel[ticket.status]}</span>
      <div className="deploy-queue-ticket-body">
        <strong>{ticket.summary || ticket.branch}</strong>
        <span className="deploy-queue-meta">
          <code>{ticket.sha.slice(0, 10)}</code>
          {ticket.deployedCommit ? <> → <code>{ticket.deployedCommit.slice(0, 10)}</code></> : null}
          {" · "}{ticket.branch}{" · "}{relative(ticket.updatedAt, now)}
          {ticket.remotes === "failed" ? " · Remote push pending" : null}
        </span>
        {ticket.note ? <span className="deploy-queue-note">{ticket.note}</span> : null}
        {files.length > 0 ? (
          <span className="deploy-queue-files">
            {ticket.status === "CONFLICT" ? "Conflicting files: " : "Auto-resolved: "}{files.join(", ")}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function DeployQueueSettingsCard({ client = api }: { client?: DeployQueueClient }) {
  const [report, setReport] = useState<DeployQueueReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setReport(await client.deployQueue());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The deploy queue could not be loaded.");
    } finally {
      setNow(Date.now());
    }
  }, [client]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  if (!report) {
    return (
      <section className="deploy-queue-card" aria-label="Deploy queue">
        {error ? <p role="alert">{error}</p> : <p className="deploy-queue-muted">Loading the deploy queue…</p>}
      </section>
    );
  }

  const state = serviceState(report);
  return (
    <section className="deploy-queue-card" aria-label="Deploy queue">
      <div className="deploy-queue-summary">
        <span className={`deploy-queue-chip tone-${state.tone}`}>{state.label}</span>
        <p>{state.detail}</p>
        <button type="button" className="deploy-queue-refresh" onClick={() => void load()} aria-label="Refresh deploy queue">
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <p className="deploy-queue-muted">
        Agents submit committed worktrees with <code>space-queue submit</code>. The queue merges them on live main,
        builds them in isolation, deploys them in batches and pushes only verified commits.
      </p>
      <h4>In progress ({report.active.length})</h4>
      {report.active.length ? (
        <ul className="deploy-queue-list">{report.active.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} now={now} />)}</ul>
      ) : <p className="deploy-queue-muted">No changes are waiting.</p>}
      <h4>Recent results</h4>
      {report.recent.length ? (
        <ul className="deploy-queue-list">{report.recent.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} now={now} />)}</ul>
      ) : <p className="deploy-queue-muted">Nothing has gone through the queue yet.</p>}
      <p className="deploy-queue-muted">Last heartbeat {relative(report.heartbeatAt, now)}.</p>
    </section>
  );
}

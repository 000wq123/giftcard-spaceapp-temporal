import type { DeployQueueTicket, ReleaseActionResponse, ReleasesReport } from "@space/contracts";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../api.js";
import { RefreshCw } from "../ui-theme/app-icons.js";
import "../deploy-queue/deploy-queue.css";
import "./releases.css";

export interface ReleasesClient {
  releases(): Promise<ReleasesReport>;
  promoteRelease(): Promise<ReleaseActionResponse>;
  approveHotfix(ticketId: string): Promise<ReleaseActionResponse>;
}

const REFRESH_MS = 15_000;
const PROMOTION_BUSY = new Set(["QUEUED", "INTEGRATING", "VERIFYING", "DEPLOYING"]);

function short(commit: string | null): string {
  return commit ? commit.slice(0, 9) : "unknown";
}

function promotionState(ticket: DeployQueueTicket | null): { tone: string; label: string } | null {
  if (!ticket) return null;
  if (PROMOTION_BUSY.has(ticket.status)) return { tone: "busy", label: ticket.status === "QUEUED" ? "Promotion queued" : "Promoting" };
  if (ticket.status === "DEPLOYED") return { tone: "ok", label: "Last promotion succeeded" };
  if (ticket.status === "CANCELLED") return { tone: "idle", label: "Last promotion cancelled" };
  return { tone: "bad", label: "Last promotion failed" };
}

export function ReleasesSettingsCard({ client = api }: { client?: ReleasesClient }) {
  const [report, setReport] = useState<ReleasesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setReport(await client.releases());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Releases could not be loaded.");
    }
  }, [client]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = useCallback(async (action: () => Promise<ReleaseActionResponse>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage((await action()).message);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action failed.");
    } finally {
      setBusy(false);
      setConfirming(false);
      await load();
    }
  }, [load]);

  if (!report) {
    return (
      <section className="deploy-queue-card releases-card" aria-label="Releases">
        {error ? <p role="alert">{error}</p> : <p className="deploy-queue-muted">Loading releases…</p>}
      </section>
    );
  }

  if (!report.available) {
    return (
      <section className="deploy-queue-card releases-card" aria-label="Releases">
        <p className="deploy-queue-muted">There is no dev instance on this server. Changes deploy straight to this instance.</p>
      </section>
    );
  }

  const promotion = promotionState(report.promotion);
  const promoting = Boolean(report.promotion && PROMOTION_BUSY.has(report.promotion.status));
  const devBusy = Boolean(report.devQueue.current);
  const upToDate = report.pendingCount === 0;
  const blocked = !report.managedHere ? "Promote from the stable instance."
    : promoting ? "A promotion is already in progress."
      : devBusy ? "Dev is deploying a change; promote when it finishes."
        : upToDate ? "Stable already runs everything that is on dev."
          : null;

  return (
    <section className="deploy-queue-card releases-card" aria-label="Releases">
      <div className="releases-instances">
        <div className="releases-instance">
          <span className="deploy-queue-chip tone-ok">Stable</span>
          <code>{short(report.stable.commit)}</code>
          <span className="deploy-queue-muted">The instance you work in</span>
        </div>
        <div className="releases-instance">
          <span className="deploy-queue-chip tone-warn">Dev</span>
          <code>{short(report.dev.commit)}</code>
          <a href={report.dev.url} target="_blank" rel="noopener noreferrer">Open dev</a>
        </div>
        <button type="button" className="deploy-queue-refresh" onClick={() => void load()} aria-label="Refresh releases">
          <RefreshCw size={14} aria-hidden="true" />
        </button>
      </div>
      <p className="deploy-queue-muted">
        Agent changes go to {report.defaultTarget === "dev" ? "dev first" : "stable directly"}. Stable changes only when you promote dev.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status" className="releases-message">{message}</p> : null}
      {promotion && report.promotion ? (
        <p className="releases-promotion">
          <span className={`deploy-queue-chip tone-${promotion.tone}`}>{promotion.label}</span>
          {report.promotion.note ? <span className="deploy-queue-note">{report.promotion.note}</span> : null}
        </p>
      ) : null}

      <h4>On dev, not yet on stable ({report.pendingCount})</h4>
      {report.pending.length ? (
        <ul className="releases-pending">
          {report.pending.map((change) => <li key={change.commit}>{change.summary}</li>)}
        </ul>
      ) : <p className="deploy-queue-muted">Nothing is waiting.</p>}

      {confirming ? (
        <div className="releases-confirm" role="group" aria-label="Confirm promotion">
          <p>
            Stable builds and restarts once (about 5 minutes). CLI sessions keep running, and a failed check rolls stable back
            automatically. Promote {report.pendingCount} change{report.pendingCount === 1 ? "" : "s"} now?
          </p>
          <div className="releases-actions">
            <button type="button" className="releases-primary" disabled={busy} onClick={() => void run(() => client.promoteRelease())}>
              {busy ? "Promoting…" : "Promote now"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="releases-actions">
          <button type="button" className="releases-primary" disabled={Boolean(blocked) || busy} onClick={() => setConfirming(true)}>
            Promote dev to stable
          </button>
          {blocked ? <span className="deploy-queue-muted">{blocked}</span> : null}
        </div>
      )}

      {report.hotfixes.length ? (
        <>
          <h4>Stable hotfixes waiting for approval</h4>
          <ul className="deploy-queue-list">
            {report.hotfixes.map((hotfix) => (
              <li key={hotfix.id} className="releases-hotfix">
                <div className="deploy-queue-ticket-body">
                  <strong>{hotfix.summary || hotfix.branch}</strong>
                  <span className="deploy-queue-meta"><code>{hotfix.sha.slice(0, 10)}</code> · {hotfix.branch}</span>
                </div>
                <button type="button" disabled={busy || !report.managedHere} onClick={() => void run(() => client.approveHotfix(hotfix.id))}>
                  Approve
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

import type { StreamingModerationAction } from "@space/contracts";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Undo2 } from "../ui-theme/app-icons.js";
import { api } from "../../api.js";
import { DockButton, DockIconButton, DockNotice, DockState } from "../dock-kit/DockKit.js";
import {
  moderationDecisionLabel,
  moderationResultLabel,
  providerLabel,
  readableCode
} from "./streaming-labels.js";

const resultTone: Record<StreamingModerationAction["result"], string> = {
  PENDING: "is-accent",
  SUCCEEDED: "is-success",
  FAILED: "is-danger",
  UNAVAILABLE: "",
  REVIEW: "is-warning",
  UNDONE: ""
};

export function StreamingModerationTab() {
  const [actions, setActions] = useState<StreamingModerationAction[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      setActions((await api.streamingModerationActions()).actions);
      setError(null);
      setLoadFailed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Moderation history could not be loaded.");
      setLoadFailed(true);
    } finally {
      setHasLoaded(true);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function undo(id: string) {
    setBusy(id);
    try { await api.undoStreamingModerationAction(id); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The timeout could not be undone."); }
    finally { setBusy(null); }
  }
  return <div className="streaming-bot-tab">
    <section className="streaming-section" aria-labelledby="streaming-moderation-heading">
      <div className="streaming-section-heading">
        <h3 id="streaming-moderation-heading" className="dock-kit-section-title">Moderation</h3>
        <DockIconButton label="Refresh moderation history" icon={RefreshCw} onClick={() => void refresh()} disabled={busy !== null} />
      </div>
      <p className="streaming-hint">Warnings and 5 or 30 minute timeouts are separate from bot replies. Pending Discord channels and missing platform permissions stay unavailable.</p>
      {error && actions.length ? <DockNotice onDismiss={() => setError(null)}>{error}</DockNotice> : null}
      {!actions.length ? (
        !hasLoaded ? <DockState kind="loading" title="Loading moderation history…" />
          : loadFailed && error ? <DockState kind="error" title="Moderation history could not be loaded" detail={error} action={{ label: "Try again", onClick: () => void refresh() }} />
            : <DockState kind="empty" icon={ShieldCheck} title="No moderation actions yet" detail="Warnings and timeouts appear here once moderation is active." />
      ) : <ul className="streaming-bot-activity">
        {actions.map(action => <li key={action.id} className="dock-kit-card">
          <div className="dock-kit-meta">
            <span className="dock-kit-card-title">{providerLabel(action.platform)} · {moderationDecisionLabel(action.decision)}</span>
            <span className={`dock-kit-badge ${resultTone[action.result] ?? ""}`}>{moderationResultLabel(action.result)}</span>
            <time className="dock-kit-meta-text" dateTime={action.createdAt}>{new Date(action.createdAt).toLocaleString()}</time>
          </div>
          <p>Viewer {action.userId} · {readableCode(action.reason)}{action.durationSeconds ? ` · ${action.durationSeconds / 60} minutes` : ""}</p>
          {action.safeErrorCode ? <small className="streaming-hint">Platform result: {readableCode(action.safeErrorCode)}</small> : null}
          {action.result === "SUCCEEDED" && action.durationSeconds ? (
            <div className="dock-kit-card-actions">
              <DockButton icon={Undo2} busy={busy === action.id} disabled={busy !== null} onClick={() => void undo(action.id)}>Undo timeout</DockButton>
            </div>
          ) : null}
        </li>)}
      </ul>}
    </section>
  </div>;
}

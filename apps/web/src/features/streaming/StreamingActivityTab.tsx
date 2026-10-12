import { useCallback, useEffect, useState } from "react";
import type { StreamingBotActivity } from "@space/contracts";
import { Activity, RefreshCw } from "../ui-theme/app-icons.js";
import { api } from "../../api.js";
import { DockIconButton, DockNotice, DockState } from "../dock-kit/DockKit.js";
import { activityStatusLabel, providerLabel } from "./streaming-labels.js";

const statusTone: Record<StreamingBotActivity["status"], string> = {
  REPLIED: "is-success",
  SKIPPED: "",
  ERROR: "is-danger",
  TEST: "is-accent"
};

export function StreamingActivityTab() {
  const [activity, setActivity] = useState<StreamingBotActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setActivity((await api.streamingBotActivity(100)).data); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Streaming activity could not be loaded."); }
    finally { setLoading(false); setHasLoaded(true); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  return <section className="streaming-section" aria-labelledby="streaming-activity-heading">
    <div className="streaming-section-heading">
      <h3 id="streaming-activity-heading" className="dock-kit-section-title">Activity</h3>
      <DockIconButton label="Refresh activity" icon={RefreshCw} busy={loading} disabled={loading} onClick={() => void refresh()} />
    </div>
    {error && activity.length ? <DockNotice onDismiss={() => setError(null)}>{error}</DockNotice> : null}
    {activity.length === 0 ? (
      !hasLoaded ? <DockState kind="loading" title="Loading activity…" />
        : error ? <DockState kind="error" title="Streaming activity could not be loaded" detail={error} action={{ label: "Try again", onClick: () => void refresh() }} />
          : <DockState kind="empty" icon={Activity} title="No activity yet" detail="Bot replies and skipped chat messages appear here." />
    ) :
      <ul className="streaming-bot-activity">{activity.map(record => <li key={record.id} className="dock-kit-card" data-direction={record.direction} data-status={record.status}>
        <span className="dock-kit-meta">
          <span className="dock-kit-card-title">{record.direction === "IN" ? "Viewer" : "Bot"} · {providerLabel(record.platform)}</span>
          <span className={`dock-kit-badge ${statusTone[record.status] ?? ""}`}>{activityStatusLabel(record.status)}</span>
          <time className="dock-kit-meta-text" dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleTimeString()}</time>
        </span>
        <p>{record.message}</p>
        {record.reply ? <p className="streaming-bot-activity-reply">Reply: {record.reply}</p> : null}
      </li>)}</ul>}
  </section>;
}

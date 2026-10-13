import { useEffect, useState } from "react";
import type { BrowserHandoffRequest, JobApplication } from "@space/contracts";
import { UserCheck } from "../ui-theme/app-icons.js";

function elapsedLabel(sinceIso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(sinceIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Over the live browser while the copilot waits for the operator. REQUESTED: the agent asked;
 * ACCEPTED: the operator holds the browser and gives it back with "Return to agent".
 */
export function HandoffOverlay({ handoff, posting, onTakeControl, onReturnToAgent }: {
  handoff: BrowserHandoffRequest;
  posting: JobApplication | null;
  onTakeControl(): void;
  onReturnToAgent(): void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const accepted = handoff.status === "ACCEPTED";
  if (accepted) {
    return (
      <div className="jc-handoff-strip" role="status">
        <UserCheck aria-hidden="true" />
        <span><strong>You hold the browser.</strong> {handoff.reason}</span>
        <span className="jc-handoff-elapsed">{elapsedLabel(handoff.acceptedAt ?? handoff.requestedAt, now)}</span>
        <button type="button" className="jc-button primary" onClick={onReturnToAgent}>Return to agent</button>
      </div>
    );
  }
  return (
    <div className="jc-handoff" role="alertdialog" aria-label="The copilot needs you" aria-describedby="jc-handoff-reason">
      <div className="jc-handoff-card">
        <span className="jc-handoff-pulse" aria-hidden="true" />
        <strong>The copilot needs you</strong>
        <p id="jc-handoff-reason">{handoff.reason}</p>
        {posting ? <p className="jc-handoff-posting">{posting.company} · {posting.role}</p> : null}
        <div className="jc-handoff-actions">
          <button type="button" className="jc-button primary" onClick={onTakeControl}>Take control</button>
          <span className="jc-handoff-elapsed">waiting {elapsedLabel(handoff.requestedAt, now)}</span>
        </div>
      </div>
    </div>
  );
}

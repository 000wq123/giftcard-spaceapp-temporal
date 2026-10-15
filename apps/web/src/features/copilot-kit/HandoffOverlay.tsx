import { useEffect, useState } from "react";
import type { BrowserHandoffRequest } from "@space/contracts";
import { UserCheck } from "../ui-theme/app-icons.js";

function elapsedLabel(sinceIso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(sinceIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Over a copilot's live browser while the agent waits for the operator (login, two-step code, CAPTCHA).
 * REQUESTED: the agent asked; ACCEPTED: the operator holds the browser and gives it back with "Return to agent".
 */
export function HandoffOverlay({ handoff, detail, onTakeControl, onReturnToAgent }: {
  handoff: BrowserHandoffRequest;
  /** What the copilot is working on (a posting, a post), shown under the reason. */
  detail?: string | null;
  onTakeControl(): void;
  onReturnToAgent(): void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const accepted = handoff.status === "ACCEPTED";
  // An expired request can no longer be accepted; its card must not cover the browser.
  if (!accepted && Date.parse(handoff.expiresAt) <= now) return null;
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
        {detail ? <p className="jc-handoff-posting">{detail}</p> : null}
        <div className="jc-handoff-actions">
          <button type="button" className="jc-button primary" onClick={onTakeControl}>Take control</button>
          <span className="jc-handoff-elapsed">waiting {elapsedLabel(handoff.requestedAt, now)}</span>
        </div>
      </div>
    </div>
  );
}

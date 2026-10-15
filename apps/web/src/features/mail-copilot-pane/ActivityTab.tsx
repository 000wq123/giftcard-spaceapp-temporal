import { useState } from "react";
import type { MailCopilotEvent, MailCopilotPendingItem, MailComposeInput } from "@space/contracts";
import { api } from "../../api.js";
import { AlertTriangle, Archive, Check, CheckCircle2, CircleHelp, FileText, Flame, Mail, Pause, Pencil, Play, RefreshCw, Send, ShieldCheck, Square, Star, Trash2, X } from "../ui-theme/app-icons.js";
import { mailTime } from "./MailClient.js";

const EVENT_ICON: Partial<Record<MailCopilotEvent["type"], typeof Check>> = {
  MAIL_RECEIVED: Mail, TRIAGE: Mail, USER_ACTION: Pencil, TRIAGED: Check, DRAFTED: Pencil, REPLIED: Send, SENT: Send, ARCHIVED: Archive, TRASHED: Trash2, LABELED: FileText, STARRED: Star,
  SKIPPED: Check, NEEDS_USER: CircleHelp, QUESTION: CircleHelp, ANSWERED: Check, REVIEW_REQUESTED: CircleHelp, REVIEW_DECIDED: CheckCircle2, NOTE: FileText,
  RUN_STARTED: Play, RUN_PAUSED: Pause, RUN_RESUMED: Play, RUN_STOPPED: Square, RUN_FINISHED: Flame, SYNC_RESET: AlertTriangle, RULE_PROPOSED: ShieldCheck, RULE_DECIDED: ShieldCheck, RULE_APPLIED: ShieldCheck
};
const EVENT_TONE: Partial<Record<MailCopilotEvent["type"], string>> = { SENT: "ok", REPLIED: "ok", REVIEW_DECIDED: "ok", RUN_FINISHED: "ok", RULE_DECIDED: "ok", QUESTION: "warn", REVIEW_REQUESTED: "warn", NEEDS_USER: "warn", RULE_PROPOSED: "warn", SYNC_RESET: "bad", TRIAGE: "muted", MAIL_RECEIVED: "muted", USER_ACTION: "muted" };

function ReviewCard({ item, paneId, onDone }: { item: MailCopilotPendingItem; paneId: string; onDone(): void }) {
  const draft = item.payload.draft as MailComposeInput | undefined;
  const [text, setText] = useState(draft?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!draft) return null;
  async function decide(decision: "approve" | "edit" | "reject") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.decideMailReview(paneId, { reviewId: item.id, decision, ...(decision === "edit" ? { text } : {}) });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The decision failed.");
      setBusy(false);
    }
  }
  const edited = text !== draft.text;
  return (
    <section className="jc-pending" aria-label="Review a reply">
      <header><CircleHelp aria-hidden="true" /> <strong>Review a reply</strong><span className="jc-muted">{draft.account} → {draft.to.join(", ")}</span></header>
      <p className="mc-review-subject"><strong>{draft.subject || "(no subject)"}</strong></p>
      {typeof item.payload.reasoning === "string" && item.payload.reasoning ? <p className="jc-muted">{item.payload.reasoning}</p> : null}
      <textarea className="mc-review-text" rows={8} value={text} aria-label="Reply text" disabled={busy} onChange={(event) => setText(event.target.value)} />
      <div className="jc-actions">
        <button type="button" className="jc-button primary" disabled={busy} onClick={() => void decide(edited ? "edit" : "approve")}><Check aria-hidden="true" /> {edited ? "Send my version" : "Approve and send"}</button>
        <button type="button" className="jc-button ghost danger" disabled={busy} onClick={() => void decide("reject")}><X aria-hidden="true" /> Reject</button>
      </div>
      {error ? <p className="jc-message" role="alert">{error}</p> : null}
    </section>
  );
}

function QuestionCard({ item, paneId, onDone }: { item: MailCopilotPendingItem; paneId: string; onDone(): void }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = Array.isArray(item.payload.options) ? item.payload.options.filter((option): option is string => typeof option === "string") : [];
  const question = typeof item.payload.question === "string" ? item.payload.question : item.message;
  async function submit(value: string) {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.answerMailQuestion(paneId, { questionId: item.id, answer: value.trim() });
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The answer failed.");
      setBusy(false);
    }
  }
  return (
    <section className="jc-pending" aria-label="The copilot asks">
      <header><CircleHelp aria-hidden="true" /> <strong>The copilot asks</strong>{item.accountEmail ? <span className="jc-muted">{item.accountEmail}</span> : null}</header>
      <p>{question}</p>
      {options.length ? <div className="jc-pending-options">{options.map((option) => <button key={option} type="button" className="jc-chip" disabled={busy} onClick={() => void submit(option)}>{option}</button>)}</div> : null}
      <form className="jc-pending-answer" onSubmit={(event) => { event.preventDefault(); void submit(answer); }}>
        <input value={answer} placeholder="Type the answer; the copilot remembers it" aria-label="Answer" disabled={busy} onChange={(event) => setAnswer(event.target.value)} />
        <button type="submit" className="jc-button primary" disabled={busy || !answer.trim()}>Answer</button>
      </form>
      {error ? <p className="jc-message" role="alert">{error}</p> : null}
    </section>
  );
}

/** The Activity rail tab: what waits for the operator (reviews, questions), then the timeline. */
export function ActivityTab({ paneId, events, pending, onChanged, onOpenThread }: {
  paneId: string;
  events: MailCopilotEvent[];
  pending: MailCopilotPendingItem[];
  onChanged(): void;
  onOpenThread(account: string, threadId: string): void;
}) {
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const checkNow = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const result = await api.syncMailCopilot(paneId);
      setChecked(result.created === 0 ? "No new mail." : result.created === 1 ? "1 new message." : `${result.created} new messages.`);
      onChanged();
    } catch (error) {
      setChecked(error instanceof Error ? error.message : "The check failed.");
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="jc-activity" role="tabpanel" id="jc-panel-activity" aria-labelledby="jc-tab-activity">
      <div className="jc-memory-toolbar">
        <button type="button" className="jc-button" disabled={checking} onClick={() => void checkNow()} title="Read what arrived since the last check"><RefreshCw aria-hidden="true" /> {checking ? "Checking…" : "Check for new mail"}</button>
        {checked ? <span className="jc-muted" role="status">{checked}</span> : null}
      </div>
      {pending.map((item) => item.kind === "REVIEW" ? <ReviewCard key={item.id} item={item} paneId={paneId} onDone={onChanged} /> : <QuestionCard key={item.id} item={item} paneId={paneId} onDone={onChanged} />)}
      {events.length === 0 ? (
        <div className="jc-empty"><strong>No activity yet</strong><span>Press Start. Every triage, draft, reply, question and lesson lands here as the copilot works.</span></div>
      ) : (
        <ol className="jc-timeline" aria-label="Activity">
          {events.map((event) => {
            const Icon = EVENT_ICON[event.type] ?? FileText;
            return (
              <li key={event.id} className={`jc-event tone-${EVENT_TONE[event.type] ?? "info"}`}>
                <span className="jc-event-icon" aria-hidden="true"><Icon /></span>
                <div className="jc-event-body">
                  <p>{event.message}</p>
                  <div className="jc-event-meta">
                    {event.accountEmail && event.threadId ? <button type="button" className="jc-event-link" onClick={() => onOpenThread(event.accountEmail!, event.threadId!)}>Open conversation</button> : null}
                    <span className="jc-muted" title={event.createdAt}>{mailTime(event.createdAt)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ClipboardItem, NousDecision, NousMessage, NousOverview, NousState } from "@space/contracts";
import { api } from "../../api.js";
import { ChatMarkdown } from "../agent-pane/ChatMarkdown.js";
import { DockButton, DockChips, DockFullscreenButton, DockIconButton, DockNotice, DockState, DockToolbar, useDockConfirm } from "../dock-kit/DockKit.js";
import { useIsDockActive } from "../docks/dock-active-context.js";
import { SpaceToggle } from "../ui-controls/SpaceToggle.js";
import { Check, CircleStop, Maximize2, Minimize2, Nous, Send, Trash2, X } from "../ui-theme/app-icons.js";
import { NousBrain3D } from "./NousBrain3D.js";
import "./nous.css";

type Tab = "conversation" | "decisions" | "overview";
const FAST_POLL_MS = 3_000;
const SLOW_POLL_MS = 20_000;
const STATUS_LABELS: Record<NousState["status"], string> = {
  OFF: "Off: answers you only", IDLE: "On: watching every room", THINKING: "Thinking…", PAUSED_MODEL: "Paused: its model is not available"
};
const CATEGORY_LABELS: Record<NousDecision["category"], string> = { RELEASE: "Release", DESTRUCTIVE: "Irreversible", EXTERNAL: "Third parties or money", DIRECTION: "Direction" };
const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const planIdsIn = (text: string) => [...new Set(text.match(/clipboard:[A-Za-z0-9_-]+/g) ?? [])];
const statusText = (status: string) => status.replace(/_/g, " ").toLowerCase();

// shortcut: there is no single-record clipboard route, so the PLAN list is paged until every id is found (at most 1,000 plans);
// add GET /api/clipboard-items/:id if the operator's plans outgrow it. Missing ids come back as null.
async function findPlans(ids: string[]): Promise<Record<string, ClipboardItem | null>> {
  const found: Record<string, ClipboardItem | null> = Object.fromEntries(ids.map((id) => [id, null]));
  for (let page = 1, left = ids.length; page <= 10 && left > 0; page += 1) {
    const result = await api.clipboardItems({ source: "PLAN", pageSize: 100, page });
    for (const item of result.data) if (found[item.id] === null) { found[item.id] = item; left -= 1; }
    if (page >= result.pagination.totalPages) break;
  }
  return found;
}

/** Nous, the mind of SpaceApp: the one conversation over every room, the critical decisions it brings you and the plans it drives. */
export function NousDock({ canRun = false }: { canRun?: boolean }) {
  const isActive = useIsDockActive();
  const { confirm, confirmDialog } = useDockConfirm();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [planView, setPlanView] = useState<string | null>(null);
  const [plans, setPlans] = useState<Record<string, ClipboardItem | null>>({});
  const [state, setState] = useState<NousState | null>(null);
  const [messages, setMessages] = useState<NousMessage[] | null>(null);
  const [decisions, setDecisions] = useState<NousDecision[]>([]);
  const [overview, setOverview] = useState<NousOverview | null>(null);
  const [tab, setTab] = useState<Tab>("conversation");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    const [next, list, open] = await Promise.all([api.nous(), api.nousMessages(), api.nousDecisions()]);
    setState(next.state);
    setMessages(list.messages);
    setDecisions(open.decisions);
  }, []);

  const thinking = state?.status === "THINKING" || sending;
  useEffect(() => {
    if (!isActive || !canRun) return;
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      try { await refresh(); } catch (err) { if (!cancelled) setError(messageOf(err, "Nous could not be reached.")); }
      if (!cancelled) timer = window.setTimeout(() => void tick(), thinking ? FAST_POLL_MS : SLOW_POLL_MS);
    };
    void tick();
    return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer); };
  }, [isActive, canRun, refresh, thinking]);

  useEffect(() => {
    if (!isActive || !canRun || tab !== "overview") return;
    let cancelled = false;
    const load = () => api.nousOverview().then((result) => { if (!cancelled) setOverview(result.overview); })
      .catch((err: unknown) => { if (!cancelled) setError(messageOf(err, "The overview could not be loaded.")); });
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [isActive, canRun, tab]);

  // One Escape closes the open plan first, then fullscreen (useDockFullscreen would leave both at once).
  useEffect(() => {
    if (!isFullscreen && !planView) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { if (planView) setPlanView(null); else setIsFullscreen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, planView]);

  // Plans Nous asks about (refs.planId) or names in a reply.
  const planIds = useMemo(() => [...new Set([
    ...decisions.flatMap((decision) => decision.refs.planId ? [decision.refs.planId] : []),
    ...(messages ?? []).flatMap((entry) => entry.kind === "ANSWER" ? planIdsIn(entry.content) : [])
  ])].sort().join(" "), [decisions, messages]);
  const loadPlans = useCallback((ids: string[]) => findPlans(ids).then((found) => setPlans((current) => ({ ...current, ...found })))
    .catch((err: unknown) => setError(messageOf(err, "The plan could not be loaded."))), []);
  useEffect(() => {
    const missing = planIds ? planIds.split(" ").filter((id) => !(id in plans)) : [];
    if (missing.length) void loadPlans(missing);
  }, [planIds, plans, loadPlans]);
  const openPlan = (id: string) => { setPlanView(id); void loadPlans([id]); };
  const planCard = (id: string, key: string) => <NousPlanCard key={key} plan={plans[id]} open={false} onToggle={() => openPlan(id)} />;

  const count = messages?.length ?? 0;
  useEffect(() => { const list = listRef.current; if (list) list.scrollTop = list.scrollHeight; }, [count, tab]);

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.sendNousMessage(content);
      setDraft("");
      await refresh();
    } catch (err) {
      setError(messageOf(err, "Your message could not be sent."));
    } finally {
      setSending(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  };
  const act = async (work: () => Promise<unknown>, fallback: string) => {
    setError(null);
    try { await work(); await refresh(); } catch (err) { setError(messageOf(err, fallback)); }
  };

  const answerDecision = (decision: NousDecision) => (input: { answer: "APPROVE" | "DECLINE" | "ANSWER"; text?: string }) =>
    act(() => api.answerNousDecision(decision.id, input), "Your answer could not be saved.");

  if (!canRun) {
    return (
      <section className="dock-panel nous-dock" aria-label="Nous">
        <DockState kind="empty" icon={Nous} title="Nous is available to administrators and operators" />
      </section>
    );
  }

  const open = decisions.filter((decision) => decision.status === "OPEN");
  const fullscreen = isFullscreen || planView !== null;
  const timeline = messages === null ? [] : [
    ...messages.map((entry) => ({ at: entry.createdAt, node: <NousMessageRow key={entry.id} message={entry} planCard={planCard} /> })),
    // Every decision sits where Nous asked it; one about a plan carries the plan card that opens it.
    ...decisions.map((decision) => ({ at: decision.createdAt, node: (
      <NousDecisionCard key={decision.id} inline decision={decision} onAnswer={answerDecision(decision)}
        plan={decision.refs.planId ? planCard(decision.refs.planId, "plan") : null} />
    ) }))
  ].sort((a, b) => a.at.localeCompare(b.at)).map((entry) => entry.node);
  return (
    <section className={`dock-panel nous-dock${fullscreen ? " is-fullscreen" : ""}`} aria-label="Nous">
      <header className="nous-hero">
        <NousBrain3D animate={isActive} thinking={thinking} />
        <div className="nous-hero-text">
          <h2>Nous</h2>
          <p className="nous-tagline">The mind of SpaceApp · {state ? `${state.model.replace(/^claude-/, "Claude ").replace(/-(\d)-(\d)$/, " $1.$2")} · ${state.effort}` : "…"}</p>
          <p className={`nous-status is-${(state?.status ?? "OFF").toLowerCase()}`} role="status">{state ? STATUS_LABELS[state.status] : "Loading…"}</p>
        </div>
      </header>
      <div className="nous-settings">
        <SpaceToggle compact label="Work on my behalf" ariaLabel="Nous works on my behalf"
          detail="Nous answers panes and copilots in every room, moves the plans on and holds your notifications. Releases, irreversible actions and anything to third parties still come to you."
          checked={Boolean(state?.settings.enabled)} disabled={!state}
          onChange={(enabled) => void act(() => api.updateNousSettings({ enabled }), "The setting could not be saved.")
            // Turning it on starts a first review at once: look again shortly so the dock shows it thinking.
            .then(() => { if (enabled) window.setTimeout(() => void refresh().catch(() => undefined), 1_500); })} />
        <SpaceToggle compact label="May promote dev to stable" ariaLabel="Nous may promote dev to stable"
          detail="Nous batches finished work and promotes dev to stable without asking you. Hotfixes, npm releases and queue control stay yours."
          checked={Boolean(state?.settings.mayPromote)} disabled={!state}
          onChange={(mayPromote) => void act(() => api.updateNousSettings({ mayPromote }), "The setting could not be saved.")} />
        <SpaceToggle compact label="May approve Warm changes" ariaLabel="Nous may approve Warm changes"
          detail="Nous approves changes to the protected Warm code after reading them; the tests and the real-browser performance check stay required."
          checked={Boolean(state?.settings.mayApproveWarm)} disabled={!state}
          onChange={(mayApproveWarm) => void act(() => api.updateNousSettings({ mayApproveWarm }), "The setting could not be saved.")} />
        {state?.lastError ? <p className="nous-muted">Last problem: {state.lastError}</p> : null}
      </div>
      <DockToolbar className="nous-toolbar" summary={<DockChips label="Nous views" value={tab} onChange={(next) => { setPlanView(null); setTab(next); }} options={[
        { id: "conversation", label: "Conversation" }, { id: "decisions", label: "Decisions", ...(open.length ? { count: open.length } : {}) }, { id: "overview", label: "Overview" }
      ]} />}>
        {tab === "conversation" && !planView ? (
          <DockIconButton label="Clear the conversation" icon={Trash2} disabled={thinking || !count} onClick={async () => {
            if (!(await confirm({ title: "Clear the conversation?", message: "Nous keeps its notes and decisions; the messages are removed.", confirmLabel: "Clear" }))) return;
            await act(() => api.clearNousMessages(), "The conversation could not be cleared.");
          }} />
        ) : null}
        <DockFullscreenButton name="Nous" active={fullscreen} onToggle={() => { setPlanView(null); setIsFullscreen(!fullscreen); }} />
      </DockToolbar>
      {error ? <DockNotice onDismiss={() => setError(null)}>{error}</DockNotice> : null}
      {planView ? (
        <NousPlanView plan={plans[planView]} decisions={decisions.filter((decision) => decision.refs.planId === planView)}
          onClose={() => setPlanView(null)} answerDecision={answerDecision} />
      ) : tab === "conversation" ? (
        <>
          <div className="nous-messages" ref={listRef} aria-live="polite">
            {messages === null ? <DockState kind="loading" title="Loading the conversation" /> : null}
            {messages?.length === 0 ? <DockState kind="empty" icon={Nous} title="Talk to Nous" detail="Ask what is happening in every room, give it a goal, or turn on “Work on my behalf”." /> : null}
            {timeline}
            {/* Operator request 2026-10-17: Nous's questions are answered in the conversation too, not only in Decisions. */}
            {open.map((decision) => (
              <NousDecisionCard key={decision.id} decision={decision}
                onAnswer={answerDecision(decision)} />
            ))}
          </div>
          <form className="nous-composer" onSubmit={(event) => void send(event)}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} rows={2} maxLength={8_000}
              placeholder="Message Nous" aria-label="Message Nous" />
            {state?.status === "THINKING" ? (
              <DockIconButton label="Stop" icon={CircleStop} onClick={() => void act(() => api.stopNous(), "Nous could not be stopped.")} />
            ) : null}
            <DockIconButton label="Send" icon={Send} type="submit" disabled={!draft.trim() || sending} busy={sending} />
          </form>
        </>
      ) : tab === "decisions" ? (
        <div className="nous-decisions">
          {decisions.length === 0 ? <DockState kind="empty" icon={Nous} title="No decisions" detail="Nous brings you only releases, irreversible actions, anything to third parties or with money, and product direction." /> : null}
          {decisions.map((decision) => (
            <NousDecisionCard key={decision.id} decision={decision} onAnswer={answerDecision(decision)} />
          ))}
        </div>
      ) : (
        <NousOverviewView overview={overview} />
      )}
      {confirmDialog}
    </section>
  );
}

function NousMessageRow({ message, planCard }: { message: NousMessage; planCard(id: string, key: string): ReactNode }) {
  switch (message.kind) {
    case "OPERATOR": return <div className="nous-message is-operator"><p>{message.content}</p></div>;
    case "ANSWER": return (
      <div className="nous-message is-answer"><ChatMarkdown content={message.content} />{planIdsIn(message.content).map((id) => planCard(id, id))}</div>
    );
    case "TOOL": return <div className={`nous-tool is-${message.status.toLowerCase()}`}>{message.content}</div>;
    case "INBOX": return (
      <details className="nous-inbox"><summary>From the rooms and the notifications</summary><pre>{message.content}</pre></details>
    );
    case "DECISION": return <div className="nous-message is-decision"><p>{message.content}</p></div>;
    default: return <div className="nous-message is-error" role="alert"><p>{message.content}</p></div>;
  }
}

/** The Decisions tab's card; inline (in the conversation) it keeps the body short and says "Not now" instead of "Decline". */
function NousDecisionCard({ decision, onAnswer, inline = false, plan = null }: {
  decision: NousDecision; onAnswer(input: { answer: "APPROVE" | "DECLINE" | "ANSWER"; text?: string }): Promise<void>; inline?: boolean; plan?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const answer = async (input: { answer: "APPROVE" | "DECLINE" | "ANSWER"; text?: string }) => {
    setBusy(true);
    try { await onAnswer(input); setText(""); } finally { setBusy(false); }
  };
  const open = decision.status === "OPEN";
  return (
    <article className={`nous-decision is-${decision.status.toLowerCase()}${inline ? " is-inline" : ""}`} aria-label={decision.title}>
      <header>
        <span className={`nous-category is-${decision.category.toLowerCase()}`}>{CATEGORY_LABELS[decision.category]}</span>
        <h3>{decision.title}</h3>
      </header>
      {decision.body ? <ChatMarkdown content={decision.body} /> : null}
      {plan}
      {decision.recommendation ? <p className="nous-recommendation"><strong>Nous recommends:</strong> {decision.recommendation}</p> : null}
      {decision.action ? <p className="nous-muted">On approval Space runs: {describeAction(decision.action)}</p> : null}
      {open ? (
        <div className="nous-decision-actions">
          {/* With an action, Approve runs it; an option button would only answer in words and leave the action unrun (stable 2026-10-17). */}
          {(decision.action ? [] : decision.options).map((option) => (
            <DockButton key={option} disabled={busy} onClick={() => void answer({ answer: "ANSWER", text: option })}>{option}</DockButton>
          ))}
          <DockButton tone="primary" icon={Check} disabled={busy} onClick={() => void answer({ answer: "APPROVE" })}>Approve</DockButton>
          <DockButton icon={X} disabled={busy} onClick={() => void answer({ answer: "DECLINE" })}>{inline ? "Not now" : "Decline"}</DockButton>
          <form className="nous-decision-answer" onSubmit={(event) => { event.preventDefault(); if (text.trim()) void answer({ answer: "ANSWER", text: text.trim() }); }}>
            <input value={text} onChange={(event) => setText(event.target.value)} maxLength={2_000} placeholder="Or answer in your words" aria-label="Your answer" />
            <DockIconButton label="Send answer" icon={Send} type="submit" disabled={busy || !text.trim()} />
          </form>
        </div>
      ) : (
        <p className="nous-muted">{decision.status === "APPROVED" ? "Approved" : decision.status === "DECLINED" ? "Declined" : decision.status === "ANSWERED" ? "Answered" : "Cancelled"}
          {decision.answeredAt ? ` ${new Date(decision.answeredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
          {decision.status === "ANSWERED" ? `: ${decision.answer ?? ""}` : ""}{decision.outcome ? ` · ${decision.outcome}` : ""}</p>
      )}
    </article>
  );
}

/** A plan in the conversation; undefined while it loads, null when the clipboard has no such plan. The same button opens and closes it. */
function NousPlanCard({ plan, open, onToggle }: { plan: ClipboardItem | null | undefined; open: boolean; onToggle(): void }) {
  const title = plan ? plan.title ?? plan.text.split("\n")[0]!.replace(/^#+\s*/, "").slice(0, 120) : plan === null ? "Plan not found" : "Loading the plan…";
  const next = plan ? [...plan.steps].sort((a, b) => a.order - b.order).find((step) => step.status !== "COMPLETED") : undefined;
  return (
    <article className="nous-plan nous-plan-card" aria-label={`Plan: ${title}`}>
      <div className="nous-plan-head"><strong>{title}</strong>{plan ? <span>{plan.progressPercentage}%</span> : null}</div>
      {plan ? (
        <>
          <div className="nous-progress" role="progressbar" aria-valuenow={plan.progressPercentage} aria-valuemin={0} aria-valuemax={100} aria-label={`${title} progress`}>
            <span style={{ width: `${plan.progressPercentage}%` }} />
          </div>
          <p className="nous-muted">{plan.isCompleted ? "completed" : statusText(plan.executionStatus)}{next ? ` · next: ${next.order}. ${next.title}` : ""}</p>
        </>
      ) : null}
      <DockButton icon={open ? Minimize2 : Maximize2} aria-pressed={open} disabled={plan === null && !open} onClick={onToggle}>
        {open ? "Close the plan" : "Open the plan"}
      </DockButton>
    </article>
  );
}

/** The plan fullscreen inside the dock: its steps, its full text and the decisions Nous asked about it, answered as in the Decisions tab. */
function NousPlanView({ plan, decisions, onClose, answerDecision }: {
  plan: ClipboardItem | null | undefined; decisions: NousDecision[]; onClose(): void;
  answerDecision(decision: NousDecision): (input: { answer: "APPROVE" | "DECLINE" | "ANSWER"; text?: string }) => Promise<void>;
}) {
  return (
    <div className="nous-plan-view" role="region" aria-label="Plan">
      <NousPlanCard plan={plan} open onToggle={onClose} />
      {plan?.steps.length ? (
        <ol className="nous-plan-steps" aria-label="Steps">
          {[...plan.steps].sort((a, b) => a.order - b.order).map((step) => (
            <li key={step.id} className={`is-${step.status.toLowerCase()}`}><span>{step.title}</span> <span className="nous-step-status">{statusText(step.status)}</span></li>
          ))}
        </ol>
      ) : null}
      {plan ? <div className="nous-plan-text"><ChatMarkdown content={plan.text} /></div> : null}
      {decisions.map((decision) => <NousDecisionCard key={decision.id} inline decision={decision} onAnswer={answerDecision(decision)} />)}
    </div>
  );
}

function describeAction(action: NonNullable<NousDecision["action"]>): string {
  if (action.type === "PANE_TEXT") return action.mode === "ANSWER" ? `answer “${action.text}” to the pane's prompt` : `send “${action.text.slice(0, 160)}” to the pane`;
  if (action.type === "RELEASE_APPROVE") return `approve the ${action.product} release at its candidate commit`;
  if (action.type === "SPACE_CONTROL") return `run in Space Control: ${action.actions.map((entry) => [entry.kind, entry.operation].filter(Boolean).join(" ")).join(", ")}`;
  return `${action.decision} the ${action.copilot.toLowerCase()} copilot's ${action.item.toLowerCase()}`;
}

function NousOverviewView({ overview }: { overview: NousOverview | null }) {
  if (!overview) return <DockState kind="loading" title="Loading the overview" />;
  return (
    <div className="nous-overview">
      <section aria-label="Open plans">
        <h3>Open plans</h3>
        {overview.plans.length === 0 ? <p className="nous-muted">No open plans.</p> : null}
        {overview.plans.map((plan) => (
          <div key={plan.id} className="nous-plan">
            <div className="nous-plan-head"><strong>{plan.title}</strong><span>{plan.progress}%</span></div>
            <div className="nous-progress" role="progressbar" aria-valuenow={plan.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${plan.title} progress`}>
              <span style={{ width: `${plan.progress}%` }} />
            </div>
            <p className="nous-muted">{plan.status.replace(/_/g, " ").toLowerCase()}{plan.pane ? ` · ${plan.pane}` : " · no pane yet"}{plan.room ? ` in ${plan.room}` : ""}{plan.nextStep ? ` · next: ${plan.nextStep}` : ""}</p>
          </div>
        ))}
      </section>
      <section aria-label="Needs your hands">
        <h3>Needs your hands</h3>
        {overview.needsHands.length === 0 ? <p className="nous-muted">Nothing: no sign-in, CAPTCHA or handoff waits for you.</p> : (
          <ul>{overview.needsHands.map((item) => <li key={item.id}>{item.title}{item.room ? ` · ${item.room}` : ""}</li>)}</ul>
        )}
      </section>
      <section aria-label="Release trains">
        <h3>Release trains</h3>
        <pre className="nous-trains">{overview.trains || "No release trains."}</pre>
      </section>
      <section aria-label="Plan map">
        <h3>Plan map</h3>
        {overview.planMap ? <ChatMarkdown content={overview.planMap} /> : <p className="nous-muted">Nous writes here which plans depend on or collide with which.</p>}
      </section>
    </div>
  );
}

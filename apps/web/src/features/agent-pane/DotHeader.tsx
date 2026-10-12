import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { AgentPaneSession, DotProfile } from "@space/contracts";

const artwork: Record<DotProfile["appearance"]["character"], string> = {
  astronaut: "orbit", star: "nova", robot: "byte", comet: "comet", moon: "luna", planet: "cosmo"
};
export function dotArtwork(dot: DotProfile): string { return `/dots/${artwork[dot.appearance.character]}.svg`; }
export function dotStatus(session: AgentPaneSession | null, unavailable = false, goalStatus?: string): string {
  if (unavailable || !session) return "Status unavailable";
  if (session.pendingRequest?.kind === "APPROVAL") return "Waiting for approval";
  if (["QUEUED", "RUNNING", "INTERRUPTING"].includes(session.runStatus)
    || session.latestRun?.status === "QUEUED" || session.latestRun?.status === "RUNNING") return "Working";
  if (session.goal?.status === "paused" || goalStatus === "PAUSED") return "Paused";
  // An active server Goal is working between its steps.
  if (goalStatus === "ACTIVE") return "Working";
  if (session.runtimeState === "UNAVAILABLE") return "Offline";
  if (session.runtimeState === "AVAILABLE" && session.binding.status === "READY" && !session.pendingRequest && session.goal?.status !== "active") return "Ready";
  return "Status unavailable";
}
// Visual tone only; the status text remains the accessible source of truth.
function statusTone(status: string): "ready" | "working" | "waiting" | "paused" | "offline" | "unknown" {
  return status === "Ready" ? "ready" : status === "Working" ? "working" : status === "Waiting for approval" ? "waiting"
    : status === "Paused" ? "paused" : status === "Offline" ? "offline" : "unknown";
}
export function DotHeader({ dots, selected, status, blocked, motionActive, onSelect }: {
  dots: DotProfile[]; selected: DotProfile | null; status: string; blocked: boolean;
  motionActive: boolean; onSelect: (dot: DotProfile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState !== "hidden");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (blocked) setOpen(false);
  }, [blocked]);
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>(`[aria-checked="true"]`)?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node
        && (menuRef.current?.contains(event.target) || triggerRef.current?.contains(event.target))) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [open]);
  function close() { setOpen(false); triggerRef.current?.focus(); }
  function navigate(event: KeyboardEvent, index: number, menu: boolean) {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: menu ? 3 : 1, ArrowUp: menu ? -3 : -1 };
    if (event.key === "Escape" && menu) { event.preventDefault(); close(); return; }
    if (event.key === "Tab" && menu) { close(); return; }
    const delta = moves[event.key];
    if (delta === undefined && !["Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? dots.length - 1 : (index + (delta ?? 0) + dots.length) % dots.length;
    const container = menu ? menuRef.current : event.currentTarget.parentElement;
    container?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }
  return <header className="dots-header">
    <div className="dots-identity">
      {selected ? <span className="dots-selected-mascot" data-motion-active={motionActive && documentVisible ? "true" : "false"}>
        <img src={dotArtwork(selected)} alt="" width="36" height="36" />
      </span> : null}
      <div><strong>{selected?.name ?? "Dots"}</strong><span className="dots-status" role="status" data-status={statusTone(status)}>{status}</span></div>
    </div>
    <div className="dots-wide-selector" role="group" aria-label="Choose Dot">
      {dots.map((dot, i) => <button key={dot.dotId} type="button" aria-label={`Select ${dot.name}`} title={dot.name} aria-pressed={selected?.dotId === dot.dotId}
        disabled={blocked} onKeyDown={e => navigate(e, i, false)} onClick={() => onSelect(dot)}>
        <img src={dotArtwork(dot)} alt="" width="26" height="26" /><span className="dots-chip-label">{dot.name}</span>
      </button>)}
    </div>
    <div className="dots-narrow-selector">
      <button ref={triggerRef} type="button" aria-label="Choose Dot" aria-haspopup="menu" aria-expanded={open} disabled={blocked || dots.length !== 6}
        onClick={() => setOpen(value => !value)}>{selected ? <img src={dotArtwork(selected)} alt="" width="22" height="22" /> : null}
        <span>{selected?.name ?? "Choose Dot"}</span><span aria-hidden="true">⌄</span></button>
      {open ? <div ref={menuRef} className="dots-choice-menu" role="menu" aria-label="Dots">
          {dots.map((dot, i) => <button key={dot.dotId} type="button" role="menuitemradio" aria-checked={selected?.dotId === dot.dotId}
            onKeyDown={e => navigate(e, i, true)} onClick={() => { close(); onSelect(dot); }}>
            <img src={dotArtwork(dot)} alt="" width="36" height="36" /><span>{dot.name}</span>
          </button>)}
        </div> : null}
    </div>
  </header>;
}

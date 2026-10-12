import { useWorkspaceSurface } from "../ui-theme/WorkspaceSurface.js";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { Pane, Room } from "@space/contracts";
import { api } from "../../api.js";
import { getSpaceRuntime } from "../../runtime/SpaceRuntime.js";
import { cliRuntimePresentation } from "../../cli-runtime-presentation.js";
import type { PaneCompletionLifecycleState } from "../../pane-completion-lifecycle.js";
import { Bot, Boxes, Check, ChevronDown, CircleAlert, Folder, LayoutDashboard, Maximize2, Minimize2, RefreshCw, Search, X } from "../ui-theme/app-icons.js";
import {
  agentStatuses, agentStatusLabels, compareAgentEntries, dashboardAge, dashboardElapsed, dashboardProject, isDashboardAgent,
  markAgentsSeen, resolveAgentStatus, type AgentActivityDetail, type AgentDashboardSummary, type AgentSeenState, type AgentStatus,
  type DashboardAgentsSnapshot
} from "./dashboard-model.js";
import "./agents-dashboard.css";

export const AGENTS_DASHBOARD_FILTER_KEY = "space.agentsDashboard.filter";
export const AGENTS_DASHBOARD_ROOM_FILTER_KEY = "space.agentsDashboard.roomFilter";
export const AGENTS_DASHBOARD_SEEN_KEY = "space.agentsDashboard.seen.v1";
export const AGENTS_DASHBOARD_COLLAPSED_KEY = "space.agentsDashboard.collapsed.v1";
/** Open and visible: near-live. Closed: the rail summary only needs a slower cadence. */
export const AGENTS_DASHBOARD_OPEN_POLL_MS = 5_000;
export const AGENTS_DASHBOARD_CLOSED_POLL_MS = 10_000;

export function storageKeyForUser(userId?: string): string {
  return userId ? `${AGENTS_DASHBOARD_FILTER_KEY}.${userId}` : AGENTS_DASHBOARD_FILTER_KEY;
}

export function roomStorageKeyForUser(userId?: string): string {
  return userId ? `${AGENTS_DASHBOARD_ROOM_FILTER_KEY}.${userId}` : AGENTS_DASHBOARD_ROOM_FILTER_KEY;
}

function userKey(base: string, userId?: string): string {
  return userId ? `${base}.${userId}` : base;
}

function getStorage(): Storage | null {
  try {
    return getSpaceRuntime().platform.localStorage;
  } catch {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    return null;
  }
}

export function readStoredFilter(userId?: string): AgentStatus | "all" {
  try {
    const storage = getStorage();
    if (!storage) return "all";
    const userRaw = userId ? storage.getItem(storageKeyForUser(userId)) : null;
    const globalRaw = storage.getItem(AGENTS_DASHBOARD_FILTER_KEY);
    const raw = userRaw ?? globalRaw;
    if (raw === "all" || (typeof raw === "string" && agentStatuses.includes(raw as AgentStatus))) {
      return raw as AgentStatus | "all";
    }
    return "all";
  } catch {
    return "all";
  }
}

export function writeStoredFilter(filter: AgentStatus | "all", userId?: string): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (userId) {
      storage.setItem(storageKeyForUser(userId), filter);
    }
    storage.setItem(AGENTS_DASHBOARD_FILTER_KEY, filter);
  } catch {
    // Storage is optional.
  }
}

export function readStoredRoomFilter(userId?: string, currentRoomId?: string | null): string {
  try {
    const storage = getStorage();
    if (!storage) return currentRoomId ? "current" : "all";
    const userRaw = userId ? storage.getItem(roomStorageKeyForUser(userId)) : null;
    const globalRaw = storage.getItem(AGENTS_DASHBOARD_ROOM_FILTER_KEY);
    const raw = userRaw ?? globalRaw;
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
    return currentRoomId ? "current" : "all";
  } catch {
    return currentRoomId ? "current" : "all";
  }
}

export function writeStoredRoomFilter(roomFilter: string, userId?: string): void {
  try {
    const storage = getStorage();
    if (!storage) return;
    if (userId) {
      storage.setItem(roomStorageKeyForUser(userId), roomFilter);
    }
    storage.setItem(AGENTS_DASHBOARD_ROOM_FILTER_KEY, roomFilter);
  } catch {
    // Storage is optional.
  }
}

/** The first visit starts a baseline: work that finished earlier is not announced as new. */
export function readSeenState(userId?: string, now = new Date().toISOString()): AgentSeenState {
  const fresh = { baseline: now, panes: {} };
  try {
    const storage = getStorage();
    const raw = storage?.getItem(userKey(AGENTS_DASHBOARD_SEEN_KEY, userId));
    const parsed = raw ? JSON.parse(raw) as Partial<AgentSeenState> : null;
    if (parsed && typeof parsed.baseline === "string" && parsed.panes && typeof parsed.panes === "object") {
      const panes = Object.fromEntries(Object.entries(parsed.panes).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      return { baseline: parsed.baseline, panes };
    }
    storage?.setItem(userKey(AGENTS_DASHBOARD_SEEN_KEY, userId), JSON.stringify(fresh));
  } catch {
    // Storage is optional; finished work then counts from this visit.
  }
  return fresh;
}

function writeSeenState(state: AgentSeenState, userId?: string): void {
  try { getStorage()?.setItem(userKey(AGENTS_DASHBOARD_SEEN_KEY, userId), JSON.stringify(state)); } catch { /* optional */ }
}

function readCollapsedGroups(userId?: string): Set<string> {
  try {
    const parsed = JSON.parse(getStorage()?.getItem(userKey(AGENTS_DASHBOARD_COLLAPSED_KEY, userId)) ?? "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 100) : []);
  } catch {
    return new Set();
  }
}

function writeCollapsedGroups(groups: ReadonlySet<string>, userId?: string): void {
  try { getStorage()?.setItem(userKey(AGENTS_DASHBOARD_COLLAPSED_KEY, userId), JSON.stringify([...groups])); } catch { /* optional */ }
}

const agentStatusTileLabels: Record<AgentStatus, string> = { waiting: "Waiting", working: "Working", done: "Done", idle: "Idle" };

const clockTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
};

export interface AgentsDashboardProps {
  open?: boolean;
  userId?: string;
  rooms: readonly Room[];
  completions: PaneCompletionLifecycleState["panes"];
  activePanes?: readonly Pane[];
  onOpenPane: (pane: Pane) => Promise<void> | void;
  onClose: () => void;
  onSummaryChange?: (summary: AgentDashboardSummary) => void;
  currentRoomId?: string | null;
  /** The pane the operator is working in; its finished work counts as seen. */
  selectedPaneId?: string | null;
}

type Snapshot = { data: Pane[]; activity: Record<string, AgentStatus>; details: Record<string, AgentActivityDetail> };

export function AgentsDashboard({ open = true, userId, rooms, completions, activePanes, onOpenPane, onClose, onSummaryChange, currentRoomId, selectedPaneId }: AgentsDashboardProps) {
  const embedded = useWorkspaceSurface();
  const inFlight = useRef(false);
  const snapshots = useRef(new Map<string, Snapshot>());
  const missingRooms = useRef(new Set<string>());
  const workingSince = useRef(new Map<string, string>());
  const lastSampleAt = useRef(0);
  const openRef = useRef(open);
  const refreshNow = useRef<(() => void) | null>(null);
  const previousStatuses = useRef<Map<string, AgentStatus> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const idPrefix = useId();
  const [maximized, setMaximized] = useState(false);
  const [activity, setActivity] = useState<Record<string, AgentStatus>>({});
  const [details, setDetails] = useState<Record<string, AgentActivityDetail>>({});
  const [panes, setPanes] = useState<Pane[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sampledAt, setSampledAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [announcement, setAnnouncement] = useState("");
  const [seen, setSeen] = useState<AgentSeenState>(() => readSeenState(userId));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsedGroups(userId));
  const [filter, setFilter] = useState<AgentStatus | "all">(() => readStoredFilter(userId));
  const [roomFilter, setRoomFilter] = useState<string>(() => readStoredRoomFilter(userId, currentRoomId));
  const [groupBy, setGroupBy] = useState<"status" | "project" | "room">("status");
  const [query, setQuery] = useState("");
  const roomIds = JSON.stringify(rooms.filter(room => !room.archivedAt).map(room => room.id).sort());
  openRef.current = open;

  useEffect(() => {
    setSeen(readSeenState(userId));
    setCollapsed(readCollapsedGroups(userId));
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFilter(readStoredFilter(userId));
    setRoomFilter(readStoredRoomFilter(userId, currentRoomId));
    // Cached cards render at once; refresh behind them when they are no longer fresh.
    if (Date.now() - lastSampleAt.current > AGENTS_DASHBOARD_OPEN_POLL_MS) refreshNow.current?.();
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (element && !element.open) element.show();
    // show() focuses the first control; keyboard users start in search, touch users without a keyboard popping up.
    if (typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches) searchInput.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } };
    element?.addEventListener("keydown", escape);
    return () => { element?.removeEventListener("keydown", escape); element?.close(); opener?.focus(); };
  }, [open, userId, currentRoomId]);

  useEffect(() => {
    let disposed = false;
    let visibilityEpoch = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ids = JSON.parse(roomIds) as string[];
    for (const id of snapshots.current.keys()) if (!ids.includes(id)) snapshots.current.delete(id);
    for (const id of missingRooms.current) if (!ids.includes(id)) missingRooms.current.delete(id);
    const visible = () => document.visibilityState !== "hidden";
    const publish = () => {
      const values = [...snapshots.current.values()];
      const nextActivity: Record<string, AgentStatus> = Object.assign({}, ...values.map(value => value.activity));
      const observedAt = new Date().toISOString();
      for (const paneId of [...workingSince.current.keys()]) if (nextActivity[paneId] !== "working") workingSince.current.delete(paneId);
      for (const [paneId, status] of Object.entries(nextActivity)) {
        if (status === "working" && !workingSince.current.has(paneId)) workingSince.current.set(paneId, observedAt);
      }
      setPanes(values.flatMap(value => value.data).filter(isDashboardAgent));
      setActivity(nextActivity);
      setDetails(Object.assign({}, ...values.map(value => value.details)));
      setLoaded(values.length > 0 || ids.length === 0 || ids.every(id => missingRooms.current.has(id)));
    };
    // Read pane metadata only. Opening the dashboard never mounts a room or attaches a session.
    const load = async () => {
      if (disposed || !visible()) return;
      clearTimeout(timer);
      if (inFlight.current) { timer = setTimeout(() => void load(), 250); return; }
      inFlight.current = true;
      if (openRef.current) setRefreshing(true);
      const epoch = visibilityEpoch;
      try {
        let failures = 0;
        publish();
        // One room at a time; publish each success without waiting for other rooms.
        for (const roomId of ids) {
          if (disposed || !visible() || epoch !== visibilityEpoch) break;
          if (missingRooms.current.has(roomId)) continue;
          try {
            const snapshot = await api.dashboardAgents(roomId) as DashboardAgentsSnapshot | undefined;
            if (disposed || !visible() || epoch !== visibilityEpoch) break;
            if (!snapshot || !Array.isArray(snapshot.data)) throw new Error("Agent activity response was incomplete.");
            snapshots.current.set(roomId, { data: snapshot.data, activity: snapshot.activity ?? {}, details: snapshot.details ?? {} });
            publish();
            lastSampleAt.current = Date.now();
            setSampledAt(lastSampleAt.current);
          } catch (error) {
            if (disposed || !visible() || epoch !== visibilityEpoch) break;
            const status = (error as { status?: number })?.status;
            if (status === 404 || status === 403) {
              snapshots.current.delete(roomId);
              // Deleted rooms can remain in an older navigation snapshot.
              if (status === 404) missingRooms.current.add(roomId);
              publish();
            } else failures++;
          }
        }
        if (!disposed && visible() && epoch === visibilityEpoch) {
          setError(failures ? "Some rooms could not be refreshed. Keeping available agents; retrying automatically." : null);
        }
      } finally {
        inFlight.current = false;
        if (!disposed) setRefreshing(false);
        clearTimeout(timer);
        if (!disposed && visible()) timer = setTimeout(() => void load(), openRef.current ? AGENTS_DASHBOARD_OPEN_POLL_MS : AGENTS_DASHBOARD_CLOSED_POLL_MS);
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      visibilityEpoch++;
      if (document.visibilityState !== "hidden") void load();
    };
    refreshNow.current = () => { if (!inFlight.current) void load(); };
    void load();
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; refreshNow.current = null; clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [roomIds]);

  // Relative times tick only while the panel is on screen.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const interval = setInterval(() => { if (document.visibilityState !== "hidden") setNow(Date.now()); }, 5_000);
    return () => clearInterval(interval);
  }, [open]);

  const currentRoom = useMemo(() => {
    if (!currentRoomId) return null;
    return rooms.find(r => r.id === currentRoomId) ?? null;
  }, [rooms, currentRoomId]);

  const effectiveRoomId = useMemo(() => {
    if (roomFilter === "all") return null;
    if (roomFilter === "current") return currentRoomId ?? null;
    if (rooms.some(r => r.id === roomFilter)) return roomFilter;
    return currentRoomId ?? null;
  }, [roomFilter, currentRoomId, rooms]);

  const activeRoomName = useMemo(() => {
    if (!effectiveRoomId) return null;
    return rooms.find(r => r.id === effectiveRoomId)?.name ?? null;
  }, [rooms, effectiveRoomId]);

  const roomScopeLabel = useMemo(() => {
    if (!effectiveRoomId) return "All rooms";
    if (effectiveRoomId === currentRoomId && currentRoom) {
      return `${currentRoom.name} (Current room)`;
    }
    return activeRoomName ?? "Selected room";
  }, [effectiveRoomId, currentRoomId, currentRoom, activeRoomName]);

  const entries = useMemo(() => {
    const names = new Map(rooms.map(room => [room.id, room.name]));
    const paneMap = new Map<string, Pane>();
    for (const p of panes) {
      if (names.has(p.roomId)) paneMap.set(p.id, p);
    }
    if (activePanes) {
      for (const p of activePanes) {
        if (names.has(p.roomId) && isDashboardAgent(p)) paneMap.set(p.id, p);
      }
    }
    return [...paneMap.values()].map(pane => {
      const roomName = names.get(pane.roomId)!;
      const runtime = cliRuntimePresentation(pane.mode === "HARNESS" ? "cli:harness" : pane.terminalRuntimeId ?? (pane.mode === "TERMINAL" ? "cli:codex" : pane.providerId));
      const { status, detail, seenFinish } = resolveAgentStatus(pane, { activity: activity[pane.id], detail: details[pane.id], completion: completions[pane.id], seen });
      const detailSince = detail?.status === status ? detail.since ?? null : null;
      const since = status === "working" ? detailSince ?? workingSince.current.get(pane.id) ?? null : detailSince;
      return {
        pane, roomName, runtime, status, since, seenFinish,
        provider: runtime?.displayName ?? pane.providerId ?? "Space Agent",
        modelId: detail?.modelId ?? pane.modelId ?? null,
        reason: detail?.status === status || seenFinish ? detail?.reason ?? null : null,
        finishedAt: seenFinish ? detail?.since ?? null : null,
        lastActivityAt: detail?.since && detail.since > pane.updatedAt ? detail.since : pane.updatedAt,
        project: dashboardProject(pane, roomName)
      };
    }).sort(compareAgentEntries);
  }, [panes, activePanes, rooms, completions, activity, details, seen]);

  const allCounts = useMemo(() => {
    return Object.fromEntries(agentStatuses.map(status => [status, entries.filter(entry => entry.status === status).length])) as Record<AgentStatus, number>;
  }, [entries]);

  const roomCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of entries) {
      map[entry.pane.roomId] = (map[entry.pane.roomId] ?? 0) + 1;
    }
    return map;
  }, [entries]);

  const currentRoomEntriesCount = currentRoom ? (roomCounts[currentRoom.id] ?? 0) : 0;

  useEffect(() => {
    const summary: AgentDashboardSummary = {
      total: entries.length,
      working: allCounts.working,
      waiting: allCounts.waiting,
      done: allCounts.done,
      idle: allCounts.idle,
      loaded,
    };
    onSummaryChange?.(summary);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("space:agents-dashboard-summary", { detail: summary }));
    }
  }, [entries.length, allCounts.working, allCounts.waiting, allCounts.done, allCounts.idle, loaded, onSummaryChange]);

  const markSeen = useCallback((paneIds: readonly string[]) => {
    if (!paneIds.length) return;
    setSeen(previous => {
      const next = markAgentsSeen(previous, paneIds, new Date().toISOString());
      writeSeenState(next, userId);
      return next;
    });
  }, [userId]);

  // The pane the operator works in is being looked at: its finished work is not news.
  const selectedDone = entries.some(entry => entry.pane.id === selectedPaneId && entry.status === "done" && entry.pane.roomId === currentRoomId);
  useEffect(() => {
    if (selectedPaneId) markSeen([selectedPaneId]);
  }, [selectedPaneId, markSeen]);
  useEffect(() => {
    if (selectedPaneId && selectedDone) markSeen([selectedPaneId]);
  }, [selectedPaneId, selectedDone, markSeen]);

  // Announce only transitions that need the operator, and only while the panel is open.
  useEffect(() => {
    if (!loaded) return;
    const next = new Map(entries.map(entry => [entry.pane.id, entry.status]));
    const previous = previousStatuses.current;
    previousStatuses.current = next;
    if (!previous || !open) return;
    const changed = entries.filter(entry => previous.has(entry.pane.id) && previous.get(entry.pane.id) !== entry.status && (entry.status === "waiting" || entry.status === "done"));
    if (!changed.length) return;
    const first = changed[0]!;
    const message = first.status === "waiting" ? `${first.pane.title} is waiting for you.` : `${first.pane.title} finished.`;
    setAnnouncement(changed.length > 1 ? `${message} ${changed.length - 1} more agent${changed.length > 2 ? "s" : ""} changed status.` : message);
  }, [entries, loaded, open]);

  const scopedEntries = useMemo(() => {
    if (!effectiveRoomId) return entries;
    return entries.filter(entry => entry.pane.roomId === effectiveRoomId);
  }, [entries, effectiveRoomId]);

  const counts = useMemo(() => {
    return Object.fromEntries(agentStatuses.map(status => [status, scopedEntries.filter(entry => entry.status === status).length])) as Record<AgentStatus, number>;
  }, [scopedEntries]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = scopedEntries.filter(entry => (filter === "all" || entry.status === filter) &&
    (!normalizedQuery || [entry.pane.title, entry.pane.paneName ?? "", entry.roomName, entry.project.path, entry.provider, entry.modelId ?? "", entry.reason ?? "", agentStatusLabels[entry.status], entry.pane.taskMetadata?.description ?? ""]
      .join(" ").toLocaleLowerCase().includes(normalizedQuery)));

  const groups = groupBy === "status"
    ? agentStatuses.map(status => ({ key: status, label: agentStatusLabels[status], status, path: undefined, entries: visible.filter(entry => entry.status === status) }))
    : groupBy === "project"
      ? [...new Map(visible.map(entry => [entry.project.key, entry.project])).values()].sort((a, b) => a.path.localeCompare(b.path)).map(project => ({ key: project.key, label: project.label, path: project.path, status: undefined, entries: visible.filter(entry => entry.project.key === project.key) }))
      : [...new Map(visible.map(entry => [entry.pane.roomId, { id: entry.pane.roomId, name: entry.roomName }])).values()]
        .sort((a, b) => Number(b.id === currentRoomId) - Number(a.id === currentRoomId) || a.name.localeCompare(b.name))
        .map(r => ({ key: r.id, label: r.name, path: undefined, status: undefined, current: r.id === currentRoomId, entries: visible.filter(entry => entry.pane.roomId === r.id) }));
  const showRoomOnCards = !effectiveRoomId && groupBy !== "room";
  const doneEntries = scopedEntries.filter(entry => entry.status === "done");

  const handleFilterChange = (nextFilter: AgentStatus | "all") => {
    setFilter(nextFilter);
    writeStoredFilter(nextFilter, userId);
  };

  const handleRoomFilterChange = (nextRoomFilter: string) => {
    setRoomFilter(nextRoomFilter);
    writeStoredRoomFilter(nextRoomFilter, userId);
  };

  const toggleGroup = (key: string) => {
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      writeCollapsedGroups(next, userId);
      return next;
    });
  };

  async function openPane(pane: Pane) {
    setOpening(pane.id);
    markSeen([pane.id]);
    try { await onOpenPane(pane); onClose(); }
    catch { setError("This agent could not be opened. Refresh the dashboard and try again."); }
    finally { setOpening(null); }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      searchInput.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const onCard = target.classList.contains("agents-dashboard-card");
    if (!onCard && target !== searchInput.current) return;
    const cards = [...(body.current?.querySelectorAll<HTMLButtonElement>(".agents-dashboard-card:not(:disabled)") ?? [])];
    if (!cards.length) return;
    event.preventDefault();
    const index = onCard ? cards.indexOf(target as HTMLButtonElement) : -1;
    const next = event.key === "ArrowDown" ? cards[Math.min(cards.length - 1, index + 1)] : index <= 0 ? null : cards[index - 1];
    if (next) next.focus(); else searchInput.current?.focus();
  };

  if (!open) return null;

  const statusTime = (entry: typeof entries[number]) => entry.since ? dashboardElapsed(entry.since, now) : "";
  const badgeLabel = (entry: typeof entries[number]) => {
    if (opening === entry.pane.id) return "Opening…";
    if (entry.pane.status === "ERROR") return "Needs attention";
    const elapsed = statusTime(entry);
    if (entry.status === "working") return elapsed ? `Working ${elapsed}` : "Working";
    if (entry.status === "waiting") return elapsed ? `Waiting ${elapsed}` : "Waiting";
    return agentStatusLabels[entry.status];
  };
  const footerTime = (entry: typeof entries[number]) => {
    if (entry.status === "working" && entry.since) return { iso: entry.since, label: `Started ${clockTime(entry.since)}`, title: "Turn started" };
    if (entry.status === "done" && entry.since) return { iso: entry.since, label: `Finished ${dashboardAge(entry.since, now)}`, title: "Finished" };
    if (entry.finishedAt) return { iso: entry.finishedAt, label: `Finished ${dashboardAge(entry.finishedAt, now)}`, title: "Finished" };
    return { iso: entry.lastActivityAt, label: dashboardAge(entry.lastActivityAt, now), title: "Last activity" };
  };
  const updatedLabel = error ? "Update delayed" : sampledAt ? (refreshing ? "Updating…" : `Updated ${dashboardAge(new Date(sampledAt).toISOString(), now)}`) : "Connecting…";

  return <dialog ref={dialog} data-embedded={embedded || undefined} className={`agents-dashboard${maximized ? " is-maximized" : ""}`} aria-labelledby="agents-dashboard-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="agents-dashboard-content" onKeyDown={handleKeyDown}>
      <header className="agents-dashboard-header">
        <span className="agents-dashboard-brand"><LayoutDashboard aria-hidden="true" /></span>
        <div className="agents-dashboard-heading">
          <h2 id="agents-dashboard-title">Agents Dashboard</h2>
          <p>{activeRoomName ? `Activity in ${activeRoomName}` : "Activity across your rooms"}</p>
        </div>
        <div className="agents-dashboard-actions">
          <button type="button" className="agents-dashboard-icon agents-dashboard-refresh" aria-label="Refresh agents" title="Refresh now" data-busy={refreshing || undefined} onClick={() => refreshNow.current?.()}><RefreshCw aria-hidden="true" /></button>
          <button type="button" className="agents-dashboard-icon agents-dashboard-expand-toggle" aria-label={maximized ? "Collapse agents dashboard" : "Expand agents dashboard"} aria-pressed={maximized} onClick={() => setMaximized(value => !value)}>{maximized ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}</button>
          <button type="button" className="agents-dashboard-icon agents-dashboard-close-btn" aria-label="Close agents dashboard" onClick={onClose}><X aria-hidden="true" /></button>
        </div>
      </header>
      <div className="agents-dashboard-overview">
        <div className="agents-dashboard-filters" role="group" aria-label="Filter agents by status">
          <button type="button" data-filter="all" aria-pressed={filter === "all"} onClick={() => handleFilterChange("all")}><span className="agents-dashboard-filter-label">All</span> <span className="agents-dashboard-filter-count">{loaded ? scopedEntries.length : "-"}</span></button>
          {agentStatuses.map(status => <button key={status} type="button" data-status={status} data-active={counts[status] > 0 || undefined} aria-pressed={filter === status} aria-label={`${agentStatusLabels[status]} ${counts[status]}`} title={agentStatusLabels[status]} onClick={() => handleFilterChange(status)}>
            <span className="agents-dashboard-filter-label"><i />{agentStatusTileLabels[status]}</span> <span className="agents-dashboard-filter-count">{counts[status]}</span>
          </button>)}
        </div>
        <div className="agents-dashboard-distribution" role="img" aria-label={agentStatuses.map(status => `${counts[status]} ${agentStatusLabels[status]}`).join(", ")}>
          {agentStatuses.map(status => counts[status] > 0 && <span key={status} data-status={status} style={{ flex: counts[status] }} title={`${counts[status]} ${agentStatusLabels[status]}`} />)}
        </div>
      </div>
      <div className="agents-dashboard-controls">
        <div className="agents-dashboard-scope-row">
          <div className="agents-dashboard-room-filters" role="group" aria-label="Filter agents by room">
            <button
              type="button"
              className="agents-dashboard-room-btn"
              aria-pressed={!effectiveRoomId}
              onClick={() => handleRoomFilterChange("all")}
            >
              All rooms <span>{entries.length}</span>
            </button>
            {currentRoom && (
              <button
                type="button"
                className="agents-dashboard-room-btn"
                aria-pressed={effectiveRoomId === currentRoom.id}
                onClick={() => handleRoomFilterChange("current")}
                title={`Current room: ${currentRoom.name}`}
              >
                Current room <span>{currentRoomEntriesCount}</span>
              </button>
            )}
            {rooms.length > 1 && (
              <div className="agents-dashboard-room-select-wrapper">
                {/* All rooms and Current room are the buttons beside it; the list only picks one specific room. */}
                <select
                  className="agents-dashboard-room-select"
                  aria-label="Filter by specific room"
                  data-custom={Boolean(effectiveRoomId && effectiveRoomId !== currentRoomId)}
                  value={roomFilter === "all" || roomFilter === "current" ? "" : roomFilter}
                  onChange={event => { if (event.target.value) handleRoomFilterChange(event.target.value); }}
                >
                  <option value="" disabled>Choose a room…</option>
                  {rooms.map(room => (
                    <option key={room.id} value={room.id}>
                      {room.name}{room.id === currentRoom?.id ? " (current)" : ""} ({roomCounts[room.id] ?? 0})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="agents-dashboard-segmented" role="group" aria-label="Group agents by">
            <button type="button" data-group="status" aria-pressed={groupBy === "status"} onClick={() => setGroupBy("status")}>Status</button>
            <button type="button" data-group="project" aria-pressed={groupBy === "project"} onClick={() => setGroupBy("project")}>Project</button>
            <button type="button" data-group="room" aria-pressed={groupBy === "room"} onClick={() => setGroupBy("room")}>Room</button>
          </div>
        </div>
        <label className="agents-dashboard-search"><Search aria-hidden="true" /><input ref={searchInput} type="search" aria-label="Search agents" placeholder="Search agents, models, projects or rooms…" value={query} onChange={event => setQuery(event.target.value)} /><kbd aria-hidden="true">/</kbd></label>
      </div>
      <div className="agents-dashboard-body" ref={body} aria-busy={!loaded && !error}>
        {error && <div className="agents-dashboard-error" role="alert"><CircleAlert aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => refreshNow.current?.()}>Retry</button></div>}
        {!loaded && !error ? <div className="agents-dashboard-skeleton" role="status" aria-label="Loading agents…">{[0, 1, 2].map(index => <span key={index} />)}</div> : null}
        {loaded && doneEntries.length > 0 && filter !== "idle" && filter !== "working" && filter !== "waiting" ? <div className="agents-dashboard-notice" data-status="done">
          <i aria-hidden="true" /><span>{doneEntries.length === 1 ? "1 agent finished since you last looked." : `${doneEntries.length} agents finished since you last looked.`}</span>
          <button type="button" onClick={() => markSeen(doneEntries.map(entry => entry.pane.id))}><Check aria-hidden="true" />Mark all as seen</button>
        </div> : null}
        {loaded && visible.length === 0 ? <div className="agents-dashboard-empty"><Bot aria-hidden="true" /><h3>{scopedEntries.length ? "No matching agents" : "Your agents will appear here"}</h3><p>{scopedEntries.length ? "Try another filter or search." : effectiveRoomId ? "No agents in this room yet. Switch to All rooms, or open an AI CLI or Chat pane here." : "Open an AI CLI, Chat or Harness pane in a room to get started."}</p>
          {scopedEntries.length > 0 && (filter !== "all" || query) ? <button type="button" onClick={() => { handleFilterChange("all"); setQuery(""); }}>Clear filters</button> : null}</div> : null}
        {groups.filter(group => group.entries.length > 0).map(group => {
          const collapseKey = `${groupBy}:${group.key}`;
          const isCollapsed = collapsed.has(collapseKey);
          const gridId = `${idPrefix}-${collapseKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
          return <section className="agents-dashboard-group" key={group.key} aria-label={group.label} data-collapsed={isCollapsed || undefined}>
            <h3 data-status={group.status}>
              <button type="button" className="agents-dashboard-group-toggle" aria-expanded={!isCollapsed} aria-controls={gridId} aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.label} group`} onClick={() => toggleGroup(collapseKey)}>
                <ChevronDown className="agents-dashboard-chevron" aria-hidden="true" />
                {group.status ? <i /> : groupBy === "room" ? <Boxes aria-hidden="true" /> : <Folder aria-hidden="true" />}
                <span title={group.path}>{group.label}</span><small>{group.entries.length}</small>
                {"current" in group && group.current ? <em className="agents-dashboard-tag">Current</em> : null}
              </button>
            </h3>
            {isCollapsed ? null : <div className="agents-dashboard-grid" id={gridId}>{group.entries.map(entry => {
              const { pane, roomName, runtime, provider, status, project, modelId, reason } = entry;
              const time = footerTime(entry);
              const isSelected = pane.id === selectedPaneId && pane.roomId === currentRoomId;
              return <button key={pane.id} type="button" className="agents-dashboard-card" data-status={status} data-selected={isSelected || undefined} disabled={opening !== null} onClick={() => void openPane(pane)} aria-label={`Open ${pane.title} in ${roomName}`}>
                <span className="agents-dashboard-avatar">{runtime ? <img src={runtime.iconSrc} alt="" /> : <Bot aria-hidden="true" />}<i /></span>
                <span className="agents-dashboard-card-content">
                  <span className="agents-dashboard-card-head">
                    <strong title={pane.title}>{pane.title}</strong>
                    <span className="agents-dashboard-badge" title={entry.since ? `${agentStatusLabels[status]} since ${clockTime(entry.since)}` : agentStatusLabels[status]}><i />{badgeLabel(entry)}</span>
                  </span>
                  <small className="agents-dashboard-meta" title={modelId ? `${provider} · ${modelId}` : provider}>{provider}{modelId ? <> · <span className="agents-dashboard-model">{modelId}</span></> : null}</small>
                  {reason && status === "waiting" ? <span className="agents-dashboard-reason"><CircleAlert aria-hidden="true" />{reason}</span> : null}
                  {pane.taskMetadata?.description && <span className="agents-dashboard-preview">{pane.taskMetadata.description}</span>}
                  <span className="agents-dashboard-card-footer">
                    <span className="agents-dashboard-tags">
                      <span title={project.path}><Folder aria-hidden="true" />{project.label}</span>
                      {showRoomOnCards ? <span title={roomName}><Boxes aria-hidden="true" />{roomName}</span> : null}
                      {reason && status === "idle" ? <span className="agents-dashboard-tag">{reason}</span> : null}
                      {pane.isMinimized ? <span className="agents-dashboard-tag">Minimized</span> : null}
                      {isSelected ? <span className="agents-dashboard-tag is-selected">Selected</span> : null}
                    </span>
                    <time dateTime={time.iso} title={time.title}>{time.label}</time>
                  </span>
                </span>
              </button>;
            })}</div>}
          </section>;
        })}
      </div>
      <footer className="agents-dashboard-footer"><span>{visible.length} of {scopedEntries.length} agents · {roomScopeLabel}</span><span>{updatedLabel}</span></footer>
      <p className="agents-dashboard-sr-only" role="status" aria-live="polite">{announcement}</p>
    </div>
  </dialog>;
}

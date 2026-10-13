import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Pane } from "@space/contracts";
import { api } from "../../api.js";
import { dispatchBrowserPaneActionEvent } from "../browser-pane/events.js";
import { ActivityTab } from "./ActivityTab.js";
import { JOB_COPILOT_PREFERRED_RUNTIME_ID, jobCopilotRuntimeOptions, readLastClaudeAccountProfileId } from "./agent-runtimes.js";
import { CommandBar } from "./CommandBar.js";
import { CopilotRail, RAIL_TAB_ICONS, type CopilotRailTab, type CopilotRailTabDefinition } from "./CopilotRail.js";
import { FieldsTab } from "./FieldsTab.js";
import { HandoffOverlay } from "./HandoffOverlay.js";
import { browserVisible, layoutForWidth, resolveActiveTab, tabsForLayout, type JobCopilotLayout } from "./layout.js";
import { MemoryTab } from "./MemoryTab.js";
import { QueueTab } from "./QueueTab.js";
import { SetupWizard } from "./SetupWizard.js";
import { runProgress, todayCounts, useJobApplyData } from "./useJobApply.js";
import "./job-copilot-pane.css";

export interface JobCopilotPaneProps {
  pane: Pane;
  isVisible: boolean;
  /** The pane's CLI agent terminal, rendered by PaneCard with its usual props. */
  terminal: ReactNode;
  /** The pane's managed browser, rendered by PaneCard with its usual props. */
  browser: ReactNode;
}

const ALERTS_STORAGE_KEY = "space:job-apply:alerts";
const RAIL_MIN_WIDTH = 300;
const RAIL_MAX_WIDTH = 720;
const RAIL_DEFAULT_WIDTH = 520;

interface RailPreference { width: number; collapsed: boolean; tab: CopilotRailTab }

function railStorageKey(paneId: string): string {
  return `space:job-copilot:rail:${paneId}`;
}

function readRailPreference(paneId: string): RailPreference {
  try {
    const raw = window.localStorage.getItem(railStorageKey(paneId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RailPreference>;
      return {
        width: typeof parsed.width === "number" ? Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, parsed.width)) : RAIL_DEFAULT_WIDTH,
        collapsed: parsed.collapsed === true,
        tab: parsed.tab && parsed.tab in RAIL_TAB_ICONS ? parsed.tab : "activity"
      };
    }
  } catch {
    // Preference storage is optional.
  }
  return { width: RAIL_DEFAULT_WIDTH, collapsed: false, tab: "activity" };
}

function writeRailPreference(paneId: string, preference: RailPreference): void {
  try {
    window.localStorage.setItem(railStorageKey(paneId), JSON.stringify(preference));
  } catch {
    // Preference storage is optional.
  }
}

function readAlertsPreference(): boolean {
  try {
    return window.localStorage.getItem(ALERTS_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** A short two-tone chime; no asset to load and no autoplay before the operator enabled alerts. */
function chime() {
  try {
    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.value = 0.08;
    gain.connect(context.destination);
    for (const [frequency, at] of [[880, 0], [1320, 0.18]] as const) {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + at);
      oscillator.stop(context.currentTime + at + 0.16);
    }
    window.setTimeout(() => void context.close(), 600);
  } catch {
    // Audio is optional.
  }
}

const TAB_LABELS: Record<CopilotRailTab, string> = { browser: "Browser", activity: "Activity", queue: "Queue", fields: "Fields", memory: "Memory", setup: "Setup", terminal: "Terminal" };

/** The pane's own width decides the layout (a narrow desktop pane stacks like a phone); SSR and jsdom start from the window. */
function useLayout(ref: React.RefObject<HTMLDivElement | null>): JobCopilotLayout {
  const [layout, setLayout] = useState<JobCopilotLayout>(() => layoutForWidth(typeof window === "undefined" ? 0 : window.innerWidth));
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const apply = (width: number) => setLayout((current) => { const next = layoutForWidth(width); return next === current ? current : next; });
    apply(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => { for (const entry of entries) apply(entry.contentRect.width); });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return layout;
}

/**
 * Job Copilot: full-bleed live browser, a command bar (agent, run state, counters) and a
 * collapsible, resizable rail with Queue, Setup and the agent terminal. The terminal element
 * stays mounted whichever tab is active; PaneCard renders it with its usual props. Narrow panes
 * (phones) stack: one surface at a time, the browser as a tab, the tab strip at the bottom.
 */
export function JobCopilotPane({ pane, isVisible, terminal, browser }: JobCopilotPaneProps) {
  const data = useJobApplyData(pane, isVisible);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const layout = useLayout(paneRef);
  const [rail, setRail] = useState<RailPreference>(() => readRailPreference(pane.id));
  const [alerts, setAlerts] = useState(readAlertsPreference);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [terminalKey, setTerminalKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const lastHandoffRef = useRef<string | null>(null);
  const mountedAtRef = useRef(Date.now());
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const counts = useMemo(() => todayCounts(data.applications), [data.applications]);
  const runtimeOptions = useMemo(() => jobCopilotRuntimeOptions(data.runtimes), [data.runtimes]);
  const handoff = data.handoff && (data.handoff.status === "REQUESTED" || data.handoff.status === "ACCEPTED") ? data.handoff : null;
  const paused = data.settings?.settings.paused ?? false;
  const handoffPosting = useMemo(() => data.run?.current ?? data.applications.find((application) => application.status === "NEEDS_USER" || application.status === "FILLING") ?? null, [data.applications, data.run]);
  const runState = data.run?.status ?? "IDLE";
  const progress = useMemo(() => runProgress(data.run), [data.run]);
  const pending = data.run?.pending ?? [];
  const selectedApplication = useMemo(() => data.applications.find((application) => application.id === selectedApplicationId) ?? null, [data.applications, selectedApplicationId]);
  const lastPendingRef = useRef<string | null>(null);

  // A new question or review gets the same alert treatment as a browser handoff.
  useEffect(() => {
    const newest = pending[0];
    if (!newest || lastPendingRef.current === newest.id) return;
    const first = lastPendingRef.current === null;
    lastPendingRef.current = newest.id;
    if (first && Date.now() - mountedAtRef.current < 10_000) return;
    setRail((current) => current.collapsed || current.tab === "activity" ? { ...current, collapsed: false, tab: "activity" } : current);
    if (!alerts) return;
    chime();
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification("Job Copilot needs you", { body: newest.message, tag: newest.id });
    } catch {
      // Notifications are optional.
    }
  }, [alerts, pending]);

  useEffect(() => { writeRailPreference(pane.id, rail); }, [pane.id, rail]);

  useEffect(() => {
    if (!handoff || handoff.status !== "REQUESTED" || lastHandoffRef.current === handoff.handoffRequestId) return;
    lastHandoffRef.current = handoff.handoffRequestId;
    if (layout === "stacked") setRail((current) => current.tab === "browser" ? current : { ...current, tab: "browser" });
    if (!alerts) return;
    chime();
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Job Copilot needs you", { body: handoff.reason, tag: handoff.handoffRequestId });
      }
    } catch {
      // Notifications are optional.
    }
  }, [alerts, handoff, layout]);

  const toggleAlerts = useCallback((checked: boolean) => {
    setAlerts(checked);
    try {
      window.localStorage.setItem(ALERTS_STORAGE_KEY, checked ? "on" : "off");
    } catch {
      // Preference storage is optional.
    }
    if (checked && "Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  }, []);

  const togglePaused = useCallback(async (checked: boolean) => {
    if (!data.settings) return;
    const next = { ...data.settings, settings: { ...data.settings.settings, paused: checked } };
    data.setSettings(next);
    try {
      const response = await api.updateJobApplySettings(pane.id, next);
      data.setSettings(response.metadata);
    } catch {
      void data.refresh();
    }
  }, [data, pane.id]);

  /** PATCH the pane's runtime, restart its CLI on that runtime, then remount the terminal element so it attaches to the new session. */
  const switchRuntime = useCallback(async (runtimeId: string) => {
    if (switching || runtimeId === pane.terminalRuntimeId) return;
    setSwitching(true);
    setNotice(null);
    try {
      await api.updatePane(pane.id, { terminalRuntimeId: runtimeId });
      await api.createCliSession(pane.id, {
        runtimeId,
        forceRestart: true,
        includeTranscript: false,
        ...(runtimeId === JOB_COPILOT_PREFERRED_RUNTIME_ID ? { accountProfileId: readLastClaudeAccountProfileId() } : {})
      });
      setTerminalKey((key) => key + 1);
      setRail((current) => ({ ...current, collapsed: false, tab: "terminal" }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The copilot agent could not be switched.");
    } finally {
      setSwitching(false);
    }
  }, [pane.id, pane.terminalRuntimeId, switching]);

  const runAction = useCallback(async (action: "start" | "pause" | "stop") => {
    if (runBusy) return;
    setRunBusy(true);
    setNotice(null);
    try {
      const view = action === "start" ? await api.startJobApplyRun(pane.id) : action === "pause" ? await api.pauseJobApplyRun(pane.id) : await api.stopJobApplyRun(pane.id);
      data.setRun(view);
      if (action === "start") setRail((current) => ({ ...current, collapsed: false, tab: layout === "stacked" ? "browser" : current.tab === "setup" ? "activity" : current.tab }));
      void data.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The run could not be changed.");
    } finally {
      setRunBusy(false);
    }
  }, [data, layout, pane.id, runBusy]);

  const takeControl = useCallback(() => {
    dispatchBrowserPaneActionEvent({ paneId: pane.id, action: "handoff", roomId: pane.roomId });
  }, [pane.id, pane.roomId]);
  const returnToAgent = useCallback(() => {
    dispatchBrowserPaneActionEvent({ paneId: pane.id, action: "release", roomId: pane.roomId });
    void data.refresh();
  }, [data, pane.id, pane.roomId]);

  const selectTab = useCallback((tab: CopilotRailTab) => setRail((current) => ({ ...current, tab, collapsed: false })), []);
  const toggleRail = useCallback(() => setRail((current) => ({ ...current, collapsed: !current.collapsed })), []);

  const onResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (rail.collapsed) return;
    resizeRef.current = { startX: event.clientX, startWidth: rail.width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [rail.collapsed, rail.width]);
  const onResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeRef.current;
    if (!start) return;
    const width = Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, start.startWidth + (start.startX - event.clientX)));
    setRail((current) => current.width === width ? current : { ...current, width });
  }, []);
  const onResizeEnd = useCallback(() => { resizeRef.current = null; }, []);

  const badges: Partial<Record<CopilotRailTab, number | null>> = { browser: handoff ? 1 : null, activity: pending.length || null, queue: counts.queued || null };
  const tabs: CopilotRailTabDefinition[] = tabsForLayout(layout).map((id) => ({ id, label: TAB_LABELS[id], icon: RAIL_TAB_ICONS[id], badge: badges[id] ?? null, available: true }));
  const activeTab = resolveActiveTab(rail.tab, layout);
  // The stacked layout has no collapsed rail: the strip is the pane's navigation.
  const railOpen = layout === "stacked" || !rail.collapsed;
  const browserShown = browserVisible(layout, activeTab, rail.collapsed);

  return (
    <div ref={paneRef} className="jc-pane" data-pane-id={pane.id} data-layout={layout} data-rail={railOpen ? "open" : "collapsed"} data-browser={browserShown ? "visible" : "hidden"}
      data-handoff={handoff ? handoff.status.toLowerCase() : undefined} style={{ "--jc-rail-width": `${rail.width}px` } as React.CSSProperties}>
      <CommandBar pane={pane} runtimeOptions={runtimeOptions} counts={counts} runState={runState} progress={progress} paused={paused} alerts={alerts} layout={layout}
        railOpen={railOpen} switching={switching} needsYou={pending.length} runBusy={runBusy} onRun={(action) => void runAction(action)}
        onSwitchRuntime={(runtimeId) => void switchRuntime(runtimeId)}
        onTogglePaused={(checked) => void togglePaused(checked)} onToggleAlerts={toggleAlerts} onToggleRail={toggleRail} />
      {notice || data.error ? <div className="jc-notice" role="status">{notice ?? data.error}</div> : null}
      <div className="jc-body">
        <section className="jc-browser" aria-label="Live browser" data-active={browserShown ? "true" : "false"} aria-hidden={browserShown ? undefined : "true"}>
          {browser}
          {handoff ? <HandoffOverlay handoff={handoff} posting={handoffPosting} onTakeControl={takeControl} onReturnToAgent={returnToAgent} /> : null}
        </section>
        <div className="jc-rail-handle" role="separator" aria-orientation="vertical" aria-label="Resize the copilot rail" aria-hidden={rail.collapsed ? "true" : undefined}
          onPointerDown={onResizeStart} onPointerMove={onResizeMove} onPointerUp={onResizeEnd} onPointerCancel={onResizeEnd} onDoubleClick={() => setRail((current) => ({ ...current, width: RAIL_DEFAULT_WIDTH }))} />
        <CopilotRail tabs={tabs} active={activeTab} collapsed={rail.collapsed} layout={layout} onSelect={selectTab}>
          {railOpen && activeTab === "activity" ? (
            <ActivityTab events={data.events} pending={pending} applications={data.applications} selectedId={selectedApplicationId} onSelect={setSelectedApplicationId} onChanged={() => void data.refresh()} />
          ) : null}
          {railOpen && activeTab === "fields" ? <FieldsTab paneId={pane.id} application={selectedApplication ?? data.run?.current ?? null} /> : null}
          {railOpen && activeTab === "memory" ? <MemoryTab paneId={pane.id} /> : null}
          {railOpen && activeTab === "queue" ? (
            <QueueTab applications={data.applications} paneId={pane.id} selectedId={selectedApplicationId} onSelect={setSelectedApplicationId}
              onCreated={(application) => data.setApplications((current) => [application, ...current.filter((entry) => entry.id !== application.id)])} onRefresh={() => void data.refresh()} />
          ) : null}
          {railOpen && activeTab === "setup" && data.profile && data.settings ? (
            <SetupWizard pane={pane} profile={data.profile} settings={data.settings} runtimeOptions={runtimeOptions} alerts={alerts}
              onProfileChange={data.setProfile} onSettingsChange={data.setSettings} onSwitchRuntime={(runtimeId) => void switchRuntime(runtimeId)} onToggleAlerts={toggleAlerts} />
          ) : null}
          {railOpen && activeTab === "setup" && (!data.profile || !data.settings) ? <p className="jc-muted jc-panel-loading" role="status">Loading setup…</p> : null}
          <div key={terminalKey} className="jc-panel-terminal" role="tabpanel" id="jc-panel-terminal" aria-labelledby="jc-tab-terminal" data-active={railOpen && activeTab === "terminal" ? "true" : "false"}>
            {terminal}
          </div>
        </CopilotRail>
      </div>
    </div>
  );
}

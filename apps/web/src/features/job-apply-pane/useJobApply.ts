import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentRuntimeRegistry, BrowserHandoffRequest, JobApplication, JobApplyEvent, JobApplyPaneMetadata, JobApplyProfile, JobApplyRunView, Pane, PaneBrowserSession } from "@space/contracts";
import { api } from "../../api.js";
import { usePanePolling } from "../../use-pane-polling.js";
import { subscribeJobApplyLiveEvents } from "./live-events.js";

export interface JobApplyData {
  profile: JobApplyProfile | null;
  applications: JobApplication[];
  settings: JobApplyPaneMetadata | null;
  handoff: BrowserHandoffRequest | null;
  browser: PaneBrowserSession | null;
  runtimes: AgentRuntimeRegistry | null;
  run: JobApplyRunView | null;
  events: JobApplyEvent[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  setProfile(profile: JobApplyProfile): void;
  setSettings(settings: JobApplyPaneMetadata): void;
  setApplications(update: (current: JobApplication[]) => JobApplication[]): void;
  setRun(run: JobApplyRunView): void;
}

export interface JobApplyTodayCounts { applied: number; verified: number; failed: number; needsUser: number; queued: number }

function startOfTodayIso(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

export function todayCounts(applications: JobApplication[]): JobApplyTodayCounts {
  const since = startOfTodayIso();
  const counts = { applied: 0, verified: 0, failed: 0, needsUser: 0, queued: 0 };
  for (const application of applications) {
    const stamp = application.appliedAt ?? application.updatedAt;
    if (application.status === "NEEDS_USER") counts.needsUser += 1;
    if (application.status === "QUEUED") counts.queued += 1;
    if (stamp < since) continue;
    if (application.status === "SUBMITTED" || application.status === "VERIFIED") counts.applied += 1;
    if (application.status === "VERIFIED") counts.verified += 1;
    if (application.status === "FAILED") counts.failed += 1;
  }
  return counts;
}

/** Closed jobs of the run over everything it will touch; null while idle. */
export function runProgress(view: JobApplyRunView | null): { done: number; total: number } | null {
  if (!view?.run || (view.status !== "RUNNING" && view.status !== "PAUSED")) return null;
  const counters = view.run.counters;
  const done = counters.submitted + counters.failed + counters.needsUser;
  return { done, total: done + view.queue.length + (view.current ? 1 : 0) };
}

/** The browser pane starts its own session on mount; the copilot restarts it only once it has stopped. */
const BROWSER_RESTART_DELAY_MS = 6_000;
const LIVE_REFRESH_DEBOUNCE_MS = 400;

/** Profile, tracker, pane settings, browser session, handoff, CLI runtimes, run state and activity, refreshed while the pane is visible and on live events. */
export function useJobApplyData(pane: Pane, enabled: boolean): JobApplyData {
  const [profile, setProfile] = useState<JobApplyProfile | null>(null);
  const [applications, setApplicationsState] = useState<JobApplication[]>([]);
  const [settings, setSettings] = useState<JobApplyPaneMetadata | null>(null);
  const [handoff, setHandoff] = useState<BrowserHandoffRequest | null>(null);
  const [browser, setBrowser] = useState<PaneBrowserSession | null>(null);
  const [runtimes, setRuntimes] = useState<AgentRuntimeRegistry | null>(() => api.cliRuntimesSnapshot());
  const [run, setRun] = useState<JobApplyRunView | null>(null);
  const [events, setEvents] = useState<JobApplyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedAt = useRef(Date.now());
  const browserStartRef = useRef<Promise<unknown> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const ensureBrowser = useCallback(async (session: PaneBrowserSession | null) => {
    const stopped = !session || session.status === "CLOSED" || session.status === "ERROR";
    if (!stopped || browserStartRef.current || Date.now() - mountedAt.current < BROWSER_RESTART_DELAY_MS) return;
    browserStartRef.current = api.startBrowserSession(pane.id, { targetUrl: "about:blank" })
      .then((response) => setBrowser(response.session))
      .catch(() => undefined)
      .finally(() => { browserStartRef.current = null; });
    await browserStartRef.current;
  }, [pane.id]);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    inFlight.current = (async () => {
      try {
        const [profileResponse, applicationsResponse, settingsResponse, handoffResponse, browserResponse, runResponse, eventsResponse] = await Promise.all([
          api.jobApplyProfile(),
          api.jobApplications(),
          api.jobApplySettings(pane.id),
          api.browserHandoff(pane.id).catch(() => null),
          api.browserSession(pane.id).catch(() => null),
          api.jobApplyRun(pane.id).catch(() => null),
          api.jobApplyEvents({ paneId: pane.id, limit: 150 }).catch(() => null)
        ]);
        setProfile(profileResponse.profile);
        setApplicationsState(applicationsResponse.applications);
        setSettings(settingsResponse.metadata);
        setHandoff(handoffResponse?.handoff ?? null);
        setBrowser(browserResponse?.session ?? null);
        if (runResponse) setRun(runResponse);
        if (eventsResponse) setEvents(eventsResponse.events);
        setError(null);
        void ensureBrowser(browserResponse?.session ?? null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Job Copilot data could not be loaded.");
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, [ensureBrowser, pane.id]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.cliRuntimes({ allowStale: true }).then((registry) => { if (!cancelled) setRuntimes(registry); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [enabled]);

  // Live activity: one debounced refresh per burst of events for this pane.
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const unsubscribe = subscribeJobApplyLiveEvents(pane.id, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), LIVE_REFRESH_DEBOUNCE_MS);
    });
    return () => { unsubscribe(); window.clearTimeout(timer); };
  }, [enabled, pane.id, refresh]);

  usePanePolling(() => refresh(), 8_000, enabled, true, pane.id);

  const setApplications = useCallback((update: (current: JobApplication[]) => JobApplication[]) => setApplicationsState(update), []);

  return useMemo(() => ({ profile, applications, settings, handoff, browser, runtimes, run, events, loading, error, refresh, setProfile, setSettings, setApplications, setRun }),
    [profile, applications, settings, handoff, browser, runtimes, run, events, loading, error, refresh, setApplications]);
}

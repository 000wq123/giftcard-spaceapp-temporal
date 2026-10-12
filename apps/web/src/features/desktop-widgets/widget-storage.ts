import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ClockWidgetConfig,
  CountdownTimerWidgetConfig,
  DesktopWidgetId,
  DesktopWidgetState,
  PushupReminderWidgetConfig,
  SpaceAppPromoWidgetConfig,
  AiQuotaWidgetConfig
} from "./types.js";
import { saveUserSettingDebounced } from "../user-settings/user-settings-manager.js";

const WIDGETS_STATE_KEY = "space.desktop-widgets.state.v1";
const WIDGET_CONFIG_PREFIX = "space.desktop-widgets.config.";
const WIDGETS_CHANGED_EVENT = "space:desktop-widgets:changed";
export const WIDGET_CONFIG_CHANGED_EVENT = "space:desktop-widgets:config-changed";

const DEFAULT_CLOCK_CONFIG: ClockWidgetConfig = {
  is24Hour: true,
  showSeconds: true
};

const DEFAULT_TIMER_CONFIG: CountdownTimerWidgetConfig = {
  durationSeconds: 25 * 60, // 25m Pomodoro default
  remainingSeconds: 25 * 60,
  isRunning: false,
  isCompleted: false
};

const DEFAULT_PUSHUP_CONFIG: PushupReminderWidgetConfig = {
  reminderType: "pushups",
  intervalMinutes: 30, // 30m default per user request
  targetReps: 20,
  totalRepsToday: 0,
  setsCompletedToday: 0,
  remainingSeconds: 30 * 60,
  isRunning: true,
  isAlertActive: false,
  alertReason: "pushups",
  soundEnabled: true,
  lastActiveDate: new Date().toISOString().slice(0, 10)
};

const DEFAULT_PROMO_CONFIG: SpaceAppPromoWidgetConfig = {
  headline: "SpaceApp.dev it's FREE!!!",
  subheadline: "OPENSOURCE!!!",
  platformText: "FOR ALL PLATFORMS",
  url: "https://spaceapp.dev"
};

// alertsEnabled stays unset here so the first load can adopt the former reminder's settings.
const DEFAULT_AI_QUOTA_CONFIG: AiQuotaWidgetConfig = {
  activeTab: "all",
  availabilityFilter: "all",
  showAllAccounts: false,
  autoRefresh: true,
  refreshIntervalSeconds: 90,
  alertProvider: "all",
  proOnly: false,
  soundEnabled: true
};

// The AI Token Reminder widget was folded into AI Quota & Usage on 2026-10-11.
const LEGACY_TOKEN_REMINDER_ID = "token-reminder";

export const DOCK_WIDTH = 48;
export const DOCK_MARGIN_RIGHT = 2;
export const RAIL_TOP_OFFSET = 72;
export const DOCK_GAP = 8;

export const WIDGET_DOCK_HEIGHTS: Record<DesktopWidgetId, number> = {
  "ai-quota": 105,
  "pushup-reminder": 68,
  "clock": 52,
  "countdown-timer": 52,
  "spaceapp-promo": 52,
  "streaming-metrics": 52
};

export function getRailTopBoundary(): number {
  if (typeof document !== "undefined") {
    let maxBottom = 72;

    const healthRail = document.querySelector(".health-indicator-rail");
    if (healthRail) {
      const rect = healthRail.getBoundingClientRect();
      if (rect.bottom > 0) {
        maxBottom = Math.max(maxBottom, Math.ceil(rect.bottom) + DOCK_GAP);
      } else {
        maxBottom = Math.max(maxBottom, 340);
      }
    }

    const healthItems = document.querySelector(".health-rail-items");
    if (healthItems) {
      const rect = healthItems.getBoundingClientRect();
      if (rect.bottom > 0) {
        maxBottom = Math.max(maxBottom, Math.ceil(rect.bottom) + DOCK_GAP);
      }
    }

    const minBar = document.getElementById("minimized-pane-bar-toggle");
    if (minBar) {
      const rect = minBar.getBoundingClientRect();
      if (rect.bottom > 0) {
        maxBottom = Math.max(maxBottom, Math.ceil(rect.bottom) + DOCK_GAP);
      }
    }

    const indicators = document.querySelectorAll(".health-indicator-rail button, .health-indicator, .health-rail-items > *");
    indicators.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > 0) {
        maxBottom = Math.max(maxBottom, Math.ceil(rect.bottom) + DOCK_GAP);
      }
    });

    return maxBottom;
  }
  return 72;
}

export function getFloatingTopBoundary(): number {
  if (typeof document !== "undefined") {
    let topBoundary = 0;

    const titlebar = document.querySelector(".desktop-window-titlebar");
    if (titlebar) {
      const rect = titlebar.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > 0) {
        topBoundary = Math.max(topBoundary, Math.ceil(rect.bottom));
      }
    }

    const topbar = document.querySelector("header.topbar");
    if (topbar) {
      const rect = topbar.getBoundingClientRect();
      if (rect.height > 0 && rect.bottom > 0) {
        topBoundary = Math.max(topBoundary, Math.ceil(rect.bottom));
      }
    }

    if (topBoundary === 0 && typeof getComputedStyle !== "undefined") {
      const rootStyle = getComputedStyle(document.documentElement);
      const titlebarHeight = parseFloat(rootStyle.getPropertyValue("--desktop-titlebar-height"));
      if (!Number.isNaN(titlebarHeight) && titlebarHeight > 0) {
        const isFullscreen = Boolean(
          document.fullscreenElement ||
          document.querySelector('[data-browser-fullscreen="true"]')
        );
        if (!isFullscreen) {
          topBoundary = Math.max(topBoundary, Math.ceil(titlebarHeight));
        }
      }
    }

    return topBoundary;
  }
  return 0;
}

export function resolveRailDockCollisions(
  states: Record<DesktopWidgetId, DesktopWidgetState>,
  activeId?: DesktopWidgetId,
  viewportW = typeof window !== "undefined" ? window.innerWidth : 1200,
  viewportH = typeof window !== "undefined" ? window.innerHeight : 800
): boolean {
  const dockX = Math.max(12, viewportW - DOCK_WIDTH - DOCK_MARGIN_RIGHT);
  const minRailTop = getRailTopBoundary();
  const maxBottom = viewportH - 12;

  const railWidgets = (Object.keys(states) as DesktopWidgetId[])
    .map((id) => ({ ...states[id], origX: states[id]?.x ?? 0 }))
    .filter((w): w is DesktopWidgetState & { origX: number } => Boolean(w && w.enabled && w.dockedToRail && w.minimized && w.dockPosition !== "header"));

  if (railWidgets.length === 0) return false;

  let changed = false;

  // 1. Sort by y coordinate. If tied, prioritize activeId, then original x coordinate (e.g. from header toolbar)
  railWidgets.sort((a, b) => {
    if (a.y === b.y) {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      return a.origX - b.origX;
    }
    return a.y - b.y;
  });

  // 2. Clamp first/top widget to at least minRailTop
  if (railWidgets[0]!.y < minRailTop) {
    railWidgets[0]!.y = minRailTop;
    states[railWidgets[0]!.id] = { ...states[railWidgets[0]!.id]!, y: minRailTop };
    changed = true;
  }

  // 3. Forward pass: ensure no overlap from top to bottom
  for (let i = 0; i < railWidgets.length - 1; i++) {
    const current = railWidgets[i]!;
    const next = railWidgets[i + 1]!;
    const currentH = WIDGET_DOCK_HEIGHTS[current.id] ?? 52;
    const minNextY = current.y + currentH + DOCK_GAP;

    if (next.y < minNextY) {
      next.y = minNextY;
      states[next.id] = { ...states[next.id]!, y: minNextY };
      changed = true;
    }
  }

  // 4. Backward pass: if bottom widget extends past maxBottom, shift upwards
  const lastIndex = railWidgets.length - 1;
  const lastWidget = railWidgets[lastIndex]!;
  const lastH = WIDGET_DOCK_HEIGHTS[lastWidget.id] ?? 52;

  if (lastWidget.y + lastH > maxBottom) {
    lastWidget.y = Math.max(minRailTop, maxBottom - lastH);
    states[lastWidget.id] = { ...states[lastWidget.id]!, y: lastWidget.y };
    changed = true;

    for (let i = lastIndex - 1; i >= 0; i--) {
      const prev = railWidgets[i]!;
      const next = railWidgets[i + 1]!;
      const prevH = WIDGET_DOCK_HEIGHTS[prev.id] ?? 52;
      const maxPrevY = next.y - prevH - DOCK_GAP;

      if (prev.y > maxPrevY) {
        prev.y = Math.max(minRailTop, maxPrevY);
        states[prev.id] = { ...states[prev.id]!, y: prev.y };
        changed = true;
      }
    }
  }

  // 5. Ensure all rail widgets have correct dockX
  for (const w of railWidgets) {
    if (states[w.id]!.x !== dockX) {
      states[w.id] = { ...states[w.id]!, x: dockX };
      changed = true;
    }
  }

  return changed;
}

export function enforceRailDockSlots(
  states: Record<DesktopWidgetId, DesktopWidgetState>,
  viewportW = typeof window !== "undefined" ? window.innerWidth : 1200,
  viewportH = typeof window !== "undefined" ? window.innerHeight : 800
): boolean {
  return resolveRailDockCollisions(states, undefined, viewportW, viewportH);
}

export function resolveHeaderDockCollisions(
  states: Record<DesktopWidgetId, DesktopWidgetState>,
  activeId?: DesktopWidgetId
): boolean {
  const headerWidgets = (Object.keys(states) as DesktopWidgetId[])
    .map((id) => ({ ...states[id] }))
    .filter((w): w is DesktopWidgetState => Boolean(w && w.enabled && w.dockedToRail && w.minimized));

  if (headerWidgets.length <= 1) return false;

  let changed = false;

  // Sort by x coordinate
  headerWidgets.sort((a, b) => {
    if (a.x === b.x) {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
    }
    return a.x - b.x;
  });

  // Assign clean sequential slots for x: 100, 200, 300...
  for (let i = 0; i < headerWidgets.length; i++) {
    const w = headerWidgets[i]!;
    const slotX = (i + 1) * 100;
    if (w.x !== slotX) {
      states[w.id] = { ...states[w.id]!, x: slotX };
      changed = true;
    }
  }

  return changed;
}

export const ALL_DESKTOP_WIDGET_IDS: DesktopWidgetId[] = [
  "clock",
  "countdown-timer",
  "pushup-reminder",
  "spaceapp-promo",
  "ai-quota",
  "streaming-metrics"
];

export function getDefaultPositions(): Record<DesktopWidgetId, { x: number; y: number }> {
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  return {
    clock: { x: Math.max(20, w - 280), y: 60 },
    "ai-quota": { x: Math.max(20, w - 460), y: 60 },
    "countdown-timer": { x: Math.max(20, w - 280), y: 260 },
    "pushup-reminder": { x: Math.max(20, w - 460), y: 220 },
    "spaceapp-promo": { x: Math.max(20, w - 320), y: 520 },
    "streaming-metrics": { x: Math.max(20, w - 460), y: 240 }
  };
}

export function normalizeWidgetStates(
  raw?: unknown
): Record<DesktopWidgetId, DesktopWidgetState> {
  const defaults = getDefaultPositions();
  const initial: Record<DesktopWidgetId, DesktopWidgetState> = {
    clock: { id: "clock", enabled: false, x: defaults.clock.x, y: defaults.clock.y, zIndex: 120 },
    "countdown-timer": { id: "countdown-timer", enabled: false, x: defaults["countdown-timer"].x, y: defaults["countdown-timer"].y, zIndex: 121 },
    "pushup-reminder": { id: "pushup-reminder", enabled: false, x: defaults["pushup-reminder"].x, y: defaults["pushup-reminder"].y, zIndex: 122 },
    "spaceapp-promo": { id: "spaceapp-promo", enabled: false, x: defaults["spaceapp-promo"].x, y: defaults["spaceapp-promo"].y, zIndex: 124 },
    "ai-quota": { id: "ai-quota", enabled: false, x: defaults["ai-quota"].x, y: defaults["ai-quota"].y, zIndex: 125 },
    "streaming-metrics": { id: "streaming-metrics", enabled: false, x: defaults["streaming-metrics"].x, y: defaults["streaming-metrics"].y, zIndex: 126 }
  };

  const parsed = raw && typeof raw === "object" ? (raw as Partial<Record<DesktopWidgetId, DesktopWidgetState>>) : {};
  const result: Record<DesktopWidgetId, DesktopWidgetState> = {
    clock: { ...initial.clock, ...parsed.clock, id: "clock" },
    "countdown-timer": { ...initial["countdown-timer"], ...parsed["countdown-timer"], id: "countdown-timer" },
    "pushup-reminder": { ...initial["pushup-reminder"], ...parsed["pushup-reminder"], id: "pushup-reminder" },
    "spaceapp-promo": { ...initial["spaceapp-promo"], ...parsed["spaceapp-promo"], id: "spaceapp-promo" },
    "ai-quota": { ...initial["ai-quota"], ...parsed["ai-quota"], id: "ai-quota" },
    "streaming-metrics": { ...initial["streaming-metrics"], ...parsed["streaming-metrics"], id: "streaming-metrics" }
  };
  // An open reminder from before the merge reopens as AI Quota & Usage in its place.
  const legacyReminder = (parsed as Record<string, Partial<DesktopWidgetState> | undefined>)[LEGACY_TOKEN_REMINDER_ID];
  if (legacyReminder?.enabled && !parsed["ai-quota"]?.enabled) {
    result["ai-quota"] = {
      ...result["ai-quota"],
      enabled: true,
      minimized: legacyReminder.minimized ?? false,
      dockedToRail: legacyReminder.dockedToRail ?? false,
      dockPosition: legacyReminder.dockPosition,
      x: typeof legacyReminder.x === "number" ? legacyReminder.x : result["ai-quota"].x,
      y: typeof legacyReminder.y === "number" ? legacyReminder.y : result["ai-quota"].y
    };
  }

  if (typeof window !== "undefined") {
    const minTop = getFloatingTopBoundary();
    const maxX = Math.max(0, window.innerWidth - 180);
    const maxY = Math.max(minTop, window.innerHeight - 100);
    for (const key of ALL_DESKTOP_WIDGET_IDS) {
      const item = result[key];
      if (item && item.enabled && !item.dockedToRail) {
        item.x = Math.min(Math.max(0, item.x), maxX);
        item.y = Math.min(Math.max(minTop, item.y), maxY);
      }
    }
  }

  return result;
}

export function loadWidgetStates(): Record<DesktopWidgetId, DesktopWidgetState> {
  try {
    if (typeof localStorage === "undefined") return normalizeWidgetStates();
    const raw = localStorage.getItem(WIDGETS_STATE_KEY);
    if (!raw) return normalizeWidgetStates();
    const parsed = JSON.parse(raw);
    const result = normalizeWidgetStates(parsed);
    if (typeof window !== "undefined") {
      enforceRailDockSlots(result, window.innerWidth, window.innerHeight);
    }
    return result;
  } catch {
    return normalizeWidgetStates();
  }
}

export function saveWidgetStates(states: Record<DesktopWidgetId, DesktopWidgetState>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(WIDGETS_STATE_KEY, JSON.stringify(states));
    window.dispatchEvent(new CustomEvent(WIDGETS_CHANGED_EVENT, { detail: states }));
    saveUserSettingDebounced("desktopWidgets", states);
  } catch {
    // Storage unavailable
  }
}

export function toggleDesktopWidget(id: DesktopWidgetId, forced?: boolean): void {
  const currentStates = normalizeWidgetStates(loadWidgetStates());
  const current = currentStates[id];
  const targetEnabled = forced !== undefined ? forced : !current.enabled;
  let { x, y } = current;
  if (targetEnabled && typeof window !== "undefined") {
    const minTop = getFloatingTopBoundary();
    x = Math.min(Math.max(0, x), window.innerWidth - 180);
    y = Math.min(Math.max(minTop, y), window.innerHeight - 120);
  }
  const maxZ = Object.values(currentStates).reduce((max, w) => Math.max(max, w.zIndex ?? 120), 120);
  const next: Record<DesktopWidgetId, DesktopWidgetState> = {
    ...currentStates,
    [id]: {
      ...current,
      enabled: targetEnabled,
      minimized: targetEnabled && !current.dockedToRail ? false : current.minimized,
      x,
      y,
      zIndex: targetEnabled ? maxZ + 1 : current.zIndex
    }
  };
  if (targetEnabled && current.dockedToRail && current.minimized) {
    enforceRailDockSlots(next);
  }
  saveWidgetStates(next);
}

export function loadWidgetConfig<T>(id: DesktopWidgetId, defaults: T): T {
  try {
    if (typeof localStorage === "undefined") return defaults;
    const raw = localStorage.getItem(`${WIDGET_CONFIG_PREFIX}${id}`);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

/**
 * Persists a widget config locally and, unless `syncToServer` is false, to the
 * user's server settings. Per-second countdown ticks pass false: they are
 * device-local progress, and syncing them sent a settings PATCH every second.
 */
export function saveWidgetConfig<T>(id: DesktopWidgetId, config: T, options: { syncToServer?: boolean } = {}): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(`${WIDGET_CONFIG_PREFIX}${id}`, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(WIDGET_CONFIG_CHANGED_EVENT, { detail: { id, config } }));
    if (options.syncToServer !== false) saveUserSettingDebounced("desktopWidgets", { [`config:${id}`]: config });
  } catch {
    // Storage unavailable
  }
}

/**
 * Loads the AI Quota & Usage settings. The first load after the merge adopts the
 * reset alert settings of the former AI Token Reminder and turns alerts on when
 * that reminder was open.
 */
export function loadAiQuotaWidgetConfig(): AiQuotaWidgetConfig {
  const config = loadWidgetConfig("ai-quota", DEFAULT_AI_QUOTA_CONFIG);
  if (config.alertsEnabled !== undefined) return config;
  let legacy: { tokenProvider?: string; proOnly?: boolean; soundEnabled?: boolean } = {};
  let legacyOpen = false;
  try {
    if (typeof localStorage !== "undefined") {
      legacy = JSON.parse(localStorage.getItem(`${WIDGET_CONFIG_PREFIX}${LEGACY_TOKEN_REMINDER_ID}`) ?? "{}") ?? {};
      const states = JSON.parse(localStorage.getItem(WIDGETS_STATE_KEY) ?? "{}") ?? {};
      legacyOpen = Boolean(states[LEGACY_TOKEN_REMINDER_ID]?.enabled);
    }
  } catch {
    // Unreadable legacy settings fall back to the defaults.
  }
  const provider = legacy.tokenProvider === "codex" || legacy.tokenProvider === "gemini" ? legacy.tokenProvider : "all";
  const migrated: AiQuotaWidgetConfig = {
    ...config,
    alertsEnabled: legacyOpen,
    alertProvider: provider,
    proOnly: legacy.proOnly ?? config.proOnly,
    soundEnabled: legacy.soundEnabled ?? config.soundEnabled
  };
  saveWidgetConfig("ai-quota", migrated);
  return migrated;
}

export {
  DEFAULT_CLOCK_CONFIG,
  DEFAULT_TIMER_CONFIG,
  DEFAULT_PUSHUP_CONFIG,
  DEFAULT_PROMO_CONFIG,
  DEFAULT_AI_QUOTA_CONFIG
};

export function areWidgetStatesEqual(
  a: Record<DesktopWidgetId, DesktopWidgetState> | null | undefined,
  b: Record<DesktopWidgetId, DesktopWidgetState> | null | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a) as DesktopWidgetId[];
  const keysB = Object.keys(b) as DesktopWidgetId[];
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    const sA = a[k];
    const sB = b[k];
    if (!sA || !sB) return false;
    if (
      sA.id !== sB.id ||
      sA.enabled !== sB.enabled ||
      sA.x !== sB.x ||
      sA.y !== sB.y ||
      sA.zIndex !== sB.zIndex ||
      sA.minimized !== sB.minimized ||
      sA.dockedToRail !== sB.dockedToRail ||
      sA.dockPosition !== sB.dockPosition
    ) {
      return false;
    }
  }
  return true;
}

export function useDesktopWidgets() {
  const [widgets, setWidgets] = useState<Record<DesktopWidgetId, DesktopWidgetState>>(() => loadWidgetStates());
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const isInternalUpdateRef = useRef(false);

  useEffect(() => {
    const handler = (e: Event) => {
      if (isInternalUpdateRef.current) return;
      const customEvent = e as CustomEvent<Record<DesktopWidgetId, DesktopWidgetState>>;
      const rawDetail = customEvent.detail;
      const nextStates = rawDetail ? normalizeWidgetStates(rawDetail) : loadWidgetStates();
      if (!areWidgetStatesEqual(widgetsRef.current, nextStates)) {
        setWidgets(nextStates);
      }
    };
    window.addEventListener(WIDGETS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(WIDGETS_CHANGED_EVENT, handler);
  }, []);

  useEffect(() => {
    let resizeTimer: number | null = null;
    const handleResize = () => {
      if (typeof window === "undefined") return;
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        setWidgets((prev) => {
          let changed = false;
          const next = normalizeWidgetStates(prev);
          const maxX = Math.max(0, window.innerWidth - 180);
          const maxY = Math.max(0, window.innerHeight - 100);
          for (const key of Object.keys(next) as DesktopWidgetId[]) {
            const w = next[key];
            if (w.enabled && !w.dockedToRail) {
              if (w.x > maxX || w.y > maxY || w.x < 0 || w.y < 0) {
                const clampedX = Math.min(Math.max(0, w.x), maxX);
                const clampedY = Math.min(Math.max(0, w.y), maxY);
                if (clampedX !== w.x || clampedY !== w.y) {
                  next[key] = { ...w, x: clampedX, y: clampedY };
                  changed = true;
                }
              }
            }
          }
          if (enforceRailDockSlots(next, window.innerWidth, window.innerHeight)) {
            changed = true;
          }
          if (changed) {
            try {
              isInternalUpdateRef.current = true;
              saveWidgetStates(next);
            } finally {
              isInternalUpdateRef.current = false;
            }
            return next;
          }
          return prev;
        });
      }, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const isWidgetEnabled = useCallback(
    (id: DesktopWidgetId): boolean => Boolean(widgets[id]?.enabled),
    [widgets]
  );

  const toggleWidget = useCallback((id: DesktopWidgetId, forced?: boolean) => {
    setWidgets((prev) => {
      const normalized = normalizeWidgetStates(prev);
      const current = normalized[id];
      const targetEnabled = forced !== undefined ? forced : !current.enabled;

      // When enabling, bring to front, unminimize if floating, and ensure within viewport
      let { x, y } = current;
      if (targetEnabled && !current.dockedToRail && typeof window !== "undefined") {
        const minTop = getFloatingTopBoundary();
        x = Math.min(Math.max(0, x), window.innerWidth - 180);
        y = Math.min(Math.max(minTop, y), window.innerHeight - 120);
      }

      const maxZ = Object.values(normalized).reduce((max, w) => Math.max(max, w.zIndex ?? 120), 120);
      const next: Record<DesktopWidgetId, DesktopWidgetState> = {
        ...normalized,
        [id]: {
          ...current,
          enabled: targetEnabled,
          minimized: targetEnabled && !current.dockedToRail ? false : current.minimized,
          x,
          y,
          zIndex: targetEnabled ? maxZ + 1 : current.zIndex
        }
      };
      if (targetEnabled && current.dockedToRail) {
        if (current.dockPosition === "header") {
          resolveHeaderDockCollisions(next, id);
        } else {
          resolveRailDockCollisions(next, id);
        }
      }
      if (areWidgetStatesEqual(prev, next)) return prev;
      try {
        isInternalUpdateRef.current = true;
        saveWidgetStates(next);
      } finally {
        isInternalUpdateRef.current = false;
      }
      return next;
    });
  }, []);

  const setPosition = useCallback((id: DesktopWidgetId, x: number, y: number, dockedToRail?: boolean, dockPosition?: "rail" | "header") => {
    setWidgets((prev) => {
      const normalized = normalizeWidgetStates(prev);
      const current = normalized[id];
      const targetDocked = dockedToRail !== undefined ? dockedToRail : current.dockedToRail;
      const targetDockPos = targetDocked ? (dockPosition ?? current.dockPosition ?? "rail") : undefined;
      const nextMinimized = targetDocked ? true : current.minimized;
      if (current.x === x && current.y === y && Boolean(current.dockedToRail) === Boolean(targetDocked) && current.dockPosition === targetDockPos && current.minimized === nextMinimized) return prev;
      const next: Record<DesktopWidgetId, DesktopWidgetState> = {
        ...normalized,
        [id]: {
          ...current,
          x,
          y,
          dockedToRail: targetDocked,
          dockPosition: targetDockPos,
          minimized: nextMinimized
        }
      };
      if (targetDocked) {
        if (targetDockPos === "header") {
          resolveHeaderDockCollisions(next, id);
        } else {
          resolveRailDockCollisions(next, id);
        }
      } else if (!targetDocked) {
        for (const key of Object.keys(next) as DesktopWidgetId[]) {
          if (key !== id && next[key].enabled && !next[key].dockedToRail) {
            if (Math.abs(next[id].x - next[key].x) < 80 && Math.abs(next[id].y - next[key].y) < 40) {
              const viewW = typeof window !== "undefined" ? window.innerWidth : 1200;
              const viewH = typeof window !== "undefined" ? window.innerHeight : 800;
              next[id].x = Math.min(Math.max(0, viewW - 280 - 12), next[id].x + 32);
              next[id].y = Math.min(Math.max(0, viewH - 160 - 12), next[id].y + 32);
            }
          }
        }
      }
      if (areWidgetStatesEqual(prev, next)) return prev;
      try {
        isInternalUpdateRef.current = true;
        saveWidgetStates(next);
      } finally {
        isInternalUpdateRef.current = false;
      }
      return next;
    });
  }, []);

  const toggleMinimize = useCallback((id: DesktopWidgetId) => {
    setWidgets((prev) => {
      const normalized = normalizeWidgetStates(prev);
      const current = normalized[id];
      const nextMinimized = !current.minimized;
      const next: Record<DesktopWidgetId, DesktopWidgetState> = {
        ...normalized,
        [id]: { ...current, minimized: nextMinimized }
      };
      if (current.dockedToRail && nextMinimized) {
        if (current.dockPosition === "header") {
          resolveHeaderDockCollisions(next, id);
        } else {
          resolveRailDockCollisions(next, id);
        }
      }
      if (areWidgetStatesEqual(prev, next)) return prev;
      try {
        isInternalUpdateRef.current = true;
        saveWidgetStates(next);
      } finally {
        isInternalUpdateRef.current = false;
      }
      return next;
    });
  }, []);

  const bringToFront = useCallback((id: DesktopWidgetId) => {
    setWidgets((prev) => {
      const normalized = normalizeWidgetStates(prev);
      const current = normalized[id];
      const maxZ = Object.values(normalized).reduce((max, w) => Math.max(max, w.zIndex ?? 120), 120);
      if (current.zIndex === maxZ) return prev;
      const next = {
        ...normalized,
        [id]: { ...current, zIndex: maxZ + 1 }
      };
      if (areWidgetStatesEqual(prev, next)) return prev;
      try {
        isInternalUpdateRef.current = true;
        saveWidgetStates(next);
      } finally {
        isInternalUpdateRef.current = false;
      }
      return next;
    });
  }, []);

  const closeWidget = useCallback((id: DesktopWidgetId) => {
    toggleWidget(id, false);
  }, [toggleWidget]);

  const enforceRailSlots = useCallback(() => {
    const applySlots = () => {
      setWidgets((prev) => {
        const next: Record<DesktopWidgetId, DesktopWidgetState> = { ...prev };
        let hasDocked = false;
        for (const id of Object.keys(next) as DesktopWidgetId[]) {
          if (next[id]?.dockedToRail && next[id]?.minimized) {
            next[id] = { ...next[id]!, dockPosition: "rail" };
            hasDocked = true;
          }
        }
        if (!hasDocked) return prev;
        resolveRailDockCollisions(next);
        if (areWidgetStatesEqual(prev, next)) return prev;
        try {
          isInternalUpdateRef.current = true;
          saveWidgetStates(next);
        } finally {
          isInternalUpdateRef.current = false;
        }
        return next;
      });
    };

    applySlots();
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(applySlots);
      window.setTimeout(applySlots, 60);
      window.setTimeout(applySlots, 200);
    }
  }, []);

  const enforceHeaderSlots = useCallback(() => {
    const applySlots = () => {
      setWidgets((prev) => {
        const next: Record<DesktopWidgetId, DesktopWidgetState> = { ...prev };
        let hasDocked = false;
        for (const id of Object.keys(next) as DesktopWidgetId[]) {
          if (next[id]?.dockedToRail && next[id]?.minimized) {
            next[id] = { ...next[id]!, dockPosition: "header", y: 8 };
            hasDocked = true;
          }
        }
        if (!hasDocked) return prev;
        resolveHeaderDockCollisions(next);
        if (areWidgetStatesEqual(prev, next)) return prev;
        try {
          isInternalUpdateRef.current = true;
          saveWidgetStates(next);
        } finally {
          isInternalUpdateRef.current = false;
        }
        return next;
      });
    };

    applySlots();
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(applySlots);
    }
  }, []);

  // Keep unrelated App updates out of the widget layout/effect tree.
  return useMemo(() => ({
    widgets,
    isWidgetEnabled,
    toggleWidget,
    setPosition,
    toggleMinimize,
    bringToFront,
    closeWidget,
    enforceRailSlots,
    enforceHeaderSlots
  }), [widgets, isWidgetEnabled, toggleWidget, setPosition, toggleMinimize, bringToFront, closeWidget, enforceRailSlots, enforceHeaderSlots]);
}

import { useCallback, useMemo, useState } from "react";
import type { Pane } from "@space/contracts";
import type { PaneCompletionLifecycleState } from "../../pane-completion-lifecycle.js";
import { getSpaceRuntime } from "../../runtime/SpaceRuntime.js";
import type { ShellMode } from "../pane-grid/pane-grid-layout.js";

// The minimized-pane bar of the active room: which panes it lists, how many of
// them run, whether it is expanded, and the per-browser preview-card mode.

const MINIMIZED_BAR_PREVIEW_STORAGE_KEY = "space.minimized.bar.preview.v1";

export interface MinimizedPaneBar {
  minimizedPanes: Pane[];
  minimizedPaneRunningCount: number;
  /** The bar is open (never on mobile, never without minimized panes). */
  showMinimizedBar: boolean;
  /** The bar hides behind one room toolbar button, so only render it where that button can live. */
  showMinimizedBarToggle: boolean;
  setMinimizedBarExpanded: (expanded: boolean | ((current: boolean) => boolean)) => void;
  minimizedBarPreviewMode: boolean;
  toggleMinimizedBarPreviewMode: () => void;
}

export function useMinimizedPaneBar({ panes, shellMode, paneCompletionLifecycle }: {
  panes: Pane[];
  shellMode: ShellMode;
  paneCompletionLifecycle: PaneCompletionLifecycleState;
}): MinimizedPaneBar {
  const minimizedPanes = useMemo(() => panes.filter((pane) => pane.isMinimized), [panes]);
  const minimizedPaneRunningCount = useMemo(
    () => minimizedPanes.filter((pane) => paneCompletionLifecycle.panes[pane.id]?.activeRunKey != null).length,
    [minimizedPanes, paneCompletionLifecycle]
  );
  const [minimizedBarExpanded, setMinimizedBarExpanded] = useState(false);
  const showMinimizedBar = shellMode !== "mobile" && minimizedPanes.length > 0 && minimizedBarExpanded;
  const showMinimizedBarToggle = minimizedPanes.length > 0 && shellMode !== "mobile";
  const [minimizedBarPreviewMode, setMinimizedBarPreviewMode] = useState(() => {
    try {
      return getSpaceRuntime().platform.localStorage.getItem(MINIMIZED_BAR_PREVIEW_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleMinimizedBarPreviewMode = useCallback(() => {
    setMinimizedBarPreviewMode((prev) => {
      const next = !prev;
      try {
        getSpaceRuntime().platform.localStorage.setItem(MINIMIZED_BAR_PREVIEW_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  return {
    minimizedPanes,
    minimizedPaneRunningCount,
    showMinimizedBar,
    showMinimizedBarToggle,
    setMinimizedBarExpanded,
    minimizedBarPreviewMode,
    toggleMinimizedBarPreviewMode
  };
}

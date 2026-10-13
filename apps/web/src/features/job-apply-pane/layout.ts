import type { CopilotRailTab } from "./CopilotRail.js";

/**
 * Split: live browser beside (or, under 900px, above) the rail. Stacked: one surface at a time
 * with the browser as a rail tab and the tab strip at the bottom, for phones and narrow panes.
 */
export type JobCopilotLayout = "split" | "stacked";

/** Panes at most this wide (CSS px) stack; a 390–430px phone always does, a half-screen desktop pane does not. */
export const STACKED_LAYOUT_MAX_WIDTH = 640;

export function layoutForWidth(width: number): JobCopilotLayout {
  return width > 0 && width <= STACKED_LAYOUT_MAX_WIDTH ? "stacked" : "split";
}

export const RAIL_TABS: readonly CopilotRailTab[] = ["activity", "queue", "fields", "memory", "setup", "terminal"];

/** The tabs a layout offers, in strip order: the browser leads only when it is a tab of its own. */
export function tabsForLayout(layout: JobCopilotLayout): CopilotRailTab[] {
  return layout === "stacked" ? ["browser", ...RAIL_TABS] : [...RAIL_TABS];
}

/** A stored tab that the current layout has no surface for falls back to Activity. */
export function resolveActiveTab(tab: string | null | undefined, layout: JobCopilotLayout): CopilotRailTab {
  const available = tabsForLayout(layout);
  return available.includes(tab as CopilotRailTab) ? (tab as CopilotRailTab) : "activity";
}

/** Whether the live browser surface is the visible one for this layout and tab. */
export function browserVisible(layout: JobCopilotLayout, activeTab: CopilotRailTab, railCollapsed: boolean): boolean {
  if (layout === "split") return true;
  return activeTab === "browser" || railCollapsed;
}

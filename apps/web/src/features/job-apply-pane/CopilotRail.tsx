import type { ReactNode } from "react";
import { Activity, Brain, ClipboardList, Globe, Settings, Table, Terminal } from "../ui-theme/app-icons.js";

export type CopilotRailTab = "browser" | "activity" | "queue" | "fields" | "memory" | "setup" | "terminal";

export interface CopilotRailTabDefinition {
  id: CopilotRailTab;
  label: string;
  icon: typeof Activity;
  badge?: number | null;
  /** Tabs that are not available yet are hidden; the terminal tab is always present. */
  available: boolean;
}

export const RAIL_TAB_ICONS: Record<CopilotRailTab, typeof Activity> = {
  browser: Globe, activity: Activity, queue: ClipboardList, fields: Table, memory: Brain, setup: Settings, terminal: Terminal
};

/**
 * The copilot rail: a tab strip (icons only when collapsed) and one panel per tab. Panels are
 * rendered by the parent so the terminal element stays mounted while another tab is active.
 * In the stacked layout the strip sits at the bottom of the pane and the browser is a tab too.
 */
export function CopilotRail({ tabs, active, collapsed, layout = "split", onSelect, children }: {
  tabs: CopilotRailTabDefinition[];
  active: CopilotRailTab;
  collapsed: boolean;
  layout?: "split" | "stacked";
  onSelect(tab: CopilotRailTab): void;
  children: ReactNode;
}) {
  const stacked = layout === "stacked";
  return (
    <aside className="jc-rail" data-collapsed={!stacked && collapsed ? "true" : undefined} data-layout={layout} aria-label="Copilot rail">
      <nav className="jc-rail-tabs" role="tablist" aria-orientation={!stacked && collapsed ? "vertical" : "horizontal"}>
        {tabs.filter((tab) => tab.available).map((tab) => {
          const Icon = tab.icon;
          const selected = tab.id === active;
          return (
            <button key={tab.id} type="button" role="tab" id={`jc-tab-${tab.id}`} aria-selected={selected} aria-controls={`jc-panel-${tab.id}`}
              className={`jc-rail-tab${selected ? " selected" : ""}`} title={!stacked && collapsed ? tab.label : undefined} onClick={() => onSelect(tab.id)}>
              <Icon aria-hidden="true" />
              <span className="jc-rail-tab-label">{tab.label}</span>
              {tab.badge ? <span className="jc-rail-badge" aria-label={`${tab.badge} items`}>{tab.badge}</span> : null}
            </button>
          );
        })}
      </nav>
      <div className="jc-rail-body">{children}</div>
    </aside>
  );
}

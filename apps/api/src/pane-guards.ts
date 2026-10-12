import { SpaceConflictError } from "@space/runtime";
import type { Pane } from "@space/contracts";

/** Native agent sessions run only in open CHAT panes. */
export function assertAgentPaneCompatible(pane: Pane) {
  if (pane.mode !== "CHAT") {
    throw new SpaceConflictError(`Pane ${pane.id} is ${pane.mode}; native agent sessions require CHAT panes.`);
  }
  if (pane.isClosed) {
    throw new SpaceConflictError(`Pane ${pane.id} is closed.`);
  }
}

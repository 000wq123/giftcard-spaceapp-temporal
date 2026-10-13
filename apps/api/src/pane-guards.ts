import { SpaceConflictError, SpaceNotFoundError, type SpaceStore } from "@space/runtime";
import type { Event, Pane, PaneBrowserSession, PaneCliSession } from "@space/contracts";

/** Native agent sessions run only in open CHAT panes. */
export function assertAgentPaneCompatible(pane: Pane) {
  if (pane.mode !== "CHAT") {
    throw new SpaceConflictError(`Pane ${pane.id} is ${pane.mode}; native agent sessions require CHAT panes.`);
  }
  if (pane.isClosed) {
    throw new SpaceConflictError(`Pane ${pane.id} is closed.`);
  }
}

export async function assertPaneBelongsToRoom(store: SpaceStore, roomId: string, paneId?: string | null) {
  if (!paneId) return;
  const pane = await store.getPane(paneId);
  if (pane.roomId !== roomId) {
    throw new SpaceNotFoundError(`Pane ${paneId} was not found.`);
  }
}

export async function getPaneById(store: SpaceStore, paneId: string): Promise<Pane> {
  return store.getPane(paneId);
}

export async function getLatestRoomEvent(store: SpaceStore, roomId: string): Promise<Event | null> {
  return store.getLatestEvent(roomId);
}

export class PaneClosedConflictError extends SpaceConflictError {}

// A Job Applications pane owns both a CLI agent session and a managed browser session.
const CLI_PANE_MODES: ReadonlyArray<Pane["mode"]> = ["TERMINAL", "JOB_APPLY"];

export function isCliPane(pane: Pick<Pane, "mode">): boolean {
  return CLI_PANE_MODES.includes(pane.mode);
}

export function assertCliPaneCompatible(pane: Pane) {
  if (!isCliPane(pane)) {
    throw new SpaceConflictError(`Pane ${pane.id} is ${pane.mode}; CLI sessions require TERMINAL or JOB_APPLY panes.`);
  }
  if (pane.isClosed) {
    throw new PaneClosedConflictError(`Pane ${pane.id} is closed.`);
  }
}

const BROWSER_PANE_MODES: ReadonlyArray<Pane["mode"]> = ["BROWSER", "YOUTUBE", "JOB_APPLY"];

export function isBrowserPane(pane: Pick<Pane, "mode">): boolean {
  return BROWSER_PANE_MODES.includes(pane.mode);
}

export function assertBrowserPaneCompatible(pane: Pane) {
  if (!isBrowserPane(pane)) {
    throw new SpaceConflictError(`Pane ${pane.id} is ${pane.mode}; browser sessions require BROWSER, YOUTUBE or JOB_APPLY panes.`);
  }
  if (pane.isClosed) {
    throw new SpaceConflictError(`Pane ${pane.id} is closed.`);
  }
}

export function assertNormalCliSession(session: PaneCliSession): void {
  if (session.purpose !== "NORMAL") {
    throw new SpaceConflictError("CLI login sessions support only terminal authentication I/O, reconnect, and cancellation.");
  }
}

export async function getActiveBrowserSessionForPane(store: SpaceStore, pane: Pane): Promise<PaneBrowserSession> {
  const session = await store.getActivePaneBrowserSession(pane.id);
  if (!session || !session.isActive || session.status === "CLOSED") {
    throw new SpaceNotFoundError(`Active browser session for pane ${pane.id} was not found.`);
  }
  return session;
}

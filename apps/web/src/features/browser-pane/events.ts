export const BROWSER_PANE_ACTION_EVENT = "space:browser-pane-action";

export type BrowserPaneAction = "bookmarks" | "import" | "handoff" | "release" | "reload" | "account";

export interface BrowserPaneActionDetail {
  paneId: string;
  action: BrowserPaneAction;
  roomId?: string;
  /** "account": the Google account profile to open (Job Copilot Setup chooses it outside the toolbar). */
  profileId?: string;
  /** "account": open Google sign-in for that account. */
  signIn?: boolean;
}

/** A pane browser switched Google accounts (toolbar menu or Setup); the detail names the pane. */
export const BROWSER_PANE_ACCOUNT_SELECTED_EVENT = "space:browser-pane-account-selected";

const activeBrowserPaneTargets = new Map<string, number>();
const pendingBrowserPaneActions = new Map<string, BrowserPaneActionDetail[]>();

export function dispatchBrowserPaneActionEvent(detail: BrowserPaneActionDetail) {
  if ((activeBrowserPaneTargets.get(detail.paneId) ?? 0) === 0) {
    const queued = pendingBrowserPaneActions.get(detail.paneId) ?? [];
    queued.push(detail);
    pendingBrowserPaneActions.set(detail.paneId, queued);
    return;
  }
  window.dispatchEvent(new CustomEvent(BROWSER_PANE_ACTION_EVENT, { detail }));
}

export function registerBrowserPaneEventTarget(paneId: string): () => void {
  activeBrowserPaneTargets.set(paneId, (activeBrowserPaneTargets.get(paneId) ?? 0) + 1);
  const actions = pendingBrowserPaneActions.get(paneId) ?? [];
  pendingBrowserPaneActions.delete(paneId);
  for (const detail of actions) {
    window.dispatchEvent(new CustomEvent(BROWSER_PANE_ACTION_EVENT, { detail }));
  }

  return () => {
    const remainingTargets = (activeBrowserPaneTargets.get(paneId) ?? 1) - 1;
    if (remainingTargets > 0) activeBrowserPaneTargets.set(paneId, remainingTargets);
    else activeBrowserPaneTargets.delete(paneId);
  };
}

export function parseBrowserPaneActionDetail(detail: unknown): BrowserPaneActionDetail | null {
  if (typeof detail !== "object" || detail === null) return null;
  const maybeDetail = detail as { paneId?: unknown; action?: unknown; roomId?: unknown; profileId?: unknown; signIn?: unknown };
  if (
    typeof maybeDetail.paneId !== "string" ||
    (maybeDetail.action !== "bookmarks" && maybeDetail.action !== "import" && maybeDetail.action !== "handoff" && maybeDetail.action !== "release" && maybeDetail.action !== "reload"
      && maybeDetail.action !== "account")
  ) return null;
  if (maybeDetail.roomId !== undefined && typeof maybeDetail.roomId !== "string") return null;
  if (maybeDetail.action === "account" && typeof maybeDetail.profileId !== "string") return null;
  return {
    paneId: maybeDetail.paneId,
    action: maybeDetail.action,
    ...(maybeDetail.roomId ? { roomId: maybeDetail.roomId } : {}),
    ...(maybeDetail.action === "account" ? { profileId: maybeDetail.profileId as string, signIn: maybeDetail.signIn === true } : {})
  };
}

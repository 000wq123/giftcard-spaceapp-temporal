/** Job Copilot activity pushed by the server event stream (type JOB_APPLY_UPDATED), re-dispatched per pane. */
export const JOB_APPLY_LIVE_EVENT = "space:job-apply-updated";

export interface JobApplyLiveEventDetail {
  paneId: string;
  roomId: string | null;
  eventId: string;
  message: string;
  payload: Record<string, unknown>;
}

export function dispatchJobApplyLiveEvent(detail: JobApplyLiveEventDetail): void {
  window.dispatchEvent(new CustomEvent<JobApplyLiveEventDetail>(JOB_APPLY_LIVE_EVENT, { detail }));
}

/** Calls `listener` for this pane's live events; returns the unsubscribe function. */
export function subscribeJobApplyLiveEvents(paneId: string, listener: (detail: JobApplyLiveEventDetail) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<JobApplyLiveEventDetail>).detail;
    if (detail && detail.paneId === paneId) listener(detail);
  };
  window.addEventListener(JOB_APPLY_LIVE_EVENT, handler);
  return () => window.removeEventListener(JOB_APPLY_LIVE_EVENT, handler);
}

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppNotices } from "../src/features/app-notices/useAppNotices.js";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("app notice lifecycle", () => {
  it("releases the pending live-debug timer on unmount", () => {
    const { result, unmount } = renderHook(() => useAppNotices());
    const initialTimers = vi.getTimerCount();
    act(() => {
      window.dispatchEvent(new CustomEvent("space-live-debug", {
        detail: { message: "Capture unavailable", type: "error" }
      }));
    });
    expect(result.current.liveDebugToast?.message).toBe("Capture unavailable");
    expect(vi.getTimerCount()).toBe(initialTimers + 1);

    unmount();
    expect(vi.getTimerCount(), "UNMOUNTED_NOTICE_TIMER_LEAK").toBe(initialTimers);
    act(() => {
      window.dispatchEvent(new CustomEvent("space-live-debug", {
        detail: { message: "After unmount", type: "error" }
      }));
      vi.advanceTimersByTime(4500);
    });
    expect(vi.getTimerCount()).toBe(initialTimers);
  });

  it("keeps a replacement error visible for its full dismissal interval", () => {
    const { result } = renderHook(() => useAppNotices());
    act(() => result.current.showLiveDebug("First error", "error"));
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.showLiveDebug("Second error", "error"));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.liveDebugToast?.message).toBe("Second error");
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.liveDebugToast).toBeNull();
  });
});

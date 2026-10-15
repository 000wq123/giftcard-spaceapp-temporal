import {
  streamingMetricDefinitions,
  type StreamingCatalogResponse,
  type StreamingOverlaySettings,
  type StreamingOverlaySnapshot
} from "@space/contracts";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingDock } from "../src/features/streaming/StreamingDock.js";
import { DockActiveContext } from "../src/features/docks/dock-active-context.js";
import {
  STREAMING_OVERLAY_SESSION_KEY,
  StreamingOverlayProvider
} from "../src/features/streaming/StreamingOverlay.js";
import { liveRuntime } from "../src/live/live-runtime.js";
import { installSpaceRuntime, SpaceApiError, type SpaceApiClient } from "../src/runtime/SpaceRuntime.js";

const settings: StreamingOverlaySettings = {
  version: 3,
  tiles: [
    { metricKey: "space.rooms", accountId: null },
    { metricKey: "space.active_agents", accountId: null },
    { metricKey: "space.active_cli_sessions", accountId: null }
  ],
  customTextEnabled: false,
  customText: "",
  updatedAt: "2026-08-11T12:00:00.000Z",
  updatedBy: "user:admin"
};

const catalog: StreamingCatalogResponse = {
  providers: (["YOUTUBE", "TWITCH", "TIKTOK", "X", "DISCORD"] as const).map((provider) => ({
    provider,
    status: provider === "YOUTUBE" ? "READY" : "UNCONFIGURED",
    clientFilePresent: provider === "YOUTUBE",
    clientFileSecure: provider === "YOUTUBE",
    code: provider === "YOUTUBE" ? "READY" : "CLIENT_FILE_MISSING",
    message: provider === "YOUTUBE" ? "YouTube is ready." : `${provider} client credentials are not configured.`,
    scopes: []
  })),
  metrics: streamingMetricDefinitions.map((metric) => ({ ...metric })),
  authorizations: [{
    id: "streaming_authorization:youtube",
    provider: "YOUTUBE",
    status: "ACTIVE",
    scopes: ["youtube.readonly"],
    accountCount: 1,
    lastRefreshedAt: "2026-08-11T12:00:00.000Z",
    safeErrorCode: null,
    safeErrorMessage: null,
    createdAt: "2026-08-11T12:00:00.000Z",
    updatedAt: "2026-08-11T12:00:00.000Z"
  }],
  accounts: [{
    id: "streaming_account:youtube",
    authorizationId: "streaming_authorization:youtube",
    provider: "YOUTUBE",
    externalAccountId: "channel-1",
    displayName: "Channel One",
    badge: "@channel-one",
    status: "ACTIVE",
    analyticsPeriod: 28,
    verifiedAt: "2026-08-11T12:00:00.000Z",
    safeErrorCode: null,
    safeErrorMessage: null,
    createdAt: "2026-08-11T12:00:00.000Z",
    updatedAt: "2026-08-11T12:00:00.000Z"
  }],
  settings
};

const snapshot: StreamingOverlaySnapshot = {
  generatedAt: "2026-08-11T12:00:00.000Z",
  settingsVersion: 3,
  tiles: settings.tiles.map((tile, index) => ({
    ...tile,
    provider: "SPACE" as const,
    label: ["Rooms", "Active agents", "Active CLI sessions"][index]!,
    badge: "Space",
    value: index + 1,
    state: "FRESH" as const,
    sampledAt: "2026-08-11T12:00:00.000Z"
  })),
  customTextEnabled: false,
  customText: "",
  botTickerEnabled: false,
  botTicker: []
};

function renderDock(apiOverrides: Partial<SpaceApiClient> = {}) {
  const api = {
    streamingCatalog: vi.fn(async () => structuredClone(catalog)),
    streamingOverlaySnapshot: vi.fn(async () => structuredClone(snapshot)),
    updateStreamingOverlaySettings: vi.fn(async (input) => ({
      ...settings,
      version: settings.version + 1,
      tiles: input.tiles,
      customTextEnabled: input.customTextEnabled,
      customText: input.customText
    })),
    startStreamingOAuth: vi.fn(),
    verifyStreamingAccount: vi.fn(async () => ({ account: catalog.accounts[0]! })),
    removeStreamingAccount: vi.fn(async () => ({ account: catalog.accounts[0]! })),
    disconnectStreamingAuthorization: vi.fn(async () => ({ authorizationId: catalog.authorizations[0]!.id, status: "REVOKED" as const, disconnected: true })),
    ...apiOverrides
  } as unknown as SpaceApiClient;
  installSpaceRuntime({ ...liveRuntime, api });
  const result = render(
    <StreamingOverlayProvider active>
      <StreamingDock />
    </StreamingOverlayProvider>
  );
  return { ...result, api };
}

describe("StreamingDock", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps provider accounts opt-in, enforces 64 tiles, and exposes safe readiness details", async () => {
    renderDock();
    const controls = await screen.findByLabelText("Streaming controls");
    expect(controls.classList.contains("streaming-dock")).toBe(true);
    expect(within(controls).getAllByRole("tablist", { name: "Streaming dock sections" })).toHaveLength(1);
    for (const section of ["Overview", "Bot", "Memory", "Moderation", "Display", "Activity"]) {
      expect(screen.getByRole("tab", { name: section })).toBeTruthy();
    }
    expect(within(controls).getAllByText("Client credentials file is missing")).toHaveLength(4);
    expect(within(controls).queryByText("CLIENT_FILE_MISSING")).toBeNull();
    expect(within(controls).getAllByText("Not configured")).toHaveLength(4);
    expect(within(controls).queryByText("UNCONFIGURED")).toBeNull();
    expect(within(controls).getByText("3/64")).toBeTruthy();

    // Providers start collapsed by default
    expect(screen.queryByRole("switch", { name: "Subscribers" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Toggle YouTube" }));

    expect(screen.queryByRole("switch", { name: "Subscribers" })).toBeTruthy();
    expect((screen.getByRole("switch", { name: "Subscribers" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("switch", { name: "Rooms" }) as HTMLInputElement).checked).toBe(true);

    const accountMetrics = screen.getByRole("group", { name: "Metrics for Channel One" });
    const switches = within(accountMetrics).getAllByRole("switch");
    for (const toggle of switches.slice(0, 9)) fireEvent.click(toggle);
    expect(screen.getByText("12/64")).toBeTruthy();
  });

  it("supports native drag ordering, accessible move buttons, per-tile periods, preview, and explicit save", async () => {
    const { api } = renderDock();
    await screen.findByLabelText("Streaming controls");
    fireEvent.click(screen.getByRole("button", { name: "Toggle YouTube" }));
    fireEvent.click(screen.getByRole("switch", { name: "Period views" }));
    fireEvent.click(screen.getByRole("tab", { name: "Display" }));
    const order = screen.getByRole("list", { name: "Streaming overlay tile order" });
    let rows = within(order).getAllByRole("listitem");
    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[2]!);
    fireEvent.drop(rows[2]!);
    rows = within(order).getAllByRole("listitem");
    expect(within(rows[2]!).getByText("Rooms")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move Rooms earlier" }));
    rows = within(order).getAllByRole("listitem");
    expect(within(rows[1]!).getByText("Rooms")).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "Period" }), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("switch", { name: "Custom footer text" }));
    fireEvent.change(screen.getByLabelText("Streaming overlay custom text"), { target: { value: "Line one\nLine two\nLine three" } });
    expect((screen.getByLabelText("Streaming overlay custom text") as HTMLTextAreaElement).value).toBe("Line one\nLine two");

    fireEvent.click(screen.getByRole("switch", { name: "Draft preview" }));
    expect(await screen.findByLabelText("Streaming overlay draft preview")).toBeTruthy();
    await waitFor(() => expect(api.streamingOverlaySnapshot).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Save overlay" }));
    await waitFor(() => expect(api.updateStreamingOverlaySettings).toHaveBeenCalledTimes(1));
    expect(api.updateStreamingOverlaySettings).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 3,
      customTextEnabled: true,
      customText: "Line one\nLine two",
      tiles: expect.arrayContaining([expect.objectContaining({
        metricKey: "youtube.analytics.views",
        analyticsPeriod: 90
      })])
    }));
  });

  it("uses session-only activation and refreshes the catalog after an optimistic 409", async () => {
    const conflict = vi.fn(async () => {
      throw new SpaceApiError("Overlay settings changed.", { status: 409, code: "STREAMING_SETTINGS_VERSION_CONFLICT" });
    });
    const { api } = renderDock({ updateStreamingOverlaySettings: conflict as SpaceApiClient["updateStreamingOverlaySettings"] });
    await screen.findByLabelText("Streaming controls");
    fireEvent.click(screen.getByRole("tab", { name: "Display" }));

    fireEvent.click(screen.getByRole("switch", { name: "Overlay" }));
    expect(window.sessionStorage.getItem(STREAMING_OVERLAY_SESSION_KEY)).toBe("true");
    expect(window.localStorage.getItem(STREAMING_OVERLAY_SESSION_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save overlay" }));
    await waitFor(() => expect(api.streamingCatalog).toHaveBeenCalledTimes(2));
    expect(screen.getByText("A newer overlay version was loaded. Review it before saving again.")).toBeTruthy();
  });

  it("supports bulk selection of all metrics for accounts, space metrics, and all providers", async () => {
    renderDock();
    await screen.findByLabelText("Streaming controls");
    expect(screen.getByText("3/64")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Toggle YouTube" }));

    const channelOneGroup = screen.getByRole("group", { name: "Metrics for Channel One" });
    const channelOneSelectAll = within(channelOneGroup).getByRole("button", { name: "All metrics" });
    fireEvent.click(channelOneSelectAll);

    expect(within(channelOneGroup).getByRole("button", { name: "Deselect all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deselect all provider metrics" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Deselect all provider metrics" }));
    expect(screen.getByRole("button", { name: "All provider metrics" })).toBeTruthy();
    expect(within(channelOneGroup).getByRole("button", { name: "All metrics" })).toBeTruthy();
    expect(screen.getByText("3/64")).toBeTruthy();

    const spaceGroup = screen.getByRole("group", { name: "Metrics from this Space installation" });
    const spaceDeselect = within(spaceGroup).getByRole("button", { name: "Deselect all" });
    fireEvent.click(spaceDeselect);
    expect(screen.getByText("0/64")).toBeTruthy();
    expect(within(spaceGroup).getByRole("button", { name: "All metrics" })).toBeTruthy();

    fireEvent.click(within(spaceGroup).getByRole("button", { name: "All metrics" }));
    expect(screen.getByText("3/64")).toBeTruthy();
    expect(within(spaceGroup).getByRole("button", { name: "Deselect all" })).toBeTruthy();
  });

  it("starts with providers collapsed by default and allows expanding each individually", async () => {
    renderDock();
    await screen.findByLabelText("Streaming controls");

    // All provider cards start collapsed
    const youtubeToggle = screen.getByRole("button", { name: "Toggle YouTube" });
    const twitchToggle = screen.getByRole("button", { name: "Toggle Twitch" });
    expect(youtubeToggle.getAttribute("aria-expanded")).toBe("false");
    expect(twitchToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Metrics for Channel One" })).toBeNull();

    // Open YouTube
    fireEvent.click(youtubeToggle);
    expect(youtubeToggle.getAttribute("aria-expanded")).toBe("true");
    expect(twitchToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("group", { name: "Metrics for Channel One" })).toBeTruthy();
    expect(screen.getByLabelText("Capabilities for Channel One")).toBeTruthy();

    // Close YouTube
    fireEvent.click(youtubeToggle);
    expect(youtubeToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Metrics for Channel One" })).toBeNull();

    // Open YouTube via the chevron button
    const youtubeChevron = screen.getByRole("button", { name: "Expand YouTube" });
    fireEvent.click(youtubeChevron);
    expect(youtubeToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group", { name: "Metrics for Channel One" })).toBeTruthy();
    expect(screen.getAllByText("ON").length).toBeGreaterThanOrEqual(1);

    // Close YouTube via the collapse chevron button
    const youtubeCollapseChevron = screen.getByRole("button", { name: "Collapse YouTube" });
    fireEvent.click(youtubeCollapseChevron);
    expect(youtubeToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("group", { name: "Metrics for Channel One" })).toBeNull();
  });

  it("copies provider login link to clipboard and disables copy when provider is unconfigured", async () => {
    let written = "";
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async (text: string) => {
          written = text;
        })
      }
    });

    const startOAuth = vi.fn(async (provider: string) => ({
      provider,
      authorizationUrl: `http://127.0.0.1:4911/api/admin/streaming/providers/${provider}/oauth/authorize?state=test-state`,
      expiresAt: "2026-08-11T12:10:00.000Z"
    }));

    renderDock({ startStreamingOAuth: startOAuth as any });
    await screen.findByLabelText("Streaming controls");

    const copyYouTubeBtn = screen.getByRole("button", { name: "Copy YouTube login link" });
    expect(copyYouTubeBtn).toBeTruthy();
    expect(copyYouTubeBtn.hasAttribute("disabled")).toBe(false);

    const copyTikTokBtn = screen.getByRole("button", { name: "Copy TikTok login link" });
    expect(copyTikTokBtn).toBeTruthy();
    expect(copyTikTokBtn.hasAttribute("disabled")).toBe(true);

    fireEvent.click(copyYouTubeBtn);
    await waitFor(() => expect(startOAuth).toHaveBeenCalledWith("YOUTUBE"));
    await waitFor(() => expect(screen.getByText("YouTube login link copied to clipboard.")).toBeTruthy());
    expect(written).toBe("http://127.0.0.1:4911/api/admin/streaming/providers/YOUTUBE/oauth/authorize?state=test-state");
  });
});

function renderDockWith(active: boolean, apiOverrides: Partial<SpaceApiClient> = {}) {
  const view = renderDock(apiOverrides);
  const ui = (visible: boolean) => (
    <DockActiveContext.Provider value={visible}>
      <StreamingOverlayProvider active>
        <StreamingDock />
      </StreamingOverlayProvider>
    </DockActiveContext.Provider>
  );
  view.rerender(ui(active));
  return { ...view, ui };
}

describe("StreamingDock on the dock kit", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exposes the sections as tabs with arrow-key navigation", async () => {
    renderDock();
    const tablist = await screen.findByRole("tablist", { name: "Streaming dock sections" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Overview", "Bot", "Memory", "Moderation", "Display", "Activity"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false", "false", "false"]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0]!.id);
    expect(tabs[0]!.getAttribute("aria-controls")).toBe(panel.id);

    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Bot" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Bot" }));

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: "Overview" }).id);
    expect(screen.queryByRole("heading", { name: "Streaming" })).toBeNull();
  });

  it("asks before removing an account or disconnecting an authorization", async () => {
    const nativeConfirm = vi.fn(() => true);
    vi.stubGlobal("confirm", nativeConfirm);
    const { api } = renderDock();
    await screen.findByLabelText("Streaming controls");
    fireEvent.click(screen.getByRole("button", { name: "Toggle YouTube" }));
    expect(screen.getByText("@channel-one · Active")).toBeTruthy();
    expect(screen.getByText("1 account · Active")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove account" }));
    const removeDialog = screen.getByRole("alertdialog", { name: "Remove Channel One?" });
    fireEvent.click(within(removeDialog).getByRole("button", { name: "Cancel" }));
    expect(api.removeStreamingAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove account" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Remove Channel One?" })).getByRole("button", { name: "Remove account" }));
    await waitFor(() => expect(api.removeStreamingAccount).toHaveBeenCalledWith("streaming_account:youtube"));
    expect(await screen.findByText("Channel One was removed.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect authorization" }));
    const disconnectDialog = screen.getByRole("alertdialog", { name: "Disconnect YouTube?" });
    fireEvent.click(within(disconnectDialog).getByRole("button", { name: "Cancel" }));
    expect(api.disconnectStreamingAuthorization).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect authorization" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Disconnect YouTube?" })).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(api.disconnectStreamingAuthorization).toHaveBeenCalledWith("streaming_authorization:youtube"));
    expect(nativeConfirm).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("asks before deleting a memory entry", async () => {
    const entry = {
      id: "streaming_memory:schedule",
      title: "Stream schedule",
      body: "Live every Friday at 20:00.",
      status: "APPROVED" as const,
      source: "OPERATOR" as const,
      version: 2,
      createdAt: "2026-08-11T12:00:00.000Z",
      updatedAt: "2026-08-11T12:00:00.000Z"
    };
    const deleteMemory = vi.fn(async () => ({ deleted: true }));
    renderDock({
      streamingBotMemory: vi.fn(async () => ({ entries: [entry] })) as unknown as SpaceApiClient["streamingBotMemory"],
      deleteStreamingBotMemory: deleteMemory as unknown as SpaceApiClient["deleteStreamingBotMemory"]
    });
    await screen.findByLabelText("Streaming controls");
    fireEvent.click(screen.getByRole("tab", { name: "Memory" }));
    expect(await screen.findByText("Stream schedule")).toBeTruthy();
    expect(screen.getByText("Approved", { selector: ".dock-kit-badge" })).toBeTruthy();
    expect(screen.getByText(/Added by you/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete Stream schedule" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Delete this memory?" })).getByRole("button", { name: "Cancel" }));
    expect(deleteMemory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete Stream schedule" }));
    fireEvent.click(within(screen.getByRole("alertdialog", { name: "Delete this memory?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteMemory).toHaveBeenCalledWith(entry.id));
    expect(await screen.findByText("Memory deleted.")).toBeTruthy();
  });

  it("points an empty overlay layout to the Overview tab", async () => {
    renderDock({
      streamingCatalog: vi.fn(async () => ({ ...structuredClone(catalog), settings: { ...settings, tiles: [] } })) as SpaceApiClient["streamingCatalog"]
    });
    await screen.findByLabelText("Streaming controls");
    fireEvent.click(screen.getByRole("tab", { name: "Display" }));
    expect(screen.getByText("No overlay tiles yet")).toBeTruthy();
    expect(screen.getByText("Turn on metrics in the Overview tab to build the overlay.")).toBeTruthy();
    expect(screen.queryByText(/Select metrics above/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to Overview" }));
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows one consistent save status from unsaved to saved", async () => {
    const { api } = renderDock();
    await screen.findByLabelText("Streaming controls");
    fireEvent.click(screen.getByRole("switch", { name: "Rooms" }));
    expect(screen.getByText("Unsaved overlay changes")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save now" })).toBeTruthy();
    expect(await screen.findByText("Overlay changes saved.")).toBeTruthy();
    expect(api.updateStreamingOverlaySettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Unsaved overlay changes")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("shows a retryable error state when the catalog cannot load", async () => {
    let attempts = 0;
    renderDock({
      streamingCatalog: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("Streaming service is offline.");
        return structuredClone(catalog);
      }) as SpaceApiClient["streamingCatalog"]
    });
    const failure = await screen.findByRole("alert");
    expect(failure.textContent).toContain("Streaming integrations could not be loaded");
    expect(failure.textContent).toContain("Streaming service is offline.");
    fireEvent.click(within(failure).getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Streaming controls")).toBeTruthy();
  });

  it("reloads on window focus only while visible and pauses the draft preview while hidden", async () => {
    const { api, rerender, ui } = renderDockWith(true);
    await screen.findByLabelText("Streaming controls");
    const catalogReads = () => (api.streamingCatalog as ReturnType<typeof vi.fn>).mock.calls.length;
    const snapshotReads = () => (api.streamingOverlaySnapshot as ReturnType<typeof vi.fn>).mock.calls.length;

    const visibleBefore = catalogReads();
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(catalogReads()).toBe(visibleBefore + 1));

    fireEvent.click(screen.getByRole("tab", { name: "Display" }));
    fireEvent.click(screen.getByRole("switch", { name: "Draft preview" }));
    await waitFor(() => expect(snapshotReads()).toBeGreaterThanOrEqual(1));

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    rerender(ui(false));
    const hiddenCatalog = catalogReads();
    const hiddenSnapshots = snapshotReads();
    act(() => { window.dispatchEvent(new Event("focus")); });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(catalogReads()).toBe(hiddenCatalog);
    expect(snapshotReads()).toBe(hiddenSnapshots);
    // The preview stays requested and resumes when the dock is visible again.
    expect((screen.getByRole("switch", { name: "Draft preview" }) as HTMLInputElement).checked).toBe(true);

    vi.useRealTimers();
    rerender(ui(true));
    await waitFor(() => expect(snapshotReads()).toBeGreaterThan(hiddenSnapshots));
    await waitFor(() => expect(catalogReads()).toBeGreaterThan(hiddenCatalog));
  });

  it("shows readable bot labels and a consistent save status in the Bot tab", async () => {
    const botSettings = {
      version: 4,
      enabled: false,
      persona: { name: "Live Assistant", tone: "Friendly" },
      platforms: { YOUTUBE: { enabled: false, accountId: null }, TWITCH: { enabled: false, accountId: null } },
      facts: [],
      faq: [],
      instructions: "",
      guardrails: { cooldownSeconds: 15, maxRepliesPerMinute: 5, replyToQuestionsOnly: true },
      modelSelection: null,
      fallbackModelSelection: null,
      memoryEnabled: true,
      moderationEnabled: false,
      jevEnabled: false,
      overlayTickerEnabled: false,
      updatedAt: "2026-08-11T12:00:00.000Z",
      updatedBy: null
    };
    const updateBot = vi.fn(async (input: Record<string, unknown>) => ({ ...botSettings, ...input, version: 5 }));
    renderDock({
      streamingBotSettings: vi.fn(async () => ({ settings: structuredClone(botSettings), memoryCount: 1 })) as unknown as SpaceApiClient["streamingBotSettings"],
      streamingBotStatus: vi.fn(async () => ({
        enabled: false,
        paused: true,
        llmConfigured: false,
        model: null,
        youtubeQuota: { day: "2026-08-11", unitsConsumed: 0, budget: 8000 },
        platforms: {
          YOUTUBE: { connected: true, live: false, chatId: null, lastPollAt: null, lastReplyAt: null, pendingCount: 0 },
          TWITCH: { connected: false, live: false, chatId: null, lastPollAt: null, lastReplyAt: null, pendingCount: 0 }
        }
      })) as unknown as SpaceApiClient["streamingBotStatus"],
      streamingBotModels: vi.fn(async () => ({ models: [] })) as unknown as SpaceApiClient["streamingBotModels"],
      updateStreamingBotSettings: updateBot as unknown as SpaceApiClient["updateStreamingBotSettings"]
    });
    await screen.findByLabelText("Streaming controls");
    fireEvent.click(screen.getByRole("tab", { name: "Bot" }));
    expect(await screen.findByRole("switch", { name: "Fast message screening" })).toBeTruthy();
    expect(screen.queryByText(/Jev/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add fact" }));
    expect(screen.getByText("Unsaved bot settings")).toBeTruthy();
    const factKey = screen.getByRole("textbox", { name: "Fact key 1" });
    factKey.focus();
    fireEvent.change(factKey, { target: { value: "Schedule" } });
    // The row keeps its input while typing, so focus stays in the field.
    expect(screen.getByRole("textbox", { name: "Fact key 1" })).toBe(factKey);

    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    expect(await screen.findByText("Bot settings saved.")).toBeTruthy();
    expect(updateBot).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 4, facts: [{ key: "Schedule", value: "" }] }));
    expect(screen.queryByText("Unsaved bot settings")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Remove fact 1" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Unsaved bot settings")).toBeTruthy();
  });
});

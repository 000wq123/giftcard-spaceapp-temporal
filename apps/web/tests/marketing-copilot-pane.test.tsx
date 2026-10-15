import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntime, MarketingCopilotPaneMetadata, MarketingPost, Pane } from "@space/contracts";
import { defaultMarketingCopilotPaneMetadata } from "@space/contracts";
import { MarketingCopilotPane, resolveActiveTab, tabsForLayout } from "../src/features/marketing-copilot-pane/MarketingCopilotPane.js";
import { MARKETING_COPILOT_KIND, copilotKindForMode } from "../src/features/copilot-kit/copilot-kind.js";
import { summarizeMetrics } from "../src/features/marketing-copilot-pane/AnalyticsTab.js";

const apiMock = vi.hoisted(() => ({
  marketingCopilotSettings: vi.fn(),
  updateMarketingCopilotSettings: vi.fn(),
  userSettings: vi.fn(),
  updateUserSettings: vi.fn(),
  cliRuntimes: vi.fn(),
  cliRuntimesSnapshot: vi.fn(),
  listCliAccountProfiles: vi.fn(),
  updatePane: vi.fn(),
  createCliSession: vi.fn(),
  activeCliSession: vi.fn(),
  marketingCopilotRun: vi.fn(),
  marketingCopilotRunAction: vi.fn(),
  marketingEvents: vi.fn(),
  marketingPosts: vi.fn(),
  marketingCampaigns: vi.fn(),
  createMarketingBrief: vi.fn(),
  decideMarketingPost: vi.fn(),
  marketingMemory: vi.fn(),
  createMarketingCampaign: vi.fn(),
  browserHandoff: vi.fn(),
  navigateBrowser: vi.fn()
}));
vi.mock("../src/api.js", () => ({ api: apiMock }));
vi.mock("../src/runtime/SpaceRuntime.js", () => ({ getSpaceRuntime: () => ({ platform: { localStorage: window.localStorage } }) }));

function runtime(id: string, displayName: string): AgentRuntime {
  return {
    id, providerId: id.slice(4), providerName: displayName, agentId: id.slice(4), agentName: displayName, displayName, capabilities: ["CLI"],
    adapterStatus: "ENABLED", authMode: "BROWSER_OAUTH", authState: "READY", authReason: "ok", canStartLogin: false,
    status: "ENABLED", statusReason: "Ready", commandName: null, detectedCommandPath: null, defaultModelId: null,
    supportedReasoningEfforts: [], checkedAt: "2026-10-14T08:00:00.000Z"
  } as AgentRuntime;
}
const registry = { data: [runtime("cli:opencode", "OpenCode CLI"), runtime("cli:claude", "Claude Code CLI")], checkedAt: "2026-10-14T08:00:00.000Z" };

const pane: Pane = {
  id: "pane:mkt000001", roomId: "room:mkt000001", title: "Marketing Copilot 1", titleSource: "auto", mode: "MARKETING_COPILOT", status: "IDLE",
  providerId: null, modelId: null, reasoningEffort: "medium", cwd: null, order: 0, columnSpan: 1, isMaximized: false, isMinimized: false,
  isClosed: false, split: { parentId: null, direction: null, size: null }, categoryColor: null, vncTarget: null, terminalRuntimeId: "cli:claude",
  createdAt: "2026-10-14T08:00:00.000Z", updatedAt: "2026-10-14T08:00:00.000Z"
} as Pane;

describe("MarketingCopilotPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    apiMock.marketingCopilotSettings.mockResolvedValue({ metadata: defaultMarketingCopilotPaneMetadata() });
    apiMock.updateMarketingCopilotSettings.mockImplementation(async (_paneId: string, next: MarketingCopilotPaneMetadata) => ({ metadata: next }));
    apiMock.userSettings.mockResolvedValue({ marketingCopilot: null });
    apiMock.cliRuntimes.mockResolvedValue(registry);
    apiMock.cliRuntimesSnapshot.mockReturnValue(registry);
    apiMock.listCliAccountProfiles.mockResolvedValue({ runtimeId: "cli:claude", profiles: [{ profileId: "main", displayName: "Main" }], gatewayProfile: null, defaultProfileId: "main" });
    apiMock.activeCliSession.mockResolvedValue({ session: { runtimeId: "cli:claude", accountProfileId: "main" } });
    apiMock.marketingCopilotRun.mockResolvedValue({ run: null, status: "IDLE", pending: [], backlog: 0 });
    apiMock.marketingCopilotRunAction.mockResolvedValue({ run: null, status: "RUNNING", pending: [], backlog: 1 });
    apiMock.marketingEvents.mockResolvedValue({ events: [] });
    apiMock.marketingPosts.mockResolvedValue({ posts: [] });
    apiMock.marketingCampaigns.mockResolvedValue({ campaigns: [] });
    apiMock.createMarketingBrief.mockResolvedValue({ brief: {} });
    apiMock.decideMarketingPost.mockResolvedValue({ post: {} });
    apiMock.marketingMemory.mockResolvedValue({ memories: [] });
    apiMock.browserHandoff.mockResolvedValue({ handoff: null });
    apiMock.createMarketingCampaign.mockResolvedValue({ campaign: {} });
    apiMock.navigateBrowser.mockResolvedValue({});
  });
  afterEach(() => cleanup());

  it("is a copilot kind of its own with the browser as a tab only when stacked", () => {
    expect(copilotKindForMode("MARKETING_COPILOT")).toBe(MARKETING_COPILOT_KIND);
    expect(tabsForLayout("split")).toEqual(["posts", "activity", "analytics", "memory", "setup", "terminal"]);
    expect(tabsForLayout("stacked")).toEqual(["browser", "posts", "activity", "analytics", "memory", "setup", "terminal"]);
    expect(resolveActiveTab("browser", "split")).toBe("posts");
  });

  it("hosts the browser and the terminal, shows the agent, autonomy and channels, and saves Paused", async () => {
    render(<MarketingCopilotPane pane={pane} isVisible terminal={<div data-testid="terminal">xterm</div>} browser={<div data-testid="browser">chrome</div>} />);
    await waitFor(() => expect(apiMock.marketingCopilotSettings).toHaveBeenCalledWith(pane.id));
    expect(screen.getByTestId("browser")).toBeTruthy();
    expect(screen.getByTestId("terminal")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copilot agent: Claude Code CLI/ })).toBeTruthy();
    expect(await screen.findByText("Idle · Assist")).toBeTruthy();
    expect(screen.getByText("9/9 channels")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("switch", { name: "Paused" })[0]!);
    await waitFor(() => expect(apiMock.updateMarketingCopilotSettings).toHaveBeenCalledWith(pane.id, expect.objectContaining({ settings: expect.objectContaining({ paused: true }) })));
  });

  it("lists every channel with its cap and limit and saves a channel switched off", async () => {
    render(<MarketingCopilotPane pane={pane} isVisible terminal={<div />} browser={<div />} />);
    fireEvent.click(await screen.findByRole("tab", { name: /Setup/ }));
    const list = await screen.findByRole("list", { name: "Channels" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(9);
    expect((screen.getByRole("combobox", { name: "Hacker News highest autonomy" }) as HTMLSelectElement).value).toBe("ASSIST");
    expect((screen.getByRole("spinbutton", { name: "X posts per period" }) as HTMLInputElement).value).toBe("3");
    fireEvent.click(within(list).getByRole("switch", { name: /^Reddit/ }));
    await waitFor(() => expect(apiMock.updateMarketingCopilotSettings).toHaveBeenCalledWith(pane.id, expect.objectContaining({
      settings: expect.objectContaining({ channels: expect.objectContaining({ REDDIT: expect.objectContaining({ enabled: false }), X: expect.objectContaining({ enabled: true }) }) })
    })));
    expect(await screen.findByText("Reddit saved.")).toBeTruthy();
    // Login once per channel in the pane's own browser.
    fireEvent.click(within(list).getByRole("button", { name: "Log in to X" }));
    await waitFor(() => expect(apiMock.navigateBrowser).toHaveBeenCalledWith(pane.id, "https://x.com/login"));
    expect(within(list).queryByRole("button", { name: "Log in to Blog" })).toBeNull();
  });

  it("covers the browser with the handoff card while the copilot waits for a login", async () => {
    apiMock.browserHandoff.mockResolvedValue({ handoff: { handoffRequestId: "handoff:1", status: "REQUESTED", reason: "X asks for a login before posting", requestedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600_000).toISOString(), acceptedAt: null } });
    render(<MarketingCopilotPane pane={pane} isVisible terminal={<div />} browser={<div data-testid="browser" />} />);
    const card = await screen.findByRole("alertdialog", { name: "The copilot needs you" });
    expect(within(card).getByText("X asks for a login before posting")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Take control" })).toBeTruthy();
  });

  it("sends briefs, starts the run and decides a post in review (approve, or approve the operator's edit)", async () => {
    const post = { id: "mktpost:abc123", ownerUserId: "user:operator", paneId: pane.id, campaignId: null, channel: "X", kind: "POST", target: null, title: null,
      body: "SpaceApp runs your AI coding CLIs side by side.", assets: [], status: "IN_REVIEW", scheduledAt: null, reviewNote: null, ruleId: null, publishedUrl: null, publishedAt: null,
      evidence: {}, metrics: {}, createdAt: "2026-10-14T08:00:00.000Z", updatedAt: "2026-10-14T08:00:00.000Z" } as MarketingPost;
    apiMock.marketingPosts.mockResolvedValue({ posts: [post] });
    render(<MarketingCopilotPane pane={pane} isVisible terminal={<div />} browser={<div />} />);
    const review = await screen.findByRole("region", { name: "Needs your review" });
    expect(within(review).getByText("47/280")).toBeTruthy();
    fireEvent.click(within(review).getByRole("button", { name: /^Approve$/ }));
    await waitFor(() => expect(apiMock.decideMarketingPost).toHaveBeenCalledWith(pane.id, post.id, { decision: "approve", scheduledAt: null }));
    fireEvent.change(within(review).getByRole("textbox", { name: "Post text" }), { target: { value: "I built SpaceApp: seamless agents." } });
    expect(within(review).getByRole("note").textContent).toContain("seamless");
    fireEvent.click(within(review).getByRole("button", { name: "Approve my version" }));
    await waitFor(() => expect(apiMock.decideMarketingPost).toHaveBeenLastCalledWith(pane.id, post.id, { decision: "edit", title: null, body: "I built SpaceApp: seamless agents.", scheduledAt: null }));
    // Send back needs a note.
    expect((within(review).getByRole("button", { name: /Send back/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Brief for the copilot" }), { target: { value: "A launch thread for 0.2.5" } });
    fireEvent.click(screen.getByRole("button", { name: /Ask/ }));
    await waitFor(() => expect(apiMock.createMarketingBrief).toHaveBeenCalledWith(pane.id, { text: "A launch thread for 0.2.5" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(apiMock.marketingCopilotRunAction).toHaveBeenCalledWith(pane.id, "start"));
  });
});

describe("copilot stream forwarding", () => {
  it("forwards each copilot's server events to its pane's window event and stops on cleanup", async () => {
    const { forwardCopilotStreamEvents } = await import("../src/features/copilot-kit/copilot-stream.js");
    const { subscribeMarketingCopilotLiveEvents } = await import("../src/features/marketing-copilot-pane/live-events.js");
    const { subscribeMailCopilotLiveEvents } = await import("../src/features/mail-copilot-pane/live-events.js");
    const source = new EventTarget();
    const marketing = vi.fn();
    const mail = vi.fn();
    const stopMarketing = subscribeMarketingCopilotLiveEvents(pane.id, marketing);
    const stopMail = subscribeMailCopilotLiveEvents(pane.id, mail);
    const stop = forwardCopilotStreamEvents(source as unknown as EventSource);
    const send = (type: string, paneId: string | null) => source.dispatchEvent(new MessageEvent(type, { data: JSON.stringify({ id: "event:1", roomId: pane.roomId, paneId, turnId: null, workflowId: null, traceId: "t", type, message: "Published", payload: { type: "PUBLISHED" }, createdAt: "2026-10-14T08:00:00.000Z" }) }));
    send("MARKETING_COPILOT_UPDATED", pane.id);
    send("MARKETING_COPILOT_UPDATED", null);
    expect(marketing).toHaveBeenCalledTimes(1);
    expect(marketing.mock.calls[0]![0]).toMatchObject({ paneId: pane.id, message: "Published", payload: { type: "PUBLISHED" } });
    expect(mail).not.toHaveBeenCalled();
    stop();
    send("MARKETING_COPILOT_UPDATED", pane.id);
    expect(marketing).toHaveBeenCalledTimes(1);
    stopMarketing(); stopMail();
  });
});

describe("marketing analytics", () => {
  it("summarizes each public number with its change over 7 and 30 days", () => {
    const rows = summarizeMetrics([
      { day: "2026-09-10", source: "GITHUB", key: "stars", value: 80 }, { day: "2026-10-07", source: "GITHUB", key: "stars", value: 100 },
      { day: "2026-10-14", source: "GITHUB", key: "stars", value: 107 }, { day: "2026-10-14", source: "NPM", key: "downloads_week", value: 210 }
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ source: "GITHUB", key: "stars", latest: 107, day: "2026-10-14", week: 7, month: 27 }),
      expect.objectContaining({ source: "NPM", key: "downloads_week", latest: 210, day: "2026-10-14", week: null, month: null })
    ]);
    expect(rows[0]!.trend.map((point) => point.value)).toEqual([80, 100, 107]);
  });
});

describe("marketing campaign templates", () => {
  beforeEach(() => {
    apiMock.marketingCopilotSettings.mockResolvedValue({ metadata: defaultMarketingCopilotPaneMetadata() });
    apiMock.marketingCopilotRun.mockResolvedValue({ run: null, status: "IDLE", pending: [], backlog: 0 });
    apiMock.marketingEvents.mockResolvedValue({ events: [] });
    apiMock.marketingPosts.mockResolvedValue({ posts: [] });
    apiMock.marketingCampaigns.mockResolvedValue({ campaigns: [] });
    apiMock.browserHandoff.mockResolvedValue({ handoff: null });
    apiMock.cliRuntimes.mockResolvedValue(registry);
    apiMock.cliRuntimesSnapshot.mockReturnValue(registry);
    apiMock.createMarketingCampaign.mockResolvedValue({ campaign: {} });
  });
  afterEach(() => cleanup());

  it("prefills a campaign from a template and starts it with the template's plan", async () => {
    render(<MarketingCopilotPane pane={pane} isVisible terminal={<div />} browser={<div />} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Campaign template" }), { target: { value: "release" } });
    expect((screen.getByRole("textbox", { name: "Campaign name" }) as HTMLInputElement).value).toBe("Release announcement");
    fireEvent.click(screen.getByRole("button", { name: "Start campaign" }));
    await waitFor(() => expect(apiMock.createMarketingCampaign).toHaveBeenCalledWith(pane.id, expect.objectContaining({ name: "Release announcement", templateId: "release" })));
  });
});

describe("marketing analytics tab", () => {
  it("shows stat tiles with the weekly change and a sparkline, and keeps a table view", async () => {
    const { AnalyticsTab } = await import("../src/features/marketing-copilot-pane/AnalyticsTab.js");
    (apiMock as Record<string, unknown>).marketingAnalytics = vi.fn(async () => ({ published: 0, topPosts: [], metrics: [
      { day: "2026-10-07", source: "GITHUB", key: "stars", value: 1200 }, { day: "2026-10-14", source: "GITHUB", key: "stars", value: 1284 },
      { day: "2026-10-07", source: "GITHUB", key: "open_issues", value: 3 }, { day: "2026-10-14", source: "GITHUB", key: "open_issues", value: 5 }
    ] }));
    render(<AnalyticsTab />);
    const tiles = within(await screen.findByRole("list", { name: "Public numbers" })).getAllByRole("listitem");
    expect(tiles[0]!.textContent).toContain("1.3K");
    expect(within(tiles[0]!).getByText("+84 in 7 days").className).toContain("up");
    // More open issues is not good news: the change stays neutral.
    expect(within(tiles[1]!).getByText("+2 in 7 days").className).toContain("flat");
    expect(within(tiles[0]!).getByRole("img", { name: "GitHub stars, last 2 days: 1200 to 1284" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Public numbers table" })).toBeTruthy();
  });
});

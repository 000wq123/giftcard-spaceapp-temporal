import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoFixture } from "../src/demo/demo-fixture.js";
import { SystemAnalyticsWorkspace } from "../src/features/system-analytics/SystemAnalyticsWorkspace.js";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  models: vi.fn(),
  resources: vi.fn(),
  processes: vi.fn(),
  sessions: vi.fn(),
  installs: vi.fn()
}));

vi.mock("../src/api.js", () => ({
  api: {
    systemAnalyticsOverview: mocks.overview,
    systemAnalyticsModels: mocks.models,
    systemAnalyticsResources: mocks.resources,
    systemAnalyticsProcesses: mocks.processes,
    systemAnalyticsCliSessions: mocks.sessions,
    systemAnalyticsInstalls: mocks.installs
  }
}));

const noInstalls = {
  available: false, updatedAt: null, installs: [],
  summary: { installs: 0, completed: 0, failed: 0, setupCompleted: 0, firstCli: 0, firstAnswer: 0, active7d: 0, internal: 0 }
};

describe("SystemAnalyticsWorkspace", () => {
  it("loads daily, weekly and monthly token totals in the Health usage view", async () => {
    render(<SystemAnalyticsWorkspace shellMode="desktop" initialTab="models" modelsOnly onClose={() => undefined} />);
    expect(await screen.findAllByText("gpt-5.6-sol")).toBeTruthy();
    expect(mocks.models).toHaveBeenCalledWith("24h");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("Tokens in / out / reasoning")).toBeTruthy();
    for (const [label, range] of [["7 days", "7d"], ["30 days", "30d"], ["1 day", "24h"]]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => expect(mocks.models).toHaveBeenLastCalledWith(range));
      expect(await screen.findAllByText("gpt-5.6-sol")).toBeTruthy();
    }
    expect(mocks.resources).not.toHaveBeenCalled();
  });

  it("sums models across providers, excludes duplicate reasoning, and updates the selected model across periods", async () => {
    const base = createDemoFixture().systemAnalyticsModels;
    const row = base.models[0];
    mocks.models.mockImplementation(async (range) => {
      const scale = range === "7d" ? 2 : 1;
      return { ...base, range, models: [
        { ...row, modelId: "shared-model", providerId: "provider-a", tokensIn: 100 * scale, tokensOut: 20 * scale, tokensReasoning: 10 * scale },
        { ...row, modelId: "shared-model", providerId: "provider-b", tokensIn: 200 * scale, tokensOut: 30 * scale, tokensReasoning: 15 * scale },
        { ...row, modelId: "other-model", providerId: "provider-a", tokensIn: 5 * scale, tokensOut: 5 * scale, tokensReasoning: 0 },
        { ...row, modelId: "unknown-model", providerId: "provider-a", tokensIn: null, tokensOut: null, tokensReasoning: null }
      ] };
    });
    render(<SystemAnalyticsWorkspace shellMode="desktop" initialTab="models" modelsOnly onClose={() => undefined} />);
    const totals = await screen.findByRole("region", { name: "Period token totals" });
    expect(within(totals).getByText("360")).toBeTruthy();
    const shared = screen.getByRole("button", { name: "View token usage for shared-model" });
    expect(within(shared).getByText("350 tokens")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "View token usage for unknown-model" })).getByText("— tokens")).toBeTruthy();
    fireEvent.click(shared);
    expect(screen.queryByRole("button", { name: "View token usage for other-model" })).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(await screen.findByText("700 tokens")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Period token totals" })).getByText("720")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All models" }));
    expect(screen.getByRole("button", { name: "View token usage for other-model" })).toBeTruthy();
  });

  it("refreshes only on explicit action and sorts every model column", async () => {
    render(<SystemAnalyticsWorkspace shellMode="desktop" initialTab="models" modelsOnly onClose={() => undefined} />);
    await screen.findByRole("button", { name: "Total tokens" });
    const calls = mocks.models.mock.calls.length;
    vi.useFakeTimers();
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(31000); document.dispatchEvent(new Event("visibilitychange")); });
      expect(mocks.models).toHaveBeenCalledTimes(calls);
    } finally { vi.useRealTimers(); }
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(mocks.models).toHaveBeenCalledTimes(calls + 1));
    for (const label of ["Provider / model", "Coverage", "Sessions / active", "Completed / aborted", "Total tokens", "Tokens in / out / reasoning", "TTFT", "Duration", "Tok/s", "Last activity"]) {
      const button = screen.getByRole("button", { name: label });
      fireEvent.click(button);
      expect(button.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
      fireEvent.click(button);
      expect(button.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    }
  });

  it("hides zero-token models and providers without changing period totals", async () => {
    const fixture = createDemoFixture().systemAnalyticsModels;
    const model = fixture.models[0]!;
    const provider = fixture.providers[0]!;
    mocks.models.mockImplementation(async range => ({ ...fixture, range,
      models: [
        { ...model, modelId: "used-model", tokensIn: 10, tokensOut: 2 },
        { ...model, modelId: "zero-model", tokensIn: 0, tokensOut: 0 }
      ],
      providers: [
        { ...provider, providerId: "used-provider", tokensIn: 10, tokensOut: 2 },
        { ...provider, providerId: "zero-provider", tokensIn: 0, tokensOut: 0 }
      ]
    }));
    render(<SystemAnalyticsWorkspace shellMode="desktop" initialTab="models" modelsOnly onClose={() => undefined} />);
    await screen.findByRole("button", { name: "View token usage for used-model" });
    expect(screen.queryByText("zero-model")).toBeNull();
    expect(screen.queryByText("zero-provider")).toBeNull();
    expect(within(screen.getByRole("region", { name: "Period token totals" })).getByText("12")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const fixture = createDemoFixture();
    mocks.overview.mockImplementation(async (range) => ({ ...fixture.systemAnalyticsOverview, range }));
    mocks.models.mockImplementation(async (range) => ({ ...fixture.systemAnalyticsModels, range }));
    mocks.resources.mockImplementation(async (range) => ({ ...fixture.systemAnalyticsResources, range }));
    mocks.processes.mockResolvedValue(fixture.systemAnalyticsProcesses);
    mocks.sessions.mockImplementation(async (range) => ({ ...fixture.systemAnalyticsCliSessions, range }));
    mocks.installs.mockResolvedValue(noInstalls);
  });

  it("opens the detailed CPU/RAM process view without selecting a room", async () => {
    const onClose = vi.fn();
    render(<SystemAnalyticsWorkspace shellMode="desktop" initialTab="resources" onClose={onClose} />);

    expect(await screen.findByText("All live OS processes")).toBeTruthy();
    expect(screen.getAllByText("OpenCode Diagnostics").length).toBeGreaterThan(0);
    expect(screen.getByText("postgres")).toBeTruthy();
    expect(mocks.resources).toHaveBeenCalledWith("10m");
    expect(mocks.processes).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 100, sort: "rss" }));

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    await waitFor(() => expect(mocks.resources).toHaveBeenCalledWith("7d"));
    fireEvent.click(screen.getByRole("button", { name: "Close system analytics" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders retained one-point CPU and RAM series as visible markers", async () => {
    const fixture = createDemoFixture();
    mocks.resources.mockResolvedValue({
      ...fixture.systemAnalyticsResources,
      range: "30d",
      series: fixture.systemAnalyticsResources.series.map((series) => ({
        ...series,
        points: series.points.slice(0, 1)
      }))
    });

    const { container } = render(<SystemAnalyticsWorkspace shellMode="desktop" initialTab="resources" onClose={() => undefined} />);

    expect(await screen.findByText("All live OS processes")).toBeTruthy();
    expect(container.querySelectorAll(".system-analytics-chart svg circle")).toHaveLength(3);
  });

  it("switches among global model and named CLI-session detail tabs", async () => {
    render(<SystemAnalyticsWorkspace shellMode="tablet" initialTab="models" onClose={() => undefined} />);

    const modelsTab = screen.getByRole("tab", { name: "Models" });
    expect(modelsTab.getAttribute("aria-selected")).toBe("true");
    expect(await screen.findAllByText("gpt-5.6-sol")).toBeTruthy();
    expect(screen.getAllByText("NATIVE").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "CLI Sessions" }));
    const sessionTable = await screen.findByText("Space CLI sessions");
    expect(within(sessionTable.closest("article")!).getAllByText("Codex CLI").length).toBeGreaterThan(0);
    expect(within(sessionTable.closest("article")!).getByText("OpenCode Diagnostics")).toBeTruthy();
    expect(mocks.sessions).toHaveBeenCalledWith("10m");
  });

  it("shows the Installs tab only where install pings exist, one row per installation", async () => {
    const { unmount } = render(<SystemAnalyticsWorkspace shellMode="desktop" initialTab="overview" onClose={() => undefined} />);
    await waitFor(() => expect(mocks.installs).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: "Installs" })).toBeNull();
    unmount();

    mocks.installs.mockResolvedValue({
      ...noInstalls, available: true, updatedAt: "2026-10-20T10:10:00Z",
      summary: { ...noInstalls.summary, installs: 1, completed: 1, setupCompleted: 1, firstCli: 1, active7d: 1 },
      installs: [{
        installId: "a1b2c3d4-0000-4000-8000-000000000001", linked: true, internal: false, firstSeenAt: "2026-10-20T10:00:00Z", lastSeenAt: "2026-10-20T10:09:00Z",
        status: "COMPLETED", failedStage: null, durationSeconds: 240, country: "GR", os: "windows", osVersion: "10.0.26100", arch: "x64",
        cpus: 8, ramGb: 16, profile: "light", access: "isolated", version: "1.1.5", screen: "1920x1080", dpr: "1.5", browser: "chrome 141",
        lang: "el-GR", firstCli: "opencode", setupCompletedAt: "2026-10-20T10:06:00Z", firstAnswerAt: null, lastActiveAt: "2026-10-20T10:07:00Z", activeDays: 1
      }, {
        installId: "lab-ping-0001", linked: false, internal: true, firstSeenAt: "2026-10-19T10:00:00Z", lastSeenAt: "2026-10-19T10:00:00Z",
        status: "COMPLETED", failedStage: null, durationSeconds: null, country: null, os: "macos", osVersion: null, arch: "x64",
        cpus: null, ramGb: null, profile: null, access: null, version: "1.1.4", screen: null, dpr: null, browser: null,
        lang: null, firstCli: null, setupCompletedAt: null, firstAnswerAt: null, lastActiveAt: null, activeDays: 0
      }]
    });
    render(<SystemAnalyticsWorkspace shellMode="desktop" initialTab="overview" onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Installs" }));
    const table = (await screen.findByText("Installations with telemetry on")).closest("article")!;
    for (const text of ["GR", "windows", "1920x1080", "COMPLETED", "Owner → CLI opencode", "1 day"]) expect(within(table).getByText(text)).toBeTruthy();
    expect(within(table).queryByText("macos")).toBeNull();
    fireEvent.click(within(table).getByRole("switch", { name: "Show test installs" }));
    expect(within(table).getByText("macos")).toBeTruthy();
  });
});

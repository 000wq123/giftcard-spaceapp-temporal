import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NousDecision, NousMessage, NousState } from "@space/contracts";
import { NousDock } from "../src/features/nous/NousDock.js";
import { liveRuntime } from "../src/live/live-runtime.js";
import { installSpaceRuntime } from "../src/runtime/SpaceRuntime.js";

const at = "2026-10-17T08:00:00.000Z";
const state = (patch: Partial<NousState> = {}): NousState => ({
  status: "IDLE", settings: { enabled: true, maxTurnsPerHour: 20, mayPromote: false, mayApproveWarm: false }, model: "claude-opus-5-5", effort: "xhigh", running: null,
  turnsThisHour: 2, lastError: null, openDecisions: 1, inbox: 0, ...patch
});
const message = (kind: NousMessage["kind"], content: string, id: string): NousMessage =>
  ({ id: `nous_msg:${id}`, ownerUserId: "user:operator", turnId: null, kind, status: "DONE", content, meta: {}, createdAt: at, updatedAt: at });
const decision: NousDecision = {
  id: "nous_decision:abcdef123456", ownerUserId: "user:operator", category: "RELEASE", title: "Release run-spaceapp 1.2.0 with three plans",
  body: "Every joined pane is done and merged on dev.", options: [], recommendation: "Approve: the tests passed.", refs: {},
  action: { type: "RELEASE_APPROVE", product: "run-spaceapp" }, status: "OPEN", answer: null, outcome: null, createdAt: at, answeredAt: null
};

const planDecision: NousDecision = {
  ...decision, id: "nous_decision:plan00000001", category: "DIRECTION", title: "Start the dock plan?", body: "", options: ["Start after the release"],
  recommendation: null, refs: { planId: "clipboard:planDock0001" }, action: null, createdAt: "2026-10-17T08:00:01.000Z"
};
const plan = (id: string, title: string, patch: Record<string, unknown> = {}) => ({
  id, text: `# ${title}\n\nThe whole **plan text**.`, source: "PLAN", title, minimumModel: null, isCompleted: false, executionStatus: "IN_PROGRESS",
  progressPercentage: 50, activeAgent: null, lastProgressAt: null, roomId: null, paneId: null, paneTitle: null, occurrenceCount: 1, characterCount: 40,
  createdAt: at, lastUsedAt: at, steps: [
    { id: "s1", order: 1, title: "Plan card", status: "COMPLETED", progress: 100, agent: null, notes: null, proof: null, startedAt: null, completedAt: null },
    { id: "s2", order: 2, title: "Fullscreen view", status: "IN_PROGRESS", progress: 10, agent: null, notes: null, proof: null, startedAt: null, completedAt: null }
  ], ...patch
});

function serve(overrides: { state?: NousState; messages?: NousMessage[]; decisions?: NousDecision[] } = {}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url === "/api/auth/csrf") return Response.json({ csrfToken: "csrf:nous", headerName: "x-space-csrf-token" });
    if (url === "/api/nous") return Response.json({ state: overrides.state ?? state() });
    if (url === "/api/nous/messages" && method === "GET") return Response.json({ messages: overrides.messages ?? [message("OPERATOR", "Τι τρέχει;", "a1b2c3d4"), message("ANSWER", "Όλα κινούνται.", "a1b2c3d5")] });
    if (url === "/api/nous/messages" && method === "POST") return Response.json({ message: message("OPERATOR", body.content, "a1b2c3d6") }, { status: 202 });
    if (url === "/api/nous/decisions") return Response.json({ decisions: overrides.decisions ?? [decision] });
    if (url.startsWith("/api/clipboard-items?")) return Response.json({
      data: [plan("clipboard:planDock0001", "Nous dock plans"), plan("clipboard:planNamed001", "Named plan", { executionStatus: "PLANNED", progressPercentage: 0 })],
      pagination: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 }
    });
    if (url === "/api/nous/overview") return Response.json({ overview: { plans: [{ id: "clipboard:plan01", title: "Nous", progress: 40, status: "IN_PROGRESS", room: "Main", pane: "Andy", nextStep: "3. Dock (PENDING)" }], needsHands: [], trains: "No release trains.", planMap: "Nous blocks the release plan." } });
    if (url.endsWith("/answer")) return Response.json({ decision: { ...decision, status: "APPROVED", outcome: "Approved the run-spaceapp release train at its candidate commit." } });
    if (url === "/api/nous/settings") return Response.json({ settings: { enabled: body.enabled, maxTurnsPerHour: 20 } });
    return Response.json({});
  }));
  return calls;
}

beforeEach(() => installSpaceRuntime(liveRuntime));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Nous dock", () => {
  it("tells other roles that Nous is for administrators and operators", () => {
    render(<NousDock canRun={false} />);
    expect(screen.getByText("Nous is available to administrators and operators")).toBeTruthy();
  });

  it("shows the mind of SpaceApp with its fixed model and talks to it", async () => {
    const calls = serve();
    render(<NousDock canRun />);
    expect(await screen.findByText("Όλα κινούνται.")).toBeTruthy();
    expect(screen.getByText(/The mind of SpaceApp · Claude opus 5.5 · xhigh/i)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Nous, the mind of SpaceApp" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Message Nous"), { target: { value: "Φέρε όλα τα πλάνα στο 100%" } });
    fireEvent.keyDown(screen.getByLabelText("Message Nous"), { key: "Enter" });
    await waitFor(() => expect(calls.some((call) => call.url === "/api/nous/messages" && call.method === "POST" && (call.body as { content: string }).content === "Φέρε όλα τα πλάνα στο 100%")).toBe(true));
  });

  it("asks its open decisions in the conversation too", async () => {
    const calls = serve();
    render(<NousDock canRun />);
    const card = await screen.findByRole("article", { name: decision.title });
    fireEvent.click(within(card).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(calls.find((call) => call.url.endsWith("/answer"))?.body).toEqual({ answer: "DECLINE" }));
  });

  it("brings a critical decision with its recommendation and the action Space runs on approval", async () => {
    const calls = serve();
    render(<NousDock canRun />);
    fireEvent.click(await screen.findByRole("button", { name: /Decisions/ }));
    const card = screen.getByRole("article", { name: decision.title });
    expect(within(card).getByText("Release")).toBeTruthy();
    expect(within(card).getByText(/Approve: the tests passed\./)).toBeTruthy();
    expect(within(card).getByText(/approve the run-spaceapp release at its candidate commit/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.find((call) => call.url.endsWith("/answer"))?.body).toEqual({ answer: "APPROVE" }));
  });

  it("turns working on the operator's behalf on and shows the plans", async () => {
    const calls = serve({ state: state({ status: "OFF", settings: { enabled: false, maxTurnsPerHour: 20, mayPromote: false, mayApproveWarm: false } }) });
    render(<NousDock canRun />);
    fireEvent.click(await screen.findByRole("switch", { name: "Nous works on my behalf" }));
    await waitFor(() => expect(calls.find((call) => call.url === "/api/nous/settings")?.body).toEqual({ enabled: true }));
    fireEvent.click(screen.getByRole("switch", { name: "Nous may promote dev to stable" }));
    await waitFor(() => expect(calls.filter((call) => call.url === "/api/nous/settings").at(-1)?.body).toEqual({ mayPromote: true }));
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(await screen.findByRole("progressbar", { name: "Nous progress" })).toBeTruthy();
    expect(screen.getByText("Nous blocks the release plan.")).toBeTruthy();
  });

  it("maximizes to the whole window and leaves with Escape", async () => {
    serve();
    render(<NousDock canRun />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Nous fullscreen" }));
    expect(screen.getByRole("region", { name: "Nous" }).className).toContain("is-fullscreen");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("region", { name: "Nous" }).className).not.toContain("is-fullscreen"));
  });

  it("shows plan cards for a plan decision and a plan named in a reply, opens the plan fullscreen and answers there", async () => {
    const calls = serve({ decisions: [planDecision], messages: [message("ANSWER", "See clipboard:planNamed001 and clipboard:gone000001.", "a1b2c3d7")] });
    render(<NousDock canRun />);
    const question = await screen.findByRole("article", { name: "Start the dock plan?" });
    const asked = await within(question).findByRole("article", { name: "Plan: Nous dock plans" });
    expect(within(asked).getByText("50%")).toBeTruthy();
    expect(within(asked).getByText("in progress · next: 2. Fullscreen view")).toBeTruthy();
    expect(within(question).getByRole("button", { name: "Not now" })).toBeTruthy();
    expect(within(await screen.findByRole("article", { name: "Plan: Named plan" })).getByText("planned · next: 2. Fullscreen view")).toBeTruthy();
    expect(within(screen.getByRole("article", { name: "Plan: Plan not found" })).getByRole("button", { name: "Open the plan" })).toHaveProperty("disabled", true);
    expect(calls.find((call) => call.url.startsWith("/api/clipboard-items?"))?.url).toContain("source=PLAN");

    fireEvent.click(within(asked).getByRole("button", { name: "Open the plan" }));
    const view = screen.getByRole("region", { name: "Plan" });
    expect(screen.getByRole("region", { name: "Nous" }).className).toContain("is-fullscreen");
    expect(within(view).getByText("plan text").tagName).toBe("STRONG");
    const steps = within(view).getByRole("list", { name: "Steps" });
    expect(within(steps).getByText("completed")).toBeTruthy();
    expect(within(steps).getByText("in progress")).toBeTruthy();
    fireEvent.click(within(view).getByRole("button", { name: "Start after the release" }));
    await waitFor(() => expect(calls.find((call) => call.url === "/api/nous/decisions/nous_decision%3Aplan00000001/answer")?.body)
      .toEqual({ answer: "ANSWER", text: "Start after the release" }));

    fireEvent.click(within(view).getByRole("button", { name: "Close the plan" }));
    expect(screen.queryByRole("region", { name: "Plan" })).toBeNull();
    expect(screen.getByRole("region", { name: "Nous" }).className).not.toContain("is-fullscreen");
    fireEvent.click(within(screen.getByRole("article", { name: "Plan: Named plan" })).getByRole("button", { name: "Open the plan" }));
    expect(screen.getByRole("region", { name: "Plan" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Plan" })).toBeNull();
    expect(screen.getByRole("region", { name: "Nous" }).className).not.toContain("is-fullscreen");
  });

  it("shows every decision inline where Nous asked it, answers it through the decision route and keeps answered ones with their outcome", async () => {
    const answered: NousDecision = { ...decision, id: "nous_decision:done00000001", title: "Delete the old proof rooms?", category: "DESTRUCTIVE", action: null,
      status: "APPROVED", outcome: "Deleted 3 rooms.", createdAt: "2026-10-17T07:00:00.000Z", answeredAt: "2026-10-17T07:02:00.000Z" };
    const calls = serve({ decisions: [decision, answered], messages: [message("OPERATOR", "Τι τρέχει;", "a1b2c3d4"), { ...message("ANSWER", "Ρωτώ για το release.", "a1b2c3d9"), createdAt: "2026-10-17T08:05:00.000Z" }] });
    render(<NousDock canRun />);
    const card = await screen.findByRole("article", { name: decision.title });
    const order = [...document.querySelectorAll(".nous-messages > *")].map((node) => node.getAttribute("aria-label") ?? node.textContent);
    expect(order).toEqual(["Delete the old proof rooms?", "Τι τρέχει;", decision.title, "Ρωτώ για το release."]);
    expect(within(card).getByText(/Approve: the tests passed\./)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(calls.find((call) => call.url === "/api/nous/decisions/nous_decision%3Aabcdef123456/answer")?.body).toEqual({ answer: "DECLINE" }));
    const done = screen.getByRole("article", { name: "Delete the old proof rooms?" });
    expect(within(done).getByText(/^Approved \d\d:\d\d · Deleted 3 rooms\.$/)).toBeTruthy();
    expect(within(done).queryByRole("button")).toBeNull();
  });

  it("keeps a readable column in fullscreen for the conversation, decisions and overview", () => {
    const css = readFileSync(resolve(__dirname, "../src/features/nous/nous.css"), "utf8");
    const rule = /\.dock-panel\.nous-dock\.is-fullscreen :is\(([^)]*)\)\s*\{\s*padding-inline: max\(0\.5rem, calc\(\(100% - (\d+)ch\) \/ 2\)\);/.exec(css);
    expect(rule?.[1]).toContain(".nous-messages");
    expect(rule?.[1]).toContain(".nous-decisions");
    expect(rule?.[1]).toContain(".nous-overview");
    expect(rule?.[1]).toContain(".nous-plan-view");
    expect(Number(rule?.[2])).toBeGreaterThanOrEqual(72);
    expect(Number(rule?.[2])).toBeLessThanOrEqual(80);
  });
});

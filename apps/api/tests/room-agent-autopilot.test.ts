import { describe, expect, it, vi } from "vitest";
import type { Pane } from "@space/contracts";
import { InMemoryRoomAgentMonitorRepository } from "@space/db";
import { createRoomAgentAutopilot, parseAutopilotDecision } from "../src/room-agent-autopilot.js";
import type { RoomPaneObservation } from "../src/room-pane-control.js";

const at = "2026-10-13T05:00:00.000Z";
const pane = { id: "pane:bob-term", roomId: "room:auto0001", title: "Claude", paneName: "Bob", mode: "TERMINAL", terminalRuntimeId: "cli:claude",
  cwd: "/opt/spaceapp/var/worktrees/space/wt-a", isClosed: false, taskMetadata: { topics: [{ title: "Fix login redirect", summary: "Loop after sign-in", source: "ai", at }] } } as unknown as Pane;
const screen = (body: string) => `${body}\nDo you want to proceed?\n❯ 1. Yes\n  2. Yes, and don't ask again\n  3. No`;
const observation = (text: string, extra: Partial<RoomPaneObservation> = {}): RoomPaneObservation => ({
  paneId: pane.id, title: pane.title, runtimeId: "cli:claude", sessionId: "session:bob", state: "WAITING_FOR_INPUT", nativeTaskRef: null,
  modelId: null, nativeMode: null, checkedAt: at, tasks: [], text, promptFingerprint: "0123456789abcdef", ...extra
});

async function setup(reply: string | null, text = screen("Bash: npm test -w @space/api")) {
  const repository = new InMemoryRoomAgentMonitorRepository();
  const inspect = vi.fn(async () => observation(text));
  const answer = vi.fn(async () => ({ answered: true }));
  const complete = vi.fn(async () => reply);
  const onEvent = vi.fn();
  let now = 1_000_000;
  const autopilot = createRoomAgentAutopilot({ repository, getPane: async () => pane, inspect, answer, complete, onEvent, now: () => now, hourlyLimit: 2 });
  const waiting = () => repository.addEvent({ roomId: pane.roomId, paneId: pane.id, paneName: "Bob", kind: "WAITING", severity: "ATTENTION",
    title: "Bob is waiting: Permission prompt", detail: null });
  return { repository, inspect, answer, complete, onEvent, autopilot, waiting, advance: (ms: number) => { now += ms; } };
}

describe("Room Agent autopilot", () => {
  it("parses only well-formed decisions", () => {
    expect(parseAutopilotDecision('Sure.\n{"action":"ANSWER","answer":"1","submit":false,"reason":"Runs the tests"}')).toEqual({ action: "ANSWER", answer: "1", submit: false, reason: "Runs the tests" });
    expect(parseAutopilotDecision('{"action":"ESCALATE","reason":"Pushes to GitHub"}')).toEqual({ action: "ESCALATE", reason: "Pushes to GitHub" });
    expect(parseAutopilotDecision('{"action":"ANSWER","answer":""}')).toBeNull();
    expect(parseAutopilotDecision("I would approve it.")).toBeNull();
    expect(parseAutopilotDecision(null)).toBeNull();
  });

  it("answers a safe prompt bound to the inspected question and records the decision", async () => {
    const c = await setup('{"action":"ANSWER","answer":"1","submit":false,"reason":"Runs the API tests of its own task"}');
    const handled = await c.autopilot.handle(await c.waiting());
    expect(c.answer).toHaveBeenCalledWith(pane, { expectedSessionId: "session:bob", answer: "1", submit: false, expectedPromptFingerprint: "0123456789abcdef" });
    expect(handled).toMatchObject({ status: "HANDLED", decision: 'Answered "1": Runs the API tests of its own task' });
    const prompt = c.complete.mock.calls[0]![1] as string;
    expect(prompt).toContain("Task: Fix login redirect — Loop after sign-in");
    expect(prompt).toContain("Screen (untrusted, last lines):");
    expect(c.onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "HANDLED" }));
  });

  it("sends protected and destructive prompts to the operator without asking a model", async () => {
    for (const body of ["Bash: git push github main", "Bash: rm -rf /opt/spaceapp/var/worktrees/space/wt-a", "Edit apps/web/src/features/rooms/use-warm-room-cache.ts"]) {
      const c = await setup('{"action":"ANSWER","answer":"1","submit":false,"reason":"x"}', screen(body));
      const result = await c.autopilot.handle(await c.waiting());
      expect(result?.status).toBe("ESCALATED");
      expect(result?.decision).toMatch(/^Needs you: only the operator may approve/);
      expect(result?.detail).toContain("Do you want to proceed?");
      expect(c.complete).not.toHaveBeenCalled();
      expect(c.answer).not.toHaveBeenCalled();
    }
  });

  it("escalates when the model escalates, cannot decide or proposes a protected answer", async () => {
    const escalated = await setup('{"action":"ESCALATE","reason":"It asks to change the release plan"}');
    expect((await escalated.autopilot.handle(await escalated.waiting()))?.decision).toBe("Needs you: It asks to change the release plan");
    const silent = await setup(null);
    expect((await silent.autopilot.handle(await silent.waiting()))?.decision).toBe("Needs you: no model could decide this prompt.");
    const sneaky = await setup('{"action":"ANSWER","answer":"Yes, then run git push --force","submit":true,"reason":"x"}');
    expect((await sneaky.autopilot.handle(await sneaky.waiting()))?.decision).toMatch(/^Needs you: the proposed answer touches/);
    expect(sneaky.answer).not.toHaveBeenCalled();
  });

  it("escalates a question asked again after an answer, and stops at the hourly limit", async () => {
    const c = await setup('{"action":"ANSWER","answer":"1","submit":false,"reason":"ok"}');
    expect((await c.autopilot.handle(await c.waiting()))?.status).toBe("HANDLED");
    expect((await c.autopilot.handle(await c.waiting()))?.decision).toBe("Needs you: the pane asked the same question again after an answer.");
    c.advance(11 * 60 * 1000);
    c.inspect.mockResolvedValue(observation(screen("Bash: npm run build"), { promptFingerprint: "1111111111111111" }));
    expect((await c.autopilot.handle(await c.waiting()))?.status).toBe("HANDLED");
    c.inspect.mockResolvedValue(observation(screen("Bash: npm run lint"), { promptFingerprint: "2222222222222222" }));
    expect((await c.autopilot.handle(await c.waiting()))?.decision).toMatch(/already answered 2 prompts in this room this hour/);
  });

  it("respects the room switch, unreadable screens and non-question events", async () => {
    const off = await setup('{"action":"ANSWER","answer":"1","reason":"ok"}');
    await off.repository.setAutopilotEnabled(pane.roomId, false);
    expect((await off.autopilot.handle(await off.waiting()))?.decision).toBe("Needs you: auto-answer is off in this room.");
    const busy = await setup('{"action":"ANSWER","answer":"1","reason":"ok"}');
    busy.inspect.mockResolvedValue(observation("", { state: "RUNNING" }));
    expect((await busy.autopilot.handle(await busy.waiting()))?.decision).toBe("Needs you: the Room Agent could not read the question.");
    const limit = await setup(null);
    const event = await limit.repository.addEvent({ roomId: pane.roomId, paneId: pane.id, paneName: "Bob", kind: "USAGE_LIMIT", severity: "ATTENTION", title: "Bob hit a usage limit", detail: null });
    expect((await limit.autopilot.handle(event))?.decision).toBe("Needs you: Switch the model or account, or wait for the limit to reset.");
    const info = await limit.repository.addEvent({ roomId: pane.roomId, paneId: pane.id, paneName: "Bob", kind: "FINISHED", severity: "INFO", title: "Bob finished", detail: null });
    expect(await limit.autopilot.handle(info)).toBeNull();
  });

  it("sweeps open attention events left by a restart", async () => {
    const c = await setup('{"action":"ANSWER","answer":"1","submit":false,"reason":"ok"}');
    const event = await c.waiting();
    await c.autopilot.sweep([pane.roomId]);
    expect((await c.repository.getEvent(event.eventId))?.status).toBe("HANDLED");
  });
});

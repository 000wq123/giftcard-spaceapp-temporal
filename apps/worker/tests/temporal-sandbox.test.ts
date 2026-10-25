import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApplicationFailure, defaultPayloadConverter } from "@temporalio/common";
import { Context } from "@temporalio/activity";
import { bundleWorkflowCode, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { ROOM_AGENT_ENQUEUE_SIGNAL, ROOM_AGENT_STOP_SIGNAL, DOT_GOAL_SIGNAL, roomAgentSupervisorInputSchema } from "@space/contracts";
import { createHarness, frozenHistories, historiesDir, replayErrors } from "./temporal/harness.js";
import { continuationFixture } from "./room-continuation-fixture.js";
import { discardSupervisorTurn, finishSupervisorTurn, prepareBackgroundContinuation, supervisorTurnState } from "../src/room-background-continuation.js";

let h: Awaited<ReturnType<typeof createHarness>>;
beforeEach(async () => { h = await createHarness(); }, 60_000);
afterEach(async () => { try { await h?.cleanup(); } finally { await h?.close(); } }, 20_000);

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const turn = (id: string) => ({ roomId: "room:synthetic", paneId: "pane:synthetic", prompt: "Synthetic test task",
  artifactIds: [], agentRunId: `agent_run:${id}`, permissionMode: null, collaborationMode: "default", traceId: `trace:${id}` });
const item = (id: string) => ({ missionId: `mission:${id}`, turn: turn(id) });
const verified = { status: "COMPLETED", message: "Synthetic success", roomAgentOutcome: { status: "VERIFIED", executedActionCount: 1, statusReason: "Synthetic evidence" } };
const input = (extra = {}) => ({ roomId: "room:synthetic", pending: [], interrupted: [], processedCount: 0, monitoringMissionIds: [], ...extra });
const failed = () => ApplicationFailure.nonRetryable("Synthetic expected failure", "SYNTHETIC_FAILURE");

it("dummy turn retries a failed activity and returns the completion", async () => {
  let attempts = 0;
  const completed = { ...turn("dummy"), status: "COMPLETED", message: "Synthetic completion" };
  h.setStubs({ recordDummyTurnStarted: async () => { if (++attempts < 3) throw Error("Retry me"); }, recordDummyTurnCompleted: async () => completed });
  const handle = await h.start("dummyTurnWorkflow", turn("dummy"));
  expect(await handle.result()).toEqual(completed);
  expect(attempts).toBe(3);
  await h.capture("dummyTurnWorkflow", handle);
}, 30_000);

it.each([
  { providerId: "opencode", native: false, timeout: 40 * 60 },
  { providerId: "cli:claude", native: false, timeout: 30 * 60 },
  { providerId: "codex", native: false, timeout: 24 * 60 * 60 },
  { providerId: "codex", native: true, timeout: 36500 * 24 * 60 * 60 }
])("routes $providerId (native=$native) with its production timeout", async ({ providerId, native, timeout }) => {
  let attempts = 0;
  const run = async () => { if (providerId === "codex" && ++attempts < 2) throw Error("Retry turn"); return verified; };
  const openCode = vi.fn(run), cli = vi.fn(run), codex = vi.fn(run);
  h.setStubs({ runOpenCodeAgentTurn: openCode, runCliAgentTurn: cli, runCodexAppServerTurn: codex });
  const handle = await h.start("codexAppServerTurnWorkflow", { ...turn(providerId), providerId,
    ...(native ? { agentSessionId: "session:synthetic", agentAssistantMessageId: "message:synthetic" } : {}) });
  expect(await handle.result()).toEqual(verified);
  expect(providerId === "opencode" ? openCode : providerId === "cli:claude" ? cli : codex).toHaveBeenCalled();
  expect(providerId === "opencode" ? cli : openCode).not.toHaveBeenCalled();
  const history = await h.capture(native ? "turn-native" : providerId === "codex" ? "codexAppServerTurnWorkflow" : `turn-${providerId.replace(":", "-")}`, handle);
  const scheduled = history.events!.find(event => event.activityTaskScheduledEventAttributes)!.activityTaskScheduledEventAttributes!;
  expect(Number(scheduled.startToCloseTimeout!.seconds)).toBe(timeout);
  if (providerId === "codex") expect(attempts).toBe(2);
}, 30_000);

it("wakes a paused goal without waiting an hour", async () => {
  const entered = deferred();
  let steps = 0;
  h.setStubs({ dotGoalStep: async () => { if (++steps === 1) { entered.resolve(); return { state: "PAUSED", runId: null, goalStatus: "PAUSED" }; }
    return { state: "DONE", runId: null, goalStatus: "COMPLETED" }; } });
  const handle = await h.start("dotGoalWorkflow", { goalId: "goal:wake" });
  await entered.promise;
  await handle.signal(DOT_GOAL_SIGNAL);
  expect(await handle.result()).toEqual({ goalStatus: "COMPLETED" });
  expect(steps).toBe(2);
  const history = await h.capture("dotGoalWorkflow", handle);
  expect(history.events!.some(event => event.workflowExecutionSignaledEventAttributes)).toBe(true);
  expect(history.events!.some(event => event.timerFiredEventAttributes)).toBe(false);
});

it("skips real goal polling timers and observes a completed turn", async () => {
  let steps = 0;
  const observe = vi.fn(async () => ({ run: "COMPLETED", goalStatus: "ACTIVE" }));
  h.setStubs({ dotGoalStep: async () => ++steps === 1 ? { state: "STARTED", runId: "run:synthetic", goalStatus: "ACTIVE" } : { state: "DONE", runId: null, goalStatus: "COMPLETED" }, dotGoalObserve: observe });
  const before = await h.env.currentTimeMs();
  const handle = await h.start("dotGoalWorkflow", { goalId: "goal:timeout" });
  expect(await handle.result()).toEqual({ goalStatus: "COMPLETED" });
  expect(await h.env.currentTimeMs() - before).toBeGreaterThanOrEqual(15_000);
  expect(observe).toHaveBeenCalledExactlyOnceWith("goal:timeout", "run:synthetic");
  const history = await h.capture("dotGoalWorkflow-timeout", handle);
  const timer = history.events!.find(event => event.timerStartedEventAttributes)!.timerStartedEventAttributes!;
  expect(Number(timer.startToFireTimeout!.seconds)).toBe(15);
  expect(history.events!.some(event => event.timerFiredEventAttributes)).toBe(true);
});

it("continues an unfinished goal as new at the iteration limit", async () => {
  let steps = 0;
  h.setStubs({ dotGoalStep: async () => ++steps <= 300 ? { state: "WAITING", runId: null, goalStatus: "ACTIVE" } : { state: "DONE", runId: null, goalStatus: "COMPLETED" } });
  const handle = await h.start("dotGoalWorkflow", { goalId: "goal:carried" });
  await expect(handle.result()).rejects.toMatchObject({ name: "WorkflowExecutionContinuedAsNewError" });
  const history = await h.capture("dotGoalWorkflow-continue", handle);
  const continued = history.events!.find(event => event.workflowExecutionContinuedAsNewEventAttributes)!.workflowExecutionContinuedAsNewEventAttributes!;
  expect(defaultPayloadConverter.fromPayload(continued.input!.payloads![0]!)).toEqual({ goalId: "goal:carried" });
  expect(await h.env.client.workflow.getHandle(handle.workflowId).result()).toEqual({ goalStatus: "COMPLETED" });
}, 45_000);

it("persists background action failure after retries and uses the legacy action id", async () => {
  let attempts = 0;
  const persist = vi.fn(async () => undefined);
  h.setStubs({ runRoomAgentBackgroundAction: async () => { ++attempts; throw Error("Synthetic transport failure"); }, failRoomAgentBackgroundAction: persist });
  const handle = await h.start("roomAgentActionWorkflow", { bridge: { roomId: "room:synthetic", missionId: "mission:synthetic" }, traceId: "trace:synthetic" }, false, "space-room-action:action:legacy");
  await expect(handle.result()).rejects.toMatchObject({ name: "WorkflowFailedError" });
  expect(attempts).toBe(5);
  expect(persist).toHaveBeenCalledExactlyOnceWith({ roomId: "room:synthetic", missionId: "mission:synthetic", actionId: "action:legacy", cancelled: false });
  await h.capture("roomAgentActionWorkflow", handle);
}, 30_000);

it("memory maintenance survives auxiliary failures and executes consolidation as a child", async () => {
  const snapshot = { sourceHash: "synthetic-source", nodes: 0, edges: 0 };
  const refresh = vi.fn(async () => { throw failed(); });
  const reconcile = vi.fn(async () => { throw failed(); });
  let preparationAttempts = 0, snapshotAttempts = 0;
  const prepare = vi.fn(async () => { if (++preparationAttempts < 3) throw Error("Retry consolidation preparation"); return { changeSetId: "change:synthetic", run: { id: "audit:synthetic" } }; });
  const finalize = vi.fn(async () => ({ id: "audit:synthetic", status: "COMPLETED" }));
  let mutations = 0;
  h.setStubs({ refreshMemoryGraphSnapshot: async () => { if (++snapshotAttempts < 3) throw Error("Retry live snapshot"); return snapshot; }, refreshAllMonthsMemoryGraphSnapshot: refresh,
    reconcileStaleSpaceAgentSessions: reconcile, createScheduledMemoryAudit: async () => ({ id: "audit:synthetic", workflowId: "synthetic-consolidation-child" }),
    prepareMemoryConsolidation: prepare, executePersistedMemoryChangeSet: async () => { if (++mutations < 3) throw Error("Retry mutation"); return { status: "APPLIED" }; }, finalizeMemoryRepair: finalize });
  const handle = await h.start("memoryMaintenanceWorkflow", { traceId: "trace:memory" });
  expect(await handle.result()).toEqual(snapshot);
  expect(refresh).toHaveBeenCalledOnce(); expect(reconcile).toHaveBeenCalledOnce();
  expect(prepare).toHaveBeenCalledTimes(3);
  expect(prepare).toHaveBeenCalledWith({ runId: "audit:synthetic", traceId: "trace:memory" });
  expect(snapshotAttempts).toBe(3);
  expect(mutations).toBe(3); expect(finalize).toHaveBeenCalledOnce();
  await h.capture("memoryMaintenanceWorkflow", handle);
  await h.capture("memoryConsolidationWorkflow", h.env.client.workflow.getHandle("synthetic-consolidation-child"));
}, 30_000);

it("consolidation without a change set does not mutate", async () => {
  const run = { id: "audit:no-change", status: "COMPLETED" };
  const mutate = vi.fn();
  h.setStubs({ prepareMemoryConsolidation: async () => ({ changeSetId: null, run }), executePersistedMemoryChangeSet: mutate });
  const handle = await h.start("memoryConsolidationWorkflow", { runId: run.id, traceId: "trace:memory" });
  expect(await handle.result()).toEqual(run); expect(mutate).not.toHaveBeenCalled();
});

it("mutation retries activity errors and propagates terminal failure", async () => {
  let attempts = 0;
  h.setStubs({ executePersistedMemoryChangeSet: async () => { if (++attempts < 3) throw Error("Retry mutation"); return { status: "APPLIED" }; } });
  const handle = await h.start("memoryMutationWorkflow", { changeSetId: "change:standalone", traceId: "trace:mutation" });
  expect(await handle.result()).toEqual({ status: "APPLIED" }); expect(attempts).toBe(3);
  await h.capture("memoryMutationWorkflow", handle);
  h.setStubs({ executePersistedMemoryChangeSet: async () => { throw failed(); } });
  const failure = await h.start("memoryMutationWorkflow", { changeSetId: "change:failed", traceId: "trace:mutation" });
  await expect(failure.result()).rejects.toMatchObject({ name: "WorkflowFailedError" });
});

it.each([false, true])("supervisor (%s pre-patch) carries queued work through the 50-item rollover", async legacy => {
  const checked = deferred();
  const finished = legacy ? "markRoomAgentMissionFinished" : "finishRoomAgentSupervisorTurn";
  const check = legacy ? "markRoomAgentMissionStarted" : "checkRoomAgentSupervisorTurn";
  const calls = vi.fn(async () => undefined);
  h.setStubs({ [check]: async () => { checked.resolve(); return "RUN"; }, [finished]: calls, runCodexAppServerTurn: async () => verified });
  const first = item(`carry-${legacy}-1`), second = item(`carry-${legacy}-2`);
  const handle = await h.start("roomAgentSupervisorWorkflow", input({ pending: [first, second], processedCount: 49 }), legacy);
  await expect(handle.result()).rejects.toMatchObject({ name: "WorkflowExecutionContinuedAsNewError" });
  const history = await h.capture(legacy ? "roomAgentSupervisorWorkflow-pre-patch" : "roomAgentSupervisorWorkflow", handle);
  const attributes = history.events!.find(event => event.workflowExecutionContinuedAsNewEventAttributes)!.workflowExecutionContinuedAsNewEventAttributes!;
  const carried = defaultPayloadConverter.fromPayload(attributes.input!.payloads![0]!) as any;
  expect(carried.pending).toEqual([second]); expect(carried.processedCount).toBe(0); expect(carried.monitoringMissionIds).toEqual([]);
  // New runs use the current implementation, including when continuing old histories.
  await h.env.client.workflow.getHandle(handle.workflowId).terminate("Synthetic test cleanup");
  expect(calls).toHaveBeenCalled();
}, 30_000);

it.each([false, true])("supervisor (%s pre-patch) polls for 250 seconds and carries monitoring state", async legacy => {
  let polls = 0;
  h.setStubs({ settleRoomAgentBackgroundMission: async () => { ++polls; return false; }, prepareRoomAgentBackgroundContinuation: async () => { ++polls; return { state: "WAITING" }; } });
  const before = await h.env.currentTimeMs();
  const handle = await h.start("roomAgentSupervisorWorkflow", input({ monitoringMissionIds: ["mission:monitor"] }), legacy);
  await expect(handle.result()).rejects.toMatchObject({ name: "WorkflowExecutionContinuedAsNewError" });
  const history = await h.capture(`supervisor-polls-${legacy ? "legacy" : "current"}`, handle);
  const attributes = history.events!.find(event => event.workflowExecutionContinuedAsNewEventAttributes)!.workflowExecutionContinuedAsNewEventAttributes!;
  expect((defaultPayloadConverter.fromPayload(attributes.input!.payloads![0]!) as any).monitoringMissionIds).toEqual(["mission:monitor"]);
  expect(polls).toBeGreaterThanOrEqual(250); expect(await h.env.currentTimeMs() - before).toBeGreaterThanOrEqual(250_000);
  await h.env.client.workflow.getHandle(handle.workflowId).terminate("Synthetic test cleanup");
}, 45_000);

it.each([false, true])("supervisor (%s pre-patch) enqueues a mission and cancels its running child", async legacy => {
  const running = deferred(); const stopped = deferred();
  const persist = vi.fn(async () => { stopped.resolve(); });
  h.setStubs({ checkRoomAgentSupervisorTurn: async () => "RUN", markRoomAgentMissionStarted: async () => undefined,
    runCodexAppServerTurn: async () => {
      const context = Context.current();
      const heartbeat = setInterval(() => context.heartbeat(), 20);
      running.resolve();
      try { await context.cancelled; } finally { clearInterval(heartbeat); }
    },
    markRoomAgentMissionFinished: persist, finishRoomAgentSupervisorTurn: persist, discardRoomAgentSupervisorTurn: async () => undefined });
  const handle = await h.start("roomAgentSupervisorWorkflow", input(), legacy);
  const mission = item(`cancel-${legacy}`);
  await handle.signal(ROOM_AGENT_ENQUEUE_SIGNAL, mission);
  await running.promise;
  await handle.signal(ROOM_AGENT_STOP_SIGNAL, { missionId: mission.missionId, reason: "Synthetic stop" });
  await stopped.promise;
  expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: "INTERRUPTED", statusReason: "Synthetic stop" }));
  await handle.terminate("Synthetic test cleanup");
  await h.capture(`supervisor-cancel-${legacy ? "legacy" : "current"}`, handle);
}, 30_000);

function continuationDriver() {
  const c = continuationFixture();
  const finished = deferred();
  const prepared: any[] = [];
  const activities = {
    prepareRoomAgentBackgroundContinuation: vi.fn(async (value: any) => {
      const result = await prepareBackgroundContinuation(value, c.store);
      if (result.state === "READY") prepared.push(result.item);
      return result;
    }),
    checkRoomAgentSupervisorTurn: vi.fn((value: any) => supervisorTurnState(value, c.store)),
    discardRoomAgentSupervisorTurn: vi.fn(async ({ item, reason, errorCode }: any) => discardSupervisorTurn(item, reason, c.store, errorCode)),
    finishRoomAgentSupervisorTurn: vi.fn(async (value: any) => { await finishSupervisorTurn(value, c.store); finished.resolve(); }),
    runCodexAppServerTurn: vi.fn(async (value: any) => { c.store.updateSpaceAgentRun(value.agentRunId, { status: "COMPLETED" }); return verified; })
  };
  h.setStubs(activities);
  const workflowInput = roomAgentSupervisorInputSchema.parse({ roomId: c.room.id, monitoringMissionIds: [c.initial.mission.id] });
  return { ...c, activities, workflowInput, finished, prepared };
}

it("real sandbox executes allocation, send and verification in one durable mission", async () => {
  const c = continuationDriver();
  c.activities.runCodexAppServerTurn.mockImplementationOnce(async value => {
    expect(value.prompt).toContain("Open CLI and Chat, then send a story");
    c.store.createRoomAgentAction({ ...c.action, actionId: "action:send", idempotencyKey: "send-once", actionType: "SEND",
      evidence: { cli: "Story complete", chat: "Story complete" }, statusReason: "Both tasks completed." });
    c.store.updateSpaceAgentRun(value.agentRunId, { status: "COMPLETED" });
    return { ...verified, roomAgentOutcome: { ...verified.roomAgentOutcome, pendingActionIds: ["action:send"] } };
  });
  const handle = await h.start("roomAgentSupervisorWorkflow", c.workflowInput);
  const end = handle.result().catch(() => undefined);
  await c.finished.promise;
  expect(c.activities.runCodexAppServerTurn).toHaveBeenCalledTimes(2);
  expect(c.store.listRoomAgentActions(c.initial.mission.id).filter(action => action.actionType === "SEND")).toHaveLength(1);
  expect(c.store.getRoomAgentMission(c.room.id, c.initial.mission.id)?.status).toBe("COMPLETED");
  expect(c.activities.finishRoomAgentSupervisorTurn).toHaveBeenCalledOnce();
  await handle.terminate("Synthetic test cleanup"); await end;
  await h.capture("supervisor-allocation-send-verification", handle);
}, 30_000);

it.each([
  ["plain error", () => Error("Synthetic child failure"), "ROOM_AGENT_SUPERVISOR_FAILED"],
  ["timeout", () => Error("Synthetic heartbeat timeout"), "ROOM_AGENT_SUPERVISOR_TIMEOUT"],
  ["application failure", () => ApplicationFailure.nonRetryable("Synthetic turn timeout", "CODEX_APP_SERVER_TURN_TIMEOUT"), "CODEX_APP_SERVER_TURN_TIMEOUT"]
] as const)("real sandbox preserves %s as a failed turn with its cause code", async (kind, error, code) => {
  const c = continuationDriver();
  c.activities.runCodexAppServerTurn.mockImplementation(async () => {
    if (kind === "timeout") {
      // Expire the actual 15-second heartbeat deadline on the test server.
      // Throwing a TimeoutFailure in an activity would be an application error.
      await h.env.sleep("16 seconds");
      return verified;
    }
    throw error();
  });
  const handle = await h.start("roomAgentSupervisorWorkflow", c.workflowInput);
  const end = handle.result().catch(() => undefined);
  await c.finished.promise;
  const prepared = c.prepared[0];
  expect(c.store.getRoomAgentTurn(c.initial.mission.id, prepared.turn.agentRunId)?.run).toMatchObject({ status: "FAILED", errorCode: code });
  expect(c.store.getRoomAgentMission(c.room.id, c.initial.mission.id)?.status).toBe("FAILED");
  expect(c.activities.finishRoomAgentSupervisorTurn).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED", errorCode: code }));
  await handle.terminate("Synthetic test cleanup"); await end;
  await h.capture(`supervisor-failure-${code}`, handle);
}, 30_000);

it.each(["stop", "follow-up"])("real sandbox retires prepared work when %s arrives before the activity response", async kind => {
  const c = continuationDriver();
  const discarded = deferred();
  const originalDiscard = c.activities.discardRoomAgentSupervisorTurn.getMockImplementation()!;
  c.activities.discardRoomAgentSupervisorTurn.mockImplementation(async value => { await originalDiscard(value); discarded.resolve(); });
  let handle: Awaited<ReturnType<typeof h.start>>;
  c.activities.prepareRoomAgentBackgroundContinuation.mockImplementationOnce(async value => {
    const result = await prepareBackgroundContinuation(value, c.store);
    if (result.state === "READY") c.prepared.push(result.item);
    if (kind === "stop") {
      c.store.updateRoomAgentMission(c.initial.mission.id, { status: "INTERRUPTED" });
      await handle.signal(ROOM_AGENT_STOP_SIGNAL, { missionId: null, reason: "Synthetic stop" });
    } else {
      const followUp = c.enqueue("follow-up", "Only inspect the room.");
      await handle.signal(ROOM_AGENT_ENQUEUE_SIGNAL, followUp.queueItem);
    }
    return result;
  });
  handle = await h.start("roomAgentSupervisorWorkflow", c.workflowInput);
  const end = handle.result().catch(() => undefined);
  await discarded.promise;
  expect(c.store.getRoomAgentTurn(c.initial.mission.id, c.prepared[0].turn.agentRunId)?.run.status).toBe("INTERRUPTED");
  if (kind === "stop") expect(c.activities.runCodexAppServerTurn).not.toHaveBeenCalled();
  else {
    await c.finished.promise;
    expect(c.activities.runCodexAppServerTurn.mock.calls[0]![0].roomAgentOperatorRequest).toBe("Only inspect the room.");
  }
  await handle.terminate("Synthetic test cleanup"); await end;
  await h.capture(`supervisor-prepare-race-${kind}`, handle);
}, 30_000);

it("real sandbox carries a prepared continuation and starts it exactly once", async () => {
  const c = continuationDriver();
  const handle = await h.start("roomAgentSupervisorWorkflow", { ...c.workflowInput, processedCount: 50 });
  await expect(handle.result()).rejects.toMatchObject({ name: "WorkflowExecutionContinuedAsNewError" });
  const history = await h.capture("supervisor-prepared-rollover", handle);
  const attributes = history.events!.find(event => event.workflowExecutionContinuedAsNewEventAttributes)!.workflowExecutionContinuedAsNewEventAttributes!;
  const carried = roomAgentSupervisorInputSchema.parse(defaultPayloadConverter.fromPayload(attributes.input!.payloads![0]!));
  expect(carried.pending).toHaveLength(1);
  expect(history.events!.some(event => event.startChildWorkflowExecutionInitiatedEventAttributes)).toBe(false);
  const next = h.env.client.workflow.getHandle(handle.workflowId);
  const end = next.result().catch(() => undefined);
  await c.finished.promise;
  expect(c.activities.runCodexAppServerTurn).toHaveBeenCalledOnce();
  expect(c.store.getRoomAgentMission(c.room.id, c.initial.mission.id)?.status).toBe("COMPLETED");
  await next.terminate("Synthetic test cleanup"); await end;
}, 30_000);

it("real sandbox drains excess signals until the carried queue fits the schema", async () => {
  let flooded = false;
  let handle: Awaited<ReturnType<typeof h.start>>;
  const pending = (index: number) => ({ ...item(`bound-${index}`), missionId: "mission:carry-bound" });
  h.setStubs({ checkRoomAgentSupervisorTurn: async () => {
    if (!flooded) { flooded = true; for (let index = 1; index <= 105; index++) await handle.signal(ROOM_AGENT_ENQUEUE_SIGNAL, pending(index)); }
    return "SKIP";
  }, discardRoomAgentSupervisorTurn: async () => undefined });
  handle = await h.start("roomAgentSupervisorWorkflow", input({ pending: [pending(0)], processedCount: 49 }));
  await expect(handle.result()).rejects.toMatchObject({ name: "WorkflowExecutionContinuedAsNewError" });
  const history = await h.capture("supervisor-bounded-rollover", handle);
  const attributes = history.events!.find(event => event.workflowExecutionContinuedAsNewEventAttributes)!.workflowExecutionContinuedAsNewEventAttributes!;
  const carried = roomAgentSupervisorInputSchema.parse(defaultPayloadConverter.fromPayload(attributes.input!.payloads![0]!));
  expect(carried.pending).toEqual(Array.from({ length: 100 }, (_, index) => roomAgentSupervisorInputSchema.parse(input({ pending: [pending(index + 6)] })).pending[0]));
  expect(history.events!.filter(event => event.activityTaskScheduledEventAttributes?.activityType?.name === "checkRoomAgentSupervisorTurn")).toHaveLength(6);
  await h.env.client.workflow.getHandle(handle.workflowId).terminate("Synthetic test cleanup");
}, 30_000);

it("real pre-patch sandbox uses the boolean settle contract", async () => {
  const settled = deferred();
  const legacy = vi.fn(async () => { settled.resolve(); return true; });
  const current = vi.fn();
  h.setStubs({ settleRoomAgentBackgroundMission: legacy, prepareRoomAgentBackgroundContinuation: current });
  const handle = await h.start("roomAgentSupervisorWorkflow", input({ monitoringMissionIds: ["mission:legacy"] }), true);
  const end = handle.result().catch(() => undefined);
  await settled.promise;
  expect(legacy).toHaveBeenCalledOnce(); expect(current).not.toHaveBeenCalled();
  await handle.terminate("Synthetic test cleanup"); await end;
  await h.capture("supervisor-pre-patch-boolean", handle);
}, 30_000);

it("supervisor preserves interrupted work, pending work and monitors through rollover", async () => {
  h.setStubs({ discardRoomAgentSupervisorTurn: async () => undefined, finishRoomAgentSupervisorTurn: async () => undefined });
  const first = { item: item("interrupted-first"), reason: "Synthetic first stop" };
  const second = { item: item("interrupted-second"), reason: "Synthetic second stop" };
  const pending = item("still-pending");
  const handle = await h.start("roomAgentSupervisorWorkflow", input({ interrupted: [first, second], pending: [pending], monitoringMissionIds: ["mission:monitor"], processedCount: 49 }));
  await expect(handle.result()).rejects.toMatchObject({ name: "WorkflowExecutionContinuedAsNewError" });
  const history = await h.capture("supervisor-interrupted-rollover", handle);
  const attributes = history.events!.find(event => event.workflowExecutionContinuedAsNewEventAttributes)!.workflowExecutionContinuedAsNewEventAttributes!;
  const carried = roomAgentSupervisorInputSchema.parse(defaultPayloadConverter.fromPayload(attributes.input!.payloads![0]!));
  expect(carried).toEqual(roomAgentSupervisorInputSchema.parse(input({ interrupted: [second], pending: [pending], monitoringMissionIds: ["mission:monitor"] })));
  await h.env.client.workflow.getHandle(handle.workflowId).terminate("Synthetic test cleanup");
}, 30_000);

it("replays every frozen history against production workflows", async () => {
  expect(await replayErrors(h.current), `Frozen history replay failed in ${historiesDir}`).toEqual([]);
}, 30_000);

it("rejects an added timer with a determinism error naming the frozen history", async () => {
  const bundle = await bundleWorkflowCode({ workflowsPath: fileURLToPath(new URL("./temporal/extra-timer.ts", import.meta.url)) });
  const selected = async function* () { for await (const history of frozenHistories()) if (history.workflowId === "dotGoalWorkflow.json") yield history; };
  const failures = [];
  for await (const result of Worker.runReplayHistories({ workflowBundle: bundle }, selected())) if (result.error) failures.push(result);
  expect(failures).toHaveLength(1);
  expect(failures[0]!.workflowId).toBe("dotGoalWorkflow.json");
  expect(failures[0]!.error?.name).toBe("DeterminismViolationError");
}, 30_000);

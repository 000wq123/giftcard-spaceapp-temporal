import { fileURLToPath } from "node:url";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { bundleWorkflowCode, Worker, type WorkflowBundle } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { temporal } from "@temporalio/proto";
import { MEMORY_MUTATION_TASK_QUEUE } from "@space/contracts";

const here = dirname(fileURLToPath(import.meta.url));
export const historiesDir = resolve(here, "../fixtures/workflow-histories");
export const workflowsPath = resolve(here, "workflows.ts");
export const currentQueue = "synthetic-workflows";
export const legacyQueue = "synthetic-pre-patch";
export const maintenanceQueue = "space-memory-maintenance";
const activityNames = [
  "recordDummyTurnStarted", "recordDummyTurnCompleted", "runOpenCodeAgentTurn", "runCliAgentTurn", "runCodexAppServerTurn",
  "dotGoalStep", "dotGoalObserve", "markRoomAgentMissionStarted", "markRoomAgentMissionFinished", "markRoomAgentMissionContinued",
  "settleRoomAgentBackgroundMission", "checkRoomAgentSupervisorTurn", "discardRoomAgentSupervisorTurn",
  "finishRoomAgentSupervisorTurn", "prepareRoomAgentBackgroundContinuation", "runRoomAgentBackgroundAction", "failRoomAgentBackgroundAction",
  "refreshMemoryGraphSnapshot", "refreshAllMonthsMemoryGraphSnapshot", "reconcileStaleSpaceAgentSessions", "createScheduledMemoryAudit",
  "prepareMemoryConsolidation", "executePersistedMemoryChangeSet", "finalizeMemoryRepair"
] as const;
export type Stubs = Partial<Record<typeof activityNames[number], (...args: any[]) => any>>;

export async function createHarness() {
  const env = await TestWorkflowEnvironment.createTimeSkipping();
  let stubs: Stubs = {};
  const activities = Object.fromEntries(activityNames.map(name => [name, (...args: any[]) => {
    const stub = stubs[name];
    if (!stub) throw new Error(`Missing synthetic activity stub: ${name}`);
    return stub(...args);
  }]));
  const current = await bundleWorkflowCode({ workflowsPath });
  const legacy = await bundleWorkflowCode({ workflowsPath, webpackConfigHook(config) {
    config.module!.rules!.push({ test: /[\\/]src[\\/]workflows\.ts$/, enforce: "pre", use: [{ loader: resolve(here, "pre-patch-loader.cjs") }] });
    return config;
  } });
  const workers: Worker[] = [];
  try {
    for (const taskQueue of [currentQueue, legacyQueue, maintenanceQueue, MEMORY_MUTATION_TASK_QUEUE]) {
      workers.push(await Worker.create({ connection: env.nativeConnection, taskQueue,
        workflowBundle: taskQueue === legacyQueue ? legacy : current, activities,
        shutdownGraceTime: "1 second" }));
    }
  } catch (error) { await env.teardown(); throw error; }
  const running = workers.map(worker => worker.run());
  // Attach handlers immediately so a worker startup error cannot become an unhandled rejection.
  const finished = Promise.allSettled(running);
  let serial = 0;
  const executions = new Set<string>();
  return {
    env, current,
    setStubs(next: Stubs) { stubs = next; },
    async start(type: string, input: unknown, legacy = false, id?: string) {
      const started = await env.client.workflow.start(type, { taskQueue: legacy ? legacyQueue : currentQueue,
        workflowId: id ?? `synthetic-${type}-${++serial}`, args: [input] });
      executions.add(started.workflowId);
      return env.client.workflow.getHandle(started.workflowId, started.firstExecutionRunId, { followRuns: false });
    },
    async capture(name: string, handle: { fetchHistory(): Promise<temporal.api.history.v1.IHistory> }) {
      const history = await handle.fetchHistory();
      if (process.env.TEMPORAL_RECORD_HISTORIES === "1") {
        await mkdir(historiesDir, { recursive: true });
        const json = temporal.api.history.v1.History.toObject(temporal.api.history.v1.History.fromObject(history), {
          bytes: String, longs: String, enums: String
        });
        await writeFile(resolve(historiesDir, `${name}.json`), JSON.stringify(json, null, 2) + "\n");
      }
      return history;
    },
    async cleanup() {
      for (const workflowId of executions) {
        const handle = env.client.workflow.getHandle(workflowId);
        if ((await handle.describe()).status.name === "RUNNING") await handle.terminate("Synthetic test cleanup");
      }
      executions.clear();
    },
    async close() {
      for (const worker of workers) worker.shutdown();
      const results = await finished;
      await env.teardown();
      const rejected = results.find(result => result.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
    }
  };
}

export async function* frozenHistories() {
  const files = (await readdir(historiesDir)).filter(name => name.endsWith(".json")).sort();
  if (files.length < 9) throw new Error("Missing frozen Temporal histories; do not generate them during ordinary tests");
  for (const file of files) {
    // Restore longs, bytes, enums and timestamps before handing the history to
    // the SDK. Plain JSON objects cannot represent protobuf byte payloads.
    yield { workflowId: file, history: temporal.api.history.v1.History.fromObject(JSON.parse(await readFile(resolve(historiesDir, file), "utf8"))) };
  }
}

export async function replayErrors(bundle: WorkflowBundle) {
  const errors: Array<{ workflowId: string; error: Error }> = [];
  for await (const result of Worker.runReplayHistories({ workflowBundle: bundle }, frozenHistories())) {
    if (result.error) errors.push({ workflowId: result.workflowId, error: result.error });
  }
  return errors;
}

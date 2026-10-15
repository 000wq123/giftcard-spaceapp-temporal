import { describe, expect, it } from "vitest";
import { PostgresSpaceStore, type PgClientLike, type PgPoolLike } from "../src/index.js";

class RecordingPool implements PgPoolLike {
  readonly calls: Array<{ sql: string; values: unknown[] }> = [];

  async query<T>(sql: string, values: unknown[] = []) {
    this.calls.push({ sql, values });
    const now = new Date("2026-10-11T10:00:00.000Z");
    if (sql.includes("FROM events")) {
      return { rows: [{ id: "event:abcdef01", roomId: "room:abcdef01", paneId: "pane:abcdef01", turnId: "turn:abcdef01", workflowId: "workflow:abcdef01",
        traceId: values[0], type: "TURN_FAILED", message: "failed", payload: { reasonCode: "TIMEOUT" }, createdAt: now }] as T[], rowCount: 1 };
    }
    if (sql.includes("FROM audit_events")) {
      return { rows: [{ id: "audit:abcdef01", actorUserId: null, traceId: values[0], action: "turn.queue", targetType: "workflow",
        targetId: "workflow:abcdef01", metadata: {}, createdAt: now }] as T[], rowCount: 1 };
    }
    return { rows: [{ workflowId: "workflow:abcdef01", runId: null, type: "AGENT_TURN", taskQueue: "q", status: "FAILED", roomId: "room:abcdef01",
      paneId: "pane:abcdef01", traceId: values[0], startedAt: now, closedAt: now }] as T[], rowCount: 1 };
  }

  async connect(): Promise<PgClientLike> {
    return this;
  }
}

describe("PostgresSpaceStore.listTraceRecords", () => {
  it("runs bounded, parameterized lookups by trace id and maps every record kind", async () => {
    const pool = new RecordingPool();
    const store = new PostgresSpaceStore(pool);
    const records = await store.listTraceRecords("req:abcdefghijkl", { limit: 9_999, sinceDays: 0 });

    expect(records.events).toEqual([expect.objectContaining({ id: "event:abcdef01", traceId: "req:abcdefghijkl", type: "TURN_FAILED" })]);
    expect(records.auditEvents).toEqual([expect.objectContaining({ id: "audit:abcdef01", action: "turn.queue" })]);
    expect(records.workflows).toEqual([expect.objectContaining({ workflowId: "workflow:abcdef01", status: "FAILED" })]);
    for (const call of pool.calls) {
      expect(call.values[0]).toBe("req:abcdefghijkl");
      expect(call.sql).not.toContain("req:abcdefghijkl");
      expect(call.sql).toMatch(/trace_id = \$1/);
      expect(call.sql).toMatch(/LIMIT \$\d/);
    }
    const eventCall = pool.calls.find((call) => call.sql.includes("FROM events"))!;
    // Limits are clamped: 500 rows at most, default 14-day event window for invalid input.
    expect(eventCall.values).toEqual(["req:abcdefghijkl", 14, 500]);
    expect(eventCall.sql).toContain("created_at >= now() - make_interval(days => $2::int)");
  });
});

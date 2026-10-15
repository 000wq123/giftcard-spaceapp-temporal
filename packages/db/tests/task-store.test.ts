import { describe, expect, it } from "vitest";
import { PostgresSpaceStore, type PgClientLike, type PgPoolLike } from "../src/index.js";

interface QueryCall {
  sql: string;
  values: unknown[];
}

const taskRow = {
  id: "task:postgres",
  title: "Fallback task",
  objective: "fallback",
  status: "OPEN" as const,
  source: "MANUAL" as const,
  roomId: null,
  paneId: null,
  paneTitle: null,
  occurrenceCount: 1,
  characterCount: 8,
  createdAt: "2026-07-15T10:00:00.000Z",
  lastUsedAt: "2026-07-15T10:00:00.000Z"
};

class TaskPgPool implements PgPoolLike, PgClientLike {
  readonly calls: QueryCall[] = [];

  async connect(): Promise<PgClientLike> {
    return this;
  }

  release(): void {}

  async query<T = unknown>(sql: string, values: unknown[] = []) {
    this.calls.push({ sql, values });
    if (sql.includes("INSERT INTO task_items")) {
      return { rows: [taskRow as T], rowCount: 1 };
    }
    if (sql.includes("SELECT count(*) AS count") && sql.includes("FROM task_items")) {
      return { rows: [{ count: 1 } as T], rowCount: 1 };
    }
    if (sql.includes("DELETE FROM task_items") && sql.includes("RETURNING")) {
      return { rows: [taskRow as T], rowCount: 1 };
    }
    if (sql.includes("DELETE FROM task_items") && sql.includes("owner_user_id = $1") && !sql.includes("NOT IN")) {
      return { rows: [], rowCount: 3 };
    }
    if (sql.includes("UPDATE task_items") && sql.includes("RETURNING")) {
      return { rows: [taskRow as T], rowCount: 1 };
    }
    if (sql.includes("FROM task_items") && sql.includes("SELECT")) {
      return { rows: [taskRow as T], rowCount: 1 };
    }
    return { rows: [], rowCount: null };
  }
}

describe("PostgresSpaceStore task history", () => {
  it("upserts and prunes under one owner transaction without interpolating task objective", async () => {
    const pool = new TaskPgPool();
    const store = new PostgresSpaceStore(pool);

    await store.upsertTaskItem({
      ownerUserId: "user:one",
      title: "Fallback task",
      objective: "fallback",
      status: "OPEN",
      source: "MANUAL"
    });

    expect(pool.calls.map((call) => call.sql.trim().split(/\s+/).slice(0, 2).join(" "))).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      "INSERT INTO",
      "DELETE FROM",
      "COMMIT"
    ]);
    const insert = pool.calls.find((call) => call.sql.includes("INSERT INTO task_items"));
    expect(insert?.sql).toContain("ON CONFLICT (owner_user_id, content_hash)");
    expect(insert?.sql).not.toContain("fallback");
    expect(insert?.values).toContain("fallback");
    expect(insert?.values).toContain("OPEN");
    expect(insert?.values).toContain("MANUAL");
    expect(pool.calls.find((call) => call.sql.includes("NOT IN"))?.sql).toContain("LIMIT 100");
  });

  it("scopes list, get, update, delete, and clear queries to the authenticated owner", async () => {
    const pool = new TaskPgPool();
    const store = new PostgresSpaceStore(pool);

    expect(await store.listTaskItems("user:one", { q: "fall", status: "OPEN", page: 1, pageSize: 25 }))
      .toEqual({ items: [taskRow], total: 1 });
    expect(await store.getTaskItem("user:one", taskRow.id)).toEqual(taskRow);
    expect(await store.updateTaskItem("user:one", taskRow.id, { status: "DONE" })).toEqual(taskRow);
    expect(await store.deleteTaskItem("user:one", taskRow.id)).toEqual(taskRow);
    expect(await store.clearTaskItems("user:one")).toBe(3);

    const scopedCalls = pool.calls.filter((call) => call.sql.includes("task_items"));
    expect(scopedCalls.every((call) => call.sql.includes("owner_user_id"))).toBe(true);
    expect(scopedCalls.flatMap((call) => call.values)).not.toContain("user:two");
  });
});

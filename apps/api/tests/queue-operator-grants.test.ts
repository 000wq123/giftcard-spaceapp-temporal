import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { configureQueueOperatorGrants, allowPaneQueueCommand, queueOperatorOp, registerQueueOperatorGrantRoute, signQueueOperatorGrant } from "../src/queue-operator-grants.js";
// @ts-expect-error The queue's verifier is a plain ES module script.
import { verifyOperatorGrant } from "../../../scripts/space-queue-operator-grant.mjs";

const secret = "test-secret-with-enough-length";

describe("merge queue operator grants (hardening step 5)", () => {
  it("names the operator-only command a text asks for, never one it forbids", () => {
    expect(queueOperatorOp("npm run live:verify:dev && space-queue promote --wait")).toBe("promote");
    expect(queueOperatorOp("space-queue approve q-20261019-051103-9daf")).toBe("approve:q-20261019-051103-9daf");
    expect(queueOperatorOp("Finish the tests; never space-queue promote.")).toBeNull();
    expect(queueOperatorOp("space-queue submit --worktree . --wait")).toBeNull();
  });

  it("signs what the queue verifies, for exactly one command", () => {
    configureQueueOperatorGrants(secret);
    const grant = signQueueOperatorGrant("promote", "operator:settings-releases");
    expect(verifyOperatorGrant(grant, "promote", secret)).toMatchObject({ op: "promote", by: "operator:settings-releases" });
    expect(verifyOperatorGrant(grant, "approve:q-20261019-051103-9daf", secret)).toBeNull();
    expect(verifyOperatorGrant(grant, "promote", "another-secret-with-enough-length")).toBeNull();
  });

  it("gives a pane its held grant once, and nothing to another pane or another command", async () => {
    configureQueueOperatorGrants(secret);
    const app = Fastify();
    registerQueueOperatorGrantRoute(app, { routeOptions: {}, requireBridge: async (request) => ({ claims: { paneId: String(request.headers["x-pane"]), roomId: "room:main0001" } as never }) });
    const ask = (pane: string, op: string) => app.inject({ method: "POST", url: "/api/cli/queue-operator-grant", headers: { "x-pane": pane }, payload: { op } });
    expect((await ask("pane:andy0001", "promote")).statusCode).toBe(403);
    allowPaneQueueCommand("pane:andy0001", "space-queue promote --wait", "nous-allowance:promote");
    expect((await ask("pane:other001", "promote")).statusCode).toBe(403);
    expect((await ask("pane:andy0001", "default-target:stable")).statusCode).toBe(403);
    expect((await ask("pane:andy0001", "rm -rf /")).statusCode).toBe(400);
    const granted = await ask("pane:andy0001", "promote");
    expect(verifyOperatorGrant(granted.json().grant, "promote", secret)).toMatchObject({ by: "nous-allowance:promote" });
    expect((await ask("pane:andy0001", "promote")).statusCode).toBe(403);
    await app.close();
  });
});

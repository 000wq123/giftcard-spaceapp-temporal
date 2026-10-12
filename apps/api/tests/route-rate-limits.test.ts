import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { getApiConfig } from "../src/config.js";

// On loaded hosts (2026-10-11) parsing app.ts took up to 10 s, and starting
// and closing the whole API up to 15 s plus 11-38 s, so the default 5 s limit
// says nothing about correctness.
const SLOW_TEST_TIMEOUT_MS = 60_000;

const routeMethods = new Set(["delete", "get", "patch", "post", "put"]);
const namedRateLimitOptions = new Set([
  "defaultRouteRateLimitOptions",
  "defaultWebsocketRateLimitOptions"
]);

it("declares an explicit CodeQL-visible rate limit on every Fastify route", async () => {
  const appPath = fileURLToPath(new URL("../src/app.ts", import.meta.url));
  const sourceText = await readFile(appPath, "utf8");
  const source = ts.createSourceFile(appPath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const missing: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "app" &&
      routeMethods.has(node.expression.name.text)
    ) {
      const route = node.arguments[0]?.getText(source) ?? "<unknown>";
      const options = node.arguments[1];
      const hasRateLimit =
        node.arguments.length >= 3 &&
        Boolean(options) &&
        (
          options!.getText(source).includes("rateLimit") ||
          (ts.isIdentifier(options!) && namedRateLimitOptions.has(options!.text))
        );
      if (!hasRateLimit) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        missing.push(`${line}: ${route}`);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  expect(missing, `Routes without explicit rate limits:\n${missing.join("\n")}`).toEqual([]);
}, SLOW_TEST_TIMEOUT_MS);

it("registers the global limiter before request authentication and lifecycle hooks", async () => {
  const appPath = fileURLToPath(new URL("../src/app.ts", import.meta.url));
  const sourceText = await readFile(appPath, "utf8");
  const limiterRegistration = sourceText.indexOf("await app.register(rateLimit");

  expect(limiterRegistration).toBeGreaterThan(-1);
  for (const hook of [
    'app.addHook("onRequest"',
    'app.addHook("onResponse"',
    'app.addHook("onClose"',
    'app.addHook("onReady"',
    'app.addHook("preHandler"'
  ]) {
    expect(
      sourceText.indexOf(hook),
      `${hook} must remain behind the registered global limiter`
    ).toBeGreaterThan(limiterRegistration);
  }
});

it("enforces the configured default limit on routes without stricter overrides", async () => {
  const app = await createApp({
    config: {
      ...getApiConfig({}),
      apiRateLimitMax: 2
    },
    auth: {
      sessionSecret: "route-rate-limit-test-secret",
      devLogin: false,
      secureCookies: false
    }
  });

  try {
    const responses = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      responses.push(await app.inject({ method: "GET", url: "/healthz" }));
    }

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 429]);
    expect(responses.find((response) => response.statusCode === 429)?.json()).toMatchObject({
      error: {
        code: "RATE_LIMITED",
        requestId: expect.stringMatching(/^req:/)
      }
    });
  } finally {
    await app.close();
  }
}, SLOW_TEST_TIMEOUT_MS);

it("applies the global limiter to routes registered by domain modules", async () => {
  // Domain modules (files, databases, t3code, Space Control, memory graph,
  // worktrees, Harness) rely on the global limiter instead of per-route options.
  // Prove that it reaches each module: the third request inside the window is
  // rejected before authentication or the handler runs.
  const app = await createApp({
    config: {
      ...getApiConfig({}),
      apiRateLimitMax: 2
    },
    auth: {
      sessionSecret: "route-rate-limit-module-test-secret",
      devLogin: false,
      secureCookies: false
    }
  });
  try {
    await app.ready();
    const moduleRoutes = [
      "/api/files/list",
      "/api/databases/connections",
      "/api/t3code/sessions",
      "/api/control/v1/capabilities",
      "/api/admin/memory/graph/overview",
      "/api/worktrees",
      "/api/harness/healthz"
    ];
    const unlimited: string[] = [];
    for (const url of moduleRoutes) {
      expect(app.hasRoute({ method: "GET", url }), `${url} is registered`).toBe(true);
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        statuses.push((await app.inject({ method: "GET", url, remoteAddress: `198.51.100.${moduleRoutes.indexOf(url) + 1}` })).statusCode);
      }
      if (statuses[2] !== 429) unlimited.push(`${url}: ${statuses.join(",")}`);
    }
    expect(unlimited, `Module routes outside the global limiter:\n${unlimited.join("\n")}`).toEqual([]);
  } finally {
    await app.close();
  }
}, SLOW_TEST_TIMEOUT_MS);


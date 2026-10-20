import { readFileSync } from "node:fs";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { isOtherSiteBrowserRequest, requiresSameSiteBrowser } from "../src/http-origin-guard.js";

const tunnelOrigin = "https://127.0.0.1:14911";
const tunnelHost = "127.0.0.1:14911";
const templates = ["deploy/nginx/space-oll4.conf", "deploy/space-dev/nginx-space-dev.conf"];

// Model nginx's two Host variables, then the web proxy's unconditional overwrite
// of X-Forwarded-Host. Fastify resolves the final authority through trustProxy.
function forwardedHost(template: string, browserHost: string): string {
  const config = readFileSync(new URL(`../../../${template}`, import.meta.url), "utf8");
  const variable = config.match(/proxy_set_header Host (\$[a-z_]+);/)?.[1];
  expect(["$host", "$http_host"]).toContain(variable);
  return variable === "$http_host" ? browserHost : browserHost.split(":")[0]!;
}

describe.each(templates)("native VPN origin through %s", (template) => {
  it("accepts its own tunnel WebSocket and CSRF request without allowing another port or site", async () => {
    const app = Fastify({ trustProxy: ["127.0.0.1", "::1", "::ffff:127.0.0.1"] });
    app.addHook("preHandler", async (request, reply) => {
      if (requiresSameSiteBrowser(request, request.url) && isOtherSiteBrowserRequest(request, ["http://127.0.0.1:4911"])) {
        return reply.code(403).send({ error: "ORIGIN_REJECTED" });
      }
    });
    app.get("/api/panes/fixture/cli/terminal", async () => ({ allowed: true }));
    app.get("/api/auth/csrf", async () => ({ allowed: true }));
    try {
      const headers = {
        host: "127.0.0.1:4910",
        "x-forwarded-host": forwardedHost(template, tunnelHost),
        "x-forwarded-proto": "https",
        origin: tunnelOrigin
      };
      for (const url of ["/api/panes/fixture/cli/terminal", "/api/auth/csrf"]) {
        const upgrade = url.endsWith("terminal") ? { connection: "Upgrade", upgrade: "websocket" } : {};
        const own = await app.inject({ url, headers: { ...headers, ...upgrade }, remoteAddress: "127.0.0.1" });
        expect(own.statusCode, `${template}: same-origin ${url}`).toBe(200);
        for (const other of [
          { origin: "https://127.0.0.1:5173" },
          { origin: "https://evil.example" },
          { "sec-fetch-site": "same-site" },
          { "sec-fetch-site": "cross-site" }
        ]) {
          expect((await app.inject({ url, headers: { ...headers, ...upgrade, ...other }, remoteAddress: "127.0.0.1" })).statusCode).toBe(403);
        }
        // An arbitrary remote peer cannot turn its own forwarding headers into a trusted origin.
        expect((await app.inject({ url, headers: { ...headers, ...upgrade }, remoteAddress: "192.0.2.1" })).statusCode).toBe(403);
        // A request aimed at the public host cannot claim the tunnel's origin.
        expect((await app.inject({ url, headers: { ...headers, ...upgrade,
          "x-forwarded-host": forwardedHost(template, "spaceapp.example:4911") }, remoteAddress: "127.0.0.1" })).statusCode).toBe(403);
      }
    } finally {
      await app.close();
    }
  });
});

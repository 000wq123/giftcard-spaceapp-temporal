import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { WebSocket as WsClient, type RawData, type WebSocket as WsSocket } from "ws";
import type { Pane, PaneBrowserSession } from "@space/contracts";
import type { SpaceStore } from "@space/runtime";
import {
  cliBrowserBridgeEnabled,
  cliBrowserBridgeTokenHeader,
  verifyCliBrowserBridgeToken,
  type CliBrowserBridgeTokenPayload
} from "./cli-browser-bridge.js";
import type { SpaceApiConfig } from "./config.js";
import { isT3AgentSessionId, t3AgentPrincipal } from "./t3code/agent-tokens.js";

// CLI sessions run in their own network namespaces, so the managed Chrome's
// loopback DevTools port is reachable only from the API. This proxy pipes a
// pane-scoped CDP WebSocket to that port so element-level tooling (Playwright
// MCP) drives the same browser the operator sees in the pane. The live view,
// recording and operator handoff stay with Space: connections are refused and
// dropped while an operator holds the control lease.
export const cliBrowserCdpPath = "/api/cli/browser/cdp";
export const cliBrowserCdpStatusPath = "/api/cli/browser/cdp/status";

/** Application close codes mirror the HTTP status an operator would expect. */
export const cliBrowserCdpCloseCodes = Object.freeze({
  TOKEN_INVALID: 4401,
  BRIDGE_DISABLED: 4403,
  PANE_NOT_FOUND: 4404,
  BROWSER_NOT_RUNNING: 4409,
  BROWSER_CONTROL_HELD: 4423,
  ENDPOINT_UNAVAILABLE: 4502
});
export type CliBrowserCdpRefusal = keyof typeof cliBrowserCdpCloseCodes;

const paneIdPattern = /^pane:[A-Za-z0-9_-]{6,80}$/;

/** Chrome writes "<port>\n<browser websocket path>" once DevTools listens on the loopback port. */
export async function readChromeAutomationEndpoint(profilePath: string): Promise<string | null> {
  try {
    const [port, path] = (await readFile(join(profilePath, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/);
    if (!port || !/^\d{2,5}$/.test(port) || !path?.startsWith("/devtools/browser/")) return null;
    return `ws://127.0.0.1:${port}${path}`;
  } catch {
    return null;
  }
}

export interface CliBrowserCdpResolution {
  claims: CliBrowserBridgeTokenPayload;
  pane: Pane;
  session: PaneBrowserSession;
}
export interface CliBrowserCdpRefused {
  refused: CliBrowserCdpRefusal;
  reason: string;
}

export interface CliBrowserCdpProxyOptions {
  store: SpaceStore;
  config: Pick<SpaceApiConfig, "browserToolBridgeEnabled" | "internalApiToken">;
  isBrowserPane(pane: Pick<Pane, "mode">): boolean;
  assertRuntimeEnabled?(runtimeId: string): Promise<void>;
  readEndpoint?(session: PaneBrowserSession): Promise<string | null>;
  onConnected?(request: FastifyRequest, resolution: CliBrowserCdpResolution): Promise<void> | void;
  log?: { warn(obj: unknown, msg?: string): void };
}

export interface CliBrowserCdpProxy {
  resolve(request: FastifyRequest): Promise<CliBrowserCdpResolution | CliBrowserCdpRefused>;
  register(app: FastifyInstance, routeOptions: Record<string, unknown>): void;
  /** Drops every automation connection of a pane; used when an operator takes control. */
  closeForPane(paneId: string, refusal: CliBrowserCdpRefusal, reason: string): number;
  connectionCount(paneId: string): number;
}

function queryString(query: unknown, key: string): string | null {
  if (!query || typeof query !== "object") return null;
  const value = (query as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function headerString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ws rejects reserved codes (1004-1006) and anything outside 1000-1014 / 3000-4999.
function forwardableCloseCode(code: number): number {
  if (code === 1000 || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999)) return code;
  return 1011;
}

export function createCliBrowserCdpProxy(options: CliBrowserCdpProxyOptions): CliBrowserCdpProxy {
  const readEndpoint = options.readEndpoint ?? ((session: PaneBrowserSession) => readChromeAutomationEndpoint(session.profilePath));
  const connections = new Map<string, Set<WsSocket>>();

  async function resolve(request: FastifyRequest): Promise<CliBrowserCdpResolution | CliBrowserCdpRefused> {
    if (!cliBrowserBridgeEnabled(options.config)) {
      return { refused: "BRIDGE_DISABLED", reason: "Space CLI browser bridge is disabled." };
    }
    const token = headerString(request.headers[cliBrowserBridgeTokenHeader]) ?? queryString(request.query, "token");
    const claims = verifyCliBrowserBridgeToken(options.config, token);
    if (!claims) return { refused: "TOKEN_INVALID", reason: "CLI browser bridge token is missing, invalid, or expired." };
    if (isT3AgentSessionId(claims.cliSessionId)) {
      // A T3 Code agent acts for its open T3 pane (t3code/agent-tokens.ts).
      if (!await t3AgentPrincipal(options.store, claims)) {
        return { refused: "TOKEN_INVALID", reason: "The T3 Code pane for this browser bridge token is closed or was not found." };
      }
    } else {
      const cliSession = await options.store.getPaneCliSession(claims.cliSessionId);
      if (!cliSession || cliSession.roomId !== claims.roomId || cliSession.paneId !== claims.paneId) {
        return { refused: "TOKEN_INVALID", reason: "CLI session for browser bridge token was not found." };
      }
      if (!cliSession.isActive || cliSession.status === "EXITED" || cliSession.status === "ERROR" || cliSession.purpose !== "NORMAL") {
        return { refused: "BROWSER_NOT_RUNNING", reason: "CLI session for browser bridge token is not active." };
      }
      try {
        await options.assertRuntimeEnabled?.(cliSession.runtimeId);
      } catch {
        return { refused: "BRIDGE_DISABLED", reason: "CLI runtime is disabled." };
      }
    }
    const requestedPaneId = queryString(request.query, "paneId");
    if (requestedPaneId && !paneIdPattern.test(requestedPaneId)) {
      return { refused: "PANE_NOT_FOUND", reason: "Browser pane id is invalid." };
    }
    const paneId = requestedPaneId ?? claims.paneId;
    let pane: Pane;
    try {
      pane = await options.store.getPane(paneId);
    } catch {
      return { refused: "PANE_NOT_FOUND", reason: "Browser pane was not found." };
    }
    if (pane.roomId !== claims.roomId || pane.isClosed || !options.isBrowserPane(pane)) {
      return { refused: "PANE_NOT_FOUND", reason: "Browser pane was not found in the CLI session room." };
    }
    const session = await options.store.getActivePaneBrowserSession(pane.id);
    if (!session || !session.isActive || session.status === "CLOSED" || session.status === "ERROR") {
      return { refused: "BROWSER_NOT_RUNNING", reason: "The managed browser of this pane is not running." };
    }
    const lease = await options.store.getActiveBrowserControlLease(session.sessionId);
    if (lease) {
      return { refused: "BROWSER_CONTROL_HELD", reason: "An operator holds browser control; wait for the handoff to finish." };
    }
    return { claims, pane, session };
  }

  function track(paneId: string, socket: WsSocket): () => void {
    const bucket = connections.get(paneId) ?? new Set<WsSocket>();
    bucket.add(socket);
    connections.set(paneId, bucket);
    return () => {
      bucket.delete(socket);
      if (bucket.size === 0) connections.delete(paneId);
    };
  }

  async function handle(socket: WsSocket, request: FastifyRequest): Promise<void> {
    // Playwright sends its first CDP commands as soon as the socket opens, so
    // buffer client frames before any await; nothing may be lost or reordered.
    const pending: Array<{ data: RawData; isBinary: boolean }> = [];
    let upstream: WsClient | null = null;
    let clientClosed = false;
    socket.on("message", (data, isBinary) => {
      if (upstream && upstream.readyState === upstream.OPEN) upstream.send(data, { binary: isBinary });
      else pending.push({ data, isBinary });
    });
    socket.once("close", () => { clientClosed = true; });

    const resolution = await resolve(request);
    if ("refused" in resolution) {
      socket.close(cliBrowserCdpCloseCodes[resolution.refused], resolution.reason.slice(0, 120));
      return;
    }
    // Tracked before any further await so an operator taking control meanwhile
    // can drop this socket; the lease is re-read afterwards to close the gap.
    const untrack = track(resolution.pane.id, socket);
    const endpoint = await readEndpoint(resolution.session);
    const lease = await options.store.getActiveBrowserControlLease(resolution.session.sessionId);
    if (!endpoint || lease || clientClosed) {
      untrack();
      if (lease) socket.close(cliBrowserCdpCloseCodes.BROWSER_CONTROL_HELD, "An operator holds browser control; wait for the handoff to finish.");
      else if (!endpoint) socket.close(cliBrowserCdpCloseCodes.ENDPOINT_UNAVAILABLE, "Browser automation endpoint is unavailable.");
      return;
    }
    // CDP responses (snapshots, screenshots) are large; the client side keeps the server limit.
    const chrome = new WsClient(endpoint, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    upstream = chrome;
    let settled = false;
    const finish = (code: number, reason: string) => {
      if (settled) return;
      settled = true;
      untrack();
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) socket.close(forwardableCloseCode(code), reason.slice(0, 120));
      if (chrome.readyState === chrome.OPEN) chrome.close(1000, "space proxy closed");
      else if (chrome.readyState === chrome.CONNECTING) chrome.terminate();
    };
    chrome.once("open", () => {
      for (const message of pending.splice(0)) chrome.send(message.data, { binary: message.isBinary });
    });
    chrome.on("message", (data, isBinary) => {
      if (socket.readyState === socket.OPEN) socket.send(data, { binary: isBinary });
    });
    chrome.on("close", (code, reason) => finish(code, reason.toString("utf8") || "browser closed the automation connection"));
    chrome.on("error", (error) => {
      options.log?.warn({ err: error, paneId: resolution.pane.id }, "CLI browser CDP upstream failed");
      finish(cliBrowserCdpCloseCodes.ENDPOINT_UNAVAILABLE, "Browser automation endpoint failed.");
    });
    socket.on("close", () => finish(1000, "client closed"));
    socket.on("error", () => finish(1011, "client failed"));
    try {
      await options.onConnected?.(request, resolution);
    } catch (error) {
      options.log?.warn({ err: error, paneId: resolution.pane.id }, "CLI browser CDP audit failed");
    }
  }

  return {
    resolve,
    register(app, routeOptions) {
      app.get(cliBrowserCdpPath, { ...routeOptions, websocket: true }, (socket, request) => {
        void handle(socket as unknown as WsSocket, request).catch((error) => {
          options.log?.warn({ err: error }, "CLI browser CDP proxy failed");
          try { socket.close(1011, "proxy failure"); } catch { /* already closed */ }
        });
      });
      app.get(cliBrowserCdpStatusPath, routeOptions, async (request, reply) => {
        const resolution = await resolve(request);
        if ("refused" in resolution) {
          if (resolution.refused === "TOKEN_INVALID") reply.code(401);
          return { ready: false, reason: resolution.refused, detail: resolution.reason, paneId: null, sessionId: null };
        }
        return { ready: true, reason: null, detail: null, paneId: resolution.pane.id, sessionId: resolution.session.sessionId };
      });
    },
    closeForPane(paneId, refusal, reason) {
      const bucket = connections.get(paneId);
      if (!bucket) return 0;
      const sockets = [...bucket];
      for (const socket of sockets) {
        try { socket.close(cliBrowserCdpCloseCodes[refusal], reason.slice(0, 120)); } catch { /* already closed */ }
      }
      return sockets.length;
    },
    connectionCount(paneId) {
      return connections.get(paneId)?.size ?? 0;
    }
  };
}

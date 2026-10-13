import type {} from "./request-context.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, RouteShorthandOptions } from "fastify";
import { z } from "zod";
import type { BrowserHostActorContext } from "@space/browser-host";
import {
  acquireBrowserControlInputSchema, browserBookmarkImportResponseSchema, browserBookmarkListResponseSchema,
  browserCaptureJobResponseSchema, browserCaptureSegmentListResponseSchema, browserCaptureTimelineResponseSchema,
  browserControlLeaseActionInputSchema, browserControlLeaseResponseSchema, browserDiagnosticsResponseSchema,
  browserHandoffRequestResponseSchema, browserNavigateInputSchema, type BrowserRecordingFrameSummary,
  browserRecordingFrameSummarySchema, browserRuntimeInputSchema, browserSetViewportInputSchema,
  type BrowserTimelineEventSummary, browserToolActionInputSchema, createBrowserBookmarkInputSchema,
  createBrowserCaptureJobRequestSchema, createBrowserPageInputSchema, createPaneBrowserSessionRequestSchema, idSchema,
  openBrowserBookmarkInputSchema, type Pane, type PaneBrowserSessionResponse, updatePaneBrowserSessionRequestSchema
} from "@space/contracts";
import {
  type GoogleAccount, SpaceConflictError, SpaceFeatureDisabledError, SpaceNotFoundError, type SpaceStore
} from "@space/runtime";
import { safeBrowserEvidenceSegment, safeStorageSegment } from "./artifact-storage.js";
import { operatorBrowserActor } from "./browser-actors.js";
import {
  addManagedBrowserBookmark, type BrowserBookmarkImportCandidate, exportManagedBrowserBookmarks,
  importManagedBrowserBookmarks, listManagedBrowserBookmarks, parseChromeBookmarksImport
} from "./browser-bookmarks.js";
import type { BrowserSessionManagerWithHostHealth } from "./browser-host-proxy.js";
import { assertSafeBrowserTargetUrl } from "./browser-sessions.js";
import type { SpaceApiConfig } from "./config.js";
import { sendApiError } from "./http-errors.js";
import { readStagedUpload, withStagedUploads } from "./multipart-upload.js";
import type { PaneBrowserAccount } from "./pane-browser-account.js";
import { assertBrowserPaneCompatible, getActiveBrowserSessionForPane, getPaneById } from "./pane-guards.js";
import { recordAudit } from "./request-audit.js";
import { idParamSchema, parseBody, parseQuery } from "./route-parsing.js";
import {
  googleAccountSignInUrl, privatePaneProfileId, selectYouTubeAccountSchema, youtubeAccountSignInUrl,
  type YouTubeAccountStore
} from "./youtube-accounts.js";
import { youtubePlaybackSchema, type YouTubePlaybackStore } from "./youtube-playback-state.js";
import { seedYouTubeSignIn } from "./youtube-shared-signin.js";

const browserPageParamSchema = z.object({ id: idSchema, pageId: z.string().min(1).max(200) });

const browserCaptureParamSchema = z.object({ id: idSchema, jobId: idSchema });

const browserDiagnosticsQuerySchema = z.object({
  includeNetwork: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .default(true)
    .transform((value) => value === true || value === "true"),
  limit: z.coerce.number().int().min(1).max(1000).default(200)
});

const browserCaptureTimelineManifestSchema = z.object({
  durationMs: z.number().int().min(0).max(1_800_000).optional(),
  frameCount: z.number().int().min(0).optional(),
  segmentCount: z.number().int().min(0).max(10_000).optional(),
  frames: z.array(browserRecordingFrameSummarySchema).max(100_000).default([]),
  events: browserDiagnosticsResponseSchema.shape.events.default([])
});

const browserBookmarkImportMaxBytes = 2 * 1024 * 1024;

const browserBookmarkImportMimeTypes = new Set(["application/json", "text/plain", "application/octet-stream", ""]);

function safeAuditHostname(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

function safeAuditHostnames(urls: string[]): string[] {
  return Array.from(new Set(urls.map((url) => safeAuditHostname(url)).filter((hostname): hostname is string => Boolean(hostname)))).slice(0, 20);
}

async function readBrowserCaptureTimelineManifest(
  artifactRoot: string,
  jobId: string
): Promise<z.infer<typeof browserCaptureTimelineManifestSchema> | null> {
  const recordingDir = join(artifactRoot, "browser-evidence", safeBrowserEvidenceSegment(jobId));
  for (const filename of ["manifest.json", "timeline.json"]) {
    try {
      return browserCaptureTimelineManifestSchema.parse(JSON.parse(await readFile(join(recordingDir, filename), "utf8")));
    } catch (error) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return null;
}

function correlateBrowserTimelineEvents(
  events: BrowserTimelineEventSummary[],
  frames: BrowserRecordingFrameSummary[]
): BrowserTimelineEventSummary[] {
  if (!frames.length) return events;
  const frameTimes = frames.map((frame) => Date.parse(frame.capturedAt));
  return events.map((event) => {
    if (event.frameIndex !== null) return event;
    const eventTime = Date.parse(event.occurredAt);
    let nearest = 0;
    let nearestDistance = Math.abs(frameTimes[0]! - eventTime);
    for (let index = 1; index < frameTimes.length; index += 1) {
      const distance = Math.abs(frameTimes[index]! - eventTime);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    }
    return { ...event, frameIndex: frames[nearest]!.index };
  });
}

/**
 * Browser and YouTube pane routes: accounts, YouTube search/playback, browser sessions, pages, control, input,
 * captures, diagnostics, bookmarks, viewport and actions; the parent retains authentication, CSRF, errors and rate
 * limits.
 */
/** Choosing and opening a Browser pane's saved Google sign-in; the pane routes and the CLI browser bridge share it. */
export interface PaneBrowserAccountControl {
  list(userId: string, pane: Pane): Promise<{ selectedProfileId: string | null; effectiveProfileId: string | null; profiles: Array<{ profileId: string; displayName: string }> }>;
  select(userId: string, pane: Pane, profileId: string | null, signIn: boolean | undefined, traceId: string, actor: BrowserHostActorContext): Promise<{ selectedProfileId: string | null; targetUrl: string }>;
  start(userId: string, pane: Pane, input: z.infer<typeof createPaneBrowserSessionRequestSchema>, traceId: string, actor: BrowserHostActorContext): Promise<PaneBrowserSessionResponse>;
}

export function registerPaneBrowserRoutes(app: FastifyInstance, options: {
  config: SpaceApiConfig;
  readGeminiAccountProfileDetails: (profileId: string) => Promise<{ authStatus: "CONNECTED" | "NOT_CONNECTED" | "UNAVAILABLE"; email: string | null; }>;
  store: SpaceStore;
  browserSessionManager: BrowserSessionManagerWithHostHealth;
  routeOptions: Pick<RouteShorthandOptions, "config">;
  youtubePlaybackStore: YouTubePlaybackStore;
  youtubeAccountStore: YouTubeAccountStore;
  browserAccountStore: YouTubeAccountStore;
  youtubeSessionStarts: Map<string, Promise<PaneBrowserSessionResponse>>;
  youtubeAccountOperations: Map<string, Promise<unknown>>;
  withYouTubeAccountLock: <T>(paneId: string, operation: () => Promise<T>) => Promise<T>;
  youtubeAccountOwner: (userId: string, pane: Pane) => Promise<string>;
  selectedGoogleBrowserAccount: (userId: string, pane: Pane, profileId: string | null) => Promise<GoogleAccount | undefined>;
  paneGoogleAccountSelection: (userId: string, pane: Pane) => Promise<string | null>;
  resolvePaneBrowserAccount: (userId: string, pane: Pane) => Promise<PaneBrowserAccount>;
  adoptPaneSignIn: (userId: string, pane: Pane, resolved: PaneBrowserAccount, actor: BrowserHostActorContext) => Promise<PaneBrowserAccount>;
  effectivePaneProfileId: (userId: string, pane: Pane) => Promise<string | null>;
  browserAccountChoices: (userId: string, pane: Pane) => Promise<{ profileId: string; displayName: string; }[]>;
  /** Drops CLI automation sockets of a pane when an operator takes control. */
  cliBrowserCdpProxy?: { closeForPane(paneId: string, refusal: "BROWSER_CONTROL_HELD", reason: string): number };
}) {
  const { config, readGeminiAccountProfileDetails, store, browserSessionManager,
    routeOptions: defaultRouteRateLimitOptions, youtubePlaybackStore, youtubeAccountStore, browserAccountStore,
    youtubeSessionStarts, youtubeAccountOperations, withYouTubeAccountLock, youtubeAccountOwner,
    selectedGoogleBrowserAccount, paneGoogleAccountSelection, resolvePaneBrowserAccount, adoptPaneSignIn,
    effectivePaneProfileId, browserAccountChoices } = options;
  const accountControl: PaneBrowserAccountControl = {
    async list(userId, pane) {
      return { selectedProfileId: await paneGoogleAccountSelection(userId, pane), effectiveProfileId: await effectivePaneProfileId(userId, pane),
        profiles: await browserAccountChoices(userId, pane) };
    },
    /** Saves the pane's account and stops its browser, so the next start opens that account. */
    async select(userId, pane, profileId, signIn, traceId, actor) {
      const account = await selectedGoogleBrowserAccount(userId, pane, profileId);
      const privateProfile = profileId === privatePaneProfileId;
      if (profileId !== null && !privateProfile && !account && !await store.getCliAccountProfile("cli:gemini", profileId)) throw new SpaceNotFoundError("The selected Google account is no longer available.");
      // Use metadata from the existing broker; Google credentials never leave Chrome.
      const details = account ?? (profileId === null || privateProfile ? null : await readGeminiAccountProfileDetails(profileId).catch(() => null));
      return withYouTubeAccountLock(pane.id, async () => {
        await youtubeSessionStarts.get(pane.id)?.catch(() => undefined);
        await browserSessionManager.stopPane(pane.id, traceId, actor);
        await browserAccountStore.save(await youtubeAccountOwner(userId, pane), pane.id, profileId);
        const openSignIn = profileId !== null && (signIn === true || (!account && !privateProfile));
        return { selectedProfileId: profileId, targetUrl: openSignIn ? googleAccountSignInUrl(details?.email ?? null) : config.browserSessionsDefaultUrl };
      });
    },
    /** Starts the pane's browser in the Google account chosen for it. */
    start(userId, pane, input, traceId, actor) {
      const startSession = async () => {
        const priorYouTube = pane.mode === "YOUTUBE" ? await store.getLatestPaneBrowserSession(pane.id) : null;
        const resolved = await adoptPaneSignIn(userId, pane, await resolvePaneBrowserAccount(userId, pane), actor);
        const { selectedProfileId, account } = resolved;
        const sharedProfileKey = account ? undefined : resolved.sharedProfileKey;
        const profileKey = account ? undefined : resolved.profileKey ?? undefined;
        if (pane.mode === "YOUTUBE" && selectedProfileId && profileKey && !sharedProfileKey && !await store.getActivePaneBrowserSession(pane.id)) {
          const owner = await youtubeAccountOwner(userId, pane);
          const peerIds = await youtubeAccountStore.knownPanes(owner);
          const peers = await Promise.all(peerIds.filter(id => id !== pane.id).map(async (id) => {
            const peer = await getPaneById(store, id).catch(() => null);
            return peer?.mode === "YOUTUBE" && await youtubeAccountOwner(userId, peer) === owner
              ? { roomId: peer.roomId, paneId: peer.id } : null;
          }));
          try {
            await seedYouTubeSignIn({
              profileRoot: config.browserSessionsProfileRoot, profileKey,
              destination: { roomId: pane.roomId, paneId: pane.id },
              peers: peers.filter((peer): peer is { roomId: string; paneId: string } => peer !== null)
            });
          } catch {
            throw new SpaceConflictError("Saved Google sign-in could not be loaded. Retry opening this YouTube pane.");
          }
        }
        const matchesPriorProfile = account ? priorYouTube?.profileId === `google-account:${account.id}`
          : sharedProfileKey ? priorYouTube?.profileId === `cli-account:${sharedProfileKey}`
            : profileKey ? priorYouTube?.profilePath.endsWith(`/accounts/${profileKey}`) : !priorYouTube?.profilePath.includes("/accounts/");
        const starting = youtubeSessionStarts.get(pane.id) ?? browserSessionManager.startOrRestore({
          pane,
          viewport: input.viewport,
          targetUrl: priorYouTube && matchesPriorProfile && !priorYouTube.isActive && (!input.targetUrl || input.targetUrl === "https://www.youtube.com/") ? (priorYouTube.currentUrl ?? priorYouTube.targetUrl) : input.targetUrl,
          profileKey: profileKey ?? null,
          ...(sharedProfileKey ? { sharedProfileKey } : {}),
          ...(account ? { googleAccount: { ownerUserId: userId, accountId: account.id } } : {}),
          streamMode: input.streamMode,
          includeInitialFrame: input.includeInitialFrame,
          ownerAgentId: input.ownerAgentId ?? null,
          traceId
        }, actor);
        youtubeSessionStarts.set(pane.id, starting);
        try { return await starting; }
        finally { if (youtubeSessionStarts.get(pane.id) === starting) youtubeSessionStarts.delete(pane.id); }
      };
      return withYouTubeAccountLock(pane.id, startSession);
    }
  };
  app.get("/api/panes/:id/browser/accounts", defaultRouteRateLimitOptions, async (request, reply) => {
    if (request.user?.role !== "ADMIN") return sendApiError(reply, 403, "ADMIN_REQUIRED", "Google account selection requires the ADMIN role.");
    const { id } = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, id);
    if (pane.mode !== "BROWSER") throw new SpaceConflictError("Google account selection requires a Browser pane.");
    return accountControl.list(request.user.id, pane);
  });
  app.put("/api/panes/:id/browser/accounts", defaultRouteRateLimitOptions, async (request, reply) => {
    if (request.user?.role !== "ADMIN") return sendApiError(reply, 403, "ADMIN_REQUIRED", "Google account selection requires the ADMIN role.");
    const { id } = parseQuery(idParamSchema, request.params);
    const { profileId, signIn } = parseBody(selectYouTubeAccountSchema, request.body);
    const pane = await getPaneById(store, id);
    if (pane.mode !== "BROWSER") throw new SpaceConflictError("Google account selection requires a Browser pane.");
    return accountControl.select(request.user.id, pane, profileId, signIn, request.requestIdForSpace, operatorBrowserActor(request));
  });
  app.get("/api/panes/:id/youtube/accounts", defaultRouteRateLimitOptions, async (request, reply) => {
    if (request.user?.role !== "ADMIN") return sendApiError(reply, 403, "ADMIN_REQUIRED", "Google account selection requires the ADMIN role.");
    const { id } = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, id);
    if (pane.mode !== "YOUTUBE") throw new SpaceConflictError("Google account selection requires a YouTube pane.");
    const profiles = await browserAccountChoices(request.user.id, pane);
    const selectedProfileId = await paneGoogleAccountSelection(request.user.id, pane);
    return { selectedProfileId, effectiveProfileId: await effectivePaneProfileId(request.user.id, pane), profiles };
  });
  app.put("/api/panes/:id/youtube/accounts", defaultRouteRateLimitOptions, async (request, reply) => {
    if (request.user?.role !== "ADMIN") return sendApiError(reply, 403, "ADMIN_REQUIRED", "Google account selection requires the ADMIN role.");
    const { id } = parseQuery(idParamSchema, request.params);
    const { profileId, signIn } = parseBody(selectYouTubeAccountSchema, request.body);
    const pane = await getPaneById(store, id);
    if (pane.mode !== "YOUTUBE") throw new SpaceConflictError("Google account selection requires a YouTube pane.");
    const account = await selectedGoogleBrowserAccount(request.user.id, pane, profileId);
    const privateProfile = profileId === privatePaneProfileId;
    if (profileId !== null && !privateProfile && !account && !await store.getCliAccountProfile("cli:gemini", profileId)) throw new SpaceNotFoundError("The selected Google account is no longer available.");
    // The native helper returns only account metadata, never OAuth credentials.
    const details = account ?? (profileId === null || privateProfile ? null : await readGeminiAccountProfileDetails(profileId).catch(() => null));
    return withYouTubeAccountLock(pane.id, async () => {
      await youtubeSessionStarts.get(pane.id)?.catch(() => undefined);
      await browserSessionManager.stopPane(pane.id, request.requestIdForSpace, operatorBrowserActor(request));
      await youtubeAccountStore.save(await youtubeAccountOwner(request.user!.id, pane), pane.id, profileId);
      const openSignIn = profileId !== null && (signIn === true || (!account && !privateProfile));
      return { selectedProfileId: profileId, targetUrl: openSignIn ? youtubeAccountSignInUrl(details?.email ?? null) : "https://www.youtube.com/" };
    });
  });
  app.get("/api/youtube/search", defaultRouteRateLimitOptions, async (request, reply) => {
    const q = (request.query as any)?.q;
    if (!q || typeof q !== "string" || !q.trim()) {
      return sendApiError(reply, 400, "BAD_REQUEST", "Search query 'q' is required.");
    }
    const query = q.trim();
    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      const html = await res.text();
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData = ({.*?});<\/script>/s);
      if (!match || !match[1]) {
        return { items: [] };
      }
      const data = JSON.parse(match[1]);
      const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
      const items: Array<{ videoId: string; title: string; channel: string; url: string }> = [];
      if (Array.isArray(contents)) {
        for (const section of contents) {
          const vSection = section?.itemSectionRenderer?.contents;
          if (Array.isArray(vSection)) {
            for (const it of vSection) {
              const vr = it?.videoRenderer;
              if (vr?.videoId) {
                const title = vr.title?.runs?.map((r: any) => r.text).join("") || vr.title?.simpleText || "";
                const channel = vr.ownerText?.runs?.map((r: any) => r.text).join("") || "";
                items.push({ videoId: vr.videoId, title, channel, url: `https://www.youtube.com/watch?v=${vr.videoId}` });
                if (items.length >= 5) break;
              }
            }
          }
          if (items.length >= 5) break;
        }
      }
      return { items };
    } catch (err) {
      request.log.warn({ err, event: "YOUTUBE_SEARCH_FAILED" }, "YouTube search failed.");
      return sendApiError(reply, 502, "YOUTUBE_SEARCH_FAILED", "YouTube search is unavailable right now.");
    }
  });
  app.get("/api/panes/:id/youtube/playback", defaultRouteRateLimitOptions, async (request) => {
    const { id } = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, id);
    if (pane.mode !== "YOUTUBE") throw new SpaceConflictError("Playback requires a YouTube pane.");
    return { playback: await youtubePlaybackStore.get((await store.getRoom(pane.roomId)).kind === "AGENT_PROOF" ? `${request.user!.id}:proof:${pane.roomId}` : request.user!.id, pane.id) };
  });
  app.put("/api/panes/:id/youtube/playback", defaultRouteRateLimitOptions, async (request) => {
    const { id } = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, id);
    if (pane.mode !== "YOUTUBE") throw new SpaceConflictError("Playback requires a YouTube pane.");
    const playback = parseBody(youtubePlaybackSchema, request.body);
    await youtubePlaybackStore.save((await store.getRoom(pane.roomId)).kind === "AGENT_PROOF" ? `${request.user!.id}:proof:${pane.roomId}` : request.user!.id, pane.id, playback);
    return { ok: true };
  });
  app.post("/api/panes/:id/youtube/watch", defaultRouteRateLimitOptions, async (request) => {
    const { id } = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, id);
    assertBrowserPaneCompatible(pane);
    if (pane.mode !== "YOUTUBE") throw new SpaceConflictError("Playback requires a YouTube pane.");
    await youtubeAccountOperations.get(pane.id)?.catch(() => undefined);
    await youtubeSessionStarts.get(pane.id)?.catch(() => undefined);
    // Stop captures the current video time and flushes the persistent Chrome profile.
    await browserSessionManager.stopPane(pane.id, request.requestIdForSpace, operatorBrowserActor(request));
    const prior = await store.getLatestPaneBrowserSession(pane.id);
    return { currentUrl: prior?.currentUrl ?? prior?.targetUrl ?? null };
  });
  app.get("/api/panes/:id/browser/session", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    // A stopped browser (including closing its last tab) stays empty across
    // reloads and viewers. Starting Chrome requires an explicit +/navigation.
    if (pane.mode === "BROWSER" || pane.mode === "JOB_APPLY") {
      const prior = await store.getLatestPaneBrowserSession(pane.id);
      if (prior?.status === "CLOSED" && !prior.isActive) {
        return { session: { ...prior, pages: [], activePageId: null }, frame: null, websocket: null };
      }
    }
    const session = await browserSessionManager.getActive(pane);
    if (!session) {
      throw new SpaceNotFoundError(`Active browser session for pane ${pane.id} was not found.`);
    }
    return session;
  });
  app.get("/api/panes/:id/browser/handoff", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const session = await getActiveBrowserSessionForPane(store, pane);
    const active = await store.getActiveBrowserHandoffRequest(session.sessionId);
    const handoff = active ?? (await store.listBrowserHandoffRequests(pane.roomId)).find((candidate) => candidate.sessionId === session.sessionId);
    if (!handoff) {
      throw new SpaceNotFoundError(`Browser handoff request for pane ${pane.id} was not found.`);
    }
    return browserHandoffRequestResponseSchema.parse({ handoff });
  });
  app.post("/api/panes/:id/browser/session", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(createPaneBrowserSessionRequestSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const session = await accountControl.start(request.user!.id, pane, input, request.requestIdForSpace, operatorBrowserActor(request));
    // Closing while Chrome starts must not leave an orphan browser behind.
    if ((await getPaneById(store, pane.id)).isClosed) {
      await browserSessionManager.stopPane(pane.id, request.requestIdForSpace, operatorBrowserActor(request));
      throw new SpaceConflictError("The pane was closed while its browser was starting.");
    }
    await recordAudit(store, request, {
      action: "pane.browser.session",
      targetType: "pane",
      targetId: pane.id,
      metadata: {
        roomId: pane.roomId,
        sessionId: session.session.sessionId,
        viewport: session.session.viewport,
        currentUrl: session.session.currentUrl
      }
    });
    return session;
  });
  app.patch("/api/panes/:id/browser/session", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(updatePaneBrowserSessionRequestSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    let response = input.viewport ? await browserSessionManager.setViewport(pane, input.viewport, request.requestIdForSpace, operatorBrowserActor(request)) : null;
    if (input.targetUrl) {
      response = await browserSessionManager.navigate(pane, input.targetUrl, request.requestIdForSpace, operatorBrowserActor(request));
    }
    if (input.streamMode) {
      if (!browserSessionManager.setStreamMode) {
        throw new SpaceFeatureDisabledError("BROWSER_STREAM_MODE_UNAVAILABLE", "Adaptive browser stream modes are unavailable on this runtime.");
      }
      response = await browserSessionManager.setStreamMode(pane, input.streamMode, request.requestIdForSpace, operatorBrowserActor(request));
    }
    if (!response) {
      throw new SpaceNotFoundError(`Active browser session for pane ${pane.id} was not found.`);
    }
    await recordAudit(store, request, {
      action: "pane.browser.update",
      targetType: "pane",
      targetId: pane.id,
      metadata: {
        roomId: pane.roomId,
        sessionId: response.session.sessionId,
        viewport: response.session.viewport,
        currentUrl: response.session.currentUrl
      }
    });
    return response;
  });
  app.post("/api/panes/:id/browser/navigate", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(browserNavigateInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const response = await browserSessionManager.navigate(pane, input.url, request.requestIdForSpace, operatorBrowserActor(request));
    await recordAudit(store, request, {
      action: "pane.browser.navigate",
      targetType: "pane",
      targetId: pane.id,
      metadata: { roomId: pane.roomId, sessionId: response.session.sessionId, currentUrl: response.session.currentUrl }
    });
    return response;
  });
  app.get("/api/panes/:id/browser/pages", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.listPages) {
      throw new SpaceFeatureDisabledError("BROWSER_PAGES_UNAVAILABLE", "Browser page management is unavailable on this runtime.");
    }
    return browserSessionManager.listPages(pane);
  });
  app.post("/api/panes/:id/browser/pages", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(createBrowserPageInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.createPage) {
      throw new SpaceFeatureDisabledError("BROWSER_PAGES_UNAVAILABLE", "Browser page management is unavailable on this runtime.");
    }
    return browserSessionManager.createPage(pane, input.url, input.activate, request.requestIdForSpace, operatorBrowserActor(request));
  });
  app.post("/api/panes/:id/browser/pages/:pageId/activate", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(browserPageParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.activatePage) {
      throw new SpaceFeatureDisabledError("BROWSER_PAGES_UNAVAILABLE", "Browser page management is unavailable on this runtime.");
    }
    return browserSessionManager.activatePage(pane, params.pageId, request.requestIdForSpace, operatorBrowserActor(request));
  });
  app.post("/api/panes/:id/browser/pages/:pageId/close", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(browserPageParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.closePage) {
      throw new SpaceFeatureDisabledError("BROWSER_PAGES_UNAVAILABLE", "Browser page management is unavailable on this runtime.");
    }
    return browserSessionManager.closePage(pane, params.pageId, request.requestIdForSpace, operatorBrowserActor(request));
  });
  app.post("/api/panes/:id/browser/control/acquire", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(acquireBrowserControlInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.acquireControl) {
      throw new SpaceFeatureDisabledError("BROWSER_CONTROL_UNAVAILABLE", "Browser control handoff is unavailable on this runtime.");
    }
    const holderId = input.holderType === "OPERATOR" ? request.user?.id ?? input.holderId : input.holderId;
    const lease = await browserSessionManager.acquireControl(
      pane,
      { ...input, holderId },
      request.requestIdForSpace,
      operatorBrowserActor(request)
    );
    // Agent automation attached over CDP must not fight the operator for the page.
    if (lease.holderType === "OPERATOR") options.cliBrowserCdpProxy?.closeForPane(pane.id, "BROWSER_CONTROL_HELD", "An operator took browser control.");
    const handoff = await store.getActiveBrowserHandoffRequest(lease.sessionId);
    if (handoff?.status === "REQUESTED" && lease.holderType === "OPERATOR" && request.user) {
      await store.updateBrowserHandoffRequest(handoff.handoffRequestId, {
        status: "ACCEPTED",
        operatorUserId: request.user.id,
        operatorEmail: request.user.email,
        operatorRole: request.user.role === "USER" ? undefined : request.user.role,
        controlLeaseId: lease.leaseId
      });
    }
    await recordAudit(store, request, {
      action: "pane.browser.control.acquire",
      targetType: "pane",
      targetId: pane.id,
      metadata: { sessionId: lease.sessionId, leaseId: lease.leaseId, holderType: lease.holderType, holderId: lease.holderId }
    });
    return browserControlLeaseResponseSchema.parse({ lease });
  });
  app.post("/api/panes/:id/browser/control/heartbeat", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(browserControlLeaseActionInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.heartbeatControl) {
      throw new SpaceFeatureDisabledError("BROWSER_CONTROL_UNAVAILABLE", "Browser control handoff is unavailable on this runtime.");
    }
    return browserControlLeaseResponseSchema.parse({
      lease: await browserSessionManager.heartbeatControl(pane, input, request.requestIdForSpace, operatorBrowserActor(request))
    });
  });
  app.post("/api/panes/:id/browser/control/release", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(browserControlLeaseActionInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.releaseControl) {
      throw new SpaceFeatureDisabledError("BROWSER_CONTROL_UNAVAILABLE", "Browser control handoff is unavailable on this runtime.");
    }
    const lease = await browserSessionManager.releaseControl(
      pane,
      input,
      request.requestIdForSpace,
      operatorBrowserActor(request)
    );
    const handoff = await store.getActiveBrowserHandoffRequest(lease.sessionId);
    if (handoff?.status === "ACCEPTED" && handoff.controlLeaseId === lease.leaseId) {
      await store.updateBrowserHandoffRequest(handoff.handoffRequestId, { status: "COMPLETED" });
    }
    await recordAudit(store, request, {
      action: "pane.browser.control.release",
      targetType: "pane",
      targetId: pane.id,
      metadata: { sessionId: lease.sessionId, leaseId: lease.leaseId }
    });
    return browserControlLeaseResponseSchema.parse({ lease });
  });
  app.post("/api/panes/:id/browser/input", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(browserRuntimeInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.input) {
      throw new SpaceFeatureDisabledError("BROWSER_INPUT_UNAVAILABLE", "High fidelity browser input is unavailable on this runtime.");
    }
    return browserSessionManager.input(pane, input, request.requestIdForSpace, operatorBrowserActor(request));
  });
  app.post("/api/panes/:id/browser/captures", defaultRouteRateLimitOptions, async (request, reply) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(createBrowserCaptureJobRequestSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.createCapture) {
      throw new SpaceFeatureDisabledError("BROWSER_CAPTURE_UNAVAILABLE", "Browser capture jobs are unavailable on this runtime.");
    }
    const job = await browserSessionManager.createCapture(pane, input.options, {
      requestedByType: "OPERATOR",
      requestedById: request.user?.id ?? "operator:unknown",
      traceId: request.requestIdForSpace
    });
    await recordAudit(store, request, {
      action: "pane.browser.capture.queued",
      targetType: "pane",
      targetId: pane.id,
      metadata: { sessionId: job.sessionId, jobId: job.jobId, kind: job.options.kind }
    });
    return reply.code(202).send(browserCaptureJobResponseSchema.parse({ job }));
  });
  app.get("/api/panes/:id/browser/captures/:jobId", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(browserCaptureParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.getCapture) {
      throw new SpaceFeatureDisabledError("BROWSER_CAPTURE_UNAVAILABLE", "Browser capture jobs are unavailable on this runtime.");
    }
    return browserCaptureJobResponseSchema.parse({ job: await browserSessionManager.getCapture(pane, params.jobId) });
  });
  app.get("/api/panes/:id/browser/captures/:jobId/segments", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(browserCaptureParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const job = await store.getBrowserCaptureJob(params.jobId);
    if (!job || job.paneId !== pane.id) throw new SpaceNotFoundError(`Browser capture job ${params.jobId} was not found.`);
    return browserCaptureSegmentListResponseSchema.parse({
      jobId: job.jobId,
      segments: await store.listBrowserCaptureSegments(job.jobId)
    });
  });
  app.get("/api/panes/:id/browser/captures/:jobId/timeline", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(browserCaptureParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const job = await store.getBrowserCaptureJob(params.jobId);
    if (!job || job.paneId !== pane.id) throw new SpaceNotFoundError(`Browser capture job ${params.jobId} was not found.`);
    const segments = await store.listBrowserCaptureSegments(job.jobId);
    const manifest = await readBrowserCaptureTimelineManifest(config.browserEvidenceArtifactRoot, job.jobId);
    let liveEvents: BrowserTimelineEventSummary[] = [];
    if (browserSessionManager.diagnostics) {
      const diagnostics = await browserSessionManager.diagnostics(pane, true, 1000).catch(() => null);
      if (diagnostics?.sessionId === job.sessionId) {
        liveEvents = browserDiagnosticsResponseSchema.parse(diagnostics).events;
      }
    }
    const frames = manifest?.frames ?? [];
    const events = [...new Map([...(manifest?.events ?? []), ...liveEvents].map((event) => [event.eventId, event])).values()]
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .slice(-1000);
    return browserCaptureTimelineResponseSchema.parse({
      jobId: job.jobId,
      sessionId: job.sessionId,
      durationMs: manifest?.durationMs ?? segments.reduce((sum, segment) => sum + segment.durationMs, 0),
      frameCount: manifest?.frameCount ?? segments.reduce((sum, segment) => sum + segment.frameCount, 0),
      segmentCount: manifest?.segmentCount ?? segments.length,
      frames,
      events: correlateBrowserTimelineEvents(events, frames)
    });
  });
  app.post("/api/panes/:id/browser/captures/:jobId/stop", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(browserCaptureParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.stopCapture) {
      throw new SpaceFeatureDisabledError("BROWSER_CAPTURE_CONTROL_UNAVAILABLE", "Stopping browser captures is unavailable on this runtime.");
    }
    const job = await browserSessionManager.stopCapture(
      pane,
      params.jobId,
      request.requestIdForSpace,
      operatorBrowserActor(request)
    );
    await recordAudit(store, request, {
      action: "pane.browser.capture.stop",
      targetType: "pane",
      targetId: pane.id,
      metadata: { sessionId: job.sessionId, jobId: job.jobId, status: job.status }
    });
    return browserCaptureJobResponseSchema.parse({ job });
  });
  app.post("/api/panes/:id/browser/captures/:jobId/cancel", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(browserCaptureParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.cancelCapture) {
      throw new SpaceFeatureDisabledError("BROWSER_CAPTURE_CONTROL_UNAVAILABLE", "Cancelling browser captures is unavailable on this runtime.");
    }
    const job = await browserSessionManager.cancelCapture(
      pane,
      params.jobId,
      request.requestIdForSpace,
      operatorBrowserActor(request)
    );
    await recordAudit(store, request, {
      action: "pane.browser.capture.cancel",
      targetType: "pane",
      targetId: pane.id,
      metadata: { sessionId: job.sessionId, jobId: job.jobId, status: job.status }
    });
    return browserCaptureJobResponseSchema.parse({ job });
  });
  app.get("/api/panes/:id/browser/diagnostics", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const query = parseQuery(browserDiagnosticsQuerySchema, request.query);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    if (!browserSessionManager.diagnostics) {
      throw new SpaceFeatureDisabledError("BROWSER_DIAGNOSTICS_UNAVAILABLE", "Browser diagnostics are unavailable on this runtime.");
    }
    return browserDiagnosticsResponseSchema.parse(await browserSessionManager.diagnostics(pane, query.includeNetwork, query.limit));
  });
  app.get("/api/panes/:id/browser/bookmarks", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const session = await getActiveBrowserSessionForPane(store, pane);
    return listManagedBrowserBookmarks(session);
  });
  app.post("/api/panes/:id/browser/bookmarks", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(createBrowserBookmarkInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const session = await getActiveBrowserSessionForPane(store, pane);
    const requestedUrl = input.url ?? session.currentUrl ?? session.targetUrl;
    if (!requestedUrl) {
      throw new SpaceConflictError("Browser session has no current URL to bookmark.");
    }
    const url = await assertSafeBrowserTargetUrl(requestedUrl, config.browserEvidenceTargetOrigin);
    const bookmark = await addManagedBrowserBookmark(session, {
      title: input.title ?? session.title ?? undefined,
      url
    });
    const bookmarks = await listManagedBrowserBookmarks(session);
    await recordAudit(store, request, {
      action: "pane.browser.bookmark.add",
      targetType: "pane",
      targetId: pane.id,
      metadata: { roomId: pane.roomId, sessionId: session.sessionId, bookmarkId: bookmark.id, hostname: safeAuditHostname(bookmark.url) }
    });
    return browserBookmarkListResponseSchema.parse(bookmarks);
  });
  app.post("/api/panes/:id/browser/bookmarks/import", defaultRouteRateLimitOptions, async (request, reply) => {
    const params = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const session = await getActiveBrowserSessionForPane(store, pane);
    if (!request.isMultipart()) {
      return sendApiError(reply, 400, "BAD_REQUEST", "Bookmark import must use multipart/form-data.");
    }

    return withStagedUploads(request, config.browserEvidenceArtifactRoot,
      { maxFiles: 1, fileBytes: browserBookmarkImportMaxBytes }, async uploads => {
      const upload = uploads[0]!;
      if (!browserBookmarkImportMimeTypes.has(upload.declaredMimeType)) {
        return sendApiError(reply, 422, "UNSUPPORTED_MEDIA_TYPE", "Bookmark import accepts Chrome/Chromium Bookmarks JSON files.");
      }
      const uploadBuffer = await readStagedUpload(config.browserEvidenceArtifactRoot, upload);
      let parsedImport: ReturnType<typeof parseChromeBookmarksImport>;
      try {
        parsedImport = parseChromeBookmarksImport(uploadBuffer);
      } catch {
        return sendApiError(reply, 422, "INVALID_BOOKMARKS_FILE", "Bookmark import must be a valid Chrome/Chromium Bookmarks JSON file.");
      }

      const safeBookmarks: BrowserBookmarkImportCandidate[] = [];
      let skippedCount = parsedImport.skippedCount;
      for (const candidate of parsedImport.bookmarks) {
        try {
          safeBookmarks.push({
            title: candidate.title,
            url: await assertSafeBrowserTargetUrl(candidate.url, config.browserEvidenceTargetOrigin)
          });
        } catch {
          skippedCount += 1;
        }
      }
      const imported = await importManagedBrowserBookmarks(session, { bookmarks: safeBookmarks, skippedCount });
      await recordAudit(store, request, {
        action: "pane.browser.bookmark.import",
        targetType: "pane",
        targetId: pane.id,
        metadata: {
          roomId: pane.roomId,
          sessionId: session.sessionId,
          importedCount: imported.importedCount,
          skippedCount: imported.skippedCount,
          hostnames: safeAuditHostnames(safeBookmarks.map((bookmark) => bookmark.url))
        }
      });
      return browserBookmarkImportResponseSchema.parse(imported);
    });
  });
  app.get("/api/panes/:id/browser/bookmarks/export", defaultRouteRateLimitOptions, async (request, reply) => {
    const params = parseQuery(idParamSchema, request.params);
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const session = await getActiveBrowserSessionForPane(store, pane);
    const data = await exportManagedBrowserBookmarks(session);
    await recordAudit(store, request, {
      action: "pane.browser.bookmark.export",
      targetType: "pane",
      targetId: pane.id,
      metadata: { roomId: pane.roomId, sessionId: session.sessionId }
    });
    return reply
      .header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="space-browser-bookmarks-${safeStorageSegment(pane.id)}.json"`)
      .send(`${JSON.stringify(data, null, 2)}\n`);
  });
  app.post("/api/panes/:id/browser/bookmarks/open", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(openBrowserBookmarkInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const session = await getActiveBrowserSessionForPane(store, pane);
    const bookmarks = await listManagedBrowserBookmarks(session);
    const bookmark = bookmarks.bookmarks.find((candidate) => candidate.id === input.bookmarkId);
    if (!bookmark) {
      throw new SpaceNotFoundError(`Browser bookmark ${input.bookmarkId} was not found.`);
    }
    const response = await browserSessionManager.navigate(pane, bookmark.url, request.requestIdForSpace, operatorBrowserActor(request));
    await recordAudit(store, request, {
      action: "pane.browser.bookmark.open",
      targetType: "pane",
      targetId: pane.id,
      metadata: { roomId: pane.roomId, sessionId: session.sessionId, bookmarkId: bookmark.id, hostname: safeAuditHostname(bookmark.url) }
    });
    return response;
  });
  app.post("/api/panes/:id/browser/viewport", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(browserSetViewportInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const response = await browserSessionManager.setViewport(pane, input.viewport, request.requestIdForSpace, operatorBrowserActor(request), input.dimensions);
    await recordAudit(store, request, {
      action: "pane.browser.viewport",
      targetType: "pane",
      targetId: pane.id,
      metadata: { roomId: pane.roomId, sessionId: response.session.sessionId, viewport: response.session.viewport }
    });
    return response;
  });
  app.post("/api/panes/:id/browser/action", defaultRouteRateLimitOptions, async (request) => {
    const params = parseQuery(idParamSchema, request.params);
    const input = parseBody(browserToolActionInputSchema, request.body ?? {});
    const pane = await getPaneById(store, params.id);
    assertBrowserPaneCompatible(pane);
    const result = await browserSessionManager.action(pane, input, request.requestIdForSpace, operatorBrowserActor(request));
    await recordAudit(store, request, {
      action: "pane.browser.action",
      targetType: "pane",
      targetId: pane.id,
      metadata: { roomId: pane.roomId, sessionId: result.session.sessionId, actionType: input.type }
    });
    return result;
  });
  return accountControl;
}

import { readFile } from "node:fs/promises";
import { cpus, freemem, loadavg, totalmem } from "node:os";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  NOUS_EFFORT, NOUS_MODEL_ID, freelanceLeadDecisionSchema, listMemoryQuerySchema, freelanceMessageReviewDecisionSchema, jobApplyReviewDecideSchema, mailCopilotReviewDecideSchema,
  mailRuleDecisionSchema, marketingPostReviewDecisionSchema, nousSettingsSchema,
  type AuthUser, type NousCopilot, type NousDecision, type NousOverview, type NousSettings, type Pane, type RoomAgentEvent, type SpaceNotification
} from "@space/contracts";
import { InMemoryNousRepository, PostgresNousRepository, PostgresSpaceStore, type NousRepository, type RoomAgentMonitorRepository } from "@space/db";
import { createCanonicalSpaceMemoryBridge, type CanonicalMemoryBridge, type SpaceStore } from "@space/runtime";
import { cookieName, verifySession } from "../auth.js";
import type { FreelanceCopilotService } from "../freelance-copilot/service.js";
import type { JobApplyService } from "../job-apply/service.js";
import type { MailCopilotService } from "../mail-copilot/service.js";
import type { MarketingCopilotService } from "../marketing-copilot/service.js";
import type { NotificationService } from "../notifications/service.js";
import type { ReleaseTrainActor, ReleaseTrainInput } from "../release-trains.js";
import type { RoomAgentTools } from "../room-agent-tools.js";
import type { RoomPaneObservation } from "../room-pane-control.js";
import type { DashboardAgentsSample } from "../room-routes.js";
import { pickClaudeProfile } from "../chess/chess-players.js";
import { CHESS_MOVE_SOCKET } from "../chess/chess-cli.js";
import { NOUS_MCP_PATH, postToWorker, registerNousMcpRoute, signNousToken } from "./mcp.js";
import { nextPlanStep, paneLabel, renderNousWorld, type NousServerLoad } from "./digest.js";
import { registerNousRoutes } from "./routes.js";
import { registerNousAttachments } from "./attachment-routes.js";
import { nousScorecard, NOUS_SCORECARD_WINDOW_DAYS } from "./progress.js";
import { createNousService, NousUnavailableError, type NousRunner, type NousService } from "./service.js";
import { createNousTools, nousToolDefinitions, type NousCopilotDeps, type NousCopilotItem } from "./tools.js";
import { createCopilotControl, type CopilotInvoke } from "./copilot-control.js";
import { createNousFocus, type NousFocusEventBus } from "./focus.js";

const SETTINGS_CACHE_MS = 15_000;
const HEARTBEAT_MS = 30 * 60_000;

export interface NousWiringOptions {
  config: { databaseUrl?: string | null; instance: string; spaceMemoryIndexPath?: string; spaceMemoryMonthlyPath?: string; spaceMemoryLockPath?: string };
  /** The API as the CLIs reach it (cliAgentFilesApiBaseUrl), for the turn's MCP endpoint. */
  apiBaseUrl: string;
  /** The instance job: the inbox, the heartbeat, holding notifications and taking over auto-answer (stable only by default). */
  autonomous: boolean;
  auth: { sessionSecret: string };
  store: SpaceStore;
  routeOptions: Record<string, unknown>;
  parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, body: unknown): z.infer<TSchema>;
  parseQuery<TSchema extends z.ZodTypeAny>(schema: TSchema, query: unknown): z.infer<TSchema>;
  readActivity(roomId: string): Promise<DashboardAgentsSample>;
  roomTools: Pick<RoomAgentTools, "execute">;
  inspectPane(pane: Pane): Promise<RoomPaneObservation>;
  answerCli(pane: Pane, input: { sessionId: string; answer: string; fingerprint?: string }, traceId: string): Promise<unknown>;
  releaseTrain(input: ReleaseTrainInput, by: ReleaseTrainActor & { operatorApproved?: boolean }): Promise<string>;
  notifications: Pick<NotificationService, "raise" | "resolve" | "list" | "setStatus">;
  copilots: { mail?: MailCopilotService; marketing?: MarketingCopilotService; freelance?: FreelanceCopilotService; job?: JobApplyService };
  /** The owner's own API as Space Control calls it, for space_copilot_control. */
  invoke?: CopilotInvoke;
  /** The app's event stream, for space_focus_pane (ids only). */
  eventBus?: NousFocusEventBus;
  /** The room monitor's events, for Nous's scorecard (how fast waiting panes get unblocked). */
  monitorEvents?: Pick<RoomAgentMonitorRepository, "listEvents">;
  /** Claude Code accounts with their remaining usage, to start each turn on one that has room. */
  claudeUsageProvider(): Promise<{ data: Parameters<typeof pickClaudeProfile>[0] }>;
  repository?: NousRepository;
  runner?: NousRunner;
  /** Space Memory; by default the canonical files the config names. */
  canonicalMemory?: CanonicalMemoryBridge;
}

const TURN_MS = 20 * 60_000;

/**
 * A turn runs as headless Claude Code (Opus 5.5, xhigh) in stable's worker, with Nous's tools over MCP and a token for
 * that turn only. Dev has no Claude Code worker (it must never use stable's socket), like the Council's Claude members.
 */
function workerRunner(options: NousWiringOptions): NousRunner {
  return async ({ owner, turnId, system, prompt }, signal) => {
    if (options.config.instance !== "stable") throw new NousUnavailableError("Nous runs only on the stable instance: its Claude Code turns run in stable's worker.");
    const claudeProfile = await options.claudeUsageProvider().then((usage) => pickClaudeProfile(usage.data)).catch(() => null);
    const result = await postToWorker<{ text?: unknown; isError?: unknown }>(CHESS_MOVE_SOCKET, "/nous-turn", {
      model: NOUS_MODEL_ID, effort: NOUS_EFFORT, claudeProfile, system, prompt, maxTurns: 40, timeoutMs: TURN_MS,
      mcpUrl: `${options.apiBaseUrl}${NOUS_MCP_PATH}`,
      mcpToken: signNousToken(options.auth.sessionSecret, { owner, turnId, expiresAt: Date.now() + TURN_MS + 60_000 })
    }, signal);
    return { text: typeof result.text === "string" ? result.text : "", isError: result.isError === true };
  };
}

export interface NousWiring {
  service: NousService;
  /** On, autonomous here, and its model working. */
  active(owner: string): Promise<boolean>;
  /** A room monitor event (every kind, every room). */
  monitorEvent(event: RoomAgentEvent): void;
  /** A new notification from any source but the Room Agent's monitor and Nous itself. */
  notification(notification: SpaceNotification): void;
  /** The Room Agent's auto-answer leaves this event to Nous (all but the mechanical "continue" after an API error). */
  handles(event: RoomAgentEvent): Promise<boolean>;
}

const ownerOf = (room: { ownerUserId?: string | null }) => room.ownerUserId ?? "user:operator";

/** The host's load; memory from MemAvailable (free memory alone counts the page cache as used). */
async function serverLoad(): Promise<NousServerLoad> {
  const [load1 = 0, load5 = 0] = loadavg();
  const available = await readFile("/proc/meminfo", "utf8").then((text) => Number(/^MemAvailable:\s+(\d+)\s+kB/m.exec(text)?.[1]) * 1024).catch(() => Number.NaN);
  const total = totalmem();
  const used = 1 - (Number.isFinite(available) ? available : freemem()) / total;
  return { load1, load5, cpus: cpus().length, memoryUsedPercent: Math.round(used * 100) };
}
const oneLine = (text: string, max: number) => { const flat = text.replace(/\s+/g, " ").trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };

/** The signed-in ADMIN or OPERATOR. */
async function nousOwner(options: NousWiringOptions, request: FastifyRequest): Promise<string> {
  if (!request.user || !verifySession(request.cookies[cookieName], options.auth.sessionSecret)) {
    throw Object.assign(new Error("Sign in to use Nous."), { statusCode: 401 });
  }
  if (request.user.role !== "ADMIN" && request.user.role !== "OPERATOR") {
    throw Object.assign(new Error("Nous is available to administrators and operators."), { statusCode: 403 });
  }
  return (await options.store.upsertUser(request.user as AuthUser)).id;
}

/** Proof and automation sessions (the agents' broker sessions) never answer Nous's critical decisions. */
function assertPerson(options: NousWiringOptions, request: FastifyRequest): void {
  const session = verifySession(request.cookies[cookieName], options.auth.sessionSecret);
  if (!session || session.id.startsWith("user:operator-proof") || session.id.startsWith("user:proof") || session.proofScope || session.automationScope
    || request.user?.proofScope || request.user?.automationScope) {
    throw Object.assign(new Error("Only the operator answers Nous's decisions, in the Nous dock."), { statusCode: 403 });
  }
}

/** What the copilots wait on, and Nous's answers to their questions (never their reviews: those reach third parties). */
function copilotDeps(options: NousWiringOptions, ownerPanes: (owner: string, mode: Pane["mode"]) => Promise<Pane[]>): NousCopilotDeps | undefined {
  const { mail, marketing, freelance, job } = options.copilots;
  if (!mail && !marketing && !freelance && !job) return undefined;
  const brief = (payload: Record<string, unknown>) => oneLine(String(payload.question ?? payload.summary ?? payload.reasoning ?? ""), 400);
  return {
    ...(options.invoke ? { control: createCopilotControl({ invoke: options.invoke, store: options.store }) } : {}),
    async items(owner) {
      const items: NousCopilotItem[] = [];
      const add = (copilot: NousCopilot, list: Array<{ kind: string; id: string; message: string; payload: Record<string, unknown> }>) =>
        items.push(...list.map((item) => ({ copilot, kind: item.kind, id: item.id, paneId: null, title: oneLine(item.message, 200), detail: brief(item.payload) })));
      if (mail) {
        add("MAIL", await mail.pendingItems(owner, null));
        add("MAIL", (await mail.listRules(owner, { status: ["PROPOSED"] })).map((rule) => ({ kind: "RULE", id: rule.id, message: `Rule proposed: ${rule.name}`, payload: {} })));
      }
      if (marketing) add("MARKETING", await marketing.pendingItems(owner, null));
      if (freelance) add("FREELANCE", await freelance.pendingItems(owner, null));
      if (job) add("JOB", (await job.pendingItems(owner, null)).map((item) => ({ ...item, payload: { ...item.payload, applicationId: item.applicationId } })));
      return items;
    },
    async answerQuestion(owner, input) {
      const answer = { questionId: input.questionId, answer: input.answer };
      if (input.copilot === "MAIL") {
        const pane = (await ownerPanes(owner, "MAIL_COPILOT"))[0];
        if (!mail || !pane) throw new Error("No Mail Copilot pane is open.");
        await mail.answerQuestion(owner, pane, answer, "NOUS");
      } else if (input.copilot === "MARKETING") {
        if (!marketing) throw new Error("Marketing Copilot is not available.");
        await marketing.answerQuestion(owner, null, answer, "NOUS");
      } else if (input.copilot === "FREELANCE") {
        if (!freelance) throw new Error("Freelance Copilot is not available.");
        await freelance.answerQuestion(owner, null, answer, "NOUS");
      } else {
        const item = job ? (await job.pendingItems(owner, null)).find((entry) => entry.kind === "QUESTION" && entry.id === input.questionId) : null;
        if (!job || !item?.applicationId) throw new Error("That Job Copilot question is not waiting any more.");
        await job.answerQuestion(owner, item.applicationId, answer, {}, "NOUS");
      }
      return "Answered; the copilot continues with it.";
    },
    async state(owner, pane) {
      const service = pane.mode === "FREELANCE_COPILOT" ? freelance : pane.mode === "MARKETING_COPILOT" ? marketing : undefined;
      if (!service) throw new Error("Only Freelance and Marketing Copilot panes have a run to read here.");
      const [run, events] = await Promise.all([service.runView(owner, pane), service.listEvents(owner, { paneId: pane.id, limit: 20 })]);
      return JSON.stringify({ run, events });
    },
    async brief(owner, pane, text) {
      if (pane.mode === "MARKETING_COPILOT" && marketing) { await marketing.createBrief(owner, pane, { text }); return "The Marketing Copilot has the brief; it works on it in its next run."; }
      if (pane.mode === "FREELANCE_COPILOT" && freelance) { await freelance.createBrief(owner, pane, { text }); return "The Freelance Copilot has the brief; it works on it in its next run."; }
      throw new Error("Only Marketing and Freelance Copilot panes take briefs; Mail and Job Copilots take answers to their questions.");
    }
  };
}

/** Builds Nous, registers its routes and returns the hooks the monitor, the notifications and the auto-answer call. */
export function registerNous(app: FastifyInstance, options: NousWiringOptions): NousWiring {
  const { store } = options;
  const databaseUrl = store instanceof PostgresSpaceStore && options.config.databaseUrl ? options.config.databaseUrl : null;
  const repository = options.repository ?? (databaseUrl ? PostgresNousRepository.fromConnectionString(databaseUrl) : new InMemoryNousRepository());
  const runner = options.runner ?? workerRunner(options);

  const settingsCache = new Map<string, { value: NousSettings; expires: number }>();
  async function settings(owner: string): Promise<NousSettings> {
    const cached = settingsCache.get(owner);
    if (cached && cached.expires > Date.now()) return cached.value;
    const value = nousSettingsSchema.parse((await store.getUserSettings(owner)).nous ?? {});
    settingsCache.set(owner, { value, expires: Date.now() + SETTINGS_CACHE_MS });
    return value;
  }

  const liveRooms = async (owner: string) => (await store.listRooms(owner)).filter((room) => !room.archivedAt && room.kind !== "CLI_RECOVERY");
  async function ownerPanes(owner: string, mode: Pane["mode"]): Promise<Pane[]> {
    const panes = await Promise.all((await liveRooms(owner)).map((room) => Promise.resolve(store.listPanes(room.id))));
    return panes.flat().filter((pane) => pane.mode === mode && !pane.isClosed);
  }

  async function world(owner: string): Promise<{ text: string; overview: NousOverview }> {
    const rooms = await liveRooms(owner);
    const [samples, notifications, plans, open, running, trains, decisions, notes, server] = await Promise.all([
      Promise.all(rooms.map(async (room) => ({ room, sample: await options.readActivity(room.id).catch(() => null) }))),
      options.notifications.list(owner, { status: "OPEN", limit: 80 }).then((items) => items.filter((item) => item.source !== "NOUS" && item.severity !== "INFO")),
      Promise.resolve(store.listClipboardItems(owner, { source: "PLAN", includeCompleted: false, page: 1, pageSize: 100 })).then((result) => result.items),
      Promise.resolve(store.listTaskItems(owner, { status: "OPEN", page: 1, pageSize: 100 })).then((result) => result.items),
      Promise.resolve(store.listTaskItems(owner, { status: "RUNNING", page: 1, pageSize: 100 })).then((result) => result.items),
      options.releaseTrain({ op: "status", product: "run-spaceapp" }, { roomId: "", pane: null, paneSelf: false }).catch(() => "The release trains could not be read now."),
      repository.listDecisions(owner, { statuses: ["OPEN"], limit: 20 }),
      repository.listNotes(owner),
      serverLoad().catch(() => null)
    ]);
    const text = renderNousWorld({ rooms: samples, notifications, plans, tasks: [...running, ...open], trains, decisions, notes, now: new Date().toISOString(), server });
    const roomName = new Map(rooms.map((room) => [room.id, room.name]));
    const handsKinds = /SIGN_IN|HANDOFF|USAGE_LIMIT|ACCOUNT|CAPTCHA|LOGIN/i;
    const overview: NousOverview = {
      plans: plans.map((plan) => ({ id: plan.id, title: plan.title ?? oneLine(plan.text, 80), progress: plan.progressPercentage, status: plan.executionStatus,
        room: plan.roomId ? roomName.get(plan.roomId) ?? null : null, pane: plan.paneTitle, nextStep: nextPlanStep(plan) })),
      needsHands: notifications.filter((item) => item.source === "BROWSER_HANDOFF" || handsKinds.test(item.kind))
        .map((item) => ({ id: item.id, source: item.source, title: item.title, room: item.roomId ? roomName.get(item.roomId) ?? null : null })),
      trains,
      planMap: notes.find((note) => note.key === "plan-map")?.text ?? null
    };
    return { text, overview };
  }

  /** The action of a decision the operator approved; the server runs exactly this, as the operator. */
  async function executeAction(decision: NousDecision): Promise<string> {
    const action = decision.action!;
    const owner = decision.ownerUserId;
    if (action.type === "PANE_TEXT") {
      const room = await store.getRoom(action.roomId);
      const pane = await store.getPane(action.paneId);
      if (ownerOf(room) !== owner || pane.roomId !== room.id) throw new Error("That pane is not in one of your rooms.");
      if (action.mode === "PROMPT") {
        const outcome = await options.roomTools.execute("send_to_pane", { panes: [pane.id], text: action.text }, {
          roomId: room.id, agentPaneId: "", actorId: owner, requestId: `nous:${decision.id}`, traceId: `nous:${decision.id}`, confirmed: true });
        if (!outcome.ok) throw new Error(outcome.result || outcome.display);
        return `Sent to ${paneLabel(pane)} in ${room.name}.`;
      }
      const observed = await options.inspectPane(pane);
      if (!observed.sessionId) throw new Error(`${paneLabel(pane)} has no running CLI.`);
      if (action.fingerprint && observed.promptFingerprint !== action.fingerprint) return `Not answered: ${paneLabel(pane)}'s prompt changed after you decided.`;
      await options.answerCli(pane, { sessionId: observed.sessionId, answer: action.text, ...(observed.promptFingerprint ? { fingerprint: observed.promptFingerprint } : {}) }, `nous:${decision.id}`);
      return `Answered ${paneLabel(pane)}'s prompt in ${room.name}.`;
    }
    if (action.type === "SPACE_CONTROL") {
      const room = await store.getRoom(action.roomId);
      if (ownerOf(room) !== owner) throw new Error("That room is not one of your rooms.");
      // On the operator's yes the batch runs confirmed; a deploy stays refused by the Room Agent's own check.
      const outcome = await options.roomTools.execute("space_control", { tool: "space_execute", arguments: { actions: action.actions } }, {
        roomId: room.id, agentPaneId: "", actorId: owner, requestId: `nous:${decision.id}`, traceId: `nous:${decision.id}`, confirmed: true });
      if (!outcome.ok) throw new Error(outcome.refused ?? (outcome.result || outcome.display));
      return `${outcome.display} in ${room.name}.`;
    }
    if (action.type === "RELEASE_APPROVE") {
      await options.releaseTrain({ op: "approve" as ReleaseTrainInput["op"], product: action.product }, { roomId: "", pane: null, paneSelf: false, operatorApproved: true });
      return `Approved the ${action.product} release train at its candidate commit.`;
    }
    const { mail, marketing, freelance, job } = options.copilots;
    const pane = action.paneId ? await Promise.resolve().then(() => store.getPane(action.paneId!)).catch(() => null) : null;
    if (pane && ownerOf(await store.getRoom(pane.roomId)) !== owner) throw new Error("That pane is not in one of your rooms.");
    const note = action.note ? { note: action.note } : {};
    switch (`${action.copilot}:${action.item}`) {
      case "MAIL:REVIEW": {
        const mailPane = pane ?? (await ownerPanes(owner, "MAIL_COPILOT"))[0];
        if (!mail || !mailPane) throw new Error("No Mail Copilot pane is open.");
        await mail.decideReview(owner, mailPane, mailCopilotReviewDecideSchema.parse({ reviewId: action.itemId, decision: action.decision, ...(action.text ? { text: action.text } : {}), ...note }));
        break;
      }
      case "MAIL:RULE":
        if (!mail) throw new Error("Mail Copilot is not available.");
        await mail.decideRule(owner, pane, action.itemId, mailRuleDecisionSchema.parse({ decision: action.decision }));
        break;
      case "MARKETING:REVIEW":
        if (!marketing) throw new Error("Marketing Copilot is not available.");
        await marketing.decideReview(owner, pane, action.itemId, marketingPostReviewDecisionSchema.parse({ decision: action.decision, ...(action.text ? { body: action.text } : {}), ...note }));
        break;
      case "MARKETING:CAMPAIGN":
        if (!marketing || !["approve", "complete", "cancel"].includes(action.decision)) throw new Error("Unknown campaign decision.");
        await marketing.decideCampaign(owner, pane, action.itemId, action.decision as "approve" | "complete" | "cancel");
        break;
      case "MARKETING:RULE":
      case "FREELANCE:RULE": {
        const service = action.copilot === "MARKETING" ? marketing : freelance;
        if (!service || !["approve", "reject", "retire"].includes(action.decision)) throw new Error("Unknown rule decision.");
        await service.decideRule(owner, pane, action.itemId, action.decision as "approve" | "reject" | "retire");
        break;
      }
      case "FREELANCE:REVIEW":
        if (!freelance) throw new Error("Freelance Copilot is not available.");
        await freelance.decideReview(owner, pane, action.itemId, freelanceMessageReviewDecisionSchema.parse({ decision: action.decision, ...(action.text ? { body: action.text } : {}), ...note }));
        break;
      case "FREELANCE:LEAD":
        if (!freelance) throw new Error("Freelance Copilot is not available.");
        await freelance.decideLead(owner, pane, action.itemId, freelanceLeadDecisionSchema.parse({ decision: action.decision, ...note }));
        break;
      case "JOB:REVIEW": {
        const item = job ? (await job.pendingItems(owner, null)).find((entry) => entry.kind === "REVIEW" && entry.id === action.itemId) : null;
        if (!job || !item?.applicationId) throw new Error("That Job Copilot review is not waiting any more.");
        await job.decideReview(owner, item.applicationId, jobApplyReviewDecideSchema.parse({ reviewId: action.itemId, decision: action.decision, ...note }));
        break;
      }
      default:
        throw new Error(`Nous cannot decide a ${action.copilot.toLowerCase()} ${action.item.toLowerCase()}.`);
    }
    return `The ${action.copilot.toLowerCase()} copilot's ${action.item.toLowerCase()} was ${action.decision === "approve" ? "approved" : action.decision}.`;
  }

  const { spaceMemoryIndexPath: indexPath, spaceMemoryMonthlyPath: monthlyPath, spaceMemoryLockPath: lockPath } = options.config;
  const memory = options.canonicalMemory ?? (indexPath && monthlyPath && lockPath ? createCanonicalSpaceMemoryBridge({ indexPath, monthlyPath, lockPath }) : null);

  // The tools ask through the service, which needs the tools: the service is set right below.
  const late: { service?: NousService } = {};
  const tools = createNousTools({
    world: async (owner) => (await world(owner)).text,
    rooms: liveRooms,
    listPanes: async (roomId) => store.listPanes(roomId),
    inspectPane: options.inspectPane,
    roomTool: (name, args, ctx) => options.roomTools.execute(name, args, ctx),
    plans: {
      list: async (owner, includeCompleted) => (await store.listClipboardItems(owner, { source: "PLAN", includeCompleted, page: 1, pageSize: 100 })).items,
      get: async (owner, id) => store.getClipboardItem(owner, id),
      update: async (owner, id, input) => store.updateClipboardItemProgress(owner, id, input)
    },
    tasks: {
      list: async (owner) => [
        ...(await store.listTaskItems(owner, { status: "RUNNING", page: 1, pageSize: 100 })).items,
        ...(await store.listTaskItems(owner, { status: "OPEN", page: 1, pageSize: 100 })).items
      ],
      add: async (owner, input) => store.upsertTaskItem({ ownerUserId: owner, title: input.title, objective: input.objective, status: "OPEN", source: "AGENT",
        roomId: input.roomId, paneId: input.paneId, paneTitle: input.paneTitle, schedule: input.schedule }),
      update: async (owner, id, input) => store.updateTaskItem(owner, id, input),
      async rebind(owner, id, binding) {
        const task = await store.getTaskItem(owner, id);
        if (!task) throw new Error(`No task ${id}.`);
        // Tasks are keyed by their objective: saving it again with the new pane moves the task and keeps its schedule.
        return store.upsertTaskItem({ ownerUserId: owner, title: task.title, objective: task.objective, status: task.status, source: task.source, ...binding });
      }
    },
    clipboard: {
      list: async (owner, query) => (await store.listClipboardItems(owner, { ...query, page: 1, pageSize: 50 })).items,
      save: async (input) => store.upsertClipboardItem(input),
      complete: async (owner, id, completed) => store.setClipboardItemCompleted(owner, id, completed),
      remove: async (owner, id) => { await store.deleteClipboardItem(owner, id); }
    },
    memory: memory && {
      recall: (query, limit) => memory.list(listMemoryQuerySchema.parse({ q: query.slice(0, 200), pageSize: limit })),
      save: (input, traceId) => memory.save(input, traceId)
    },
    notifications: {
      list: async (owner) => (await options.notifications.list(owner, { status: "OPEN", limit: 100 })).filter((item) => item.source !== "NOUS"),
      resolve: async (owner, id) => Boolean(await options.notifications.setStatus(owner, id, "RESOLVED"))
    },
    releaseTrain: (input, by) => options.releaseTrain(input, by),
    setNote: (owner, key, text) => repository.setNote(owner, key, text),
    answerPrompt: (pane, input, traceId) => options.answerCli(pane, input, traceId),
    allowances: async (owner) => { const value = await settings(owner); return { promote: value.mayPromote, warm: value.mayApproveWarm }; },
    ask: (input) => late.service!.ask(input),
    withdraw: async (owner, id, reason) => Boolean(await late.service!.withdraw(owner, id, reason)),
    copilots: copilotDeps(options, ownerPanes),
    progress: (owner) => progress(owner),
    ...(options.eventBus ? { focus: createNousFocus({ eventBus: options.eventBus }) } : {})
  });
  const service = late.service = createNousService({
    repository, runner, tools, world, settings,
    async saveSettings(owner, value) {
      const saved = nousSettingsSchema.parse((await store.updateUserSettings(owner, { nous: value })).nous ?? value);
      settingsCache.set(owner, { value: saved, expires: Date.now() + SETTINGS_CACHE_MS });
      return saved;
    },
    notifications: options.notifications,
    executeAction,
    autonomous: options.autonomous,
    log: { warn: (details, message) => app.log.warn(details, message) }
  });

  const active = async (owner: string) => options.autonomous && await service.active(owner).catch(() => false);
  const roomOwner = async (roomId: string) => ownerOf(await Promise.resolve(store.getRoom(roomId)));

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  app.addHook("onReady", async () => {
    const failed = await service.recover().catch(() => 0);
    if (failed > 0) app.log.info({ failed }, "Nous turns interrupted by the restart were closed.");
    if (!options.autonomous) return;
    heartbeat = setInterval(() => {
      void (async () => {
        const owners = new Set((await store.listRooms()).map(ownerOf));
        for (const owner of owners) {
          if (!(await active(owner))) continue;
          const plans = (await store.listClipboardItems(owner, { source: "PLAN", includeCompleted: false, page: 1, pageSize: 1 })).total;
          if (plans > 0) await service.notice(owner, "heartbeat", `Heartbeat: ${plans} open plan${plans === 1 ? "" : "s"}; check what stalled.`);
        }
      })().catch((error) => app.log.warn({ err: error }, "Nous heartbeat failed."));
    }, HEARTBEAT_MS);
    heartbeat.unref?.();
  });
  app.addHook("onClose", async () => {
    if (heartbeat) clearInterval(heartbeat);
    service.stopAll();
    await repository.dispose();
  });

  const definitions = nousToolDefinitions({ copilots: Boolean(copilotDeps(options, ownerPanes)) });
  async function progress(owner: string) {
    const now = Date.now();
    const [facts, decisions, rooms] = await Promise.all([repository.listTurnFacts(owner, new Date(now - NOUS_SCORECARD_WINDOW_DAYS * 86_400_000).toISOString()),
      repository.listDecisions(owner, { limit: 200 }), liveRooms(owner)]);
    // shortcut: the newest 200 monitor events per room; a room busier than that in a week loses its oldest waits, add a since filter then.
    const events = options.monitorEvents ? (await Promise.all(rooms.map((room) => options.monitorEvents!.listEvents(room.id, { limit: 200 })))).flat() : [];
    return nousScorecard({ now, facts, decisions, events, tools: definitions });
  }
  const attachments = registerNousAttachments(app, { config: options.config, routeOptions: options.routeOptions, owner: (request) => nousOwner(options, request), parseQuery: options.parseQuery });
  registerNousMcpRoute(app, { secret: options.auth.sessionSecret, service, tools: definitions, routeOptions: options.routeOptions, attachments });
  registerNousRoutes(app, service, { routeOptions: options.routeOptions, owner: (request) => nousOwner(options, request),
    assertPerson: (request) => assertPerson(options, request), parseBody: options.parseBody, parseQuery: options.parseQuery, progress, attachments });

  const warn = (error: unknown, message: string) => app.log.warn({ err: error }, message);
  return {
    service,
    active,
    monitorEvent(event) {
      if (!options.autonomous || (event.kind !== "FINISHED" && event.status !== "OPEN" && event.status !== "ESCALATED")) return;
      void (async () => {
        const owner = await roomOwner(event.roomId);
        if (!(await active(owner))) return;
        const room = await store.getRoom(event.roomId);
        const pane = event.paneId ? await Promise.resolve().then(() => store.getPane(event.paneId!)).catch(() => null) : null;
        await service.notice(owner, `monitor:${event.paneId ?? event.roomId}:${event.kind}`,
          `Room "${room.name}"${pane ? ` pane ${paneLabel(pane)}` : ""}: ${event.kind} — ${event.title}${event.detail ? ` (${oneLine(event.detail, 200)})` : ""}`);
      })().catch((error) => warn(error, "Nous could not take a monitor event."));
    },
    notification(item) {
      if (!options.autonomous || item.source === "ROOM_AGENT" || item.source === "NOUS" || item.severity === "INFO") return;
      void service.notice(item.ownerUserId, `notification:${item.dedupeKey ?? item.id}`,
        `${item.source} ${item.kind}: ${item.title}${item.body ? ` — ${oneLine(item.body, 200)}` : ""} [${item.id}]`).catch((error) => warn(error, "Nous could not take a notification."));
    },
    async handles(event) {
      return event.kind !== "STUCK" && await active(await roomOwner(event.roomId)).catch(() => false);
    }
  };
}

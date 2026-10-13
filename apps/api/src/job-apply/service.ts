import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  canTransitionJobApplication,
  fieldBecomesAnswerMemory,
  jobApplicationCreateSchema,
  jobApplicationFieldSchema,
  jobApplicationSchema,
  jobApplicationUpdateSchema,
  jobApplyCandidateSchema,
  jobApplyEventSchema,
  jobApplyMailboxConfigSchema,
  jobApplyMemoryCreateSchema,
  jobApplyMemoryQuerySchema,
  jobApplyMemorySchema,
  jobApplyMemoryUpdateSchema,
  jobApplyProfileSchema,
  jobApplyProfileUpdateSchema,
  jobApplyQaEntrySchema,
  jobApplyRunSchema,
  jobApplySiteFromBoard,
  jobPostingFromUrl,
  normalizeJobApplyKey,
  resolveJobApplyPaneMetadata,
  type Artifact,
  type JobApplication,
  type JobApplicationCreate,
  type JobApplicationField,
  type JobApplicationFieldInput,
  type JobApplicationStatus,
  type JobApplicationUpdate,
  type JobApplyEvent,
  type JobApplyDiscoverRequest,
  type JobApplyDiscoverySite,
  type JobApplyEventInput,
  type JobApplyEventType,
  type JobApplyMailboxInput,
  type JobApplyMemory,
  type JobApplyMemoryCreate,
  type JobApplyMemoryQuery,
  type JobApplyMemoryUpdate,
  type JobApplyPaneMetadata,
  type JobApplyPendingItem,
  type JobApplyProfile,
  type JobApplyProfileUpdate,
  type JobApplyReportOutcome,
  type JobApplyReviewDecision,
  type JobApplyRun,
  type JobApplyRunCounters,
  type JobApplyRunView,
  type JobApplySite
} from "@space/contracts";
import type { JobApplicationFieldRecord, JobApplicationRecord, JobApplyEventRecord, JobApplyMemoryRecord, JobApplyProfileRecord, JobApplyRepository, JobApplyRunRecord } from "@space/db";
import { SpaceConflictError, SpaceNotFoundError, type SpaceStore } from "@space/runtime";
import { localArtifactFilePath } from "../artifact-storage.js";
import { readAttachment, type AttachmentReaderOptions } from "../attachment-readers.js";
import type { ConnectorCrypto } from "../dot-connectors.js";
import { createDiscovery, type Discovery } from "./discovery.js";
import { extractCode, extractLinksFromText, type MailboxFactory, type MailboxMessageSummary, type MailboxReader } from "./mailbox.js";

export interface JobApplyServiceOptions {
  repository: JobApplyRepository;
  crypto: ConnectorCrypto;
  store: Pick<SpaceStore, "getArtifact">;
  artifactRoot: string;
  /** Extracted CV text and read cache live here, outside any agent workspace. */
  jobApplyRoot: string;
  mailboxes: MailboxFactory;
  /** Reader worker and limits; tests point `workerPath` at the TypeScript worker. */
  readerOptions?: Pick<AttachmentReaderOptions, "workerPath" | "timeoutMs" | "memoryLimitBytes">;
  now?: () => string;
  /** Every recorded activity event, after it is stored (live broadcast, notifications). */
  onEvent?: (event: JobApplyEvent) => void;
  /** Public ATS board search; tests inject a fake fetch. */
  discovery?: Discovery;
}

export class JobApplyMailboxError extends SpaceConflictError {}

/** Where an application update came from: the pane and run the agent is working in. */
export interface JobApplyEventContext { paneId?: string | null; runId?: string | null }

const MAX_CV_TEXT = 200_000;
const APPLIED_STATUSES: JobApplicationStatus[] = ["SUBMITTED", "VERIFIED"];
const STATUS_EVENT: Partial<Record<JobApplicationStatus, JobApplyEventType>> = {
  FILLING: "STARTED", NEEDS_USER: "QUESTION", SUBMITTED: "SUBMITTED", VERIFIED: "VERIFIED", FAILED: "FAILED", QUEUED: "NOTE"
};

function toProfile(record: JobApplyProfileRecord): JobApplyProfile {
  return jobApplyProfileSchema.parse({
    ownerUserId: record.ownerUserId,
    candidate: jobApplyCandidateSchema.parse(record.candidate ?? {}),
    qaBank: (record.qaBank ?? []).flatMap((entry) => { const parsed = jobApplyQaEntrySchema.safeParse(entry); return parsed.success ? [parsed.data] : []; }),
    cvArtifactId: record.cvArtifactId,
    coverLetterArtifactId: record.coverLetterArtifactId,
    cvTextChars: record.cvText?.length ?? 0,
    mailbox: record.mailbox ? jobApplyMailboxConfigSchema.parse(record.mailbox) : null,
    mailboxVerifiedAt: record.mailboxVerifiedAt,
    updatedAt: record.updatedAt
  });
}

function toApplication(record: JobApplicationRecord): JobApplication {
  return jobApplicationSchema.parse(record);
}
function toMemory(record: JobApplyMemoryRecord): JobApplyMemory {
  return jobApplyMemorySchema.parse(record);
}
function toField(record: JobApplicationFieldRecord): JobApplicationField {
  return jobApplicationFieldSchema.parse(record);
}
function toEvent(record: JobApplyEventRecord): JobApplyEvent {
  return jobApplyEventSchema.parse(record);
}
function toRun(record: JobApplyRunRecord): JobApplyRun {
  return jobApplyRunSchema.parse({ ...record, counters: { taken: 0, submitted: 0, verified: 0, failed: 0, needsUser: 0, ...record.counters } });
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const NEXT_JOB_POLL_MS = 2_000;
const NEXT_JOB_MAX_WAIT_MS = 120_000;

/** Exact normalized key first, then the longest stored question contained in (or containing) the asked one. */
export function matchAnswerMemory(memories: JobApplyMemory[], question: string): JobApplyMemory | null {
  const asked = normalizeJobApplyKey(question);
  if (!asked) return null;
  const exact = memories.find((memory) => memory.key === asked);
  if (exact) return exact;
  return memories
    .filter((memory) => memory.key !== null && memory.key.length >= 8 && (asked.includes(memory.key) || memory.key.includes(asked)))
    .sort((left, right) => (right.key?.length ?? 0) - (left.key?.length ?? 0))[0] ?? null;
}

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === "\"") {
        if (text[index + 1] === "\"") { field += "\""; index += 1; } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === "\"") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function createJobApplyService(options: JobApplyServiceOptions) {
  const now = options.now ?? (() => new Date().toISOString());
  const { repository, crypto } = options;
  const discovery = options.discovery ?? createDiscovery();

  async function profileRecord(owner: string): Promise<JobApplyProfileRecord> {
    return (await repository.getProfile(owner)) ?? repository.upsertProfile(owner, {});
  }

  async function record(owner: string, input: JobApplyEventInput & JobApplyEventContext & { type: JobApplyEventType }): Promise<JobApplyEvent> {
    const event = toEvent(await repository.createEvent({
      ownerUserId: owner, paneId: input.paneId ?? null, applicationId: input.applicationId ?? null, runId: input.runId ?? null,
      type: input.type, message: input.message.slice(0, 1000), payload: input.payload ?? {}, artifactId: input.artifactId ?? null
    }));
    try {
      options.onEvent?.(event);
    } catch {
      // Listeners never break the write.
    }
    return event;
  }

  /** The v1 Q&A bank becomes ANSWER memories once; the bank is then empty and memory is the only answer source. */
  const migratedQaOwners = new Set<string>();
  async function ensureQaBankMigrated(owner: string): Promise<void> {
    if (migratedQaOwners.has(owner)) return;
    migratedQaOwners.add(owner);
    const profile = await profileRecord(owner);
    const entries = (profile.qaBank ?? []).flatMap((entry) => { const parsed = jobApplyQaEntrySchema.safeParse(entry); return parsed.success ? [parsed.data] : []; });
    if (entries.length === 0) return;
    for (const entry of entries) {
      const key = normalizeJobApplyKey(entry.question);
      if (!key || !entry.answer.trim()) continue;
      await repository.upsertMemoryByKey({ ownerUserId: owner, kind: "ANSWER", key, text: entry.answer.trim(), site: null, company: null, tags: ["qa-bank"],
        source: entry.source, confidence: entry.source === "USER" || entry.source === "PROFILE" ? 0.95 : 0.75, pinned: false });
    }
    await repository.upsertProfile(owner, { qaBank: [] });
  }

  /** Active job_next pollers per pane: a Start with none waiting must send the kickoff prompt again. */
  const nextJobWaiters = new Map<string, number>();
  function summarizeCounters(counters: Record<string, number>): string {
    return `${counters.submitted ?? 0} submitted, ${counters.verified ?? 0} verified, ${counters.failed ?? 0} failed, ${counters.needsUser ?? 0} need you`;
  }

  async function rememberAnswerFromField(owner: string, application: JobApplicationRecord, field: JobApplicationFieldInput): Promise<void> {
    if (!fieldBecomesAnswerMemory(field) || !field.value) return;
    await repository.upsertMemoryByKey({ ownerUserId: owner, kind: "ANSWER", key: normalizeJobApplyKey(field.label), text: field.value.trim().slice(0, 4000),
      site: null, company: null, tags: ["form", application.ats], source: field.source,
      confidence: field.source === "USER" || field.source === "PROFILE" ? 0.95 : 0.7, pinned: false });
  }

  async function openMailbox(owner: string): Promise<MailboxReader> {
    const record = await profileRecord(owner);
    if (!record.mailbox || !record.mailboxPasswordEncrypted) throw new JobApplyMailboxError("Connect a mailbox in the Job Copilot pane first.");
    const config = jobApplyMailboxConfigSchema.parse(record.mailbox);
    let password: string;
    try {
      password = crypto.open(record.mailboxPasswordEncrypted);
    } catch {
      throw new JobApplyMailboxError("The saved mailbox password cannot be read any more. Reconnect the mailbox.");
    }
    try {
      return await options.mailboxes.open(config, password);
    } catch (error) {
      throw new JobApplyMailboxError(`Mailbox connection failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
    }
  }

  async function assertTransition(owner: string, id: string, next: JobApplicationStatus | undefined, patch: JobApplicationUpdate) {
    const current = await repository.getApplication(owner, id);
    if (!current) throw new SpaceNotFoundError(`Application ${id} was not found.`);
    if (next && !canTransitionJobApplication(current.status as JobApplicationStatus, next)) {
      throw new SpaceConflictError(`Application ${id} cannot move from ${current.status} to ${next}.`);
    }
    if (next === "VERIFIED") {
      const evidence = patch.evidenceArtifactIds ?? current.evidenceArtifactIds;
      const confirmation = patch.externalConfirmation === undefined ? current.externalConfirmation : patch.externalConfirmation;
      if (evidence.length === 0 && !confirmation) {
        throw new SpaceConflictError("VERIFIED needs evidence: a confirmation screenshot artifact or a confirmation reference.");
      }
    }
    return current;
  }

  return {
    /** The construction options, so a caller can derive a service with extra listeners. */
    options,
    async getProfile(owner: string): Promise<JobApplyProfile> {
      return toProfile(await profileRecord(owner));
    },
    async updateProfile(owner: string, input: JobApplyProfileUpdate): Promise<JobApplyProfile> {
      const update = jobApplyProfileUpdateSchema.parse(input);
      const patch: Parameters<JobApplyRepository["upsertProfile"]>[1] = {};
      if (update.candidate) patch.candidate = update.candidate;
      if (update.qaBank) patch.qaBank = update.qaBank;
      if (update.cvArtifactId !== undefined) patch.cvArtifactId = update.cvArtifactId;
      if (update.coverLetterArtifactId !== undefined) patch.coverLetterArtifactId = update.coverLetterArtifactId;
      return toProfile(await repository.upsertProfile(owner, patch));
    },
    /** Extracts the CV text (PDF, DOCX, text) from an Agent Files artifact and remembers both. */
    async importCv(owner: string, artifactId: string): Promise<{ profile: JobApplyProfile; coverage: string; textPreview: string }> {
      let artifact: Artifact;
      try {
        artifact = await options.store.getArtifact(artifactId);
      } catch {
        throw new SpaceNotFoundError(`Artifact ${artifactId} was not found.`);
      }
      if (artifact.deletedAt) throw new SpaceNotFoundError(`Artifact ${artifactId} was deleted.`);
      const sourcePath = localArtifactFilePath({ artifactRoot: options.artifactRoot, artifact });
      const ownerDir = join(options.jobApplyRoot, owner.replace(/[^A-Za-z0-9_-]/g, "_"));
      await mkdir(join(ownerDir, "reads"), { recursive: true, mode: 0o750 });
      const filename = typeof artifact.metadata.originalFilename === "string" ? artifact.metadata.originalFilename : artifact.id;
      const result = await readAttachment(
        { artifactId: artifact.id, sourcePath, filename, mimeType: artifact.mimeType, byteSize: artifact.byteSize, sha256: artifact.sha256 },
        { outputDir: join(ownerDir, "reads"), cacheDir: join(options.jobApplyRoot, "read-cache"), maxChars: MAX_CV_TEXT, ...options.readerOptions }
      );
      if (result.coverage.status === "UNAVAILABLE" || !result.outputPath) {
        throw new SpaceConflictError(`The CV could not be read (${result.coverage.reason ?? "no text"}). Use a PDF, DOCX or text file.`);
      }
      const text = (await readFile(result.outputPath, "utf8")).slice(0, MAX_CV_TEXT);
      const record = await repository.upsertProfile(owner, { cvArtifactId: artifact.id, cvText: text });
      return { profile: toProfile(record), coverage: result.coverage.status, textPreview: text.slice(0, 1200) };
    },
    async cvText(owner: string): Promise<{ artifactId: string | null; path: string | null; text: string | null }> {
      const record = await profileRecord(owner);
      let path: string | null = null;
      if (record.cvArtifactId) {
        try {
          path = localArtifactFilePath({ artifactRoot: options.artifactRoot, artifact: await options.store.getArtifact(record.cvArtifactId) });
        } catch {
          path = null;
        }
      }
      return { artifactId: record.cvArtifactId, path, text: record.cvText };
    },
    async artifactPath(artifactId: string): Promise<string | null> {
      try {
        return localArtifactFilePath({ artifactRoot: options.artifactRoot, artifact: await options.store.getArtifact(artifactId) });
      } catch {
        return null;
      }
    },
    async setMailbox(owner: string, input: JobApplyMailboxInput): Promise<JobApplyProfile> {
      const { password, ...config } = input;
      let reader: MailboxReader;
      try {
        reader = await options.mailboxes.open(config, password);
      } catch (error) {
        throw new JobApplyMailboxError(`Mailbox connection failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`);
      }
      await reader.close().catch(() => undefined);
      const record = await repository.upsertProfile(owner, { mailbox: config, mailboxPasswordEncrypted: crypto.seal(password), mailboxVerifiedAt: now() });
      return toProfile(record);
    },
    async testMailbox(owner: string): Promise<{ ok: true; verifiedAt: string; recent: MailboxMessageSummary[] }> {
      const reader = await openMailbox(owner);
      try {
        const recent = await reader.recent({ limit: 3 });
        const verifiedAt = now();
        await repository.upsertProfile(owner, { mailboxVerifiedAt: verifiedAt });
        return { ok: true, verifiedAt, recent };
      } finally {
        await reader.close().catch(() => undefined);
      }
    },
    async clearMailbox(owner: string): Promise<JobApplyProfile> {
      return toProfile(await repository.upsertProfile(owner, { mailbox: null, mailboxPasswordEncrypted: null, mailboxVerifiedAt: null }));
    },
    /** Polls the mailbox for a code until `timeoutMs`; the agent only ever receives the code. */
    async waitForCode(owner: string, input: { fromContains?: string | null; subjectContains?: string | null; pattern: string; since?: string | null; timeoutMs: number; pollMs?: number }) {
      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern, "i");
      } catch {
        throw new SpaceConflictError("pattern must be a valid regular expression.");
      }
      const deadline = Date.now() + Math.min(input.timeoutMs, 180_000);
      const pollMs = Math.max(2_000, input.pollMs ?? 8_000);
      for (;;) {
        const reader = await openMailbox(owner);
        try {
          const messages = await reader.texts({ fromContains: input.fromContains, subjectContains: input.subjectContains, since: input.since, limit: 10 });
          for (const message of messages) {
            const code = extractCode(message.text, regex);
            if (code) return { code, from: message.from, subject: message.subject, receivedAt: message.receivedAt };
          }
        } finally {
          await reader.close().catch(() => undefined);
        }
        if (Date.now() >= deadline) return null;
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
      }
    },
    async findLink(owner: string, input: { fromContains?: string | null; subjectContains?: string | null; urlContains?: string | null; since?: string | null; timeoutMs: number; pollMs?: number }) {
      const deadline = Date.now() + Math.min(input.timeoutMs, 180_000);
      const pollMs = Math.max(2_000, input.pollMs ?? 8_000);
      for (;;) {
        const reader = await openMailbox(owner);
        try {
          const messages = await reader.texts({ fromContains: input.fromContains, subjectContains: input.subjectContains, since: input.since, limit: 10 });
          for (const message of messages) {
            const [link] = extractLinksFromText(message.text, input.urlContains);
            if (link) return { link, from: message.from, subject: message.subject, receivedAt: message.receivedAt };
          }
        } finally {
          await reader.close().catch(() => undefined);
        }
        if (Date.now() >= deadline) return null;
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(0, deadline - Date.now()))));
      }
    },
    async recentMail(owner: string, input: { fromContains?: string | null; subjectContains?: string | null; since?: string | null; limit: number }) {
      const reader = await openMailbox(owner);
      try {
        return await reader.recent({ ...input, limit: Math.min(input.limit, 20) });
      } finally {
        await reader.close().catch(() => undefined);
      }
    },
    async listApplications(owner: string, filter: { status?: JobApplicationStatus; limit: number }): Promise<JobApplication[]> {
      return (await repository.listApplications(owner, filter)).map(toApplication);
    },
    async getApplication(owner: string, id: string): Promise<JobApplication> {
      const record = await repository.getApplication(owner, id);
      if (!record) throw new SpaceNotFoundError(`Application ${id} was not found.`);
      return toApplication(record);
    },
    /** Same URL twice is the same application: the existing row is returned instead of a duplicate. */
    async createApplication(owner: string, raw: JobApplicationCreate, context: JobApplyEventContext = {}): Promise<{ application: JobApplication; created: boolean }> {
      const input = jobApplicationCreateSchema.parse(raw);
      const existing = await repository.getApplicationByUrl(owner, input.url);
      if (existing) return { application: toApplication(existing), created: false };
      const created = await repository.createApplication({ ownerUserId: owner, paneId: input.paneId ?? null, company: input.company, role: input.role,
        ats: input.ats, url: input.url, status: input.status, notes: input.notes ?? null,
        queuePosition: input.status === "QUEUED" ? await repository.nextQueuePosition(owner) : null });
      if (input.status === "QUEUED") {
        await record(owner, { ...context, paneId: context.paneId ?? input.paneId ?? null, applicationId: created.id, type: "NOTE", message: `Queued ${created.company} · ${created.role}`, payload: { url: created.url, ats: created.ats } });
      }
      return { application: toApplication(created), created: true };
    },
    async updateApplication(owner: string, id: string, raw: JobApplicationUpdate, context: JobApplyEventContext = {}): Promise<JobApplication> {
      const update = jobApplicationUpdateSchema.parse(raw);
      const current = await assertTransition(owner, id, update.status, update);
      if (update.status === "SUBMITTED" && current.status !== "SUBMITTED" && await repository.countFields(owner, id) === 0) {
        throw new SpaceConflictError("SUBMITTED needs the form snapshot: record the filled fields of the final step with fields_record first.");
      }
      const patch: Parameters<JobApplyRepository["updateApplication"]>[2] = { ...update };
      if (update.status && APPLIED_STATUSES.includes(update.status) && update.appliedAt === undefined) patch.appliedAt = now();
      if (update.status && update.status !== "QUEUED" && current.queuePosition !== null) patch.queuePosition = null;
      if (update.status === "QUEUED" && current.status !== "QUEUED") patch.queuePosition = await repository.nextQueuePosition(owner);
      const updated = await repository.updateApplication(owner, id, patch);
      if (!updated) throw new SpaceNotFoundError(`Application ${id} was not found.`);
      const changed = update.status && update.status !== current.status ? update.status : null;
      const eventType = changed ? STATUS_EVENT[changed] : null;
      if (changed && eventType) {
        const label = `${updated.company} · ${updated.role}`;
        const message = changed === "FILLING" ? `Filling ${label}`
          : changed === "NEEDS_USER" ? `Needs you: ${update.notes ?? updated.notes ?? label}`
          : changed === "SUBMITTED" ? `Submitted ${label}`
          : changed === "VERIFIED" ? `Verified ${label}${updated.externalConfirmation ? ` (${updated.externalConfirmation})` : ""}`
          : changed === "FAILED" ? `Failed ${label}: ${update.notes ?? updated.notes ?? "no reason recorded"}`
          : `Re-queued ${label}`;
        await record(owner, { ...context, paneId: context.paneId ?? updated.paneId ?? null, applicationId: updated.id, type: eventType, message,
          payload: { status: changed, from: current.status }, artifactId: changed === "VERIFIED" ? updated.evidenceArtifactIds[0] ?? null : null });
      }
      return toApplication(updated);
    },
    /** Daily cap and spacing for one site from the pane settings and the tracker. */
    async pacing(owner: string, site: JobApplySite, metadata: JobApplyPaneMetadata | null | undefined) {
      const settings = resolveJobApplyPaneMetadata(metadata).settings;
      const dayStart = new Date(now());
      dayStart.setUTCHours(0, 0, 0, 0);
      const todayCount = await repository.countApplications(owner, site, APPLIED_STATUSES, dayStart.toISOString());
      const latest = (await repository.listApplications(owner, { limit: 50 }))
        .filter((row) => row.ats === site && APPLIED_STATUSES.includes(row.status as JobApplicationStatus))
        .map((row) => row.appliedAt ?? row.updatedAt)
        .sort()
        .at(-1) ?? null;
      const cap = settings.dailyCaps[site];
      const spacingUntil = latest ? new Date(new Date(latest).getTime() + settings.minDelayMs).toISOString() : null;
      const allowed = !settings.paused && todayCount < cap && (!spacingUntil || spacingUntil <= now());
      return { site, allowed, paused: settings.paused, todayCount, dailyCap: cap,
        nextAllowedAt: settings.paused ? null : todayCount >= cap ? "tomorrow" : spacingUntil && spacingUntil > now() ? spacingUntil : null,
        minDelayMs: settings.minDelayMs, maxDelayMs: settings.maxDelayMs, submitMode: settings.submitMode };
    },
    // ---- queue ------------------------------------------------------------
    async listQueue(owner: string, paneId: string | null): Promise<JobApplication[]> {
      return (await repository.listQueue(owner, paneId)).map(toApplication);
    },
    /** Pasted posting URLs become QUEUED rows; unknown or duplicate URLs are reported, never silently dropped. */
    async addToQueue(owner: string, paneId: string | null, urls: string[], context: JobApplyEventContext = {}) {
      const queued: JobApplication[] = [];
      let existing = 0;
      const rejected: string[] = [];
      for (const raw of urls) {
        const posting = jobPostingFromUrl(raw);
        if (!posting) { rejected.push(raw.slice(0, 200)); continue; }
        const result = await this.createApplication(owner, { ...posting, paneId, status: "QUEUED" }, context);
        if (result.created) queued.push(result.application); else existing += 1;
      }
      return { queued, existing, rejected };
    },
    async reorderQueue(owner: string, applicationIds: string[]): Promise<JobApplication[]> {
      await repository.setQueueOrder(owner, applicationIds);
      return (await repository.listQueue(owner, null)).map(toApplication);
    },
    async removeFromQueue(owner: string, id: string): Promise<void> {
      const existing = await repository.getApplication(owner, id);
      if (!existing) throw new SpaceNotFoundError(`Application ${id} was not found.`);
      if (existing.status !== "QUEUED") throw new SpaceConflictError("Only queued applications can be removed; others are history.");
      await repository.deleteQueuedApplication(owner, id);
    },

    // ---- memory -----------------------------------------------------------
    async listMemory(owner: string, raw: JobApplyMemoryQuery): Promise<JobApplyMemory[]> {
      await ensureQaBankMigrated(owner);
      const query = jobApplyMemoryQuerySchema.parse(raw);
      return (await repository.listMemory(owner, { query: query.query ?? null, site: query.site ?? null, company: query.company ?? null,
        kinds: query.kinds, keys: query.keys?.map(normalizeJobApplyKey).filter(Boolean), pinnedOnly: query.pinnedOnly, limit: query.limit })).map(toMemory);
    },
    /** A recall counts as a use: recalled memories rank higher next time and show "used" in the rail. */
    async recallMemory(owner: string, raw: JobApplyMemoryQuery): Promise<JobApplyMemory[]> {
      const memories = await this.listMemory(owner, raw);
      await repository.touchMemory(owner, memories.map((memory) => memory.id), now());
      return memories;
    },
    async memoryCount(owner: string): Promise<number> {
      await ensureQaBankMigrated(owner);
      return repository.countMemory(owner);
    },
    /** Keyed memories (answers) refresh the existing row for the same key and scope; free facts are new rows. */
    async rememberMemory(owner: string, raw: JobApplyMemoryCreate): Promise<JobApplyMemory> {
      await ensureQaBankMigrated(owner);
      const input = jobApplyMemoryCreateSchema.parse(raw);
      const base = { ownerUserId: owner, kind: input.kind, text: input.text, site: input.site ?? null, company: input.company ?? null, tags: input.tags ?? [],
        source: input.source ?? "AGENT", confidence: input.confidence ?? (input.source === "USER" || input.source === "PROFILE" ? 0.95 : 0.8), pinned: input.pinned ?? false };
      const key = input.key ? normalizeJobApplyKey(input.key) : input.kind === "ANSWER" ? null : null;
      if (input.kind === "ANSWER" && !key) throw new SpaceConflictError("ANSWER memories need the question as key.");
      return toMemory(key ? await repository.upsertMemoryByKey({ ...base, key }) : await repository.createMemory({ ...base, key: null }));
    },
    async updateMemory(owner: string, id: string, raw: JobApplyMemoryUpdate): Promise<JobApplyMemory> {
      const patch = jobApplyMemoryUpdateSchema.parse(raw);
      const updated = await repository.updateMemory(owner, id, { ...patch, ...(patch.key !== undefined ? { key: patch.key ? normalizeJobApplyKey(patch.key) : null } : {}) });
      if (!updated) throw new SpaceNotFoundError(`Memory ${id} was not found.`);
      return toMemory(updated);
    },
    async forgetMemory(owner: string, id: string): Promise<void> {
      if (!await repository.deleteMemory(owner, id)) throw new SpaceNotFoundError(`Memory ${id} was not found.`);
    },
    /** Answer-bank lookup for one form question: exact key, containment, then full-text search. */
    async answerFor(owner: string, question: string, scope: { site?: JobApplySite | null; company?: string | null } = {}): Promise<JobApplyMemory | null> {
      const key = normalizeJobApplyKey(question);
      if (!key) return null;
      const candidates = await this.listMemory(owner, { kinds: ["ANSWER"], keys: [key], query: question, site: scope.site ?? undefined, company: scope.company ?? undefined, limit: 20 });
      const match = matchAnswerMemory(candidates, question) ?? candidates[0] ?? null;
      if (match) await repository.touchMemory(owner, [match.id], now());
      return match;
    },

    // ---- fields -----------------------------------------------------------
    async listFields(owner: string, applicationId: string): Promise<JobApplicationField[]> {
      return (await repository.listFields(owner, applicationId)).map(toField);
    },
    /** Idempotent per step+label. Non-personal answers also refresh the answer bank for the next form. */
    async recordFields(owner: string, applicationId: string, fields: JobApplicationFieldInput[], context: JobApplyEventContext = {}): Promise<JobApplicationField[]> {
      const application = await repository.getApplication(owner, applicationId);
      if (!application) throw new SpaceNotFoundError(`Application ${applicationId} was not found.`);
      const filledAt = now();
      const records = await repository.upsertFields(owner, applicationId, fields.map((field) => ({
        stepIndex: field.stepIndex, stepTitle: field.stepTitle ?? null, label: field.label, fieldType: field.fieldType, refHint: field.refHint ?? null,
        value: field.fieldType === "file" ? (field.value ?? null)?.split("/").pop() ?? null : field.value ?? null, source: field.source, verifiedAt: field.verified ? filledAt : null
      })), filledAt);
      for (const field of fields) await rememberAnswerFromField(owner, application, field);
      const steps = [...new Set(fields.map((field) => field.stepTitle ?? `step ${field.stepIndex + 1}`))];
      const uploads = fields.filter((field) => field.fieldType === "file" && field.value);
      await record(owner, { ...context, paneId: context.paneId ?? application.paneId ?? null, applicationId, type: uploads.length === fields.length ? "UPLOAD" : "FIELD_FILLED",
        message: uploads.length === fields.length ? `Uploaded ${uploads.map((field) => field.value?.split("/").pop()).join(", ")}` : `Filled ${fields.length} field${fields.length === 1 ? "" : "s"} on ${steps.join(", ")}`,
        payload: { count: fields.length, steps, labels: fields.map((field) => field.label).slice(0, 50) } });
      return records.map(toField);
    },
    /** An operator edit is the truth: the field becomes USER-sourced and the answer bank learns it. */
    async editField(owner: string, id: string, value: string | null): Promise<JobApplicationField> {
      const updated = await repository.updateField(owner, id, { value, source: "USER" });
      if (!updated) throw new SpaceNotFoundError(`Field ${id} was not found.`);
      const application = await repository.getApplication(owner, updated.applicationId);
      if (application) await rememberAnswerFromField(owner, application, { stepIndex: updated.stepIndex, label: updated.label, fieldType: updated.fieldType as JobApplicationFieldInput["fieldType"], value, source: "USER" });
      return toField(updated);
    },

    // ---- events -----------------------------------------------------------
    async logEvent(owner: string, input: JobApplyEventInput & JobApplyEventContext): Promise<JobApplyEvent> {
      if (input.applicationId && !await repository.getApplication(owner, input.applicationId)) throw new SpaceNotFoundError(`Application ${input.applicationId} was not found.`);
      return record(owner, { ...input, type: input.type });
    },
    async listEvents(owner: string, filter: { applicationId?: string; runId?: string; paneId?: string; since?: string; limit: number }): Promise<JobApplyEvent[]> {
      return (await repository.listEvents(owner, filter)).map(toEvent);
    },

    // ---- run supervisor -----------------------------------------------------
    /** Questions and reviews the operator has not answered yet, newest first. */
    async pendingItems(owner: string, paneId: string | null): Promise<JobApplyPendingItem[]> {
      const events = await repository.listEvents(owner, { ...(paneId ? { paneId } : {}), limit: 300 });
      const answered = new Set<string>();
      for (const event of events) {
        if ((event.type === "ANSWERED" && typeof event.payload.questionId === "string") || (event.type === "REVIEW_DECIDED" && typeof event.payload.reviewId === "string")) {
          answered.add(String(event.payload.questionId ?? event.payload.reviewId));
        }
      }
      return events.flatMap((event) => {
        const id = event.type === "QUESTION" ? event.payload.questionId : event.type === "REVIEW_REQUESTED" ? event.payload.reviewId : null;
        if (typeof id !== "string" || answered.has(id)) return [];
        return [{ kind: event.type === "QUESTION" ? "QUESTION" as const : "REVIEW" as const, id, applicationId: event.applicationId, message: event.message, payload: event.payload, createdAt: event.createdAt }];
      });
    },
    async runView(owner: string, paneId: string): Promise<JobApplyRunView> {
      const active = await repository.getActiveRun(paneId);
      const run = active && active.ownerUserId === owner ? toRun(active) : null;
      const [queue, current, pending] = await Promise.all([
        this.listQueue(owner, paneId),
        run?.currentApplicationId ? repository.getApplication(owner, run.currentApplicationId) : Promise.resolve(null),
        this.pendingItems(owner, paneId)
      ]);
      return { run, status: run?.status ?? "IDLE", queue, current: current ? toApplication(current) : null, pending };
    },
    /** Start or resume the pane's run. `kickoff` is true when the agent is not polling job_next and needs the prompt. */
    async startRun(owner: string, paneId: string): Promise<{ run: JobApplyRun; kickoff: boolean; resumed: boolean }> {
      const active = await repository.getActiveRun(paneId);
      if (active && active.ownerUserId !== owner) throw new SpaceConflictError("Another owner's run is active in this pane.");
      const polling = (nextJobWaiters.get(paneId) ?? 0) > 0;
      if (active?.status === "RUNNING") return { run: toRun(active), kickoff: !polling, resumed: false };
      if (active?.status === "PAUSED") {
        const resumed = await repository.updateRun(owner, active.id, { status: "RUNNING", pausedAt: null, lastActivityAt: now() });
        await record(owner, { paneId, runId: active.id, type: "RUN_RESUMED", message: "Run resumed", payload: { counters: active.counters } });
        return { run: toRun(resumed!), kickoff: !polling, resumed: true };
      }
      const queue = await repository.listQueue(owner, paneId);
      if (queue.length === 0) throw new SpaceConflictError("Queue a posting before starting the copilot.");
      const run = await repository.createRun({ ownerUserId: owner, paneId, status: "RUNNING" });
      await record(owner, { paneId, runId: run.id, type: "RUN_STARTED", message: `Run started: ${queue.length} queued`, payload: { queued: queue.length } });
      return { run: toRun(run), kickoff: true, resumed: false };
    },
    async markKickoff(owner: string, runId: string): Promise<void> {
      await repository.updateRun(owner, runId, { kickoffSentAt: now() });
    },
    async pauseRun(owner: string, paneId: string): Promise<JobApplyRun> {
      const active = await repository.getActiveRun(paneId);
      if (!active || active.ownerUserId !== owner) throw new SpaceConflictError("No run is active in this pane.");
      if (active.status === "PAUSED") return toRun(active);
      const paused = await repository.updateRun(owner, active.id, { status: "PAUSED", pausedAt: now(), lastActivityAt: now() });
      await record(owner, { paneId, runId: active.id, type: "RUN_PAUSED", message: "Run paused: the copilot finishes the current application and waits", payload: { counters: active.counters } });
      return toRun(paused!);
    },
    async stopRun(owner: string, paneId: string): Promise<JobApplyRun> {
      const active = await repository.getActiveRun(paneId);
      if (!active || active.ownerUserId !== owner) throw new SpaceConflictError("No run is active in this pane.");
      const stopped = await repository.updateRun(owner, active.id, { status: "STOPPED", stoppedAt: now(), lastActivityAt: now(), currentApplicationId: null });
      await record(owner, { paneId, runId: active.id, type: "RUN_STOPPED", message: `Run stopped: ${summarizeCounters(active.counters)}`, payload: { counters: active.counters } });
      return toRun(stopped!);
    },
    /**
     * The agent's loop: waits (up to `waitMs`) until the run is RUNNING, the queue has a posting and
     * pacing allows its site, then takes it (FILLING) and returns the task packet. `done` ends the loop.
     */
    async nextJob(owner: string, paneId: string, input: { waitMs: number; metadata: JobApplyPaneMetadata | null | undefined }) {
      const deadline = Date.now() + Math.min(input.waitMs, NEXT_JOB_MAX_WAIT_MS);
      nextJobWaiters.set(paneId, (nextJobWaiters.get(paneId) ?? 0) + 1);
      try {
        for (;;) {
          const run = await repository.getActiveRun(paneId);
          if (!run || run.ownerUserId !== owner) return { done: true as const, reason: "NO_RUN" as const, application: null };
          let waitReason: "PAUSED" | "PACING" | "SETTINGS_PAUSED" = "PAUSED";
          let nextAllowedAt: string | null = null;
          if (run.status === "RUNNING") {
            const queue = await repository.listQueue(owner, paneId);
            if (queue.length === 0) {
              const finished = await repository.updateRun(owner, run.id, { status: "STOPPED", stoppedAt: now(), lastActivityAt: now(), currentApplicationId: null });
              await record(owner, { paneId, runId: run.id, type: "RUN_FINISHED", message: `Run finished: ${summarizeCounters(run.counters)}`, payload: { counters: run.counters } });
              return { done: true as const, reason: "QUEUE_EMPTY" as const, application: null, run: toRun(finished!) };
            }
            const settings = resolveJobApplyPaneMetadata(input.metadata).settings;
            if (settings.paused) {
              waitReason = "SETTINGS_PAUSED";
            } else {
              const checked = new Map<JobApplySite, Awaited<ReturnType<typeof this.pacing>>>();
              let picked: JobApplicationRecord | null = null;
              for (const candidate of queue) {
                const site = candidate.ats as JobApplySite;
                const pacing = checked.get(site) ?? await this.pacing(owner, site, input.metadata);
                checked.set(site, pacing);
                if (pacing.allowed) { picked = candidate; break; }
                if (pacing.nextAllowedAt && pacing.nextAllowedAt !== "tomorrow" && (!nextAllowedAt || pacing.nextAllowedAt < nextAllowedAt)) nextAllowedAt = pacing.nextAllowedAt;
              }
              if (picked) {
                const counters = { ...run.counters, taken: (run.counters.taken ?? 0) + 1 };
                await repository.updateRun(owner, run.id, { currentApplicationId: picked.id, counters, lastActivityAt: now() });
                const application = await this.updateApplication(owner, picked.id, { status: "FILLING" }, { paneId, runId: run.id });
                return { done: false as const, ...(await this.taskPacket(owner, application, settings, { ...run, counters }, queue.length - 1)) };
              }
              waitReason = "PACING";
            }
          }
          if (Date.now() >= deadline) return { done: false as const, waiting: true as const, reason: waitReason, nextAllowedAt, application: null, run: toRun(run) };
          await sleep(Math.min(NEXT_JOB_POLL_MS, Math.max(0, deadline - Date.now())));
        }
      } finally {
        const remaining = (nextJobWaiters.get(paneId) ?? 1) - 1;
        if (remaining > 0) nextJobWaiters.set(paneId, remaining); else nextJobWaiters.delete(paneId);
      }
    },
    /** Everything the agent needs for one posting: profile facts, CV path, scoped memories and the answer bank. */
    async taskPacket(owner: string, application: JobApplication, settings: JobApplyPaneMetadata["settings"], run: JobApplyRunRecord, remaining: number) {
      const [profile, cv, memories, answers] = await Promise.all([
        this.getProfile(owner), this.cvText(owner),
        this.listMemory(owner, { site: application.ats, company: application.company, limit: 20 }),
        this.listMemory(owner, { kinds: ["ANSWER"], site: application.ats, company: application.company, limit: 40 })
      ]);
      await repository.touchMemory(owner, [...new Set([...memories, ...answers].map((memory) => memory.id))], now());
      const coverLetterPath = profile.coverLetterArtifactId ? await this.artifactPath(profile.coverLetterArtifactId) : null;
      const { experience, education, extra, ...facts } = profile.candidate;
      return {
        application,
        run: { id: run.id, counters: run.counters as JobApplyRunCounters, remaining },
        settings: { submitMode: settings.submitMode, minDelayMs: settings.minDelayMs, maxDelayMs: settings.maxDelayMs, dailyCap: settings.dailyCaps[application.ats as JobApplySite] },
        candidate: { ...facts, experience: experience.slice(0, 10), education: education.slice(0, 6), extra },
        cv: { artifactId: cv.artifactId, path: cv.path, chars: cv.text?.length ?? 0 },
        coverLetter: { artifactId: profile.coverLetterArtifactId, path: coverLetterPath },
        mailboxConnected: profile.mailbox !== null,
        memories: memories.filter((memory) => memory.kind !== "ANSWER"),
        answers: answers.map((memory) => ({ id: memory.id, question: memory.key, answer: memory.text, source: memory.source, confidence: memory.confidence, site: memory.site }))
      };
    },
    /** Closes one job: the outcome must match the tracker row the agent already updated. */
    async reportJob(owner: string, paneId: string, input: { runId?: string; applicationId: string; outcome: JobApplyReportOutcome; summary: string }) {
      const run = input.runId ? await repository.getRun(owner, input.runId) : await repository.getActiveRun(paneId);
      if (!run || run.ownerUserId !== owner) throw new SpaceNotFoundError("The run was not found.");
      const application = await repository.getApplication(owner, input.applicationId);
      if (!application) throw new SpaceNotFoundError(`Application ${input.applicationId} was not found.`);
      const expected: Record<JobApplyReportOutcome, JobApplicationStatus[]> = {
        submitted: ["SUBMITTED", "VERIFIED"], verified: ["VERIFIED"], failed: ["FAILED"], needs_user: ["NEEDS_USER"], skipped: ["FAILED", "QUEUED"]
      };
      if (!expected[input.outcome].includes(application.status as JobApplicationStatus)) {
        throw new SpaceConflictError(`Outcome ${input.outcome} does not match the tracker (${application.status}); call application_update first.`);
      }
      const counters: JobApplyRunCounters = { taken: 0, submitted: 0, verified: 0, failed: 0, needsUser: 0, ...run.counters };
      if (input.outcome === "verified") { counters.verified += 1; counters.submitted += 1; }
      else if (input.outcome === "submitted") counters.submitted += 1;
      else if (input.outcome === "failed") counters.failed += 1;
      else if (input.outcome === "needs_user") counters.needsUser += 1;
      const updated = await repository.updateRun(owner, run.id, { counters, currentApplicationId: run.currentApplicationId === application.id ? null : run.currentApplicationId, lastActivityAt: now() });
      await record(owner, { paneId, runId: run.id, applicationId: application.id, type: "NOTE", message: `Reported ${input.outcome.replace("_", " ")}: ${input.summary}`, payload: { outcome: input.outcome } });
      const remaining = (await repository.listQueue(owner, paneId)).length;
      return { run: toRun(updated!), remaining, status: updated!.status };
    },

    // ---- questions and reviews ----------------------------------------------
    async askQuestion(owner: string, applicationId: string, input: { question: string; options?: string[]; label?: string }, context: JobApplyEventContext = {}) {
      const application = await repository.getApplication(owner, applicationId);
      if (!application) throw new SpaceNotFoundError(`Application ${applicationId} was not found.`);
      const known = await this.answerFor(owner, input.question, { site: application.ats as JobApplySite, company: application.company });
      if (known) return { questionId: null, answered: true as const, answer: known.text, source: known.source, memoryId: known.id };
      const questionId = `jobq:${randomBytes(9).toString("base64url")}`;
      if (application.status === "FILLING" || application.status === "QUEUED") {
        await repository.updateApplication(owner, applicationId, { status: "NEEDS_USER", notes: input.question.slice(0, 4000), queuePosition: null });
      }
      await record(owner, { ...context, paneId: context.paneId ?? application.paneId ?? null, applicationId, type: "QUESTION", message: `Needs you: ${input.question}`,
        payload: { questionId, question: input.question, options: input.options ?? [], label: input.label ?? null } });
      return { questionId, answered: false as const };
    },
    async answerQuestion(owner: string, applicationId: string, input: { questionId: string; answer: string }, context: JobApplyEventContext = {}) {
      const events = await repository.listEvents(owner, { applicationId, limit: 200 });
      const question = events.find((event) => event.type === "QUESTION" && event.payload.questionId === input.questionId);
      if (!question) throw new SpaceNotFoundError("The question was not found.");
      const memory = await this.rememberMemory(owner, { kind: "ANSWER", key: String(question.payload.question), text: input.answer, source: "USER", tags: ["question"] });
      const application = await repository.getApplication(owner, applicationId);
      if (application?.status === "NEEDS_USER") await repository.updateApplication(owner, applicationId, { status: "FILLING" });
      await record(owner, { ...context, paneId: context.paneId ?? application?.paneId ?? null, applicationId, type: "ANSWERED", message: `You answered: ${input.answer.slice(0, 200)}`,
        payload: { questionId: input.questionId, answer: input.answer, memoryId: memory.id } });
      return { memory };
    },
    async waitForAnswer(owner: string, applicationId: string, input: { questionId: string; waitMs: number }) {
      const deadline = Date.now() + Math.min(input.waitMs, NEXT_JOB_MAX_WAIT_MS);
      for (;;) {
        const events = await repository.listEvents(owner, { applicationId, limit: 200 });
        const answered = events.find((event) => event.type === "ANSWERED" && event.payload.questionId === input.questionId);
        if (answered) return { answered: true as const, answer: String(answered.payload.answer ?? ""), answeredAt: answered.createdAt };
        if (Date.now() >= deadline) return { answered: false as const, answer: null };
        await sleep(Math.min(NEXT_JOB_POLL_MS, Math.max(0, deadline - Date.now())));
      }
    },
    async requestReview(owner: string, applicationId: string, input: { fields: Array<{ label: string; value: string | null }>; note?: string }, context: JobApplyEventContext = {}) {
      const application = await repository.getApplication(owner, applicationId);
      if (!application) throw new SpaceNotFoundError(`Application ${applicationId} was not found.`);
      const reviewId = `jobrev:${randomBytes(9).toString("base64url")}`;
      if (application.status === "FILLING") await repository.updateApplication(owner, applicationId, { status: "NEEDS_USER", notes: "Review before submit" });
      await record(owner, { ...context, paneId: context.paneId ?? application.paneId ?? null, applicationId, type: "REVIEW_REQUESTED",
        message: `Review before submit: ${application.company} · ${application.role}${input.note ? ` (${input.note})` : ""}`, payload: { reviewId, fields: input.fields.slice(0, 200), note: input.note ?? null } });
      return { reviewId };
    },
    async decideReview(owner: string, applicationId: string, input: JobApplyReviewDecision, context: JobApplyEventContext = {}) {
      const events = await repository.listEvents(owner, { applicationId, limit: 200 });
      const review = events.find((event) => event.type === "REVIEW_REQUESTED" && event.payload.reviewId === input.reviewId);
      if (!review) throw new SpaceNotFoundError("The review was not found.");
      const application = await repository.getApplication(owner, applicationId);
      if (application?.status === "NEEDS_USER") await repository.updateApplication(owner, applicationId, { status: "FILLING" });
      for (const edit of input.edits ?? []) {
        if (edit.value) await rememberAnswerFromField(owner, application!, { stepIndex: 0, label: edit.label, fieldType: "text", value: edit.value, source: "USER" });
      }
      await record(owner, { ...context, paneId: context.paneId ?? application?.paneId ?? null, applicationId, type: "REVIEW_DECIDED",
        message: input.decision === "approve" ? "You approved the submission" : input.decision === "edit" ? `You corrected ${input.edits?.length ?? 0} field(s)` : `You rejected the submission${input.note ? `: ${input.note}` : ""}`,
        payload: { reviewId: input.reviewId, decision: input.decision, edits: input.edits ?? [], note: input.note ?? null } });
      return { decision: input.decision };
    },
    async waitForReview(owner: string, applicationId: string, input: { reviewId: string; waitMs: number }) {
      const deadline = Date.now() + Math.min(input.waitMs, NEXT_JOB_MAX_WAIT_MS);
      for (;;) {
        const events = await repository.listEvents(owner, { applicationId, limit: 200 });
        const decided = events.find((event) => event.type === "REVIEW_DECIDED" && event.payload.reviewId === input.reviewId);
        if (decided) return { decided: true as const, decision: String(decided.payload.decision), edits: Array.isArray(decided.payload.edits) ? decided.payload.edits : [], note: decided.payload.note ?? null };
        if (Date.now() >= deadline) return { decided: false as const, decision: null, edits: [], note: null };
        await sleep(Math.min(NEXT_JOB_POLL_MS, Math.max(0, deadline - Date.now())));
      }
    },

    // ---- discovery ----------------------------------------------------------
    /** Scans the requested boards plus every board token remembered as a SITE memory tagged board-token ("<ats>:<token>"). */
    async discover(owner: string, input: JobApplyDiscoverRequest) {
      const remembered = await repository.listMemory(owner, { kinds: ["SITE"], limit: 200 });
      const extra = remembered.flatMap((memory) => {
        if (!memory.tags.includes("board-token")) return [];
        const match = /^(greenhouse|lever|ashby):([a-z0-9][a-z0-9._-]{0,80})$/i.exec(memory.text.trim());
        return match ? [{ ats: match[1]!.toLowerCase() as JobApplyDiscoverySite, token: match[2]! }] : [];
      });
      return discovery.search(input, extra, async (url) => (await repository.getApplicationByUrl(owner, url)) !== null);
    },

    /** Imports the operator's earlier campaign tracker (id,company,board,role,geo,source,status,applied_date,notes,...). */
    async importCsv(owner: string, csv: string, paneId: string | null): Promise<{ imported: number; skipped: number; duplicates: number }> {
      const rows = parseCsv(csv);
      const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
      const column = (name: string) => header.indexOf(name);
      if (column("company") < 0 || column("status") < 0) throw new SpaceConflictError("CSV needs at least company and status columns.");
      let imported = 0, skipped = 0, duplicates = 0;
      for (const row of rows.slice(1)) {
        const cell = (name: string) => { const index = column(name); return index >= 0 ? (row[index] ?? "").trim() : ""; };
        const company = cell("company");
        const id = cell("id");
        const board = cell("board") || cell("source");
        const roleText = cell("role") || "Unknown role";
        const status = cell("status").toLowerCase();
        if (!company) { skipped += 1; continue; }
        const ats = jobApplySiteFromBoard(`${board} ${cell("source")}`, cell("url"));
        // Earlier campaigns recorded board + job id instead of a URL; keep a stable synthetic one.
        const url = cell("url") || `https://space.local/imported/${encodeURIComponent(board || ats)}/${encodeURIComponent(id || `${company}-${roleText}`)}`;
        if (await repository.getApplicationByUrl(owner, url)) { duplicates += 1; continue; }
        const verified = /verified/i.test(cell("notes")) || status === "verified";
        const mapped: JobApplicationStatus = status === "applied" || status === "submitted" ? (verified ? "VERIFIED" : "SUBMITTED")
          : status === "failed" || status === "rejected" ? "FAILED" : status === "queued" || status === "pending" ? "QUEUED" : "SUBMITTED";
        const appliedDate = cell("applied_date");
        const appliedAt = appliedDate && !Number.isNaN(Date.parse(appliedDate)) ? new Date(appliedDate).toISOString() : null;
        const record = await repository.createApplication({ ownerUserId: owner, paneId, company, role: roleText.slice(0, 300), ats, url: url.slice(0, 2000),
          status: "QUEUED", notes: [cell("notes"), cell("geo") ? `geo: ${cell("geo")}` : "", id ? `imported id: ${id}` : ""].filter(Boolean).join(" | ").slice(0, 4000) || null });
        await repository.updateApplication(owner, record.id, { status: mapped, appliedAt: appliedAt ?? (mapped === "QUEUED" ? null : record.createdAt),
          externalConfirmation: verified ? "imported: verified" : null });
        imported += 1;
      }
      return { imported, skipped, duplicates };
    }
  };
}
export type JobApplyService = ReturnType<typeof createJobApplyService>;

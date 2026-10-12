import { z } from "zod";

/** Read-only view of the merge queue (space-merge-queue.service) for operators. */
export const deployQueueTicketStatusSchema = z.enum([
  "QUEUED", "INTEGRATING", "VERIFYING", "DEPLOYING", "DEPLOYED", "CONFLICT", "FAILED", "CANCELLED"
]);

export const deployQueueTicketSchema = z.object({
  id: z.string().max(80),
  status: deployQueueTicketStatusSchema,
  branch: z.string().max(200),
  summary: z.string().max(240),
  sha: z.string().max(40),
  submittedAt: z.string().max(40),
  updatedAt: z.string().max(40),
  note: z.string().max(1000).nullable(),
  deployedCommit: z.string().max(40).nullable(),
  conflictFiles: z.array(z.string().max(300)).max(50),
  autoResolvedFiles: z.array(z.string().max(300)).max(50),
  remotes: z.enum(["ok", "failed"]).nullable()
}).strict();

export const deployQueueReportSchema = z.object({
  available: z.boolean(),
  daemonRunning: z.boolean(),
  heartbeatAt: z.string().max(40).nullable(),
  paused: z.object({ reason: z.string().max(500), at: z.string().max(40) }).strict().nullable(),
  current: z.object({ batchId: z.string().max(80), phase: z.string().max(20), ticketIds: z.array(z.string().max(80)).max(20) }).strict().nullable(),
  active: z.array(deployQueueTicketSchema).max(200),
  recent: z.array(deployQueueTicketSchema).max(30)
}).strict();

export type DeployQueueTicketStatus = z.infer<typeof deployQueueTicketStatusSchema>;
export type DeployQueueTicket = z.infer<typeof deployQueueTicketSchema>;
export type DeployQueueReport = z.infer<typeof deployQueueReportSchema>;

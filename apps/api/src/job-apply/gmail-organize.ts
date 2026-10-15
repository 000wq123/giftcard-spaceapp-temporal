import { JOB_APPLY_MAIL_LABELS, JOB_APPLY_MAIL_ROOT_LABEL, type JobApplyMailCategory } from "@space/contracts";
import { messageText } from "../dot-connectors.js";
import { GmailMailboxError } from "./gmail-mailbox.js";

// Job Copilot files application emails under Gmail labels with the gmail.modify grant (MAIL_ORGANIZE): it
// creates the "Job Applications" labels, adds one to a message and, for confirmations and rejections, takes
// the message out of the inbox. Mail is never trashed or deleted from here.
const gmailApi = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailTriageMessage {
  messageId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string | null;
  labelIds: string[];
}

function client(accessToken: string, fetchImpl: typeof fetch = fetch) {
  return async function call(path: string, init: { method?: string; body?: unknown } = {}): Promise<Record<string, unknown>> {
    const response = await fetchImpl(`${gmailApi}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(20_000)
    });
    const text = await response.text();
    const body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    if (!response.ok) {
      throw new GmailMailboxError(response.status, response.status === 401 ? "Google access to Gmail expired."
        : response.status === 403 ? "Gmail refused the request: organizing mail needs the gmail.modify permission (Allow Gmail & Calendar again)."
          : `Gmail request failed (${response.status}).`);
    }
    return body;
  };
}

function header(headers: unknown, name: string): string {
  const found = Array.isArray(headers) ? headers.find((item: { name?: string }) => item?.name?.toLowerCase() === name) as { value?: string } | undefined : undefined;
  return found?.value ?? "";
}

/** Label ids of the Job Copilot labels, created on first use (parent first, so Gmail nests them). */
export async function ensureJobApplyLabels(input: { accessToken: string; fetchImpl?: typeof fetch }): Promise<Record<JobApplyMailCategory, string>> {
  const call = client(input.accessToken, input.fetchImpl);
  const existing = new Map(((await call("/labels")).labels as Array<{ id?: string; name?: string }> | undefined ?? [])
    .filter((label) => label.id && label.name).map((label) => [label.name!.toLowerCase(), label.id!]));
  const ids = new Map<string, string>();
  for (const name of [JOB_APPLY_MAIL_ROOT_LABEL, ...Object.values(JOB_APPLY_MAIL_LABELS)]) {
    let id = existing.get(name.toLowerCase());
    if (!id) {
      const created = await call("/labels", { method: "POST", body: { name, labelListVisibility: "labelShow", messageListVisibility: "show" } });
      id = String(created.id ?? "");
      if (!id) throw new GmailMailboxError(502, `Gmail did not create the label ${name}.`);
    }
    ids.set(name, id);
  }
  return { CONFIRMATION: ids.get(JOB_APPLY_MAIL_LABELS.CONFIRMATION)!, REJECTION: ids.get(JOB_APPLY_MAIL_LABELS.REJECTION)!, ACTION_NEEDED: ids.get(JOB_APPLY_MAIL_LABELS.ACTION_NEEDED)! };
}

/**
 * Adds the label to every message and, when `archive` is set, removes it from the inbox. `replaceLabelIds`
 * (the other Job Applications categories) are removed, so filing again moves a message. Never deletes.
 */
export async function labelGmailMessages(input: { accessToken: string; fetchImpl?: typeof fetch; messageIds: string[]; labelId: string; archive: boolean; replaceLabelIds?: string[] }): Promise<void> {
  if (!input.messageIds.length) return;
  const removeLabelIds = [...(input.archive ? ["INBOX"] : []), ...(input.replaceLabelIds ?? []).filter((label) => label !== input.labelId)];
  await client(input.accessToken, input.fetchImpl)("/messages/batchModify", { method: "POST",
    body: { ids: input.messageIds, addLabelIds: [input.labelId], removeLabelIds } });
}

/** Inbox messages matching a Gmail search, newest first, with their labels (at most `max`). */
export async function listGmailTriageMessages(input: { accessToken: string; fetchImpl?: typeof fetch; query: string; max: number }): Promise<GmailTriageMessage[]> {
  const call = client(input.accessToken, input.fetchImpl);
  const list = await call(`/messages?${new URLSearchParams({ q: input.query, maxResults: String(Math.min(100, input.max)) })}`);
  const ids = ((list.messages as Array<{ id?: unknown }> | undefined) ?? []).map((message) => message.id).filter((id): id is string => typeof id === "string").slice(0, input.max);
  const messages: GmailTriageMessage[] = [];
  for (const id of ids) {
    const message = await call(`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
    const headers = (message.payload as { headers?: unknown } | undefined)?.headers;
    const received = Number(message.internalDate);
    messages.push({ messageId: id, from: header(headers, "from"), subject: header(headers, "subject"),
      snippet: typeof message.snippet === "string" ? message.snippet : "",
      receivedAt: Number.isFinite(received) && received > 0 ? new Date(received).toISOString() : null,
      labelIds: Array.isArray(message.labelIds) ? message.labelIds.filter((label): label is string => typeof label === "string") : [] });
  }
  return messages;
}

/** The text of one message (plain part, or the HTML part as text), capped for classification. */
export async function gmailMessageText(input: { accessToken: string; fetchImpl?: typeof fetch; messageId: string; max: number }): Promise<string> {
  const message = await client(input.accessToken, input.fetchImpl)(`/messages/${encodeURIComponent(input.messageId)}?format=full`);
  return messageText(message.payload as Record<string, unknown> | undefined, input.max).text;
}

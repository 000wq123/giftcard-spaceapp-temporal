import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectorCapabilities, connectorCapabilitySchema, type ConnectorCapability } from "@space/contracts";
import { InMemorySpaceStore } from "@space/runtime";
import { createApp } from "../src/app.js";
import { cliBrowserBridgeTokenHeader, issueCliBrowserBridgeToken } from "../src/cli-browser-bridge.js";
import { getApiConfig } from "../src/config.js";
import { createGoogleConnector, messageText } from "../src/dot-connectors.js";
import { ensureJobApplyLabels, labelGmailMessages } from "../src/job-apply/gmail-organize.js";
import { classifyApplicationMail, isApplicationMail, triageQuery } from "../src/job-apply/mail-triage.js";
import type { JobApplyGoogleAccess } from "../src/job-apply/service.js";
import { htmlToText } from "../src/mail-html-text.js";

vi.setConfig({ testTimeout: 30_000 });
const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url");
// CodeSignal invitations carry no text/plain part: the deadline and the link live only in the HTML.
const codeSignalHtml = `<html><head><style>.x{color:red}</style><script>track()</script></head><body><table><tr><td>
<p>Hi Nikolaos,</p><p>Ramp invited you to take the <b>Ramp Frontend Challenge</b> assessment on CodeSignal.</p>
<p>Please complete it by <strong>October 20, 2026 at 11:59&nbsp;PM PDT</strong>.</p>
<a href="https://app.codesignal.com/test/abc123?utm=1">Start assessment</a><br>Questions? &amp; reply to this email.</td></tr></table></body></html>`;

describe("html mail as text", () => {
  it("keeps the words, the deadline and the link of an HTML-only invitation", () => {
    const text = htmlToText(codeSignalHtml);
    expect(text).toContain("Ramp invited you to take the Ramp Frontend Challenge assessment on CodeSignal.");
    expect(text).toContain("Please complete it by October 20, 2026 at 11:59 PM PDT.");
    expect(text).toContain("Start assessment (https://app.codesignal.com/test/abc123?utm=1)");
    expect(text).toContain("Questions? & reply to this email.");
    expect(text).not.toMatch(/color:red|track\(\)|<[a-z]/i);
  });

  it("reads an HTML-only Gmail message as text and says so; plain parts win when present", async () => {
    const htmlOnly = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/html", body: { data: b64(codeSignalHtml) } }] };
    expect(messageText(htmlOnly, 20_000)).toMatchObject({ fromHtml: true });
    const both = { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: b64("Plain body") } }, { mimeType: "text/html", body: { data: b64("<p>Html</p>") } }] };
    expect(messageText(both, 20_000)).toEqual({ text: "Plain body", fromHtml: false });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "m1", threadId: "t1", payload: { ...htmlOnly,
      headers: [{ name: "From", value: "CodeSignal <no-reply@codesignal.com>" }, { name: "Subject", value: "Ramp invited you to take Ramp Frontend Challenge Assessment on CodeSignal" }] } }), { status: 200 })) as unknown as typeof fetch;
    const message = await createGoogleConnector({ clientId: "c", fetchImpl }).readMail("token", "m1") as { text: string; textSource?: string };
    expect(message.textSource).toBe("html");
    expect(message.text).toContain("October 20, 2026 at 11:59 PM PDT");
    expect(message.text).toContain("https://app.codesignal.com/test/abc123");
  });
});

describe("mail triage rules", () => {
  const now = Date.parse("2026-10-13T12:00:00.000Z");
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  it.each([
    ["receipt", "no-reply@us.greenhouse-mail.io", "Thank you for applying to Acme", "Your application has been received. We will reach out about next steps.", 30, "CONFIRMATION"],
    ["ashby receipt", "no-reply@ashbyhq.com", "Thanks for applying to Exa", "We received your application and our team will review it.", 30, "CONFIRMATION"],
    ["stale security code", "no-reply@us.greenhouse-mail.io", "Security code for your application to Acme", "Copy and paste this code: AB12cd34", 120, "CONFIRMATION"],
    ["fresh security code", "no-reply@us.greenhouse-mail.io", "Security code for your application to Acme", "Copy and paste this code: AB12cd34", 10, null],
    ["rejection", "recruiting@acme.com", "Your application to Acme", "Unfortunately, we have decided to move forward with other candidates.", 30, "REJECTION"],
    ["interview invite", "no-reply@ashbyhq.com", "Interview with Acme", "We'd love to talk. Please select a time for your first interview.", 30, "ACTION_NEEDED"],
    ["assessment platform", "no-reply@codesignal.com", "Ramp invited you to take Ramp Frontend Challenge Assessment on CodeSignal", "", 30, "ACTION_NEEDED"],
    ["receipt asking for a take-home", "no-reply@ashbyhq.com", "Thank you for applying", "Thank you for applying. Please complete the take-home exercise within 5 days.", 30, "ACTION_NEEDED"],
    ["unknown", "talent@acme.com", "Quick question", "Could you tell us your current notice period?", 30, "ACTION_NEEDED"],
    // Seen 2026-10-13 (Browserbase, Replit, Figma receipts): a conditional "not selected" is not a rejection.
    ["receipt with a conditional rejection line", "no-reply@ashbyhq.com", "Thank you for your application to Browserbase", "We received your application for our Software Engineer (Agent Platform) role. Our team will review your application and will be in touch to let you know if your qualifications match our needs.\nIf you're not selected for this position, keep an eye on our jobs page as we're growing and adding openings!", 30, "CONFIRMATION"],
    ["rejection after a conditional line", "no-reply@ashbyhq.com", "Update on your application", "If you have questions, reply to this email. Unfortunately, you have not been selected for the role.", 30, "REJECTION"]
  ] as const)("%s", (_name, from, subject, text, minutesAgo, expected) => {
    expect(classifyApplicationMail({ from, subject, text, receivedAt: at(minutesAgo) }, now)).toBe(expected);
  });

  it("knows application senders, assessment services and tracked companies, and nothing else", () => {
    const tracked = [{ company: "Acme Robotics" }];
    expect(isApplicationMail({ from: "CodeSignal <no-reply@codesignal.com>", subject: "x" }, [])).toBe(true);
    expect(isApplicationMail({ from: "Calendly <notifications@calendly.com>", subject: "x" }, [])).toBe(true);
    expect(isApplicationMail({ from: "no-reply@us.greenhouse-mail.io", subject: "x" }, [])).toBe(true);
    expect(isApplicationMail({ from: "Acme Robotics Recruiting <jobs@acmerobotics.com>", subject: "Hello" }, tracked)).toBe(true);
    expect(isApplicationMail({ from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>", subject: "New jobs for you" }, tracked)).toBe(false);
    expect(isApplicationMail({ from: "deals@shop.example", subject: "Sale" }, tracked)).toBe(false);
    expect(triageQuery(["Acme Robotics"])).toMatch(/^in:inbox newer_than:14d \{.*from:codesignal\.com.*from:acme\}$/);
  });
});

describe("gmail organize client", () => {
  it("creates only the missing Job Applications labels and archives with batchModify, never deleting", async () => {
    const calls: Array<{ method: string; url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method: init?.method ?? "GET", url, body });
      if (url.endsWith("/labels") && (init?.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ labels: [{ id: "INBOX", name: "INBOX" }, { id: "L1", name: "Job Applications" }] }), { status: 200 });
      }
      if (url.endsWith("/labels")) return new Response(JSON.stringify({ id: `L-${(body as { name: string }).name}`, name: (body as { name: string }).name }), { status: 200 });
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const labels = await ensureJobApplyLabels({ accessToken: "t", fetchImpl });
    expect(labels).toEqual({ CONFIRMATION: "L-Job Applications/Confirmations", REJECTION: "L-Job Applications/Rejections", ACTION_NEEDED: "L-Job Applications/Action needed" });
    expect(calls.filter((call) => call.method === "POST").map((call) => (call.body as { name: string }).name))
      .toEqual(["Job Applications/Confirmations", "Job Applications/Rejections", "Job Applications/Action needed"]);
    await labelGmailMessages({ accessToken: "t", fetchImpl, messageIds: ["m1", "m2"], labelId: "L-c", archive: true });
    await labelGmailMessages({ accessToken: "t", fetchImpl, messageIds: ["m3"], labelId: "L-a", archive: false });
    await labelGmailMessages({ accessToken: "t", fetchImpl, messageIds: [], labelId: "L-a", archive: false });
    // Filing again moves a message: the other category labels go, its own stays.
    await labelGmailMessages({ accessToken: "t", fetchImpl, messageIds: ["m4"], labelId: "L-c", archive: true, replaceLabelIds: ["L-c", "L-r", "L-a"] });
    const modifies = calls.filter((call) => call.url.endsWith("/messages/batchModify"));
    expect(modifies.map((call) => call.body)).toEqual([
      { ids: ["m1", "m2"], addLabelIds: ["L-c"], removeLabelIds: ["INBOX"] },
      { ids: ["m3"], addLabelIds: ["L-a"], removeLabelIds: [] },
      { ids: ["m4"], addLabelIds: ["L-c"], removeLabelIds: ["INBOX", "L-r", "L-a"] }
    ]);
    expect(calls.some((call) => /trash|delete/i.test(call.url) || call.method === "DELETE")).toBe(false);
  });

  it("maps gmail.modify to MAIL_ORGANIZE and accepts it in consent requests", () => {
    expect(connectorCapabilities("GOOGLE", ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.readonly"]).sort())
      .toEqual(["MAIL_ORGANIZE", "MAIL_READ"]);
    expect(connectorCapabilitySchema.parse("MAIL_ORGANIZE")).toBe("MAIL_ORGANIZE");
    const url = new URL(createGoogleConnector({ clientId: "c" }).authorizeUrl({ redirectUri: "https://space.test/cb", state: "s", codeChallenge: "x".repeat(43),
      capabilities: ["MAIL_READ", "MAIL_ORGANIZE"] }));
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/gmail.modify");
  });
});

// A small Gmail: labels, messages with labelIds, metadata, full payloads and batchModify.
function fakeGmail(messages: Array<{ id: string; from: string; subject: string; minutesAgo: number; plain?: string; html?: string }>) {
  const labels = [{ id: "INBOX", name: "INBOX" }];
  const state = new Map(messages.map((message) => [message.id, { ...message, labelIds: ["INBOX"] }]));
  const modifies: Array<{ ids: string[]; addLabelIds: string[]; removeLabelIds: string[] }> = [];
  const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const path = url.pathname.replace("/gmail/v1/users/me", "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (path === "/labels" && (init?.method ?? "GET") === "GET") return Response.json({ labels });
    if (path === "/labels") { const label = { id: `Label_${labels.length}`, name: body.name as string }; labels.push(label); return Response.json(label); }
    if (path === "/messages/batchModify") {
      modifies.push(body);
      for (const id of body.ids as string[]) {
        const message = state.get(id)!;
        message.labelIds = [...message.labelIds.filter((label) => !(body.removeLabelIds as string[]).includes(label)), ...(body.addLabelIds as string[])];
      }
      return new Response(null, { status: 204 });
    }
    if (path === "/messages") {
      const inbox = url.searchParams.get("q")?.includes("in:inbox") ?? false;
      return Response.json({ messages: [...state.values()].filter((message) => !inbox || message.labelIds.includes("INBOX")).map((message) => ({ id: message.id })) });
    }
    const message = state.get(decodeURIComponent(path.replace("/messages/", "")))!;
    const headers = [{ name: "From", value: message.from }, { name: "Subject", value: message.subject }];
    const internalDate = String(Date.now() - message.minutesAgo * 60_000);
    if (url.searchParams.get("format") === "metadata") return Response.json({ id: message.id, labelIds: message.labelIds, internalDate, snippet: (message.plain ?? "").slice(0, 100), payload: { headers } });
    const parts = message.html ? [{ mimeType: "text/html", body: { data: b64(message.html) } }] : [{ mimeType: "text/plain", body: { data: b64(message.plain ?? "") } }];
    return Response.json({ id: message.id, internalDate, payload: { mimeType: "multipart/alternative", headers, parts } });
  }) as unknown as typeof fetch;
  return { fetchImpl, state, modifies, labels };
}

async function fixture(google: JobApplyGoogleAccess, gmailFetch: typeof fetch) {
  const root = await mkdtemp(join(tmpdir(), "space-job-apply-mail-"));
  temporaryRoots.push(root);
  const wrapper = join(root, "codex-vscode-parity");
  await writeFile(wrapper, "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(wrapper, 0o755);
  const config = getApiConfig({
    SPACE_CLI_ENABLED: "true", SPACE_CLI_COMMAND_PATH: root, SPACE_CLI_HOST_SOCKET: join(root, "pane-host.sock"), SPACE_CLI_CODEX_CREDENTIAL_SMOKE: "true",
    SPACE_CLI_WORKSPACE_ROOT: join(root, "workspaces"), SPACE_BROWSER_TOOL_BRIDGE_ENABLED: "true", SPACE_INTERNAL_API_TOKEN: "internal-token-for-job-apply-tests",
    SPACE_ARTIFACT_ROOT: root
  });
  const store = new InMemorySpaceStore();
  const app = await createApp({ store, config: { ...config, jobApplyRoot: join(root, "job-apply") }, jobApplyGoogle: google, jobApplyGmailFetch: gmailFetch, jobApplyMailTriage: false,
    auth: { sessionSecret: "test-secret-with-enough-length", devLogin: true, secureCookies: false } });
  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "space@space.local", password: "space-dev" } });
  const cookie = `space_session=${login.cookies.find((entry) => entry.name === "space_session")?.value}`;
  const csrf = await app.inject({ method: "GET", url: "/api/auth/csrf", headers: { cookie } });
  const headers = { cookie, "x-space-csrf-token": csrf.json().csrfToken as string };
  const room = (await app.inject({ method: "POST", url: "/api/rooms", headers, payload: { name: "Jobs", initialPaneCount: 0 } })).json();
  const pane = store.createPane({ roomId: room.id, title: "Job Applications", mode: "JOB_APPLY", terminalRuntimeId: "cli:codex" });
  const cliSession = store.createPaneCliSession({ paneId: pane.id, roomId: room.id, runtimeId: "cli:codex", providerId: "codex", agentId: "codex", status: "RUNNING", purpose: "NORMAL" });
  const token = issueCliBrowserBridgeToken(config, { roomId: room.id, paneId: pane.id, cliSessionId: cliSession.sessionId })!;
  return { app, pane, headers, agent: { [cliBrowserBridgeTokenHeader]: token, "content-type": "application/json" } };
}

describe("job copilot mail triage", () => {
  it("files application mail once: receipts, stale codes and rejections archived, anything asking for something kept and announced", async () => {
    const gmail = fakeGmail([
      { id: "m-receipt", from: "Greenhouse <no-reply@us.greenhouse-mail.io>", subject: "Thank you for applying to Acme", minutesAgo: 90, plain: "Your application has been received." },
      { id: "m-old-code", from: "no-reply@us.greenhouse-mail.io", subject: "Security code for your application to Acme", minutesAgo: 180, plain: "Paste this code: AB12cd34" },
      { id: "m-new-code", from: "no-reply@us.greenhouse-mail.io", subject: "Security code for your application to Acme", minutesAgo: 5, plain: "Paste this code: ZZ12cd34" },
      { id: "m-reject", from: "Acme Recruiting <recruiting@acme.com>", subject: "Your application to Acme", minutesAgo: 60, plain: "Unfortunately, we will not be moving forward." },
      { id: "m-codesignal", from: "CodeSignal <no-reply@codesignal.com>", subject: "Ramp invited you to take Ramp Frontend Challenge Assessment on CodeSignal", minutesAgo: 40, html: codeSignalHtml },
      { id: "m-interview", from: "Acme <no-reply@ashbyhq.com>", subject: "Interview with Acme", minutesAgo: 20, plain: "Please select a time for your interview." },
      { id: "m-other", from: "deals@shop.example", subject: "Big sale", minutesAgo: 10, plain: "50% off" }
    ]);
    const capabilities: ConnectorCapability[] = ["MAIL_READ", "MAIL_COMPOSE", "CALENDAR"];
    const google: JobApplyGoogleAccess = {
      googleConfigured: true,
      async googleAccounts() { return [{ email: "me@gmail.com", capabilities }]; },
      async googleCapabilities() { return capabilities; },
      async googleAccessToken(_owner, _email, capability) { if (!capabilities.includes(capability)) throw new Error("not allowed"); return "gmail-token"; },
      async tool() { return { status: "COMPLETED", result: {} }; }
    };
    const { app, pane, headers, agent } = await fixture(google, gmail.fetchImpl);
    try {
      expect((await app.inject({ method: "PUT", url: "/api/job-apply/google", headers, payload: { email: "me@gmail.com" } })).statusCode).toBe(200);
      const started = await app.inject({ method: "POST", url: "/api/cli/job-apply/applications", headers: agent, payload: { company: "Acme", role: "Engineer", ats: "greenhouse", url: "https://job-boards.greenhouse.io/acme/jobs/1" } });
      const application = started.json().application as { id: string };
      await app.inject({ method: "PATCH", url: `/api/cli/job-apply/applications/${encodeURIComponent(application.id)}`, headers: agent, payload: { status: "FILLING" } });

      // Without the organize grant nothing is touched.
      const before = await app.inject({ method: "POST", url: "/api/cli/job-apply/mail/triage", headers: agent, payload: {} });
      expect(before.json()).toEqual({ accounts: [], scanned: 0, confirmations: 0, rejections: 0, actionNeeded: 0, skipped: 0 });
      expect(gmail.modifies).toEqual([]);
      const refused = await app.inject({ method: "POST", url: "/api/cli/job-apply/mail/organize", headers: agent, payload: { messageIds: ["m-other"], category: "CONFIRMATION" } });
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error.message).toContain("has not allowed organizing mail");

      capabilities.push("MAIL_ORGANIZE");
      const first = await app.inject({ method: "POST", url: "/api/cli/job-apply/mail/triage", headers: agent, payload: {} });
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json()).toEqual({ accounts: ["me@gmail.com"], scanned: 6, confirmations: 2, rejections: 1, actionNeeded: 2, skipped: 1 });
      const label = (name: string) => gmail.labels.find((entry) => entry.name === name)!.id;
      expect(gmail.labels.map((entry) => entry.name)).toEqual(["INBOX", "Job Applications", "Job Applications/Confirmations", "Job Applications/Rejections", "Job Applications/Action needed"]);
      expect(gmail.state.get("m-receipt")!.labelIds).toEqual([label("Job Applications/Confirmations")]);
      expect(gmail.state.get("m-old-code")!.labelIds).toEqual([label("Job Applications/Confirmations")]);
      expect(gmail.state.get("m-reject")!.labelIds).toEqual([label("Job Applications/Rejections")]);
      expect(gmail.state.get("m-codesignal")!.labelIds).toEqual(["INBOX", label("Job Applications/Action needed")]);
      expect(gmail.state.get("m-interview")!.labelIds).toEqual(["INBOX", label("Job Applications/Action needed")]);
      expect(gmail.state.get("m-new-code")!.labelIds).toEqual(["INBOX"]);
      expect(gmail.state.get("m-other")!.labelIds).toEqual(["INBOX"]);

      const events = (await app.inject({ method: "GET", url: `/api/job-apply/events?paneId=${encodeURIComponent(pane.id)}&limit=50`, headers })).json().events as Array<{ type: string; message: string; applicationId: string | null; payload: Record<string, unknown> }>;
      const mail = events.filter((event) => event.type === "MAIL");
      expect(mail.map((event) => event.message).sort()).toEqual([
        "Action needed: Interview with Acme from Acme",
        "Action needed: Ramp invited you to take Ramp Frontend Challenge Assessment on CodeSignal from CodeSignal",
        "Archived 2 confirmations and 1 rejection from me@gmail.com under Job Applications",
        "Rejection email from Acme Recruiting: Your application to Acme"
      ]);
      expect(mail.find((event) => event.message.startsWith("Rejection"))!.applicationId).toBe(application.id);
      expect(mail.find((event) => event.message.startsWith("Action needed: Interview"))!.payload).toMatchObject({ category: "ACTION_NEEDED", from: "no-reply@ashbyhq.com", messageId: "m-interview" });
      // No mail body is stored in an event.
      expect(JSON.stringify(mail)).not.toContain("Please select a time");

      // A second pass finds nothing new: labelled mail is skipped and the fresh code is still left alone.
      const modifiesBefore = gmail.modifies.length;
      const second = await app.inject({ method: "POST", url: "/api/cli/job-apply/mail/triage", headers: agent, payload: {} });
      expect(second.json()).toEqual({ accounts: ["me@gmail.com"], scanned: 1, confirmations: 0, rejections: 0, actionNeeded: 0, skipped: 1 });
      expect(gmail.modifies.length).toBe(modifiesBefore);
      const eventsAfter = (await app.inject({ method: "GET", url: `/api/job-apply/events?paneId=${encodeURIComponent(pane.id)}&limit=50`, headers })).json().events as Array<{ type: string }>;
      expect(eventsAfter.filter((event) => event.type === "MAIL")).toHaveLength(4);

      // The agent files what the rules missed; action-needed mail never leaves the inbox.
      const organized = await app.inject({ method: "POST", url: "/api/cli/job-apply/mail/organize", headers: agent, payload: { messageIds: ["m-other"], category: "ACTION_NEEDED", archive: true } });
      expect(organized.json()).toEqual({ account: "me@gmail.com", category: "ACTION_NEEDED", label: "Job Applications/Action needed", organized: 1, archived: false });
      expect(gmail.state.get("m-other")!.labelIds).toEqual(["INBOX", label("Job Applications/Action needed")]);
      const invalid = await app.inject({ method: "POST", url: "/api/cli/job-apply/mail/organize", headers: agent, payload: { messageIds: ["m-other"], category: "SPAM" } });
      expect(invalid.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  });
});

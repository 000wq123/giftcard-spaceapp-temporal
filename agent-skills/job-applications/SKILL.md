---
name: job-applications
description: "Job Copilot: work through the operator's queue of postings inside a Space Job Copilot pane with Playwright on the pane browser, the copilot's own memory and field storage, mailbox codes through Space, operator handoff for CAPTCHA, questions and reviews answered in the rail, and an evidence-gated tracker. Use only inside a Job Copilot pane."
metadata:
  category: DOMAIN_POLICY
---

# Job Copilot (job applications)

Use this skill inside a **Job Copilot pane** (pane mode `JOB_APPLY`). The pane owns one managed
Space browser that the operator watches live, this CLI session, and a rail where the operator
sees your activity, queue, fields and memory. Everything personal (profile, CV, mailbox
credential, tracker, memory) lives behind the Space API; you only receive answers, file paths,
codes, links, memories and tracker rows.

## Tools (all through the Space MCP dispatcher)

| Server | Use it for |
|---|---|
| `space_browser` | `browser_start` (this pane), `browser_navigate`, `browser_tabs`, `browser_screenshot` (evidence artifacts), `browser_request_handoff` (kind `CAPTCHA`, `LOGIN`, `MFA`), `browser_handoff_status`. |
| `playwright_pane` | Element-level work on the **same** pane browser: `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_file_upload`, `browser_press_key`, `browser_wait_for`, `browser_evaluate`. It refuses to start while the operator holds control. |
| `space_jobapply` | Run loop `job_next`, `job_report`; memory `memory_recall`, `memory_list`, `memory_remember`, `memory_update`, `memory_forget`; fields `fields_record`, `fields_list`; `event_log`; operator `question_ask`, `question_wait`, `review_request`, `review_wait`; tracker `application_start`, `application_update`, `applications_list`, `pacing_check`; profile `profile_get`, `profile_cv_text`, `profile_answer`, `profile_record_answer`; mail `mail_wait_for_code`, `mail_find_link`, `mail_recent`; `handoff_wait`. |

Start a session with `profile_get`. If `cv.path` is null or `mailboxConnected` is false, tell
the operator to finish Setup in the rail before applying; do not improvise a CV. On a first run,
when the profile has no name and no email and the operator asks you to set it up from their own
files, `profile_bootstrap {candidate}` fills the facts, `profile_set_files {cvArtifactId,
coverLetterArtifactId}` attaches Agent Files artifacts once, and `tracker_import_csv {csv}`
imports an earlier tracker. These refuse once set: identity changes only in Setup.

## The run loop (the operator presses Start; you pull the work)

The kickoff prompt in this terminal names the run. From then on:

1. `job_next {waitMs: 120000}`. It returns either `done: true` (the run was stopped or the
   queue is empty: say so in one line and stop looping) or a **task packet**: `application`
   (already `FILLING`), `candidate` facts, `cv.path`, `coverLetter.path`, `settings`
   (`submitMode`, pacing), `memories` for this site/company and the `answers` bank. When it
   returns `waiting: true` (paused, pacing, settings paused) just call it again.
2. Work the application with "One application, start to finish" below.
3. Close it with `job_report {applicationId, outcome, summary}` where `outcome` matches the
   tracker row you set: `verified`, `submitted`, `failed`, `needs_user` or `skipped`. Then go
   back to step 1. Never take a posting that `job_next` did not hand you; never loop on the
   tracker yourself.

Without a run (the operator asked you directly for one posting), use `application_start` and the
same steps, and still record fields and memory.

## Memory discipline (recall before asking, remember after answering)

- The task packet carries scoped memories and answers. For every question a form asks, first
  look at `answers`, then `memory_recall {query: "<the question>", site, company, kinds: ["ANSWER", "FACT"]}`,
  then `profile_get` facts, then `profile_cv_text`. Only then `question_ask`.
- After you derive or receive an answer, `memory_remember {kind: "ANSWER", key: "<the question
  as the form asks it>", text: "<the answer>", source}`; site-specific phrasing gets `site`.
- Things you learn about a board or a company (`LESSON`, `SITE`, `COMPANY`: an embed URL that
  works, a required field order, an application limit) go to memory too, once, with `tags`.
- Fix a wrong memory with `memory_update` or `memory_forget`; never pile up contradictions.
- Memory is the copilot's own store. Never write personal data (passwords, codes, cookies,
  full addresses) into it; identity facts live in the profile.

## One application, start to finish

1. (No run) `pacing_check {site}` → stop if `allowed` is false. Inside a run `job_next`
   already applied pacing.
2. (No run) `application_start {company, role, ats, url}` → keep the `id`. The same URL
   returns the existing row; never create a second application for one posting.
3. Navigate the pane browser to the posting (`browser_navigate` or `browser_tab_create`).
   Greenhouse embeds and Stripe-style iframes: open the embed URL directly
   (`references/greenhouse.md`). LinkedIn: confirm the main Easy Apply button is visible and
   the posting is not an external-ATS redirect (`references/linkedin-easy-apply.md`).
   If the packet's placeholders (`Posting 123`) differ from the page, `application_update
   {id, company, role}` with the real company and title.
4. `application_update {id, status: "FILLING"}` (a run packet is already FILLING).
5. `browser_snapshot`, then fill **one field at a time by its own ref** (`browser_fill_form`
   groups are fine when every entry carries its own ref). Never loop over "all visible text
   inputs". Pick the control type the question implies: years → text input, proficiency →
   select, yes/no → the radio inside that question's own group, consent → that checkbox.
6. Answers come from, in order: packet `answers` → `memory_recall` → `profile_get` facts →
   `profile_cv_text`. Rules in "Truthful answers" below.
7. **Record every step**: after filling a step (or before moving to the next page) call
   `fields_record {applicationId, fields: [{stepIndex, stepTitle, label, fieldType, refHint,
   value, source}]}` with every control you touched. File fields keep the file name; never
   record passwords or codes. `SUBMITTED` is refused without a recorded snapshot.
8. CV upload: `browser_file_upload` with `cv.path` from the packet on the resume input
   (or after clicking "Attach" when the input is hidden). Then confirm the file name appears
   in the page text; React forms sometimes report success while `files.length` is 0.
9. Before Submit, re-snapshot and verify: name/email/phone show the profile values, the CV
   file name is present, no value leaked into an unrelated field (a URL or a number appearing
   in several inputs means a mass-fill bug — repair by ref before continuing).
10. `settings.submitMode === "REVIEW"`: `review_request {applicationId, fields: [{label,
    value}…]}` with the final-step fields, then `review_wait {reviewId, waitMs: 120000}` in a
    loop until `decided`. `approve` → submit; `edit` → apply every edit by ref, record the
    fields again, submit; `reject` → `application_update {status: "FAILED", notes: "rejected
    in review: <note>"}`.
11. Submit. Multi-page forms reveal new required fields after each submit: re-snapshot, fill
    the newly listed fields, record them, submit again (bounded: 4 rounds). Validation lists
    every missing label; map each label to its widget type before touching it.
12. Verification evidence:
    - confirmation page (`Thank you for applying`, `Application submitted`, `Application sent`)
      → `browser_screenshot`, keep the artifact id, `event_log {applicationId, type:
      "SCREENSHOT", message, artifactId}`;
    - Greenhouse security code: `mail_wait_for_code {fromContains: "greenhouse-mail.io",
      pattern: "security code[\\s\\S]{0,120}?([A-Za-z0-9]{8})", timeoutMs: 180000}`, type the
      code into the code page (`references/greenhouse.md`), then screenshot the thank-you page;
    - verification links: `mail_find_link {urlContains: "...", timeoutMs: 180000}` and open it.
    `application_update {id, status: "SUBMITTED"}` once the form is accepted, then
    `application_update {id, status: "VERIFIED", evidenceArtifactIds: [...],
    externalConfirmation: "<code or page title>"}` only with evidence. A filled form is not
    an application. No evidence after the bounded retries → `FAILED` with a precise note.
13. `job_report` (in a run) and move on; outside a run wait the pacing window before the next.

## Truthful answers

- Only the profile, memory, the answer bank and the CV text are sources. Never invent employers,
  titles, dates, degrees, citizenship, residence, work authorization or years of experience.
- Years-of-experience and eligibility questions (residency, citizenship, sponsorship,
  security clearance, right to work in a specific country) must match the profile exactly.
  If nothing answers it, `question_ask {applicationId, question, options?, label}`. A known
  answer comes back immediately (`answered: true`); otherwise the application is parked as
  `NEEDS_USER`, the operator sees the card in the rail, and you `question_wait {questionId,
  waitMs: 120000}` in a loop (up to 10 minutes). The answer is already in memory when it
  arrives; continue the same application. If nobody answers, `job_report {outcome:
  "needs_user"}` and take the next posting.
- Required dropdowns whose options exclude the candidate (US-state-only lists, "which EU
  country are you in" for a non-EU resident) mean the posting is not applicable: `FAILED`
  with note `not eligible: <label>`; remember it as a `LESSON` for that company; do not pick
  a false option.
- Optional demographic/EEO questions: choose "prefer not to say" style options when
  available; otherwise fill from the profile only if the profile states them.
- Cover letters: short, factual, from the profile headline/summary and the posting. Use the
  cover letter template text from `coverLetter.path` when present.

## Handoff: CAPTCHA, login, MFA

- Never solve, bypass or automate a CAPTCHA or an anti-bot check. Never read, request or
  store credentials, cookies or session files.
- When a CAPTCHA, a login page, an MFA prompt or any decision only the operator can make
  appears: `browser_request_handoff {kind, reason}` with a one-line reason that names the
  site and the step, then `handoff_wait {timeoutMs: 600000}`. The pane shows the operator an
  overlay with "Take control"; while the operator holds control, `playwright_pane` refuses
  connections.
- After `handoff_wait` returns `resumed: true`, re-snapshot: the page may have moved.
  If the operator did not take over before the timeout, `NEEDS_USER`, `job_report
  {outcome: "needs_user"}` and move on.

## Pacing and bans

- `job_next` and `pacing_check` enforce the pane settings (daily caps per site, spacing,
  pause). Default caps are conservative; LinkedIn tolerates roughly 20–30 Easy Apply
  submissions a day with 2–4 minutes between them. Job-page views also throttle
  (`references/linkedin-easy-apply.md`).
- Hard stops: HTTP 403 pages, "unusual activity" or verification walls, repeated identical
  validation failures across one board, employer-side per-candidate application limits
  (Ashby "candidates may not apply more than N times"). Stop the board, note it as a `SITE`
  memory, `FAILED` with note `limit: <text>`, continue with another site.
- Do not reload or resubmit a Greenhouse code page repeatedly: every submit mails another
  code and the page state goes stale.

## Per-ATS notes

- Greenhouse (`boards.greenhouse.io`, `job-boards.greenhouse.io/embed`): widget taxonomy,
  embed iframes, security-code page variants → `references/greenhouse.md`.
- Ashby (`jobs.ashbyhq.com`): UUID field ids, React-controlled inputs, chained required
  fields, application limits → `references/ashby.md`.
- LinkedIn Easy Apply: in-page multi-step form (not a modal), guarded submit, by-ref fills,
  throttle → `references/linkedin-easy-apply.md`.
- Lever, Workday, iCIMS and company sites → `references/board-quirks.md`,
  `references/icims.md`, `references/workday.md`.
- Finding postings and building a pool (public ATS APIs, filters, `discover_search`) →
  `references/discovery.md`.

## Failure taxonomy (tracker notes use these words)

| Note | Meaning | Next |
|---|---|---|
| `validation: <labels>` | required fields missing after 4 rounds | inspect the labels' widget types; fix or `NEEDS_USER` |
| `not eligible: <label>` | option set excludes the candidate | `FAILED`; drop similar postings; `LESSON` memory |
| `limit: <text>` | employer-side application limit | stop that board; `SITE` memory |
| `captcha/login timeout` | operator did not take the handoff | `NEEDS_USER` |
| `rejected in review: <note>` | operator rejected before submit | `FAILED` |
| `external: <ats>` | posting redirects to another ATS | restart with the right playbook |
| `closed` | no submit button / posting closed | `FAILED` |

## Never

- Mass-fill inputs by label match; trust a pre-filled form after a browser restart without
  re-reading values; count a submit without evidence; submit without `fields_record`; use
  another browser than the pane's; print or ask for passwords, codes you did not receive
  through `space_jobapply`, or the operator's cookies; take work the run did not hand you.

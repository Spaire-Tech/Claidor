/**
 * The draft composer's host side (25 September 2026, ledger F-082 corrected,
 * cards-plan row 6).
 *
 * The pinned renderer draws the `email-draft` and `slack-draft` cards and
 * the transport carries both kinds; the upstream app 0.18 shipped the card's Send
 * and Discard callbacks empty and the reconstruction had no tool that
 * emits a draft. Now `DraftExternalMessage` (host/runner/tools/
 * draft-message-tool.ts) appends the card, and the gateway takes `sendDraft`
 * and `discardDraft` from the Mac. Send does not deliver from here: the
 * host marks the entry `sending`, wakes the agent with a hidden prompt to
 * deliver it through whatever the person has (a connected connector's MCP
 * tool, a custom MCP server, or the box browser signed in to the service),
 * and the agent closes with `MarkDraftDelivered`, which marks the entry
 * `sent` or hands it back as `editable` with the reason in chat. Discard is
 * a decline: the agent is told once and must not redraft unasked.
 *
 * 28 October 2026 (the founder: "im very mad at the experience of sending
 * emails … something is broken"; a reply with a file attached went to the wrong
 * people, "failed", and lost its paragraphs):
 * - Send answers the app at once. It used to wait for the agent's whole
 *   delivery turn, and the app gives a command 60 s (`Gateway.swift`), so a
 *   reply with an attachment read "The draft didn't send" while Outlook was
 *   still sending it. The card follows `sending` → `sent` or `editable`
 *   through the transcript, as it already could; a turn that ends with the
 *   card still `sending` hands it back.
 * - The card is read and written in its own agent's transcript, not the one
 *   on screen, so a person who opens another chat meanwhile no longer
 *   leaves it `sending` for good (MarkDraftDelivered found no card).
 * - An email that names its mailbox (`via`) is sent with one exact call the
 *   host writes from the card (`emailSendCalls`): the recipients as they
 *   are on the card, a reply in its own thread, the body as HTML with its
 *   lines kept, and the files to attach. The agent makes that call instead
 *   of rebuilding the send, which is how it chose Outlook's plain-text
 *   reply and the wrong recipients.
 */
import { getTranscript, updateEntry } from "./transcript-store.js";
import { say } from "../../../shared/say.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";

export type DraftSendState = "editable" | "sending" | "sent";
export const DRAFT_MESSAGE_TYPES = ["email-draft", "slack-draft"] as const;

/** The connected mailboxes an email draft can name (`via`): the apps of the same ids (`vendor-mcp/catalog.ts`). */
export const EMAIL_MAILBOXES = ["gmail", "outlook"] as const;
export type EmailMailbox = (typeof EMAIL_MAILBOXES)[number];

export interface EmailDraft {
  readonly from?: string;
  readonly to: readonly string[];
  readonly cc?: readonly string[];
  readonly subject: string;
  readonly body: string;
  /** The connected mailbox it goes out from. */
  readonly via?: EmailMailbox;
  /** The conversation it answers: Gmail's thread id, Outlook's message id. */
  readonly replyTo?: { readonly threadId?: string; readonly messageId?: string };
  /** Absolute paths of files on the computer, attached on Send. */
  readonly attachments?: readonly string[];
}
export interface SlackDraft { readonly workspace?: string; readonly target: string; readonly thread?: string; readonly body: string }

type DraftEntry = TranscriptEntry & { readonly draftSendState?: DraftSendState; readonly message: { readonly type: "email-draft" | "slack-draft"; readonly draft: Record<string, unknown> } };

function isDraftEntry(entry: unknown): entry is DraftEntry {
  const message = (entry as { message?: { type?: unknown; draft?: unknown } } | null | undefined)?.message;
  return (entry as { kind?: unknown } | null | undefined)?.kind === "send-message" && (message?.type === "email-draft" || message?.type === "slack-draft") && typeof message.draft === "object" && message.draft != null;
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value : typeof value === "string" ? [value] : []).filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0);
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function mailboxOf(draft: Record<string, unknown>): EmailMailbox | undefined {
  return EMAIL_MAILBOXES.find((mailbox) => mailbox === draft.via);
}

function replyOf(draft: Record<string, unknown>): { readonly threadId: string; readonly messageId: string } {
  const reply = typeof draft.replyTo === "object" && draft.replyTo != null ? draft.replyTo as Record<string, unknown> : {};
  return { threadId: text(reply.threadId), messageId: text(reply.messageId) };
}

const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The body as the HTML an email carries: each line its own `<div>`, a blank
 * line an empty one (what Gmail and Outlook write for a typed message), so
 * the paragraphs arrive as they are on the card. Plain text sent into an
 * HTML reply runs every line together; that is what the reply read like.
 */
export function emailBodyHtml(body: string): string {
  return body.replace(/\r\n?/g, "\n").split("\n").map((line) => (line.trim().length === 0 ? "<div><br></div>" : `<div>${escapeHtml(line)}</div>`)).join("");
}

export interface EmailSendCall { readonly server: EmailMailbox; readonly tool: string; readonly args: Readonly<Record<string, unknown>> }

/**
 * The exact call that sends an email draft through the mailbox it names
 * (`via`), with the tools' own argument names (Gmail's and Outlook's apps,
 * read from their reference on 28 October 2026). Recipients are the card's:
 * To first, then the rest of To, then Cc. `instead` is for an Outlook reply,
 * whose tool answers the original sender: when that is not the card's first
 * To (the person changed it), the email goes out new to the card's people.
 * Null for a draft that names no mailbox: the agent finds the route.
 */
export function emailSendCalls(draft: Record<string, unknown>): { readonly call: EmailSendCall; readonly instead?: EmailSendCall } | null {
  const via = mailboxOf(draft);
  const to = strings(draft.to);
  const first = to[0];
  if (via == null || first == null) return null;
  const cc = strings(draft.cc);
  const files = strings(draft.attachments);
  const attachment = files.length === 0 ? {} : { attachment: files.length === 1 ? files[0] : files };
  const html = emailBodyHtml(typeof draft.body === "string" ? draft.body : "");
  const subject = text(draft.subject);
  const reply = replyOf(draft);
  if (via === "gmail") {
    const recipients = { recipient_email: first, ...(to.length > 1 ? { extra_recipients: to.slice(1) } : {}), ...(cc.length > 0 ? { cc } : {}) };
    if (reply.threadId.length > 0) return { call: { server: via, tool: "GMAIL_REPLY_TO_THREAD", args: { thread_id: reply.threadId, ...recipients, message_body: html, is_html: true, ...attachment } } };
    return { call: { server: via, tool: "GMAIL_SEND_EMAIL", args: { ...recipients, subject, body: html, is_html: true, ...attachment } } };
  }
  const seen = new Set<string>();
  const unique = (list: readonly string[]): string[] => list.filter((address) => !seen.has(address.toLowerCase()) && Boolean(seen.add(address.toLowerCase())));
  const fresh: EmailSendCall = { server: via, tool: "OUTLOOK_SEND_EMAIL", args: { to: to.join(","), ...(cc.length > 0 ? { cc_emails: cc } : {}), subject, body: html, is_html: true, ...attachment } };
  if (reply.messageId.length === 0) return { call: fresh };
  seen.add(first.toLowerCase());
  const copied = unique([...to.slice(1), ...cc]);
  return { call: { server: via, tool: "OUTLOOK_REPLY_EMAIL", args: { message_id: reply.messageId, comment: html, is_html: true, ...(copied.length > 0 ? { cc_emails: copied } : {}), ...attachment } }, instead: fresh };
}

function describeDraft(message: { readonly type: string; readonly draft: Record<string, unknown> }): string {
  const draft = message.draft;
  if (message.type === "email-draft") {
    const cc = strings(draft.cc);
    const files = strings(draft.attachments);
    const reply = replyOf(draft);
    const via = mailboxOf(draft);
    const lines = [
      `an email${text(draft.from).length > 0 ? ` from ${text(draft.from)}` : ""}${via == null ? "" : ` (${via === "gmail" ? "Gmail" : "Outlook"})`}`,
      `To: ${strings(draft.to).join(", ")}`,
      ...(cc.length > 0 ? [`Cc: ${cc.join(", ")}`] : []),
      `Subject: ${String(draft.subject ?? "")}`,
      ...(reply.threadId.length > 0 ? [`In reply to: thread ${reply.threadId}`] : reply.messageId.length > 0 ? [`In reply to: message ${reply.messageId}`] : []),
      ...(files.length > 0 ? [`Attachments: ${files.join(", ")}`] : []),
    ];
    return `${lines.join("\n")}\n\n${String(draft.body ?? "")}`;
  }
  return `a Slack message${typeof draft.workspace === "string" && draft.workspace.length > 0 ? ` in ${draft.workspace}` : ""} to ${String(draft.target ?? "")}${typeof draft.thread === "string" && draft.thread.length > 0 ? ` (thread ${draft.thread})` : ""}\n\n${String(draft.body ?? "")}`;
}

/** The prompt the agent is woken with when the person presses Send. */
export function buildDraftSendWakePrompt(entryId: string, message: { readonly type: string; readonly draft: Record<string, unknown> }): string {
  const close = `Then call MarkDraftDelivered with entry_id "${entryId}" and outcome "sent" once it has gone, or outcome "failed" with one plain sentence the user reads when it could not be sent (not connected, a missing permission, a file that isn't there, the service refused). Do not send it twice. Do not reply with a SendMessage unless it failed.`;
  const calls = message.type === "email-draft" ? emailSendCalls(message.draft) : null;
  if (calls != null) {
    const named = (call: EmailSendCall): string => `server "${call.server}", toolName "${call.tool}" and exactly these arguments:\n${JSON.stringify(call.args)}`;
    const sender = strings(message.draft.to)[0];
    return [
      `[The user pressed Send on your email draft (entry ${entryId}). This is their explicit instruction to send it exactly as on the card: do not reword it, and do not change who gets it.]`,
      `Send it with one CallMcpTool call: ${named(calls.call)}`,
      ...(calls.instead == null ? [] : [`That tool answers the sender of the message it replies to. If that sender is not ${sender} (the user changed who it goes to), send it instead with ${named(calls.instead)}`]),
      "If CallMcpTool asks you to read the tool first, read it with GetMcpTools and make the same call. If the tool refuses an argument's name or shape, correct only that from its definition; never change the recipients, the words or the files. If the mailbox is not connected or its sign-in lacks a permission, do not try another route.",
      close,
      "",
      `The card: ${describeDraft(message)}`,
    ].join("\n");
  }
  const service = message.type === "email-draft" ? "email" : "Slack";
  const email = message.type === "email-draft";
  const reply = email ? replyOf(message.draft) : { threadId: "", messageId: "" };
  return [
    `[The user pressed Send on your draft (entry ${entryId}). This is their explicit instruction to send it, with the text exactly as shown below; do not reword it.]`,
    `Deliver it now as ${service}, by the best route the user actually has: a connected connector's MCP tool for ${email ? "their mail" : "Slack"} (GetMcpTools, then CallMcpTool), a custom MCP server they added, or, if neither exists, the box browser signed in to the service through a computerUse subagent.`,
    ...(email ? [
      "Send it to exactly the To and Cc on the card, nobody else and nobody fewer.",
      ...(reply.threadId.length > 0 || reply.messageId.length > 0 ? ["It answers the conversation named below: send it as a reply in that conversation, not as a new email."] : []),
      `Keep its paragraphs: where the tool takes HTML, send this body with HTML on:\n${emailBodyHtml(typeof message.draft.body === "string" ? message.draft.body : "")}`,
    ] : []),
    close,
    "",
    describeDraft(message),
  ].join("\n");
}

export function buildDraftDiscardWakePrompt(entryId: string, message: { readonly type: string }): string {
  return `[The user discarded your ${message.type === "email-draft" ? "email" : "Slack"} draft (entry ${entryId}). Treat it as declined: do not send it by any route, and do not draft it again unless they ask. Continue the task without it, or wait; a one-line acknowledgement at most.]`;
}

/** What the person changed on the card, as the card's own fields: never its state, its route or its reply. */
function personEdits(draft: Record<string, unknown> | undefined): Record<string, unknown> {
  if (draft == null) return {};
  const kept: Record<string, unknown> = {};
  for (const key of ["from", "to", "cc", "subject", "body", "target", "workspace", "thread"]) if (draft[key] !== undefined) kept[key] = draft[key];
  return kept;
}

export class DraftCards {
  constructor(private readonly tm: TranscriptManagerLike) {}

  private log(line: string): void {
    if (typeof this.tm.log === "function") this.tm.log(line);
    else console.warn(line);
  }

  private liveSession(agentId: string): any {
    return this.tm.sessions?.activeSession?.id === agentId ? this.tm.sessions.activeSession : (this.tm.sessions?.liveSessions?.get?.(agentId) ?? null);
  }

  /**
   * The card in its agent's transcript: the open session's, else the agent's
   * saved one. Without an agent (an older caller) or a store to read, the
   * transcript in memory, as before.
   */
  private async read(agentId: string | undefined, entryId: string): Promise<DraftEntry | null> {
    if (agentId != null) {
      const live = this.liveSession(agentId);
      if (typeof live?.db?.getTranscriptEntries === "function") {
        const found = (live.db.getTranscriptEntries() as unknown[]).find((entry) => (entry as { id?: unknown }).id === entryId);
        return isDraftEntry(found) ? found : null;
      }
      const saved = this.tm.sessionStore?.readAgentTranscriptEntries;
      if (typeof saved === "function") {
        const found = ((await saved.call(this.tm.sessionStore, agentId)) as unknown[] ?? []).find((entry) => (entry as { id?: unknown }).id === entryId);
        return isDraftEntry(found) ? found : null;
      }
    }
    const found = getTranscript().find((entry) => entry.id === entryId);
    return isDraftEntry(found) ? found : null;
  }

  /** Writes a change to the card in its agent's transcript and sends it to the apps; null from `change` leaves it as it is. */
  private async stamp(agentId: string | undefined, entryId: string, change: (entry: DraftEntry) => TranscriptEntry | null): Promise<TranscriptEntry | null> {
    const applied = (entry: TranscriptEntry): TranscriptEntry => (isDraftEntry(entry) ? (change(entry) ?? entry) : entry);
    if (agentId != null) {
      const live = this.liveSession(agentId);
      if (typeof live?.db?.getTranscriptEntries === "function") {
        const current = (live.db.getTranscriptEntries() as TranscriptEntry[]).find((entry) => entry.id === entryId);
        if (!isDraftEntry(current)) return null;
        const next = applied(current);
        if (next === current) return current;
        live.db.updateTranscriptEntry(entryId, () => next);
        const inMemory = this.tm.sessions?.activeSession?.id === agentId && (this.tm.sessions?.inMemoryTranscriptAgentId == null || this.tm.sessions.inMemoryTranscriptAgentId === agentId)
          ? updateEntry(entryId, () => next)
          : null;
        return this.emit(inMemory ?? next, agentId);
      }
      const withDb = this.tm.sessionStore?.withAgentDb;
      if (typeof withDb === "function") {
        const next = await withDb.call(this.tm.sessionStore, agentId, (db: { getTranscriptEntries(): TranscriptEntry[]; updateTranscriptEntry(id: string, update: (entry: TranscriptEntry) => TranscriptEntry): void }) => {
          const current = db.getTranscriptEntries().find((entry) => entry.id === entryId);
          if (!isDraftEntry(current)) return null;
          const changed = applied(current);
          if (changed !== current) db.updateTranscriptEntry(entryId, () => changed);
          return changed;
        }) as TranscriptEntry | null;
        return next == null ? null : this.emit(next, agentId);
      }
    }
    const current = getTranscript().find((entry) => entry.id === entryId);
    if (!isDraftEntry(current)) return null;
    const next = applied(current);
    if (next === current) return current;
    const updated = updateEntry(entryId, () => next);
    if (updated == null) return null;
    this.tm.sessions?.activeSession?.db?.updateTranscriptEntry?.(entryId, () => next);
    return this.emit(updated, agentId);
  }

  private emit(entry: TranscriptEntry, agentId: string | undefined): TranscriptEntry {
    if (agentId == null) this.tm.roster.emit({ type: "updated", entry });
    else {
      this.tm.roster.emit({ type: "updated", entry }, agentId);
      void this.tm.roster.emitAgentUpdate?.(agentId);
    }
    return entry;
  }

  /**
   * The agent's hidden turn, started without the app waiting on it. A Send
   * whose turn ends with the card still `sending` (the run failed, or the
   * agent never reported) hands the card back, so it never stays `sending`.
   */
  private wake(agentId: string, entryId: string, source: "draft-send" | "draft-discard", prompt: string, trayTitle: string): void {
    void Promise.resolve()
      .then(() => this.tm.backgroundWakes.runHiddenPromptWake(agentId, source, prompt, trayTitle))
      .catch((error: unknown) => this.log(`[drafts] ${source} wake for ${agentId}/${entryId} failed: ${error instanceof Error ? error.message : String(error)}`))
      .then(async () => {
        if (source !== "draft-send") return;
        let handedBack = false;
        await this.stamp(agentId, entryId, (entry) => {
          if (entry.draftSendState !== "sending") return null;
          handedBack = true;
          return { ...entry, draftSendState: "editable" as DraftSendState };
        });
        if (handedBack) this.log(`[drafts] ${agentId}/${entryId} handed back: the send turn ended without a report`);
      })
      .catch((error: unknown) => this.log(`[drafts] settling ${agentId}/${entryId} failed: ${error instanceof Error ? error.message : String(error)}`));
  }

  /** The person pressed Send: the edited fields are kept, the card shows `sending`, the app has its answer, and the agent is woken to deliver. */
  async sendDraft(args: { readonly agentId: string; readonly entryId: string; readonly draft?: Record<string, unknown> }): Promise<TranscriptEntry | null> {
    // The card lives in its agent's transcript, which is the one in memory
    // only once that agent is the action target (as for a widget answer).
    await this.tm.sessions.ensureActionTarget?.(args.agentId);
    const current = await this.read(args.agentId, args.entryId);
    if (current == null) return null;
    if (current.draftSendState === "sending" || current.draftSendState === "sent") return current;
    const merged = { ...current.message.draft, ...personEdits(args.draft) };
    const updated = await this.stamp(args.agentId, args.entryId, (entry) => ({ ...entry, message: { ...(entry.message as object), draft: merged }, draftSendState: "sending" as DraftSendState, widgetDismissed: false } as TranscriptEntry));
    if (updated == null) return null;
    this.wake(args.agentId, args.entryId, "draft-send", buildDraftSendWakePrompt(args.entryId, { type: current.message.type, draft: merged }), say(this.tm.userLanguage?.(), "tray.draftSendFailed"));
    return updated;
  }

  /** The person discarded the draft: the card is dismissed and the agent is told once. */
  async discardDraft(args: { readonly agentId: string; readonly entryId: string }): Promise<TranscriptEntry | null> {
    await this.tm.sessions.ensureActionTarget?.(args.agentId);
    const current = await this.read(args.agentId, args.entryId);
    if (current == null) return null;
    if (current.draftSendState === "sent") return current;
    const updated = await this.stamp(args.agentId, args.entryId, (entry) => ({ ...entry, draftSendState: "editable" as DraftSendState, widgetDismissed: true } as TranscriptEntry));
    if (updated == null) return null;
    this.wake(args.agentId, args.entryId, "draft-discard", buildDraftDiscardWakePrompt(args.entryId, current.message), say(this.tm.userLanguage?.(), "tray.draftDiscardFailed"));
    return updated;
  }

  /** The agent's report after a Send wake, on the card in its own agent's transcript. */
  async markDraftDelivered(args: { readonly entryId: string; readonly outcome: "sent" | "failed"; readonly agentId?: string }): Promise<TranscriptEntry | null> {
    return await this.stamp(args.agentId, args.entryId, (entry) => ({ ...entry, draftSendState: (args.outcome === "sent" ? "sent" : "editable") as DraftSendState } as TranscriptEntry));
  }
}

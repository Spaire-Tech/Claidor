/**
 * The draft composer's host side (25 September 2026, ledger F-082 corrected,
 * cards-plan row 6).
 *
 * The pinned renderer draws the `email-draft` and `slack-draft` cards and
 * the transport carries both kinds; Grok Bot 0.18 shipped the card's Send
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
 */
import { getTranscript, updateEntry } from "./transcript-store.js";
import type { TranscriptEntry, TranscriptManagerLike } from "./transcript-hub.js";

export type DraftSendState = "editable" | "sending" | "sent";
export const DRAFT_MESSAGE_TYPES = ["email-draft", "slack-draft"] as const;

export interface EmailDraft { readonly from?: string; readonly to: readonly string[]; readonly cc?: readonly string[]; readonly subject: string; readonly body: string }
export interface SlackDraft { readonly workspace?: string; readonly target: string; readonly thread?: string; readonly body: string }

function isDraftEntry(entry: TranscriptEntry | null | undefined): entry is TranscriptEntry & { readonly message: { readonly type: "email-draft" | "slack-draft"; readonly draft: Record<string, unknown> } } {
  const message = (entry as { message?: { type?: unknown; draft?: unknown } } | null | undefined)?.message;
  return entry?.kind === "send-message" && (message?.type === "email-draft" || message?.type === "slack-draft") && typeof message.draft === "object" && message.draft != null;
}

function describeDraft(message: { readonly type: string; readonly draft: Record<string, unknown> }): string {
  const draft = message.draft;
  if (message.type === "email-draft") {
    const to = Array.isArray(draft.to) ? (draft.to as string[]).join(", ") : String(draft.to ?? "");
    const cc = Array.isArray(draft.cc) && draft.cc.length > 0 ? `\nCc: ${(draft.cc as string[]).join(", ")}` : "";
    return `an email${typeof draft.from === "string" && draft.from.length > 0 ? ` from ${draft.from}` : ""}\nTo: ${to}${cc}\nSubject: ${String(draft.subject ?? "")}\n\n${String(draft.body ?? "")}`;
  }
  return `a Slack message${typeof draft.workspace === "string" && draft.workspace.length > 0 ? ` in ${draft.workspace}` : ""} to ${String(draft.target ?? "")}${typeof draft.thread === "string" && draft.thread.length > 0 ? ` (thread ${draft.thread})` : ""}\n\n${String(draft.body ?? "")}`;
}

/** The prompt the agent is woken with when the person presses Send. */
export function buildDraftSendWakePrompt(entryId: string, message: { readonly type: string; readonly draft: Record<string, unknown> }): string {
  const service = message.type === "email-draft" ? "email" : "Slack";
  return [
    `[The user pressed Send on your draft (entry ${entryId}). This is their explicit instruction to send it, with the text exactly as shown below; do not reword it.]`,
    `Deliver it now as ${service}, by the best route the user actually has: a connected connector's MCP tool for ${service === "email" ? "their mail" : "Slack"} (GetMcpTools, then CallMcpTool), a custom MCP server they added, or, if neither exists, the box browser signed in to the service through a computerUse subagent.`,
    `Then call MarkDraftDelivered with entry_id "${entryId}" and outcome "sent" once it has gone, or outcome "failed" with one plain sentence when it could not be sent (no route, not signed in, the service refused). Do not send it twice. Do not reply with a SendMessage unless it failed.`,
    "",
    describeDraft(message),
  ].join("\n");
}

export function buildDraftDiscardWakePrompt(entryId: string, message: { readonly type: string }): string {
  return `[The user discarded your ${message.type === "email-draft" ? "email" : "Slack"} draft (entry ${entryId}). Treat it as declined: do not send it by any route, and do not draft it again unless they ask. Continue the task without it, or wait; a one-line acknowledgement at most.]`;
}

export class DraftCards {
  constructor(private readonly tm: TranscriptManagerLike) {}

  private stamp(entryId: string, update: (entry: TranscriptEntry) => TranscriptEntry): TranscriptEntry | null {
    const updated = updateEntry(entryId, update);
    if (updated == null) return null;
    this.tm.roster.emit({ type: "updated", entry: updated });
    this.tm.sessions.activeSession?.db?.updateTranscriptEntry?.(entryId, update);
    return updated;
  }

  private find(entryId: string): TranscriptEntry | null {
    return getTranscript().find((entry) => entry.id === entryId) ?? null;
  }

  /** The person pressed Send: the edited fields are kept, the card shows `sending`, and the agent is woken to deliver. */
  async sendDraft(args: { readonly agentId: string; readonly entryId: string; readonly draft?: Record<string, unknown> }): Promise<TranscriptEntry | null> {
    const current = this.find(args.entryId);
    if (!isDraftEntry(current)) return null;
    if (current.draftSendState === "sending" || current.draftSendState === "sent") return current;
    const merged = { ...current.message.draft, ...(args.draft ?? {}) };
    const updated = this.stamp(args.entryId, (entry) => ({ ...entry, message: { ...(entry.message as object), draft: merged }, draftSendState: "sending" as DraftSendState, widgetDismissed: false }));
    if (updated == null) return null;
    await this.tm.backgroundWakes.runHiddenPromptWake(args.agentId, "draft-send", buildDraftSendWakePrompt(args.entryId, { type: current.message.type, draft: merged }), "Sending the draft failed");
    return this.find(args.entryId);
  }

  /** The person discarded the draft: the card is dismissed and the agent is told once. */
  async discardDraft(args: { readonly agentId: string; readonly entryId: string }): Promise<TranscriptEntry | null> {
    const current = this.find(args.entryId);
    if (!isDraftEntry(current)) return null;
    if (current.draftSendState === "sent") return current;
    const updated = this.stamp(args.entryId, (entry) => ({ ...entry, draftSendState: "editable" as DraftSendState, widgetDismissed: true }));
    if (updated == null) return null;
    await this.tm.backgroundWakes.runHiddenPromptWake(args.agentId, "draft-discard", buildDraftDiscardWakePrompt(args.entryId, current.message), "Draft discard follow-up failed");
    return updated;
  }

  /** The agent's report after a Send wake. */
  markDraftDelivered(args: { readonly entryId: string; readonly outcome: "sent" | "failed" }): TranscriptEntry | null {
    const current = this.find(args.entryId);
    if (!isDraftEntry(current)) return null;
    return this.stamp(args.entryId, (entry) => ({ ...entry, draftSendState: (args.outcome === "sent" ? "sent" : "editable") as DraftSendState }));
  }
}

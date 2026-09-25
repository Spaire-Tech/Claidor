/**
 * DraftExternalMessage and MarkDraftDelivered (25 September 2026).
 *
 * Grok Bot's draft composer rule (docs/product/sources/grok-bot-cards.md §6):
 * any email or Slack message that would go out under the user's name is a
 * draft card by default; the user edits it and presses Send; drafting sends
 * nothing and does not end the turn by itself; a discarded card is a
 * decline. The card existed in the pinned renderer and the transport; the
 * tool that emits it did not. `MarkDraftDelivered` is the other half: the
 * Send wake (host/extensions/transcript/draft-cards.ts) asks the agent to
 * deliver by whatever route the person has, then report.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";

const recipient = z.string().trim().min(1);

export const draftExternalMessageParameters = z.object({
  kind: z.enum(["email", "slack"]).describe('"email" or "slack": which kind of message this is, and which card is drawn.'),
  to: z.array(recipient).optional().describe("Email: the recipients' addresses. Required for an email. Real addresses only; never a placeholder."),
  cc: z.array(recipient).optional().describe("Email: Cc addresses, if any."),
  from: z.string().trim().optional().describe("Email: the sending address when you know it (the connected account's address). Omit rather than guess."),
  subject: z.string().trim().optional().describe("Email: the subject line. Required for an email."),
  target: z.string().trim().optional().describe('Slack: the channel or person, as the user names it ("#eng", "@sam"). Required for Slack. Never guess a conversation id.'),
  workspace: z.string().trim().optional().describe("Slack: the workspace name when the user has more than one."),
  thread: z.string().trim().optional().describe("Slack: the thread to reply in, when replying in one."),
  body: z.string().trim().min(1).describe("The message itself, exactly as it should be sent. Plain text. The user edits it on the card before sending."),
});

export const markDraftDeliveredParameters = z.object({
  entry_id: z.string().trim().min(1).describe("The draft entry id from the Send wake or from DraftExternalMessage's result."),
  outcome: z.enum(["sent", "failed"]).describe('"sent" once the message has gone out by any route; "failed" when it could not be sent.'),
  detail: z.string().trim().optional().describe('For "failed": one plain sentence the user reads (no route, not signed in, the service refused).'),
});

export type DraftCardMessage =
  | { readonly type: "email-draft"; readonly draft: { readonly from?: string; readonly to: readonly string[]; readonly cc?: readonly string[]; readonly subject: string; readonly body: string } }
  | { readonly type: "slack-draft"; readonly draft: { readonly workspace?: string; readonly target: string; readonly thread?: string; readonly body: string } };

export interface DraftToolDependencies {
  /** Appends the card to the transcript; returns the entry id when the transport reports one. */
  emitDraftCard(message: DraftCardMessage, timestampMs: number): string | undefined;
  markDraftDelivered(entryId: string, outcome: "sent" | "failed"): boolean;
  /** Tells the user, in chat, why a Send failed (a plain text SendMessage). */
  sayInChat(content: string, timestampMs: number): void;
  now?: () => number;
}

export function draftCardMessageFromArgs(args: z.infer<typeof draftExternalMessageParameters>): DraftCardMessage | string {
  if (args.kind === "email") {
    const to = (args.to ?? []).map((value) => value.trim()).filter((value) => value.length > 0);
    if (to.length === 0) return "An email draft needs at least one recipient in `to`.";
    if (args.subject == null || args.subject.length === 0) return "An email draft needs a `subject`.";
    const bad = to.concat(args.cc ?? []).find((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
    if (bad != null) return `"${bad}" is not an email address. Use real addresses; ask the user if you do not have one.`;
    return { type: "email-draft", draft: { ...(args.from == null || args.from.length === 0 ? {} : { from: args.from }), to, ...(args.cc == null || args.cc.length === 0 ? {} : { cc: args.cc }), subject: args.subject, body: args.body } };
  }
  if (args.target == null || args.target.length === 0) return "A Slack draft needs a `target` (the channel or person, as the user names it).";
  return { type: "slack-draft", draft: { ...(args.workspace == null || args.workspace.length === 0 ? {} : { workspace: args.workspace }), target: args.target, ...(args.thread == null || args.thread.length === 0 ? {} : { thread: args.thread }), body: args.body } };
}

export const DRAFT_SHOWN_NOTE = "Nothing was sent. The user can edit the fields and press Send, or discard it; you will be woken when they do. Do not send this message by any other route, and do not redraft it unless they ask.";

export function createDraftExternalMessageTool(deps: DraftToolDependencies) {
  return defineCommunicateTool(deps, {
    id: "DRAFT_EXTERNAL_MESSAGE",
    name: "DraftExternalMessage",
    description: "Show the user an editable draft card for an email or a Slack message that would go out under their name. This is the default for anything sent as them: they asked for a draft, the message is how you'd complete a task they didn't literally say \"send\" for, or you're unsure they meant send. Resolve the routing first (real addresses, the channel or person as they named it); the user edits the text on the card, not the routing. Drafting sends nothing and does not end your turn; Send on the card is what sends, and you are woken to deliver it. Send without a card only when they explicitly asked in this conversation to send that message to those recipients.",
    parameters: draftExternalMessageParameters,
    describeActivity: (args: z.infer<typeof draftExternalMessageParameters>) => ({ detail: `Drafting ${args.kind === "email" ? "an email" : "a Slack message"}` }),
    execute: async (_ctx, args: z.infer<typeof draftExternalMessageParameters>, resolved) => {
      const message = draftCardMessageFromArgs(args);
      if (typeof message === "string") return message;
      const entryId = resolved.emitDraftCard(message, (resolved.now ?? Date.now)());
      return `Draft shown to the user as an editable ${args.kind === "email" ? "email" : "Slack"} card${entryId == null ? "" : ` (entry ${entryId})`}. ${DRAFT_SHOWN_NOTE}`;
    },
  });
}

export function createMarkDraftDeliveredTool(deps: DraftToolDependencies) {
  return defineCommunicateTool(deps, {
    id: "MARK_DRAFT_DELIVERED",
    name: "MarkDraftDelivered",
    description: "After the user pressed Send on a draft card and you delivered it (or could not), report the outcome so the card shows Sent or goes back to editable. Call it exactly once per Send.",
    parameters: markDraftDeliveredParameters,
    execute: async (_ctx, args: z.infer<typeof markDraftDeliveredParameters>, resolved) => {
      const stamped = resolved.markDraftDelivered(args.entry_id, args.outcome);
      if (!stamped) return `No draft card with entry id "${args.entry_id}".`;
      if (args.outcome === "failed") {
        const detail = args.detail == null || args.detail.length === 0 ? "It could not be sent." : args.detail;
        resolved.sayInChat(`I couldn't send that draft. ${detail}`, (resolved.now ?? Date.now)());
        return "The card is editable again and the user has been told why. Do not retry unless they ask.";
      }
      return "The card shows Sent. Nothing more to send.";
    },
  });
}

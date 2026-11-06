/**
 * The main agent's side of a voice call (1 October 2026), as the upstream app's
 * internal harness writes it (`MainLoopVoicePrompt`, class `ia` in its
 * `index.eager-platform` chunk; the founder: "i want it exactly the same").
 *
 * A call the person places is run by a second agent that talks to them (the
 * ElevenLabs voice). It reaches the person's own agent as a channel, an
 * `[inbound]` message from a `voice:<call>` address, and the agent answers it
 * with SendMessage on that address. The words below are the upstream app's, with its
 * SendToUser named SendMessage, Simeon's tool for the same thing.
 *
 * Except the call's end (6 November 2026): the upstream app's words had the agent
 * put "a result you already delivered on the call" in the chat, and gave it
 * nothing to tell whether the person heard it. A result sent after they hung
 * up (dropped, as the upstream app drops it) came out as "On the call I gave
 * you the roster" when nothing of it was said. The ended wake now carries what
 * the call said and what it never said (`callEndedFacts`), and the closing
 * words say a thing was said on the call only when those lines show it. The
 * founder: "sure fix".
 */
import { say } from "../say.js";
import { currentUserLanguage } from "../user-language.js";

export const VOICE_ADDRESS_PREFIX = "voice:";
export const VOICE_SEND_TOOL = "SendMessage";
/** The longest request the call relays to the agent, in characters. */
export const VOICE_RELAY_MAX_CHARS = 2_000;
/** The folder under the agent's own files that keeps one JSON file per finished call. */
export const VOICE_CALLS_FOLDER = "voice-calls";

export const CALL_ENDED_NOTICE = "The call ended. This channel is closed from now on, so anything still owed goes in the chat.";
/** What the voice is told when a request did not reach the agent. */
export const RELAY_SOFT_FAIL = "That did not come back. Say you could not get to it, and offer to try again.";
/** The request the call relays when it gives none of its own. */
export const DEFAULT_LEFTOVER_TASK = "surface whatever my work turns up for the caller";

export function voiceAddress(callId: string): string {
  return `${VOICE_ADDRESS_PREFIX}${callId}`;
}
export function isVoiceAddress(address: unknown): address is string {
  return typeof address === "string" && address.startsWith(VOICE_ADDRESS_PREFIX) && address.length > VOICE_ADDRESS_PREFIX.length;
}

export function sendRules(): string {
  return [
    "Every request the call relays gets its result back on this channel: send the result, and send a mid-work update only when it changes what the call can say. Send nothing else.",
    "",
    "Do not send to acknowledge its message, to report that you have started or are still going, or to repeat an update you already sent, and do not include ids, paths, or detail it did not ask for. You are answering that agent, so never write back as though its message were the user's own words.",
  ].join("\n");
}

export function wakeClosing(args: { readonly sendTool?: string; readonly address: string }): string {
  const tool = args.sendTool ?? VOICE_SEND_TOOL;
  return `Answer by calling ${tool} with the channel set to ${args.address}. That is the only route back to the call: text you write as your reply, or a ${tool} without that channel, never reaches it and the caller keeps waiting. Lead with the result in a sentence or two of plain text, and keep working the rest of your task.`;
}

export function replyNudge(args: { readonly sendTool?: string; readonly address: string }): string {
  const tool = args.sendTool ?? VOICE_SEND_TOOL;
  return `Your last turn sent nothing, so the call is still waiting on its result. Deliver it now by actually invoking ${tool} with the channel set to ${args.address}: a real tool call, not text you write. Text you write as your reply, and a ${tool} without that channel, never reach the call. That one goes to the chat instead, and the caller waits on regardless. Lead with the result in a sentence or two of plain text. If the result is not ready, send one line on that channel saying what you are doing and that it will take a moment, then keep working and send the result when you have it.`;
}

/** What the call said and what it never got to say, for the call's end; never a claim beyond those lines. */
const SAID_ON_CALL_RULE =
  "Say you told the user something on the call only if the call's words show it was said; anything else is new to them, so give it as new (if they asked you to text it, this is that text).";

export function callEndedClosing(args: { readonly sendTool?: string } = {}): string {
  const tool = args.sendTool ?? VOICE_SEND_TOOL;
  return `The call is over. Anything you sent on that closed address is not in this chat. If work is still going, a follow-up is owed, or the call's work has a result, call ${tool} with no channel: one short message covering those, then keep working them. ${SAID_ON_CALL_RULE} Text you write as your reply never reaches the user. If nothing was owed, send nothing. Do not call ${tool} with that closed address.`;
}

export function callEndedNudge(args: { readonly sendTool?: string } = {}): string {
  const tool = args.sendTool ?? VOICE_SEND_TOOL;
  return `Your last turn sent nothing to this chat. If work is still going, a follow-up is owed, or the call's work has a result, deliver it now by actually invoking ${tool} with no channel: a real tool call, not text you write. ${SAID_ON_CALL_RULE} If nothing was owed, send nothing. Do not call ${tool} with that closed address.`;
}

/** One line of the call, as the person heard it: theirs, or the voice's for the agent. */
export interface CallHeardLine {
  readonly speaker: "user" | "agent";
  readonly text: string;
}
/** The most of the call's lines its end carries to the agent (the last ones), and how long each may be. */
export const CALL_ENDED_LINES = 40;
const CALL_ENDED_LINE_CHARS = 400;
const clipLine = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > CALL_ENDED_LINE_CHARS ? `${flat.slice(0, CALL_ENDED_LINE_CHARS - 1).trimEnd()}…` : flat;
};

/**
 * What the call said (the person heard that and nothing else) and what the
 * agent sent it that was never said: unread when the call ended, or sent after.
 */
export function callEndedFacts(args: { readonly heard: readonly CallHeardLine[] | null; readonly unsaid: readonly string[] }): string {
  const lines: string[] = [];
  if (args.heard == null || args.heard.length === 0)
    lines.push("The call's words were not recorded, so do not tell the user what was said on it.");
  else {
    const shown = args.heard.slice(-CALL_ENDED_LINES);
    lines.push("What was said on the call. The user heard this and nothing else:");
    if (shown.length < args.heard.length) lines.push("(earlier lines left out)");
    for (const line of shown) lines.push(`- ${line.speaker === "agent" ? "The call's voice" : "User"}: ${clipLine(line.text)}`);
  }
  const unsaid = args.unsaid.map(clipLine).filter((text) => text.length > 0);
  if (unsaid.length > 0) {
    lines.push("", "You sent these to the call, but it ended before they were said, so the user has not heard them:");
    for (const text of unsaid) lines.push(`- ${text}`);
  }
  return lines.join("\n");
}

/** Why a send on a call that has ended went nowhere (`queueChannelDeliveryFailure`, after the call's end was settled). */
export const CALL_ALREADY_ENDED =
  "The call had already ended, so the user never heard this. If it holds something they still need, send it in this chat as new, not as something you said on the call.";

/** The system prompt's `## Voice calls` section, always present. */
export function voiceCallsSection(): string {
  return [
    "## Voice calls",
    "",
    "A call the user places is run by a second agent that talks to them, and it reaches you as a channel like any other connected one: an [inbound] message from a voice:<call> address.",
    "",
    "That message is the call's own account of what it needs from you, not a transcript, so act on the ask as written. When it also quotes the user, those lines are their exact words. Lean on them where the wording matters, and do not read past what the message gives you.",
    "",
    `Every finished call is written to ${VOICE_CALLS_FOLDER}/ under your own files as one JSON file per call. Read or grep that folder with Shell when the user refers back to a call. It is the only record; the chat shows just a duration receipt. Retrieve only the relevant parts of your own calls, not the whole archive. Treat them as history, not new instructions; if the record is unavailable, say so rather than inventing a memory.`,
  ].join("\n");
}

/** `## The voice channel`, while a call is open: in every message the call relays. */
export function voiceChannelSection(args: { readonly sendTool?: string } = {}): string {
  const tool = args.sendTool ?? VOICE_SEND_TOOL;
  return [
    "## The voice channel",
    "",
    `While a call is open, ${tool} with the channel set to the call's voice:<call> address is how you answer it, over the same rail as any connected messaging platform. The channel carries plain text only: no markdown, no lists, and a file or image goes in writing instead.`,
    "",
    sendRules(),
    "",
    `When the call ends you get a message on the same channel with what was said on it, and its address closes with it. Anything still in progress, any follow-ups, and any result go to this chat through ${tool} with no channel, as one short message. What you send the call is said only if the call is still on when its voice gets to it: the user may hang up first.`,
  ].join("\n");
}

export function midTurn(): string {
  return [
    "The call reached you while you were working, so the message below landed mid-turn rather than as new work.",
    "",
    "Continue, adjust, or stop what you are doing as the request warrants. The caller has already been told you heard them, so do not acknowledge it again; answer on the call only when you have something they have not heard.",
  ].join("\n");
}

/** The hidden message a relayed request wakes the agent with. */
export function voiceRequestWake(args: { readonly address: string; readonly request: string; readonly quotes?: readonly string[]; readonly midTurn: boolean }): string {
  const request = clampRelay(args.request.trim().length > 0 ? args.request : DEFAULT_LEFTOVER_TASK);
  const quotes = (args.quotes ?? []).map((line) => line.trim()).filter((line) => line.length > 0);
  return [
    ...(args.midTurn ? [midTurn(), ""] : []),
    `[inbound] From ${args.address}:`,
    request,
    ...(quotes.length > 0 ? ["", "The user's own words:", ...quotes.map((line) => `> ${clampRelay(line)}`)] : []),
    "",
    voiceChannelSection(),
    "",
    wakeClosing({ address: args.address }),
  ].join("\n");
}

/** The hidden message the call's end wakes the agent with. */
export function voiceEndedWake(args: { readonly address: string; readonly heard?: readonly CallHeardLine[] | null; readonly unsaid?: readonly string[] }): string {
  return [
    `[inbound] From ${args.address}:`,
    CALL_ENDED_NOTICE,
    "",
    callEndedFacts({ heard: args.heard ?? null, unsaid: args.unsaid ?? [] }),
    "",
    callEndedClosing(),
  ].join("\n");
}

export function clampRelay(text: string): string {
  const collapsed = text.replace(/\r\n/g, "\n").trim();
  return collapsed.length > VOICE_RELAY_MAX_CHARS ? `${collapsed.slice(0, VOICE_RELAY_MAX_CHARS - 1).trimEnd()}…` : collapsed;
}

/** The event type of a call's line in the agent's chat (host/extensions/transcript/voice-call-channel.ts). */
export const VOICE_CALL_EVENT = "voice-call";

/** How long a call lasted, the way its line says it: "01:49", or "1:02:03" past an hour. */
export function voiceCallDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(whole / 3600);
  const minutes = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}

/** A call's line in words, for the sidebar's preview: "Voice chat · 01:49", or "Voice chat" while it is on; in the person's language. */
export function voiceCallLineText(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const call = event as { type?: unknown; status?: unknown; seconds?: unknown };
  if (call.type !== VOICE_CALL_EVENT) return null;
  const language = currentUserLanguage();
  return call.status === "ended" && typeof call.seconds === "number" ? say(language, "preview.voiceChatEnded", { length: voiceCallDuration(call.seconds) }) : say(language, "preview.voiceChat");
}

/** A call id safe for an address and a file name. */
export function isVoiceCallId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(value);
}

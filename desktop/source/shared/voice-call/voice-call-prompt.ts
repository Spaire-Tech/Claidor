/**
 * Every sentence a voice call puts in front of the voice model or the
 * person, in one place (30 September 2026): the per-call prompt built from
 * the agent's profile and its recent chat, the greeting, what the two client
 * tools answer, the note that makes the voice say what its work came back
 * with, the banner's status line while the agent works, and the record the
 * call leaves in the agent's chat. The agent's own side of a call is in
 * `main-loop-voice.ts`.
 *
 * The call itself is an ElevenLabs Agents conversation (the server's
 * `server/simeon/desktop/voice.py` keeps the key and the one platform
 * agent); this module only writes text, so it runs anywhere and is tested
 * as plain functions.
 */

export interface VoiceCallAgentProfile {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
}

export interface VoiceCallTranscriptLine {
  readonly speaker: "person" | "agent";
  readonly text: string;
}

/**
 * How many recent chat messages the voice is given: a few, so each reply
 * starts sooner (the founder, 1 October 2026: "is there a way the voice
 * answers faster?"); `recall_text_messages` reads further back.
 */
export const VOICE_CALL_TRANSCRIPT_LINES = 6;
/** Longest single message the prompt carries, in characters. */
export const VOICE_CALL_LINE_MAX_CHARS = 600;
/** The call's language. ElevenLabs hears and speaks it; English until the app has a setting. */
export const VOICE_CALL_LANGUAGE = "en";
/**
 * The voice the picker shows as chosen when the agent has none: Jessica, the
 * server's own default (`VOICE_DEFAULT_VOICE_ID` in
 * `server/simeon/desktop/voice.py`). A call for such an agent sends no voice
 * at all and speaks in the platform agent's, which the server picked from
 * the voices the workspace has: a voice it does not have fails the call.
 */
export const VOICE_CALL_DEFAULT_VOICE_ID = "r1KmysJdVYZjJCm4mL3b";

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();
const clamp = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The text of an agent's chat message (`send-message` of type text), or null. */
export function agentMessageText(entry: unknown): string | null {
  if (!isRecord(entry) || entry.kind !== "send-message" || !isRecord(entry.message)) return null;
  const message = entry.message;
  if (message.type !== "text" || typeof message.content !== "string") return null;
  const text = collapse(message.content);
  return text.length > 0 ? text : null;
}

/** The text the person typed (`message` with role user), or null. */
export function personMessageText(entry: unknown): string | null {
  if (!isRecord(entry) || entry.kind !== "message" || entry.role !== "user" || typeof entry.content !== "string") return null;
  const text = collapse(entry.content);
  return text.length > 0 ? text : null;
}

/**
 * The latest `limit` messages of a host transcript page, oldest first: what
 * the person wrote and what the agent sent. Tool calls, thinking and cards
 * are left out; they read badly aloud and the voice does not need them.
 */
export function transcriptLinesFromEntries(entries: readonly unknown[], limit = VOICE_CALL_TRANSCRIPT_LINES): VoiceCallTranscriptLine[] {
  const lines: VoiceCallTranscriptLine[] = [];
  for (const entry of entries) {
    const person = personMessageText(entry);
    if (person != null) { lines.push({ speaker: "person", text: clamp(person, VOICE_CALL_LINE_MAX_CHARS) }); continue; }
    const agent = agentMessageText(entry);
    if (agent != null) lines.push({ speaker: "agent", text: clamp(agent, VOICE_CALL_LINE_MAX_CHARS) });
  }
  return lines.slice(-Math.max(0, limit));
}

/**
 * The per-call system prompt (1 October 2026, the upstream app's way: the founder's
 * agent "was talking to me like he wasnt the agent"). The voice IS the
 * agent: it speaks in the first person and never mentions another agent or a
 * hand-off. Its work runs behind the call (`send_task` relays the request to
 * the agent over the `voice:<call>` channel), and what comes back is said as
 * its own.
 */
export function buildVoiceCallPrompt(args: { readonly agent: VoiceCallAgentProfile; readonly transcript: readonly VoiceCallTranscriptLine[]; readonly personName?: string | null }): string {
  const name = collapse(args.agent.name) || "your agent";
  const person = clamp(collapse(args.personName ?? ""), 60);
  const them = person.length > 0 ? person : "the person";
  const title = collapse(args.agent.title ?? "");
  const description = collapse(args.agent.description ?? "");
  const who = [
    `You are ${name}${title.length > 0 ? `, ${title}` : ""}, one of ${person.length > 0 ? `${person}'s` : "the person's"} Simeon agents, on a live phone call with ${them}.`,
    "Simeon is a team of always-on agents that work for them on their Mac and on a computer of their own.",
    ...(description.length > 0 ? [`What you are for, in their words: ${clamp(description, 800)}`] : []),
    // The name the person gave in the app, never one made from their e-mail.
    ...(person.length > 0 ? [`Call them ${person} now and then, the way a colleague would, never in every sentence.`] : []),
    `You are ${name} yourself. Speak in the first person ("I'll do that", "I've sent it"). Never mention another agent, an assistant, a system or a hand-off, and never say you are passing anything on.`,
  ].join(" ");
  const recent = args.transcript.length === 0
    ? "You and they have not written to each other yet."
    : [
        "Your latest text messages with them, oldest first, so you know what you are both talking about:",
        ...args.transcript.map((line) => `${line.speaker === "person" ? (person.length > 0 ? person : "Them") : "You"}: ${line.text}`),
      ].join("\n");
  const rules = [
    "How you talk:",
    "- This is a phone call. Speak briefly and naturally, like a person: one or two short sentences, contractions, plain words.",
    "- Never use lists, headings, markdown, emoji, or read out links. Say numbers, dates and times the way people say them.",
    "- If you did not catch something, say so and ask again. Never guess what they said.",
    "How you get things done:",
    "- Your work runs behind the call while you talk. For anything that needs doing or finding out (looking something up, writing, sending, scheduling, changing a file, checking on something you are doing), call send_task with what is needed in one clear sentence that carries every detail they gave. When their exact wording matters, put their words in quote. Then say a few words, like \"on it\", and carry on with them.",
    "- Never say something is done, sent, booked or found until a note tells you your work came back with it. Until then it is still in progress.",
    "- When a note says your work came back, tell them what it says, briefly, in your own words, as yours.",
    "- When they refer to something you wrote to each other, call recall_text_messages.",
    "- When there is nothing for you to say (they are thinking, or talking to someone else), stay silent with skip_turn.",
    "Ending:",
    "- When they wrap up (thanks, that's all, bye), say a short, natural goodbye in your own words and call end_call.",
    "- If the line goes quiet, check in lightly once, like a person would.",
  ].join("\n");
  return `${who}\n\n${recent}\n\n${rules}`;
}

const GREETINGS: readonly ((name: string, person: string) => string)[] = [
  (name, person) => `Hey${person}, it's ${name}. What's up?`,
  (name, person) => `Hi${person}, ${name} here. What can I do for you?`,
  (name, person) => `Hey${person}! ${name} speaking. What do you need?`,
  (name, person) => `Hi${person}, it's ${name}. How can I help?`,
  (name) => `${name} here. What's on your mind?`,
];

/** A short greeting with the agent's name; `pick` in [0, 1) chooses which, so calls do not all open alike. */
export function buildFirstMessage(agentName: string, pick: number, personName?: string | null): string {
  const name = collapse(agentName) || "your agent";
  const person = clamp(collapse(personName ?? ""), 60);
  const index = Math.min(GREETINGS.length - 1, Math.max(0, Math.floor((Number.isFinite(pick) ? pick : 0) * GREETINGS.length)));
  return GREETINGS[index]!(name, person.length > 0 ? ` ${person}` : "");
}

export interface VoiceCallOverrides {
  readonly agent: { readonly prompt: { readonly prompt: string }; readonly firstMessage: string; readonly language: string };
  readonly tts?: { readonly voiceId: string };
}

/** The `overrides` object `Conversation.startSession` takes, for one call. */
export function buildVoiceCallOverrides(args: {
  readonly agent: VoiceCallAgentProfile;
  readonly transcript: readonly VoiceCallTranscriptLine[];
  readonly voiceId?: string | null;
  readonly pick: number;
  readonly personName?: string | null;
}): VoiceCallOverrides {
  const voiceId = typeof args.voiceId === "string" && args.voiceId.trim().length > 0 ? args.voiceId.trim() : null;
  return {
    agent: {
      prompt: { prompt: buildVoiceCallPrompt({ agent: args.agent, transcript: args.transcript, personName: args.personName ?? null }) },
      firstMessage: buildFirstMessage(args.agent.name, args.pick, args.personName ?? null),
      language: VOICE_CALL_LANGUAGE,
    },
    ...(voiceId == null ? {} : { tts: { voiceId } }),
  };
}

// --- the voice's two client tools (the upstream app's send_task and recall_text_messages) ---

/** What `send_task` answers at once; the work goes on behind the call. */
export const SEND_TASK_ACCEPTED = "Sent. Say you're on it, in a few words, and carry on with them. What it turns up comes back to you here.";

/** What `recall_text_messages` answers: the latest texts between them, oldest first. */
export function recallTextMessagesAnswer(lines: readonly VoiceCallTranscriptLine[]): string {
  if (lines.length === 0) return "There are no text messages between you yet.";
  return ["Your latest text messages, oldest first:", ...lines.map((line) => `${line.speaker === "person" ? "Them" : "You"}: ${line.text}`)].join("\n");
}

/** The note pushed into the call (`sendContextualUpdate`) when the agent sent something on it. */
export function workCameBackUpdate(texts: readonly string[]): string {
  return `Your work came back: ${texts.map((text) => clamp(collapse(text), 2_000)).join(" ")} Tell them now, briefly, in your own words, as yours.`;
}

/** Then this, as a user turn (`sendUserMessage`), so the voice speaks now instead of waiting. */
export const WORK_CAME_BACK_NUDGE = "(Your work just came back. Tell me what it found.)";

// --- the banner's status line while the agent works --------------------------

const GERUND_EXCEPTIONS: Readonly<Record<string, string>> = {
  be: "Being", see: "Seeing", free: "Freeing", agree: "Agreeing", lie: "Lying", die: "Dying", tie: "Tying",
  set: "Setting", get: "Getting", put: "Putting", run: "Running", plan: "Planning", stop: "Stopping", ship: "Shipping", shop: "Shopping", chat: "Chatting", drop: "Dropping", pin: "Pinning", tag: "Tagging", log: "Logging", map: "Mapping", jot: "Jotting", zip: "Zipping", cut: "Cutting", dig: "Digging", sit: "Sitting", swap: "Swapping", skim: "Skimming", text: "Texting", email: "Emailing",
};

/** Verbs a request to the agent commonly starts with; anything else reads as "Working on it…". */
const TASK_VERBS = new Set([
  "add", "answer", "archive", "ask", "book", "build", "buy", "call", "cancel", "change", "check", "clean", "compare", "compile", "confirm", "copy", "create", "delete", "design", "draft", "email", "edit", "file", "fill", "find", "fix", "follow", "forward", "gather", "generate", "get", "invite", "list", "look", "make", "message", "move", "note", "order", "organize", "organise", "plan", "post", "prepare", "print", "pull", "put", "read", "record", "remind", "remove", "rename", "reply", "research", "reschedule", "respond", "review", "run", "save", "schedule", "search", "send", "set", "share", "sort", "start", "summarize", "summarise", "text", "track", "translate", "update", "upload", "write",
]);

function gerund(verb: string): string {
  const lower = verb.toLowerCase();
  const known = GERUND_EXCEPTIONS[lower];
  if (known != null) return known;
  let base = lower;
  if (base.endsWith("ie")) base = `${base.slice(0, -2)}y`;
  else if (base.endsWith("e") && !base.endsWith("ee") && !base.endsWith("ye") && !base.endsWith("oe")) base = base.slice(0, -1);
  const word = `${base}ing`;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const TASK_LABEL_MAX_WORDS = 8;

/**
 * The status line for a task just handed over: "Send the agenda to Dana"
 * reads "Sending the agenda to Dana…". A task that does not start with a
 * known verb reads "Working on it…".
 */
export function workingLabel(task: string): string {
  const words = collapse(task).replace(/^(please|can you|could you|would you)\s+/i, "").replace(/[.!?]+$/, "").split(" ").filter((word) => word.length > 0);
  const first = words[0]?.toLowerCase().replace(/[^a-z]/g, "");
  if (first == null || !TASK_VERBS.has(first)) return "Working on it…";
  const rest = words.slice(1, TASK_LABEL_MAX_WORDS);
  return `${[gerund(first), ...rest].join(" ")}…`;
}

const TOOL_LABELS: Readonly<Record<string, (detail: string | null) => string>> = {
  Shell: (detail) => (detail != null ? `Editing ${detail}…` : "Running a command…"),
  ExternalShell: (detail) => (detail != null ? `Editing ${detail}…` : "Running a command on your Mac…"),
  Read: (detail) => (detail != null ? `Reading ${detail}…` : "Reading a file…"),
  ExternalRead: (detail) => (detail != null ? `Reading ${detail}…` : "Reading a file on your Mac…"),
  AwaitShell: () => "Waiting on a command…",
  ExternalAwaitShell: () => "Waiting on a command…",
  WebSearch: () => "Searching the web…",
  WebFetch: (detail) => (detail != null ? `Reading ${detail}…` : "Reading a web page…"),
  GenerateImage: () => "Making an image…",
  CallMcpTool: (detail) => (detail != null ? `Using ${appName(detail)}…` : "Using an app…"),
  GetMcpTools: (detail) => (detail != null ? `Opening ${appName(detail)}…` : "Opening an app…"),
  McpAuth: (detail) => (detail != null ? `Signing in to ${appName(detail)}…` : "Signing in to an app…"),
  Computer: () => "Using its computer…",
  Screenshot: () => "Looking at the screen…",
  Task: () => "Working with a helper…",
};

function appName(identifier: string): string {
  const cleaned = identifier.replace(/^(composio[-_:]?|mcp[-_:]?)/i, "").replace(/[-_]+/g, " ").trim();
  if (cleaned.length === 0) return "an app";
  return cleaned.split(" ").map((word) => (word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))).join(" ");
}

/**
 * The agent's current activity (`currentActivity` on the roster row) as a
 * short line, or null when it names nothing more specific than thinking.
 */
export function describeAgentActivity(activity: unknown): string | null {
  if (!isRecord(activity) || activity.kind !== "tool" || typeof activity.tool !== "string") return null;
  const detail = typeof activity.detail === "string" && activity.detail.trim().length > 0 ? clamp(collapse(activity.detail), 40) : null;
  const label = TOOL_LABELS[activity.tool];
  return label != null ? label(detail) : "Working on it…";
}

// --- after the call -------------------------------------------------------------

/** "0:12", "2:48", "1:02:03". */
export function formatCallDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const ss = String(rest).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/** The line the call leaves in the agent's chat: "Voice call · 2:48", then the summary when there is one. */
export function callRecordText(seconds: number, summary: string | null | undefined): string {
  const head = `Voice call · ${formatCallDuration(seconds)}`;
  const body = typeof summary === "string" ? summary.trim() : "";
  return body.length > 0 ? `${head}\n\n${body}` : head;
}

// --- the banner's own sentences -------------------------------------------------

export const CALL_STATUS_CALLING = "Calling…";
export const CALL_STATUS_ENDED = "Call ended";
export const CALL_STATUS_COULD_NOT_CONNECT = "Couldn't connect";
export const CALL_STATUS_NOT_SWITCHED_ON = "Calls aren't switched on yet";
export const CALL_STATUS_NO_MICROPHONE = "Simeon can't use the microphone";
export const CALL_STATUS_NO_CREDIT = "Out of credit for calls";

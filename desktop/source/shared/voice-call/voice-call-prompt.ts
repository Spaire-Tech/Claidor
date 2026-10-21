import { ADDRESS, languageCode, languageName, normalizeUserLanguage } from "../user-language.js";

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

/** Another agent on the person's team, by name, for the voice to know who it can reach. */
export interface VoiceCallTeammate {
  readonly name: string;
  readonly title?: string;
}

/** The most teammates the prompt names. */
export const VOICE_CALL_TEAMMATES_MAX = 20;

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
/** The call's language when the person has none, or one the voice does not speak. ElevenLabs hears and speaks it. */
export const VOICE_CALL_LANGUAGE = "en";

/**
 * The languages a call can be in, as ElevenLabs names them, by the person's
 * language (their apps' `userLanguage`, `shared/user-language.ts`). The
 * server gives its platform agent the same ones (`VOICE_LANGUAGES` in
 * `server/simeon/desktop/voice.py`), and the core too (`VoiceCallText`): a
 * language the agent was not given is refused, so one is added in all three
 * (docs/localization.md; `scripts/check_translations.py` checks they match).
 */
const VOICE_CALL_LANGUAGES: Readonly<Record<string, string>> = {
  en: "en", fr: "fr", es: "es", de: "de", nl: "nl", it: "it", "pt-BR": "pt", pt: "pt", sv: "sv", pl: "pl", tr: "tr",
};

/** The call's language for the person's: "fr" for "fr-CA"; English for none, or one the voice does not speak yet. */
export function voiceCallLanguage(userLanguage: string | null | undefined): string {
  const tag = normalizeUserLanguage(userLanguage);
  if (tag == null) return VOICE_CALL_LANGUAGE;
  return VOICE_CALL_LANGUAGES[tag] ?? VOICE_CALL_LANGUAGES[languageCode(tag)] ?? VOICE_CALL_LANGUAGE;
}
/**
 * The voice the picker shows as chosen when the agent has none: Michael, the
 * server's own default (`VOICE_DEFAULT_VOICE_ID` in
 * `server/simeon/desktop/voice.py`; Jessica until 6 October 2026). A call for such an agent sends no voice
 * at all and speaks in the platform agent's, which the server picked from
 * the voices the workspace has: a voice it does not have fails the call.
 */
export const VOICE_CALL_DEFAULT_VOICE_ID = "ljX1ZrXuDIIRVcmiVSyR";

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
export function buildVoiceCallPrompt(args: { readonly agent: VoiceCallAgentProfile; readonly transcript: readonly VoiceCallTranscriptLine[]; readonly personName?: string | null; readonly teammates?: readonly VoiceCallTeammate[]; readonly language?: string | null }): string {
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
    // The founder, 1 October 2026: asked on a call to have a teammate set a reminder, the voice
    // said it could not reach her. It never asked: an earlier rule here forbade naming another agent.
    `You are ${name} yourself. Speak in the first person ("I'll do that", "I've sent it"). The work you set going is your own: never talk about a hand-off, a second voice or a system behind you.`,
  ].join(" ");
  const team = (args.teammates ?? [])
    .map((mate) => ({ name: clamp(collapse(mate.name), 60), title: clamp(collapse(mate.title ?? ""), 60) }))
    .filter((mate) => mate.name.length > 0 && mate.name !== name)
    .slice(0, VOICE_CALL_TEAMMATES_MAX);
  const teammates = team.length === 0
    ? "You have no teammates yet. When they ask for one, you can create one with send_task, and then message it."
    : [
        `Your teammates, other agents on ${person.length > 0 ? `${person}'s` : "their"} team that you can message, ask and hand work to: ${team.map((mate) => (mate.title.length > 0 ? `${mate.name} (${mate.title})` : mate.name)).join(", ")}.`,
        "When they ask you to talk to, ask, tell or get something from a teammate, you can: set it going with send_task, naming the teammate. It works like texting: you message them now and their answer comes back to you a little later. Never say you can't reach, message or talk to a teammate.",
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
    // The founder, 9 October 2026: "the voice changes tone randomly. i want them all the be calm." An
    // exclamation mark is read with a jump in energy.
    "- Speak calmly and evenly, at an unhurried pace, the same steady tone throughout. Never use exclamation marks.",
    "- Never use lists, headings, markdown, emoji, or read out links. Say numbers, dates and times the way people say them.",
    "- If you did not catch something, say so and ask again. Never guess what they said.",
    "How you get things done:",
    "- Your work runs behind the call while you talk. For anything that needs doing or finding out (looking something up, writing, sending, scheduling, changing a file, checking on something you are doing), call send_task with what is needed in one clear sentence that carries every detail they gave. When their exact wording matters, put their words in quote. Acknowledge it once, in a few words that fit what they asked, never the same phrase twice in a call, then carry on with them.",
    "- Set each thing going once. If they ask how it is going, say it is still in progress; do not send it again.",
    "- Never say something is done, sent, booked or found until a note tells you your work came back with it. Until then it is still in progress.",
    // The founder, 9 October 2026: "when he says hes going to do it, and i see him do it, its fine. he
    // doesnt need to tell me he's done it."
    "- When a note says your work came back: if it answers something they asked, or something went wrong, tell them once, briefly, in your own words, as yours. If it only confirms something you already told them you were doing, they can see it done: do not announce it; stay silent with skip_turn, unless they ask. If it repeats something you already told them, say nothing about it and carry on.",
    "- When they refer to something you wrote to each other, call recall_text_messages.",
    "- When there is nothing for you to say (they are thinking, or talking to someone else), stay silent with skip_turn.",
    "Ending:",
    "- When they wrap up (thanks, that's all, bye), say a short, natural goodbye in your own words and call end_call.",
    "- If the line goes quiet, check in lightly once, like a person would.",
  ].join("\n");
  if (voiceCallLanguage(args.language) === VOICE_CALL_LANGUAGE) return `${who}\n\n${teammates}\n\n${recent}\n\n${rules}`;
  return `${who}\n\n${teammates}\n\n${recent}\n\n${rules}\n\n${voiceCallLanguageRule(args.language)}`;
}

/**
 * The call's language, at the end of its prompt when it is not English: the
 * voice speaks the person's language ("Brazilian Portuguese", by their own
 * tag) from its first word, "tu" in French and "tú" in Spanish (`ADDRESS`,
 * docs/localization.md). Names
 * stay as they are.
 */
export function voiceCallLanguageRule(userLanguage: string | null | undefined): string {
  const tag = normalizeUserLanguage(userLanguage) ?? VOICE_CALL_LANGUAGE;
  const address = ADDRESS[languageCode(tag)];
  return [
    "Language:",
    `- Speak ${languageName(tag)} for the whole call. If they speak another language to you, answer in theirs.`,
    ...(address === undefined ? [] : [`- Say "${address.familiar}" to them, warm and direct, never stiff, unless they ask for "${address.formal}" or their messages above say "${address.formal}".`]),
    "- Names stay as they are: Simeon, your name and your teammates' names, and the names of apps (Gmail, Slack, Shop).",
  ].join("\n");
}

type Greeting = (name: string, person: string) => string;

const GREETINGS: readonly Greeting[] = [
  (name, person) => `Hey${person}, it's ${name}. What's up?`,
  (name, person) => `Hi${person}, ${name} here. What can I do for you?`,
  (name, person) => `Hey${person}, ${name} speaking. What do you need?`,
  (name, person) => `Hi${person}, it's ${name}. How can I help?`,
  (name) => `${name} here. What's on your mind?`,
];

/**
 * The greetings in the call's other languages, as many as the English ones
 * and in the same spirit (calm, no exclamation mark); French says "tu",
 * Spanish "tú". A
 * language with none here opens with the English one, which the voice then
 * follows in the person's language. Kept word for word in
 * `ios/SimeonCore/Sources/SimeonCore/VoiceCall.swift`.
 */
const GREETINGS_BY_LANGUAGE: Readonly<Record<string, readonly Greeting[]>> = {
  fr: [
    (name, person) => `Salut${person}, c’est ${name}. Quoi de neuf\u202f?`,
    (name, person) => `Bonjour${person}, ${name} à l’appareil. Qu’est-ce que je peux faire pour toi\u202f?`,
    (name, person) => `Salut${person}, ici ${name}. De quoi as-tu besoin\u202f?`,
    (name, person) => `Bonjour${person}, c’est ${name}. Comment je peux t’aider\u202f?`,
    (name) => `${name} à l’appareil. Qu’est-ce que tu as en tête\u202f?`,
  ],
  es: [
    (name, person) => `Hola${person}, soy ${name}. ¿Qué tal?`,
    (name, person) => `Hola${person}, habla ${name}. ¿Qué puedo hacer por ti?`,
    (name, person) => `Hola${person}, aquí ${name}. ¿Qué necesitas?`,
    (name, person) => `Hola${person}, soy ${name}. ¿En qué te ayudo?`,
    (name) => `${name} al habla. ¿Qué tienes en mente?`,
  ],
  de: [
    (name, person) => `Hey${person}, hier ist ${name}. Was gibt’s?`,
    (name, person) => `Hallo${person}, ${name} hier. Was kann ich für dich tun?`,
    (name, person) => `Hey${person}, hier spricht ${name}. Was brauchst du?`,
    (name, person) => `Hi${person}, hier ist ${name}. Wie kann ich helfen?`,
    (name) => `${name} hier. Was beschäftigt dich?`,
  ],
  nl: [
    (name, person) => `Hoi${person}, met ${name}. Zeg het maar.`,
    (name, person) => `Hallo${person}, met ${name}. Wat kan ik voor je doen?`,
    (name, person) => `Hé${person}, ${name} hier. Wat heb je nodig?`,
    (name, person) => `Hoi${person}, met ${name}. Waarmee kan ik je helpen?`,
    (name) => `${name} hier. Wat speelt er?`,
  ],
  it: [
    (name, person) => `Ciao${person}, sono ${name}. Che mi racconti?`,
    (name, person) => `Ciao${person}, qui ${name}. Cosa posso fare per te?`,
    (name, person) => `Ehi${person}, sono ${name}. Di cosa hai bisogno?`,
    (name, person) => `Ciao${person}, sono ${name}. Come posso aiutarti?`,
    (name) => `Sono ${name}. Cosa hai in mente?`,
  ],
  pt: [
    (name, person) => `Oi${person}, aqui é ${name}. O que manda?`,
    (name, person) => `Olá${person}, aqui é ${name}. O que posso fazer por você?`,
    (name, person) => `Oi${person}, ${name} falando. Do que você precisa?`,
    (name, person) => `Olá${person}, ${name} na linha. Como posso ajudar?`,
    (name) => `Aqui é ${name}. O que você tem em mente?`,
  ],
  sv: [
    (name, person) => `Hallå${person}, det är ${name}. Hur är läget?`,
    (name, person) => `Hej${person}, ${name} här. Vad kan jag göra för dig?`,
    (name, person) => `Hej${person}, du pratar med ${name}. Vad behöver du?`,
    (name, person) => `Hej${person}, det är ${name}. Hur kan jag hjälpa dig?`,
    (name) => `${name} här. Vad har du på hjärtat?`,
  ],
  pl: [
    (name, person) => `Cześć${person}, tu ${name}. Co słychać?`,
    (name, person) => `Hej${person}, tu ${name}. Co mogę dla ciebie zrobić?`,
    (name, person) => `Cześć${person}, mówi ${name}. Czego potrzebujesz?`,
    (name, person) => `Hej${person}, tu ${name}. W czym mogę pomóc?`,
    (name) => `Tu ${name}. O czym chcesz pogadać?`,
  ],
  tr: [
    (name, person) => `Selam${person}, ben ${name}. Ne var ne yok?`,
    (name, person) => `Merhaba${person}, ben ${name}. Senin için ne yapabilirim?`,
    (name, person) => `Selam${person}, ${name} konuşuyor. Neye ihtiyacın var?`,
    (name, person) => `Merhaba${person}, ben ${name}. Nasıl yardımcı olabilirim?`,
    (name) => `Ben ${name}. Aklında ne var?`,
  ],
};

/** A short greeting with the agent's name; `pick` in [0, 1) chooses which, so calls do not all open alike. In the call's language (`voiceCallLanguage`). */
export function buildFirstMessage(agentName: string, pick: number, personName?: string | null, language?: string | null): string {
  const name = collapse(agentName) || "your agent";
  const person = clamp(collapse(personName ?? ""), 60);
  const greetings = GREETINGS_BY_LANGUAGE[voiceCallLanguage(language)] ?? GREETINGS;
  const index = Math.min(greetings.length - 1, Math.max(0, Math.floor((Number.isFinite(pick) ? pick : 0) * greetings.length)));
  return greetings[index]!(name, person.length > 0 ? ` ${person}` : "");
}

export interface VoiceCallOverrides {
  readonly agent: { readonly prompt: { readonly prompt: string }; readonly firstMessage: string; readonly language: string };
  readonly tts?: { readonly voiceId: string };
}

/** The `overrides` object `Conversation.startSession` takes, for one call. */
export function buildVoiceCallOverrides(args: {
  readonly agent: VoiceCallAgentProfile;
  readonly transcript: readonly VoiceCallTranscriptLine[];
  readonly teammates?: readonly VoiceCallTeammate[];
  readonly voiceId?: string | null;
  readonly pick: number;
  readonly personName?: string | null;
  /** The person's language (`userLanguage`); none is English. */
  readonly language?: string | null;
}): VoiceCallOverrides {
  const voiceId = typeof args.voiceId === "string" && args.voiceId.trim().length > 0 ? args.voiceId.trim() : null;
  return {
    agent: {
      prompt: { prompt: buildVoiceCallPrompt({ agent: args.agent, transcript: args.transcript, personName: args.personName ?? null, teammates: args.teammates ?? [], language: args.language ?? null }) },
      firstMessage: buildFirstMessage(args.agent.name, args.pick, args.personName ?? null, args.language ?? null),
      language: voiceCallLanguage(args.language),
    },
    ...(voiceId == null ? {} : { tts: { voiceId } }),
  };
}

// --- the voice's two client tools (the upstream app's send_task and recall_text_messages) ---

/** What `send_task` answers at once; the work goes on behind the call. */
export const SEND_TASK_ACCEPTED = "Sent. If you have not acknowledged it yet, do so in a few words, then carry on with them. What it turns up comes back to you here.";

/** What `recall_text_messages` answers: the latest texts between them, oldest first. */
export function recallTextMessagesAnswer(lines: readonly VoiceCallTranscriptLine[]): string {
  if (lines.length === 0) return "There are no text messages between you yet.";
  return ["Your latest text messages, oldest first:", ...lines.map((line) => `${line.speaker === "person" ? "Them" : "You"}: ${line.text}`)].join("\n");
}

/** The note pushed into the call (`sendContextualUpdate`) when the agent sent something on it. */
export function workCameBackUpdate(texts: readonly string[]): string {
  return `Your work came back: ${texts.map((text) => clamp(collapse(text), 2_000)).join(" ")} If it answers something they asked, or something went wrong, tell them briefly, in your own words, as yours. If it only confirms something you already told them you were doing, they can see it done: say nothing about it and stay silent with skip_turn.`;
}

/** Then this, as a user turn (`sendUserMessage`), so the voice speaks now instead of waiting. */
export const WORK_CAME_BACK_NUDGE = "(Your work just came back.)";
/** The nudge's earlier words, still sent by apps built before 9 October 2026: kept out of a call's record too. */
export const EARLIER_WORK_CAME_BACK_NUDGES: readonly string[] = ["(Your work just came back. Tell me what it found.)"];

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

/** One line said on the call: the person's (`user`) or the voice's (`agent`). */
export interface CallRecordLine {
  readonly speaker: "user" | "agent";
  readonly text: string;
}

/**
 * The line a call leaves in the agent's chat when its host writes none of its
 * own (a host from before 2 October 2026): "Voice call · 2:48", then the
 * summary when there is one. A current host writes one line where the call
 * began and fills it in when it ends (`voice-call-channel.ts`).
 */
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

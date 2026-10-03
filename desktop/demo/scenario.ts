/**
 * The demo's story, for a founder running a small company (the founder, 3
 * October 2026: "redesign it for a founder … dont forget to have a group chat
 * too … a compelling one, not bloated"). Each agent is named like a person and
 * has a job a founder would hand to someone: the inbox and calendar, investors,
 * the books, hiring, support. One conversation plays by itself when the page
 * opens (Simeon's morning brief), everything else is already written, and the
 * person never types.
 *
 * Entries use the host's own transcript shapes (host/extensions/transcript):
 * a person's message is {kind:"message", role:"user"}; an agent speaks
 * through SendMessage, {kind:"send-message", message:{type,…}}, with the card
 * types the pinned renderer draws.
 */
export interface DemoAgent {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly color: string;
  readonly minutesAgo: number;
}

export interface DemoGroup {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly memberIds: readonly string[];
  readonly minutesAgo: number;
}

export type Entry = Record<string, unknown> & { readonly id: string; readonly kind: string };

const MIN = 60_000;
export const NOW = Date.now();
export const at = (minutesAgo: number) => NOW - minutesAgo * MIN;

export const you = (id: string, minutesAgo: number, content: string): Entry => ({
  kind: "message", id, role: "user", content, isStreaming: false, timestampMs: at(minutesAgo),
});
export const says = (id: string, minutesAgo: number, content: string): Entry => ({
  kind: "send-message", id, message: { type: "text", content }, timestampMs: at(minutesAgo),
});
export const card = (id: string, minutesAgo: number, message: Record<string, unknown>, extra: Record<string, unknown> = {}): Entry => ({
  kind: "send-message", id, message, timestampMs: at(minutesAgo), ...extra,
});
const file = (id: string, minutesAgo: number, path: string): Entry => card(id, minutesAgo, { type: "attachment", url: `file:///home/box/${encodeURI(path)}` });

/** One agent's message to a teammate, and the teammate's answer: the window's "Messaged …" exchange. */
const toTeammate = (id: string, minutesAgo: number, peer: { id: string; name: string }, content: string): Entry => ({
  kind: "message", id, role: "assistant", content, isStreaming: false, timestampMs: at(minutesAgo), toAgent: { ...peer, kind: "agent" },
});
const fromTeammate = (id: string, minutesAgo: number, peer: { id: string; name: string }, content: string): Entry => ({
  kind: "message", id, role: "user", content, isStreaming: false, timestampMs: at(minutesAgo), fromAgent: peer,
});

/**
 * A call's line as the host writes it now: one event where the call began, filled in when it
 * ended with its duration and what was said (host/extensions/transcript/voice-call-channel.ts).
 */
export const voiceCall = (id: string, minutesAgo: number, callId: string, seconds: number, lines: readonly (readonly ["you" | "agent", string])[]): Entry => ({
  kind: "event", id, timestampMs: at(minutesAgo),
  event: { type: "voice-call", callId, status: "ended", seconds, lines: lines.map(([speaker, text]) => ({ speaker: speaker === "you" ? "user" : "agent", text })) },
});

/**
 * A call as the host wrote it before 2 October 2026's second change: every line a message with
 * one peer, `voice-call:<call>:<seconds>`, named for the person. Kept so the demo shows that
 * calls already in people's chats draw as calls.
 */
const earlierCall = (prefix: string, minutesAgo: number, callId: string, seconds: number, lines: readonly (readonly ["you" | "agent", string])[]): Entry[] => {
  const peer = { id: `voice-call:${callId}:${seconds}`, name: "Bass" };
  return lines.map(([speaker, content], index) => speaker === "you"
    ? fromTeammate(`${prefix}${index}`, minutesAgo, peer, content)
    : toTeammate(`${prefix}${index}`, minutesAgo, peer, content));
};

export const AGENTS: readonly DemoAgent[] = [
  { id: "simeon", name: "Simeon", title: "Chief of Staff", description: "Runs your day and hands work to the rest of the team.", color: "blue", minutesAgo: 0 },
  { id: "mila", name: "Mila", title: "Inbox and calendar", description: "Answers what she can and keeps your mornings free.", color: "violet", minutesAgo: 25 },
  { id: "iris", name: "Iris", title: "Customer support", description: "Answers tickets from your help docs and flags the hard ones.", color: "cyan", minutesAgo: 70 },
  { id: "theo", name: "Theo", title: "Bookkeeping", description: "Keeps the books, the runway and the invoices straight.", color: "green", minutesAgo: 60 * 3 },
  { id: "felix", name: "Felix", title: "Hiring", description: "Finds candidates and books the interviews.", color: "orange", minutesAgo: 60 * 6 },
  { id: "nora", name: "Nora", title: "Investor relations", description: "Writes the monthly update and follows up with investors.", color: "magenta", minutesAgo: 60 * 26 },
];

/** The group: getting ready to raise, with the two agents who know the numbers and the investors. */
export const GROUP: DemoGroup = {
  id: "seed-round", name: "Seed round", description: "Getting ready to raise in November, with Simeon, Theo and Nora.",
  memberIds: ["simeon", "theo", "nora"], minutesAgo: 45,
};

/** Already written: what happened before the page opened. */
export const TRANSCRIPTS: Record<string, Entry[]> = {
  simeon: [],
  mila: [
    you("l0u", 60 * 30, "Keep my mornings free for deep work. Nothing before 11."),
    says("l0a", 60 * 30 - 1, "Done. I moved four meetings this week to the afternoon, and I'll suggest later times when someone asks for a morning."),
    says("l1a", 25, "Overnight: 38 emails. I wrote replies to 6 and filed the rest. Two need you, both about the **Acme** renewal."),
  ],
  iris: [
    you("i0u", 60 * 48, "Answer the support tickets you're sure about. Send me anything with a refund or an unhappy customer."),
    says("i0a", 60 * 48 - 1, "I'll answer from your help docs, so I need **Intercom** and **Notion**."),
    card("i0c", 60 * 48 - 1, { type: "connectors", connectors: ["Intercom", "Notion"] }),
    says("i0b", 60 * 48 - 3, "Both connected. I'll leave refunds and anything unhappy for you."),
    says("i1a", 70, "Yesterday: 23 tickets answered, a median of 4 minutes to reply. One is yours: **Brightline** is asking for a $960 refund for September."),
  ],
  theo: [
    you("t0u", 60 * 5, "What's our runway?"),
    says("t0a", 60 * 5 - 1, "**19 months** at September's spend of $41,200. Revenue was **$48,200**, up 12% on August. That's from **Stripe** and **QuickBooks**, closed through 30 September."),
    file("t0f", 60 * 5 - 1, "finance/September close.xlsx"),
    // A call from before calls were written as one line: the window still draws it as a call.
    ...earlierCall("t1c", 60 * 4, "call-demo-theo", 71, [
      ["you", "Theo, are any invoices late?"],
      ["agent", "Two. Acme Health owes $4,200, 34 days late, and Halden & Co $1,800."],
      ["you", "Send them both a polite reminder."],
      ["agent", "Will do, from your Gmail."],
    ]),
    says("t1a", 60 * 3, "Both reminders went out from **Gmail**. I'll tell you when they pay."),
  ],
  felix: [
    you("f0u", 60 * 30, "We need a founding engineer. Find me five people worth talking to."),
    says("f0a", 60 * 29, "I went through 140 applicants and your LinkedIn network. Five stand out, and two of them have built payments products before. My notes on each are in the doc."),
    file("f0f", 60 * 29, "hiring/Founding engineer shortlist.pdf"),
    says("f1a", 60 * 6, "Priya Shah said yes to a first call. She's on your calendar today at 2 pm."),
  ],
  nora: [
    you("n0u", 60 * 27, "Draft the September investor update. Same format as last month."),
    says("n0a", 60 * 26 + 40, "The draft is in **Notion**. Revenue $48.2k, up 12%. Two enterprise pilots signed. The founding engineer search has started. The ask: intros to finance teams who'd try us."),
    file("n0f", 60 * 26 + 40, "investors/September update.docx"),
    says("n1a", 60 * 26, "Three investors replied asking for a call. I offered them times next week."),
  ],
};

/** The group's conversation, already written. `author` is the member who spoke. */
export const GROUP_TRANSCRIPT: readonly { readonly author: string | null; readonly entry: Entry }[] = [
  { author: null, entry: you("g0u", 60, "I want to start raising in November. Are we ready?") },
  { author: "theo", entry: says("g0t", 58, "The numbers are. 19 months of runway and revenue up 12% a month for four months. The data room has everything but the cap table.") },
  { author: "nora", entry: says("g0n", 57, "Eleven investors have opened every update since March. I'd start with them.") },
  { author: "simeon", entry: says("g0m", 55, "Then here's the plan. Theo updates the cap table this week, Nora writes to those eleven, and I keep two mornings a week free in November for meetings.") },
  { author: null, entry: you("g1u", 50, "Go.") },
  { author: "simeon", entry: says("g1m", 45, "On it. I'll post where we are here every Friday.") },
];

/**
 * What plays when the page opens: the founder's morning. You ask what needs
 * you today; Simeon checks your calendar and inbox, asks Theo and Iris, and
 * comes back with three things. You decide; Simeon does them and turns the
 * brief into a routine. Then the computer (LinkedIn wants you to sign in) and
 * a call. Nobody chooses anything; it plays through once.
 */
export type Beat =
  | { readonly at: number; readonly kind: "user"; readonly agent: string; readonly entry: Entry }
  | { readonly at: number; readonly kind: "typing"; readonly agent: string; readonly on: boolean }
  | { readonly at: number; readonly kind: "step"; readonly agent: string; readonly id: string; readonly name: string; readonly summary: string; readonly status: "running" | "completed"; readonly detail?: string; readonly target?: string }
  | { readonly at: number; readonly kind: "append"; readonly agent: string; readonly entry: Entry }
  | { readonly at: number; readonly kind: "react"; readonly agent: string; readonly entryId: string; readonly emoji: string; readonly by: string };

const step = (at: number, id: string, name: string, doing: string, done: string, ms: number, detail?: string, target?: string): Beat[] => [
  { at, kind: "step", agent: "simeon", id, name, summary: doing, status: "running", ...(detail == null ? {} : { detail }), ...(target == null ? {} : { target }) },
  { at: at + ms, kind: "step", agent: "simeon", id, name, summary: done, status: "completed" },
];

export function openingScript(): Beat[] {
  return [
    { at: 900, kind: "user", agent: "simeon", entry: you("m0u", 0, "Morning. What needs me today?") },
    { at: 1500, kind: "typing", agent: "simeon", on: true },
    ...step(2100, "m1", "CallMcpTool", "Checking your calendar", "Checked your calendar", 1100, "Google Calendar"),
    ...step(3300, "m2", "CallMcpTool", "Reading your inbox", "Read your inbox", 1200, "Gmail"),
    ...step(4600, "m3", "SendToAgent", "Asking Theo about cash", "Messages from Theo", 1300, undefined, "theo"),
    ...step(6000, "m4", "SendToAgent", "Asking Iris about support", "Messages from Iris", 1200, undefined, "iris"),
    { at: 7400, kind: "append", agent: "simeon", entry: says("m0a", 0, "Three things today:\n\n1. **Acme's renewal.** Their lawyers want 60-day payment terms. Mila wrote a reply that agrees if they sign for two years.\n2. **Brightline's refund**, $960. Iris checked: our sync was down for them for two days. I'd approve it.\n3. **Priya Shah at 2 pm**, for the founding engineer role. Felix's notes are attached.") },
    { at: 7700, kind: "append", agent: "simeon", entry: file("m0f", 0, "hiring/Priya Shah, notes.pdf") },
    { at: 7800, kind: "typing", agent: "simeon", on: false },
    { at: 10200, kind: "user", agent: "simeon", entry: you("m1u", 0, "Approve the refund and send Acme the reply. And send me this every morning.") },
    { at: 10900, kind: "react", agent: "simeon", entryId: "m1u", emoji: "\u{1F44D}", by: "simeon" },
    { at: 11200, kind: "typing", agent: "simeon", on: true },
    ...step(11600, "m5", "CallMcpTool", "Refunding Brightline in Stripe", "Refunded Brightline in Stripe", 1200, "Stripe"),
    ...step(13000, "m6", "CallMcpTool", "Sending the reply from Gmail", "Sent the reply from Gmail", 1100, "Gmail"),
    ...step(14300, "m7", "UpdateState", "Creating routine Morning brief", "Created routine Morning brief", 900),
    { at: 15400, kind: "append", agent: "simeon", entry: says("m1a", 0, "Done. Brightline has its refund, Acme has the reply, and you'll get this brief at 8 every morning.") },
    { at: 15500, kind: "typing", agent: "simeon", on: false },
    // The agent hands the computer to the person: a SendMessage carrying the box request (the window's take-over card).
    { at: 18000, kind: "user", agent: "simeon", entry: you("m2u", 0, "Can you post Felix's job ad on our LinkedIn page?") },
    { at: 18600, kind: "typing", agent: "simeon", on: true },
    ...step(19000, "m8", "Computer", "Opening LinkedIn on the computer", "Opened LinkedIn on the computer", 1600),
    { at: 21000, kind: "append", agent: "simeon", entry: card("m2h", 0, { type: "text", content: "LinkedIn wants you to sign in." }, { boxRequestId: "demo-take-over", boxInstruction: "LinkedIn is asking for your password and a code from your phone. Take over to sign in, then hand it back and I'll post the ad.", boxResolution: "waiting" }) },
    { at: 21100, kind: "typing", agent: "simeon", on: false },
    // A call: its line sits where the call began, the work it asked for below it, then the written
    // follow-up, the way a text would read.
    { at: 24000, kind: "append", agent: "simeon", entry: voiceCall("m3c", 0, "call-demo-simeon", 58, [
      ["you", "Hey Simeon, can you move Priya to four? My investor call is running long."],
      ["agent", "Sure. I'll ask Felix to check with her."],
      ["you", "Thanks."],
    ]) },
    { at: 24300, kind: "typing", agent: "simeon", on: true },
    ...step(24600, "m9", "SendToAgent", "Asking Felix to move Priya's call", "Messages from Felix", 1300, undefined, "felix"),
    ...step(26100, "m10", "CallMcpTool", "Updating your calendar", "Updated your calendar", 900, "Google Calendar"),
    { at: 27200, kind: "append", agent: "simeon", entry: says("m3a", 0, "As we said on the call: Priya is now at 4, Felix checked with her, and your calendar is updated.") },
    { at: 27300, kind: "typing", agent: "simeon", on: false },
  ];
}

/**
 * A new account's first agent (`?onboarding`): what it says once the person
 * presses Get started, then after each answer. It follows the first-run cue
 * the real agent gets (`SAND_ONBOARDING_KICKSTART_PROMPT`,
 * source/shared/agents/onboarding.ts): a short hello, then a question card
 * with three or four options; once an answer shows where the work lives, the
 * connectors that fit, then the next question.
 */
export function onboardingScript(agent: string, stage: number): Beat[] {
  const typing = (at: number, on: boolean): Beat => ({ at, kind: "typing", agent, on });
  const append = (at: number, entry: Entry): Beat => ({ at, kind: "append", agent, entry });
  const question = (id: string, prompt: string, labels: readonly string[], helpText?: string) =>
    card(id, 0, { type: "widget", widget: { prompt, ...(helpText == null ? {} : { helpText }), options: labels.map((label) => ({ label })), allowCustom: true } });
  if (stage === 0) {
    return [
      typing(700, true),
      append(2600, says("o0a", 0, "Hi Bass, I'm Simeon, your COO. Before I start staffing your team, I'd like to know where you want me first.")),
      append(3600, question("o0q", "What should I mainly help you with?", ["Run my day: calendar and inbox", "Keep my projects moving", "Prepare me for meetings", "Lead my other agents"], "Pick one, or type your own. You can hand me a real task instead, and I'll just start on it.")),
      typing(3700, false),
    ];
  }
  if (stage === 1) {
    return [
      typing(500, true),
      append(2200, says("o1a", 0, "Good. For that I need to see your calendar and your email.")),
      append(2600, card("o1c", 0, { type: "connector", connector: "Google Calendar", variant: "connect", reason: "To know your day and protect your time" })),
      append(2800, card("o1g", 0, { type: "connector", connector: "Gmail", variant: "connect", reason: "To sort what needs you and draft replies" })),
      append(3800, question("o1q", "How should I check in with you?", ["A short brief every morning", "Only when something needs me", "A recap at the end of the day"])),
      typing(3900, false),
    ];
  }
  return [
    typing(500, true),
    append(2000, says("o2a", 0, "Got it. Connect those two and I'll send your first brief tomorrow at 8. Until then, hand me anything and I'll start on it.")),
    typing(2100, false),
  ];
}

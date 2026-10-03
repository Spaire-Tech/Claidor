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
  { id: "yodo", name: "Yodo", title: "Launch manager", description: "Keeps the launch on track in Linear and Slack.", color: "red", minutesAgo: 95 },
  { id: "iris", name: "Iris", title: "Customer support", description: "Answers tickets from your help docs and flags the hard ones.", color: "mint", minutesAgo: 70 },
  { id: "theo", name: "Theo", title: "Bookkeeping", description: "Keeps the books, the runway and the invoices straight.", color: "green", minutesAgo: 60 * 3 },
  { id: "felix", name: "Felix", title: "Hiring", description: "Finds candidates and books the interviews.", color: "orange", minutesAgo: 60 * 6 },
  { id: "nora", name: "Nora", title: "Investor relations", description: "Writes the monthly update and follows up with investors.", color: "magenta", minutesAgo: 60 * 26 },
  { id: "scout", name: "Scout", title: "Customer research", description: "Reads what customers say and brings back what matters.", color: "cyan", minutesAgo: 60 * 26 },
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
    says("l1a", 26, "Overnight: 38 emails. I answered 6 and filed the rest. One needs you: **Acme**'s lawyers sent redlines on the renewal."),
    says("l1b", 25, "Here's a reply that agrees to their payment terms if they sign for two years. Change anything, then send."),
    card("l1d", 25, { type: "email-draft", draft: { from: "bass@northbeam.com", to: ["jordan.lee@acmehealth.com"], subject: "Re: Renewal terms", body: "Hi Jordan,\n\nThanks for the redlines. We can agree to 60-day payment terms if Acme renews for two years. Everything else in the draft stands.\n\nIf that works for you, I'll send the updated contract today.\n\nBest,\nBass" } }, { draftSendState: "editable" }),
  ],
  iris: [
    you("i0u", 60 * 48, "Answer the support tickets you're sure about. Send me anything with a refund or an unhappy customer."),
    says("i0a", 60 * 48 - 1, "I'll answer from your help docs, so I need your support inbox in **Gmail** and the docs in **Notion**."),
    card("i0c", 60 * 48 - 1, { type: "connectors", connectors: ["Gmail", "Notion"] }),
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
  scout: [
    you("s0u", 60 * 27, "What are customers saying about onboarding since the redesign?"),
    says("s0a", 60 * 26 + 30, "I read the 14 interview notes in **Notion** and 212 **Intercom** conversations from the last 30 days. Three things stand out:\n\n1. **Setup takes too long.** 9 of 14 people stalled at the workspace step.\n2. **Templates work.** People who picked one were twice as likely to invite a teammate.\n3. **The words confuse.** \"Workspace\" and \"project\" get mixed up in 31 tickets."),
    file("s0f", 60 * 26 + 29, "research/Onboarding research, September.pdf"),
    says("s0b", 60 * 26 + 29, "The quotes behind each theme are on page 3."),
    // A call on its own: the window draws it as one "Voice chat" line.
    ...earlierCall("s1c", 60 * 20, "call-demo-scout", 109, [
      ["you", "Hey Scout, what's the one thing customers complain about most?"],
      ["agent", "Setup. Nine of fourteen people stalled at the workspace step."],
      ["you", "Okay. Put that at the top of the review doc."],
      ["agent", "Done, it's the first slide now."],
    ]),
  ],
  yodo: [
    you("y0u", 60 * 50, "Keep the launch on track. Post a standup in Slack every morning."),
    says("y0a", 60 * 50 - 1, "I'll need **Linear** and **Slack** for that."),
    card("y0c", 60 * 50 - 1, { type: "connectors", connectors: ["Linear", "Slack"] }),
    says("y0b", 60 * 50 - 3, "Both connected. Every morning at 9:00 I'll post the launch board in #launch and flag anything stuck for more than a day."),
    // A call during which Yodo asked Scout something: the teammate exchange and the call's lines
    // sit side by side in the chat.
    toTeammate("y2t", 60 * 3, { id: "scout", name: "Scout" }, "Bass asked for the latest NPS for the launch review. Can you send it?"),
    fromTeammate("y2f", 60 * 3, { id: "scout", name: "Scout" }, "NPS is 41, up from 34 last month."),
    ...earlierCall("y2c", 60 * 3, "call-demo-yodo", 92, [
      ["you", "Yodo, can you get the latest NPS from Scout for the review?"],
      ["agent", "Asking Scout now."],
      ["agent", "It's 41, up from 34 last month."],
      ["you", "Great, thanks."],
    ]),
    says("y1a", 95, "Today's standup is up in #launch:\n\n- **12 of 15** launch tickets done\n- 2 waiting on design review with Dana\n- **LIN-482**, the pricing page bug, is in code review"),
    file("y1f", 95, "launch/Launch tracker.xlsx"),
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
 * What plays when the page opens: the same conversation the website's phone
 * still shows, word for word (the founder, 28 September 2026: "have the same
 * text for simeon in the laptop", and again on 3 October: "i liked what we
 * originally had in mobile … bring it to desktop. thats what a chief is").
 * You ask where Thursday's launch stands, Simeon checks your tools and
 * answers, hears from Scout and Yodo, hands you the review doc, and when you
 * reply, sends the agenda and sets up a Monday routine. Then the computer and
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
    { at: 900, kind: "user", agent: "simeon", entry: you("m0u", 0, "Morning. Where are we on Thursday's launch?") },
    { at: 1500, kind: "typing", agent: "simeon", on: true },
    ...step(2100, "m1", "CallMcpTool", "Checking Linear", "Checked Linear", 1300, "Linear"),
    ...step(3500, "m2", "CallMcpTool", "Reading #launch in Slack", "Read #launch in Slack", 1200, "Slack"),
    ...step(4800, "m3", "CallMcpTool", "Checking your calendar", "Checked your calendar", 1000, "Google Calendar"),
    { at: 6000, kind: "append", agent: "simeon", entry: says("m0a", 0, "Thursday is on track: 12 of 15 launch tickets are done in **Linear**, and the review is Thursday at 2 pm.") },
    ...step(6800, "m4", "SendToAgent", "Asking Scout for customer quotes", "Messages from Scout", 1500, undefined, "scout"),
    ...step(8500, "m5", "SendToAgent", "Asking Yodo about the last tickets", "Messages from Yodo", 1300, undefined, "yodo"),
    { at: 10000, kind: "append", agent: "simeon", entry: says("m1a", 0, "Scout pulled three customer quotes and Yodo closed the last two tickets. The review doc is ready.") },
    { at: 10300, kind: "append", agent: "simeon", entry: file("m1f", 0, "docs/Launch review.docx") },
    { at: 10400, kind: "typing", agent: "simeon", on: false },
    { at: 12600, kind: "user", agent: "simeon", entry: you("m2u", 0, "Looks great. Send the agenda to Dana and Marcus, and check in like this every Monday.") },
    { at: 13300, kind: "react", agent: "simeon", entryId: "m2u", emoji: "\u{1F44D}", by: "simeon" },
    { at: 13600, kind: "typing", agent: "simeon", on: true },
    ...step(14000, "m6", "CallMcpTool", "Sending the agenda from Gmail", "Sent the agenda from Gmail", 1300, "Gmail"),
    ...step(15500, "m7", "UpdateState", "Creating routine Monday launch check", "Created routine Monday launch check", 1000),
    { at: 16800, kind: "append", agent: "simeon", entry: says("m2a", 0, "Done. The agenda went out from **Gmail**.") },
    { at: 16900, kind: "typing", agent: "simeon", on: false },
    // The agent hands the computer to the person: a SendMessage carrying the box request (the window's take-over card).
    { at: 19000, kind: "user", agent: "simeon", entry: you("m3u", 0, "Can you post the launch note on our LinkedIn page too?") },
    { at: 19600, kind: "typing", agent: "simeon", on: true },
    ...step(20000, "m8", "Computer", "Opening LinkedIn on the computer", "Opened LinkedIn on the computer", 1600),
    { at: 22000, kind: "append", agent: "simeon", entry: card("m3h", 0, { type: "text", content: "LinkedIn wants you to sign in." }, { boxRequestId: "demo-take-over", boxInstruction: "LinkedIn is asking for your password and a code from your phone. Take over to sign in, then hand it back and I'll post the note.", boxResolution: "waiting" }) },
    { at: 22100, kind: "typing", agent: "simeon", on: false },
    // A call: its line sits where the call began, the work it asked for below it, then the written
    // follow-up, the way a text would read.
    { at: 25000, kind: "append", agent: "simeon", entry: voiceCall("m4c", 0, "call-demo-simeon", 94, [
      ["you", "Hey Simeon, can we move the launch review to Friday morning?"],
      ["agent", "Sure. Friday at ten works for Dana and Marcus. I'll ask Yodo to move it."],
      ["you", "Perfect. And tell the team in Slack."],
      ["agent", "Will do. I'll post it in #launch once Yodo confirms."],
      ["you", "Thanks, bye."],
    ]) },
    { at: 25300, kind: "typing", agent: "simeon", on: true },
    ...step(25600, "m9", "SendToAgent", "Asking Yodo to move the review", "Messages to Yodo", 1200, undefined, "yodo"),
    ...step(27000, "m10", "CallMcpTool", "Posting in #launch on Slack", "Posted in #launch on Slack", 1000, "Slack"),
    { at: 28400, kind: "append", agent: "simeon", entry: says("m4a", 0, "As we said on the call: the review is now Friday at 10, Yodo moved it, and I posted it in #launch on **Slack**.") },
    { at: 28500, kind: "typing", agent: "simeon", on: false },
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

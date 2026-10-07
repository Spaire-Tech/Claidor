/**
 * The demo's story, for a founder running a small company (the founder, 3
 * October 2026: "redesign it for a founder … dont forget to have a group chat
 * too … a compelling one, not bloated"). Each agent is named like a person and
 * has a job a founder would hand to someone: customer research, support, the
 * books. One conversation plays by itself when the page
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
 * A routine an agent created, changed or removed, as the host writes it
 * (`emitAutomationChange`, host/extensions/transcript/automation-runtime.ts):
 * the window draws it as one line, "Created routine" and the routine's name.
 */
export const routineChanged = (id: string, minutesAgo: number, automationId: string, automationName: string, action: "created" | "updated" | "deleted" = "created"): Entry => ({
  kind: "event", id, timestampMs: at(minutesAgo),
  event: { type: "automation-changed", action, automationId, automationName },
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
  { id: "mila", name: "Mila", title: "Inbox", description: "Runs the inbox: what needs Bass, what can wait, and the replies to approve.", color: "green", minutesAgo: 12 },
  { id: "theo", name: "Theo", title: "Bookkeeping", description: "Keeps the books, the runway and the invoices straight.", color: "green", minutesAgo: 70 },
  { id: "iris", name: "Iris", title: "Customer support", description: "Answers tickets from your help docs and flags the hard ones.", color: "violet", minutesAgo: 60 * 3 },
  { id: "scout", name: "Scout", title: "Customer research", description: "Reads what customers say and brings back what matters.", color: "orange", minutesAgo: 60 * 26 },
];

/** The group the phone still shows: Thursday's launch, with Simeon, Scout and Iris. */
export const GROUP: DemoGroup = {
  id: "launch-squad", name: "Launch squad", description: "Thursday's launch, with Simeon, Scout and Iris.",
  memberIds: ["simeon", "scout", "iris"], minutesAgo: 40,
};

/** Already written: what happened before the page opened. */
export const TRANSCRIPTS: Record<string, Entry[]> = {
  simeon: [],
  iris: [
    you("i0u", 60 * 48, "Answer the support tickets you're sure about. Send me anything with a refund or an unhappy customer."),
    says("i0a", 60 * 48 - 1, "I'll answer from your help docs, so I need your support inbox in **Gmail** and the docs in **Notion**."),
    card("i0c", 60 * 48 - 1, { type: "connectors", connectors: ["Gmail", "Notion"] }),
    says("i0b", 60 * 48 - 3, "Both connected. I'll leave refunds and anything unhappy for you."),
    says("i1a", 70, "Yesterday: 23 tickets answered, a median of 4 minutes to reply. One is yours: **Brightline** is asking for a $960 refund for September."),
  ],
  mila: [
    you("m0u", 14, "What needs me in my inbox this morning?"),
    says("m0a", 13, "I went through the 31 emails since last night. Three need you, two deadlines land this week, and the rest can wait."),
    says("m0b", 13, "```simeon-mail\n{\"title\": \"This morning's inbox\", \"subtitle\": \"3 need you · 2 deadlines this week · 9 can wait\", \"sections\": [{\"title\": \"Needs you\", \"items\": [{\"kind\": \"email\", \"from\": \"Maya Chen\", \"subject\": \"Redlines on the Northwind MSA\", \"why\": \"Legal needs your OK on the liability cap before Friday's signing.\", \"time\": \"9:12 AM\", \"due\": \"Due Fri\", \"urgent\": true, \"thread\": 4, \"unread\": true, \"reply\": \"Thanks Maya, the cap at 12 months of fees works for us. Approved, go ahead and send for signature.\"}, {\"kind\": \"email\", \"from\": \"Jon Park\", \"subject\": \"Partner meeting: can you send the deck?\", \"why\": \"Northstar wants the deck before Thursday's partner meeting.\", \"time\": \"8:40 AM\", \"due\": \"Today\", \"urgent\": true, \"unread\": true}, {\"kind\": \"email\", \"from\": \"Brightline Support\", \"subject\": \"Refund request for September\", \"why\": \"A $960 refund only you can approve. Iris flagged it.\", \"time\": \"Yesterday\", \"thread\": 3}]}, {\"title\": \"Deadlines\", \"items\": [{\"kind\": \"deadline\", \"title\": \"Q3 estimated tax payment\", \"date\": \"Oct 15\", \"day\": \"Wednesday\", \"source\": \"From Pilot\", \"urgent\": true}, {\"kind\": \"deadline\", \"title\": \"Northwind MSA signing\", \"date\": \"Oct 10\", \"day\": \"Friday\", \"source\": \"Maya Chen\"}]}, {\"title\": \"Tasks from your mail\", \"items\": [{\"kind\": \"task\", \"title\": \"Send the deck to Northstar\", \"from\": \"Jon Park asked this morning\", \"due\": \"Today\", \"urgent\": true}, {\"kind\": \"task\", \"title\": \"Book the offsite venue\", \"from\": \"Dana's thread, Monday\", \"due\": \"Next week\"}]}, {\"title\": \"People waiting on you\", \"items\": [{\"kind\": \"person\", \"name\": \"Maya Chen\", \"role\": \"Counsel, Hale & Ward\", \"note\": \"2 threads\"}, {\"kind\": \"person\", \"name\": \"Jon Park\", \"role\": \"Partner, Northstar Ventures\", \"note\": \"Since 8:40\"}]}]}\n```"),
    says("m0c", 12, "I drafted the reply to Maya for you to approve. Want me to send Jon the deck from Drive?"),
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
};

/** The group's conversation, already written. `author` is the member who spoke. */
export const GROUP_TRANSCRIPT: readonly { readonly author: string | null; readonly entry: Entry }[] = [
  { author: null, entry: you("g0u", 58, "Honest check: can we still ship Thursday?") },
  { author: "iris", entry: says("g0y", 56, "Engineering says yes if **LIN-482** merges by Wednesday noon. It's in review now.") },
  { author: "scout", entry: says("g0s", 55, "From the research, what customers care about is the new setup flow. The pricing page change can wait.") },
  { author: "simeon", entry: says("g0m", 54, "Then keep Thursday. I'll move the pricing page to the fast-follow list and let Dana and Marcus know.") },
  { author: null, entry: you("g1u", 45, "Do it.") },
  { author: "simeon", entry: says("g1m", 40, "Done. Moved in **Linear** and posted in #launch on **Slack**.") },
];

/**
 * What plays when the page opens: the same conversation the website's phone
 * still shows, word for word (the founder, 28 September 2026: "have the same
 * text for simeon in the laptop", and again on 3 October: "i liked what we
 * originally had in mobile … bring it to desktop. thats what a chief is").
 * You ask where Thursday's launch stands, Simeon checks your tools and
 * answers, hears from Scout and Iris, hands you the review doc, and when you
 * reply, sends the agenda and sets up a Monday routine. It stops there, where
 * the phone still stops. Nobody chooses anything; it plays through once.
 */
export type Beat =
  | { readonly at: number; readonly kind: "user"; readonly agent: string; readonly entry: Entry }
  | { readonly at: number; readonly kind: "typing"; readonly agent: string; readonly on: boolean }
  | { readonly at: number; readonly kind: "step"; readonly agent: string; readonly id: string; readonly name: string; readonly summary: string; readonly status: "running" | "completed"; readonly detail?: string; readonly target?: string }
  | { readonly at: number; readonly kind: "append"; readonly agent: string; readonly entry: Entry }
  | { readonly at: number; readonly kind: "react"; readonly agent: string; readonly entryId: string; readonly emoji: string; readonly by: string }
  // A hire: a new agent appears in the sidebar with its chat already holding the brief it was staffed with and its first words.
  | { readonly at: number; readonly kind: "hire"; readonly agent: DemoAgent; readonly entries: readonly Entry[] };

const step = (at: number, id: string, name: string, doing: string, done: string, ms: number, detail?: string, target?: string): Beat[] => [
  { at, kind: "step", agent: "simeon", id, name, summary: doing, status: "running", ...(detail == null ? {} : { detail }), ...(target == null ? {} : { target }) },
  { at: at + ms, kind: "step", agent: "simeon", id, name, summary: done, status: "completed" },
];

export function openingScript(): Beat[] {
  return [
    { at: 900, kind: "user", agent: "simeon", entry: you("m0u", 0, "Morning. Where are we on Thursday's launch?") },
    { at: 1500, kind: "typing", agent: "simeon", on: true },
    ...step(2100, "m1", "CallMcpTool", "Checking Linear", "Checked Linear", 1300, "Linear"),
    { at: 4000, kind: "append", agent: "simeon", entry: says("m0a", 0, "Thursday is on track: 12 of 15 launch tickets are done in **Linear**, and the review is Thursday at 2 pm.") },
    ...step(6800, "m4", "SendToAgent", "Asking Scout for customer quotes", "Messages from Scout", 1500, undefined, "scout"),
    { at: 7200, kind: "append", agent: "simeon", entry: toTeammate("m4t", 0, { id: "scout", name: "Scout" }, "Can you pull three customer quotes for Thursday's review?") },
    { at: 8100, kind: "append", agent: "simeon", entry: fromTeammate("m4f", 0, { id: "scout", name: "Scout" }, "Here are three, all about the new setup flow. They're in the review doc.") },
    ...step(8500, "m5", "SendToAgent", "Asking Iris about the last tickets", "Messages from Iris", 1300, undefined, "iris"),
    { at: 8800, kind: "append", agent: "simeon", entry: toTeammate("m5t", 0, { id: "iris", name: "Iris" }, "Where are the last launch tickets?") },
    { at: 9600, kind: "append", agent: "simeon", entry: fromTeammate("m5f", 0, { id: "iris", name: "Iris" }, "Both closed this morning. 14 of 15 are done; the last one is the pricing page, after launch.") },
    { at: 10000, kind: "append", agent: "simeon", entry: says("m1a", 0, "Scout pulled three customer quotes and Iris closed the last two tickets. The review doc is ready.") },
    { at: 10300, kind: "append", agent: "simeon", entry: file("m1f", 0, "docs/Launch review.docx") },
    { at: 10400, kind: "typing", agent: "simeon", on: false },
    { at: 12600, kind: "user", agent: "simeon", entry: you("m2u", 0, "Looks great. Send the agenda to Dana and Marcus, and check in like this every Monday.") },
    { at: 13300, kind: "react", agent: "simeon", entryId: "m2u", emoji: "\u{1F44D}", by: "simeon" },
    { at: 13600, kind: "typing", agent: "simeon", on: true },
    ...step(14000, "m6", "CallMcpTool", "Sending the agenda from Gmail", "Sent the agenda from Gmail", 1300, "Gmail"),
    ...step(15500, "m7", "UpdateState", "Creating routine Monday launch check", "Created routine Monday launch check", 1000),
    // The line the phone still shows, "Created routine · Monday launch check" (the founder, 6 October 2026: "desktop doesnt have" it).
    { at: 16500, kind: "append", agent: "simeon", entry: routineChanged("m7r", 0, "demo-monday-launch-check", "Monday launch check") },
    { at: 16800, kind: "append", agent: "simeon", entry: says("m2a", 0, "Done. The agenda went out from **Gmail**.") },
    { at: 16900, kind: "typing", agent: "simeon", on: false },
  ];
}

/**
 * A new account's first agent (`?onboarding`): Simeon, the Chief of Staff,
 * once the person presses Get started, then after each answer. It follows
 * his own first-run cue (`SAND_CHIEF_OF_STAFF_KICKSTART_PROMPT`,
 * source/shared/agents/chief-of-staff.ts; the founder, 7 October 2026:
 * "onboarding should be him delegating"): a hello and one question, "What's
 * the first thing you'd hand to a person if you hired one today?"; on the
 * answer he hires, in front of the person: a new agent appears in the
 * sidebar, its chat opens on Simeon's brief ("Bass staffed you to …") and
 * its first words, and Simeon says who he hired and where to find them.
 */
export function onboardingScript(agent: string, stage: number): Beat[] {
  const typing = (at: number, on: boolean): Beat => ({ at, kind: "typing", agent, on });
  const append = (at: number, entry: Entry): Beat => ({ at, kind: "append", agent, entry });
  const question = (id: string, prompt: string, labels: readonly string[], helpText?: string) =>
    card(id, 0, { type: "widget", widget: { prompt, ...(helpText == null ? {} : { helpText }), options: labels.map((label) => ({ label })), allowCustom: true } });
  if (stage === 0) {
    return [
      typing(700, true),
      append(2600, says("o0a", 0, "Hi Bass, I'm Simeon, your Chief of Staff. I don't do the work myself: I hire the agents who do, brief them, and keep you out of the weeds. Let's hire your first one.")),
      append(3600, question("o0q", "What's the first thing you'd hand to a person if you hired one today?", ["My inbox: sort it, draft the replies", "My calendar and meeting prep", "Research and writing", "The books: invoices and expenses"], "Pick one, or type your own. Not sure? Say so and I'll recommend.")),
      typing(3700, false),
    ];
  }
  if (stage === 1) {
    const simeon = { id: agent, name: "Simeon" };
    const nora: DemoAgent = { id: "agent-nora", name: "Nora", title: "Inbox", description: "Runs the inbox: sorts what needs Bass from what doesn't, drafts the replies he should send and leaves them for his approval, and flags anything from a customer within the hour.", color: "green", minutesAgo: 0 };
    return [
      typing(500, true),
      append(2000, says("o1a", 0, "Good call. Hiring someone for your inbox now.")),
      typing(2100, false),
      // Simeon's own chat shows the brief he sent, as the host writes it when he sends (agent-to-agent-messaging.ts).
      append(3300, toTeammate("o1t", 0, { id: nora.id, name: nora.name }, "Bass staffed you to run his inbox. Every morning, sort what needs him from what doesn't, draft the replies he should send and leave them for his approval, and flag anything from a customer within the hour. Report to him in your chat; tell me only what needs a decision.")),
      { at: 3400, kind: "hire", agent: nora, entries: [
        fromTeammate("n0", 0, simeon, "Bass staffed you to run his inbox. Every morning, sort what needs him from what doesn't, draft the replies he should send and leave them for his approval, and flag anything from a customer within the hour. Report to him in your chat; tell me only what needs a decision."),
        says("n1", 0, "Hi Bass, I'm Nora, on your inbox from today. First I'll sort this week's mail into what needs you and what doesn't, and draft the replies for you to approve. I need Gmail for that."),
        card("n2", 0, { type: "connector", connector: "Gmail", variant: "connect", reason: "To read your inbox and draft replies" }),
      ] },
      typing(3600, true),
      append(5400, says("o1b", 0, "Nora is set up for your inbox and I've briefed her: she sorts what needs you, drafts replies for you to approve, and flags customers within the hour. You'll hear from her in her own chat; she'll ask you to connect Gmail there.")),
      append(6400, question("o1q", "Anything else you'd hand off today?", ["My calendar and meeting prep", "Research and writing", "That's all for now"])),
      typing(6500, false),
    ];
  }
  return [
    typing(500, true),
    append(2000, says("o2a", 0, "Then I'll keep an eye on Nora and pull you in only when a decision needs you. Hand me anything else whenever; I'll find the right person for it.")),
    typing(2100, false),
  ];
}

/**
 * The demo's story, for a product manager a few days before a launch. One
 * conversation plays by itself when the page opens (Simeon's), everything
 * else is already written, and the person never types (the founder, 27
 * September 2026: "i shouldnt be able to type or use microphone - the
 * messages/answers are pre-recorded and are chosen … its only the first
 * message with simeon that is animated, everything else is already written.
 * also we need a group disussion with the 3 agents … think of it for a
 * product manager").
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
  { id: "simeon", name: "Simeon", title: "COO", description: "Runs your day and keeps the team pointed at what matters.", color: "blue", minutesAgo: 0 },
  { id: "yodo", name: "Yodo", title: "Delivery", description: "Keeps the launch on track in Linear and Slack.", color: "red", minutesAgo: 95 },
  { id: "scout", name: "Scout", title: "Research", description: "Reads what customers say and brings back what matters.", color: "cyan", minutesAgo: 60 * 26 },
  { id: "atlas", name: "Atlas", title: "Travel", description: "Finds and books your flights.", color: "green", minutesAgo: 12 },
];

/**
 * Flight results as an agent sends them (2 October 2026): one message that is a single
 * simeon-flights block, which the window draws as the results card and, on a tap, the
 * details panel; then a short message with the pick and the one assumption made. The
 * request is the one the founder made of Muse, word for word.
 */
const FLIGHTS_SEA_LAX = "```simeon-flights\n{\"title\": \"Seattle to Los Angeles\", \"subtitle\": \"Fri, Oct 2 · Refundable · 1 adult\", \"offers\": [{\"airline\": \"American Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/AA.svg\", \"price\": \"$361.20\", \"priceNote\": \"1 adult · Economy · One way\", \"date\": \"Fri, Oct 2\", \"from\": \"SEA\", \"fromCity\": \"Seattle\", \"to\": \"LAX\", \"toCity\": \"Los Angeles\", \"depart\": \"6:00 AM\", \"arrive\": \"12:18 PM\", \"duration\": \"6h 18m\", \"stops\": \"1 stop · PHX 1h 38m\", \"refundable\": \"Full refund\", \"changeable\": \"Free\", \"bags\": \"1 carry-on\", \"legs\": [{\"from\": \"SEA\", \"fromCity\": \"Seattle\", \"to\": \"PHX\", \"toCity\": \"Phoenix\", \"depart\": \"6:00 AM\", \"arrive\": \"9:10 AM\", \"flight\": \"AA 3792\", \"duration\": \"3h 10m\", \"layover\": \"1h 38m in Phoenix\", \"carrier\": \"American Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/AA.svg\", \"cabin\": \"Economy\", \"departDay\": \"Fri, Oct 2\", \"arriveDay\": \"Fri, Oct 2\"}, {\"from\": \"PHX\", \"fromCity\": \"Phoenix\", \"to\": \"LAX\", \"toCity\": \"Los Angeles\", \"depart\": \"10:48 AM\", \"arrive\": \"12:18 PM\", \"flight\": \"AA 2027\", \"duration\": \"1h 30m\", \"carrier\": \"American Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/AA.svg\", \"cabin\": \"Economy\", \"departDay\": \"Fri, Oct 2\", \"arriveDay\": \"Fri, Oct 2\"}], \"label\": \"Cheapest\"}, {\"airline\": \"Alaska Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/AS.svg\", \"price\": \"$446.40\", \"priceNote\": \"1 adult · Economy · One way\", \"date\": \"Fri, Oct 2\", \"from\": \"SEA\", \"fromCity\": \"Seattle\", \"to\": \"LAX\", \"toCity\": \"Los Angeles\", \"depart\": \"6:49 AM\", \"arrive\": \"9:34 AM\", \"duration\": \"2h 45m\", \"stops\": \"Nonstop\", \"refundable\": \"Full refund\", \"changeable\": \"Free\", \"bags\": \"1 carry-on\", \"legs\": [{\"from\": \"SEA\", \"fromCity\": \"Seattle\", \"to\": \"LAX\", \"toCity\": \"Los Angeles\", \"depart\": \"6:49 AM\", \"arrive\": \"9:34 AM\", \"flight\": \"AS 1068\", \"duration\": \"2h 45m\", \"carrier\": \"Alaska Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/AS.svg\", \"cabin\": \"Economy\", \"departDay\": \"Fri, Oct 2\", \"arriveDay\": \"Fri, Oct 2\"}], \"label\": \"Fastest\"}, {\"airline\": \"United Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/UA.svg\", \"price\": \"$372.20\", \"priceNote\": \"1 adult · Economy · One way\", \"date\": \"Fri, Oct 2\", \"from\": \"SEA\", \"fromCity\": \"Seattle\", \"to\": \"LAX\", \"toCity\": \"Los Angeles\", \"depart\": \"7:11 AM\", \"arrive\": \"12:01 PM\", \"duration\": \"4h 50m\", \"stops\": \"1 stop · SFO 1h 09m\", \"refundable\": \"Full refund\", \"changeable\": \"Free\", \"bags\": \"1 carry-on\", \"legs\": [{\"from\": \"SEA\", \"fromCity\": \"Seattle\", \"to\": \"SFO\", \"toCity\": \"San Francisco\", \"depart\": \"7:11 AM\", \"arrive\": \"9:21 AM\", \"flight\": \"UA 1440\", \"duration\": \"2h 10m\", \"layover\": \"1h 09m in San Francisco\", \"carrier\": \"United Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/UA.svg\", \"cabin\": \"Economy\", \"departDay\": \"Fri, Oct 2\", \"arriveDay\": \"Fri, Oct 2\"}, {\"from\": \"SFO\", \"fromCity\": \"San Francisco\", \"to\": \"LAX\", \"toCity\": \"Los Angeles\", \"depart\": \"10:30 AM\", \"arrive\": \"12:01 PM\", \"flight\": \"UA 2251\", \"duration\": \"1h 31m\", \"carrier\": \"United Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/UA.svg\", \"cabin\": \"Economy\", \"departDay\": \"Fri, Oct 2\", \"arriveDay\": \"Fri, Oct 2\"}], \"label\": \"\"}, {\"airline\": \"Southwest Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/WN.svg\", \"price\": \"$408.20\", \"priceNote\": \"1 adult · Economy · One way\", \"date\": \"Fri, Oct 2\", \"from\": \"SEA\", \"fromCity\": \"Seattle\", \"to\": \"LAX\", \"toCity\": \"Los Angeles\", \"depart\": \"5:30 AM\", \"arrive\": \"10:35 AM\", \"duration\": \"5h 05m\", \"stops\": \"1 stop · OAK 1h 35m\", \"refundable\": \"Full refund\", \"changeable\": \"Free\", \"bags\": \"2 checked bags\", \"legs\": [{\"from\": \"SEA\", \"fromCity\": \"Seattle\", \"to\": \"OAK\", \"toCity\": \"Oakland\", \"depart\": \"5:30 AM\", \"arrive\": \"7:35 AM\", \"flight\": \"WN 2210\", \"duration\": \"2h 05m\", \"layover\": \"1h 35m in Oakland\", \"carrier\": \"Southwest Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/WN.svg\", \"cabin\": \"Economy\", \"departDay\": \"Fri, Oct 2\", \"arriveDay\": \"Fri, Oct 2\"}, {\"from\": \"OAK\", \"fromCity\": \"Oakland\", \"to\": \"LAX\", \"toCity\": \"Los Angeles\", \"depart\": \"9:10 AM\", \"arrive\": \"10:35 AM\", \"flight\": \"WN 1873\", \"duration\": \"1h 25m\", \"carrier\": \"Southwest Airlines\", \"logo\": \"https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/WN.svg\", \"cabin\": \"Economy\", \"departDay\": \"Fri, Oct 2\", \"arriveDay\": \"Fri, Oct 2\"}], \"label\": \"\"}]}\n```";

/** The group the three work in with you. */
export const GROUP: DemoGroup = {
  id: "launch-squad", name: "Launch squad", description: "Thursday's launch, with Simeon, Scout and Yodo.",
  memberIds: ["simeon", "scout", "yodo"], minutesAgo: 40,
};

/** Already written: what happened before the page opened. */
export const TRANSCRIPTS: Record<string, Entry[]> = {
  simeon: [],
  atlas: [
    you("a0u", 13, "could you help me find a flight? I have to be in LA tomorrow at 2:00 p.m. and, uh, uh, I'm going from Seattle and I wanted you to sort of get me the cheapest flight, obviously refundable."),
    says("a0c", 12, FLIGHTS_SEA_LAX),
    says("a0s", 12, "American through Phoenix is the cheapest refundable fare and lands at 12:18, in time for 2. If you'd rather fly nonstop, Alaska is three and a half hours quicker for $85 more. I assumed one adult, one way, into LAX."),
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
};

/** The group's conversation, already written. `author` is the member who spoke. */
export const GROUP_TRANSCRIPT: readonly { readonly author: string | null; readonly entry: Entry }[] = [
  { author: null, entry: you("g0u", 58, "Honest check: can we still ship Thursday?") },
  { author: "yodo", entry: says("g0y", 56, "Engineering says yes if **LIN-482** merges by Wednesday noon. It's in review now.") },
  { author: "scout", entry: says("g0s", 55, "From the research, what customers care about is the new setup flow. The pricing page change can wait.") },
  { author: "simeon", entry: says("g0m", 54, "Then keep Thursday. I'll move the pricing page to the fast-follow list and let Dana and Marcus know.") },
  { author: null, entry: you("g1u", 45, "Do it.") },
  { author: "simeon", entry: says("g1m", 40, "Done. Moved in **Linear** and posted in #launch on **Slack**.") },
];

/**
 * What plays when the page opens, and the whole of Simeon's story: the same
 * conversation the website's phone still shows (the founder, 28 September
 * 2026: "have the same text for simeon in the laptop. that one is much more
 * better"). You ask where the launch stands, Simeon checks your tools and
 * answers, hears from Scout and Yodo, hands you the review doc, and when you
 * reply, sends the agenda and sets up a Monday routine. Nobody chooses
 * anything; it plays through once.
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

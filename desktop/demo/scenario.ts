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

export const AGENTS: readonly DemoAgent[] = [
  { id: "simeon", name: "Simeon", title: "Chief of staff", description: "Runs your day and keeps the team pointed at what matters.", color: "blue", minutesAgo: 0 },
  { id: "yodo", name: "Yodo", title: "Delivery", description: "Keeps the launch on track in Linear and Slack.", color: "red", minutesAgo: 95 },
  { id: "scout", name: "Scout", title: "Research", description: "Reads what customers say and brings back what matters.", color: "cyan", minutesAgo: 60 * 26 },
];

/** The group the three work in with you. */
export const GROUP: DemoGroup = {
  id: "launch-squad", name: "Launch squad", description: "Thursday's launch, with Simeon, Scout and Yodo.",
  memberIds: ["simeon", "scout", "yodo"], minutesAgo: 40,
};

/** Already written: what happened before the page opened. */
export const TRANSCRIPTS: Record<string, Entry[]> = {
  simeon: [],
  scout: [
    you("s0u", 60 * 27, "What are customers saying about onboarding since the redesign?"),
    says("s0a", 60 * 26 + 30, "I read the 14 interview notes in **Notion** and 212 **Intercom** conversations from the last 30 days. Three things stand out:\n\n1. **Setup takes too long.** 9 of 14 people stalled at the workspace step.\n2. **Templates work.** People who picked one were twice as likely to invite a teammate.\n3. **The words confuse.** \"Workspace\" and \"project\" get mixed up in 31 tickets."),
    file("s0f", 60 * 26 + 29, "research/Onboarding research, September.pdf"),
    says("s0b", 60 * 26 + 29, "The quotes behind each theme are on page 3."),
  ],
  yodo: [
    you("y0u", 60 * 50, "Keep the launch on track. Post a standup in Slack every morning."),
    says("y0a", 60 * 50 - 1, "I'll need **Linear** and **Slack** for that."),
    card("y0c", 60 * 50 - 1, { type: "connectors", connectors: ["Linear", "Slack"] }),
    says("y0b", 60 * 50 - 3, "Both connected. Every morning at 9:00 I'll post the launch board in #launch and flag anything stuck for more than a day."),
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
  ];
}

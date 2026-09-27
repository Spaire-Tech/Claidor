/**
 * The demo's story, for a product manager a few days before a launch. One
 * conversation plays by itself when the page opens (Simeon's), everything
 * else is already written, and the person never types: they answer Simeon by
 * choosing one of the replies on its question cards (the founder, 27
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
const question = (id: string, minutesAgo: number, prompt: string, options: readonly { label: string; value: string }[]): Entry =>
  card(id, minutesAgo, { type: "widget", widget: { prompt, options } });

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
 * What plays when the page opens: you ask Simeon where the launch stands,
 * Simeon checks your tools and answers, then asks what to do next.
 */
export type Beat =
  | { readonly at: number; readonly kind: "user"; readonly agent: string; readonly entry: Entry }
  | { readonly at: number; readonly kind: "typing"; readonly agent: string; readonly on: boolean }
  | { readonly at: number; readonly kind: "step"; readonly agent: string; readonly id: string; readonly name: string; readonly summary: string; readonly status: "running" | "completed"; readonly detail?: string; readonly target?: string }
  | { readonly at: number; readonly kind: "append"; readonly agent: string; readonly entry: Entry };

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
    { at: 6000, kind: "typing", agent: "simeon", on: true },
    { at: 7000, kind: "append", agent: "simeon", entry: says("m0a", 0, "Morning Bass. Thursday is on track:\n\n- **12 of 15** launch tickets are done in **Linear**.\n- **LIN-482**, the pricing page bug, is in review. Marcus expects it Wednesday.\n- The launch review is **Thursday at 2 pm** with Dana and Marcus.") },
    { at: 7800, kind: "append", agent: "simeon", entry: question("m0q", 0, "Want me to get the launch review ready?", [
      { label: "Yes, prepare the doc and agenda", value: "prepare" },
      { label: "Just send me the open risks", value: "risks" },
    ]) },
    { at: 7900, kind: "typing", agent: "simeon", on: false },
  ];
}

/** After you choose "Yes, prepare the doc and agenda". */
export function prepareScript(): Beat[] {
  return [
    { at: 300, kind: "typing", agent: "simeon", on: true },
    ...step(600, "p1", "SendToAgent", "Asking Scout for customer quotes", "Got customer quotes from Scout", 1500, undefined, "scout"),
    ...step(2300, "p2", "SendToAgent", "Asking Yodo for the ticket status", "Got the ticket status from Yodo", 1300, undefined, "yodo"),
    ...step(3800, "p3", "Write", "Writing the review doc", "Wrote the review doc", 1600),
    { at: 5600, kind: "append", agent: "simeon", entry: says("p0a", 0, "Here's the review doc: status from Yodo, the three customer themes from Scout, and the one open risk.") },
    { at: 5800, kind: "append", agent: "simeon", entry: file("p0f", 0, "docs/Launch review, Thursday.docx") },
    { at: 6600, kind: "append", agent: "simeon", entry: question("p0q", 0, "Send the agenda to Dana and Marcus?", [
      { label: "Send it", value: "send" },
      { label: "I'll send it myself", value: "self" },
    ]) },
    { at: 6700, kind: "typing", agent: "simeon", on: false },
  ];
}

/** After you choose "Just send me the open risks". */
export function risksScript(): Beat[] {
  return [
    { at: 300, kind: "typing", agent: "simeon", on: true },
    ...step(600, "r1", "SendToAgent", "Checking with Yodo", "Checked with Yodo", 1400, undefined, "yodo"),
    { at: 2400, kind: "append", agent: "simeon", entry: says("r0a", 0, "One real risk and one small one:\n\n1. **LIN-482** has to merge by Wednesday noon, or the pricing page ships a day late.\n2. Two onboarding screens still wait on Dana's review. She has it on her list for today.") },
    { at: 3200, kind: "append", agent: "simeon", entry: question("r0q", 0, "Want me to nudge Marcus about LIN-482?", [
      { label: "Yes, message him on Slack", value: "nudge" },
      { label: "No, I'll talk to him", value: "self" },
    ]) },
    { at: 3300, kind: "typing", agent: "simeon", on: false },
  ];
}

/** The last step, whichever way you went. */
export function closingScript(choice: string): Beat[] {
  if (choice === "send") {
    return [
      { at: 300, kind: "typing", agent: "simeon", on: true },
      ...step(600, "c1", "CallMcpTool", "Sending from Gmail", "Sent from Gmail", 1400, "Gmail"),
      ...step(2100, "c2", "CallMcpTool", "Adding the doc to the invite", "Added the doc to the invite", 1100, "Google Calendar"),
      { at: 3400, kind: "append", agent: "simeon", entry: says("c0a", 0, "Sent from your **Gmail** to Dana and Marcus, and the doc is on Thursday's invite in **Google Calendar**. I'll check in Wednesday afternoon on LIN-482.") },
      { at: 3500, kind: "typing", agent: "simeon", on: false },
    ];
  }
  if (choice === "nudge") {
    return [
      { at: 300, kind: "typing", agent: "simeon", on: true },
      ...step(600, "c3", "CallMcpTool", "Messaging Marcus on Slack", "Messaged Marcus on Slack", 1400, "Slack"),
      { at: 2200, kind: "append", agent: "simeon", entry: says("c1a", 0, "Done. I asked Marcus on **Slack** whether LIN-482 is still good for Wednesday noon. I'll tell you as soon as he answers.") },
      { at: 2300, kind: "typing", agent: "simeon", on: false },
    ];
  }
  return [
    { at: 400, kind: "typing", agent: "simeon", on: true },
    { at: 1400, kind: "append", agent: "simeon", entry: says("c2a", 0, "Sounds good. It's all in this chat when you need it.") },
    { at: 1500, kind: "typing", agent: "simeon", on: false },
  ];
}

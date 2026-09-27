/**
 * The demo's cast and what they have been doing. Entries use the host's own
 * transcript shapes (host/extensions/transcript): a person's message is
 * {kind:"message", role:"user"}; an agent speaks through SendMessage,
 * {kind:"send-message", message:{type,…}} with the card types the pinned
 * renderer draws; an agent briefing another is {kind:"message",
 * role:"assistant", toAgent} on the sender and {role:"user", fromAgent} on
 * the receiver (agent-to-agent-messaging.ts).
 */
export interface DemoAgent {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly color: string;
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
export const briefs = (id: string, minutesAgo: number, to: { id: string; name: string }, content: string): Entry => ({
  kind: "message", id, role: "assistant", content, isStreaming: false, timestampMs: at(minutesAgo), toAgent: { ...to, kind: "agent" },
});
export const briefedBy = (id: string, minutesAgo: number, from: { id: string; name: string }, content: string): Entry => ({
  kind: "message", id, role: "user", content, isStreaming: false, timestampMs: at(minutesAgo), fromAgent: from,
});

export const SIMEON = { id: "simeon", name: "Simeon" };
export const QUILL = { id: "quill", name: "Quill" };

export const AGENTS: readonly DemoAgent[] = [
  { id: "simeon", name: "Simeon", title: "Chief of staff", description: "Runs your day and staffs the team.", color: "blue", minutesAgo: 1 },
  { id: "scout", name: "Scout", title: "Research", description: "Finds things out and cites every source.", color: "cyan", minutesAgo: 12 },
  { id: "yodo", name: "Yodo", title: "Operations", description: "Works inside your tools: mail, Notion, calendar.", color: "red", minutesAgo: 34 },
  { id: "ledger", name: "Ledger", title: "Finance", description: "Invoices, spend and the monthly close.", color: "violet", minutesAgo: 180 },
];

/** The teammate Simeon creates live, in front of the viewer. */
export const QUILL_AGENT: DemoAgent = {
  id: "quill", name: "Quill", title: "Investor relations", description: "Writes the monthly investor update from your numbers.", color: "yellow", minutesAgo: 0,
};

export const TRANSCRIPTS: Record<string, Entry[]> = {
  simeon: [
    you("t0u", 42, "Morning. What's on today?"),
    says("t0s0", 41, "Morning Bass. Three things matter today:\n\n1. **Investor update** is due Friday. Nobody owns it yet.\n2. **Scout** finished the Dakar coworking research. Worth a look before your 2 pm.\n3. **Yodo** has two emails waiting for your OK."),
    card("t0s1", 41, {
      type: "widget",
      widget: {
        prompt: "Want me to find someone for the investor update?",
        options: [
          { label: "Yes, set someone up", value: "yes" },
          { label: "I'll write it myself", value: "no" },
        ],
      },
    }),
  ],
  scout: [
    you("t0u", 70, "Find the best coworking spaces in Dakar that sell day passes. I'm there next week."),
    says("t0s0", 66, "On it. I'll check reviews, prices and whether they actually sell day passes, not just monthly desks."),
    says("t0s1", 14, "Done. Five places sell day passes; two stand out:\n\n**Jokkolabs Dakar**: 8,000 FCFA a day, fast fibre, quiet floor upstairs.\n**Impact Hub Dakar**: 12,000 FCFA, meeting rooms by the hour.\n\nFull comparison with sources is in the report."),
    card("t0s2", 14, { type: "attachment", url: "file:///home/box/reports/Dakar%20coworking%20day%20passes.pdf" }),
    card("t0s3", 13, {
      type: "widget",
      widget: {
        prompt: "Should I book a day pass for Tuesday?",
        helpText: "Your calendar is free all day.",
        options: [
          { label: "Jokkolabs", value: "jokkolabs", description: "8,000 FCFA" },
          { label: "Impact Hub", value: "impact-hub", description: "12,000 FCFA" },
          { label: "Not yet", value: "later" },
        ],
      },
    }),
  ],
  yodo: [
    you("t0u", 95, "Chase the three unpaid invoices from last month."),
    says("t0s0", 94, "I'll need your mail for that. Connect Gmail and I'll take it from there."),
    card("t0s1", 94, { type: "connector", connector: "Gmail", variant: "connect", reason: "To find the invoices and send the reminders." }),
    card("t0s2", 91, { type: "connector", connector: "Gmail", variant: "connected" }),
    says("t0s3", 88, "Found them: Atlas Print, Nova Studio and Teranga Foods, 4,850 € in total. Here's the first reminder; the other two follow the same shape."),
    card("t0s4", 88, {
      type: "email-draft",
      draft: {
        from: "bass@simeonlabs.com",
        to: ["accounts@atlasprint.sn"],
        subject: "Invoice #1042 — friendly reminder",
        body: "Hi Awa,\n\nA quick reminder that invoice #1042 (1,900 €, due 30 September) is still open. I've attached it again in case it got buried.\n\nThanks a lot,\nBass",
      },
    }),
    you("t1u", 40, "Looks good. Also keep Notion in sync, I track them there."),
    card("t1s0", 39, { type: "connectors", connectors: ["Notion"] }),
    says("t1s1", 34, "Notion's connected. I'll mark each invoice paid in your Finance tracker as the money comes in, and chase again on Friday if anyone hasn't paid."),
  ],
  ledger: [
    you("t0u", 200, "How much did we spend on software in September?"),
    says("t0s0", 186, "**$2,340** across 14 subscriptions, up 9% on August. The jump is Figma (+3 seats) and a second Vercel project.\n\nTwo tools nobody opened this month: **Loom** and **Miro**."),
    card("t0s1", 181, {
      type: "auto-review-approval",
      approval: {
        requestId: "demo-approval-1",
        surface: "computer",
        summary: "Cancel the Loom and Miro subscriptions ($38/month)",
        reason: "Cancelling a paid plan can't be undone from here.",
        status: "pending",
      },
    }),
  ],
};

/**
 * What plays when you open Simeon: you ask for the investor update, Simeon
 * works, creates Quill (who appears in the sidebar), briefs them, and Quill
 * starts on the job in its own conversation.
 */
export type Beat =
  | { readonly at: number; readonly kind: "user"; readonly agent: string; readonly entry: Entry }
  | { readonly at: number; readonly kind: "typing"; readonly agent: string; readonly on: boolean }
  | { readonly at: number; readonly kind: "step"; readonly agent: string; readonly id: string; readonly name: string; readonly summary: string; readonly status: "running" | "completed"; readonly detail?: string; readonly target?: string }
  | { readonly at: number; readonly kind: "append"; readonly agent: string; readonly entry: Entry }
  | { readonly at: number; readonly kind: "create-agent"; readonly agent: DemoAgent };

export function creationScript(): Beat[] {
  const t = 0;
  return [
    { at: 1200, kind: "user", agent: "simeon", entry: you("t1u", t, "Yes, find someone for the investor update. Every month, from our numbers.") },
    { at: 1800, kind: "typing", agent: "simeon", on: true },
    { at: 2600, kind: "append", agent: "simeon", entry: says("t1s0", t, "Good idea to make it a job, not a favour. I'll set up a teammate who owns it end to end.") },
    { at: 3200, kind: "step", agent: "simeon", id: "s2", name: "CreateAgent", summary: "Creating Quill", status: "running" },
    { at: 4800, kind: "create-agent", agent: QUILL_AGENT },
    { at: 5100, kind: "step", agent: "simeon", id: "s2", name: "CreateAgent", summary: "Created Quill", status: "completed" },
    { at: 5300, kind: "step", agent: "simeon", id: "s3", name: "SendToAgent", summary: "Briefing Quill", status: "running", target: "quill" },
    { at: 6600, kind: "append", agent: "simeon", entry: briefs("t1a0", t, QUILL, "You own the monthly investor update from now on. Pull revenue and burn from Ledger, product news from me, and have a draft ready by the 3rd of each month for Bass to approve.") },
    { at: 6700, kind: "append", agent: "quill", entry: briefedBy("t0u", t, SIMEON, "You own the monthly investor update from now on. Pull revenue and burn from Ledger, product news from me, and have a draft ready by the 3rd of each month for Bass to approve.") },
    { at: 6800, kind: "step", agent: "simeon", id: "s3", name: "SendToAgent", summary: "Briefed Quill", status: "completed" },
    { at: 7200, kind: "typing", agent: "simeon", on: true },
    { at: 8000, kind: "append", agent: "simeon", entry: says("t1s1", t, "Meet **Quill**. They own the investor update now: a draft on the 3rd of every month, from Ledger's numbers and my notes. You only approve.") },
    { at: 8100, kind: "typing", agent: "simeon", on: false },
    { at: 8600, kind: "step", agent: "quill", id: "q1", name: "SendToAgent", summary: "Asking Ledger for October revenue and burn", status: "running", target: "ledger" },
    { at: 10600, kind: "step", agent: "quill", id: "q1", name: "SendToAgent", summary: "Got October numbers from Ledger", status: "completed" },
    { at: 10800, kind: "typing", agent: "quill", on: true },
    { at: 11800, kind: "append", agent: "quill", entry: says("t0s0", t, "Hi Bass, I'm Quill. I'll have October's update drafted by the 3rd. Ledger already sent me revenue (**$41.2k MRR, +12%**) and burn.") },
    { at: 12500, kind: "append", agent: "quill", entry: card("t0s1", t, { type: "widget", widget: { prompt: "Who should it go to?", options: [{ label: "Same list as September", value: "same" }, { label: "Let me pick", value: "pick" }] } }) },
    { at: 12600, kind: "typing", agent: "quill", on: false },
  ];
}

/** Things that happen on their own while you look around. */
export function ambientScript(): Beat[] {
  return [
    { at: 9000, kind: "step", agent: "yodo", id: "y1", name: "CallMcpTool", summary: "Checking Gmail for payments", status: "running", detail: "Gmail" },
    { at: 12500, kind: "step", agent: "yodo", id: "y1", name: "CallMcpTool", summary: "Checked Gmail", status: "completed" },
    { at: 12700, kind: "step", agent: "yodo", id: "y2", name: "CallMcpTool", summary: "Updating the Notion tracker", status: "running", detail: "Notion" },
    { at: 15200, kind: "step", agent: "yodo", id: "y2", name: "CallMcpTool", summary: "Updated the Notion tracker", status: "completed" },
    { at: 15300, kind: "typing", agent: "yodo", on: false },
    { at: 15400, kind: "append", agent: "yodo", entry: says("t2s0", 0, "Nova Studio just paid **1,450 €**. Marked paid in Notion. Two to go.") },
  ];
}

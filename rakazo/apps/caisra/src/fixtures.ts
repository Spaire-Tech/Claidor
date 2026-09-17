import type { MessageBlock, Routine } from "@rakazo/contracts";
import { type CardExample, cardExamples } from "./cardExamples.js";

/**
 * A morning with a team working.
 *
 * These are **message blocks**, exactly as the backend sends them, not
 * hand-made rows. The screen builds itself by running them through
 * `caisraRowFromBlock`, so a screenshot taken from this file is evidence that
 * the real mapping draws the real thing — not a mock-up that happens to look
 * like it. The routines below are real `Routine` records for the same reason.
 */

export type FixtureMessage = { role: "person" | "agent"; blocks: MessageBlock[] };

const YODO = "bot-yodo";
const COMMS = "bot-comms";
const EXPENSES = "bot-expenses";
const DESK = "bot-desk";

export const names: Record<string, string> = {
  [YODO]: "Yodo",
  [COMMS]: "Comms",
  [EXPENSES]: "Expenses",
  [DESK]: "Front Desk",
};

/** The sidebar: one conversation per agent, which is what the app is. */
export type FixtureBot = {
  id: string;
  name: string;
  title: string;
  last: string;
  when: string;
  unread?: boolean;
  working?: boolean;
};

export const yodo: FixtureBot = {
  id: YODO,
  name: "Yodo",
  title: "Runs the team",
  last: "Hotel is confirmed. The outbound flight clashes…",
  when: "9:41",
  working: true,
};

export const comms: FixtureBot = {
  id: COMMS,
  name: "Comms",
  title: "Email, calendar, travel",
  last: "Hotel confirmed, flights not yet.",
  when: "9:38",
  unread: true,
};

export const expenses: FixtureBot = {
  id: EXPENSES,
  name: "Expenses",
  title: "Matches receipts, files the report",
  last: "August is filed. Two receipts still missing.",
  when: "Yesterday",
};

export const frontDesk: FixtureBot = {
  id: DESK,
  name: "Front Desk",
  title: "Answers the shared inbox",
  last: "Four replies sent, one needs you.",
  when: "Tuesday",
};

export const bots: FixtureBot[] = [yodo, comms, expenses, frontDesk];

export const morning: FixtureMessage[] = [
  {
    role: "person",
    blocks: [{ kind: "text", text: "Morning. Where are we on the Lisbon trip?" }],
  },
  {
    role: "agent",
    blocks: [
      { kind: "progress", text: "Checking the calendar and what Comms has booked." },
      { kind: "progress", text: "reading a file", activity: true, pendingToolNames: ["read_file"] },
    ],
  },
  {
    role: "agent",
    blocks: [
      { kind: "bot_message_sent", toBotId: COMMS, toBotName: "Comms", text: "Trip status?" },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "subagent",
        agentId: "sub-1",
        name: "scout",
        task: "Check the flight times against the calendar",
        status: "completed",
        result: "Outbound clashes with the Thursday review. Everything else is clear.",
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "bot_message_received",
        fromBotId: COMMS,
        fromBotName: "Comms",
        text: "Hotel confirmed, flights not yet.",
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "text",
        text: "Hotel is confirmed. The outbound flight clashes with your Thursday review, so I have not booked it yet.",
      },
      {
        kind: "card",
        lines: [
          { k: "Hotel", v: "Memmo Alfama, 3 nights" },
          { k: "Outbound", v: "Thu 08:15 — clashes" },
          { k: "Return", v: "Sun 18:40" },
          { k: "Total so far", v: "€642" },
        ],
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "choice",
        question: "Which would you rather move?",
        options: [
          { id: "flight", letter: "A", label: "Take the later flight, keep the review" },
          { id: "review", letter: "B", label: "Move the review, keep the early flight" },
          { id: "ask", letter: "C", label: "Ask the others what suits them" },
        ],
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "channel_message",
        provider: "slack",
        channelId: "c1",
        fromAddress: "ana",
        fromLabel: "Ana",
        text: "can we push thursday?",
      },
    ],
  },
  {
    role: "agent",
    blocks: [{ kind: "handoff", fromBotId: YODO, toBotId: COMMS, text: "Rebook the outbound." }],
  },
];

export const startingUp: FixtureMessage[] = [
  {
    role: "person",
    blocks: [{ kind: "text", text: "I need someone on expenses." }],
  },
  {
    role: "agent",
    blocks: [
      { kind: "text", text: "Standing one up. It files reports and asks before guessing." },
      {
        kind: "child_bot",
        botId: EXPENSES,
        name: "Expense Desk",
        title: "Matches receipts, files the report",
        status: "created",
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "app_connect",
        provider: "gmail",
        name: "Gmail",
        description: "Receipts arrive here",
        logo: null,
        status: "pending",
      },
      {
        kind: "app_connect",
        provider: "googledrive",
        name: "Google Drive",
        description: "Where the reports land",
        logo: null,
        status: "connected",
      },
    ],
  },
  {
    role: "agent",
    blocks: [{ kind: "meta", text: "Expense Desk was renamed to Expenses" }],
  },
];

/**
 * The rest of the vocabulary.
 *
 * Every block kind the mapping turns into a row it has not drawn elsewhere:
 * the approval, the masked field, a file, a chart, a cloud run, a taught
 * skill — and two kinds that are deliberately dropped (`steps`, `computer`),
 * which are here so the screenshot shows they leave no gap.
 */
export const everythingElse: FixtureMessage[] = [
  {
    role: "person",
    blocks: [{ kind: "text", text: "Close the month and send me the numbers." }],
  },
  {
    role: "agent",
    blocks: [
      { kind: "steps", steps: [{ label: "Read the ledger", count: 3 }], durationMs: 4100 },
      {
        kind: "computer",
        state: "running",
        text: "Working in Numbers",
      },
      { kind: "text", text: "I need into the accounting tool first." },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "mcp_approval",
        name: "Xero",
        serverId: "mcp_xero",
        transport: "streamable_http",
        endpoint: "https://api.xero.com/mcp",
        needsOAuth: true,
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "ask",
        text: "What is the code Xero just texted you?",
        input: "secret",
        purpose: "otp",
        status: "answered",
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "chart",
        name: "Spend by month",
        spec: {
          width: 470,
          height: 210,
          marginLeft: 46,
          y: { grid: true, label: "€" },
          // The domain is pinned so the months read in their own order.
          x: { label: null, domain: ["May", "Jun", "Jul", "Aug"] },
          marks: [
            { type: "barY", options: { x: "month", y: "spend", fill: "#0071e3" } },
            { type: "ruleY", data: [0], options: {} },
          ],
        },
        data: [
          { month: "May", spend: 4120 },
          { month: "Jun", spend: 5230 },
          { month: "Jul", spend: 3980 },
          { month: "Aug", spend: 6410 },
        ],
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "file",
        artifactId: "art_1",
        mimeType: "application/vnd.ms-excel",
        name: "August close.xlsx",
        size: 48_211,
      },
      {
        kind: "file",
        artifactId: "art_2",
        mimeType: "application/pdf",
        name: "August close.pdf",
        size: 212_004,
      },
      {
        // No mark of its own in the design, so the card says SVG rather than
        // borrowing another file's icon.
        kind: "file",
        artifactId: "art_3",
        mimeType: "image/svg+xml",
        name: "spend-by-month.svg",
        size: 8_140,
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "cloud_agent",
        agentId: "cl_1",
        title: "Fix the VAT rounding in the exporter",
        status: "finished",
        url: "https://example.invalid/runs/1",
        prUrl: "https://example.invalid/pull/318",
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "skill_draft",
        skillId: "sk_1",
        name: "Month-end close",
        goal: "Pull the ledger, reconcile receipts, file the report",
        playbook: {
          whenToUse: "On the first working day of the month",
          inputs: ["The ledger export", "The receipts folder"],
          steps: ["Pull the ledger", "Match receipts", "File"],
          howToCheck: "Totals match the bank statement",
          whatToReturn: "The filed report and anything unmatched",
          approvalBoundaries: "Never file without the person seeing the unmatched list",
          failureHandling: "Stop and say which receipts are missing",
        },
        status: "draft",
      },
    ],
  },
  {
    role: "agent",
    blocks: [
      {
        kind: "app_connect",
        provider: "xero",
        name: "Xero",
        description: "Where the ledger lives",
        logo: null,
        status: "pending",
      },
      {
        // Nothing we ship a logo for: the tile draws the initial, and no
        // favicon is fetched from anyone to cover for it.
        kind: "connect",
        name: "Revolut Business",
        initial: "R",
        color: "#191c1f",
        status: "pending",
      },
    ],
  },
];

/**
 * The answer cards, as conversations.
 *
 * Each of the founder's OpenUI pictures, in the shape a real turn has: what
 * they asked, the sentence before the block, the block itself as an
 * `answer_card`, and the sentence after. The programs are unchanged from the
 * ones OpenUI's parser has already accepted.
 */
export function cardScreens(photo: (name: string) => string): Record<string, FixtureMessage[]> {
  const screens: Record<string, FixtureMessage[]> = {};
  for (const [name, example] of Object.entries(cardExamples(photo))) {
    screens[name] = conversationOf(example);
  }
  return screens;
}

/**
 * Offer it before they ask.
 *
 * The founder, 18 September: *"i want for caisra take over in text and say
 * i've put this as a word doc as well for you and that will be the artifact...
 * thats how we win users. always proactive. the whole goal of the agent is
 * that it does stuff for you. you shouldnt have to ask him he should take
 * initiative like this."*
 *
 * Nothing in the code ever stopped this: the fence splitter has always walked
 * every block, so one reply can carry text, a card, a plain line and a
 * document, in that order. Two rules in the brief forbade it and both are
 * gone. This is that reply, drawn.
 */
export function proactive(photo: (name: string) => string): FixtureMessage[] {
  const plan = cardExamples(photo)["cards-plan"];
  if (!plan) return [];
  return [
    { role: "person", blocks: [{ kind: "text", text: plan.ask }] },
    {
      role: "agent",
      blocks: [
        { kind: "text", text: plan.before },
        { kind: "answer_card", program: plan.program.join("\n") },
        {
          kind: "text",
          text: "I have written it up as a document as well, so you have something to send on.",
        },
        { kind: "answer_card", program: MEAL_PLAN_REPORT },
      ],
    },
  ];
}

/**
 * The document that goes with it. A report, not a `.docx`: the guard the rule
 * came with is that Caisra never claims a Word file, a PDF or anything on disk
 * unless the file tools actually wrote one.
 */
const MEAL_PLAN_REPORT = [
  'root = ReportView("14-Day Meal Plan", "Two weeks of breakfasts, lunches and dinners", [p1, p2])',
  'p1 = Page("p1", StandardFrontPage("14-Day Meal Plan", "https://picsum.photos/seed/mealplan/1200/700", TextContent("A fortnight of lean proteins, whole grains and vegetables, with the cooking front-loaded into two sessions. Portions are a starting point, not a prescription."), "Cook once, eat twice", "title-top"))',
  'p2 = Page("p2", ContentWithImage("The week at a glance", ["https://picsum.photos/seed/mealprep/900/600"], "Days 2, 4 and 7 run on what you already cooked. That is the design, not laziness.", "image-right"))',
].join("\n");

function conversationOf(example: CardExample): FixtureMessage[] {
  const agent: MessageBlock[] = [
    { kind: "text", text: example.before },
    { kind: "answer_card", program: example.program.join("\n") },
  ];
  if (example.after) agent.push({ kind: "text", text: example.after });
  return [
    { role: "person", blocks: [{ kind: "text", text: example.ask }] },
    { role: "agent", blocks: agent },
  ];
}

/**
 * Real routines.
 *
 * Note the first one: three schedules on a single routine, which is what the
 * backend allows and what the screen therefore has to show. The second fires on
 * nothing but a webhook, the third only on a Git event, and the fourth is armed
 * once and never again.
 */
export const routines: Routine[] = [
  {
    id: "rt_1",
    botId: YODO,
    name: "Morning brief",
    prompt: "Read overnight email and the calendar, and tell me what needs me today.",
    crons: ["0 7 * * 1-5", "0 12 * * 1-5", "0 18 * * 1-5"],
    timezone: "Europe/Lisbon",
    active: true,
    notify: true,
    webhookEnabled: false,
    githubEnabled: false,
    messageProvider: "slack",
    lastRunAt: "2026-09-17T06:00:03.000Z",
    nextRunAt: "2026-09-17T11:00:00.000Z",
    createdAt: "2026-08-30T09:12:00.000Z",
  },
  {
    id: "rt_2",
    botId: EXPENSES,
    name: "New receipt arrives",
    prompt: "Match the receipt to a card line and file it. Ask if you cannot match it.",
    crons: [],
    timezone: "Europe/Lisbon",
    active: true,
    notify: false,
    webhookEnabled: true,
    githubEnabled: false,
    messageProvider: null,
    lastRunAt: "2026-09-16T17:42:00.000Z",
    nextRunAt: null,
    createdAt: "2026-09-02T14:00:00.000Z",
  },
  {
    id: "rt_3",
    botId: DESK,
    name: "Release notes",
    prompt: "When a tag is pushed, draft the release note and send it to me first.",
    crons: [],
    timezone: "Europe/Lisbon",
    active: false,
    notify: true,
    webhookEnabled: false,
    githubEnabled: true,
    messageProvider: null,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: "2026-09-09T10:30:00.000Z",
  },
  {
    id: "rt_4",
    botId: COMMS,
    name: "Chase the Lisbon flights",
    prompt: "If the outbound is still unbooked, book the later one and tell me.",
    crons: ["@once"],
    timezone: "Europe/Lisbon",
    active: true,
    notify: true,
    webhookEnabled: false,
    githubEnabled: false,
    messageProvider: null,
    lastRunAt: null,
    nextRunAt: "2026-09-18T09:00:00.000Z",
    createdAt: "2026-09-17T09:41:00.000Z",
  },
];

/** The run history the editor shows under the routine it belongs to. */
export type FixtureRun = { id: string; when: string; outcome: string; ok: boolean };

export const runs: FixtureRun[] = [
  { id: "run_3", when: "Today, 7:00", outcome: "Sent the brief", ok: true },
  { id: "run_2", when: "Yesterday, 18:00", outcome: "Sent the brief", ok: true },
  { id: "run_1", when: "Yesterday, 12:00", outcome: "Slack was unreachable", ok: false },
];

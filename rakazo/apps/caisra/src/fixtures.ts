import type { MessageBlock } from "@rakazo/contracts";

/**
 * A morning with a team working.
 *
 * These are **message blocks**, exactly as the backend sends them, not
 * hand-made rows. The screen builds itself by running them through
 * `caisraRowFromBlock`, so a screenshot taken from this file is evidence that
 * the real mapping draws the real thing — not a mock-up that happens to look
 * like it.
 */

export type FixtureMessage = { role: "person" | "agent"; blocks: MessageBlock[] };

const YODO = "bot-yodo";
const COMMS = "bot-comms";

export const names: Record<string, string> = {
  [YODO]: "Yodo",
  [COMMS]: "Comms",
};

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
        botId: "bot-expenses",
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

import { MessageBlock } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  type CaisraRow,
  CaisraRowKind,
  caisraRowFromBlock,
  caisraRowsFromBlocks,
} from "./caisra-thread.js";

/** Kinds the thread deliberately does not draw, each with the reason. */
const DELIBERATELY_UNDRAWN: Record<string, string> = {
  steps: "the tool lifecycle, which the design says the thread does not show",
  computer: "the computer has its own panel; a row would say it twice",
};

/** Every kind the backend can send, read from the schema rather than a list. */
function everyKind(): string[] {
  return MessageBlock.options.map((option) => option.shape.kind.value as string);
}

function block(kind: string, extra: Record<string, unknown> = {}): MessageBlock {
  return { kind, ...extra } as unknown as MessageBlock;
}

describe("Caisra thread rows", () => {
  it("draws, or deliberately drops, every kind the backend can send", () => {
    // The point of this test. A kind added upstream that nobody maps does not
    // throw and does not warn: its row is simply missing and the person sees a
    // gap where an agent spoke. Reading the kinds off the schema means a new
    // one fails here rather than in front of a user.
    const samples: Record<string, MessageBlock> = {
      text: block("text", { text: "hello" }),
      card: block("card", { lines: [{ k: "Where", v: "Lisbon" }] }),
      ask: block("ask", { text: "Which one?" }),
      choice: block("choice", { question: "What first?", options: [] }),
      app_connect: block("app_connect", {
        provider: "gmail",
        name: "Gmail",
        description: "",
        logo: null,
        status: "pending",
      }),
      connect: block("connect", { name: "Notion", initial: "N", color: "#000", status: "pending" }),
      computer: block("computer", { state: "running", text: "" }),
      meta: block("meta", { text: "renamed" }),
      progress: block("progress", { text: "checking the calendar" }),
      steps: block("steps", { steps: [] }),
      subagent: block("subagent", { agentId: "a", name: "scout", task: "look", status: "running" }),
      child_bot: block("child_bot", { botId: "b", name: "Comms", status: "created" }),
      cloud_agent: block("cloud_agent", {
        agentId: "c",
        title: "fix",
        status: "running",
        url: "https://x",
      }),
      skill_draft: block("skill_draft", {
        skillId: "s",
        name: "Expenses",
        goal: "file them",
        playbook: {},
        status: "draft",
      }),
      chart: block("chart", { spec: {}, title: "" }),
      mcp_approval: block("mcp_approval", {
        name: "Linear",
        serverId: "m",
        transport: "http",
        endpoint: null,
        needsOAuth: true,
      }),
      image: block("image", { artifactId: "i", mimeType: "image/png", name: "shot.png" }),
      file: block("file", { artifactId: "f", mimeType: "text/csv", name: "rows.csv", size: 1 }),
      handoff: block("handoff", { fromBotId: "1", toBotId: "2", text: "your turn" }),
      channel_message: block("channel_message", {
        provider: "slack",
        channelId: "c",
        fromAddress: "a",
        fromLabel: "Ana",
        text: "hi",
      }),
      bot_message_sent: block("bot_message_sent", { toBotId: "2", toBotName: "Comms", text: "x" }),
      bot_message_received: block("bot_message_received", {
        fromBotId: "1",
        fromBotName: "Yodo",
        text: "x",
      }),
    };

    const kinds = everyKind();
    // Nothing is untested because nobody wrote a sample for it.
    expect(Object.keys(samples).sort()).toEqual([...kinds].sort());

    for (const kind of kinds) {
      const row = caisraRowFromBlock(samples[kind] as MessageBlock);
      if (kind in DELIBERATELY_UNDRAWN) {
        expect(row, `${kind} is undrawn: ${DELIBERATELY_UNDRAWN[kind]}`).toBeNull();
      } else {
        expect(row, `${kind} produced no row`).not.toBeNull();
      }
    }
  });

  it("makes agent-to-agent traffic a quiet line, not a bubble", () => {
    // Several agents working would otherwise bury the part the person wanted.
    const rows = caisraRowsFromBlocks(
      [
        block("handoff", { fromBotId: "1", toBotId: "2", text: "over to you" }),
        block("bot_message_sent", { toBotId: "2", toBotName: "Comms", text: "the draft" }),
        block("bot_message_received", { fromBotId: "1", fromBotName: "Yodo", text: "done" }),
        block("channel_message", {
          provider: "slack",
          channelId: "c",
          fromAddress: "a",
          fromLabel: "Ana",
          text: "ping",
        }),
      ],
      { nameFor: (id) => (id === "1" ? "Yodo" : "Comms") },
    );
    expect(rows.every((row) => row.kind === CaisraRowKind.System)).toBe(true);
    expect(rows.map((row) => (row as { text: string }).text)).toEqual([
      "Comms took this on from Yodo",
      "Messaged Comms",
      "Yodo got in touch",
      "Ana on slack",
    ]);
  });

  it("separates what the agent says from what a tool is doing", () => {
    // Both arrive as progress. One is the agent talking and belongs in the
    // thread as speech; the other is provider tool chatter and belongs as a
    // working line that goes away.
    const spoken = caisraRowFromBlock(block("progress", { text: "Checking your calendar now" }));
    const chatter = caisraRowFromBlock(
      block("progress", { text: "reading a file", activity: true, pendingToolNames: ["read"] }),
    );
    expect(spoken?.kind).toBe(CaisraRowKind.Text);
    expect(chatter?.kind).toBe(CaisraRowKind.Status);
    expect((chatter as Extract<CaisraRow, { kind: "status" }>).tools).toEqual(["read"]);
  });

  it("masks a secret ask instead of drawing it as a question", () => {
    const row = caisraRowFromBlock(
      block("ask", { text: "Your API key", input: "secret", purpose: "api_key" }),
    );
    expect(row?.kind).toBe(CaisraRowKind.Secret);
  });

  it("keeps an archived teammate as a line, with nothing left to open", () => {
    const created = caisraRowFromBlock(
      block("child_bot", { botId: "b", name: "Comms", status: "created" }),
    );
    const archived = caisraRowFromBlock(
      block("child_bot", { botId: "b", name: "Comms", status: "archived" }),
    );
    expect(created?.kind).toBe(CaisraRowKind.Teammate);
    expect(archived?.kind).toBe(CaisraRowKind.System);
  });

  it("drops a saved skill draft, which is already in the skill list", () => {
    const draft = block("skill_draft", {
      skillId: "s",
      name: "Expenses",
      goal: "g",
      playbook: {},
      status: "draft",
    });
    const saved = block("skill_draft", {
      skillId: "s",
      name: "Expenses",
      goal: "g",
      playbook: {},
      status: "saved",
    });
    expect(caisraRowFromBlock(draft)).not.toBeNull();
    expect(caisraRowFromBlock(saved)).toBeNull();
  });
});

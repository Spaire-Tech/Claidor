import type { MessageBlock } from "@rakazo/contracts";

/**
 * What Caisra's thread draws, from what the backend sends.
 *
 * The backend speaks in message blocks — twenty-three kinds of them. Caisra's
 * thread draws a much smaller vocabulary of rows, because the founder's design
 * says a conversation is texts with occasional cards between them, not a feed
 * of machine events. This is the one place those two vocabularies meet.
 *
 * **Why it is a function and not a switch inside a component.** A block the
 * renderer does not recognise is not an error anyone sees: the row is simply
 * absent, and the person is left looking at a gap where an agent spoke. That
 * has already cost this project once. Here the mapping is exhaustive by
 * construction — the final `never` assignment means a kind added upstream
 * fails the build instead of disappearing at runtime — and it is a pure
 * function, so every kind can be checked without rendering anything.
 *
 * **Agent-to-agent traffic is a quiet line, not a bubble.** A handoff, a peer
 * message, a message arriving from Slack: all `system`. That is the upstream
 * app's own decision and it is right — when several agents are working, giving
 * each exchange a bubble buries the part the person actually wanted to read.
 */

export const CaisraRowKind = {
  /** A bubble, from the person or an agent. */
  Text: "text",
  /** A centred grey line. Something happened; nobody needs to reply. */
  System: "system",
  /** A shimmering verb while work is in flight. Replaced when it ends. */
  Status: "status",
  /** A question with options, answered once. */
  Choice: "choice",
  /** An approval, with the real command behind a disclosure. */
  Auth: "auth",
  /** A masked field. What is typed never reaches the transcript. */
  Secret: "secret",
  /** A file or an image as the whole message. */
  Attachment: "attachment",
  /** Their card: the key/value lines the agent sent. */
  Card: "card",
  /** Caisra's answer card: the openui-lang program the agent wrote. */
  Answer: "answer",
  /** A chart the agent rendered. */
  Chart: "chart",
  /** A connector offering to be connected. */
  Connector: "connector",
  /** A helper working inside this turn. */
  Helper: "helper",
  /** A teammate this agent stood up. */
  Teammate: "teammate",
  /** A cloud coding agent's run. */
  CloudAgent: "cloud_agent",
  /** A taught skill waiting to be kept. */
  SkillDraft: "skill_draft",
} as const;
export type CaisraRowKind = (typeof CaisraRowKind)[keyof typeof CaisraRowKind];

export type CaisraRow =
  | { kind: typeof CaisraRowKind.Text; text: string }
  | { kind: typeof CaisraRowKind.System; text: string; tone?: "plain" | "waiting" }
  | { kind: typeof CaisraRowKind.Status; text: string; tools?: readonly string[] }
  | {
      kind: typeof CaisraRowKind.Choice;
      question: string;
      options: readonly { id: string; letter?: string; label: string }[];
      answerId?: string;
    }
  | { kind: typeof CaisraRowKind.Auth; title: string; detail?: string; needsOAuth?: boolean }
  | { kind: typeof CaisraRowKind.Secret; question: string; purpose?: string; answered: boolean }
  | {
      kind: typeof CaisraRowKind.Attachment;
      artifactId: string;
      name: string;
      mimeType: string;
      /** Bytes. Only a `file` block carries one; an `image` does not. */
      size?: number;
    }
  | { kind: typeof CaisraRowKind.Card; lines: readonly { k: string; v: string }[] }
  | { kind: typeof CaisraRowKind.Answer; program: string }
  | { kind: typeof CaisraRowKind.Chart; block: Extract<MessageBlock, { kind: "chart" }> }
  | {
      kind: typeof CaisraRowKind.Connector;
      provider: string;
      label: string;
      connected: boolean;
      /** The one line under the name. The card draws it when the block has one. */
      line?: string;
      /**
       * The service's own mark, as an address the connector provider serves.
       *
       * Caisra ships no service logos. An earlier pass bundled forty-one of
       * them and ignored this field, which was both more code and less
       * coverage: the catalogue behind these blocks runs to thousands of apps
       * and carries a mark for each. When there is none, `initial` and
       * `colour` are what the block itself offers as the fallback.
       */
      logo?: string;
      initial?: string;
      colour?: string;
    }
  | {
      kind: typeof CaisraRowKind.Helper;
      name: string;
      task: string;
      status: "running" | "completed" | "failed";
      result?: string;
    }
  | { kind: typeof CaisraRowKind.Teammate; botId: string; name: string; title?: string }
  | {
      kind: typeof CaisraRowKind.CloudAgent;
      title: string;
      status: string;
      url: string;
      prUrl?: string;
    }
  | { kind: typeof CaisraRowKind.SkillDraft; skillId: string; name: string; goal: string };

/** Names for the bots a row mentions, so a line can say who rather than an id. */
export type CaisraNames = { nameFor?(botId: string): string | undefined };

function who(names: CaisraNames | undefined, botId: string): string {
  return names?.nameFor?.(botId) ?? "an agent";
}

/**
 * One block to one row, or none.
 *
 * Returning `null` is a decision, never an oversight: each one is commented
 * with why the person is better off not seeing that block as a row.
 */
export function caisraRowFromBlock(block: MessageBlock, names?: CaisraNames): CaisraRow | null {
  switch (block.kind) {
    case "text":
      return { kind: CaisraRowKind.Text, text: block.text };

    case "progress":
      // Progress updates are wanted (17 September). Provider-generated tool
      // chatter is not the agent talking, so it shows as a working line rather
      // than as something the agent chose to say.
      return block.activity
        ? { kind: CaisraRowKind.Status, text: block.text, tools: block.pendingToolNames }
        : { kind: CaisraRowKind.Text, text: block.text };

    case "meta":
      return { kind: CaisraRowKind.System, text: block.text };

    case "steps":
      // Deliberately undrawn. This is the tool lifecycle, and the design says
      // the thread shows what the agent did, not the machinery it used.
      return null;

    case "handoff":
      return {
        kind: CaisraRowKind.System,
        text: `${who(names, block.toBotId)} took this on from ${who(names, block.fromBotId)}`,
      };

    case "bot_message_sent":
      return { kind: CaisraRowKind.System, text: `Messaged ${block.toBotName}` };

    case "bot_message_received":
      return { kind: CaisraRowKind.System, text: `${block.fromBotName} got in touch` };

    case "channel_message":
      return { kind: CaisraRowKind.System, text: `${block.fromLabel} on ${block.provider}` };

    case "subagent":
      return {
        kind: CaisraRowKind.Helper,
        name: block.name,
        task: block.task,
        status: block.status,
        ...(block.result ? { result: block.result } : {}),
      };

    case "child_bot":
      // An archived or deleted teammate is a line, not a card: there is nothing
      // left to open.
      return block.status === "created"
        ? {
            kind: CaisraRowKind.Teammate,
            botId: block.botId,
            name: block.name,
            ...(block.title ? { title: block.title } : {}),
          }
        : { kind: CaisraRowKind.System, text: `${block.name} was ${block.status}` };

    case "cloud_agent":
      return {
        kind: CaisraRowKind.CloudAgent,
        title: block.title,
        status: block.status,
        url: block.url,
        ...(block.prUrl ? { prUrl: block.prUrl } : {}),
      };

    case "skill_draft":
      // A saved skill needs no row; it is already in the skill list.
      return block.status === "draft"
        ? {
            kind: CaisraRowKind.SkillDraft,
            skillId: block.skillId,
            name: block.name,
            goal: block.goal,
          }
        : null;

    case "choice":
      return {
        kind: CaisraRowKind.Choice,
        question: block.question,
        options: block.options,
        ...(block.answerId ? { answerId: block.answerId } : {}),
      };

    case "ask":
      // A secret ask is its own row: what is typed is masked and never enters
      // the transcript, so it must not be drawn as an ordinary question.
      if (block.input === "secret") {
        return {
          kind: CaisraRowKind.Secret,
          question: block.text,
          ...(block.purpose ? { purpose: block.purpose } : {}),
          answered: block.status === "answered",
        };
      }
      return {
        kind: CaisraRowKind.Choice,
        question: block.text,
        options: (block.actions ?? []).map((action) => ({ id: action.id, label: action.label })),
        ...(block.status === "answered" && block.answer ? { answerId: block.answer } : {}),
      };

    case "mcp_approval":
      return {
        kind: CaisraRowKind.Auth,
        title: block.name,
        ...(block.endpoint ? { detail: block.endpoint } : {}),
        needsOAuth: block.needsOAuth,
      };

    case "app_connect":
      return {
        kind: CaisraRowKind.Connector,
        provider: block.provider,
        label: block.name,
        connected: block.status === "connected",
        ...(block.description ? { line: block.description } : {}),
        ...(block.logo ? { logo: block.logo } : {}),
      };

    case "connect":
      // No provider id on this one, only what to show: the name, and the
      // monogram the block carries for a service with no mark.
      return {
        kind: CaisraRowKind.Connector,
        provider: block.name,
        label: block.name,
        connected: block.status === "connected",
        initial: block.initial,
        colour: block.color,
      };

    case "image":
    case "file":
      return {
        kind: CaisraRowKind.Attachment,
        artifactId: block.artifactId,
        name: block.name,
        mimeType: block.mimeType,
        ...("size" in block ? { size: block.size } : {}),
      };

    case "card":
      return { kind: CaisraRowKind.Card, lines: block.lines };

    case "answer_card":
      // Caisra's own kind, added to the contract because their `card` is
      // key/value lines and an openui-lang program had nowhere to travel.
      return { kind: CaisraRowKind.Answer, program: block.program };

    case "chart":
      return { kind: CaisraRowKind.Chart, block };

    case "computer":
      // The computer has its own panel beside the thread. A row here would say
      // the same thing twice.
      return null;

    default: {
      // Exhaustive by construction. A kind added upstream lands here and fails
      // the build, rather than vanishing from the thread at runtime.
      const unhandled: never = block;
      return unhandled;
    }
  }
}

/** Every row a message's blocks produce, in order, dropped ones omitted. */
export function caisraRowsFromBlocks(
  blocks: readonly MessageBlock[],
  names?: CaisraNames,
): CaisraRow[] {
  const rows: CaisraRow[] = [];
  for (const block of blocks) {
    const row = caisraRowFromBlock(block, names);
    if (row) rows.push(row);
  }
  return rows;
}

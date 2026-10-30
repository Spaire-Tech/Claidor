/**
 * "Iris just joined your team" (the founder, 30 October 2026): the card the
 * engine puts in the chat of an agent that hires another (CreateAgent,
 * `host/runner/tools/sand-agent-management-tools.ts`), which the apps draw
 * (JoinedCard.swift): the new agent's face standing on its own, what it does
 * in one short line, Go to Chat and View Profile. `content` says the same in
 * words for an app that does not draw the card yet: the apps show a card
 * they do not know by its `content`.
 */

import { say } from "../say.js";

/**
 * The line's longest, in characters (the founder: "make sure the … text to
 * never be long"): two lines on the iPhone's card at most. The model is
 * asked for 50; a longer one is cut here, at its first sentence or a word.
 */
export const JOINED_LINE_MAX = 64;

export interface AgentJoinedMessage {
  readonly type: "agent-joined";
  readonly agentId: string;
  readonly name: string;
  readonly line: string;
  readonly content: string;
}

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
}

/** What the agent does, for the card: its `summary`, else its description; one short sentence, never more than `JOINED_LINE_MAX`. */
export function joinedLine(summary: string | null | undefined, description: string | null | undefined): string {
  for (const source of [summary, description]) {
    const text = tidy(source ?? "");
    if (text.length === 0) continue;
    if (text.length <= JOINED_LINE_MAX) return text;
    const sentence = /^.+?[.!?。！？](?=\s|$)/u.exec(text)?.[0];
    if (sentence !== undefined && sentence.length <= JOINED_LINE_MAX) return sentence;
    const cut = text.slice(0, JOINED_LINE_MAX - 1);
    const space = cut.lastIndexOf(" ");
    return `${(space >= JOINED_LINE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/u, "")}…`;
  }
  return "";
}

/** The card's message, in the person's language. */
export function agentJoinedMessage(args: {
  readonly agentId: string;
  readonly name: string;
  readonly summary?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly language?: string | null | undefined;
}): AgentJoinedMessage {
  const line = joinedLine(args.summary, args.description);
  const title = say(args.language, "joined.title", { name: args.name });
  return { type: "agent-joined", agentId: args.agentId, name: args.name, line, content: line.length > 0 ? `${title}. ${line}` : title };
}

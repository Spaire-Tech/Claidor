import { AgentId } from '../agent/constants';

/**
 * Which conversation a side-card belongs to.
 *
 * Four kinds of card are held beside the messages rather than inside
 * them — the connector card, the ask-input card, the staffing card and
 * the roster card. Until 18 September none of them carried any idea of
 * whose turn raised it, so every one of them was drawn in every thread.
 * The founder, that day: *"the card appears in every single chat of
 * other agents. not right. should be per agents."*
 *
 * So a card belongs to the agent whose turn raised it. Main stamps that
 * on the ask before the card goes up; the renderer keeps it on the
 * pending card and draws only the open agent's.
 *
 * **A card with no agent goes to the main agent's thread**, not to all
 * of them. Main cannot always name the caller — see `soleActiveAgent`,
 * and the stdio MCP servers that raise these cards are registered once,
 * globally, with no session in their launch env — and an app built
 * before this change sends nothing at all. One thread that might be the
 * wrong one is a far smaller wrong than every thread, and main's is the
 * thread the app opens on, so a homeless card lands where somebody is
 * already looking.
 */
export interface CardAudience {
  /** The agent whose turn raised the card. Absent when main could not say. */
  agentId?: string;
}

/** The thread a card belongs in. Main's, when nobody said. */
export const cardAgentId = (card: CardAudience): string => card.agentId?.trim() || AgentId.Main;

export const cardBelongsToAgent = (card: CardAudience, openAgentId: string): boolean =>
  cardAgentId(card) === openAgentId;

/** The cards to draw beside the open agent's messages, in the order they arrived. */
export function cardsForAgent<T extends CardAudience>(
  cards: readonly T[],
  openAgentId: string,
): readonly T[] {
  return cards.filter(one => cardBelongsToAgent(one, openAgentId));
}

/**
 * The agent a tool call came from, when main can be sure of it.
 *
 * These cards arrive over the loopback bridge from a stdio MCP server
 * the gateway launched. That server is registered once for the whole
 * engine and its launch env is static config — the engine puts nothing
 * of the session or the agent into it — so the request itself cannot say
 * who called. What main does know is which turns are in flight, and a
 * tool only calls from inside a turn. One turn running means one
 * possible caller, and that is the agent the card belongs to.
 *
 * Two turns at once and it is a guess, so this says nothing rather than
 * guessing; the card then goes to main's thread. That is the honest
 * limit of this signal, and it is the same limit for an agent working in
 * the background as for one somebody is watching: what matters is how
 * many turns are running, not who is looking.
 */
export function soleActiveAgent(agentIds: readonly string[]): string | undefined {
  const distinct = new Set(agentIds.map(one => one.trim()).filter(Boolean));
  return distinct.size === 1 ? [...distinct][0] : undefined;
}

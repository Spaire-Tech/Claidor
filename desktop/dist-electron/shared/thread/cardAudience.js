"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardBelongsToAgent = exports.cardAgentId = void 0;
exports.cardsForAgent = cardsForAgent;
exports.soleActiveAgent = soleActiveAgent;
const constants_1 = require("../agent/constants");
/** The thread a card belongs in. Main's, when nobody said. */
const cardAgentId = (card) => card.agentId?.trim() || constants_1.AgentId.Main;
exports.cardAgentId = cardAgentId;
const cardBelongsToAgent = (card, openAgentId) => (0, exports.cardAgentId)(card) === openAgentId;
exports.cardBelongsToAgent = cardBelongsToAgent;
/** The cards to draw beside the open agent's messages, in the order they arrived. */
function cardsForAgent(cards, openAgentId) {
    return cards.filter(one => (0, exports.cardBelongsToAgent)(one, openAgentId));
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
function soleActiveAgent(agentIds) {
    const distinct = new Set(agentIds.map(one => one.trim()).filter(Boolean));
    return distinct.size === 1 ? [...distinct][0] : undefined;
}
//# sourceMappingURL=cardAudience.js.map
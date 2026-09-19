"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposedConnection = exports.connectorIds = exports.ProposeConnectorIpc = exports.ProposeConnectorBehavior = exports.PROPOSE_CONNECTOR_LIMITS = exports.PROPOSE_CONNECTOR_TIMEOUT_MS = exports.PROPOSE_CONNECTOR_ROUTE = exports.PROPOSE_CONNECTOR_MCP_SERVER = exports.PROPOSE_CONNECTOR_TOOL = void 0;
exports.parseProposeConnectorInput = parseProposeConnectorInput;
const catalog_1 = require("./catalog");
/**
 * An agent proposing a connector, from the conversation.
 *
 * **Why this exists.** The founder, 17 September 2026: "whenever an agent
 * is asked about a connector, or that he proposes a connector in the
 * chat, always put the design in onboarding of 'Notes — App access
 * requested — Not now — Allow access' … instead of allow access it'll be
 * install." Until then the brief told the agent to *say* a service was
 * not connected and *say where* to connect it, which sent the person to
 * the Apps screen to find the card themselves. Now the card comes to
 * them: the service's logo, its name, one line, Not now and Install.
 *
 * **It is the same Connect.** Install runs the exact flow the Apps
 * screen's Connect button runs (`useConnections`, the main-side connect
 * service): the browser sign-in, nothing typed. The tool blocks on the
 * outcome, like standing up an agent does, and is told plainly whether
 * the service is now connected, was declined, or failed.
 *
 * **Only the catalogue.** The tool names a connector by its id in
 * `CONNECTION_ITEMS`; anything else is refused with the list of ids, so
 * the agent cannot invent a service the app cannot connect.
 */
exports.PROPOSE_CONNECTOR_TOOL = 'propose_connector';
/** The name the gateway knows this MCP server by. */
exports.PROPOSE_CONNECTOR_MCP_SERVER = 'caisra-connectors';
/** The bridge route the tool posts to. */
exports.PROPOSE_CONNECTOR_ROUTE = '/propose-connector';
/**
 * How long the card waits. The sign-in opens the browser and the person
 * may take a while there; five minutes, like the other cards that wait.
 */
exports.PROPOSE_CONNECTOR_TIMEOUT_MS = 300_000;
exports.PROPOSE_CONNECTOR_LIMITS = {
    /** The agent's one line of why, shown under the service's own line. */
    reason: 160,
};
exports.ProposeConnectorBehavior = {
    /** The person pressed Install and the sign-in finished. */
    Connected: 'connected',
    /** They said not now, or the card timed out. */
    Declined: 'declined',
    /** They pressed Install and the sign-in did not go through. */
    Failed: 'failed',
};
/** Renderer ↔ main, for the card. */
exports.ProposeConnectorIpc = {
    /** main → renderer: draw the card. */
    Requested: 'proposeConnector:requested',
    /** main → renderer: the card is gone (timed out, or the turn ended). */
    Dismissed: 'proposeConnector:dismissed',
    /** renderer → main: connected, declined, or failed. */
    Respond: 'proposeConnector:respond',
};
const clean = (value, max) => (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim().slice(0, max);
/** Every id the tool may name, for the schema and the refusal. */
const connectorIds = () => catalog_1.CONNECTION_ITEMS.map(item => item.id);
exports.connectorIds = connectorIds;
/**
 * The tool's arguments, checked. A string back is the reason it was
 * refused, for the model.
 */
function parseProposeConnectorInput(raw) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : {};
    const connectionId = clean(input.connectionId, 64).toLowerCase();
    const reason = clean(input.reason, exports.PROPOSE_CONNECTOR_LIMITS.reason);
    if (!connectionId)
        return `A connectionId is required: one of ${(0, exports.connectorIds)().join(', ')}.`;
    if (!(0, catalog_1.findConnection)(connectionId)) {
        return `"${connectionId}" is not a connector this app can connect. Use one of: ${(0, exports.connectorIds)().join(', ')}.`;
    }
    return { connectionId, ...(reason ? { reason } : {}) };
}
/** The catalogue entry behind an ask. Present for anything that parsed. */
const proposedConnection = (ask) => (0, catalog_1.findConnection)(ask.connectionId);
exports.proposedConnection = proposedConnection;
//# sourceMappingURL=proposal.js.map
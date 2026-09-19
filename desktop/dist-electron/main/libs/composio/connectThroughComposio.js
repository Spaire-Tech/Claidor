"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPOSIO_POLL_INTERVAL_MS = exports.COMPOSIO_CONNECT_TIMEOUT_MS = void 0;
exports.connectThroughComposio = connectThroughComposio;
exports.disconnectThroughComposio = disconnectThroughComposio;
const catalog_1 = require("../../../shared/connections/catalog");
const connectService_1 = require("../connections/connectService");
/** Long enough to find the right account and type a password. */
exports.COMPOSIO_CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
exports.COMPOSIO_POLL_INTERVAL_MS = 2_000;
const say = (step, detail = '') => {
    console.log(`[Connections] ${step}${detail ? `: ${detail.trim()}` : ''}`);
};
const sleep = (ms) => new Promise(resolve => { setTimeout(resolve, ms); });
async function connectThroughComposio(item, deps) {
    const toolkit = (0, catalog_1.composioToolkit)(item);
    if (!toolkit) {
        return { outcome: connectService_1.ConnectOutcome.Unsupported, message: `${item.name} is not carried by Composio.` };
    }
    const wait = deps.wait ?? sleep;
    const interval = deps.pollIntervalMs ?? exports.COMPOSIO_POLL_INTERVAL_MS;
    const timeout = deps.timeoutMs ?? exports.COMPOSIO_CONNECT_TIMEOUT_MS;
    try {
        // Already there — a key typed on a computer that Composio already
        // knows. Nothing to open.
        if ((await deps.api.toolkitState(toolkit)).connected) {
            say(`composio ${toolkit} — already signed in`);
            return { outcome: connectService_1.ConnectOutcome.Connected };
        }
        const url = await deps.api.authorizationUrl(toolkit);
        say(`composio ${toolkit} — opening the sign-in link`);
        await deps.openExternal(url);
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            await wait(interval);
            if ((await deps.api.toolkitState(toolkit)).connected) {
                say(`composio ${toolkit} — connected`);
                return { outcome: connectService_1.ConnectOutcome.Connected };
            }
        }
        say(`composio ${toolkit} — nothing came back in ${Math.round(timeout / 1000)}s`);
        return { outcome: connectService_1.ConnectOutcome.Refused, message: `${item.name} was not connected.` };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        say(`composio ${toolkit} — failed`, message);
        return { outcome: connectService_1.ConnectOutcome.Failed, message };
    }
}
async function disconnectThroughComposio(item, api) {
    const toolkit = (0, catalog_1.composioToolkit)(item);
    if (!toolkit)
        throw new Error(`${item.name} is not carried by Composio.`);
    const removed = await api.disconnect(toolkit);
    say(`composio ${toolkit} — ${removed ? 'disconnected' : 'nothing to disconnect'}`);
}
//# sourceMappingURL=connectThroughComposio.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.takesComposioRoute = void 0;
exports.registerConnectionHandlers = registerConnectionHandlers;
const electron_1 = require("electron");
const catalog_1 = require("../../../shared/connections/catalog");
const constants_1 = require("../../../shared/connections/constants");
const composioApi_1 = require("../../libs/composio/composioApi");
const connectThroughComposio_1 = require("../../libs/composio/connectThroughComposio");
const callbackServer_1 = require("../../libs/connections/callbackServer");
const connectService_1 = require("../../libs/connections/connectService");
const openclawCli_1 = require("../../libs/connections/openclawCli");
/** The Composio route applies: a card Composio carries. */
const takesComposioRoute = (item) => !!(0, catalog_1.composioToolkit)(item);
exports.takesComposioRoute = takesComposioRoute;
function registerConnectionHandlers(deps) {
    const notReady = () => ({
        outcome: connectService_1.ConnectOutcome.Failed,
        message: 'The engine is not running yet. Try again in a moment.',
    });
    // One client per proxy address: the session it makes is good for as
    // long as the proxy is, and the proxy is up for the life of the app.
    let composio;
    const composioFor = (baseUrl) => {
        if (composio?.baseUrl !== baseUrl)
            composio = { baseUrl, api: (0, composioApi_1.createComposioApi)({ baseUrl }) };
        return composio.api;
    };
    electron_1.ipcMain.handle(constants_1.ConnectionsIpcChannel.Connect, async (_event, id) => {
        const item = (0, catalog_1.findConnection)(id);
        if (!item) {
            return { outcome: connectService_1.ConnectOutcome.Unsupported, message: 'No such service.' };
        }
        if ((0, exports.takesComposioRoute)(item)) {
            // No engine needed: the sign-in lives on Composio's side and the
            // agent reaches it through the extension, which talks to the
            // same proxy.
            const baseUrl = deps.composioBaseUrl();
            if (!baseUrl)
                return notReady();
            return (0, connectThroughComposio_1.connectThroughComposio)(item, {
                api: composioFor(baseUrl),
                openExternal: url => electron_1.shell.openExternal(url),
            });
        }
        const environment = deps.cliEnvironment();
        if (!environment)
            return notReady();
        try {
            return await (0, connectService_1.connectService)(item, {
                environment,
                writeServer: async (input) => {
                    await deps.writeServer(input);
                    // The sync has to finish before the login runs: `mcp login`
                    // reads openclaw.json to find the server, and a write that
                    // is still in our database is not yet in that file.
                    await deps.syncConfig('connection-added');
                },
                removeServer: async (name) => {
                    await deps.removeServer(name);
                    await deps.syncConfig('connection-removed');
                },
                listen: () => (0, callbackServer_1.listenForCallback)(),
                openExternal: url => electron_1.shell.openExternal(url),
                runCli: args => (0, openclawCli_1.runOpenClawCli)(environment, args),
            });
        }
        catch (error) {
            console.error('[Connections] connect failed:', error);
            return {
                outcome: connectService_1.ConnectOutcome.Failed,
                message: error instanceof Error ? error.message : `${item.name} was not connected.`,
            };
        }
    });
    electron_1.ipcMain.handle(constants_1.ConnectionsIpcChannel.Disconnect, async (_event, id) => {
        const item = (0, catalog_1.findConnection)(id);
        if (!item)
            return { success: false, error: 'No such service.' };
        if ((0, exports.takesComposioRoute)(item)) {
            const baseUrl = deps.composioBaseUrl();
            if (!baseUrl)
                return { success: false, error: notReady().message };
            try {
                await (0, connectThroughComposio_1.disconnectThroughComposio)(item, composioFor(baseUrl));
                return { success: true };
            }
            catch (error) {
                console.error('[Connections] composio disconnect failed:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'That could not be disconnected.',
                };
            }
        }
        const environment = deps.cliEnvironment();
        if (!environment)
            return { success: false, error: notReady().message };
        try {
            await (0, connectService_1.disconnectService)(item, {
                removeServer: async (name) => {
                    await deps.removeServer(name);
                    await deps.syncConfig('connection-removed');
                },
                runCli: args => (0, openclawCli_1.runOpenClawCli)(environment, args),
            });
            return { success: true };
        }
        catch (error) {
            console.error('[Connections] disconnect failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'That could not be disconnected.',
            };
        }
    });
}
//# sourceMappingURL=handlers.js.map
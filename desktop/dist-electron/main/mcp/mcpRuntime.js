"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpRuntime = void 0;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/askInput/constants");
const proposal_1 = require("../../shared/connections/proposal");
const constants_2 = require("../../shared/cowork/constants");
const constants_3 = require("../../shared/mcp/constants");
const constants_4 = require("../../shared/reactions/constants");
const constants_5 = require("../../shared/staffing/constants");
const roster_1 = require("../../shared/staffing/roster");
const computerUseKit_1 = require("../computerUse/computerUseKit");
const computerUseMcpServer_1 = require("../computerUse/computerUseMcpServer");
const computerUseRuntime_1 = require("../computerUse/computerUseRuntime");
const coworkUtil_1 = require("../libs/coworkUtil");
const mcpBridgeServer_1 = require("../libs/mcpBridgeServer");
const openclawConfigImpact_1 = require("../libs/openclawConfigImpact");
const openclawLocalSessionResolver_1 = require("../libs/openclawLocalSessionResolver");
const resolveStdioCommand_1 = require("../libs/resolveStdioCommand");
const mcpLaunchResolution_1 = require("./mcpLaunchResolution");
const mcpLaunchResolverManager_1 = require("./mcpLaunchResolverManager");
const mcpStore_1 = require("./mcpStore");
class McpRuntime {
    deps;
    mcpStore = null;
    launchResolverManager = null;
    bridgeServer = null;
    bridgeSecret = crypto_1.default.randomUUID();
    resolvedServersCache = [];
    mediaGenerationHandler = null;
    browserToolHandler = null;
    createAgentPerformer = null;
    constructor(deps) {
        this.deps = deps;
    }
    getStore() {
        if (!this.mcpStore) {
            const sqliteStore = this.deps.getStore();
            this.mcpStore = new mcpStore_1.McpStore(sqliteStore.getDatabase());
        }
        return this.mcpStore;
    }
    getLaunchResolverManager() {
        if (!this.launchResolverManager) {
            this.launchResolverManager = new mcpLaunchResolverManager_1.McpLaunchResolverManager(this.getStore(), () => this.broadcastServersChanged(), reason => {
                this.deps.syncOpenClawConfig({
                    reason,
                    expectedImpact: openclawConfigImpact_1.OpenClawConfigImpact.Restart,
                }).catch(err => console.error('[MCP] config sync error after launch resolution:', err));
            });
        }
        return this.launchResolverManager;
    }
    ensureLaunchResolution(serverId, reason) {
        this.getLaunchResolverManager().ensureResolved(serverId, reason);
    }
    setMediaGenerationHandler(handler) {
        this.mediaGenerationHandler = handler;
    }
    setBrowserToolHandler(handler) {
        this.browserToolHandler = handler;
        this.bridgeServer?.onBrowserTool(handler);
    }
    getAskUserCallbackUrl() {
        return this.bridgeServer?.askUserCallbackUrl ?? null;
    }
    getMediaCallbackUrl() {
        return this.bridgeServer?.mediaCallbackUrl ?? null;
    }
    getBrowserCallbackUrl() {
        return this.bridgeServer?.browserCallbackUrl ?? null;
    }
    getAskInputCallbackUrl() {
        return this.bridgeServer?.askInputCallbackUrl ?? null;
    }
    /** Where the `ReactToMessage` tool posts a tapback. */
    getReactCallbackUrl() {
        return this.bridgeServer?.reactCallbackUrl ?? null;
    }
    getCreateAgentCallbackUrl() {
        return this.bridgeServer?.createAgentCallbackUrl ?? null;
    }
    /** Who creates the agent once the person has pressed Stand up. */
    setCreateAgentPerformer(performer) {
        this.createAgentPerformer = performer;
        this.bridgeServer?.setCreateAgentPerformer(performer);
    }
    /** Stand up, or Not now, from the card. */
    resolveCreateAgent(requestId, answer) {
        this.bridgeServer?.resolveCreateAgent(requestId, answer);
    }
    getProposeTeamCallbackUrl() {
        return this.bridgeServer?.proposeTeamCallbackUrl ?? null;
    }
    /** Stand them up, Something else, or Not now, from the roster card. */
    resolveRoster(requestId, answer) {
        this.bridgeServer?.resolveRoster(requestId, answer);
    }
    getProposeConnectorCallbackUrl() {
        return this.bridgeServer?.proposeConnectorCallbackUrl ?? null;
    }
    /** Connected, declined, or failed, from the connector card. */
    resolveProposeConnector(requestId, answer) {
        this.bridgeServer?.resolveProposeConnector(requestId, answer);
    }
    getBridgeSecret() {
        return this.bridgeSecret;
    }
    getResolvedServersCache() {
        return this.resolvedServersCache;
    }
    async refreshResolvedServersCache() {
        this.resolvedServersCache = await this.getResolvedServers();
        return this.resolvedServersCache;
    }
    clearResolvedServersCache() {
        this.resolvedServersCache = [];
    }
    async startAskUserServer() {
        if (this.bridgeServer?.port)
            return;
        if (!this.bridgeServer) {
            this.bridgeServer = new mcpBridgeServer_1.McpBridgeServer(this.bridgeSecret);
        }
        console.log('[AskUser] starting HTTP callback server...');
        await this.bridgeServer.start();
        const resolveCallingAgentId = this.deps.resolveCallingAgentId;
        if (resolveCallingAgentId)
            this.bridgeServer.setCallingAgentResolver(resolveCallingAgentId);
        this.bridgeServer.onAskUser(request => {
            const sessionId = request.sessionKey
                ? (0, openclawLocalSessionResolver_1.resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey)(this.deps.getStore().getDatabase(), request.sessionKey)
                : constants_2.SESSION_AGNOSTIC_PERMISSION_SESSION_ID;
            if (!sessionId) {
                console.warn('[AskUser] denied request for non-desktop or unknown session:', request.sessionKey);
                this.resolveAskUser(request.requestId, { behavior: 'deny' });
                return;
            }
            const windows = electron_1.BrowserWindow.getAllWindows();
            windows.forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send('cowork:stream:permission', {
                        sessionId,
                        request: {
                            requestId: request.requestId,
                            toolName: constants_2.ASK_USER_QUESTION_TOOL_NAME,
                            toolInput: {
                                questions: request.questions,
                                ...(request.sessionKey ? { sessionKey: request.sessionKey } : {}),
                            },
                        },
                    });
                }
                catch (error) {
                    console.error('[AskUser] failed to send permission request to window:', error);
                }
            });
            this.deps.onAskUserRequested?.(sessionId, {
                requestId: request.requestId,
                toolName: constants_2.ASK_USER_QUESTION_TOOL_NAME,
            });
        });
        this.bridgeServer.onAskUserDismiss(requestId => {
            const windows = electron_1.BrowserWindow.getAllWindows();
            windows.forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send('cowork:stream:permissionDismiss', { requestId });
                }
                catch {
                    // ignore
                }
            });
            this.deps.onAskUserDismissed?.(requestId);
        });
        // A tapback from the agent. Routed by session like a question card:
        // the emoji goes on the person's newest message in the conversation
        // the tool was called from, and the renderer is told which
        // conversation that is. Nothing to put it on is an answer, not an
        // error.
        this.bridgeServer.onReact(request => {
            const sessionId = request.sessionKey
                ? (0, openclawLocalSessionResolver_1.resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey)(this.deps.getStore().getDatabase(), request.sessionKey)
                : null;
            const store = this.deps.getCoworkStore?.();
            if (!sessionId || !store) {
                return { behavior: 'nothing', reason: 'This conversation cannot take a reaction.' };
            }
            const session = store.getSession(sessionId, 0);
            const messageId = (0, constants_4.latestPersonMessageId)(store.getRecentConversationMessages(sessionId, 20));
            if (!session || !messageId) {
                return { behavior: 'nothing', reason: 'The person has not said anything yet.' };
            }
            const reaction = {
                conversationId: session.agentId,
                messageId,
                emoji: request.emoji,
                at: Date.now(),
            };
            const windows = electron_1.BrowserWindow.getAllWindows();
            if (windows.length === 0) {
                return { behavior: 'nothing', reason: 'The app is not showing the conversation.' };
            }
            windows.forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(constants_4.ReactionIpc.Agent, reaction);
                }
                catch (error) {
                    console.error('[Reaction] failed to send to window:', error);
                }
            });
            return { behavior: 'reacted' };
        });
        // The card that asks the person to type something. Sent to every
        // window rather than routed by session: unlike a question card this
        // is not about a conversation's content, it is a person being asked
        // for a password, and it must reach whatever window they are looking
        // at. Which *thread* it is drawn in is the `agentId` the bridge
        // stamped on it, which every window then honours.
        this.bridgeServer.onAskInput(request => {
            const windows = electron_1.BrowserWindow.getAllWindows();
            if (windows.length === 0) {
                // Nowhere to draw it. Declining is the only honest answer; the
                // agent's turn would otherwise sit waiting for five minutes.
                console.warn('[AskInput] no window open, declining');
                this.resolveAskInput(request.requestId, { behavior: constants_1.AskInputBehavior.Decline });
                return;
            }
            windows.forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(constants_1.AskInputIpc.Requested, request);
                }
                catch (error) {
                    console.error('[AskInput] failed to send request to window:', error);
                }
            });
        });
        this.bridgeServer.onAskInputDismiss(requestId => {
            electron_1.BrowserWindow.getAllWindows().forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(constants_1.AskInputIpc.Dismissed, { requestId });
                }
                catch {
                    // The window is going away; the card goes with it.
                }
            });
        });
        // The card asking whether to stand up an agent. Every window, like
        // ask-input: it is a person being asked, wherever they are looking —
        // and in the thread of the agent that asked.
        this.bridgeServer.onCreateAgent(ask => {
            const windows = electron_1.BrowserWindow.getAllWindows();
            if (windows.length === 0) {
                console.warn('[CreateAgent] no window open, declining');
                this.resolveCreateAgent(ask.requestId, { behavior: constants_5.CreateAgentBehavior.Decline });
                return;
            }
            windows.forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(constants_5.CreateAgentIpc.Requested, ask);
                }
                catch (error) {
                    console.error('[CreateAgent] failed to send request to window:', error);
                }
            });
        });
        this.bridgeServer.onCreateAgentDismiss(requestId => {
            electron_1.BrowserWindow.getAllWindows().forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(constants_5.CreateAgentIpc.Dismissed, { requestId });
                }
                catch {
                    // The window is going away; the card goes with it.
                }
            });
        });
        // The roster card, "Your starter team". Every window, like the two
        // cards above.
        this.bridgeServer.onRoster(ask => {
            const windows = electron_1.BrowserWindow.getAllWindows();
            if (windows.length === 0) {
                console.warn('[Roster] no window open, declining');
                this.resolveRoster(ask.requestId, { behavior: roster_1.RosterBehavior.Decline });
                return;
            }
            windows.forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(roster_1.RosterIpc.Requested, ask);
                }
                catch (error) {
                    console.error('[Roster] failed to send request to window:', error);
                }
            });
        });
        this.bridgeServer.onRosterDismiss(requestId => {
            electron_1.BrowserWindow.getAllWindows().forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(roster_1.RosterIpc.Dismissed, { requestId });
                }
                catch {
                    // The window is going away; the card goes with it.
                }
            });
        });
        // The connector card ("App access requested", with Install). Every
        // window, like the cards above; the renderer runs the sign-in.
        this.bridgeServer.onProposeConnector(ask => {
            const windows = electron_1.BrowserWindow.getAllWindows();
            if (windows.length === 0) {
                console.warn('[ProposeConnector] no window open, declining');
                this.resolveProposeConnector(ask.requestId, { behavior: proposal_1.ProposeConnectorBehavior.Declined });
                return;
            }
            windows.forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(proposal_1.ProposeConnectorIpc.Requested, ask);
                }
                catch (error) {
                    console.error('[ProposeConnector] failed to send request to window:', error);
                }
            });
        });
        this.bridgeServer.onProposeConnectorDismiss(requestId => {
            electron_1.BrowserWindow.getAllWindows().forEach(win => {
                if (win.isDestroyed())
                    return;
                try {
                    win.webContents.send(proposal_1.ProposeConnectorIpc.Dismissed, { requestId });
                }
                catch {
                    // The window is going away; the card goes with it.
                }
            });
        });
        if (this.createAgentPerformer) {
            this.bridgeServer.setCreateAgentPerformer(this.createAgentPerformer);
        }
        this.bridgeServer.onMediaGeneration(async (request) => {
            if (!this.mediaGenerationHandler) {
                return {
                    content: [{ type: 'text', text: 'Media generation service is not ready yet.' }],
                    isError: true,
                };
            }
            return await this.mediaGenerationHandler(request);
        });
        if (this.browserToolHandler) {
            this.bridgeServer.onBrowserTool(this.browserToolHandler);
        }
    }
    async askUserInternal(questions, timeoutMs, options) {
        if (!this.bridgeServer)
            return null;
        return await this.bridgeServer.askUserInternal(questions, timeoutMs, options);
    }
    resolveAskUser(requestId, response) {
        this.bridgeServer?.resolveAskUser(requestId, response);
    }
    /** Hand a waiting tool what the person typed into the card. */
    resolveAskInput(requestId, response) {
        this.bridgeServer?.resolveAskInput(requestId, response);
    }
    broadcastServersChanged() {
        const windows = electron_1.BrowserWindow.getAllWindows();
        windows.forEach(win => {
            if (win.isDestroyed())
                return;
            try {
                win.webContents.send(constants_3.McpIpcChannel.Changed);
            }
            catch {
                // ignore destroyed windows
            }
        });
    }
    async getResolvedServers() {
        const startedAt = Date.now();
        const enabledServers = this.getStore().getEnabledServers();
        const resolved = [];
        let optimizedCount = 0;
        let skippedCount = 0;
        let rawCount = 0;
        let builtInCount = 0;
        const electronPath = (0, coworkUtil_1.getElectronNodeRuntimePath)();
        const npmBinDir = electron_1.app.isPackaged
            ? path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'npm', 'bin')
            : '';
        const buildShimEnv = () => {
            const shimEnv = {
                LOBSTERAI_ELECTRON_PATH: electronPath,
            };
            if (npmBinDir) {
                shimEnv.LOBSTERAI_NPM_BIN_DIR = npmBinDir;
            }
            return shimEnv;
        };
        const pushRawStdioServer = async (server) => {
            const r = await (0, resolveStdioCommand_1.resolveStdioCommand)(server);
            resolved.push({
                name: server.name,
                transportType: 'stdio',
                command: r.command,
                args: r.args,
                env: { ...buildShimEnv(), ...(r.env || {}) },
            });
        };
        for (const server of enabledServers) {
            if (server.transportType === 'stdio') {
                const launchResolver = this.getLaunchResolverManager();
                if (launchResolver.canOptimize(server)) {
                    const readyResolution = launchResolver.getReadyResolution(server);
                    if (readyResolution) {
                        optimizedCount++;
                        const shimEnv = {
                            LOBSTERAI_ELECTRON_PATH: electronPath,
                        };
                        if (npmBinDir) {
                            shimEnv.LOBSTERAI_NPM_BIN_DIR = npmBinDir;
                        }
                        resolved.push({
                            name: server.name,
                            transportType: 'stdio',
                            command: readyResolution.command,
                            args: readyResolution.args || [],
                            env: { ...shimEnv, ...(readyResolution.env || {}), ...(server.env || {}) },
                        });
                        continue;
                    }
                    const fingerprint = (0, mcpLaunchResolution_1.createMcpLaunchSourceFingerprint)(server);
                    const status = server.launchResolution?.sourceFingerprint === fingerprint
                        ? server.launchResolution.status
                        : mcpLaunchResolution_1.McpLaunchResolutionStatus.Pending;
                    if (status === mcpLaunchResolution_1.McpLaunchResolutionStatus.Failed
                        && launchResolver.shouldStartResolution(server, status)) {
                        skippedCount++;
                        console.log(`[MCP] retrying stdio server "${server.name}" after recoverable managed launch resolution failure`);
                        this.ensureLaunchResolution(server.id, 'config-sync:recoverable-failed');
                        continue;
                    }
                    if (status === mcpLaunchResolution_1.McpLaunchResolutionStatus.Unsupported
                        || status === mcpLaunchResolution_1.McpLaunchResolutionStatus.Failed) {
                        rawCount++;
                        if (status === mcpLaunchResolution_1.McpLaunchResolutionStatus.Failed) {
                            console.warn(`[MCP] using raw stdio command for server "${server.name}" because managed launch resolution failed`);
                        }
                        await pushRawStdioServer(server);
                        continue;
                    }
                    skippedCount++;
                    console.log(`[MCP] skipping stdio server "${server.name}" while managed launch resolution is ${status}`);
                    if (launchResolver.shouldStartResolution(server, status)) {
                        this.ensureLaunchResolution(server.id, `config-sync:${status}`);
                    }
                    continue;
                }
                rawCount++;
                await pushRawStdioServer(server);
            }
            else {
                resolved.push({
                    name: server.name,
                    transportType: server.transportType,
                    url: server.url,
                    headers: server.headers,
                    auth: server.auth,
                    oauthScope: server.oauthScope,
                });
            }
        }
        const askUserCallbackUrl = this.getAskUserCallbackUrl();
        const shouldEnableComputerUse = askUserCallbackUrl !== null
            && (0, computerUseKit_1.isComputerUseKitInstalled)(this.deps.getStore());
        if (shouldEnableComputerUse) {
            const installResult = await (0, computerUseRuntime_1.installComputerUseRuntime)();
            if (!installResult.success) {
                console.warn(`[MCP] failed to install Computer Use runtime: ${installResult.error || 'unknown error'}`);
            }
        }
        const computerUseServer = shouldEnableComputerUse
            ? (0, computerUseMcpServer_1.resolveComputerUseMcpServer)({
                askUserCallbackUrl,
                bridgeSecret: this.bridgeSecret,
                electronNodePath: electronPath,
            })
            : null;
        if (computerUseServer) {
            resolved.push(computerUseServer);
            builtInCount++;
        }
        console.log(`[MCP] resolved ${resolved.length}/${enabledServers.length} enabled server(s) for OpenClaw in ${Date.now() - startedAt}ms; optimized=${optimizedCount}, raw=${rawCount}, skipped=${skippedCount}, builtIn=${builtInCount}`);
        return resolved;
    }
}
exports.McpRuntime = McpRuntime;
//# sourceMappingURL=mcpRuntime.js.map
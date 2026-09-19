"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpBridgeServer = void 0;
/**
 * McpBridgeServer — authenticated loopback callbacks shared by OpenClaw integrations.
 *
 * Provides AskUser, media-generation, and in-app browser endpoints. Binds to
 * 127.0.0.1 only and requires the per-process bridge secret.
 */
const crypto_1 = __importDefault(require("crypto"));
const http_1 = __importDefault(require("http"));
const net_1 = __importDefault(require("net"));
const sanitizeForLog_1 = require("./sanitizeForLog");
const log = (level, msg) => {
    const formatted = `[McpBridge:HTTP][${level}] ${msg}`;
    if (level === 'ERROR') {
        console.error(formatted);
    }
    else if (level === 'WARN') {
        console.warn(formatted);
    }
    else if (level === 'DEBUG') {
        console.debug(formatted);
    }
    else {
        console.log(formatted);
    }
};
const constants_1 = require("../../shared/askInput/constants");
const proposal_1 = require("../../shared/connections/proposal");
const constants_2 = require("../../shared/reactions/constants");
const constants_3 = require("../../shared/staffing/constants");
const roster_1 = require("../../shared/staffing/roster");
const strongs_1 = require("../../shared/staffing/strongs");
class McpBridgeServer {
    server = null;
    _port = null;
    secret;
    pendingAskUser = new Map();
    onAskUserCallback = null;
    onAskInputCallback = null;
    onAskInputDismissCallback = null;
    pendingAskInput = new Map();
    onReactCallback = null;
    onCreateAgentCallback = null;
    onCreateAgentDismissCallback = null;
    createAgentPerformer = null;
    pendingCreateAgent = new Map();
    onRosterCallback = null;
    onRosterDismissCallback = null;
    pendingRoster = new Map();
    onProposeConnectorCallback = null;
    onProposeConnectorDismissCallback = null;
    pendingProposeConnector = new Map();
    onAskUserDismissCallback = null;
    onMediaGenerationCallback = null;
    onBrowserToolCallback = null;
    callingAgentResolver = null;
    constructor(secret) {
        this.secret = secret;
        log('INFO', `McpBridgeServer created, secret prefix="${secret.slice(0, 8)}…"`);
    }
    get port() {
        return this._port;
    }
    get askUserCallbackUrl() {
        return this._port ? `http://127.0.0.1:${this._port}/askuser` : null;
    }
    get mediaCallbackUrl() {
        return this._port ? `http://127.0.0.1:${this._port}/media-generation/tool` : null;
    }
    get browserCallbackUrl() {
        return this._port ? `http://127.0.0.1:${this._port}/browser/tool` : null;
    }
    /**
     * Register a callback that fires when an AskUserQuestion request arrives.
     * The callback should show a modal and eventually call resolveAskUser().
     */
    onAskUser(callback) {
        this.onAskUserCallback = callback;
    }
    /**
     * Register a callback that fires when an AskUser request is dismissed (timeout or resolved).
     * The callback should close the modal in the renderer.
     */
    onAskUserDismiss(callback) {
        this.onAskUserDismissCallback = callback;
    }
    get askInputCallbackUrl() {
        return this._port ? `http://127.0.0.1:${this._port}${constants_1.ASK_INPUT_ROUTE}` : null;
    }
    /**
     * Register a callback that fires when the agent asks the person to type
     * something — a password, a code, the fields of a login form.
     */
    onAskInput(callback) {
        this.onAskInputCallback = callback;
    }
    /** Fires when a card should come off the screen: timed out, or answered. */
    onAskInputDismiss(callback) {
        this.onAskInputDismissCallback = callback;
    }
    /**
     * Hand a waiting tool what the person typed.
     *
     * The values go from here straight back over the loopback socket to the
     * tool that asked. They are never logged: `describeResponse` is what
     * goes in the log line, and it counts fields rather than naming values.
     */
    resolveAskInput(requestId, response) {
        const pending = this.pendingAskInput.get(requestId);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pendingAskInput.delete(requestId);
        log('INFO', `AskInput resolved, requestId=${requestId} ${(0, constants_1.describeResponse)(response)}`);
        pending.resolve(response);
    }
    get reactCallbackUrl() {
        return this._port ? `http://127.0.0.1:${this._port}${constants_2.REACT_ROUTE}` : null;
    }
    /**
     * The agent putting an emoji on the person's message. Nothing waits:
     * the callback says where it landed, or why nowhere, and the tool is
     * told that at once.
     */
    onReact(callback) {
        this.onReactCallback = callback;
    }
    get createAgentCallbackUrl() {
        return this._port ? `http://127.0.0.1:${this._port}${constants_3.CREATE_AGENT_ROUTE}` : null;
    }
    /**
     * Standing up an agent, in three parts: the card (`onCreateAgent`,
     * `resolveCreateAgent`), what happens once the person has said yes
     * (`setCreateAgentPerformer`), and the card coming down
     * (`onCreateAgentDismiss`). The tool waits on the whole of it.
     */
    onCreateAgent(callback) {
        this.onCreateAgentCallback = callback;
    }
    onCreateAgentDismiss(callback) {
        this.onCreateAgentDismissCallback = callback;
    }
    setCreateAgentPerformer(performer) {
        this.createAgentPerformer = performer;
    }
    resolveCreateAgent(requestId, answer) {
        const pending = this.pendingCreateAgent.get(requestId);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pendingCreateAgent.delete(requestId);
        log('INFO', `CreateAgent answered, requestId=${requestId} behavior=${answer.behavior}`);
        pending.resolve(answer);
    }
    get proposeTeamCallbackUrl() {
        return this._port ? `http://127.0.0.1:${this._port}${roster_1.PROPOSE_TEAM_ROUTE}` : null;
    }
    /**
     * The roster card ("Your starter team"). The card (`onRoster`,
     * `resolveRoster`) and its coming down (`onRosterDismiss`); standing
     * the agents up reuses the create-agent performer, because Stand them
     * up is the person's yes for every row on the card.
     */
    onRoster(callback) {
        this.onRosterCallback = callback;
    }
    onRosterDismiss(callback) {
        this.onRosterDismissCallback = callback;
    }
    get proposeConnectorCallbackUrl() {
        return this._port ? `http://127.0.0.1:${this._port}${proposal_1.PROPOSE_CONNECTOR_ROUTE}` : null;
    }
    /**
     * The connector card ("App access requested", with Install). The card
     * (`onProposeConnector`, `resolveProposeConnector`) and its coming down
     * (`onProposeConnectorDismiss`). Unlike standing up an agent there is
     * no performer here: the renderer owns the connect flow (it is the
     * Apps screen's own Connect), runs it on Install, and answers with the
     * outcome. The tool waits on the whole of it.
     */
    onProposeConnector(callback) {
        this.onProposeConnectorCallback = callback;
    }
    onProposeConnectorDismiss(callback) {
        this.onProposeConnectorDismissCallback = callback;
    }
    resolveProposeConnector(requestId, answer) {
        const pending = this.pendingProposeConnector.get(requestId);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pendingProposeConnector.delete(requestId);
        log('INFO', `ProposeConnector answered, requestId=${requestId} behavior=${answer.behavior}`);
        pending.resolve(answer);
    }
    resolveRoster(requestId, answer) {
        const pending = this.pendingRoster.get(requestId);
        if (!pending)
            return;
        const checked = (0, roster_1.checkRosterAnswer)(answer, pending.ask);
        if (typeof checked === 'string') {
            // Our own renderer sent something the card cannot mean. Say so and
            // leave the card up rather than guess.
            log('WARN', `Roster answer refused, requestId=${requestId}: ${checked}`);
            return;
        }
        clearTimeout(pending.timer);
        this.pendingRoster.delete(requestId);
        log('INFO', `Roster answered, requestId=${requestId} behavior=${checked.behavior}${checked.behavior === roster_1.RosterBehavior.StandUp ? ` slugs=${checked.slugs.join(',')}` : ''}`);
        pending.resolve(checked);
    }
    /**
     * Register a callback for media generation tool requests.
     * The callback should call lobsterai-server and return the result.
     */
    onMediaGeneration(callback) {
        this.onMediaGenerationCallback = callback;
    }
    onBrowserTool(callback) {
        this.onBrowserToolCallback = callback;
    }
    /**
     * Who to put the card on.
     *
     * Every card this bridge raises belongs to one conversation — the
     * founder, 18 September: *"should be per agents"* — and the request
     * that raises it cannot say which. The MCP servers behind these routes
     * are registered once for the whole engine and launched with a static
     * env, so nothing of the session reaches them. What the app knows is
     * which turns are running, and a tool only calls from inside one. The
     * resolver is asked at the moment the card goes up, not before, so it
     * is answering about the turn that is calling right now.
     */
    setCallingAgentResolver(resolver) {
        this.callingAgentResolver = resolver;
    }
    /** The agent to stamp on a card, or nothing, which means main's thread. */
    raisingAgent() {
        try {
            const agentId = this.callingAgentResolver?.()?.trim();
            return agentId ? { agentId } : {};
        }
        catch (error) {
            // A card in one thread too few is a bug; a card that never appears
            // because looking up its thread threw is a stuck turn.
            log('WARN', `Calling agent could not be resolved: ${error instanceof Error ? error.message : String(error)}`);
            return {};
        }
    }
    /**
     * Resolve a pending AskUserQuestion request (called when user clicks in the modal).
     */
    resolveAskUser(requestId, response) {
        const pending = this.pendingAskUser.get(requestId);
        if (!pending)
            return;
        clearTimeout(pending.timer);
        this.pendingAskUser.delete(requestId);
        pending.resolve(response);
    }
    /**
     * Programmatic ask-user request from within the main process.
     * Reuses the same pending/resolve/callback infrastructure as the HTTP endpoint
     * but skips HTTP and authentication.
     */
    async askUserInternal(questions, timeoutMs = 120_000, options = {}) {
        const requestId = crypto_1.default.randomUUID();
        const sessionKey = options.sessionKey?.trim() || undefined;
        log('INFO', `AskUser (internal) request, requestId=${requestId}`);
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                log('INFO', `AskUser (internal) timeout, requestId=${requestId}`);
                this.pendingAskUser.delete(requestId);
                this.onAskUserDismissCallback?.(requestId);
                resolve({ behavior: 'deny' });
            }, timeoutMs);
            this.pendingAskUser.set(requestId, { requestId, resolve, timer });
            if (this.onAskUserCallback) {
                this.onAskUserCallback({ requestId, questions, sessionKey });
            }
            else {
                log('WARN', 'AskUser callback not registered, denying (internal)');
                clearTimeout(timer);
                this.pendingAskUser.delete(requestId);
                resolve({ behavior: 'deny' });
            }
        });
    }
    /**
     * Start the HTTP callback server on a free port.
     */
    async start() {
        if (this.server) {
            throw new Error('McpBridgeServer is already running');
        }
        const port = await this.findFreePort();
        return new Promise((resolve, reject) => {
            const srv = http_1.default.createServer((req, res) => {
                this.handleRequest(req, res).catch((err) => {
                    log('ERROR', `Unhandled error in handleRequest: ${err instanceof Error ? err.message : String(err)}`);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Internal server error' }));
                    }
                });
            });
            srv.on('error', (err) => {
                log('ERROR', `HTTP server error: ${err.message}`);
                reject(err);
            });
            srv.listen(port, '127.0.0.1', () => {
                this._port = port;
                this.server = srv;
                log('INFO', `McpBridgeServer listening on http://127.0.0.1:${port}`);
                resolve(port);
            });
        });
    }
    /**
     * Stop the HTTP callback server.
     */
    async stop() {
        if (!this.server)
            return;
        return new Promise((resolve) => {
            this.server.close(() => {
                log('INFO', 'McpBridgeServer stopped');
                this.server = null;
                this._port = null;
                resolve();
            });
            // Force-close open connections after a short timeout
            setTimeout(() => {
                this.server?.closeAllConnections?.();
            }, 2000);
        });
    }
    async handleRequest(req, res) {
        log('DEBUG', `HTTP ${req.method} ${req.url}`);
        if (req.method !== 'POST') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }
        // Verify secret token (accept any of the known header name for backwards compats)
        const authHeader = req.headers['x-mcp-bridge-secret'] || req.headers['x-ask-user-secret'] || req.headers['x-lobster-media-secret'];
        if (authHeader !== this.secret) {
            log('WARN', `Auth rejected for ${req.url}: header=${authHeader ? 'present-but-mismatch' : 'missing'}`);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }
        if (req.url?.startsWith('/askuser')) {
            await this.handleAskUser(req, res);
            return;
        }
        if (req.url?.startsWith(constants_1.ASK_INPUT_ROUTE)) {
            await this.handleAskInput(req, res);
            return;
        }
        if (req.url?.startsWith(constants_2.REACT_ROUTE)) {
            await this.handleReact(req, res);
            return;
        }
        if (req.url?.startsWith(constants_3.CREATE_AGENT_ROUTE)) {
            await this.handleCreateAgent(req, res);
            return;
        }
        if (req.url?.startsWith(roster_1.PROPOSE_TEAM_ROUTE)) {
            await this.handleProposeTeam(req, res);
            return;
        }
        if (req.url?.startsWith(proposal_1.PROPOSE_CONNECTOR_ROUTE)) {
            await this.handleProposeConnector(req, res);
            return;
        }
        if (req.url?.startsWith('/media-generation/tool')) {
            await this.handleMediaGeneration(req, res);
            return;
        }
        if (req.url?.startsWith('/browser/tool')) {
            await this.handleBrowserTool(req, res);
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
    async handleAskUser(req, res) {
        const ASKUSER_TIMEOUT_MS = 120_000;
        try {
            const body = await this.readBody(req);
            const input = JSON.parse(body);
            const sessionKey = typeof input.sessionKey === 'string' && input.sessionKey.trim()
                ? input.sessionKey.trim()
                : undefined;
            log('INFO', `AskUser request received, questions=${Array.isArray(input.questions) ? input.questions.length : 0}`);
            if (!Array.isArray(input.questions) || input.questions.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing or empty "questions" field' }));
                return;
            }
            const requestId = crypto_1.default.randomUUID();
            log('INFO', `AskUser waiting for user response, requestId=${requestId}`);
            // Create a Promise that resolves when the user responds or timeout
            const userResponse = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    log('INFO', `AskUser timeout, requestId=${requestId}`);
                    this.pendingAskUser.delete(requestId);
                    this.onAskUserDismissCallback?.(requestId);
                    resolve({ behavior: 'deny' });
                }, ASKUSER_TIMEOUT_MS);
                this.pendingAskUser.set(requestId, { requestId, resolve, timer });
                // Notify LobsterAI to show the modal
                if (this.onAskUserCallback) {
                    this.onAskUserCallback({
                        requestId,
                        sessionKey,
                        questions: input.questions,
                    });
                }
                else {
                    log('WARN', 'AskUser callback not registered, denying');
                    clearTimeout(timer);
                    this.pendingAskUser.delete(requestId);
                    resolve({ behavior: 'deny' });
                }
            });
            log('INFO', `AskUser resolved, requestId=${requestId} behavior=${userResponse.behavior}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(userResponse));
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log('ERROR', `AskUser request error: ${errMsg}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ behavior: 'deny' }));
        }
    }
    /**
     * A card asking the person to type something.
     *
     * Nothing about the request is logged beyond how many fields it has and
     * which of them are masked. The prompt may name a service; the values
     * never appear here at all.
     */
    /**
     * A tool asking to stand up an agent.
     *
     * The card goes up and the request waits on the answer, like a file
     * access does: the tool is blocked inside its turn. On Stand up, the
     * performer creates the agent and the tool is told its id; on Not now,
     * or after five minutes, the tool is told the person declined. Nothing
     * is created without the press.
     */
    /**
     * A tapback from the `ReactToMessage` tool. The emoji is checked, the
     * session key handed on with it, and whoever registered `onReact`
     * decides where it lands. No card, no waiting.
     */
    async handleReact(req, res) {
        const answer = (status, result) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        };
        try {
            const body = await this.readBody(req);
            const raw = JSON.parse(body);
            const parsed = (0, constants_2.parseReactInput)(raw);
            if (typeof parsed === 'string') {
                answer(400, { behavior: 'nothing', reason: parsed });
                return;
            }
            const sessionKey = raw && typeof raw === 'object' && typeof raw.sessionKey === 'string'
                ? raw.sessionKey.trim() || undefined
                : undefined;
            if (!this.onReactCallback) {
                answer(200, { behavior: 'nothing', reason: 'The app is not showing the conversation.' });
                return;
            }
            const result = this.onReactCallback({ emoji: parsed.emoji, ...(sessionKey ? { sessionKey } : {}) });
            log('INFO', `React ${result.behavior} emoji=${(0, sanitizeForLog_1.serializeForLog)(parsed.emoji)} sessionKey=${sessionKey?.slice(0, 30) ?? ''}`);
            answer(200, result);
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log('ERROR', `React request error: ${errMsg}`);
            answer(500, { behavior: 'nothing', reason: 'The request could not be read.' });
        }
    }
    async handleCreateAgent(req, res) {
        const answer = (status, result) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        };
        try {
            const body = await this.readBody(req);
            const parsed = (0, constants_3.parseCreateAgentInput)(JSON.parse(body));
            if (typeof parsed === 'string') {
                answer(400, { behavior: 'failed', reason: parsed });
                return;
            }
            if (!this.onCreateAgentCallback || !this.createAgentPerformer) {
                // No window to draw the card in, or nobody to create the agent.
                // Declining is the only honest answer; the tool's turn would
                // otherwise sit waiting.
                log('WARN', 'CreateAgent callback or performer not registered, declining');
                answer(200, { behavior: 'declined' });
                return;
            }
            const requestId = crypto_1.default.randomUUID();
            const audience = this.raisingAgent();
            log('INFO', `CreateAgent request, requestId=${requestId} name=${(0, sanitizeForLog_1.serializeForLog)(parsed.name)} agentId=${audience.agentId ?? ''}`);
            const decision = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    log('INFO', `CreateAgent timeout, requestId=${requestId}`);
                    this.pendingCreateAgent.delete(requestId);
                    this.onCreateAgentDismissCallback?.(requestId);
                    resolve({ behavior: constants_3.CreateAgentBehavior.Decline });
                }, constants_3.CREATE_AGENT_TIMEOUT_MS);
                this.pendingCreateAgent.set(requestId, { requestId, resolve, timer });
                this.onCreateAgentCallback?.({ requestId, ...parsed, ...audience });
            });
            if (decision.behavior !== constants_3.CreateAgentBehavior.Allow) {
                answer(200, { behavior: 'declined' });
                return;
            }
            try {
                const created = await this.createAgentPerformer(parsed);
                log('INFO', `CreateAgent created, requestId=${requestId} agentId=${created.agentId}`);
                answer(200, { behavior: 'created', agentId: created.agentId, name: created.name });
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                log('ERROR', `CreateAgent failed, requestId=${requestId}: ${reason}`);
                answer(200, { behavior: 'failed', reason });
            }
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log('ERROR', `CreateAgent request error: ${errMsg}`);
            answer(500, { behavior: 'failed', reason: 'The request could not be read.' });
        }
    }
    /**
     * The roster card, from the `propose_team` tool.
     *
     * The card is built here from the founder's table and the twenty-three
     * (`buildRoster`), goes up, and the request waits on it. Stand them up
     * stands every checked row up through the create-agent performer, one
     * after another, and the tool is told who is in and who is not.
     * Something else and Not now come back as decisions.
     */
    async handleProposeTeam(req, res) {
        const answer = (status, result) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        };
        try {
            const body = await this.readBody(req);
            const parsed = (0, roster_1.parseProposeTeamInput)(JSON.parse(body));
            if (typeof parsed === 'string') {
                answer(400, { behavior: 'failed', reason: parsed });
                return;
            }
            const roster = (0, roster_1.buildRoster)(parsed);
            if (typeof roster === 'string') {
                answer(400, { behavior: 'failed', reason: roster });
                return;
            }
            if (!this.onRosterCallback || !this.createAgentPerformer) {
                log('WARN', 'Roster callback or performer not registered, declining');
                answer(200, { behavior: 'declined' });
                return;
            }
            const requestId = crypto_1.default.randomUUID();
            // In practice this is always the main agent — the roster is step two
            // of onboarding and Yodo raises it — but it is stamped like every
            // other card rather than assumed, so a role agent that reaches for
            // `propose_team` puts the card in its own thread and not in his.
            const ask = { requestId, ...roster, ...this.raisingAgent() };
            log('INFO', `Roster request, requestId=${requestId} workType=${(0, sanitizeForLog_1.serializeForLog)(ask.workType)} team=${ask.team.map(one => one.slug).join(',')} agentId=${ask.agentId ?? ''}`);
            const decision = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    log('INFO', `Roster timeout, requestId=${requestId}`);
                    this.pendingRoster.delete(requestId);
                    this.onRosterDismissCallback?.(requestId);
                    resolve({ behavior: roster_1.RosterBehavior.Decline });
                }, roster_1.PROPOSE_TEAM_TIMEOUT_MS);
                this.pendingRoster.set(requestId, { requestId, ask, resolve, timer });
                this.onRosterCallback?.(ask);
            });
            if (decision.behavior === roster_1.RosterBehavior.Decline) {
                answer(200, { behavior: 'declined' });
                return;
            }
            if (decision.behavior === roster_1.RosterBehavior.SomethingElse) {
                answer(200, { behavior: 'somethingElse', text: decision.text });
                return;
            }
            const agents = [];
            const failed = [];
            for (const slug of decision.slugs) {
                const strong = (0, strongs_1.strongBySlug)(slug);
                if (!strong)
                    continue;
                try {
                    const created = await this.createAgentPerformer((0, roster_1.briefOf)(strong));
                    log('INFO', `Roster stood up, requestId=${requestId} slug=${slug} agentId=${created.agentId}`);
                    agents.push({ slug, name: created.name, agentId: created.agentId });
                }
                catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    log('ERROR', `Roster failed to stand up, requestId=${requestId} slug=${slug}: ${reason}`);
                    failed.push({ slug, name: strong.name, reason });
                }
            }
            answer(200, { behavior: 'stoodUp', agents, failed });
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log('ERROR', `Roster request error: ${errMsg}`);
            answer(500, { behavior: 'failed', reason: 'The request could not be read.' });
        }
    }
    /**
     * The connector card, from the `propose_connector` tool.
     *
     * The id is checked against the catalogue here, so the agent cannot
     * put up a card for a service the app cannot connect. The card goes up
     * and the request waits on it. Install is run by the renderer — the
     * same Connect the Apps screen runs — and what it answers is what the
     * tool is told: connected, with the service's name; declined, which
     * is also what a timeout means; or failed, with a sentence.
     */
    async handleProposeConnector(req, res) {
        const answer = (status, result) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        };
        try {
            const body = await this.readBody(req);
            const parsed = (0, proposal_1.parseProposeConnectorInput)(JSON.parse(body));
            if (typeof parsed === 'string') {
                answer(400, { behavior: proposal_1.ProposeConnectorBehavior.Failed, reason: parsed });
                return;
            }
            if (!this.onProposeConnectorCallback) {
                // No window to draw the card in. Declining is the only honest
                // answer; the tool's turn would otherwise sit waiting.
                log('WARN', 'ProposeConnector callback not registered, declining');
                answer(200, { behavior: proposal_1.ProposeConnectorBehavior.Declined });
                return;
            }
            const requestId = crypto_1.default.randomUUID();
            const audience = this.raisingAgent();
            log('INFO', `ProposeConnector request, requestId=${requestId} connectionId=${(0, sanitizeForLog_1.serializeForLog)(parsed.connectionId)} agentId=${audience.agentId ?? ''}`);
            const decision = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    log('INFO', `ProposeConnector timeout, requestId=${requestId}`);
                    this.pendingProposeConnector.delete(requestId);
                    this.onProposeConnectorDismissCallback?.(requestId);
                    resolve({ behavior: proposal_1.ProposeConnectorBehavior.Declined });
                }, proposal_1.PROPOSE_CONNECTOR_TIMEOUT_MS);
                this.pendingProposeConnector.set(requestId, { requestId, resolve, timer });
                this.onProposeConnectorCallback?.({ requestId, ...parsed, ...audience });
            });
            if (decision.behavior === proposal_1.ProposeConnectorBehavior.Connected) {
                const name = (0, proposal_1.proposedConnection)(parsed)?.name ?? parsed.connectionId;
                log('INFO', `ProposeConnector connected, requestId=${requestId} connectionId=${(0, sanitizeForLog_1.serializeForLog)(parsed.connectionId)}`);
                answer(200, { behavior: proposal_1.ProposeConnectorBehavior.Connected, connectionId: parsed.connectionId, name });
                return;
            }
            if (decision.behavior === proposal_1.ProposeConnectorBehavior.Failed) {
                const reason = decision.reason?.trim() || 'the sign-in did not go through';
                log('WARN', `ProposeConnector failed, requestId=${requestId}: ${reason}`);
                answer(200, { behavior: proposal_1.ProposeConnectorBehavior.Failed, reason });
                return;
            }
            answer(200, { behavior: proposal_1.ProposeConnectorBehavior.Declined });
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log('ERROR', `ProposeConnector request error: ${errMsg}`);
            answer(500, { behavior: proposal_1.ProposeConnectorBehavior.Failed, reason: 'The request could not be read.' });
        }
    }
    async handleAskInput(req, res) {
        try {
            const body = await this.readBody(req);
            const input = JSON.parse(body);
            const fields = Array.isArray(input.fields) ? input.fields : [];
            const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
            if (!prompt || fields.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'A prompt and at least one field are required' }));
                return;
            }
            const requestId = crypto_1.default.randomUUID();
            const audience = this.raisingAgent();
            const masked = fields.filter(field => field.kind === 'secret').length;
            log('INFO', `AskInput request, requestId=${requestId} fields=${fields.length} masked=${masked} agentId=${audience.agentId ?? ''}`);
            const answer = await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    log('INFO', `AskInput timeout, requestId=${requestId}`);
                    this.pendingAskInput.delete(requestId);
                    this.onAskInputDismissCallback?.(requestId);
                    resolve({ behavior: constants_1.AskInputBehavior.Decline });
                }, constants_1.ASK_INPUT_TIMEOUT_MS);
                this.pendingAskInput.set(requestId, { requestId, resolve, timer });
                if (this.onAskInputCallback) {
                    this.onAskInputCallback({
                        requestId,
                        prompt,
                        fields,
                        ...(typeof input.note === 'string' && input.note.trim() ? { note: input.note.trim() } : {}),
                        ...(input.offerToSave ? { offerToSave: true } : {}),
                        ...(typeof input.sessionKey === 'string' && input.sessionKey.trim()
                            ? { sessionKey: input.sessionKey.trim() }
                            : {}),
                        ...audience,
                    });
                }
                else {
                    // No window to draw the card in. Declining is the only honest
                    // answer; pretending otherwise would hang the agent's turn.
                    log('WARN', 'AskInput callback not registered, declining');
                    clearTimeout(timer);
                    this.pendingAskInput.delete(requestId);
                    resolve({ behavior: constants_1.AskInputBehavior.Decline });
                }
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(answer));
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log('ERROR', `AskInput request error: ${errMsg}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ behavior: constants_1.AskInputBehavior.Decline }));
        }
    }
    async handleMediaGeneration(req, res) {
        const t0 = Date.now();
        try {
            const body = await this.readBody(req);
            const request = JSON.parse(body);
            const action = typeof request.args?.action === 'string' ? request.args.action : 'generate';
            const model = typeof request.args?.model === 'string' ? request.args.model : '';
            const prompt = typeof request.args?.prompt === 'string' ? request.args.prompt : '';
            log('INFO', `Media generation request received for tool="${request.tool}" action="${action}" toolCallId="${request.context?.toolCallId ?? ''}" sessionKey="${request.context?.sessionKey?.slice(0, 30)}…" args=${(0, sanitizeForLog_1.serializeForLog)({
                action,
                model,
                promptLength: prompt.length,
                hasImage: typeof request.args?.image === 'string',
                imageCount: Array.isArray(request.args?.images) ? request.args.images.length : undefined,
                hasVideo: typeof request.args?.video === 'string',
                videoCount: Array.isArray(request.args?.videos) ? request.args.videos.length : undefined,
                aspectRatio: request.args?.aspectRatio,
                resolution: request.args?.resolution,
                size: request.args?.size,
                count: request.args?.count,
                durationSeconds: request.args?.durationSeconds,
            })}`);
            if (!request.tool || !request.context?.sessionKey) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ content: [{ type: 'text', text: 'Missing tool or context.sessionKey' }], isError: true }));
                return;
            }
            if (!this.onMediaGenerationCallback) {
                log('WARN', 'Media generation callback not registered');
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ content: [{ type: 'text', text: 'Media generation service not available.' }], isError: true }));
                return;
            }
            const result = await this.onMediaGenerationCallback(request);
            const contentPreview = (0, sanitizeForLog_1.serializeForLog)(result.content);
            log('INFO', `Media generation completed for tool="${request.tool}" in ${Date.now() - t0}ms with isError=${result.isError ?? false}. Details=${(0, sanitizeForLog_1.serializeForLog)(result.details ?? {})} Result=${contentPreview}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            log('ERROR', `Media generation request failed after ${Date.now() - t0}ms: ${errMsg}`);
            if (!res.writableEnded) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ content: [{ type: 'text', text: `Media generation error: ${errMsg}` }], isError: true }));
            }
        }
    }
    async handleBrowserTool(req, res) {
        const startedAt = Date.now();
        try {
            const body = await this.readBody(req);
            const request = JSON.parse(body);
            if (typeof request.tool !== 'string' || !request.tool.trim()) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    content: [{ type: 'text', text: 'Missing browser tool name.' }],
                    isError: true,
                }));
                return;
            }
            if (!this.onBrowserToolCallback) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    content: [{ type: 'text', text: 'Caisra in-app browser is not ready.' }],
                    isError: true,
                }));
                return;
            }
            const result = await this.onBrowserToolCallback({
                tool: request.tool,
                args: request.args && typeof request.args === 'object' && !Array.isArray(request.args)
                    ? request.args
                    : {},
            });
            log('DEBUG', `Browser tool "${request.tool}" completed in ${Date.now() - startedAt}ms`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log('ERROR', `Browser tool request failed after ${Date.now() - startedAt}ms: ${message}`);
            if (!res.writableEnded) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    content: [{ type: 'text', text: `Caisra browser error: ${message}` }],
                    isError: true,
                }));
            }
        }
    }
    readBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            req.on('error', reject);
        });
    }
    findFreePort() {
        return new Promise((resolve, reject) => {
            const srv = net_1.default.createServer();
            srv.once('error', reject);
            srv.once('listening', () => {
                const addr = srv.address();
                const port = typeof addr === 'object' && addr ? addr.port : 0;
                srv.close(() => resolve(port));
            });
            srv.listen(0, '127.0.0.1');
        });
    }
}
exports.McpBridgeServer = McpBridgeServer;
//# sourceMappingURL=mcpBridgeServer.js.map
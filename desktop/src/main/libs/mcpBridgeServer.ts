/**
 * McpBridgeServer — authenticated loopback callbacks shared by OpenClaw integrations.
 *
 * Provides AskUser, media-generation, and in-app browser endpoints. Binds to
 * 127.0.0.1 only and requires the per-process bridge secret.
 */
import crypto from 'crypto';
import http from 'http';
import net from 'net';

import { serializeForLog } from './sanitizeForLog';

const log = (level: string, msg: string) => {
  const formatted = `[McpBridge:HTTP][${level}] ${msg}`;
  if (level === 'ERROR') {
    console.error(formatted);
  } else if (level === 'WARN') {
    console.warn(formatted);
  } else if (level === 'DEBUG') {
    console.debug(formatted);
  } else {
    console.log(formatted);
  }
};

import {
  ASK_INPUT_ROUTE,
  ASK_INPUT_TIMEOUT_MS,
  AskInputBehavior,
  type AskInputRequest,
  type AskInputResponse,
  describeResponse,
} from '../../shared/askInput/constants';
import {
  parseProposeConnectorInput,
  PROPOSE_CONNECTOR_ROUTE,
  PROPOSE_CONNECTOR_TIMEOUT_MS,
  type ProposeConnectorAnswer,
  type ProposeConnectorAsk,
  ProposeConnectorBehavior,
  type ProposeConnectorResult,
  proposedConnection,
} from '../../shared/connections/proposal';
import {
  parseReactInput,
  REACT_ROUTE,
  type ReactRequest,
  type ReactResult,
} from '../../shared/reactions/constants';
import {
  CREATE_AGENT_ROUTE,
  CREATE_AGENT_TIMEOUT_MS,
  type CreateAgentAnswer,
  type CreateAgentAsk,
  CreateAgentBehavior,
  type CreateAgentInput,
  type CreateAgentResult,
  parseCreateAgentInput,
} from '../../shared/staffing/constants';
import {
  briefOf,
  buildRoster,
  checkRosterAnswer,
  type NotStoodUpAgent,
  parseProposeTeamInput,
  PROPOSE_TEAM_ROUTE,
  PROPOSE_TEAM_TIMEOUT_MS,
  type ProposeTeamResult,
  type RosterAnswer,
  type RosterAsk,
  RosterBehavior,
  type StoodUpAgent,
} from '../../shared/staffing/roster';
import { strongBySlug } from '../../shared/staffing/strongs';

export type AskUserRequest = {
  requestId: string;
  sessionKey?: string;
  questions: Array<{
    question: string;
    header?: string;
    title?: string;
    subtitle?: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
};

export type AskUserResponse = {
  behavior: 'allow' | 'deny';
  answers?: Record<string, string>;
};

type PendingAskUser = {
  requestId: string;
  resolve: (response: AskUserResponse) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingAskInput = {
  requestId: string;
  resolve: (response: AskInputResponse) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingCreateAgent = {
  requestId: string;
  resolve: (answer: CreateAgentAnswer) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingRoster = {
  requestId: string;
  ask: RosterAsk;
  resolve: (answer: RosterAnswer) => void;
  timer: ReturnType<typeof setTimeout>;
};

type PendingProposeConnector = {
  requestId: string;
  resolve: (answer: ProposeConnectorAnswer) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Who actually creates the agent once the person has said yes. */
export type CreateAgentPerformer = (
  input: CreateAgentInput,
) => Promise<{ agentId: string; name: string }>;

export type MediaGenerationRequest = {
  tool: string;
  args: Record<string, unknown>;
  context: {
    sessionKey: string;
    toolCallId: string;
  };
};

export type MediaGenerationResponse = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  details?: Record<string, unknown>;
};

export type BrowserToolRequest = {
  tool: string;
  args: Record<string, unknown>;
};

export type BrowserToolResponse = {
  content: Array<Record<string, unknown>>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export class McpBridgeServer {
  private server: http.Server | null = null;
  private _port: number | null = null;
  private readonly secret: string;
  private readonly pendingAskUser = new Map<string, PendingAskUser>();
  private onAskUserCallback: ((request: AskUserRequest) => void) | null = null;
  private onAskInputCallback: ((request: AskInputRequest) => void) | null = null;
  private onAskInputDismissCallback: ((requestId: string) => void) | null = null;
  private readonly pendingAskInput = new Map<string, PendingAskInput>();
  private onReactCallback: ((request: ReactRequest) => ReactResult) | null = null;
  private onCreateAgentCallback: ((ask: CreateAgentAsk) => void) | null = null;
  private onCreateAgentDismissCallback: ((requestId: string) => void) | null = null;
  private createAgentPerformer: CreateAgentPerformer | null = null;
  private readonly pendingCreateAgent = new Map<string, PendingCreateAgent>();
  private onRosterCallback: ((ask: RosterAsk) => void) | null = null;
  private onRosterDismissCallback: ((requestId: string) => void) | null = null;
  private readonly pendingRoster = new Map<string, PendingRoster>();
  private onProposeConnectorCallback: ((ask: ProposeConnectorAsk) => void) | null = null;
  private onProposeConnectorDismissCallback: ((requestId: string) => void) | null = null;
  private readonly pendingProposeConnector = new Map<string, PendingProposeConnector>();
  private onAskUserDismissCallback: ((requestId: string) => void) | null = null;
  private onMediaGenerationCallback: ((request: MediaGenerationRequest) => Promise<MediaGenerationResponse>) | null = null;
  private onBrowserToolCallback: ((request: BrowserToolRequest) => Promise<BrowserToolResponse>) | null = null;

  constructor(secret: string) {
    this.secret = secret;
    log('INFO', `McpBridgeServer created, secret prefix="${secret.slice(0, 8)}…"`);
  }

  get port(): number | null {
    return this._port;
  }

  get askUserCallbackUrl(): string | null {
    return this._port ? `http://127.0.0.1:${this._port}/askuser` : null;
  }

  get mediaCallbackUrl(): string | null {
    return this._port ? `http://127.0.0.1:${this._port}/media-generation/tool` : null;
  }

  get browserCallbackUrl(): string | null {
    return this._port ? `http://127.0.0.1:${this._port}/browser/tool` : null;
  }

  /**
   * Register a callback that fires when an AskUserQuestion request arrives.
   * The callback should show a modal and eventually call resolveAskUser().
   */
  onAskUser(callback: (request: AskUserRequest) => void): void {
    this.onAskUserCallback = callback;
  }

  /**
   * Register a callback that fires when an AskUser request is dismissed (timeout or resolved).
   * The callback should close the modal in the renderer.
   */
  onAskUserDismiss(callback: (requestId: string) => void): void {
    this.onAskUserDismissCallback = callback;
  }

  get askInputCallbackUrl(): string | null {
    return this._port ? `http://127.0.0.1:${this._port}${ASK_INPUT_ROUTE}` : null;
  }

  /**
   * Register a callback that fires when the agent asks the person to type
   * something — a password, a code, the fields of a login form.
   */
  onAskInput(callback: (request: AskInputRequest) => void): void {
    this.onAskInputCallback = callback;
  }

  /** Fires when a card should come off the screen: timed out, or answered. */
  onAskInputDismiss(callback: (requestId: string) => void): void {
    this.onAskInputDismissCallback = callback;
  }

  /**
   * Hand a waiting tool what the person typed.
   *
   * The values go from here straight back over the loopback socket to the
   * tool that asked. They are never logged: `describeResponse` is what
   * goes in the log line, and it counts fields rather than naming values.
   */
  resolveAskInput(requestId: string, response: AskInputResponse): void {
    const pending = this.pendingAskInput.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingAskInput.delete(requestId);
    log('INFO', `AskInput resolved, requestId=${requestId} ${describeResponse(response)}`);
    pending.resolve(response);
  }

  get reactCallbackUrl(): string | null {
    return this._port ? `http://127.0.0.1:${this._port}${REACT_ROUTE}` : null;
  }

  /**
   * The agent putting an emoji on the person's message. Nothing waits:
   * the callback says where it landed, or why nowhere, and the tool is
   * told that at once.
   */
  onReact(callback: (request: ReactRequest) => ReactResult): void {
    this.onReactCallback = callback;
  }

  get createAgentCallbackUrl(): string | null {
    return this._port ? `http://127.0.0.1:${this._port}${CREATE_AGENT_ROUTE}` : null;
  }

  /**
   * Standing up an agent, in three parts: the card (`onCreateAgent`,
   * `resolveCreateAgent`), what happens once the person has said yes
   * (`setCreateAgentPerformer`), and the card coming down
   * (`onCreateAgentDismiss`). The tool waits on the whole of it.
   */
  onCreateAgent(callback: (ask: CreateAgentAsk) => void): void {
    this.onCreateAgentCallback = callback;
  }

  onCreateAgentDismiss(callback: (requestId: string) => void): void {
    this.onCreateAgentDismissCallback = callback;
  }

  setCreateAgentPerformer(performer: CreateAgentPerformer): void {
    this.createAgentPerformer = performer;
  }

  resolveCreateAgent(requestId: string, answer: CreateAgentAnswer): void {
    const pending = this.pendingCreateAgent.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingCreateAgent.delete(requestId);
    log('INFO', `CreateAgent answered, requestId=${requestId} behavior=${answer.behavior}`);
    pending.resolve(answer);
  }

  get proposeTeamCallbackUrl(): string | null {
    return this._port ? `http://127.0.0.1:${this._port}${PROPOSE_TEAM_ROUTE}` : null;
  }

  /**
   * The roster card ("Your starter team"). The card (`onRoster`,
   * `resolveRoster`) and its coming down (`onRosterDismiss`); standing
   * the agents up reuses the create-agent performer, because Stand them
   * up is the person's yes for every row on the card.
   */
  onRoster(callback: (ask: RosterAsk) => void): void {
    this.onRosterCallback = callback;
  }

  onRosterDismiss(callback: (requestId: string) => void): void {
    this.onRosterDismissCallback = callback;
  }

  get proposeConnectorCallbackUrl(): string | null {
    return this._port ? `http://127.0.0.1:${this._port}${PROPOSE_CONNECTOR_ROUTE}` : null;
  }

  /**
   * The connector card ("App access requested", with Install). The card
   * (`onProposeConnector`, `resolveProposeConnector`) and its coming down
   * (`onProposeConnectorDismiss`). Unlike standing up an agent there is
   * no performer here: the renderer owns the connect flow (it is the
   * Apps screen's own Connect), runs it on Install, and answers with the
   * outcome. The tool waits on the whole of it.
   */
  onProposeConnector(callback: (ask: ProposeConnectorAsk) => void): void {
    this.onProposeConnectorCallback = callback;
  }

  onProposeConnectorDismiss(callback: (requestId: string) => void): void {
    this.onProposeConnectorDismissCallback = callback;
  }

  resolveProposeConnector(requestId: string, answer: ProposeConnectorAnswer): void {
    const pending = this.pendingProposeConnector.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingProposeConnector.delete(requestId);
    log('INFO', `ProposeConnector answered, requestId=${requestId} behavior=${answer.behavior}`);
    pending.resolve(answer);
  }

  resolveRoster(requestId: string, answer: unknown): void {
    const pending = this.pendingRoster.get(requestId);
    if (!pending) return;
    const checked = checkRosterAnswer(answer, pending.ask);
    if (typeof checked === 'string') {
      // Our own renderer sent something the card cannot mean. Say so and
      // leave the card up rather than guess.
      log('WARN', `Roster answer refused, requestId=${requestId}: ${checked}`);
      return;
    }
    clearTimeout(pending.timer);
    this.pendingRoster.delete(requestId);
    log('INFO', `Roster answered, requestId=${requestId} behavior=${checked.behavior}${checked.behavior === RosterBehavior.StandUp ? ` slugs=${checked.slugs.join(',')}` : ''}`);
    pending.resolve(checked);
  }

  /**
   * Register a callback for media generation tool requests.
   * The callback should call lobsterai-server and return the result.
   */
  onMediaGeneration(callback: (request: MediaGenerationRequest) => Promise<MediaGenerationResponse>): void {
    this.onMediaGenerationCallback = callback;
  }

  onBrowserTool(callback: (request: BrowserToolRequest) => Promise<BrowserToolResponse>): void {
    this.onBrowserToolCallback = callback;
  }

  /**
   * Resolve a pending AskUserQuestion request (called when user clicks in the modal).
   */
  resolveAskUser(requestId: string, response: AskUserResponse): void {
    const pending = this.pendingAskUser.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingAskUser.delete(requestId);
    pending.resolve(response);
  }

  /**
   * Programmatic ask-user request from within the main process.
   * Reuses the same pending/resolve/callback infrastructure as the HTTP endpoint
   * but skips HTTP and authentication.
   */
  async askUserInternal(
    questions: AskUserRequest['questions'],
    timeoutMs = 120_000,
    options: { sessionKey?: string } = {},
  ): Promise<AskUserResponse> {
    const requestId = crypto.randomUUID();
    const sessionKey = options.sessionKey?.trim() || undefined;
    log('INFO', `AskUser (internal) request, requestId=${requestId}`);

    return new Promise<AskUserResponse>((resolve) => {
      const timer = setTimeout(() => {
        log('INFO', `AskUser (internal) timeout, requestId=${requestId}`);
        this.pendingAskUser.delete(requestId);
        this.onAskUserDismissCallback?.(requestId);
        resolve({ behavior: 'deny' });
      }, timeoutMs);

      this.pendingAskUser.set(requestId, { requestId, resolve, timer });

      if (this.onAskUserCallback) {
        this.onAskUserCallback({ requestId, questions, sessionKey });
      } else {
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
  async start(): Promise<number> {
    if (this.server) {
      throw new Error('McpBridgeServer is already running');
    }

    const port = await this.findFreePort();

    return new Promise((resolve, reject) => {
      const srv = http.createServer((req, res) => {
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
  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
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

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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

    if (req.url?.startsWith(ASK_INPUT_ROUTE)) {
      await this.handleAskInput(req, res);
      return;
    }

    if (req.url?.startsWith(REACT_ROUTE)) {
      await this.handleReact(req, res);
      return;
    }

    if (req.url?.startsWith(CREATE_AGENT_ROUTE)) {
      await this.handleCreateAgent(req, res);
      return;
    }

    if (req.url?.startsWith(PROPOSE_TEAM_ROUTE)) {
      await this.handleProposeTeam(req, res);
      return;
    }

    if (req.url?.startsWith(PROPOSE_CONNECTOR_ROUTE)) {
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

  private async handleAskUser(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const ASKUSER_TIMEOUT_MS = 120_000;

    try {
      const body = await this.readBody(req);
      const input = JSON.parse(body) as { questions?: unknown[]; sessionKey?: unknown };
      const sessionKey = typeof input.sessionKey === 'string' && input.sessionKey.trim()
        ? input.sessionKey.trim()
        : undefined;
      log('INFO', `AskUser request received, questions=${Array.isArray(input.questions) ? input.questions.length : 0}`);

      if (!Array.isArray(input.questions) || input.questions.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or empty "questions" field' }));
        return;
      }

      const requestId = crypto.randomUUID();
      log('INFO', `AskUser waiting for user response, requestId=${requestId}`);

      // Create a Promise that resolves when the user responds or timeout
      const userResponse = await new Promise<AskUserResponse>((resolve) => {
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
            questions: input.questions as AskUserRequest['questions'],
          });
        } else {
          log('WARN', 'AskUser callback not registered, denying');
          clearTimeout(timer);
          this.pendingAskUser.delete(requestId);
          resolve({ behavior: 'deny' });
        }
      });

      log('INFO', `AskUser resolved, requestId=${requestId} behavior=${userResponse.behavior}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(userResponse));
    } catch (error) {
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
  private async handleReact(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const answer = (status: number, result: ReactResult): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    };
    try {
      const body = await this.readBody(req);
      const raw: unknown = JSON.parse(body);
      const parsed = parseReactInput(raw);
      if (typeof parsed === 'string') {
        answer(400, { behavior: 'nothing', reason: parsed });
        return;
      }
      const sessionKey = raw && typeof raw === 'object' && typeof (raw as { sessionKey?: unknown }).sessionKey === 'string'
        ? (raw as { sessionKey: string }).sessionKey.trim() || undefined
        : undefined;
      if (!this.onReactCallback) {
        answer(200, { behavior: 'nothing', reason: 'The app is not showing the conversation.' });
        return;
      }
      const result = this.onReactCallback({ emoji: parsed.emoji, ...(sessionKey ? { sessionKey } : {}) });
      log('INFO', `React ${result.behavior} emoji=${serializeForLog(parsed.emoji)} sessionKey=${sessionKey?.slice(0, 30) ?? ''}`);
      answer(200, result);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log('ERROR', `React request error: ${errMsg}`);
      answer(500, { behavior: 'nothing', reason: 'The request could not be read.' });
    }
  }

  private async handleCreateAgent(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const answer = (status: number, result: CreateAgentResult): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    };
    try {
      const body = await this.readBody(req);
      const parsed = parseCreateAgentInput(JSON.parse(body));
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

      const requestId = crypto.randomUUID();
      log('INFO', `CreateAgent request, requestId=${requestId} name=${serializeForLog(parsed.name)}`);

      const decision = await new Promise<CreateAgentAnswer>((resolve) => {
        const timer = setTimeout(() => {
          log('INFO', `CreateAgent timeout, requestId=${requestId}`);
          this.pendingCreateAgent.delete(requestId);
          this.onCreateAgentDismissCallback?.(requestId);
          resolve({ behavior: CreateAgentBehavior.Decline });
        }, CREATE_AGENT_TIMEOUT_MS);
        this.pendingCreateAgent.set(requestId, { requestId, resolve, timer });
        this.onCreateAgentCallback?.({ requestId, ...parsed });
      });

      if (decision.behavior !== CreateAgentBehavior.Allow) {
        answer(200, { behavior: 'declined' });
        return;
      }
      try {
        const created = await this.createAgentPerformer(parsed);
        log('INFO', `CreateAgent created, requestId=${requestId} agentId=${created.agentId}`);
        answer(200, { behavior: 'created', agentId: created.agentId, name: created.name });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        log('ERROR', `CreateAgent failed, requestId=${requestId}: ${reason}`);
        answer(200, { behavior: 'failed', reason });
      }
    } catch (error) {
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
  private async handleProposeTeam(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const answer = (status: number, result: ProposeTeamResult): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    };
    try {
      const body = await this.readBody(req);
      const parsed = parseProposeTeamInput(JSON.parse(body));
      if (typeof parsed === 'string') {
        answer(400, { behavior: 'failed', reason: parsed });
        return;
      }
      const roster = buildRoster(parsed);
      if (typeof roster === 'string') {
        answer(400, { behavior: 'failed', reason: roster });
        return;
      }
      if (!this.onRosterCallback || !this.createAgentPerformer) {
        log('WARN', 'Roster callback or performer not registered, declining');
        answer(200, { behavior: 'declined' });
        return;
      }

      const requestId = crypto.randomUUID();
      const ask: RosterAsk = { requestId, ...roster };
      log('INFO', `Roster request, requestId=${requestId} workType=${serializeForLog(ask.workType)} team=${ask.team.map(one => one.slug).join(',')}`);

      const decision = await new Promise<RosterAnswer>((resolve) => {
        const timer = setTimeout(() => {
          log('INFO', `Roster timeout, requestId=${requestId}`);
          this.pendingRoster.delete(requestId);
          this.onRosterDismissCallback?.(requestId);
          resolve({ behavior: RosterBehavior.Decline });
        }, PROPOSE_TEAM_TIMEOUT_MS);
        this.pendingRoster.set(requestId, { requestId, ask, resolve, timer });
        this.onRosterCallback?.(ask);
      });

      if (decision.behavior === RosterBehavior.Decline) {
        answer(200, { behavior: 'declined' });
        return;
      }
      if (decision.behavior === RosterBehavior.SomethingElse) {
        answer(200, { behavior: 'somethingElse', text: decision.text });
        return;
      }

      const agents: StoodUpAgent[] = [];
      const failed: NotStoodUpAgent[] = [];
      for (const slug of decision.slugs) {
        const strong = strongBySlug(slug);
        if (!strong) continue;
        try {
          const created = await this.createAgentPerformer(briefOf(strong));
          log('INFO', `Roster stood up, requestId=${requestId} slug=${slug} agentId=${created.agentId}`);
          agents.push({ slug, name: created.name, agentId: created.agentId });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          log('ERROR', `Roster failed to stand up, requestId=${requestId} slug=${slug}: ${reason}`);
          failed.push({ slug, name: strong.name, reason });
        }
      }
      answer(200, { behavior: 'stoodUp', agents, failed });
    } catch (error) {
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
  private async handleProposeConnector(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const answer = (status: number, result: ProposeConnectorResult): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    };
    try {
      const body = await this.readBody(req);
      const parsed = parseProposeConnectorInput(JSON.parse(body));
      if (typeof parsed === 'string') {
        answer(400, { behavior: ProposeConnectorBehavior.Failed, reason: parsed });
        return;
      }
      if (!this.onProposeConnectorCallback) {
        // No window to draw the card in. Declining is the only honest
        // answer; the tool's turn would otherwise sit waiting.
        log('WARN', 'ProposeConnector callback not registered, declining');
        answer(200, { behavior: ProposeConnectorBehavior.Declined });
        return;
      }

      const requestId = crypto.randomUUID();
      log('INFO', `ProposeConnector request, requestId=${requestId} connectionId=${serializeForLog(parsed.connectionId)}`);

      const decision = await new Promise<ProposeConnectorAnswer>((resolve) => {
        const timer = setTimeout(() => {
          log('INFO', `ProposeConnector timeout, requestId=${requestId}`);
          this.pendingProposeConnector.delete(requestId);
          this.onProposeConnectorDismissCallback?.(requestId);
          resolve({ behavior: ProposeConnectorBehavior.Declined });
        }, PROPOSE_CONNECTOR_TIMEOUT_MS);
        this.pendingProposeConnector.set(requestId, { requestId, resolve, timer });
        this.onProposeConnectorCallback?.({ requestId, ...parsed });
      });

      if (decision.behavior === ProposeConnectorBehavior.Connected) {
        const name = proposedConnection(parsed)?.name ?? parsed.connectionId;
        log('INFO', `ProposeConnector connected, requestId=${requestId} connectionId=${serializeForLog(parsed.connectionId)}`);
        answer(200, { behavior: ProposeConnectorBehavior.Connected, connectionId: parsed.connectionId, name });
        return;
      }
      if (decision.behavior === ProposeConnectorBehavior.Failed) {
        const reason = decision.reason?.trim() || 'the sign-in did not go through';
        log('WARN', `ProposeConnector failed, requestId=${requestId}: ${reason}`);
        answer(200, { behavior: ProposeConnectorBehavior.Failed, reason });
        return;
      }
      answer(200, { behavior: ProposeConnectorBehavior.Declined });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log('ERROR', `ProposeConnector request error: ${errMsg}`);
      answer(500, { behavior: ProposeConnectorBehavior.Failed, reason: 'The request could not be read.' });
    }
  }

  private async handleAskInput(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const body = await this.readBody(req);
      const input = JSON.parse(body) as Partial<AskInputRequest>;
      const fields = Array.isArray(input.fields) ? input.fields : [];
      const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';

      if (!prompt || fields.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'A prompt and at least one field are required' }));
        return;
      }

      const requestId = crypto.randomUUID();
      const masked = fields.filter(field => field.kind === 'secret').length;
      log('INFO', `AskInput request, requestId=${requestId} fields=${fields.length} masked=${masked}`);

      const answer = await new Promise<AskInputResponse>((resolve) => {
        const timer = setTimeout(() => {
          log('INFO', `AskInput timeout, requestId=${requestId}`);
          this.pendingAskInput.delete(requestId);
          this.onAskInputDismissCallback?.(requestId);
          resolve({ behavior: AskInputBehavior.Decline });
        }, ASK_INPUT_TIMEOUT_MS);

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
          });
        } else {
          // No window to draw the card in. Declining is the only honest
          // answer; pretending otherwise would hang the agent's turn.
          log('WARN', 'AskInput callback not registered, declining');
          clearTimeout(timer);
          this.pendingAskInput.delete(requestId);
          resolve({ behavior: AskInputBehavior.Decline });
        }
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(answer));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log('ERROR', `AskInput request error: ${errMsg}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ behavior: AskInputBehavior.Decline }));
    }
  }

  private async handleMediaGeneration(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const t0 = Date.now();
    try {
      const body = await this.readBody(req);
      const request = JSON.parse(body) as MediaGenerationRequest;
      const action = typeof request.args?.action === 'string' ? request.args.action : 'generate';
      const model = typeof request.args?.model === 'string' ? request.args.model : '';
      const prompt = typeof request.args?.prompt === 'string' ? request.args.prompt : '';
      log('INFO', `Media generation request received for tool="${request.tool}" action="${action}" toolCallId="${request.context?.toolCallId ?? ''}" sessionKey="${request.context?.sessionKey?.slice(0, 30)}…" args=${serializeForLog({
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
      const contentPreview = serializeForLog(result.content);
      log('INFO', `Media generation completed for tool="${request.tool}" in ${Date.now() - t0}ms with isError=${result.isError ?? false}. Details=${serializeForLog(result.details ?? {})} Result=${contentPreview}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log('ERROR', `Media generation request failed after ${Date.now() - t0}ms: ${errMsg}`);
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ content: [{ type: 'text', text: `Media generation error: ${errMsg}` }], isError: true }));
      }
    }
  }

  private async handleBrowserTool(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startedAt = Date.now();
    try {
      const body = await this.readBody(req);
      const request = JSON.parse(body) as BrowserToolRequest;
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
    } catch (error) {
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

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
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

import crypto from 'crypto';
import { app, BrowserWindow } from 'electron';
import path from 'path';

import {
  AskInputBehavior,
  AskInputIpc,
  type AskInputResponse,
} from '../../shared/askInput/constants';
import { ASK_USER_QUESTION_TOOL_NAME, SESSION_AGNOSTIC_PERMISSION_SESSION_ID } from '../../shared/cowork/constants';
import { McpIpcChannel } from '../../shared/mcp/constants';
import { type AgentReaction, latestPersonMessageId, ReactionIpc } from '../../shared/reactions/constants';
import {
  type CreateAgentAnswer,
  CreateAgentBehavior,
  CreateAgentIpc,
} from '../../shared/staffing/constants';
import { RosterBehavior, RosterIpc } from '../../shared/staffing/roster';
import { isComputerUseKitInstalled } from '../computerUse/computerUseKit';
import { resolveComputerUseMcpServer } from '../computerUse/computerUseMcpServer';
import { installComputerUseRuntime } from '../computerUse/computerUseRuntime';
import type { CoworkStore } from '../coworkStore';
import { getElectronNodeRuntimePath } from '../libs/coworkUtil';
import {
  type AskUserRequest,
  type AskUserResponse,
  type BrowserToolRequest,
  type BrowserToolResponse,
  type CreateAgentPerformer,
  McpBridgeServer,
  type MediaGenerationRequest,
  type MediaGenerationResponse,
} from '../libs/mcpBridgeServer';
import { OpenClawConfigImpact } from '../libs/openclawConfigImpact';
import type { ResolvedMcpServer } from '../libs/openclawConfigSync';
import { resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey } from '../libs/openclawLocalSessionResolver';
import { resolveStdioCommand } from '../libs/resolveStdioCommand';
import type { SqliteStore } from '../sqliteStore';
import { createMcpLaunchSourceFingerprint, McpLaunchResolutionStatus } from './mcpLaunchResolution';
import { McpLaunchResolverManager } from './mcpLaunchResolverManager';
import { McpStore } from './mcpStore';

export type { AskUserResponse, MediaGenerationRequest, MediaGenerationResponse };

export interface McpRuntimeDeps {
  getStore: () => SqliteStore;
  /** The conversations, for a tapback to find the person's newest message. */
  getCoworkStore?: () => CoworkStore;
  syncOpenClawConfig: (options: {
    reason: string;
    restartGatewayIfRunning?: boolean;
    expectedImpact?: OpenClawConfigImpact;
  }) => Promise<{ success: boolean; changed: boolean }>;
  /** Fired when an AskUserQuestion request is surfaced to the renderer. */
  onAskUserRequested?: (sessionId: string, request: { requestId: string; toolName: string }) => void;
  /** Fired when a pending AskUserQuestion request is dismissed upstream. */
  onAskUserDismissed?: (requestId: string) => void;
}

export class McpRuntime {
  private mcpStore: McpStore | null = null;
  private launchResolverManager: McpLaunchResolverManager | null = null;
  private bridgeServer: McpBridgeServer | null = null;
  private readonly bridgeSecret = crypto.randomUUID();
  private resolvedServersCache: ResolvedMcpServer[] = [];
  private mediaGenerationHandler:
    | ((request: MediaGenerationRequest) => Promise<MediaGenerationResponse>)
    | null = null;
  private browserToolHandler:
    | ((request: BrowserToolRequest) => Promise<BrowserToolResponse>)
    | null = null;
  private createAgentPerformer: CreateAgentPerformer | null = null;

  constructor(private readonly deps: McpRuntimeDeps) {}

  getStore(): McpStore {
    if (!this.mcpStore) {
      const sqliteStore = this.deps.getStore();
      this.mcpStore = new McpStore(sqliteStore.getDatabase());
    }
    return this.mcpStore;
  }

  getLaunchResolverManager(): McpLaunchResolverManager {
    if (!this.launchResolverManager) {
      this.launchResolverManager = new McpLaunchResolverManager(
        this.getStore(),
        () => this.broadcastServersChanged(),
        reason => {
          this.deps.syncOpenClawConfig({
            reason,
            expectedImpact: OpenClawConfigImpact.Restart,
          }).catch(err =>
            console.error('[MCP] config sync error after launch resolution:', err),
          );
        },
      );
    }
    return this.launchResolverManager;
  }

  ensureLaunchResolution(serverId: string, reason: string): void {
    this.getLaunchResolverManager().ensureResolved(serverId, reason);
  }

  setMediaGenerationHandler(
    handler: (request: MediaGenerationRequest) => Promise<MediaGenerationResponse>,
  ): void {
    this.mediaGenerationHandler = handler;
  }

  setBrowserToolHandler(
    handler: (request: BrowserToolRequest) => Promise<BrowserToolResponse>,
  ): void {
    this.browserToolHandler = handler;
    this.bridgeServer?.onBrowserTool(handler);
  }

  getAskUserCallbackUrl(): string | null {
    return this.bridgeServer?.askUserCallbackUrl ?? null;
  }

  getMediaCallbackUrl(): string | null {
    return this.bridgeServer?.mediaCallbackUrl ?? null;
  }

  getBrowserCallbackUrl(): string | null {
    return this.bridgeServer?.browserCallbackUrl ?? null;
  }

  getAskInputCallbackUrl(): string | null {
    return this.bridgeServer?.askInputCallbackUrl ?? null;
  }

  /** Where the `ReactToMessage` tool posts a tapback. */
  getReactCallbackUrl(): string | null {
    return this.bridgeServer?.reactCallbackUrl ?? null;
  }

  getCreateAgentCallbackUrl(): string | null {
    return this.bridgeServer?.createAgentCallbackUrl ?? null;
  }

  /** Who creates the agent once the person has pressed Stand up. */
  setCreateAgentPerformer(performer: CreateAgentPerformer): void {
    this.createAgentPerformer = performer;
    this.bridgeServer?.setCreateAgentPerformer(performer);
  }

  /** Stand up, or Not now, from the card. */
  resolveCreateAgent(requestId: string, answer: CreateAgentAnswer): void {
    this.bridgeServer?.resolveCreateAgent(requestId, answer);
  }

  getProposeTeamCallbackUrl(): string | null {
    return this.bridgeServer?.proposeTeamCallbackUrl ?? null;
  }

  /** Stand them up, Something else, or Not now, from the roster card. */
  resolveRoster(requestId: string, answer: unknown): void {
    this.bridgeServer?.resolveRoster(requestId, answer);
  }

  getBridgeSecret(): string {
    return this.bridgeSecret;
  }

  getResolvedServersCache(): ResolvedMcpServer[] {
    return this.resolvedServersCache;
  }

  async refreshResolvedServersCache(): Promise<ResolvedMcpServer[]> {
    this.resolvedServersCache = await this.getResolvedServers();
    return this.resolvedServersCache;
  }

  clearResolvedServersCache(): void {
    this.resolvedServersCache = [];
  }

  async startAskUserServer(): Promise<void> {
    if (this.bridgeServer?.port) return;

    if (!this.bridgeServer) {
      this.bridgeServer = new McpBridgeServer(this.bridgeSecret);
    }
    console.log('[AskUser] starting HTTP callback server...');
    await this.bridgeServer.start();

    this.bridgeServer.onAskUser(request => {
      const sessionId = request.sessionKey
        ? resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey(
            this.deps.getStore().getDatabase(),
            request.sessionKey,
          )
        : SESSION_AGNOSTIC_PERMISSION_SESSION_ID;
      if (!sessionId) {
        console.warn('[AskUser] denied request for non-desktop or unknown session:', request.sessionKey);
        this.resolveAskUser(request.requestId, { behavior: 'deny' });
        return;
      }
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send('cowork:stream:permission', {
            sessionId,
            request: {
              requestId: request.requestId,
              toolName: ASK_USER_QUESTION_TOOL_NAME,
              toolInput: {
                questions: request.questions,
                ...(request.sessionKey ? { sessionKey: request.sessionKey } : {}),
              },
            },
          });
        } catch (error) {
          console.error('[AskUser] failed to send permission request to window:', error);
        }
      });
      this.deps.onAskUserRequested?.(sessionId, {
        requestId: request.requestId,
        toolName: ASK_USER_QUESTION_TOOL_NAME,
      });
    });

    this.bridgeServer.onAskUserDismiss(requestId => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send('cowork:stream:permissionDismiss', { requestId });
        } catch {
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
        ? resolveLocalDesktopCoworkSessionIdByOpenClawSessionKey(
            this.deps.getStore().getDatabase(),
            request.sessionKey,
          )
        : null;
      const store = this.deps.getCoworkStore?.();
      if (!sessionId || !store) {
        return { behavior: 'nothing', reason: 'This conversation cannot take a reaction.' };
      }
      const session = store.getSession(sessionId, 0);
      const messageId = latestPersonMessageId(store.getRecentConversationMessages(sessionId, 20));
      if (!session || !messageId) {
        return { behavior: 'nothing', reason: 'The person has not said anything yet.' };
      }
      const reaction: AgentReaction = {
        conversationId: session.agentId,
        messageId,
        emoji: request.emoji,
        at: Date.now(),
      };
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        return { behavior: 'nothing', reason: 'The app is not showing the conversation.' };
      }
      windows.forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(ReactionIpc.Agent, reaction);
        } catch (error) {
          console.error('[Reaction] failed to send to window:', error);
        }
      });
      return { behavior: 'reacted' };
    });

    // The card that asks the person to type something. Sent to every
    // window rather than routed by session: unlike a question card this
    // is not about a conversation's content, it is a person being asked
    // for a password, and it must reach whatever window they are looking
    // at.
    this.bridgeServer.onAskInput(request => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        // Nowhere to draw it. Declining is the only honest answer; the
        // agent's turn would otherwise sit waiting for five minutes.
        console.warn('[AskInput] no window open, declining');
        this.resolveAskInput(request.requestId, { behavior: AskInputBehavior.Decline });
        return;
      }
      windows.forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(AskInputIpc.Requested, request);
        } catch (error) {
          console.error('[AskInput] failed to send request to window:', error);
        }
      });
    });

    this.bridgeServer.onAskInputDismiss(requestId => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(AskInputIpc.Dismissed, { requestId });
        } catch {
          // The window is going away; the card goes with it.
        }
      });
    });

    // The card asking whether to stand up an agent. Every window, like
    // ask-input: it is a person being asked, wherever they are looking.
    this.bridgeServer.onCreateAgent(ask => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        console.warn('[CreateAgent] no window open, declining');
        this.resolveCreateAgent(ask.requestId, { behavior: CreateAgentBehavior.Decline });
        return;
      }
      windows.forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(CreateAgentIpc.Requested, ask);
        } catch (error) {
          console.error('[CreateAgent] failed to send request to window:', error);
        }
      });
    });

    this.bridgeServer.onCreateAgentDismiss(requestId => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(CreateAgentIpc.Dismissed, { requestId });
        } catch {
          // The window is going away; the card goes with it.
        }
      });
    });

    // The roster card, "Your starter team". Every window, like the two
    // cards above.
    this.bridgeServer.onRoster(ask => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        console.warn('[Roster] no window open, declining');
        this.resolveRoster(ask.requestId, { behavior: RosterBehavior.Decline });
        return;
      }
      windows.forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(RosterIpc.Requested, ask);
        } catch (error) {
          console.error('[Roster] failed to send request to window:', error);
        }
      });
    });

    this.bridgeServer.onRosterDismiss(requestId => {
      BrowserWindow.getAllWindows().forEach(win => {
        if (win.isDestroyed()) return;
        try {
          win.webContents.send(RosterIpc.Dismissed, { requestId });
        } catch {
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

  async askUserInternal(
    questions: AskUserRequest['questions'],
    timeoutMs?: number,
    options?: { sessionKey?: string },
  ): Promise<AskUserResponse | null> {
    if (!this.bridgeServer) return null;
    return await this.bridgeServer.askUserInternal(questions, timeoutMs, options);
  }

  resolveAskUser(requestId: string, response: AskUserResponse): void {
    this.bridgeServer?.resolveAskUser(requestId, response);
  }

  /** Hand a waiting tool what the person typed into the card. */
  resolveAskInput(requestId: string, response: AskInputResponse): void {
    this.bridgeServer?.resolveAskInput(requestId, response);
  }

  broadcastServersChanged(): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => {
      if (win.isDestroyed()) return;
      try {
        win.webContents.send(McpIpcChannel.Changed);
      } catch {
        // ignore destroyed windows
      }
    });
  }

  private async getResolvedServers(): Promise<ResolvedMcpServer[]> {
    const startedAt = Date.now();
    const enabledServers = this.getStore().getEnabledServers();
    const resolved: ResolvedMcpServer[] = [];
    let optimizedCount = 0;
    let skippedCount = 0;
    let rawCount = 0;
    let builtInCount = 0;

    const electronPath = getElectronNodeRuntimePath();
    const npmBinDir = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'npm', 'bin')
      : '';
    const buildShimEnv = (): Record<string, string> => {
      const shimEnv: Record<string, string> = {
        LOBSTERAI_ELECTRON_PATH: electronPath,
      };
      if (npmBinDir) {
        shimEnv.LOBSTERAI_NPM_BIN_DIR = npmBinDir;
      }
      return shimEnv;
    };
    const pushRawStdioServer = async (server: typeof enabledServers[number]): Promise<void> => {
      const r = await resolveStdioCommand(server);
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
            const shimEnv: Record<string, string> = {
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

          const fingerprint = createMcpLaunchSourceFingerprint(server);
          const status = server.launchResolution?.sourceFingerprint === fingerprint
            ? server.launchResolution.status
            : McpLaunchResolutionStatus.Pending;
          if (
            status === McpLaunchResolutionStatus.Failed
            && launchResolver.shouldStartResolution(server, status)
          ) {
            skippedCount++;
            console.log(
              `[MCP] retrying stdio server "${server.name}" after recoverable managed launch resolution failure`,
            );
            this.ensureLaunchResolution(server.id, 'config-sync:recoverable-failed');
            continue;
          }
          if (
            status === McpLaunchResolutionStatus.Unsupported
            || status === McpLaunchResolutionStatus.Failed
          ) {
            rawCount++;
            if (status === McpLaunchResolutionStatus.Failed) {
              console.warn(
                `[MCP] using raw stdio command for server "${server.name}" because managed launch resolution failed`,
              );
            }
            await pushRawStdioServer(server);
            continue;
          }

          skippedCount++;
          console.log(
            `[MCP] skipping stdio server "${server.name}" while managed launch resolution is ${status}`,
          );
          if (launchResolver.shouldStartResolution(server, status)) {
            this.ensureLaunchResolution(server.id, `config-sync:${status}`);
          }
          continue;
        }

        rawCount++;
        await pushRawStdioServer(server);
      } else {
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
      && isComputerUseKitInstalled(this.deps.getStore());
    if (shouldEnableComputerUse) {
      const installResult = await installComputerUseRuntime();
      if (!installResult.success) {
        console.warn(`[MCP] failed to install Computer Use runtime: ${installResult.error || 'unknown error'}`);
      }
    }

    const computerUseServer = shouldEnableComputerUse
      ? resolveComputerUseMcpServer({
        askUserCallbackUrl,
        bridgeSecret: this.bridgeSecret,
        electronNodePath: electronPath,
      })
      : null;
    if (computerUseServer) {
      resolved.push(computerUseServer);
      builtInCount++;
    }

    console.log(
      `[MCP] resolved ${resolved.length}/${enabledServers.length} enabled server(s) for OpenClaw in ${Date.now() - startedAt}ms; optimized=${optimizedCount}, raw=${rawCount}, skipped=${skippedCount}, builtIn=${builtInCount}`,
    );
    return resolved;
  }
}

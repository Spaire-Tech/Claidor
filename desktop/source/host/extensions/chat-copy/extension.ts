/**
 * The chat-copy host extension (26 October 2026): the agents and their chats
 * sent to Simeon Labs' server as they change (`chat-copy.ts`), so the apps
 * read them there while the computer is asleep, updated or out of reach
 * (`server/simeon/desktop/chats.py`).
 *
 * - Starts once the host's background work is ready, like memory-sync.
 * - Auth is the box's own access token (`auth.getAccessToken`), which the
 *   copy route takes (`get_desktop_or_box_session`).
 * - `SAND_CHAT_COPY=0` switches it off. `[simeon] chat-copy` lines say what
 *   was sent (counts only, never a chat's words), or why not.
 */
import { defineHostExtension, type HostExtensionContext } from "../../../internal/host-extensions.js";
import { HOST_LOG_PREFIX, logHostLine } from "../../../shared/host-log.js";
import { getConfiguredBackendUrl } from "../../../shared/node/simeon-token.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { ChatCopy, createChatCopyServer, type ChatCopyServer, type ChatCopyTranscript } from "./chat-copy.js";

export const CHAT_COPY_ENV = "SAND_CHAT_COPY";

export function isChatCopyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[CHAT_COPY_ENV]?.trim().toLowerCase();
  return !(value === "0" || value === "off" || value === "false" || value === "no");
}

interface AuthApi { getAccessToken(options: { readonly backendUrl: string }): Promise<string>; }
interface ChatCopyHost { log(message: string): void; readonly whenBackgroundWorkReady?: Promise<unknown>; }

/** What a test may supply; every field has a default. */
export interface ChatCopyExtras {
  readonly backendUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly server?: ChatCopyServer;
  readonly intervalMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly log?: (line: string) => void;
}

export interface ChatCopyApi {
  isEnabled(): boolean;
  /** Everything waiting, sent now. */
  flushNow(): Promise<void>;
  /** Resolves once the start (the list read, the server's state asked) is done. */
  readonly whenStarted: Promise<void>;
}

export const chatCopyExtension = defineHostExtension<ChatCopyApi, ChatCopyHost>({
  id: HostExtensions.ChatCopy,
  dependencies: [HostExtensions.Auth, HostExtensions.Transcript],
  start: (context: HostExtensionContext<ChatCopyHost> & ChatCopyExtras) => {
    const env = context.env ?? process.env;
    const log = context.log ?? logHostLine;
    if (!isChatCopyEnabled(env)) {
      log(`${HOST_LOG_PREFIX} chat-copy off (${CHAT_COPY_ENV}=${env[CHAT_COPY_ENV] ?? ""})`);
      return { isEnabled: () => false, flushNow: async () => {}, whenStarted: Promise.resolve() };
    }
    const auth = context.deps[HostExtensions.Auth] as AuthApi;
    const transcript = context.deps[HostExtensions.Transcript] as unknown as ChatCopyTranscript;
    const backendUrl = context.backendUrl ?? getConfiguredBackendUrl();
    const server = context.server ?? createChatCopyServer({
      getBackendUrl: () => backendUrl,
      getAccessToken: (options) => auth.getAccessToken(options),
      ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
    });
    const copy = new ChatCopy({ transcript, server, log, ...(context.intervalMs === undefined ? {} : { intervalMs: context.intervalMs }) });
    let stopped = false;
    context.onStop(() => { stopped = true; copy.stop(); });
    const whenStarted = (context.host.whenBackgroundWorkReady ?? Promise.resolve()).then(async () => {
      if (!stopped) await copy.start();
    });
    return { isEnabled: () => true, flushNow: () => copy.flushNow(), whenStarted };
  }
});

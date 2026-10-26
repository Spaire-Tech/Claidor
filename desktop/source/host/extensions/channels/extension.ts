import { defineHostExtension } from "../../../internal/host-extensions.js";
import { getConfiguredBackendUrl } from "../../../shared/node/simeon-token.js";
import { HostExtensions } from "../extension-ids.generated.js";
import { createChannelRuntime, type ChannelRuntime, type ChannelRuntimeTranscript } from "./channel-runtime.js";
import { createChannelServer } from "./channel-server.js";

/**
 * The messaging-channel connectors, in the box (25 September 2026). It
 * depends on the transcript extension: the manager owns the channel
 * store, the secret store and the wake queue, and this extension supplies
 * the one thing the reconstruction never had, the module that registers
 * against `setChannelDelivery`, `setChannelActivity` and
 * `setChannelConfigChanged` and calls `wakeForInbound`.
 *
 * Since 26 October 2026 the bots are also handed to Simeon Labs' server,
 * where the cloud runner listens to them while this computer sleeps
 * (`channel-server.ts`); what they hear comes back through the chat-copy
 * extension's inbox (kind `channel`). That needs the inbox: with chat-copy
 * off (`SAND_CHAT_COPY=0`), or `SAND_CHANNELS_ON_SERVER=0`, this computer
 * listens to every bot itself, as before.
 */
export const CHANNELS_ON_SERVER_ENV = "SAND_CHANNELS_ON_SERVER";

export function isChannelsOnServerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env[CHANNELS_ON_SERVER_ENV]?.trim().toLowerCase();
  return !(value === "0" || value === "off" || value === "false" || value === "no");
}

interface AuthApi { getAccessToken(options: { readonly backendUrl: string }): Promise<string>; }
interface ChatCopyApi {
  isEnabled(): boolean;
  onInboxKind(kind: string, handler: (message: { readonly agentId: string; readonly message: Record<string, unknown> }) => boolean): () => void;
}

export const channelsExtension = defineHostExtension<ChannelRuntime, { log(message: string): void }>({
  id: HostExtensions.Channels,
  dependencies: [HostExtensions.Transcript, HostExtensions.Auth, HostExtensions.ChatCopy],
  start: (context) => {
    const transcript = context.deps[HostExtensions.Transcript] as unknown as ChannelRuntimeTranscript;
    const auth = context.deps[HostExtensions.Auth] as AuthApi;
    const chatCopy = context.deps[HostExtensions.ChatCopy] as ChatCopyApi;
    const onServer = chatCopy.isEnabled() && isChannelsOnServerEnabled();
    const server = onServer ? createChannelServer({ getBackendUrl: () => getConfiguredBackendUrl(), getAccessToken: (options) => auth.getAccessToken(options) }) : undefined;
    const runtime = createChannelRuntime({ transcript, ...(server == null ? {} : { server }) });
    runtime.start();
    if (onServer) context.onStop(chatCopy.onInboxKind("channel", (waiting) => runtime.receiveFromServer(waiting.agentId, waiting.message)));
    context.onStop(() => runtime.stop());
    return runtime;
  },
});

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { nimPlugin } from "./src/channel.js";
import { setNimRuntime } from "./src/runtime.js";

// Version stamp — confirms new code is loaded
console.log("[nim] plugin module loaded — multi-instance v2");

// Export monitor functions
export { monitorNimProvider, stopNimMonitor, isNimMonitorRunning } from "./src/monitor.js";

// Export send functions
export { sendMessageNim, editMessageNim } from "./src/send.js";

// Export outbound functions
export {
  nimOutboundConfig,
  sendNimOutboundText,
  sendNimOutboundMedia,
  resolveNimOutboundTarget,
  nimOutbound,
  type NimOutboundResult,
} from "./src/outbound.js";

// Export media functions
export { sendImageNim, sendFileNim, sendAudioNim, sendVideoNim } from "./src/media.js";

// Export probe function
export { probeNim, probeNimWithConnect } from "./src/probe.js";

// Export channel plugin
export { nimPlugin } from "./src/channel.js";

// Export types
export type {
  NimConfig,
  NimMessageContext,
  NimSendResult,
  NimProbeResult,
  NimMediaInfo,
  NimMessageEvent,
  NimMessageType,
  NimP2pPolicy,
  ResolvedNimAccount,
  QChatConfig,
  QChatInboundMessage,
} from "./src/types.js";

// Export utility functions
export { normalizeNimTarget, looksLikeNimId, formatNimTarget } from "./src/targets.js";
export { resolveNimCredentials, resolveNimAccount, isNimP2pAllowed } from "./src/accounts.js";

// Export QChat functions
export { sendQChatMessage, setSharedQChatClient, getSharedQChatClient } from "./src/qchat-send.js";
export { parseQChatMessage, handleQChatInbound } from "./src/qchat-inbound.js";
export { QChatClient } from "./src/qchat-client.js";

/**
 * OpenClaw NIM Plugin
 *
 * A Clawdbot channel plugin for NetEase IM (NIM).
 */
const plugin = {
  id: "nimsuite-openclaw-nim-channel",
  name: "NIM",
  description: "NetEase IM (网易云信) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setNimRuntime(api.runtime as any);

    api.registerChannel({ plugin: nimPlugin });
  },
};

export default plugin;

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { beePlugin } from "./src/channel.js";
import { setBeeRuntime } from "./src/runtime.js";

// Export send functions
export { sendBeeText, splitMessageIntoChunks, getAccessToken, clearAccessToken } from "./src/send.js";

// Export outbound functions
export { beeOutboundConfig, sendBeeOutbound } from "./src/outbound.js";

// Export monitor functions
export { monitorBeeProvider, stopBeeMonitor, isBeeMonitorRunning } from "./src/monitor.js";

// Export channel plugin
export { beePlugin } from "./src/channel.js";

// Export types
export type { BeeConfig, BeeMessageEvent, BeeSendResult } from "./src/types.js";

/**
 * OpenClaw NetEase Bee Plugin
 *
 * A channel plugin for NetEase Bee (小蜜蜂) enterprise IM.
 * Receives messages via NIM SDK V2 and sends replies via the Bee HTTP API.
 */
const plugin = {
  id: "openclaw-netease-bee",
  name: "NetEase Bee",
  description: "NetEase Bee (小蜜蜂) channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setBeeRuntime(api.runtime);
    api.registerChannel({ plugin: beePlugin });
  },
};

export default plugin;

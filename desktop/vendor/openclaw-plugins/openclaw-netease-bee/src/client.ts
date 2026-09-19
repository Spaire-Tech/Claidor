/**
 * NetEase Bee NIM Client
 *
 * Connects to NIM SDK V2 with the fixed Bee appKey.
 * Only handles P2P messaging (no team/QChat support).
 */

import type { BeeConfig } from "./types.js";

/** Fixed NIM appKey for the Bee service */
const BEE_APP_KEY = "1c114416fb93ec4d5489e885a64eb6c5";

export interface BeeClientInstance {
  login(): Promise<boolean>;
  logout(): Promise<void>;
  onMessage(callback: (msgs: unknown[]) => void): void;
  onConnectionChange(callback: (state: "kickout" | "disconnected" | "connected") => void): void;
  destroy(): void;
}

type MessageCallback = (msgs: unknown[]) => void;
type ConnectionCallback = (state: "kickout" | "disconnected" | "connected") => void;

/**
 * Create a NIM SDK client for the Bee service.
 */
export async function createBeeClient(config: BeeConfig): Promise<BeeClientInstance> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NIM = (await import("nim-web-sdk-ng/dist/nodejs/nim.js" as string)).default;

  const nim = new NIM({
    appkey: BEE_APP_KEY,
    debugLevel: config.debug ? "debug" : "warn",
    apiVersion: "v2",
  });

  const messageCallbacks = new Set<MessageCallback>();
  const connectionCallbacks = new Set<ConnectionCallback>();

  // Forward NIM messages
  nim.V2NIMMessageService?.on("onReceiveMessages", (messages: unknown[]) => {
    for (const cb of messageCallbacks) {
      try { cb(messages); } catch { /* ignore */ }
    }
  });

  // Forward login status
  nim.V2NIMLoginService?.on("onLoginStatus", (status: number) => {
    // V2NIMLoginStatus: 1 = LOGINED
    if (status === 1) {
      for (const cb of connectionCallbacks) {
        try { cb("connected"); } catch { /* ignore */ }
      }
    } else if (status === 0) {
      for (const cb of connectionCallbacks) {
        try { cb("disconnected"); } catch { /* ignore */ }
      }
    }
  });

  nim.V2NIMLoginService?.on("onKickedOffline", () => {
    for (const cb of connectionCallbacks) {
      try { cb("kickout"); } catch { /* ignore */ }
    }
  });

  nim.V2NIMLoginService?.on("onDisconnected", () => {
    for (const cb of connectionCallbacks) {
      try { cb("disconnected"); } catch { /* ignore */ }
    }
  });

  return {
    login(): Promise<boolean> {
      return new Promise((resolve) => {
        const onStatus = (status: number) => {
          if (status === 1) {
            nim.V2NIMLoginService?.off?.("onLoginStatus", onStatus);
            resolve(true);
          }
        };
        nim.V2NIMLoginService?.on("onLoginStatus", onStatus);

        nim.V2NIMLoginService?.on("onLoginFailed", () => {
          nim.V2NIMLoginService?.off?.("onLoginStatus", onStatus);
          resolve(false);
        });

        nim.V2NIMLoginService?.login(config.clientId, config.secret, {}).catch(() => {
          resolve(false);
        });
      });
    },

    async logout(): Promise<void> {
      try {
        await nim.V2NIMLoginService?.logout();
      } catch { /* ignore */ }
    },

    onMessage(callback: MessageCallback): void {
      messageCallbacks.add(callback);
    },

    onConnectionChange(callback: ConnectionCallback): void {
      connectionCallbacks.add(callback);
    },

    destroy(): void {
      messageCallbacks.clear();
      connectionCallbacks.clear();
    },
  };
}

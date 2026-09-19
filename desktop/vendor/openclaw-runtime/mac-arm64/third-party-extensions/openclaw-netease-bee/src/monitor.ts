import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { BeeConfig } from "./types.js";
import { createBeeClient } from "./client.js";
import { parseBeeMessage, handleBeeMessage } from "./inbound.js";

interface MonitorState {
  running: boolean;
  abortController: AbortController;
}

const monitorStates = new Map<string, MonitorState>();

/** Persisted last-processed timestamps (survive reconnects, not restarts) */
const lastTimestamps = new Map<string, number>();

export async function monitorBeeProvider(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { cfg, runtime, abortSignal } = params;
  const beeCfg = (cfg.channels as Record<string, unknown>)?.[
    "netease-bee"
  ] as BeeConfig | undefined;

  if (!beeCfg?.clientId || !beeCfg?.secret) {
    console.error("[netease-bee] credentials not configured");
    return;
  }

  const monitorKey = beeCfg.clientId;

  if (monitorStates.has(monitorKey)) {
    throw new Error(`NetEase Bee monitor already running for ${monitorKey}`);
  }

  console.log(`[netease-bee] monitor starting — account: ${monitorKey}`);

  const client = await createBeeClient(beeCfg);
  const loginSuccess = await client.login();

  if (!loginSuccess) {
    console.error("[netease-bee] login failed — monitor not started");
    client.destroy();
    return;
  }

  console.log(`[netease-bee] login successful — account: ${monitorKey}`);

  const abortController = new AbortController();
  const state: MonitorState = { running: true, abortController };
  monitorStates.set(monitorKey, state);

  let lastProcessedTimestamp = lastTimestamps.get(monitorKey) ?? 0;

  client.onMessage(async (rawMessages) => {
    if (!state.running) return;

    for (const rawMsg of rawMessages) {
      try {
        const msg = parseBeeMessage(
          rawMsg as Record<string, unknown>,
          beeCfg.clientId,
          lastProcessedTimestamp,
        );
        if (!msg) continue;

        if (msg.timestamp > lastProcessedTimestamp) {
          lastProcessedTimestamp = msg.timestamp;
          lastTimestamps.set(monitorKey, lastProcessedTimestamp);
        }

        console.log(
          `[netease-bee] received message — sender: ${msg.senderId}, chat: ${msg.chatId}, id: ${msg.msgId}`,
        );

        await handleBeeMessage({ cfg, runtime, message: msg, config: beeCfg });
      } catch (err) {
        console.error(`[netease-bee] message handling failed — error: ${String(err)}`);
      }
    }
  });

  client.onConnectionChange((status) => {
    console.log(`[netease-bee] connection status changed — status: ${status}`);
    if (status === "kickout") {
      console.warn("[netease-bee] account kicked out — stopping monitor");
      stopBeeMonitor(beeCfg);
    }
  });

  console.log(`[netease-bee] monitor started — account: ${monitorKey}`);

  // Stay pending until abort fires
  await new Promise<void>((resolve) => {
    const onAbort = () => {
      console.log("[netease-bee] abort signal received — stopping monitor");
      stopBeeMonitor(beeCfg).finally(resolve);
    };

    if (abortSignal?.aborted) { onAbort(); return; }
    if (abortSignal) abortSignal.addEventListener("abort", onAbort, { once: true });
    abortController.signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

export async function stopBeeMonitor(config: BeeConfig): Promise<void> {
  const state = monitorStates.get(config.clientId);
  if (!state) return;

  state.running = false;
  monitorStates.delete(config.clientId);
  state.abortController.abort();
  console.log(`[netease-bee] monitor stopped — account: ${config.clientId}`);
}

export function isBeeMonitorRunning(config: BeeConfig): boolean {
  return monitorStates.has(config.clientId);
}

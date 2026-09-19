/**
 * NIM Monitor - 消息监听模块 (node-nim 版本)
 */

import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type {
  NimConfig,
  NimInstanceConfig,
  NimClientInstance,
  NimMessageEvent,
  NimP2pPolicy,
} from "./types.js";
import { createNimClient, clearNimClientCache } from "./client.js";
import { resolveNimCredentials, resolveNimAccountById } from "./accounts.js";
import { handleNimMessage } from "./bot.js";
import type { QChatClient } from "./qchat-client.js";
/** 监控状态 */
interface MonitorState {
  client: NimClientInstance;
  running: boolean;
  abortController: AbortController;
}

/** 监控状态缓存 */
const monitorStates = new Map<string, MonitorState>();

/**
 * 启动 NIM 消息监听（多实例版本）
 * accountId 指定要启动的实例配置键；底层 NIM 协议身份仍由 appKey+accid 决定。
 */
export async function monitorNimProvider(params: {
  cfg: OpenClawConfig;
  /** Stable config key for this instance. */
  accountId: string;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  /** QChat client to wire into the IM login lifecycle (two-phase). */
  qchatClient?: QChatClient | null;
}): Promise<void> {
  const { cfg, runtime, abortSignal } = params;

  // Resolve the specific instance config by accountId
  const rawNim = (cfg as any)?.channels?.nim;
  console.log(
    `[nim] monitor init — accountId: ${params.accountId}, channels.nim type: ${Array.isArray(rawNim) ? `array[${rawNim.length}]` : typeof rawNim}`,
  );

  const account = resolveNimAccountById({ cfg, accountId: params.accountId });
  console.log(
    `[nim] monitor init — account resolved: configured=${account.configured}, account=${account.account || "none"}`,
  );
  const nimInstCfg = account.configured ? account.config : undefined;

  if (!nimInstCfg) {
    console.error(
      `[nim] instance not configured — accountId: ${params.accountId}`,
    );
    return;
  }

  const creds = resolveNimCredentials(nimInstCfg);
  if (!creds) {
    console.error(
      `[nim] credentials not configured — accountId: ${params.accountId}`,
    );
    return;
  }
  const monitorKey = `${creds.appKey}:${creds.account}`;

  // 检查是否已有监控在运行
  if (monitorStates.has(monitorKey)) {
    console.log(`[nim] monitor already running — account: ${creds.account}`);
    // Throw so the gateway knows this is an error rather than a clean stop
    throw new Error(`NIM monitor already running for ${creds.account}`);
  }

  console.log(`[nim] monitor starting — account: ${creds.account}`);

  try {
    // 创建客户端（IM 初始化）
    const client = await createNimClient(nimInstCfg);

    // Sync P2P policy to the cached client — ensures the friend request listener
    // always uses the latest policy, even when the client is reused from cache.
    const liveP2pPolicy = (nimInstCfg.p2p?.policy as NimP2pPolicy) ?? "open";
    const liveP2pAllowFrom = nimInstCfg.p2p?.allowFrom ?? [];
    client.updateP2pPolicy(liveP2pPolicy, liveP2pAllowFrom);
    // QChat phase 1: register passive listeners AFTER IM init, BEFORE login
    // 复用 IM 创建的 NIM 实例，避免重复创建
    if (params.qchatClient) {
      params.qchatClient.setNim(client.nativeNim);
      console.log("[qchat] listeners registering — phase: pre-login");
      await params.qchatClient.initListeners();
    }

    // IM 登录
    const loginSuccess = await client.login();

    if (!loginSuccess) {
      return;
    }

    // QChat phase 2: activate (discover servers + subscribe) AFTER login success
    if (params.qchatClient) {
      console.log("[qchat] subscriptions activating — phase: post-login");
      try {
        await params.qchatClient.activate();
        console.log("[qchat] subscriptions active");
      } catch (qchatErr) {
        const errorMessage = (qchatErr as any)?.message ?? String(qchatErr);
        console.error(`[qchat] activation failed — error: ${errorMessage}`);
        // QChat failure should not prevent IM from working
      }
    }

    // 创建 AbortController 用于停止监控
    const abortController = new AbortController();

    // 保存监控状态
    const state: MonitorState = {
      client,
      running: true,
      abortController,
    };
    monitorStates.set(monitorKey, state);

    // 注册消息处理回调
    const messageHandler = async (msg: NimMessageEvent) => {
      if (!state.running) return;

      // 忽略自己发送的消息
      if (msg.from === creds.account) {
        return;
      }

      console.log(
        [
          "[nim]",
          "┌─────────────────────────────────────────┐",
          "│  📨 NIM MESSAGE RECEIVED                │",
          `│  from    : ${msg.from.padEnd(28)}│`,
          `│  type    : ${String(msg.type).padEnd(28)}│`,
          `│  session : ${String(msg.sessionType).padEnd(28)}│`,
          `│  to      : ${String(msg.to).padEnd(28)}│`,
          "└─────────────────────────────────────────┘",
          "",
        ].join("\n"),
      );

      try {
        await handleNimMessage({
          cfg,
          accountId: params.accountId,
          runtime,
          message: msg,
        });
      } catch (error) {
        const errorMessage = (error as any)?.message ?? String(error);
        console.error(`[nim] message handling failed — error: ${errorMessage}`);
      }
    };

    client.onMessage(messageHandler);

    // 注册连接状态回调
    client.onConnectionChange((status) => {
      console.log(`[nim] connection status changed — status: ${status}`);

      if (status === "kickout") {
        console.warn(`[nim] account kicked out — account: ${creds.account}`);
        stopNimMonitorByKey(monitorKey);
      } else if (status === "disconnected") {
        console.warn("[nim] disconnected — reconnecting");
        // SDK 会自动重连
      }
    });

    console.log(`[nim] monitor started — account: ${creds.account}`);

    // Keep the returned Promise pending until abort signal fires.
    // The OpenClaw gateway interprets a resolved/rejected Promise as
    // "channel stopped" and triggers auto-restart. We must stay pending.
    await new Promise<void>((resolve) => {
      const onAbort = () => {
        console.log("[nim] abort signal received — stopping monitor");
        stopNimMonitorByKey(monitorKey).finally(resolve);
      };

      if (abortSignal?.aborted) {
        onAbort();
        return;
      }

      if (abortSignal) {
        abortSignal.addEventListener("abort", onAbort, { once: true });
      }

      // Also resolve when the internal abortController fires (e.g. kickout)
      abortController.signal.addEventListener("abort", () => resolve(), {
        once: true,
      });
    });
  } catch (error) {
    const errorMessage = (error as any)?.message ?? String(error);
    console.error(`[nim] monitor start failed — error: ${errorMessage}`);
    throw error;
  }
}

/**
 * 按 monitorKey ("appKey:account") 停止监控 — 内部使用
 */
async function stopNimMonitorByKey(monitorKey: string): Promise<void> {
  const state = monitorStates.get(monitorKey);
  if (!state) {
    console.log(`[nim] monitor not running — key: ${monitorKey}`);
    return;
  }

  console.log(`[nim] monitor stopping — key: ${monitorKey}`);

  state.running = false;
  state.abortController.abort();

  try {
    await state.client.logout();
  } catch (error) {
    const errorMessage = (error as any)?.message ?? String(error);
    console.error(
      `[nim] logout failed during monitor stop — error: ${errorMessage}`,
    );
  }

  monitorStates.delete(monitorKey);
  console.log(`[nim] monitor stopped — key: ${monitorKey}`);
}

/**
 * 停止 NIM 消息监听（按实例配置）
 */
export async function stopNimMonitor(cfg: NimInstanceConfig): Promise<void> {
  const creds = resolveNimCredentials(cfg);
  if (!creds) {
    console.log("[nim] monitor stop skipped — missing credentials");
    return;
  }
  await stopNimMonitorByKey(`${creds.appKey}:${creds.account}`);
}

/**
 * 检查监控是否在运行
 */
export function isNimMonitorRunning(cfg: NimInstanceConfig): boolean {
  const creds = resolveNimCredentials(cfg);
  if (!creds) return false;
  const monitorKey = `${creds.appKey}:${creds.account}`;
  const state = monitorStates.get(monitorKey);
  return state?.running ?? false;
}

/**
 * 停止所有监控
 */
export async function stopAllNimMonitors(): Promise<void> {
  console.log("[nim] stopping all monitors");

  for (const [key, state] of monitorStates.entries()) {
    state.running = false;
    state.abortController.abort();
    try {
      await state.client.logout();
    } catch (error) {
      const errorMessage = (error as any)?.message ?? String(error);
      console.error(
        `[nim] monitor stop failed — account: ${key}, error: ${errorMessage}`,
      );
    }
  }

  monitorStates.clear();
  await clearNimClientCache();

  console.log("[nim] all monitors stopped");
}

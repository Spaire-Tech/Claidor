/**
 * NIM Send - 消息发送模块 (node-nim 版本)
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { NimInstanceConfig, NimSendResult, NimSessionType } from "./types.js";
import { createNimClient, getCachedNimClient } from "./client.js";
import { normalizeNimTarget } from "./targets.js";
import { resolveNimAccountById, resolveAllNimAccounts } from "./accounts.js";
import { V2NIMConst } from "@yxim/nim-bot";

/**
 * 常见错误码的中文描述映射
 */
const ERROR_CODE_DESCRIPTIONS: Record<number, string> = {
  // 反垃圾
  195001: "消息被本地反垃圾拦截",
  195002: "消息被云端反垃圾拦截",
  // 账号
  102404: "用户不存在",
  102426: "用户已被拉黑",
  102421: "用户被禁言",
  102422: "用户被禁用",
  // 消息
  107451: "消息命中反垃圾",
  107404: "消息不存在",
  107323: "消息发送频率超限",
  107410: "应用被禁言",
  // 群组
  108404: "群不存在",
  108306: "群普通成员禁言",
  108423: "群全体禁言",
  109424: "群成员被禁言",
  109404: "群成员不存在",
  // 通用
  414: "参数错误",
  416: "频率超限",
  403: "没有权限",
  404: "资源不存在",
  // 连接
  192001: "连接失败",
  192002: "连接超时",
  192004: "协议超时",
  191005: "请求超时",
};

/**
 * 获取 NIM 错误描述
 * 优先级：
 * 1. 中文错误描述映射表（用户友好）
 * 2. SDK 的 V2NIMErrorDesc[code]（code -> message 映射）
 * 3. "发送失败"（默认值）
 *
 * 注意：不使用 SDK 运行时的 errorMessage，因为它通常已经包含错误码格式如 "发送失败(195002)"
 */
export function getNimErrorDescription(errorCode?: number | string, _errorMessage?: string): string {
  if (errorCode === undefined) {
    return "发送失败";
  }

  const code = typeof errorCode === "string" ? parseInt(errorCode, 10) : errorCode;
  if (isNaN(code)) {
    return "发送失败";
  }

  // 1. 优先使用中文描述映射表
  if (ERROR_CODE_DESCRIPTIONS[code]) {
    return ERROR_CODE_DESCRIPTIONS[code];
  }

  // 2. 尝试从 V2NIMErrorDesc 中获取英文描述
  // V2NIMErrorDesc 结构: { code: message, ... } 如 { 195002: 'server anti-spam', ... }
  if (V2NIMConst?.V2NIMErrorDesc && V2NIMConst.V2NIMErrorDesc[code]) {
    return V2NIMConst.V2NIMErrorDesc[code];
  }

  // 3. 返回默认错误提示
  return "发送失败";
}

/**
 * 格式化发送失败消息
 */
export function formatSendFailureMessage(errorCode?: number | string, errorMessage?: string): string {
  const description = getNimErrorDescription(errorCode, errorMessage);
  const codeStr = errorCode !== undefined ? String(errorCode) : "unknown";

  // 如果 description 已经包含了错误码，不要再重复添加
  if (description.includes(`(${codeStr})`)) {
    return `消息发送失败：${description}`;
  }
  return `消息发送失败：${description}(${codeStr})`;
}

/**
 * Resolve the NIM instance config for a given accountId, or fall back to
 * the first configured instance if no accountId is provided.
 */
export function resolveInstCfg(cfg: OpenClawConfig, accountId?: string): NimInstanceConfig | null {
  if (accountId) {
    const acct = resolveNimAccountById({ cfg, accountId });
    return acct.configured ? acct.config : null;
  }
  const all = resolveAllNimAccounts({ cfg });
  return all.find((a) => a.configured)?.config ?? null;
}

/** 单条消息最大字符数 */
const MAX_MESSAGE_LENGTH = 5000;

/**
 * 发送文本消息
 */
export async function sendMessageNim(params: {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  sessionType?: NimSessionType;
  accountId?: string; // 🔥 Add accountId parameter
}): Promise<NimSendResult> {
  const { cfg, to, text, sessionType = "p2p", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId); // 🔥 Pass accountId

  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }

  const targetId = normalizeNimTarget(to);

  console.log(
    `[nim] 🔍 sendMessageNim — accountId: "${accountId ?? "none"}", target: ${targetId}, session: ${sessionType}, account in config: ${nimCfg.account}`,
  );

  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }

    console.log(`[nim] ✅ sendMessageNim using client — account: ${client.account}`);

    return await client.sendText(targetId, text, sessionType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 回复群组消息（引用原消息 + 强制推送给 @ 的人）
 */
export async function replyMessageNim(params: {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  originalMsg: unknown;
  forcePushAccountIds: string[];
  sessionType?: NimSessionType;
  accountId?: string; // 🔥 Add accountId parameter
}): Promise<NimSendResult> {
  const { cfg, to, text, originalMsg, forcePushAccountIds, sessionType = "team", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId); // 🔥 Pass accountId

  if (!nimCfg) {
    console.log("[nim] reply skipped — channel not configured");
    return { success: false, error: "NIM channel not configured" };
  }

  const targetId = normalizeNimTarget(to);
  console.log(
    `[nim] 🔍 replyMessageNim — accountId: "${accountId ?? "none"}", target: ${targetId}, session: ${sessionType}, force-push: [${forcePushAccountIds.join(", ")}], account in config: ${nimCfg.account}`,
  );

  try {
    let client = getCachedNimClient(nimCfg);
    console.log(`[nim] reply client — cached: ${client ? "yes" : "no"}, logged in: ${client?.loggedIn ? "yes" : "no"}`);
    if (!client || !client.loggedIn) {
      console.log("[nim] reply client initializing");
      client = await createNimClient(nimCfg);
      await client.login();
    }

    console.log(`[nim] ✅ replyMessageNim using client — account: ${client.account}`);
    const result = await client.replyText(targetId, text, originalMsg, forcePushAccountIds, sessionType);
    console.log(
      `[nim] reply completed — message id: ${result.msgId ?? "unknown"}, status: ${result.success ? "sent" : "failed"}`,
    );
    return result;
  } catch (error) {
    const errorMessage = (error as any)?.message ?? String(error);
    console.error(`[nim] reply exception — error: ${errorMessage}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 编辑消息（NIM 不支持真正的编辑，这里通过撤回+重发模拟）
 * 注意：这个功能可能需要根据实际 SDK 能力调整
 */
export async function editMessageNim(params: {
  cfg: OpenClawConfig;
  msgId: string;
  to: string;
  newText: string;
  sessionType?: NimSessionType;
}): Promise<NimSendResult> {
  // NIM 不支持编辑消息，直接发送新消息
  const { cfg, to, newText, sessionType = "p2p" } = params;
  return sendMessageNim({ cfg, to, text: newText, sessionType });
}

/**
 * 将长文本分割成多条消息
 */
export function splitMessageIntoChunks(text: string, maxLength: number = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 尝试在换行符处分割
    let splitIndex = remaining.lastIndexOf("\n", maxLength);

    // 如果没有换行符，尝试在空格处分割
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }

    // 如果还是找不到合适的分割点，强制在 maxLength 处分割
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * 发送流式消息（P2P）
 */
export async function sendStreamMessageNim(params: {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  sessionType?: NimSessionType;
  chunkIndex: number;
  isComplete: boolean;
  baseMessage?: any; // 基础消息体，复用于整个流式会话
  accountId?: string; // 🔥 Add accountId parameter
}): Promise<NimSendResult> {
  const { cfg, to, text, sessionType = "p2p", chunkIndex, isComplete, baseMessage, accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId); // 🔥 Pass accountId

  console.log(
    `[nim] 🔍 sendStreamMessageNim — accountId: "${accountId ?? "none"}", target: ${to}, session: ${sessionType}, chunk: ${chunkIndex}, complete: ${isComplete}, account in config: ${nimCfg?.account}`,
  );

  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }

  const targetId = normalizeNimTarget(to);

  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }

    // 准备流式消息参数
    const sendParams = {
      to: targetId,
      sessionType,
      baseMessage, // 传递基础消息体
      streamChunkParams: {
        text, // 流式文本内容通过 streamChunkParams 传递
        index: chunkIndex,
        finish: isComplete ? 1 : 0,
      },
    };

    // 调用 NIM SDK 的流式消息 API
    return await client.sendStreamMessage(sendParams);
  } catch (error) {
    console.error(`[nim] stream message failed — error: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 回复流式消息 (协议 30_37) - 用于群组消息的流式回复
 */
export async function replyStreamMessageNim(params: {
  cfg: OpenClawConfig;
  conversationId: string;
  text: string;
  chunkIndex: number;
  isComplete: boolean;
  baseMessage?: any; // 基础消息体，复用于整个流式会话
  replyMessage?: any; // 被回复的消息
  accountId?: string; // 🔥 Add accountId parameter
}): Promise<NimSendResult> {
  const { cfg, conversationId, text, chunkIndex, isComplete, baseMessage, replyMessage, accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId); // 🔥 Pass accountId

  console.log(
    `[nim] 🔍 replyStreamMessageNim — accountId: "${accountId ?? "none"}", conversation: ${conversationId}, chunk: ${chunkIndex}, complete: ${isComplete}, account in config: ${nimCfg?.account}`,
  );

  if (!nimCfg) {
    return { success: false, error: "NIM channel not configured" };
  }

  try {
    let client = getCachedNimClient(nimCfg);
    if (!client || !client.loggedIn) {
      client = await createNimClient(nimCfg);
      await client.login();
    }

    // 准备流式回复消息参数
    const streamChunkParams = {
      text, // 流式文本内容
      index: chunkIndex,
      finish: isComplete ? 1 : 0,
    };

    // 获取 messageService
    const messageService = client.nativeNim.V2NIMMessageService;

    // 准备消息对象 - 如果没有 baseMessage，需要先创建一个
    let message = baseMessage;
    if (!message) {
      // 第一次调用：创建基础消息体
      const messageCreator = client.nativeNim.V2NIMMessageCreator;
      message = messageCreator?.createTextMessage(text);
      if (!message) {
        return {
          success: false,
          error: "Failed to create base message",
        };
      }
    }

    const result = await messageService.replyStreamMessage(
      message, // 基础消息体（复用）
      replyMessage, // 被回复的消息
      {}, // sendMessageParams
      streamChunkParams, // 流式分片参数
    );

    return {
      success: true,
      msgId: result?.messageServerId,
      baseMessage: result,
    };
  } catch (error) {
    console.error(`[nim] reply stream message failed — error: ${error}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * NIM Client - @yxim/nim-bot V2 API 封装
 *
 * 使用网易云信 IM Bot SDK (@yxim/nim-bot)
 */

import type {
  NimInstanceConfig,
  NimClientInstance,
  NimMessageEvent,
  NimSendResult,
  NimSessionType,
  NimMessageType,
  NimAttachment,
  NimP2pPolicy,
} from "./types.js";
import { resolveNimCredentials, isNimP2pAllowed } from "./accounts.js";
import NIM from "@yxim/nim-bot";

// 客户端缓存
const clientCache = new Map<string, NimClientInstance>();

// 消息回调管理
const messageCallbacks = new Map<string, Set<(msg: NimMessageEvent) => void>>();
const connectionCallbacks = new Map<string, Set<(state: string) => void>>();

/**
 * 将 V2 消息类型转换为我们的类型
 */
function convertMessageType(v2Type: number): NimMessageType {
  // V2NIMMessageType 枚举
  const typeMap: Record<number, NimMessageType> = {
    0: "text",
    1: "image",
    2: "audio",
    3: "video",
    4: "geo",
    5: "notification",
    6: "file",
    10: "tip",
    11: "robot",
    100: "custom",
  };
  return typeMap[v2Type] || "unknown";
}

/**
 * 从 conversationId 解析会话类型
 * conversationId 格式: {appId}|{type}|{targetId}
 */
function parseConversationId(conversationId: string): {
  sessionType: NimSessionType;
  targetId: string;
} {
  const parts = conversationId.split("|");
  if (parts.length >= 3) {
    const typeNum = parseInt(parts[1], 10);
    const sessionType: NimSessionType =
      typeNum === 1 ? "p2p" : typeNum === 2 ? "team" : typeNum === 3 ? "superTeam" : "p2p";
    return { sessionType, targetId: parts[2] };
  }
  return { sessionType: "p2p", targetId: "" };
}

/**
 * 构建 conversationId
 */
function buildConversationId(nim: any, accountId: string, sessionType: NimSessionType): string {
  const conversationIdUtil = nim.V2NIMConversationIdUtil;
  if (conversationIdUtil) {
    switch (sessionType) {
      case "p2p":
        return conversationIdUtil.p2pConversationId(accountId) || "";
      case "team":
        return conversationIdUtil.teamConversationId(accountId) || "";
      case "superTeam":
        return conversationIdUtil.superTeamConversationId(accountId) || "";
      default:
        return conversationIdUtil.p2pConversationId(accountId) || "";
    }
  }
  // fallback: 手动构建
  const typeNum = sessionType === "p2p" ? 1 : sessionType === "team" ? 2 : 3;
  return `0|${typeNum}|${accountId}`;
}

/**
 * 解析 V2 消息附件
 */
function parseV2Attachment(msg: any): NimAttachment | undefined {
  const attachment = msg.attachment;
  if (!attachment) return undefined;

  return {
    name: attachment.name,
    size: attachment.size,
    url: attachment.url,
    ext: attachment.ext,
    md5: attachment.md5,
    w: attachment.width,
    h: attachment.height,
    dur: attachment.duration,
  };
}

/**
 * 将 V2 消息转换为我们的消息事件格式
 */
function convertV2ToMessageEvent(msg: any): NimMessageEvent {
  const { sessionType } = parseConversationId(msg.conversationId || "");

  // Extract forcePushAccountIds from V2 push config
  const forcePushAccountIds: string[] | undefined = msg.pushConfig?.forcePushAccountIds ?? undefined;

  return {
    msgId: String(msg.messageServerId || msg.messageClientId || ""),
    clientMsgId: String(msg.messageClientId || ""),
    sessionType,
    from: String(msg.senderId || ""),
    to: String(msg.receiverId || ""),
    type: convertMessageType(msg.messageType),
    text: msg.text || "",
    time: msg.createTime || Date.now(),
    attach: parseV2Attachment(msg),
    ext: msg.serverExtension ? JSON.parse(msg.serverExtension) : undefined,
    forcePushAccountIds,
    threadReply: msg.threadReply ?? undefined,
    fromNick: msg.senderName || undefined,
    rawMsg: msg,
  };
}

/**
 * 创建 NIM 客户端实例 (@yxim/nim-bot)
 */
export async function createNimClient(cfg: NimInstanceConfig): Promise<NimClientInstance> {
  const creds = resolveNimCredentials(cfg);
  if (!creds) {
    throw new Error("NIM credentials not configured");
  }

  const cacheKey = `${creds.appKey}:${creds.account}`;

  // 检查缓存
  const cached = clientCache.get(cacheKey);
  if (cached && cached.initialized) {
    return cached;
  }

  // Build privateConf from NIMOtherOptionsPrivateConfig fields (excluding data reporting)
  const privateConf: Record<string, unknown> = {};
  const adv = cfg.advanced;
  if (adv?.weblbsUrl) privateConf.weblbsUrl = adv.weblbsUrl;
  if (adv?.link_web) privateConf.link_web = adv.link_web;
  if (adv?.nos_uploader) privateConf.nos_uploader = adv.nos_uploader;
  if (adv?.nos_downloader_v2) privateConf.nos_downloader_v2 = adv.nos_downloader_v2;
  if (adv?.nosSsl !== undefined) privateConf.nosSsl = adv.nosSsl;
  if (adv?.nos_accelerate) privateConf.nos_accelerate = adv.nos_accelerate;
  if (adv?.nos_accelerate_host !== undefined) privateConf.nos_accelerate_host = adv.nos_accelerate_host;

  const otherOptions: Record<string, unknown> = {};
  if (Object.keys(privateConf).length > 0) {
    otherOptions.privateConf = privateConf;
  }
  // lbsUrls / linkUrl 必须放在 V2NIMLoginServiceConfig 下才能生效
  if (adv?.weblbsUrl || adv?.link_web) {
    const loginServiceConfig: Record<string, unknown> = {};
    if (adv?.weblbsUrl) loginServiceConfig.lbsUrls = [adv.weblbsUrl];
    if (adv?.link_web) loginServiceConfig.linkUrl = adv.link_web;
    otherOptions.V2NIMLoginServiceConfig = loginServiceConfig;
  }

  //@ts-ignore
  const nim = new NIM(
    {
      appkey: creds.appKey,
      apiVersion: "v2",
      debugLevel: cfg.advanced?.debug ? "debug" : "off",
    },
    Object.keys(otherOptions).length > 0 ? otherOptions : undefined,
  );

  if (Object.keys(privateConf).length > 0) {
    console.log(`[nim] privateConf applied — keys: ${Object.keys(privateConf).join(", ")}`);
  }

  let loggedIn = false;
  const msgCallbackSet = new Set<(msg: NimMessageEvent) => void>();
  const connCallbackSet = new Set<(state: string) => void>();

  messageCallbacks.set(cacheKey, msgCallbackSet);
  connectionCallbacks.set(cacheKey, connCallbackSet);

  // 获取服务引用
  const loginService = nim.V2NIMLoginService;
  const messageService = nim.V2NIMMessageService;
  const messageCreator = nim.V2NIMMessageCreator;
  const friendService = nim.V2NIMFriendService;

  // Mutable policy state — updated via updateP2pPolicy() when config reloads.
  // The friend request listener reads these on every request to avoid stale closures.
  let liveP2pPolicy = (cfg.p2p?.policy as NimP2pPolicy) ?? "open";
  let liveP2pAllowFrom: Array<string | number> = cfg.p2p?.allowFrom ?? [];

  if (friendService) {
    friendService.on("onFriendAddApplication", async (application: any) => {
      const applicantId = String(application.applicantAccountId ?? "");
      if (!applicantId) {
        console.log("[nim] friend request ignored — missing applicant id");
        return;
      }

      console.log(`[nim] friend request received — applicant: ${applicantId}`);

      const check = isNimP2pAllowed({
        p2pPolicy: liveP2pPolicy,
        allowFrom: liveP2pAllowFrom,
        senderId: applicantId,
      });

      if (!check.allowed) {
        console.log(
          `[nim] friend request not auto-accepted — applicant: ${applicantId}, reason: ${check.reason ?? "policy"}`,
        );
        return;
      }

      try {
        await friendService.acceptAddApplication(application);
        console.log(`[nim] friend request auto-accepted — applicant: ${applicantId}`);
      } catch (err: any) {
        const errorMessage = err?.message ?? err?.desc ?? String(err);
        console.error(`[nim] friend request accept failed — applicant: ${applicantId}, error: ${errorMessage}`);
      }
    });
    console.log(`[nim] friend request listener registered — policy: ${liveP2pPolicy}`);
  }

  if (!loginService || !messageService) {
    throw new Error("NIM SDK V2 services not available");
  }

  // 注册消息接收回调
  messageService.on("onReceiveMessages", (messages: any[]) => {
    console.log(`[nim] received messages — count: ${messages.length}`);

    const p2pMessages: any[] = [];
    const teamMessages: any[] = [];

    for (const msg of messages) {
      const event = convertV2ToMessageEvent(msg);
      console.log(
        `[nim] received message — sender: ${event.from}, type: ${event.type}, session: ${event.sessionType}, target: ${event.to}, message id: ${event.msgId}, timestamp: ${event.time}`,
      );

      msgCallbackSet.forEach((cb) => cb(event));

      if (event.sessionType === "p2p") {
        p2pMessages.push(msg);
      } else if (event.sessionType === "team" || event.sessionType === "superTeam") {
        teamMessages.push(msg);
      }
    }

    // 发送 P2P 已读回执（每条单独发，取最后一条即可覆盖之前）
    for (const msg of p2pMessages) {
      messageService.sendP2PMessageReceipt(msg).catch((err: any) => {
        console.error(`[nim] send p2p read receipt failed — error: ${err?.message ?? String(err)}`);
      });
    }

    // 发送群消息已读回执（每批最多 50 条）
    for (let i = 0; i < teamMessages.length; i += 50) {
      const batch = teamMessages.slice(i, i + 50);
      messageService.sendTeamMessageReceipts(batch).catch((err: any) => {
        console.error(`[nim] send team read receipt failed — error: ${err?.message ?? String(err)}`);
      });
    }
  });

  // 注册发送消息状态回调
  messageService.on("onSendMessage", (msg: any) => {
    console.log(
      `[nim] send status update — message id: ${msg.messageClientId ?? "unknown"}, state: ${msg.sendingState}`,
    );
  });

  // 注册登录状态回调
  loginService.on("onLoginStatus", (status: number) => {
    console.log(`[nim] login status changed — status: ${status}`);
    // V2NIMLoginStatus: 0=LOGOUT, 1=LOGINED, 2=LOGINING
    if (status === 1) {
      loggedIn = true;
      connCallbackSet.forEach((cb) => cb("connected"));
    } else if (status === 0) {
      loggedIn = false;
      connCallbackSet.forEach((cb) => cb("logout"));
    }
  });

  loginService.on("onKickedOffline", (detail: any) => {
    const detailMessage = detail?.reasonDesc ?? detail?.reason ?? String(detail);
    console.log(`[nim] kicked offline — reason: ${detailMessage}`);
    loggedIn = false;
    connCallbackSet.forEach((cb) => cb("kickout"));
  });

  loginService.on("onDisconnected", (error: any) => {
    const errorMessage = error?.message ?? error?.desc ?? String(error);
    console.log(`[nim] disconnected — error: ${errorMessage}`);
    connCallbackSet.forEach((cb) => cb("disconnected"));
  });

  const instance: NimClientInstance = {
    initialized: true,
    loggedIn: false,
    account: creds.account,
    nativeNim: nim,

    updateP2pPolicy(policy: NimP2pPolicy, allowFrom: Array<string | number>) {
      liveP2pPolicy = policy;
      liveP2pAllowFrom = allowFrom;
    },

    async login(): Promise<boolean> {
      try {
        // 🔥 Determine aiBot value based on legacyLogin config
        const legacyLogin = cfg.advanced?.legacyLogin ?? false;
        const aiBotValue = legacyLogin ? 0 : 2;

        console.log(
          `[nim] login started — account: ${creds.account}, aiBot: ${aiBotValue} (legacyLogin: ${legacyLogin})`,
        );
        await loginService.login(creds.account, creds.token, {
          aiBot: aiBotValue,
        });
        loggedIn = true;
        instance.loggedIn = true;
        console.log(
          [
            "[nim]",
            "╔══════════════════════════════════════╗",
            "║   ✓ NIM LOGIN SUCCESSFUL             ║",
            `║   account : ${creds.account.padEnd(22)}║`,
            `║   aiBot   : ${String(aiBotValue).padEnd(22)}║`,
            "╚══════════════════════════════════════╝",
            "",
          ].join("\n"),
        );
        return true;
      } catch (error: any) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(
          [
            "",
            "╔══════════════════════════════════════╗",
            "║   ✗ NIM LOGIN FAILED                 ║",
            `║   account : ${creds.account.padEnd(22)}║`,
            `║   error   : ${errorMessage.slice(0, 22).padEnd(22)}║`,
            "╚══════════════════════════════════════╝",
            "",
          ].join("\n"),
        );
        return false;
      }
    },

    async logout(): Promise<void> {
      try {
        await loginService.logout();
        loggedIn = false;
        instance.loggedIn = false;
        console.log(`[nim] logout complete — account: ${creds.account}`);
      } catch (error) {
        const errorMessage = (error as any)?.message ?? String(error);
        console.error(`[nim] logout failed — error: ${errorMessage}`);
      }
    },

    async sendText(to: string, text: string, sessionType: NimSessionType = "p2p"): Promise<NimSendResult> {
      try {
        const message = messageCreator?.createTextMessage(text);
        if (!message) {
          return { success: false, error: "Failed to create text message" };
        }

        const conversationId = buildConversationId(nim, to, sessionType);
        console.log(`[nim] sending text — target: ${conversationId}, session: ${sessionType}, length: ${text.length}`);

        // 🔥 等待 onSendMessage 回调来获取真正的发送结果
        return new Promise((resolve) => {
          let sendCallbackFired = false;
          const messageClientId = message.messageClientId;

          // 监听 onSendMessage 回调（会异步触发多次）
          // sendingState: 3 = 发送中, 1 = 已发送（成功或失败，需检查 errorCode）, 2 = 发送失败
          const sendListener = (msg: any) => {
            if (msg.messageClientId !== messageClientId) return;

            // 🔥 只有当 sendingState 不是 3（发送中）时才处理，跳过中间状态
            if (msg.sendingState === 3) {
              console.log(`[nim] text sending (intermediate) — messageClientId: ${messageClientId}`);
              return; // 跳过发送中的中间状态
            }

            if (sendCallbackFired) return;
            sendCallbackFired = true;
            messageService.off("onSendMessage", sendListener);

            // 检查发送状态：sendingState === 1 且 errorCode !== 200 表示失败
            // 或者 sendingState === 2 表示发送失败
            const errorCode = msg.messageStatus?.errorCode;
            const isFailed = msg.sendingState === 2 || (msg.sendingState === 1 && errorCode !== 200);

            if (isFailed) {
              const errorMessage = msg.messageStatus?.errorDesc || `发送失败(${errorCode})`;
              console.error(
                `[nim] text send failed (callback) — error: ${errorMessage}, code: ${errorCode}, messageServerId: ${msg.messageServerId}`,
              );
              resolve({
                success: false,
                error: errorMessage,
                errorCode: errorCode,
              });
            } else {
              console.log(`[nim] text sent (callback) — message id: ${msg.messageServerId ?? "unknown"}`);
              resolve({
                success: true,
                msgId: msg.messageServerId,
                clientMsgId: msg.messageClientId,
              });
            }
          };

          messageService.on("onSendMessage", sendListener);

          // 发送消息
          messageService
            .sendMessage(message, conversationId, {
              antispamConfig: {
                antispamEnabled: cfg.antispamEnabled ?? true,
              },
            })
            .catch((error: any) => {
              // 同步异常（如网络错误、参数错误等）
              if (!sendCallbackFired) {
                sendCallbackFired = true;
                messageService.off("onSendMessage", sendListener);
                const errorMessage = error?.message ?? error?.desc ?? String(error);
                const errorCode = error?.code ?? error?.res_code;
                console.error(
                  `[nim] text send failed (sync) — error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`,
                );
                resolve({
                  success: false,
                  error: errorMessage,
                  errorCode: errorCode,
                });
              }
            });

          // 超时保护（30秒）
          setTimeout(() => {
            if (!sendCallbackFired) {
              sendCallbackFired = true;
              messageService.off("onSendMessage", sendListener);
              console.error(`[nim] text send timeout — messageClientId: ${messageClientId}`);
              resolve({
                success: false,
                error: "发送超时",
                errorCode: 508,
              });
            }
          }, 30000);
        });
      } catch (error: any) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] text send failed — error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode: errorCode,
        };
      }
    },

    async sendImage(to: string, filePath: string, sessionType: NimSessionType = "p2p"): Promise<NimSendResult> {
      try {
        const { basename } = await import("path");
        const message = messageCreator?.createImageMessage(filePath, basename(filePath));
        if (!message) {
          return { success: false, error: "Failed to create image message" };
        }

        const conversationId = buildConversationId(nim, to, sessionType);
        console.log(
          `[nim] sending image — target: ${conversationId}, session: ${sessionType}, file: ${basename(filePath)}`,
        );

        const result = await messageService.sendMessage(message, conversationId, {});

        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId,
        };
      } catch (error: any) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] image send failed — error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode: errorCode,
        };
      }
    },

    async sendFile(to: string, filePath: string, sessionType: NimSessionType = "p2p"): Promise<NimSendResult> {
      try {
        const { basename } = await import("path");
        const message = messageCreator?.createFileMessage(filePath, basename(filePath));
        if (!message) {
          return { success: false, error: "Failed to create file message" };
        }

        const conversationId = buildConversationId(nim, to, sessionType);
        console.log(
          `[nim] sending file — target: ${conversationId}, session: ${sessionType}, file: ${basename(filePath)}`,
        );

        const result = await messageService.sendMessage(message, conversationId, {});

        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId,
        };
      } catch (error: any) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] file send failed — error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode: errorCode,
        };
      }
    },

    async sendAudio(
      to: string,
      filePath: string,
      duration: number,
      sessionType: NimSessionType = "p2p",
    ): Promise<NimSendResult> {
      try {
        const { basename } = await import("path");
        const message = messageCreator?.createAudioMessage?.(filePath, basename(filePath), "", duration);
        if (!message) {
          return { success: false, error: "Failed to create audio message" };
        }

        const conversationId = buildConversationId(nim, to, sessionType);
        const result = await messageService.sendMessage(message, conversationId, {});

        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId,
        };
      } catch (error: any) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] audio send failed — error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode: errorCode,
        };
      }
    },

    async sendVideo(
      to: string,
      filePath: string,
      duration: number,
      width: number,
      height: number,
      sessionType: NimSessionType = "p2p",
    ): Promise<NimSendResult> {
      try {
        const { basename } = await import("path");
        const message = messageCreator?.createVideoMessage?.(filePath, basename(filePath), "", duration, width, height);
        if (!message) {
          return { success: false, error: "Failed to create video message" };
        }

        const conversationId = buildConversationId(nim, to, sessionType);
        const result = await messageService.sendMessage(message, conversationId, {});

        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId,
        };
      } catch (error: any) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] video send failed — error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: errorMessage,
          errorCode: errorCode,
        };
      }
    },

    async replyText(
      to: string,
      text: string,
      originalMsg: unknown,
      forcePushAccountIds: string[],
      sessionType: NimSessionType = "p2p",
    ): Promise<NimSendResult> {
      try {
        const replyMsg = messageCreator?.createTextMessage(text);
        if (!replyMsg) {
          return {
            success: false,
            error: "Failed to create reply text message",
          };
        }

        const sendParams = {
          pushConfig: {
            forcePush: true,
            forcePushAccountIds,
          },

          antispamConfig: {
            antispamEnabled: cfg.antispamEnabled ?? true,
          },
        };

        const conversationId = buildConversationId(nim, to, sessionType);
        console.log(
          `[nim] sending reply — target: ${conversationId}, session: ${sessionType}, force-push: [${forcePushAccountIds.join(", ")}]`,
        );

        const result = await messageService.replyMessage(replyMsg, originalMsg as any, sendParams);
        console.log(`[nim] reply sent — message id: ${result.message?.messageServerId ?? "unknown"}`);
        return {
          success: true,
          msgId: result.message?.messageServerId,
          clientMsgId: result.message?.messageClientId,
        };
      } catch (error: any) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(`[nim] reply failed — error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`);
        return {
          success: false,
          error: error.message || error.desc || String(error),
        };
      }
    },

    async sendStreamMessage(params: {
      to: string;
      sessionType?: NimSessionType;
      baseMessage?: any; // 基础消息体，如果为空则创建新的
      streamChunkParams: {
        text: string;
        index?: number;
        finish?: number;
      };
    }): Promise<NimSendResult> {
      try {
        const { to, sessionType = "p2p", baseMessage, streamChunkParams } = params;

        // 使用传入的基础消息体，或创建新的（第一次调用时）
        let message = baseMessage;

        if (!message) {
          // 第一次调用：创建基础消息体
          message = messageCreator?.createTextMessage(streamChunkParams.text);
          if (!message) {
            return {
              success: false,
              error: "Failed to create base message for stream",
            };
          }
        }

        const conversationId = buildConversationId(nim, to, sessionType);

        const result = await messageService.sendStreamMessage(
          message, // 基础消息体（复用）
          conversationId, // 会话 ID
          {}, // sendParams
          streamChunkParams, // 流式分片参数（包含实际文本内容）
        );

        return {
          success: true,
          msgId: result.messageServerId,
          clientMsgId: result.messageClientId,
          baseMessage: result,
        };
      } catch (error: any) {
        const errorMessage = error?.message ?? error?.desc ?? String(error);
        const errorCode = error?.code ?? error?.res_code;
        console.error(
          `[nim] stream message failed — error: ${errorMessage}${errorCode ? ` (code: ${errorCode})` : ""}`,
        );
        return {
          success: false,
          error: error.message || error.desc || String(error),
        };
      }
    },

    onMessage(callback: (msg: NimMessageEvent) => void): void {
      msgCallbackSet.add(callback);
    },

    offMessage(callback: (msg: NimMessageEvent) => void): void {
      msgCallbackSet.delete(callback);
    },

    onConnectionChange(callback: (state: string) => void): void {
      connCallbackSet.add(callback);
    },

    async destroy(): Promise<void> {
      await instance.logout();
      await nim.destroy();
      clientCache.delete(cacheKey);
      messageCallbacks.delete(cacheKey);
      connectionCallbacks.delete(cacheKey);
    },
  };

  clientCache.set(cacheKey, instance);
  return instance;
}

/**
 * 获取缓存的客户端
 */
export function getCachedNimClient(cfg: NimInstanceConfig): NimClientInstance | undefined {
  const creds = resolveNimCredentials(cfg);
  if (!creds) return undefined;
  const cacheKey = `${creds.appKey}:${creds.account}`;
  return clientCache.get(cacheKey);
}

/**
 * 清除客户端缓存
 */
export async function clearNimClientCache(cfg?: NimInstanceConfig): Promise<void> {
  if (cfg) {
    const creds = resolveNimCredentials(cfg);
    if (!creds) return;
    const cacheKey = `${creds.appKey}:${creds.account}`;
    const client = clientCache.get(cacheKey);
    if (client) {
      await client.destroy();
    }
  } else {
    for (const client of clientCache.values()) {
      await client.destroy();
    }
    clientCache.clear();
  }
}

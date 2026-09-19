import { type OpenClawConfig, type RuntimeEnv } from "openclaw/plugin-sdk";
import type {
  NimConfig,
  NimP2pPolicy,
  NimTeamPolicy,
  NimMessageContext,
  NimMessageEvent,
  NimMessageType,
  NimSessionType,
} from "./types.js";
import { isNimP2pAllowed, isNimTeamAllowed } from "./accounts.js";
import { getNimRuntime } from "./runtime.js";
import {
  buildNimMediaPayload,
  inferMediaPlaceholder,
  sendImageNim,
  sendFileNim,
  sendAudioNim,
  sendVideoNim,
  inferMessageType,
} from "./media.js";
import {
  sendMessageNim,
  replyMessageNim,
  splitMessageIntoChunks,
  sendStreamMessageNim,
  replyStreamMessageNim,
  formatSendFailureMessage,
} from "./send.js";
import { resolveUserNick, resolveTeamName, buildConversationLabel } from "./name-resolver.js";
import { getCachedNimClient } from "./client.js";

/**
 * Map message type number to typed enum.
 */
function mapMessageType(msgType: number): NimMessageType {
  switch (msgType) {
    case 0:
      return "text";
    case 1:
      return "image";
    case 2:
      return "audio";
    case 3:
      return "video";
    case 4:
      return "geo";
    case 5:
      return "notification";
    case 6:
      return "file";
    case 10:
      return "tip";
    case 100:
      return "custom";
    default:
      return "unknown";
  }
}

/**
 * Extract text content from a NIM message.
 */
function extractMessageContent(message: NimMessageEvent): string {
  if (message.type === "text" && message.text) {
    return message.text;
  }

  if (message.type === "geo" && message.attach) {
    const geo = message.attach;
    return `[位置] ${geo.title ?? ""} (${geo.lat}, ${geo.lng})`;
  }

  if (message.type === "custom" && message.ext) {
    try {
      const parsed = message.ext;
      return (parsed as any).text || (parsed as any).content || JSON.stringify(parsed);
    } catch {
      return String(message.ext);
    }
  }

  // For media messages, return a placeholder with URL
  if (["image", "file", "audio", "video"].includes(message.type)) {
    const placeholder = inferMediaPlaceholder(message.type);
    const url = message.attach?.url;
    return url ? `${placeholder} ${url}` : placeholder;
  }

  return message.text || "";
}

function extractReferencedText(message: any): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  if (message.messageType === 0 && typeof message.text === "string") {
    return message.text;
  }

  if (typeof message.messageType !== "number" && typeof message.text === "string") {
    return message.text;
  }

  return null;
}

function deriveBotAccountId(accountId: string): string {
  const separatorIndex = accountId.indexOf(":");
  if (separatorIndex === -1) {
    return accountId;
  }
  return accountId.slice(separatorIndex + 1);
}

/**
 * Parse a NIM message event into a message context.
 */
export function parseNimMessageEvent(message: NimMessageEvent): NimMessageContext {
  const isDirectMessage = message.sessionType === "p2p";
  const sessionId = isDirectMessage ? `p2p-${message.from}` : `team-${message.to}`;

  return {
    id: message.clientMsgId,
    sessionId,
    sessionType: message.sessionType,
    senderId: message.from,
    type: message.type,
    text: extractMessageContent(message),
    timestamp: message.time,
    isDm: isDirectMessage,
    rawEvent: message,
  };
}

/**
 * Handle an incoming NIM message.
 * Supports P2P (DM) and team (group) messages.
 * Team messages are only processed when forcePushAccountIds includes the bot account.
 */
export async function handleNimMessage(params: {
  cfg: OpenClawConfig;
  /** Stable instance selector for the receiving account config. */
  accountId: string;
  message: NimMessageEvent;
  runtime?: RuntimeEnv;
}): Promise<void> {
  const { cfg, accountId, message, runtime } = params;
  // Resolve this specific instance config for policy & account lookups
  const { resolveNimAccountById } = await import("./accounts.js");
  const account = resolveNimAccountById({ cfg, accountId });
  const nimCfg = account.configured ? account.config : undefined;
  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;
  const botAccount =
    (nimCfg?.account ? String(nimCfg.account) : "") || account.account || deriveBotAccountId(accountId);

  const isP2P = message.sessionType === "p2p";
  const isTeam = message.sessionType === "team" || message.sessionType === "superTeam";

  if (!isP2P && !isTeam) {
    log(`[nim] ignoring message — session: ${message.sessionType}`);
    return;
  }

  // For team messages, only process when forcePushAccountIds includes the bot
  if (isTeam) {
    const forcePushIds = message.forcePushAccountIds ?? [];
    log(`[nim] team mention gate — botAccount: ${botAccount || "unknown"}, forcePush: [${forcePushIds.join(", ")}]`);
    if (!forcePushIds.includes(botAccount)) {
      log(`[nim] ignoring team message — reason: bot not in force-push list`);
      return;
    }
    log(`[nim] team message accepted — reason: bot in force-push list`);
  }

  const ctx = parseNimMessageEvent(message);

  // ── Access control ──
  if (isP2P) {
    // P2P policy: open / allowlist / disabled
    const p2pPolicy = (nimCfg?.p2p?.policy ?? "open") as NimP2pPolicy;
    const configAllowFrom = nimCfg?.p2p?.allowFrom ?? [];

    const result = isNimP2pAllowed({
      p2pPolicy,
      allowFrom: configAllowFrom,
      senderId: ctx.senderId,
    });

    if (!result.allowed) {
      if (result.reason === "disabled") {
        log(`[nim] p2p disabled — sender: ${ctx.senderId}`);
      } else {
        log(`[nim] p2p blocked — sender: ${ctx.senderId}, policy: ${p2pPolicy}`);
      }
      return;
    }
  }

  if (isTeam) {
    // Team policy: open / allowlist (by group ID + optional sender) / disabled
    const teamPolicy = (nimCfg?.team?.policy ?? "open") as NimTeamPolicy;
    const teamIds = nimCfg?.team?.allowFrom ?? [];

    if (
      !isNimTeamAllowed({
        teamPolicy,
        teamIds,
        groupId: message.to,
        senderId: ctx.senderId,
        sessionType: message.sessionType as "team" | "superTeam",
      })
    ) {
      log(`[nim] team message blocked — group: ${message.to}, sender: ${ctx.senderId}, policy: ${teamPolicy}`);
      return;
    }
  }

  try {
    const core = getNimRuntime();

    // For P2P: reply target is the sender; for team: reply target is the team/group ID
    const replyTarget = isTeam ? message.to : ctx.senderId;
    const nimFrom = `nim:${ctx.senderId}`;
    const nimTo = isTeam ? `team:${message.to}` : `user:${ctx.senderId}`;
    const chatType = isTeam ? "group" : "direct";
    const peerKind = isTeam ? "group" : "direct";
    const peerId = isTeam ? message.to : ctx.senderId;
    const sessionType: NimSessionType = isTeam ? message.sessionType : "p2p";

    //@ts-ignore
    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "nim",
      accountId,
      peer: {
        kind: peerKind,
        id: peerId,
      },
    });

    if (!route) {
      log(`[nim] route unresolved — peer: ${peerId}`);
      return;
    }

    // Handle media if present
    const mediaMaxBytes = (nimCfg?.advanced?.mediaMaxMb ?? 30) * 1024 * 1024;
    const mediaList = [];

    if (["image", "file", "audio", "video"].includes(ctx.type)) {
      const attachUrl = message.attach?.url;
      if (attachUrl) {
        const mediaInfo = {
          type: ctx.type as "image" | "file" | "audio" | "video",
          url: attachUrl,
          name: message.attach?.name,
          size: message.attach?.size,
        };
        mediaList.push(mediaInfo);
      }
    }

    const mediaPayload = buildNimMediaPayload(mediaList);

    // ── Resolve display names ──
    // (must happen before system event so labels use nicknames)
    const nimClient = getCachedNimClient(nimCfg!);
    const nativeNim = nimClient?.nativeNim;

    const senderDisplayName = nativeNim
      ? await resolveUserNick(nativeNim, ctx.senderId, message.fromNick)
      : message.fromNick || ctx.senderId;

    let conversationLabel: string;
    let groupSubject: string | undefined;
    let teamName: string | undefined;

    if (isTeam) {
      teamName = nativeNim
        ? await resolveTeamName(nativeNim, message.to, message.sessionType as "team" | "superTeam")
        : message.to;
      log(`[nim] resolved team name — teamId: ${message.to}, teamName: ${teamName}, hasNativeNim: ${!!nativeNim}`);
      conversationLabel = buildConversationLabel("team", teamName);
      groupSubject = buildConversationLabel("team", teamName);
    } else {
      conversationLabel = buildConversationLabel("p2p", senderDisplayName);
    }

    let inboundPromptText = ctx.text;
    if (
      message.threadReply &&
      nativeNim?.V2NIMMessageService &&
      typeof ctx.text === "string" &&
      ctx.text.trim().length > 0
    ) {
      try {
        const referredMessages = await nativeNim.V2NIMMessageService.getMessageListByRefers([message.threadReply]);
        const repliedMessage = Array.isArray(referredMessages)
          ? referredMessages[0]
          : Array.isArray(referredMessages?.messages)
            ? referredMessages.messages[0]
            : Array.isArray(referredMessages?.data)
              ? referredMessages.data[0]
              : undefined;
        const repliedText = extractReferencedText(repliedMessage);

        if (repliedText && repliedText.trim().length > 0) {
          inboundPromptText = `${repliedText}\n${ctx.text}`;
          log(`[nim] thread reply resolved — current: ${ctx.id}, referenced text length: ${repliedText.length}`);
        } else {
          log(`[nim] thread reply resolved without text payload — current: ${ctx.id}`);
        }
      } catch (err) {
        log(`[nim] thread reply lookup failed — current: ${ctx.id}, error: ${String(err)}`);
      }
    }

    // ── System event (uses resolved display names) ──
    const preview = inboundPromptText.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel = isTeam
      ? ` From ${senderDisplayName} in ${teamName ?? message.to}`
      : ` From ${senderDisplayName}`;

    //@ts-ignore
    core.system.enqueueSystemEvent(`${inboundLabel}`, {
      sessionKey: route.sessionKey,
      contextKey: `nim:message:${ctx.sessionId}:${ctx.id}`,
    });
    //@ts-ignore
    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: inboundPromptText,
      RawBody: inboundPromptText,
      CommandBody: inboundPromptText,
      From: nimFrom,
      To: nimTo,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: chatType,
      ConversationLabel: conversationLabel,
      SenderName: senderDisplayName,
      SenderId: ctx.senderId,
      Provider: "nim" as const,
      Surface: "nim" as const,
      MessageSid: ctx.id,
      Timestamp: ctx.timestamp,
      CommandAuthorized: true,
      OriginatingChannel: "nim" as const,
      OriginatingTo: nimTo,
      ...(isTeam ? { GroupSubject: groupSubject ?? message.to, WasMentioned: true } : {}),
      ...mediaPayload,
    });

    const chunkLimit = nimCfg?.advanced?.textChunkLimit ?? 4000;
    let streamChunkIndex = 0;
    let baseMessage: any = null;

    const deliver = async (payload: any, info?: { kind: string }): Promise<void> => {
      const mediaList = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
      const text = payload.text ?? "";
      const kind = info?.kind ?? "unknown";

      const isTeamMessage = sessionType === "team" || sessionType === "superTeam";

      // Stream blocks via NIM SDK stream API; fall back to normal send on failure
      if (text && kind === "block") {
        try {
          let result: any;

          if (isTeamMessage) {
            result = await replyStreamMessageNim({
              cfg,
              conversationId: ctx.sessionId,
              text,
              chunkIndex: streamChunkIndex++,
              isComplete: false,
              baseMessage,
              replyMessage: message.rawMsg,
              accountId, // 🔥 Pass accountId
            });
          } else {
            result = await sendStreamMessageNim({
              cfg,
              to: ctx.senderId,
              text,
              sessionType,
              chunkIndex: streamChunkIndex++,
              isComplete: false,
              baseMessage,
              accountId, // 🔥 Pass accountId
            });
          }

          if (result?.success && result.baseMessage) {
            baseMessage = result.baseMessage;
          }

          if (result?.success) {
            return;
          }
        } catch (err) {
          log(`[nim] stream send failed, falling back to normal send — error: ${String(err)}`);
        }
      }

      // Normal (non-stream) send
      if (!text && mediaList.length === 0) {
        log("[nim] skipping empty reply payload");
        return;
      }

      try {
        // Send media first if present
        if (mediaList.length > 0) {
          for (const mediaUrl of mediaList) {
            const mediaType = inferMessageType(mediaUrl);
            log(`[nim] sending media — target: ${ctx.senderId}, type: ${mediaType}, file: ${mediaUrl}`);

            if (mediaType === "image") {
              await sendImageNim({
                cfg,
                to: ctx.senderId,
                imagePath: mediaUrl,
              });
            } else if (mediaType === "audio") {
              await sendAudioNim({
                cfg,
                to: ctx.senderId,
                audioPath: mediaUrl,
                duration: 0,
              });
            } else if (mediaType === "video") {
              await sendVideoNim({
                cfg,
                to: ctx.senderId,
                videoPath: mediaUrl,
                duration: 0,
                width: 1920,
                height: 1080,
              });
            } else {
              await sendFileNim({ cfg, to: ctx.senderId, filePath: mediaUrl });
            }
            log(`[nim] media sent — target: ${ctx.senderId}`);
          }
        }

        // Send text if present
        if (text) {
          const isTeamReply = (sessionType === "team" || sessionType === "superTeam") && message.rawMsg && ctx.senderId;
          log(
            `[nim] reply mode selected — session: ${sessionType}, reply: ${isTeamReply ? "quoted" : "standard"}, streaming: ${isTeamMessage ? "disabled (team message)" : "enabled for P2P"}`,
          );
          const chunks = splitMessageIntoChunks(text, chunkLimit);
          log(`[nim] reply chunking — chunks: ${chunks.length}, limit: ${chunkLimit}`);
          for (const chunk of chunks) {
            // 🔥 Debug: log accountId before sending
            log(
              `[nim] 🔍 preparing to send — accountId: "${accountId}", target: ${ctx.senderId}, session: ${sessionType}, isTeamReply: ${isTeamReply}`,
            );

            if (isTeamReply) {
              log(
                `[nim] sending reply chunk — target: ${ctx.senderId}, session: ${sessionType}, force-push: [${ctx.senderId}]`,
              );
              const result = await replyMessageNim({
                cfg,
                to: ctx.senderId,
                text: chunk,
                originalMsg: message.rawMsg,
                forcePushAccountIds: [ctx.senderId],
                sessionType,
                accountId, // 🔥 Pass accountId
              });
              log(
                `[nim] reply result — message id: ${result.msgId ?? "unknown"}, status: ${result.success ? "sent" : "failed"}`,
              );

              // 🔥 Send failure notification for team reply
              if (!result.success) {
                const failureMessage = formatSendFailureMessage(result.errorCode, result.error);
                log(`[nim] sending team failure notification — target: ${message.to}, message: ${failureMessage}`);
                try {
                  const notifyResult = await replyMessageNim({
                    cfg,
                    to: message.to,
                    text: failureMessage,
                    originalMsg: message.rawMsg,
                    forcePushAccountIds: [ctx.senderId],
                    sessionType,
                    accountId,
                  });
                  if (notifyResult.success) {
                    log(`[nim] team failure notification sent — message id: ${notifyResult.msgId ?? "unknown"}`);
                  } else {
                    log(
                      `[nim] team failure notification also failed — error: ${notifyResult.error ?? "unknown"}, not retrying`,
                    );
                  }
                } catch (notifyErr) {
                  log(`[nim] team failure notification exception — error: ${String(notifyErr)}, not retrying`);
                }
              }
            } else {
              const result = await sendMessageNim({
                cfg,
                to: ctx.senderId,
                text: chunk,
                sessionType,
                accountId, // 🔥 Pass accountId
              });
              if (!result.success) {
                log(`[nim] send failed — target: ${ctx.senderId}, error: ${result.error ?? "unknown"}`);

                // 🔥 Send failure notification to user
                const failureMessage = formatSendFailureMessage(result.errorCode, result.error);
                log(`[nim] sending failure notification — target: ${ctx.senderId}, message: ${failureMessage}`);
                try {
                  const notifyResult = await sendMessageNim({
                    cfg,
                    to: ctx.senderId,
                    text: failureMessage,
                    sessionType,
                    accountId,
                  });
                  if (notifyResult.success) {
                    log(`[nim] failure notification sent — message id: ${notifyResult.msgId ?? "unknown"}`);
                  } else {
                    log(
                      `[nim] failure notification also failed — error: ${notifyResult.error ?? "unknown"}, not retrying`,
                    );
                  }
                } catch (notifyErr) {
                  log(`[nim] failure notification exception — error: ${String(notifyErr)}, not retrying`);
                }
              }
            }
            log(
              `[nim] reply chunk sent — target: ${ctx.senderId}, length: ${chunk.length}${isTeamReply ? `, mention: ${ctx.senderId}` : ""}`,
            );
          }
        }
      } catch (err) {
        log(`[nim] reply send failed — error: ${String(err)}`);
        throw err;
      }
    };

    log(`[nim] dispatching to agent — session: ${route.sessionKey}, chat: ${chatType}, agent: ${route.agentId}`);

    //@ts-ignore
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg,
      dispatcherOptions: {
        deliver,
        humanDelay: { mode: "off" },
        onIdle: () => {
          log(`[nim] reply dispatcher idle`);
        },
        onError: (err: Error, info: { kind: string }) => {
          log(`[nim] reply dispatcher error — kind: ${info.kind}, error: ${String(err)}`);
        },
        onSkip: (_payload: unknown, info: { kind: string; reason: string }) => {
          log(`[nim] reply skipped by normalizer — kind: ${info.kind}, reason: ${info.reason}`);
        },
      },
      replyOptions: {
        channel: "nim" as const,
        targetId: ctx.senderId,
      },
    });

    log(`[nim] dispatch complete`);
  } catch (err) {
    error(`[nim] dispatch failed — error: ${String(err)}`);
    if (err instanceof Error && err.stack) {
      error(`[nim] dispatch stack — error: ${err.stack}`);
    }
  }
}

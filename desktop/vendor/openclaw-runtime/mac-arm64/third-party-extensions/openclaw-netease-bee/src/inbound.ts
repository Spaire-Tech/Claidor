import type { OpenClawConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import type { BeeConfig, BeeMessageEvent } from "./types.js";
import { getBeeRuntime } from "./runtime.js";
import { sendBeeText } from "./send.js";

/** Message deduplication cache: msgId → timestamp */
const processedMessages = new Map<string, number>();
const DEDUP_TTL = 5 * 60 * 1000;

function isProcessed(msgId: string): boolean {
  const now = Date.now();
  // Prune old entries
  for (const [id, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL) processedMessages.delete(id);
  }
  if (processedMessages.has(msgId)) return true;
  processedMessages.set(msgId, now);
  return false;
}

/**
 * Parse a raw NIM message into a BeeMessageEvent.
 * Returns null if the message should be ignored.
 */
export function parseBeeMessage(
  msg: Record<string, unknown>,
  selfAccountId: string,
  lastProcessedTimestamp: number,
): BeeMessageEvent | null {
  const msgId = String(msg.messageServerId ?? msg.messageClientId ?? "");

  // Only process online messages (source === 1)
  const messageSource = (msg.messageSource as number) ?? 0;
  if (messageSource !== 1) return null;

  // Ignore self-sent messages
  const rawSenderId = String(msg.senderId ?? "");
  if (rawSenderId === selfAccountId) return null;

  // Deduplication
  if (isProcessed(msgId)) return null;

  // Skip messages older than last processed timestamp
  const createTime = (msg.createTime as number) ?? 0;
  if (createTime > 0 && createTime <= lastProcessedTimestamp) return null;

  const messageType = msg.messageType as number;

  // Handle type=100 (Bee custom message format)
  if (messageType === 100) {
    return parseCustomBeeMessage(msg, msgId, createTime);
  }

  // Handle plain text messages
  if (messageType === 0) {
    const text = String(msg.text ?? "").trim();
    if (!text) return null;
    const conversationId = String(msg.conversationId ?? rawSenderId);
    return {
      msgId,
      senderId: rawSenderId,
      chatId: conversationId,
      text,
      timestamp: createTime || Date.now(),
      rawNimMsg: msg,
    };
  }

  return null;
}

function parseCustomBeeMessage(
  msg: Record<string, unknown>,
  msgId: string,
  createTime: number,
): BeeMessageEvent | null {
  const rawContent =
    (msg.attachment as Record<string, unknown> | undefined)?.raw ??
    msg.text ??
    "";

  if (!rawContent) return null;

  let outer: Record<string, unknown>;
  try {
    outer = typeof rawContent === "string" ? JSON.parse(rawContent) : (rawContent as Record<string, unknown>);
  } catch {
    return null;
  }

  const beeSenderId = String(outer.senderId ?? msg.senderId ?? "");
  const beeChatId = String(outer.chatId ?? "");

  let inner: { text?: string; subType?: number };
  try {
    inner =
      typeof outer.content === "string"
        ? JSON.parse(outer.content)
        : ({ text: outer.content } as { text?: string });
  } catch {
    inner = { text: String(outer.content ?? "") };
  }

  // Only process subType=1 (text) or absent subType
  if (inner.subType !== undefined && inner.subType !== 1) return null;

  const text = String(inner.text ?? "").trim();
  if (!text) return null;

  return {
    msgId,
    senderId: beeSenderId,
    chatId: beeChatId || beeSenderId,
    text,
    timestamp: createTime || Date.now(),
    rawNimMsg: msg,
  };
}

type ReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
};

function createBeeReplyDispatcher(params: {
  cfg: OpenClawConfig;
  agentId: string;
  runtime: RuntimeEnv;
  chatId: string;
  config: BeeConfig;
}) {
  const { runtime, chatId, config } = params;
  const core = getBeeRuntime();
  const log = runtime?.log ?? console.log;

  const deliver = async (payload: ReplyPayload): Promise<void> => {
    const text = payload.text ?? "";
    if (!text) return;
    const result = await sendBeeText(config, chatId, text);
    if (!result.success) {
      log(`[netease-bee] send failed — chat: ${chatId}, error: ${result.error}`);
    }
  };

  const { dispatcher, replyOptions: sdkReplyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      deliver,
      humanDelay: { mode: "off" },
      onIdle: () => {},
      onError: (err: Error, info: { kind: string }) => {
        log(`[netease-bee] dispatcher error — kind: ${info.kind}, error: ${String(err)}`);
      },
      onSkip: (_payload: unknown, info: { kind: string; reason: string }) => {
        log(`[netease-bee] reply skipped — kind: ${info.kind}, reason: ${info.reason}`);
      },
    });

  return {
    dispatcher,
    replyOptions: {
      channel: "netease-bee" as const,
      targetId: chatId,
      ...sdkReplyOptions,
    },
    markDispatchIdle,
  };
}

/**
 * Dispatch an inbound Bee message to the OpenClaw agent runtime.
 */
export async function handleBeeMessage(params: {
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  message: BeeMessageEvent;
  config: BeeConfig;
}): Promise<void> {
  const { cfg, runtime, message, config } = params;
  const { senderId, chatId, text, msgId, timestamp } = message;
  const log = runtime.log ?? console.log;
  const error = runtime.error ?? console.error;

  let core: ReturnType<typeof getBeeRuntime>;
  try {
    core = getBeeRuntime();
  } catch (err) {
    error(`[netease-bee] runtime not initialized — error: ${String(err)}`);
    return;
  }

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "netease-bee",
    peer: { kind: "dm", id: chatId },
  });

  if (!route) {
    log(`[netease-bee] route unresolved — chat: ${chatId}`);
    return;
  }

  const preview = text.replace(/\s+/g, " ").slice(0, 160);
  core.system.enqueueSystemEvent(`NetEase Bee DM from ${senderId}: ${preview}`, {
    sessionKey: route.sessionKey,
    contextKey: `netease-bee:message:${chatId}:${msgId}`,
  });

  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "NetEase Bee",
    from: senderId,
    timestamp: new Date(timestamp),
    envelope: envelopeOptions,
    body: text,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: text,
    CommandBody: text,
    From: `netease-bee:${senderId}`,
    To: `netease-bee:${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    SenderName: senderId,
    SenderId: senderId,
    Provider: "netease-bee" as const,
    Surface: "netease-bee" as const,
    MessageSid: msgId,
    Timestamp: timestamp,
    CommandAuthorized: true,
    OriginatingChannel: "netease-bee" as const,
    OriginatingTo: `netease-bee:${chatId}`,
  });

  const { dispatcher, replyOptions, markDispatchIdle } = createBeeReplyDispatcher({
    cfg,
    agentId: route.agentId,
    runtime,
    chatId,
    config,
  });

  log(
    `[netease-bee] dispatching to agent — session: ${route.sessionKey}, agent: ${route.agentId}, chat: ${chatId}`,
  );

  try {
    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();
    log(
      `[netease-bee] dispatch complete — final: ${counts.final}, tool: ${counts.tool}, queued: ${queuedFinal}`,
    );
  } catch (err) {
    error(`[netease-bee] dispatch failed — error: ${String(err)}`);
  }
}

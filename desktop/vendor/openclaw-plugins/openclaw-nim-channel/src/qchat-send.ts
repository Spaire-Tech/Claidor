/**
 * QChat Send - 圈组消息发送模块
 */

import { getNimRuntime } from "./runtime.js";
import { QChatClient } from "./qchat-client.js";

/** Per-instance QChat clients keyed by the stable account config key. */
const qchatClients = new Map<string, QChatClient>();

/** Per-instance reply-enabled flags keyed by accountId */
const qchatReplyEnabledMap = new Map<string, boolean>();

export function setQchatReplyEnabled(
  accountId: string,
  enabled: boolean,
): void {
  qchatReplyEnabledMap.set(accountId, enabled);
}

export function isQchatReplyEnabled(accountId?: string): boolean {
  if (!accountId) {
    // Legacy: return true only if ALL instances allow replies (conservative)
    if (qchatReplyEnabledMap.size === 0) return true;
    return [...qchatReplyEnabledMap.values()].some(Boolean);
  }
  return qchatReplyEnabledMap.get(accountId) ?? true;
}

export function setSharedQChatClient(
  accountId: string,
  client: QChatClient | null,
): void {
  if (client === null) {
    qchatClients.delete(accountId);
  } else {
    qchatClients.set(accountId, client);
  }
}

export function getQchatClientForAccount(
  accountId: string,
): QChatClient | null {
  return qchatClients.get(accountId) ?? null;
}

/** @deprecated Use getQchatClientForAccount instead */
export function getSharedQChatClient(): QChatClient | null {
  // Return first available client for legacy callers
  const first = qchatClients.values().next();
  return first.done ? null : first.value;
}

/**
 * Send a text message to a QChat channel.
 * Target format: "serverId:channelId"
 * accountId is used to select the correct QChat client.
 */
export async function sendQChatMessage(
  to: string,
  text: string,
  opts?: { accountId?: string; replyMessage?: unknown },
): Promise<{ ok: boolean; messageId: string; error?: Error }> {
  const log = (getNimRuntime() as any).logging.getChildLogger({
    channel: "nim-qchat",
  });
  const accountId = opts?.accountId;

  // Hard gate: reject all sends when policy is disabled for this instance
  if (!isQchatReplyEnabled(accountId)) {
    log.info(
      `[qchat] send suppressed — reason: policy is disabled, target: ${to}, instance: ${accountId ?? "unknown"}`,
    );
    return { ok: true, messageId: "" };
  }

  const [serverId, channelId] = to.split(":");
  if (!serverId || !channelId) {
    log.error(`[qchat] invalid target — value: ${to}`);
    return {
      ok: false,
      messageId: "",
      error: new Error(
        `Invalid QChat target "${to}" — expected "serverId:channelId"`,
      ),
    };
  }

  // 🔥 Debug: log all available clients and the requested accountId
  const allClientKeys = Array.from(qchatClients.keys());
  log.info(
    `[qchat] 🔍 selecting client — requested accountId: "${accountId ?? "none"}", available clients: [${allClientKeys.join(", ")}], count: ${allClientKeys.length}`,
  );

  // Select client for this instance, or fall back to first available
  const client = accountId
    ? (qchatClients.get(accountId) ?? null)
    : getSharedQChatClient();

  if (!client) {
    log.error(
      `[qchat] send failed — reason: client not connected, instance: ${accountId ?? "unknown"}, available: [${allClientKeys.join(", ")}]`,
    );
    return {
      ok: false,
      messageId: "",
      error: new Error("QChat client not connected"),
    };
  }

  log.info(
    `[qchat] ✅ client selected — accountId: "${accountId ?? "fallback"}", using client for: ${client ? "found" : "none"}`,
  );

  const isReply = !!opts?.replyMessage;
  log.info(
    `[qchat] sending ${isReply ? "reply" : "message"} — server: ${serverId}, channel: ${channelId}, length: ${text.length}`,
  );

  const result = isReply
    ? await client.replyText({
        serverId,
        channelId,
        text,
        replyMessage: opts!.replyMessage!,
      })
    : await client.sendText({ serverId, channelId, text });
  if (!result.ok) {
    log.error(`[qchat] send failed — error: ${result.error ?? "unknown"}`);
  } else {
    log.info(
      `[qchat] message sent — message id: ${result.msgServerId ?? "unknown"}`,
    );
  }
  return {
    ok: result.ok,
    messageId: result.msgServerId ?? "",
    error: result.error ? new Error(result.error) : undefined,
  };
}

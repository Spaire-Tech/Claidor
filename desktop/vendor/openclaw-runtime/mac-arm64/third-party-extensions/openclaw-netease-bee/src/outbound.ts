import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { BeeConfig } from "./types.js";
import { sendBeeText } from "./send.js";

export type BeeOutboundResult = {
  channel: "netease-bee";
  ok: boolean;
  error?: string;
};

/**
 * Send a text message proactively to a Bee chatId.
 * Used by the outbound configuration to allow the agent to initiate messages.
 */
export async function sendBeeOutbound(params: {
  cfg: OpenClawConfig;
  chatId: string;
  text: string;
}): Promise<BeeOutboundResult> {
  const { cfg, chatId, text } = params;
  const beeCfg = (cfg.channels as Record<string, unknown>)?.["netease-bee"] as BeeConfig | undefined;

  if (!beeCfg?.clientId || !beeCfg?.secret) {
    return { channel: "netease-bee", ok: false, error: "netease-bee channel not configured" };
  }

  const result = await sendBeeText(beeCfg, chatId, text);
  return { channel: "netease-bee", ok: result.success, error: result.error };
}

/**
 * Send a media message to a Bee chatId.
 * NetEase Bee HTTP API does not support binary media uploads, so media is
 * delivered as a plain-text fallback: the mediaUrl is appended to the caption
 * (if any) and sent as a regular text message.
 */
export async function sendBeeOutboundMedia(params: {
  cfg: OpenClawConfig;
  chatId: string;
  text?: string;
  mediaUrl?: string;
}): Promise<BeeOutboundResult> {
  const { cfg, chatId, text, mediaUrl } = params;

  const parts: string[] = [];
  if (text) parts.push(text);
  if (mediaUrl) parts.push(mediaUrl);

  if (parts.length === 0) {
    return { channel: "netease-bee", ok: true };
  }

  return sendBeeOutbound({ cfg, chatId, text: parts.join("\n") });
}

/**
 * Outbound configuration for the netease-bee channel.
 */
export const beeOutboundConfig = {
  deliveryMode: "direct" as const,
  sendText: async (params: { cfg: OpenClawConfig; to: string; text?: string; accountId?: string }) => {
    if (!params.text) return { messageId: "" };
    const result = await sendBeeOutbound({ cfg: params.cfg, chatId: params.to, text: params.text });
    if (!result.ok) throw new Error(result.error ?? "netease-bee send failed");
    return { messageId: "" };
  },
  sendMedia: async (params: { cfg: OpenClawConfig; to: string; text?: string; mediaUrl?: string; accountId?: string }) => {
    const result = await sendBeeOutboundMedia({ cfg: params.cfg, chatId: params.to, text: params.text, mediaUrl: params.mediaUrl });
    if (!result.ok) throw new Error(result.error ?? "netease-bee send failed");
    return { messageId: "" };
  },
};

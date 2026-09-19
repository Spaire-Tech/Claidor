import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { NimInstanceConfig } from "./types.js";
import { sendMessageNim, splitMessageIntoChunks, resolveInstCfg, formatSendFailureMessage } from "./send.js";
import { sendImageNim, sendFileNim, sendAudioNim, sendVideoNim, inferMessageType } from "./media.js";
import { normalizeNimTarget, parseNimTarget } from "./targets.js";

/** Default text chunk limit for NIM messages */
const DEFAULT_TEXT_CHUNK_LIMIT = 5000;

/**
 * Outbound send result type (matching Clawdbot SDK expectations)
 */
export type NimOutboundResult = {
  channel: "nim";
  ok: boolean;
  messageId: string;
  msgId?: string;
  clientMsgId?: string;
  error?: string;
};

/**
 * Outbound message options (legacy, for backward compatibility)
 */
export type NimOutboundOptions = {
  cfg: OpenClawConfig;
  to: string;
  text?: string;
  mediaPath?: string;
};

/**
 * Target resolution result
 */
type TargetResolveResult = { ok: true; to: string } | { ok: false; error: Error };

/**
 * Resolve NIM target from various input formats.
 * Implements the standard outbound.resolveTarget interface.
 */
export function resolveNimOutboundTarget(params: {
  to?: string;
  allowFrom?: (string | number)[];
  mode?: "explicit" | "implicit" | "heartbeat";
}): TargetResolveResult {
  const { to, allowFrom, mode } = params;
  const trimmed = to?.trim() ?? "";

  // Normalize allowFrom list
  const allowListRaw = (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
  const hasWildcard = allowListRaw.includes("*");
  const allowList = allowListRaw
    .filter((entry) => entry !== "*")
    .map((entry) => normalizeNimTarget(entry))
    .filter((entry): entry is string => Boolean(entry));

  // If explicit target provided
  if (trimmed) {
    // Preserve team:/superTeam: prefixes for downstream session type detection
    const lc = trimmed.toLowerCase();
    if (lc.startsWith("team:") || lc.startsWith("superteam:")) {
      const parsed = parseNimTarget(trimmed);
      if (parsed) {
        // Return the original prefixed form so sendNimOutboundText can detect session type
        return { ok: true, to: trimmed };
      }
    }

    const normalizedTo = normalizeNimTarget(trimmed);
    if (!normalizedTo) {
      // Fallback to allowFrom if target is invalid
      if ((mode === "implicit" || mode === "heartbeat") && allowList.length > 0) {
        return { ok: true, to: allowList[0] };
      }
      return {
        ok: false,
        error: new Error(
          `Invalid NIM target: ${trimmed}. Provide a valid NIM account ID or configure channels.nim.allowFrom.`,
        ),
      };
    }

    // For implicit/heartbeat mode, verify target is in allowlist
    if (mode === "implicit" || mode === "heartbeat") {
      if (hasWildcard || allowList.length === 0) {
        return { ok: true, to: normalizedTo };
      }
      if (allowList.includes(normalizedTo)) {
        return { ok: true, to: normalizedTo };
      }
      // Fallback to first allowlist entry
      return { ok: true, to: allowList[0] };
    }

    return { ok: true, to: normalizedTo };
  }

  // No explicit target - use allowFrom
  if (allowList.length > 0) {
    return { ok: true, to: allowList[0] };
  }

  return {
    ok: false,
    error: new Error(`Missing NIM target. Provide a target ID or configure channels.nim.allowFrom.`),
  };
}

/**
 * Send text message through NIM channel.
 * Implements the standard outbound.sendText interface.
 *
 * @param params.isFailureNotification - Internal flag to prevent recursive failure notifications
 */
export async function sendNimOutboundText(params: {
  to: string;
  text: string;
  cfg: OpenClawConfig;
  accountId?: string;
  isFailureNotification?: boolean; // 🔥 Internal flag to prevent recursion
}): Promise<NimOutboundResult> {
  const { to, text, cfg, accountId, isFailureNotification = false } = params;
  const parsed = parseNimTarget(to);
  const targetId = parsed?.id ?? normalizeNimTarget(to) ?? to;
  const sessionType = parsed?.sessionType ?? "p2p";

  console.log(
    `[nim] outbound text send — target: ${targetId}, session: ${sessionType}, length: ${text.length}${isFailureNotification ? " (failure notification)" : ""}`,
  );

  try {
    const result = await sendMessageNim({
      cfg,
      to: targetId,
      text,
      sessionType,
      accountId,
    });

    if (result.success) {
      console.log(`[nim] outbound text sent — message id: ${result.msgId ?? "unknown"}`);
      return {
        channel: "nim",
        ok: true,
        messageId: result.msgId ?? "",
        msgId: result.msgId,
        clientMsgId: result.clientMsgId,
      };
    } else {
      const errorCode = result.errorCode;
      const errorMsg = result.error ?? "unknown";
      console.error(`[nim] outbound text failed — error: ${errorMsg}${errorCode ? ` (code: ${errorCode})` : ""}`);

      // 🔥 Send failure notification to user (only if not already a failure notification)
      if (!isFailureNotification) {
        const failureMessage = formatSendFailureMessage(errorCode, errorMsg);
        console.log(`[nim] sending failure notification — target: ${targetId}, message: ${failureMessage}`);

        try {
          // 🔥 Directly call client.sendText to bypass outbound layer and prevent recursion
          const nimCfg = resolveInstCfg(cfg, accountId);
          if (nimCfg) {
            const { createNimClient, getCachedNimClient } = await import("./client.js");
            let client = getCachedNimClient(nimCfg);
            if (!client || !client.loggedIn) {
              client = await createNimClient(nimCfg);
              await client.login();
            }
            const notifyResult = await client.sendText(targetId, failureMessage, sessionType);

            if (notifyResult.success) {
              console.log(`[nim] failure notification sent — message id: ${notifyResult.msgId ?? "unknown"}`);
            } else {
              console.error(
                `[nim] failure notification also failed — error: ${notifyResult.error ?? "unknown"}, not retrying`,
              );
            }
          }
        } catch (notifyError) {
          const notifyErrorMsg = notifyError instanceof Error ? notifyError.message : String(notifyError);
          console.error(`[nim] failure notification exception — error: ${notifyErrorMsg}, not retrying`);
        }
      }

      return {
        channel: "nim",
        ok: false,
        messageId: "",
        error: errorMsg,
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorCode = (error as any)?.code ?? (error as any)?.res_code;
    console.error(`[nim] outbound text exception — error: ${errorMsg}`);

    // 🔥 Send failure notification to user (only if not already a failure notification)
    if (!isFailureNotification) {
      const failureMessage = formatSendFailureMessage(errorCode, errorMsg);
      console.log(`[nim] sending failure notification — target: ${targetId}, message: ${failureMessage}`);

      try {
        // 🔥 Directly call client.sendText to bypass outbound layer and prevent recursion
        const nimCfg = resolveInstCfg(cfg, accountId);
        if (nimCfg) {
          const { createNimClient, getCachedNimClient } = await import("./client.js");
          let client = getCachedNimClient(nimCfg);
          if (!client || !client.loggedIn) {
            client = await createNimClient(nimCfg);
            await client.login();
          }
          const notifyResult = await client.sendText(targetId, failureMessage, sessionType);

          if (notifyResult.success) {
            console.log(`[nim] failure notification sent — message id: ${notifyResult.msgId ?? "unknown"}`);
          } else {
            console.error(
              `[nim] failure notification also failed — error: ${notifyResult.error ?? "unknown"}, not retrying`,
            );
          }
        }
      } catch (notifyError) {
        const notifyErrorMsg = notifyError instanceof Error ? notifyError.message : String(notifyError);
        console.error(`[nim] failure notification exception — error: ${notifyErrorMsg}, not retrying`);
      }
    }

    return {
      channel: "nim",
      ok: false,
      messageId: "",
      error: errorMsg,
    };
  }
}

/**
 * Send media message through NIM channel.
 * Implements the standard outbound.sendMedia interface.
 */
export async function sendNimOutboundMedia(params: {
  to: string;
  text?: string;
  mediaUrl?: string;
  mediaPath?: string;
  cfg: OpenClawConfig;
  accountId?: string;
}): Promise<NimOutboundResult> {
  const { to, text, mediaUrl, mediaPath, cfg, accountId } = params;
  const media = mediaPath || mediaUrl;
  const parsed = parseNimTarget(to);
  const targetId = parsed?.id ?? normalizeNimTarget(to) ?? to;
  const sessionType = parsed?.sessionType ?? "p2p";

  console.log(
    `[nim] outbound media send — target: ${targetId}, session: ${sessionType}, media: ${media ?? "none"}, has text: ${text ? "yes" : "no"}`,
  );

  try {
    // Send media if provided
    if (media) {
      const mediaType = inferMessageType(media);
      let mediaResult;

      if (mediaType === "image") {
        mediaResult = await sendImageNim({
          cfg,
          to: targetId,
          imagePath: media,
          sessionType,
          accountId,
        });
      } else if (mediaType === "audio") {
        mediaResult = await sendAudioNim({
          cfg,
          to: targetId,
          audioPath: media,
          duration: 0,
          sessionType,
          accountId,
        });
      } else if (mediaType === "video") {
        mediaResult = await sendVideoNim({
          cfg,
          to: targetId,
          videoPath: media,
          duration: 0,
          width: 1920,
          height: 1080,
          sessionType,
          accountId,
        });
      } else {
        mediaResult = await sendFileNim({
          cfg,
          to: targetId,
          filePath: media,
          sessionType,
          accountId,
        });
      }

      if (!mediaResult.success) {
        console.error(`[nim] outbound media failed — error: ${mediaResult.error ?? "unknown"}`);
        return {
          channel: "nim",
          ok: false,
          messageId: "",
          error: mediaResult.error,
        };
      }

      console.log(`[nim] outbound media sent — message id: ${mediaResult.msgId ?? "unknown"}`);

      // If no text, return media result
      if (!text) {
        return {
          channel: "nim",
          ok: true,
          messageId: mediaResult.msgId ?? "",
          msgId: mediaResult.msgId,
          clientMsgId: mediaResult.clientMsgId,
        };
      }
    }

    // Send text if provided (pass original `to` so parseNimTarget re-runs)
    if (text) {
      return await sendNimOutboundText({ to, text, cfg, accountId });
    }

    // Nothing to send
    return {
      channel: "nim",
      ok: true,
      messageId: "",
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[nim] outbound media exception — error: ${errorMsg}`);
    return {
      channel: "nim",
      ok: false,
      messageId: "",
      error: errorMsg,
    };
  }
}

/**
 * NIM outbound configuration object.
 * Conforms to Clawdbot ChannelPlugin outbound interface.
 */
export const nimOutboundConfig = {
  /**
   * Delivery mode - "gateway" means messages go through the gateway process
   */
  deliveryMode: "gateway" as const,

  /**
   * Text chunker function for splitting long messages
   */
  chunker: splitMessageIntoChunks,

  /**
   * Maximum characters per text chunk
   */
  textChunkLimit: DEFAULT_TEXT_CHUNK_LIMIT,

  /**
   * Resolve target address from various input formats
   */
  resolveTarget: resolveNimOutboundTarget,

  /**
   * Send a text message
   */
  sendText: async (params: {
    to: string;
    text: string;
    cfg: OpenClawConfig;
    accountId?: string;
    deps?: unknown;
  }): Promise<NimOutboundResult> => {
    return sendNimOutboundText(params);
  },

  /**
   * Send a media message (with optional text caption)
   */
  sendMedia: async (params: {
    to: string;
    text?: string;
    mediaUrl?: string;
    cfg: OpenClawConfig;
    accountId?: string;
    deps?: unknown;
  }): Promise<NimOutboundResult> => {
    return sendNimOutboundMedia({ ...params, mediaPath: params.mediaUrl });
  },
};

// ============================================================================
// Legacy functions for backward compatibility
// ============================================================================

/**
 * Handle outbound messages for the NIM channel.
 * @deprecated Use nimOutboundConfig.sendText/sendMedia instead
 */
export async function nimOutbound(params: NimOutboundOptions): Promise<void> {
  const { cfg, to, text, mediaPath } = params;
  const nimCfg = resolveInstCfg(cfg);

  const targetId = normalizeNimTarget(to);
  if (!targetId) {
    throw new Error(`Invalid NIM target: ${to}`);
  }

  // Send media if provided
  if (mediaPath) {
    const result = await sendNimOutboundMedia({
      cfg,
      to: targetId,
      mediaPath,
      text,
    });
    if (!result.ok) {
      throw new Error(result.error || "Failed to send media");
    }
    return;
  }

  // Send text if provided
  if (text) {
    const chunkLimit = nimCfg?.advanced?.textChunkLimit ?? DEFAULT_TEXT_CHUNK_LIMIT;
    const chunks = splitMessageIntoChunks(text, chunkLimit);

    for (const chunk of chunks) {
      const result = await sendNimOutboundText({
        cfg,
        to: targetId,
        text: chunk,
      });
      if (!result.ok) {
        throw new Error(result.error || "Failed to send text");
      }
    }
  }
}

/**
 * Create an outbound handler function for the NIM channel.
 * @deprecated Use nimOutboundConfig instead
 */
export function createNimOutboundHandler(cfg: OpenClawConfig) {
  return async (params: { to: string; text?: string; mediaPath?: string }) => {
    await nimOutbound({ cfg, ...params });
  };
}

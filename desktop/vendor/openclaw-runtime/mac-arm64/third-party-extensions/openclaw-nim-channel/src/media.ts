/**
 * NIM Media - 媒体消息处理模块 (@yxim/nim-bot 版本)
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { NimSendResult, NimMediaInfo, NimSessionType } from "./types.js";
import { createNimClient, getCachedNimClient } from "./client.js";
import { normalizeNimTarget } from "./targets.js";
import { resolveInstCfg } from "./send.js";
import { extname } from "path";

/**
 * 发送图片消息
 */
export async function sendImageNim(params: {
  cfg: OpenClawConfig;
  to: string;
  imagePath: string;
  sessionType?: NimSessionType;
  accountId?: string;
}): Promise<NimSendResult> {
  const { cfg, to, imagePath, sessionType = "p2p", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);

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

    return await client.sendImage(targetId, imagePath, sessionType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 发送文件消息
 */
export async function sendFileNim(params: {
  cfg: OpenClawConfig;
  to: string;
  filePath: string;
  sessionType?: NimSessionType;
  accountId?: string;
}): Promise<NimSendResult> {
  const { cfg, to, filePath, sessionType = "p2p", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);

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

    return await client.sendFile(targetId, filePath, sessionType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 发送音频消息
 */
export async function sendAudioNim(params: {
  cfg: OpenClawConfig;
  to: string;
  audioPath: string;
  duration: number;
  sessionType?: NimSessionType;
  accountId?: string;
}): Promise<NimSendResult> {
  const { cfg, to, audioPath, duration, sessionType = "p2p", accountId } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);

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

    return await client.sendAudio(targetId, audioPath, duration, sessionType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 发送视频消息
 */
export async function sendVideoNim(params: {
  cfg: OpenClawConfig;
  to: string;
  videoPath: string;
  duration: number;
  width: number;
  height: number;
  sessionType?: NimSessionType;
  accountId?: string;
}): Promise<NimSendResult> {
  const {
    cfg,
    to,
    videoPath,
    duration,
    width,
    height,
    sessionType = "p2p",
    accountId,
  } = params;
  const nimCfg = resolveInstCfg(cfg, accountId);

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

    return await client.sendVideo(
      targetId,
      videoPath,
      duration,
      width,
      height,
      sessionType,
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 从媒体信息列表构建 payload
 */
export function buildNimMediaPayload(
  mediaList: NimMediaInfo[],
): Record<string, unknown> {
  if (!mediaList || mediaList.length === 0) {
    return {};
  }

  return {
    MediaAttachments: mediaList.map((m) => ({
      type: m.type,
      url: m.url,
      name: m.name,
      size: m.size,
    })),
  };
}

/**
 * 推断消息的媒体类型占位符（用于 AI 显示）
 */
export function inferMediaPlaceholder(messageType: string): string {
  switch (messageType) {
    case "image":
      return "[图片]";
    case "audio":
      return "[语音消息]";
    case "video":
      return "[视频]";
    case "file":
      return "[文件]";
    case "geo":
    case "location":
      return "[位置]";
    default:
      return "[多媒体消息]";
  }
}

/**
 * 根据文件扩展名推断消息类型
 */
export function inferMessageType(
  filePath: string,
): "image" | "file" | "audio" | "video" {
  const ext = extname(filePath).toLowerCase();

  const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
  const audioExts = [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".amr"];
  const videoExts = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv"];

  if (imageExts.includes(ext)) return "image";
  if (audioExts.includes(ext)) return "audio";
  if (videoExts.includes(ext)) return "video";
  return "file";
}

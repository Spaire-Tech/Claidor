/**
 * NIM Types - node-nim SDK 版本
 */

import type {
  NimConfigSchema,
  NimInstanceConfigSchema,
} from "./config-schema.js";
import type { z } from "zod";

/**
 * NIM 实例配置类型（单实例）
 */
export type NimInstanceConfig = z.infer<typeof NimInstanceConfigSchema>;

/**
 * NIM 配置类型（实例数组）
 */
export type NimConfig = z.infer<typeof NimConfigSchema>;

/**
 * NIM 消息类型
 */
export type NimMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "geo"
  | "notification"
  | "custom"
  | "tip"
  | "robot"
  | "unknown";

/**
 * NIM 会话类型
 */
export type NimSessionType = "p2p" | "team" | "superTeam";

/**
 * NIM 消息事件（从 SDK 回调接收）
 */
export interface NimMessageEvent {
  /** 消息 ID */
  msgId: string;
  /** 消息客户端 ID */
  clientMsgId: string;
  /** 会话类型 */
  sessionType: NimSessionType;
  /** 发送者账号 */
  from: string;
  /** 接收者账号/群ID */
  to: string;
  /** 消息类型 */
  type: NimMessageType;
  /** 文本内容 */
  text?: string;
  /** 消息时间戳 (毫秒) */
  time: number;
  /** 附件信息 (图片/文件/音视频等) */
  attach?: NimAttachment;
  /** 扩展字段 */
  ext?: Record<string, unknown>;
  /** 强制推送目标账号列表 (群消息中用于判断是否 @了当前账号) */
  forcePushAccountIds?: string[];
  /** 线程回复引用信息（用于查询被回复的原消息） */
  threadReply?: unknown;
  /** 发送者昵称（从 SDK 消息对象中提取，可能为空） */
  fromNick?: string;
  /** 原始消息对象 */
  rawMsg?: unknown;
}

/**
 * NIM 附件信息
 */
export interface NimAttachment {
  /** 文件名 */
  name?: string;
  /** 文件大小 */
  size?: number;
  /** 文件 URL */
  url?: string;
  /** 文件扩展名 */
  ext?: string;
  /** 文件 MD5 */
  md5?: string;
  /** 图片宽度 */
  w?: number;
  /** 图片高度 */
  h?: number;
  /** 音视频时长 (秒) */
  dur?: number;
  /** 地理位置标题 */
  title?: string;
  /** 纬度 */
  lat?: number;
  /** 经度 */
  lng?: number;
}

/**
 * NIM 消息上下文（业务层使用）
 */
export interface NimMessageContext {
  /** 唯一标识 */
  id: string;
  /** 会话 ID */
  sessionId: string;
  /** 会话类型 */
  sessionType: NimSessionType;
  /** 发送者 ID */
  senderId: string;
  /** 发送者名称 */
  senderName?: string;
  /** 消息类型 */
  type: NimMessageType;
  /** 文本内容 */
  text: string;
  /** 时间戳 */
  timestamp: number;
  /** 媒体附件 */
  attachments?: NimMediaInfo[];
  /** 是否为私聊 */
  isDm: boolean;
  /** 原始事件 */
  rawEvent: NimMessageEvent;
}

/**
 * NIM 媒体信息
 */
export interface NimMediaInfo {
  type: "image" | "file" | "audio" | "video";
  url: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  localPath?: string;
}

/**
 * NIM 发送结果
 */
export interface NimSendResult {
  success: boolean;
  msgId?: string;
  clientMsgId?: string;
  error?: string;
  errorCode?: number;
  baseMessage?: any;
}

/**
 * NIM 探测结果
 */
export interface NimProbeResult {
  connected: boolean;
  account?: string;
  error?: string;
  loginState?: string;
}

/**
 * NIM P2P 策略
 */
export type NimP2pPolicy = "open" | "allowlist" | "disabled";

/**
 * 解析后的 NIM 账户配置
 */
export interface ResolvedNimAccount {
  id: string;
  accountId: string;
  configKey: string;
  runtimeAccountId: string;
  appKey: string;
  account: string;
  token: string;
  enabled: boolean;
  configured: boolean;
  p2pPolicy: NimP2pPolicy;
  allowFrom: Array<string | number>;
  teamPolicy: NimTeamPolicy;
  teamIds: Array<string | number>;
  config: NimInstanceConfig;
}

/**
 * NIM 客户端实例接口
 */
export interface NimClientInstance {
  /** 是否已初始化 */
  initialized: boolean;
  /** 是否已登录 */
  loggedIn: boolean;
  /** 当前账号 */
  account: string;
  /** 登录 */
  login(): Promise<boolean>;
  /** 登出 */
  logout(): Promise<void>;
  /** 发送文本消息 */
  sendText(
    to: string,
    text: string,
    sessionType?: NimSessionType,
  ): Promise<NimSendResult>;
  /** 回复文本消息（群组中引用原消息并 @发送者） */
  replyText(
    to: string,
    text: string,
    originalMsg: unknown,
    forcePushAccountIds: string[],
    sessionType?: NimSessionType,
  ): Promise<NimSendResult>;
  /** 发送流式消息 */
  sendStreamMessage(params: {
    to: string;
    sessionType?: NimSessionType;
    baseMessage?: any; // 基础消息体，复用于整个流式会话
    streamChunkParams: {
      text: string;
      index?: number;
      finish?: number;
    };
  }): Promise<NimSendResult>;
  /** 发送图片消息 */
  sendImage(
    to: string,
    filePath: string,
    sessionType?: NimSessionType,
  ): Promise<NimSendResult>;
  /** 发送文件消息 */
  sendFile(
    to: string,
    filePath: string,
    sessionType?: NimSessionType,
  ): Promise<NimSendResult>;
  /** 发送音频消息 */
  sendAudio(
    to: string,
    filePath: string,
    duration: number,
    sessionType?: NimSessionType,
  ): Promise<NimSendResult>;
  /** 发送视频消息 */
  sendVideo(
    to: string,
    filePath: string,
    duration: number,
    width: number,
    height: number,
    sessionType?: NimSessionType,
  ): Promise<NimSendResult>;
  /** 注册消息回调 */
  onMessage(callback: (msg: NimMessageEvent) => void): void;
  /** 移除消息回调 */
  offMessage(callback: (msg: NimMessageEvent) => void): void;
  /** 注册连接状态回调 */
  onConnectionChange(callback: (state: string) => void): void;
  /** 更新 P2P 好友申请自动同意策略（config reload 时调用） */
  updateP2pPolicy(
    policy: NimP2pPolicy,
    allowFrom: Array<string | number>,
  ): void;
  /** 底层 NIM SDK 实例（用于 QChat 等复用） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nativeNim: any;
  /** 销毁客户端 */
  destroy(): Promise<void>;
}

/**
 * NIM team policy (for team/superTeam messages)
 */
export type NimTeamPolicy = "open" | "allowlist" | "disabled";

// ── QChat (圈组) Types ────────────────────────────────────────────────────────

/**
 * QChat 配置（嵌套在 channels.nim.qchat 下）
 */
export interface QChatConfig {
  /**
   * 入站消息策略。
   *   open      — 接受所有 @-mentioned 消息（默认）
   *   allowlist — 只接受匹配 allowFrom 条目的消息
   *   disabled  — 拒绝所有入站 QChat 消息
   */
  policy?: "open" | "allowlist" | "disabled";
  /**
   * 入站消息白名单，同时控制服务器订阅和自动同意邀请（为空则全部放行）。
   * 格式: "serverId" | "serverId|channelId" | "serverId|channelId|accountId" | "serverId||accountId"
   */
  allowFrom?: Array<string | number>;
}

/**
 * QChat 入站消息（解析后的简化结构）
 */
export interface QChatInboundMessage {
  messageId: string;
  serverId: string;
  channelId: string;
  senderAccid: string;
  senderNick?: string;
  text: string;
  timestamp: number;
  /** true if @all or the bot's accid is in mention_accids */
  wasMentioned: boolean;
  /** List of accids that were @-mentioned in the message */
  mentionAccids?: string[];
  /** Raw QChat message object from SDK, used for reply-to reference */
  rawMessage?: unknown;
  /** QChat channel information (name, topic, etc.) fetched from SDK */
  channelInfo?: any;
}

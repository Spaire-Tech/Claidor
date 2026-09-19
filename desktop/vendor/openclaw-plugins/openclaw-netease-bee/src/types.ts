/**
 * NetEase Bee Types
 */

/**
 * Bee channel configuration
 */
export interface BeeConfig {
  enabled?: boolean;
  /** NIM account ID (used as appKey for HTTP API) */
  clientId: string;
  /** NIM token (used as appSecret for HTTP API) */
  secret: string;
  debug?: boolean;
}

/**
 * Parsed inbound Bee message
 */
export interface BeeMessageEvent {
  /** NIM message server ID */
  msgId: string;
  /** Bee sender ID (from custom message payload) */
  senderId: string;
  /** Bee chatId — used as reply target in HTTP API */
  chatId: string;
  /** Message text content */
  text: string;
  /** Message timestamp (ms) */
  timestamp: number;
  /** Raw NIM message object */
  rawNimMsg?: unknown;
}

/**
 * HTTP API send result
 */
export interface BeeSendResult {
  success: boolean;
  error?: string;
}

import { z } from "zod";
import { parseNimToken } from "./nim-token.js";

/**
 * Coerce value to string (handles number inputs from YAML).
 * YAML may parse values like `account: 123456` as numbers.
 */
const coerceToString = z.preprocess(
  (val) => (typeof val === "number" ? String(val) : val),
  z.string(),
);

/** Union type for allow-list entries (string or number from YAML) */
const AllowEntryArray = z.array(z.union([z.string(), z.number()])).optional();

export interface ConfigUiHint {
  label: string;
  sensitive?: boolean;
  advanced?: boolean;
}

/**
 * P2P (私聊) sub-configuration.
 */
export const P2pSubConfigSchema = z.object({
  /**
   * Access policy.
   *   open      — accept messages from anyone (default)
   *   allowlist — only accept senders listed in allowFrom
   *   disabled  — reject all P2P messages
   */
  policy: z.enum(["open", "allowlist", "disabled"]).optional().default("open"),

  /** Allowed sender IDs (used when policy="allowlist") */
  allowFrom: AllowEntryArray,
});

/**
 * Team (群组) sub-configuration.
 */
export const TeamSubConfigSchema = z.object({
  /**
   * Access policy.
   *   open      — accept messages from any group (default)
   *   allowlist — only accept groups (and optionally senders) listed in allowFrom
   *   disabled  — reject all team messages
   */
  policy: z.enum(["open", "allowlist", "disabled"]).optional().default("open"),

  /**
   * Allowlist entries (used when policy="allowlist").
   * Supported formats (case-insensitive):
   *   "groupId"           — any sender in this group
   *   "groupId|accountId" — specific sender in this group
   */
  allowFrom: AllowEntryArray,
});

/**
 * Advanced (基础设置) sub-configuration.
 */
export const AdvancedSubConfigSchema = z.object({
  /** Maximum media file size in MB */
  mediaMaxMb: z.number().min(0).optional().default(30),

  /** Text chunk limit for splitting long messages */
  textChunkLimit: z.number().min(1).optional().default(4000),

  /** Enable debug logging */
  debug: z.boolean().optional().default(false),

  /** Internal: legacy login mode */
  legacyLogin: z.boolean().optional().default(false),

  /** Private deployment: custom LBS URL */
  weblbsUrl: z.string().optional(),

  /** Private deployment: default WebSocket/TCP link address */
  link_web: z.string().optional(),

  /** Private deployment: NOS upload address */
  nos_uploader: z.string().optional(),

  /** Private deployment: NOS download URL format */
  nos_downloader_v2: z.string().optional(),

  /** Private deployment: whether NOS download uses HTTPS */
  nosSsl: z.boolean().optional(),

  /** Private deployment: CDN accelerate URL format */
  nos_accelerate: z.string().optional(),

  /** Private deployment: CDN accelerate host domain (empty string to disable) */
  nos_accelerate_host: z.string().optional(),
});

/**
 * QChat (圈组) sub-configuration.
 */
export const QChatSubConfigSchema = z.object({
  /**
   * Inbound message policy.
   *   open      — accept all @-mentioned messages (default)
   *   allowlist — only accept messages matching allowFrom entries
   *   disabled  — reject all inbound QChat messages
   */
  policy: z.enum(["open", "allowlist", "disabled"]).optional().default("open"),

  /**
   * Inbound message allowlist. Controls both message filtering and server invite auto-accept.
   * Empty = accept all @-mentioned messages and auto-accept all server invites.
   *
   * Supported formats (case-insensitive):
   *   "serverId"                     — any channel, any sender in this server
   *   "serverId|channelId"           — any sender in this server+channel
   *   "serverId|channelId|accountId" — specific sender in this server+channel
   *   "serverId||accountId"          — specific sender in any channel of this server
   *
   * Server IDs present in any entry are also used for subscription and invite auto-accept.
   */
  allowFrom: AllowEntryArray,
});

/**
 * A single NIM account configuration (one bot account).
 * The outer `accounts` object key is the stable instance selector used by the
 * gateway. The protocol identity remains `appKey:accid`.
 */
export const NimInstanceConfigSchema = z.object({
  /** Whether this account is enabled */
  enabled: z.boolean().optional().default(false),

  /**
   * Shorthand credential: "appKey|accid|token" (preferred) or legacy "appKey-accid-token".
   * When present and valid, takes priority over individual appKey/account/token fields.
   */
  nimToken: z.string().optional(),

  /** NIM App Key (coerced from number if needed) */
  appKey: coerceToString.optional(),

  /** Bot account ID (coerced from number if needed) */
  account: coerceToString.optional(),

  /** Authentication token (coerced from number if needed) */
  token: coerceToString.optional(),

  /** Whether to enable anti-spam protection */
  antispamEnabled: z.boolean().optional().default(true),

  /** P2P (私聊) sub-configuration */
  p2p: P2pSubConfigSchema.optional(),

  /** Team (群组) sub-configuration */
  team: TeamSubConfigSchema.optional(),

  /** Advanced (基础设置) sub-configuration */
  advanced: AdvancedSubConfigSchema.optional(),

  /** QChat (圈组) sub-configuration */
  qchat: QChatSubConfigSchema.optional(),
});

const NimAccountsSchema = z
  .record(z.string(), NimInstanceConfigSchema)
  .superRefine((accounts, ctx) => {
    const entries = Object.entries(accounts);
    if (entries.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "channels.nim.accounts must have at least one account",
        path: [],
      });
      return;
    }

    if (entries.length > 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "channels.nim.accounts may have at most 3 accounts",
        path: [],
      });
    }

    const seen = new Set<string>();
    for (const [accountKey, inst] of entries) {
      let key: string | null = null;
      if (inst.nimToken) {
        const parsed = parseNimToken(inst.nimToken);
        if (parsed) key = `${parsed.appKey}:${parsed.account}`;
      } else if (inst.appKey && inst.account) {
        key = `${inst.appKey}:${inst.account}`;
      }
      if (key) {
        if (seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate NIM account credentials: "${key}" appears more than once`,
            path: [accountKey],
          });
        }
        seen.add(key);
      }
    }
  });

/**
 * NIM channel configuration schema.
 *
 * Multi-account format (up to 3 accounts):
 *   { accounts: { primary: { enabled, appKey, account, token, p2p, ... }, ... } }
 *
 * The outer object wrapper is required so that the framework correctly detects
 * channels.nim as a configured channel (isRecord check in config-presence.ts).
 * Each account has:
 * - a stable config key (`accounts.<key>`) used for routing / task delivery
 * - a runtime protocol identity derived as "<appKey>:<accid>"
 */
export const NimConfigSchema = z.object({
  accounts: NimAccountsSchema,
});

export const nimChannelConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    accounts: {
      type: "object",
      minProperties: 1,
      maxProperties: 3,
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          enabled: { type: "boolean" },
          nimToken: { type: "string" },
          appKey: { type: "string" },
          account: { type: "string" },
          token: { type: "string" },
          antispamEnabled: { type: "boolean" },
          p2p: {
            type: "object",
            additionalProperties: false,
            properties: {
              policy: {
                type: "string",
                enum: ["open", "allowlist", "disabled"],
              },
              allowFrom: {
                type: "array",
                items: { oneOf: [{ type: "string" }, { type: "number" }] },
              },
            },
          },
          team: {
            type: "object",
            additionalProperties: false,
            properties: {
              policy: {
                type: "string",
                enum: ["open", "allowlist", "disabled"],
              },
              allowFrom: {
                type: "array",
                items: { oneOf: [{ type: "string" }, { type: "number" }] },
              },
            },
          },
          advanced: {
            type: "object",
            additionalProperties: false,
            properties: {
              mediaMaxMb: { type: "number", minimum: 0 },
              textChunkLimit: { type: "integer", minimum: 1 },
              debug: { type: "boolean" },
              legacyLogin: { type: "boolean" },
              weblbsUrl: { type: "string" },
              link_web: { type: "string" },
              nos_uploader: { type: "string" },
              nos_downloader_v2: { type: "string" },
              nosSsl: { type: "boolean" },
              nos_accelerate: { type: "string" },
              nos_accelerate_host: { type: "string" },
            },
          },
          qchat: {
            type: "object",
            additionalProperties: false,
            properties: {
              policy: {
                type: "string",
                enum: ["open", "allowlist", "disabled"],
              },
              allowFrom: {
                type: "array",
                items: { oneOf: [{ type: "string" }, { type: "number" }] },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const nimChannelConfigUiHints: Record<string, ConfigUiHint> = {
  enabled: { label: "Enable" },
  nimToken: { label: "NIM Token", sensitive: true },
  appKey: { label: "App Key" },
  account: { label: "Account ID" },
  token: { label: "Token", sensitive: true },
  antispamEnabled: { label: "Anti-spam Protection" },
  p2p: { label: "P2P" },
  "p2p.policy": { label: "Message Policy" },
  "p2p.allowFrom": { label: "Account Allowlist" },
  team: { label: "Team" },
  "team.policy": { label: "Message Policy" },
  "team.allowFrom": { label: "Team Allowlist" },
  qchat: { label: "QChat" },
  "qchat.policy": { label: "Message Policy" },
  "qchat.allowFrom": {
    label: "Server / Channel / Account Allowlist",
  },
  advanced: { label: "Advanced", advanced: true },
  "advanced.mediaMaxMb": { label: "Max Media Size (MB)" },
  "advanced.textChunkLimit": { label: "Text Chunk Limit" },
  "advanced.debug": { label: "Debug Mode", advanced: true },
  "advanced.legacyLogin": { label: "Legacy Login Mode", advanced: true },
  "advanced.weblbsUrl": {
    label: "LBS URL (Private Deploy)",
    advanced: true,
  },
  "advanced.link_web": {
    label: "Link Server URL (Private Deploy)",
    advanced: true,
  },
  "advanced.nos_uploader": {
    label: "NOS Upload URL (Private Deploy)",
    advanced: true,
  },
  "advanced.nos_downloader_v2": {
    label: "NOS Download URL Format (Private Deploy)",
    advanced: true,
  },
  "advanced.nosSsl": {
    label: "NOS Download HTTPS (Private Deploy)",
    advanced: true,
  },
  "advanced.nos_accelerate": {
    label: "CDN Accelerate URL (Private Deploy)",
    advanced: true,
  },
  "advanced.nos_accelerate_host": {
    label: "CDN Accelerate Host (Private Deploy)",
    advanced: true,
  },
};

/** Single instance config type */
export type NimInstanceConfig = z.infer<typeof NimInstanceConfigSchema>;

export type { z };

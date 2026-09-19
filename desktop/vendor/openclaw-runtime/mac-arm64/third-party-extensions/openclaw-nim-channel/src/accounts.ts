import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type {
  NimConfig,
  NimInstanceConfig,
  ResolvedNimAccount,
  NimP2pPolicy,
  NimTeamPolicy,
} from "./types.js";
import { parseNimToken } from "./nim-token.js";

/**
 * Default account ID for NIM (legacy single-account mode, kept for compatibility).
 * @deprecated Multi-instance mode uses explicit config keys.
 */
export const DEFAULT_NIM_ACCOUNT_ID = "default";

/**
 * Coerce a value to string.
 * Handles cases where YAML parses numeric values (e.g., account: 123456) as numbers.
 */
function coerceToString(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }
  return String(value ?? "");
}

/**
 * Resolve NIM credentials from a single instance configuration.
 * Priority: nimToken (shorthand) > individual appKey/account/token fields.
 * Returns null if required credentials are missing.
 */
export function resolveNimCredentials(
  cfg: NimInstanceConfig | undefined,
): { appKey: string; account: string; token: string } | null {
  // 1. Try nimToken shorthand first
  const fromToken = parseNimToken(cfg?.nimToken);
  if (fromToken) {
    return fromToken;
  }

  // 2. Fall back to individual fields
  if (!cfg?.appKey || !cfg?.account || !cfg?.token) {
    return null;
  }
  return {
    appKey: coerceToString(cfg.appKey),
    account: coerceToString(cfg.account),
    token: coerceToString(cfg.token),
  };
}

/**
 * Derive the protocol identity for an instance: "<appKey>:<accid>".
 * Returns null if credentials cannot be resolved.
 */
export function deriveNimAccountId(
  cfg: NimInstanceConfig | undefined,
): string | null {
  const creds = resolveNimCredentials(cfg);
  if (!creds) return null;
  return `${creds.appKey}:${creds.account}`;
}

function resolveConfigKey(entryKey: string, inst: NimInstanceConfig): string {
  const normalized = entryKey.trim();
  if (normalized) return normalized;
  return deriveNimAccountId(inst) ?? "";
}

/**
 * Resolve a single NIM account config into a ResolvedNimAccount.
 */
function resolveInstance(entryKey: string, inst: NimInstanceConfig): ResolvedNimAccount {
  const creds = resolveNimCredentials(inst);
  const runtimeAccountId = creds ? `${creds.appKey}:${creds.account}` : "";
  const configKey = resolveConfigKey(entryKey, inst) || runtimeAccountId;

  return {
    id: configKey,
    accountId: configKey,
    configKey,
    runtimeAccountId,
    appKey: creds?.appKey ?? coerceToString(inst.appKey),
    account: creds?.account ?? coerceToString(inst.account),
    token: creds?.token ?? "",
    enabled: inst.enabled ?? false,
    configured: Boolean(creds),
    p2pPolicy: (inst.p2p?.policy as NimP2pPolicy) ?? "open",
    allowFrom: inst.p2p?.allowFrom ?? [],
    teamPolicy: (inst.team?.policy as NimTeamPolicy) ?? "open",
    teamIds: inst.team?.allowFrom ?? [],
    config: inst,
  };
}

/**
 * Resolve all NIM accounts from OpenClaw configuration.
 * Supports the multi-account format: channels.nim.accounts = { ... }
 * Returns an empty array if channels.nim is not configured.
 */
export function resolveAllNimAccounts(params: {
  cfg: OpenClawConfig;
}): ResolvedNimAccount[] {
  const { cfg } = params;
  const nimCfg = cfg.channels?.nim as NimConfig | undefined;
  if (!nimCfg) return [];

  const accounts = (nimCfg as { accounts?: unknown }).accounts;
  if (accounts && typeof accounts === "object") {
    const entries = Object.entries(
      accounts as Record<string, NimInstanceConfig>,
    );
    if (entries.length > 0) {
      return entries.map(([entryKey, inst]) => resolveInstance(entryKey, inst));
    }
  }

  return [];
}

/**
 * Resolve a single NIM account by either its stable config key or legacy
 * runtime identity ("appKey:accid").
 * Returns a not-configured stub if not found.
 */
export function resolveNimAccountById(params: {
  cfg: OpenClawConfig;
  accountId: string;
}): ResolvedNimAccount {
  const { cfg, accountId } = params;
  const all = resolveAllNimAccounts({ cfg });
  const normalizedAccountId = accountId.trim();
  const found = all.find(
    (a) =>
      a.accountId === normalizedAccountId ||
      a.configKey === normalizedAccountId ||
      a.runtimeAccountId === normalizedAccountId,
  );
  if (found) return found;

  // Return a not-configured stub so callers don't need to handle undefined
  return {
    id: normalizedAccountId,
    accountId: normalizedAccountId,
    configKey: normalizedAccountId,
    runtimeAccountId: normalizedAccountId,
    appKey: "",
    account: "",
    token: "",
    enabled: false,
    configured: false,
    p2pPolicy: "open",
    allowFrom: [],
    teamPolicy: "open",
    teamIds: [],
    config: {} as NimInstanceConfig,
  };
}

/**
 * Alias for resolveNimAccountById — kept for compatibility.
 */
export function resolveNimAccountByKey(params: {
  cfg: OpenClawConfig;
  accountId: string;
}): ResolvedNimAccount {
  return resolveNimAccountById(params);
}

/**
 * Return stable config keys for all configured accounts (enabled or disabled).
 */
export function listNimAccountIds(cfg: OpenClawConfig): string[] {
  return resolveAllNimAccounts({ cfg }).map((a) => a.accountId);
}

/**
 * @deprecated Use resolveNimAccountById instead.
 * Kept for compatibility with channel.ts single-account references.
 */
export function resolveNimAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string;
}): ResolvedNimAccount {
  const { cfg, accountId } = params;
  if (accountId) {
    return resolveNimAccountById({ cfg, accountId });
  }
  // Fallback: return first configured account
  const all = resolveAllNimAccounts({ cfg });
  if (all.length > 0) return all[0];
  return resolveNimAccountById({ cfg, accountId: "" });
}

/**
 * Normalize an allow-list into a set for fast matching.
 * Supports wildcard "*" detection.
 */
export function normalizeNimAllowFrom(
  configAllowFrom: Array<string | number>,
): {
  hasWildcard: boolean;
  hasEntries: boolean;
  entries: Set<string>;
} {
  const combined = (configAllowFrom ?? [])
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean);

  const hasWildcard = combined.includes("*");
  const entries = new Set(combined.filter((e) => e !== "*"));

  return { hasWildcard, hasEntries: entries.size > 0, entries };
}

/**
 * Check if a sender is in the allowlist.
 */
export function resolveNimAllowlistMatch(params: {
  allowFrom: Array<string | number>;
  senderId: string;
}): {
  allowed: boolean;
  matchedEntry?: string;
  matchSource?: string;
} {
  const { senderId } = params;
  const { hasWildcard, entries } = normalizeNimAllowFrom(params.allowFrom);

  if (hasWildcard) {
    return { allowed: true, matchedEntry: "*", matchSource: "wildcard" };
  }

  const normalizedSenderId = senderId.toLowerCase();
  if (entries.has(normalizedSenderId)) {
    return {
      allowed: true,
      matchedEntry: normalizedSenderId,
      matchSource: "id",
    };
  }

  return { allowed: false };
}

/**
 * Check if P2P message is allowed based on policy and sender.
 * Modes: open → allowlist → disabled.
 *
 * Returns:
 * - { allowed: true } — proceed with message processing
 * - { allowed: false, reason: "blocked" } — silently block
 * - { allowed: false, reason: "disabled" } — P2P disabled
 */
export function isNimP2pAllowed(params: {
  p2pPolicy: NimP2pPolicy;
  allowFrom: Array<string | number>;
  senderId: string;
}): { allowed: boolean; reason?: "blocked" | "disabled" } {
  const { p2pPolicy, senderId } = params;

  if (p2pPolicy === "disabled") {
    return { allowed: false, reason: "disabled" };
  }

  if (p2pPolicy === "open") {
    return { allowed: true };
  }

  // "allowlist" with empty list — treat as disabled
  if (!params.allowFrom || params.allowFrom.length === 0) {
    return { allowed: false, reason: "disabled" };
  }

  // "allowlist" — check the allowlist
  const match = resolveNimAllowlistMatch({
    allowFrom: params.allowFrom,
    senderId,
  });

  if (match.allowed) {
    return { allowed: true };
  }

  // allowlist mode — silent block
  return { allowed: false, reason: "blocked" };
}

/**
 * Check if a team message is allowed based on team policy, group ID, sender, and session type.
 *
 * teamIds entry formats (case-insensitive):
 *   "teamId"               — allow any sender in this team (matches both team and superTeam)
 *   "teamId|accountId"     — allow only this sender in this team (matches both)
 *   "1|teamId"             — allow any sender, only regular team (高级群)
 *   "2|teamId"             — allow any sender, only super team (超大群)
 *   "1|teamId|accountId"   — specific sender, only regular team
 *   "2|teamId|accountId"   — specific sender, only super team
 *
 * Modes:
 *   open      → accept all groups
 *   allowlist → only groups (and optionally senders) matching teamIds entries
 *   disabled  → reject all team messages
 */
export function isNimTeamAllowed(params: {
  teamPolicy: NimTeamPolicy;
  teamIds: Array<string | number>;
  groupId: string;
  senderId: string;
  sessionType: "team" | "superTeam";
}): boolean {
  const { teamPolicy, teamIds, groupId, senderId, sessionType } = params;

  if (teamPolicy === "disabled") return false;
  if (teamPolicy === "open") return true;

  // "allowlist" with empty list — treat as disabled
  if (!teamIds || teamIds.length === 0) return false;

  const nGroupId = groupId.toLowerCase();
  const nSenderId = senderId.toLowerCase();

  return teamIds.some((entry) => {
    const parts = String(entry).split("|");
    const first = parts[0].trim();

    let entryType: string | null = null;
    let entryTeamId: string;
    let entrySender: string;

    if (first === "1" || first === "2") {
      // Type-prefixed entry: "1|teamId" or "2|superTeamId" (with optional sender)
      entryType = first;
      entryTeamId = (parts[1] ?? "").trim().toLowerCase();
      entrySender = (parts[2] ?? "").trim().toLowerCase();
    } else {
      // No type prefix — matches both team and superTeam
      entryTeamId = first.toLowerCase();
      entrySender = (parts[1] ?? "").trim().toLowerCase();
    }

    // If entry has a type prefix, enforce session type match
    if (entryType !== null) {
      const expectedType = entryType === "1" ? "team" : "superTeam";
      if (sessionType !== expectedType) return false;
    }

    if (entryTeamId !== nGroupId) return false;
    return !entrySender || entrySender === nSenderId;
  });
}

/**
 * Check if a QChat inbound message is allowed based on policy and allowFrom entries.
 *
 * Modes:
 *   open      → accept all (beyond the @-mention gate)
 *   allowlist → only messages matching allowFrom entries
 *   disabled  → reject all inbound QChat messages
 *
 * allowFrom entry formats (case-insensitive):
 *   "serverId"                     — any channel, any sender in this server
 *   "serverId|channelId"           — any sender in this server+channel
 *   "serverId|channelId|accountId" — specific sender in this server+channel
 *   "serverId||accountId"          — specific sender in any channel of this server
 */
export type QChatBlockReason =
  | { allowed: true }
  | { allowed: false; reason: "disabled" }
  | { allowed: false; reason: "no_match"; allowFrom: Array<string | number> };

export function isQChatAllowed(params: {
  policy: "open" | "allowlist" | "disabled";
  allowFrom: Array<string | number>;
  serverId: string;
  channelId: string;
  senderAccid: string;
}): QChatBlockReason {
  const { policy, allowFrom, serverId, channelId, senderAccid } = params;

  if (policy === "disabled") return { allowed: false, reason: "disabled" };
  if (policy === "open") return { allowed: true };

  // "allowlist" with empty list — treat as disabled
  if (!allowFrom || allowFrom.length === 0)
    return { allowed: false, reason: "disabled" };

  const nServer = serverId.toLowerCase();
  const nChannel = channelId.toLowerCase();
  const nSender = senderAccid.toLowerCase();

  const matched = allowFrom.some((entry) => {
    const parts = String(entry).split("|");
    const entryServer = parts[0].trim().toLowerCase();
    const entryChannel = (parts[1] ?? "").trim().toLowerCase();
    const entrySender = (parts[2] ?? "").trim().toLowerCase();

    if (entryServer !== nServer) return false;
    if (entryChannel && entryChannel !== nChannel) return false;
    if (entrySender && entrySender !== nSender) return false;
    return true;
  });

  if (matched) return { allowed: true };
  return { allowed: false, reason: "no_match", allowFrom };
}

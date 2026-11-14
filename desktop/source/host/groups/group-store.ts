/**
 * The file that makes an agent's folder a group chat: `group.json`, which
 * says who is in the group. Members are the user's own agents (by id),
 * agents of other people, or both; a group that is a room shared with other
 * people also carries the room's id.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SAND_GROUP_FILENAME = "group.json";
export const GROUP_CONFIG_VERSION = 1;
/** How many members of one kind a group keeps. */
export const GROUP_MAX_MEMBERS = 6;

export interface RemoteGroupMember {
  ownerAuthId: string;
  agentId: string;
  name: string;
  avatarDataUrl?: string;
}

export interface SandGroupConfig {
  version: number;
  memberIds: string[];
  remoteMembers?: RemoteGroupMember[];
  sharedRoomId?: string;
}

export function getSandGroupPath(agentDir: string): string {
  return join(agentDir, SAND_GROUP_FILENAME);
}

/** The ids as they are kept: texts only, without the spaces around them, each once, the first six. */
export function normalizeMemberIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const ids = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string") {
      continue;
    }
    const id = value.trim();
    if (!id) {
      continue;
    }
    ids.add(id);
    if (ids.size >= GROUP_MAX_MEMBERS) {
      break;
    }
  }
  return [...ids];
}

/**
 * One member from another person as it is kept, or nothing when the entry
 * does not name both an owner and an agent. A member without a name is
 * called "Agent".
 */
function remoteMemberFrom(value: unknown): RemoteGroupMember | undefined {
  if (typeof value !== "object" || value == null) {
    return undefined;
  }
  const entry = value as Record<string, unknown>;
  if (typeof entry.ownerAuthId !== "string" || typeof entry.agentId !== "string") {
    return undefined;
  }
  const ownerAuthId = entry.ownerAuthId.trim();
  const agentId = entry.agentId.trim();
  if (!ownerAuthId || !agentId) {
    return undefined;
  }
  const member: RemoteGroupMember = { ownerAuthId, agentId, name: (typeof entry.name === "string" && entry.name.trim()) || "Agent" };
  if (typeof entry.avatarDataUrl === "string" && entry.avatarDataUrl) {
    member.avatarDataUrl = entry.avatarDataUrl;
  }
  return member;
}

/** Other people's members as they are kept: each owner's agent once, the first six. */
export function normalizeRemoteMembers(raw: unknown): RemoteGroupMember[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const byOwnerAndAgent = new Map<string, RemoteGroupMember>();
  for (const value of raw) {
    const member = remoteMemberFrom(value);
    if (member === undefined) {
      continue;
    }
    const key = `${member.ownerAuthId}\0${member.agentId}`;
    if (byOwnerAndAgent.has(key)) {
      continue;
    }
    byOwnerAndAgent.set(key, member);
    if (byOwnerAndAgent.size >= GROUP_MAX_MEMBERS) {
      break;
    }
  }
  return [...byOwnerAndAgent.values()];
}

/** What the group file holds, when it can be read and holds an object. */
function storedIn(agentDir: string): Record<string, unknown> | null {
  let stored: unknown;
  try {
    stored = JSON.parse(readFileSync(getSandGroupPath(agentDir), "utf8"));
  } catch {
    return null;
  }
  if (typeof stored !== "object" || stored == null) {
    return null;
  }
  return stored as Record<string, unknown>;
}

/**
 * The group a folder holds, tidied, or null when it holds none: no file, a
 * file that cannot be read, or one that names no member and no room.
 */
export function readSandGroupConfig(agentDir: string): SandGroupConfig | null {
  const stored = storedIn(agentDir);
  if (stored === null) {
    return null;
  }
  const memberIds = normalizeMemberIds(stored.memberIds);
  const remoteMembers = normalizeRemoteMembers(stored.remoteMembers);
  const sharedRoomId = typeof stored.sharedRoomId === "string" && stored.sharedRoomId.length > 0 ? stored.sharedRoomId : undefined;
  if (memberIds.length === 0 && remoteMembers.length === 0 && sharedRoomId === undefined) {
    return null;
  }
  const config: SandGroupConfig = { version: typeof stored.version === "number" ? stored.version : GROUP_CONFIG_VERSION, memberIds };
  if (remoteMembers.length > 0) {
    config.remoteMembers = remoteMembers;
  }
  if (sharedRoomId !== undefined) {
    config.sharedRoomId = sharedRoomId;
  }
  return config;
}

/**
 * Writes the group's file, making the folder if need be. The members are
 * tidied on the way; other people's members and the room id are written
 * only when there are any.
 */
export function writeSandGroupConfig(agentDir: string, config: SandGroupConfig): void {
  const file = getSandGroupPath(agentDir);
  // The folder is made before the config is looked at.
  mkdirSync(dirname(file), { recursive: true });
  const remoteMembers = normalizeRemoteMembers(config.remoteMembers);
  const stored: SandGroupConfig = { version: config.version, memberIds: normalizeMemberIds(config.memberIds) };
  if (remoteMembers.length > 0) {
    stored.remoteMembers = remoteMembers;
  }
  if (config.sharedRoomId) {
    stored.sharedRoomId = config.sharedRoomId;
  }
  writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
}

export function isSandGroupDir(agentDir: string): boolean {
  return readSandGroupConfig(agentDir) !== null;
}

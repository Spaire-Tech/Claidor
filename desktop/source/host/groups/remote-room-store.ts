/**
 * The file that marks an agent's folder as a room hosted by someone else:
 * `remote-room.json`, which says which room, who hosts it and who is in it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SAND_REMOTE_ROOM_FILENAME = "remote-room.json";
export const REMOTE_ROOM_CONFIG_VERSION = 1;

/** How many members of a room are kept when its file is read. */
const ROOM_MAX_MEMBERS = 24;

export interface RemoteRoomMember {
  kind: "agent" | "human";
  authId: string;
  agentId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface SandRemoteRoomConfig {
  version: number;
  roomId: string;
  hostAuthId: string;
  hostName: string;
  hostAvatarUrl?: string;
  members: RemoteRoomMember[];
  isRevoked?: true;
}

export function getSandRemoteRoomPath(agentDir: string): string {
  return join(agentDir, SAND_REMOTE_ROOM_FILENAME);
}

/** The value when it is a text with something in it; nothing otherwise. */
function textIn(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * One member of the room as it is kept, or nothing when the entry carries
 * no auth id. Anyone not marked as an agent is a person; a member without a
 * name is "Someone".
 */
function roomMemberFrom(value: unknown): RemoteRoomMember | undefined {
  if (typeof value !== "object" || value == null) {
    return undefined;
  }
  const entry = value as Record<string, unknown>;
  const authId = textIn(entry.authId);
  if (authId === undefined) {
    return undefined;
  }
  const member: RemoteRoomMember = {
    kind: entry.kind === "agent" ? "agent" : "human",
    authId,
    agentId: typeof entry.agentId === "string" ? entry.agentId : "",
    displayName: textIn(entry.displayName) ?? "Someone",
  };
  const avatarUrl = textIn(entry.avatarUrl);
  if (avatarUrl !== undefined) {
    member.avatarUrl = avatarUrl;
  }
  return member;
}

/** The room's members as they are kept: nothing is trimmed and nobody is left out for being there twice; the first 24. */
export function normalizeRemoteRoomMembers(raw: unknown): RemoteRoomMember[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const members: RemoteRoomMember[] = [];
  for (const value of raw) {
    const member = roomMemberFrom(value);
    if (member === undefined) {
      continue;
    }
    members.push(member);
    if (members.length >= ROOM_MAX_MEMBERS) {
      break;
    }
  }
  return members;
}

/**
 * The room a folder points to, tidied, or null when it points to none: no
 * file, a file that cannot be read, or one without a room id and a host.
 */
export function readSandRemoteRoomConfig(agentDir: string): SandRemoteRoomConfig | null {
  let stored: Record<string, unknown>;
  try {
    stored = JSON.parse(readFileSync(getSandRemoteRoomPath(agentDir), "utf8"));
  } catch {
    return null;
  }
  // What was read is taken for an object without a look: a file that holds `null` fails on the next line.
  const roomId = textIn(stored.roomId);
  if (roomId === undefined) {
    return null;
  }
  const hostAuthId = textIn(stored.hostAuthId);
  if (hostAuthId === undefined) {
    return null;
  }
  const hostAvatarUrl = textIn(stored.hostAvatarUrl);
  return {
    version: typeof stored.version === "number" ? stored.version : REMOTE_ROOM_CONFIG_VERSION,
    roomId,
    hostAuthId,
    hostName: textIn(stored.hostName) ?? "The host",
    ...(hostAvatarUrl === undefined ? {} : { hostAvatarUrl }),
    members: normalizeRemoteRoomMembers(stored.members),
    ...(stored.isRevoked === true ? { isRevoked: true } : {}),
  };
}

/** Writes the room's file as it is given, making the folder if need be. Tidying happens when it is read. */
export function writeSandRemoteRoomConfig(agentDir: string, config: SandRemoteRoomConfig): void {
  const file = getSandRemoteRoomPath(agentDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function isSandRemoteRoomDir(agentDir: string): boolean {
  return readSandRemoteRoomConfig(agentDir) !== null;
}

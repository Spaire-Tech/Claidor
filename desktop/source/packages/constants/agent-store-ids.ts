/**
 * How agent stores are named: the names stores are mounted under, and the
 * ids a store, a cloud agent, a person and a team go by, with the checks
 * that tell one kind of id from another.
 */

export const AGENT_STORE_USER_MOUNT_NAME = "user";
export const AGENT_STORE_TEAM_MOUNT_NAME = "team";
export const AGENT_STORE_AUTOMATION_MOUNT_NAME = "automation";
export const NAMED_AGENT_HOME_STORE_MOUNT_NAME = "home";

/** A path inside a store is reserved when one of its parts starts with this, in any capitals. */
export const AGENT_STORE_RESERVED_SIMEON_PATH_PREFIX = ".simeon";

/** The variable in an agent's shell that names the folder its store's files are in. */
export const SIMEON_AGENT_STORE_FILES_DIR_ENV = "SIMEON_AGENT_STORE_FILES_DIR";

/** A UUID of version 1 to 5 or 7 and of the usual variant. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-57][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/** A person's or a team's number: digits, the first of them not a nought. */
const NUMBER = "[1-9][0-9]*";

/** A pattern for a whole id and nothing around it, capitals and small letters alike. */
function wholeId(pattern: string): RegExp {
  return new RegExp(`^${pattern}$`, "i");
}

const BARE_UUID = wholeId(UUID);
const STORE_ID = wholeId(`store-${UUID}`);
/** `bc-`, then a name that ends with a line or no name, then the UUID. */
const CLOUD_AGENT_ID = wholeId(`bc-(?:[0-9a-z][0-9a-z-]*-)?${UUID}`);
/** Unlike the ids above, a share's key is read with its capitals as they are. */
const SHARE_MOUNT_KEY = /^store-[A-Za-z0-9_-]{24}$/;
const PERSON_SOURCE_ID = new RegExp(`^(?:t(?<team>${NUMBER})-)?u(?<person>${NUMBER})$`);
const TEAM_SOURCE_ID = new RegExp(`^t(?<team>${NUMBER})$`);

/** The number some digits stand for, when it can be held exactly. A larger one is refused, not rounded. */
function exactNumber(digits: string): number | undefined {
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : undefined;
}

/** A person's source id, `u42`, or the same within a team, `t7-u42`. */
export function parseUserAgentStoreSourceId(sourceId: string): { userId: number; teamId?: number } | undefined {
  const found: Record<string, string | undefined> = PERSON_SOURCE_ID.exec(sourceId)?.groups ?? {};
  if (found.person === undefined) return undefined;
  const userId = exactNumber(found.person);
  if (userId === undefined) return undefined;
  if (found.team === undefined) return { userId };
  const teamId = exactNumber(found.team);
  return teamId === undefined ? undefined : { userId, teamId };
}

/** A team's source id, `t7`. */
export function parseTeamAgentStoreSourceId(sourceId: string): { teamId: number } | undefined {
  const team = TEAM_SOURCE_ID.exec(sourceId)?.groups?.team;
  if (team === undefined) return undefined;
  const teamId = exactNumber(team);
  return teamId === undefined ? undefined : { teamId };
}

export const isValidBareUuid = (agentId: string): boolean => BARE_UUID.test(agentId);
export const isCloudAgentStoreId = (agentId: string): boolean => CLOUD_AGENT_ID.test(agentId);
export const isAgentStoreId = (storeId: string): boolean => STORE_ID.test(storeId);
/** A cloud agent's id or a bare UUID; a person's or a team's source id is neither. */
export const isAgentStoreSourceId = (sourceId: string): boolean => isCloudAgentStoreId(sourceId) || isValidBareUuid(sourceId);
export const isAgentStoreShareMountKey = (mountKey: string): boolean => SHARE_MOUNT_KEY.test(mountKey);

/**
 * Where a person's settings are kept on their machine, and five numbers
 * about how long a worker socket's path may be.
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** The name of a worker's socket file. Only its length is used here. */
const SOCKET_FILE = "worker.sock";

/** The longest a socket's whole path may be. */
export const MAX_SOCKET_PATH_LENGTH = 104;

/** The length of the hash that follows a path's prefix. */
export const HASH_LENGTH = 7;

/** The length of the socket file's name. */
export const WINDOWS_SOCK_LENGTH = SOCKET_FILE.length;

/** The whole length, less the socket file's name and one character more. */
export const MAX_FULL_PATH_LENGTH = MAX_SOCKET_PATH_LENGTH - (WINDOWS_SOCK_LENGTH + 1);

/** That length again, less the hash and one character more. */
export const MAX_PREFIX_LENGTH_BEFORE_HASH = MAX_FULL_PATH_LENGTH - (HASH_LENGTH + 1);

/** Whether a setting says something: one that is missing, empty or only spaces does not. */
function saysSomething(setting: string | undefined): setting is string {
  return Boolean(setting?.trim());
}

/**
 * The settings folder. Three places, the first that is named wins:
 * `SIMEON_CONFIG_DIR`, taken exactly as it is written; the `cursor` folder
 * of `XDG_CONFIG_HOME`; `.simeon` in the home folder. Each setting is read
 * only when the one before it named nothing.
 */
export function getConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const own = env.SIMEON_CONFIG_DIR;
  if (saysSomething(own)) return own;

  const shared = env.XDG_CONFIG_HOME;
  if (saysSomething(shared)) return join(shared, "cursor");

  return join(homedir(), ".simeon");
}

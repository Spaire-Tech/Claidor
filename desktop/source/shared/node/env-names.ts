/**
 * Simeon's setting names (5 October 2026).
 *
 * The app, the host in the box and the helpers read their settings as
 * `SAND_<NAME>`, the upstream's prefix, in some six hundred places. Since
 * this day every one of them is also read as `SIMEON_<NAME>`: each process
 * entry calls `acceptSimeonEnvNames()` first, which copies every
 * `SIMEON_<NAME>` in the environment to `SAND_<NAME>` when that is not set.
 * `SAND_<NAME>` wins when both are set, so nothing a deployment, the box
 * image or an older build already sets changes meaning. The readers move to
 * the `SIMEON_` names one by one, and the copy goes the other way when the
 * last `SAND_` reader is gone.
 */
export const ENV_PREFIX = "SIMEON_";
export const EARLIER_ENV_PREFIX = "SAND_";

/** Copies `SIMEON_<NAME>` to `SAND_<NAME>` where the latter is unset; returns the names written. */
export function acceptSimeonEnvNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const written: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || !name.startsWith(ENV_PREFIX)) continue;
    const earlier = `${EARLIER_ENV_PREFIX}${name.slice(ENV_PREFIX.length)}`;
    if (env[earlier] !== undefined) continue;
    env[earlier] = value;
    written.push(earlier);
  }
  return written;
}

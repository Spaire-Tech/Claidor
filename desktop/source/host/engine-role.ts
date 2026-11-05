/**
 * Which part of the agents' engine this process is
 * (`docs/agents-on-the-server/README.md`, step 1a), read from
 * `SIMEON_ENGINE_ROLE`:
 *
 * - `brain`: the engine off the computer (on Render). Everything the person
 *   talks to runs here, and the computer is reached only for its hands.
 * - `hands`: the engine on a computer whose agents run on the brain. It keeps
 *   only what has to stay on the computer: restoring and backing up the
 *   computer's own files, and answering the server's health and backup calls.
 *   No agents, no inbox, no routines, so nothing is answered twice.
 * - `all` (not set): the whole engine on the computer, as before.
 *
 * An unknown value is read as `all`, with a warning: that is how every
 * computer ran before the roles, and the server is the only one that sets it.
 */
export const SIMEON_ENGINE_ROLE_ENV = "SIMEON_ENGINE_ROLE";

export type EngineRole = "brain" | "hands" | "all";

export function engineRoleFromEnv(env: Record<string, string | undefined> = process.env): EngineRole {
  const raw = env[SIMEON_ENGINE_ROLE_ENV]?.trim().toLowerCase() ?? "";
  if (raw === "brain" || raw === "hands") return raw;
  return "all";
}

/** The line the engine logs at start: the role it took, and why when the
 * setting was there but not understood. */
export function describeEngineRole(env: Record<string, string | undefined> = process.env): string {
  const raw = env[SIMEON_ENGINE_ROLE_ENV]?.trim() ?? "";
  const role = engineRoleFromEnv(env);
  if (raw.length > 0 && role === "all") return `[sand-host] engine role: all (${SIMEON_ENGINE_ROLE_ENV} not understood, read as all)`;
  return `[sand-host] engine role: ${role}`;
}

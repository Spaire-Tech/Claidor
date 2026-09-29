export type SandBoxRuntime = "remote" | "local-docker";

// Grok Bot's own default (0.18.0): every person's computer is in the cloud,
// made by the backend (`EnsureSandBox`). From 19 September to 29 September
// 2026 this was "local-docker", because Simeon Labs' server could not make a
// cloud computer yet; it can now (`server/polar/sand/box_*.py`).
export const DEFAULT_SAND_BOX_RUNTIME: SandBoxRuntime = "remote";

/** The internal switch for the Docker box on the Mac: a test path for us,
 * never shown to a person. Only `SAND_BOX_RUNTIME=local-docker` selects it. */
export const SAND_BOX_RUNTIME_ENV = "SAND_BOX_RUNTIME";

export function isSandBoxRuntime(value: unknown): value is SandBoxRuntime {
  return value === "remote" || value === "local-docker";
}

/** Which computer this app runs on. A value stored in settings.json is not
 * read: the Settings switch that wrote "local-docker" is gone, and a person
 * who once flipped it must not stay on Docker. */
export function resolveSandBoxRuntime(env: NodeJS.ProcessEnv = process.env): SandBoxRuntime {
  const value = env[SAND_BOX_RUNTIME_ENV]?.trim();
  return isSandBoxRuntime(value) ? value : DEFAULT_SAND_BOX_RUNTIME;
}

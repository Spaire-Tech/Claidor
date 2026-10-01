export const SAND_INFERENCE_PROVIDERS = ["cursor", "simeon", "claude-code", "codex", "openrouter"] as const;
export type SandInferenceProvider = (typeof SAND_INFERENCE_PROVIDERS)[number];
export const PRODUCT_INFERENCE_PROVIDER: SandInferenceProvider = "simeon";
export const SAND_INFERENCE_PROVIDER_ENV = "SAND_INFERENCE_PROVIDER";
export const SAND_SIMEON_FULL_AGENT_ENV = "SAND_SIMEON_FULL_AGENT";

// The provider id and the SAND_SIMEON_* settings were named "claidor" and
// SAND_CLAIDOR_* until 29 September 2026. Settings files and transcripts on a
// Mac still hold the old id, and a Mac or box may still set the old names, so
// both are read.
const LEGACY_PROVIDER_IDS: Readonly<Record<string, SandInferenceProvider>> = { claidor: "simeon" };
const LEGACY_ENV_PREFIX = "SAND_CLAIDOR_";

/** A SAND_SIMEON_* setting, or its earlier SAND_CLAIDOR_* name when only that is set. */
export function readSimeonEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  if (value !== undefined || !name.startsWith("SAND_SIMEON_")) return value;
  return env[LEGACY_ENV_PREFIX + name.slice("SAND_SIMEON_".length)];
}

/** A stored provider id, with the earlier "claidor" read as "simeon". */
export function normalizeSandInferenceProvider(value: unknown): SandInferenceProvider | undefined {
  if (typeof value === "string" && Object.hasOwn(LEGACY_PROVIDER_IDS, value)) return LEGACY_PROVIDER_IDS[value];
  return isSandInferenceProvider(value) ? value : undefined;
}

export function envFlagEnabled(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(value?.trim() ?? "");
}

export function envFlagDisabled(value: string | undefined): boolean {
  return /^(0|false|no|off)$/i.test(value?.trim() ?? "");
}

// Product turns run the upstream app's own agent loop on the host (the box), which
// keeps one transcript per agent, carries tool calls and results between
// turns, creates teammates in the background, and draws every card through
// the one append. Decided by the founder on 22 September 2026 ("use the
// original the upstream app loop. i want literally everything"). Empty env is on.
// SAND_SIMEON_FULL_AGENT=off is the Mac-local, text-only escape hatch.
export function routesSimeonThroughHost(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = readSimeonEnv(env, SAND_SIMEON_FULL_AGENT_ENV)?.trim() ?? "";
  if (raw.length === 0) return true;
  return !envFlagDisabled(raw);
}

export function resolveProductInferenceProvider(_env: NodeJS.ProcessEnv = process.env): SandInferenceProvider {
  return PRODUCT_INFERENCE_PROVIDER;
}

export interface SandInferenceRouterUsageProvider {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly lastUsedAt: string | null;
}

export interface SandInferenceRouterUsage {
  readonly schemaVersion: 1;
  readonly providers: Record<SandInferenceProvider, SandInferenceRouterUsageProvider>;
}

export function isSandInferenceProvider(value: unknown): value is SandInferenceProvider {
  return typeof value === "string" && (SAND_INFERENCE_PROVIDERS as readonly string[]).includes(value);
}

export function emptySandInferenceRouterUsage(): SandInferenceRouterUsage {
  const empty = (): SandInferenceRouterUsageProvider => ({ requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, lastUsedAt: null });
  return { schemaVersion: 1, providers: { cursor: empty(), simeon: empty(), "claude-code": empty(), codex: empty(), openrouter: empty() } };
}

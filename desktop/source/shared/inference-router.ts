export const SAND_INFERENCE_PROVIDERS = ["cursor", "claidor", "claude-code", "codex", "openrouter"] as const;
export type SandInferenceProvider = (typeof SAND_INFERENCE_PROVIDERS)[number];
export const PRODUCT_INFERENCE_PROVIDER: SandInferenceProvider = "claidor";
export const CAISRA_CLAUDE_CODE_ENV = "CAISRA_CLAUDE_CODE";
export const SAND_INFERENCE_PROVIDER_ENV = "SAND_INFERENCE_PROVIDER";
export const SAND_CLAIDOR_FULL_AGENT_ENV = "SAND_CLAIDOR_FULL_AGENT";

export function envFlagEnabled(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(value?.trim() ?? "");
}

export function envFlagDisabled(value: string | undefined): boolean {
  return /^(0|false|no|off)$/i.test(value?.trim() ?? "");
}

// Product turns run Grok Bot's own agent loop on the host (the box), which
// keeps one transcript per agent, carries tool calls and results between
// turns, creates teammates in the background, and draws every card through
// the one append. Decided by the founder on 22 September 2026 ("use the
// original Grok Bot loop. i want literally everything"). Empty env is on.
// SAND_CLAIDOR_FULL_AGENT=off is the Mac-local, text-only escape hatch.
export function routesClaidorThroughHost(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[SAND_CLAIDOR_FULL_AGENT_ENV]?.trim() ?? "";
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
  return { schemaVersion: 1, providers: { cursor: empty(), claidor: empty(), "claude-code": empty(), codex: empty(), openrouter: empty() } };
}

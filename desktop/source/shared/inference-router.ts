export const SAND_INFERENCE_PROVIDERS = ["cursor", "claidor", "claude-code", "codex", "openrouter"] as const;
export type SandInferenceProvider = (typeof SAND_INFERENCE_PROVIDERS)[number];
export const PRODUCT_INFERENCE_PROVIDER: SandInferenceProvider = "claidor";
export const CAISRA_CLAUDE_CODE_ENV = "CAISRA_CLAUDE_CODE";
export const SAND_INFERENCE_PROVIDER_ENV = "SAND_INFERENCE_PROVIDER";

export function envFlagEnabled(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(value?.trim() ?? "");
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

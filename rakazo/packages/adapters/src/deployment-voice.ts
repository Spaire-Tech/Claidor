import { VOICE_CATALOG } from "./voice-factory.js";

/** The provider this deployment speaks with unless told otherwise. */
export const DEFAULT_VOICE_PROVIDER_ID = "elevenlabs";

export type DeploymentVoice = {
  provider: string;
  apiKey: string;
  /** The voice to use when nothing nearer has chosen one. May be empty. */
  voiceId: string;
};

/**
 * One voice provider, keyed by the operator, for everybody.
 *
 * The same rule as the model service: nobody using this product enters an API
 * key. The key is the deployment's, held in its environment, and no screen
 * asks for one — see `docs/product/claidor-on-rakazo.md` in the parent
 * repository.
 *
 * A row per provider rather than a branch at each call site, so adding a fifth
 * is a line here. An unknown or unkeyed provider yields nothing rather than
 * another vendor's key, which a ternary on one provider would not give.
 */
export function resolveDeploymentVoice(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentVoice | null {
  // The offline harness speaks without a key, as it must: AGENT_RUNTIME=scripted
  // has no vendor behind it. Kept here rather than special-cased at each call
  // site, so the e2e suite exercises the same deployment-voice path as
  // production instead of one written only for tests.
  // Read from the env handed in, not from `process.env` through
  // `scriptedVoiceEnabled()`. Every other line of this function is a pure
  // function of its argument, and one that is not makes the whole thing
  // untestable and its behaviour depend on where it is called from.
  if (env.AGENT_RUNTIME === "scripted") {
    return { provider: "scripted", apiKey: "scripted", voiceId: env.VOICE_ID?.trim() || "" };
  }

  const keys: Record<string, string | undefined> = {
    elevenlabs: env.ELEVENLABS_API_KEY,
    openai: env.VOICE_OPENAI_API_KEY ?? env.OPENAI_API_KEY,
    cartesia: env.CARTESIA_API_KEY,
    "fish-audio": env.FISH_AUDIO_API_KEY,
  };
  const provider = env.VOICE_PROVIDER?.trim() || DEFAULT_VOICE_PROVIDER_ID;
  // Only a provider this build actually ships an adapter for. A typo in
  // VOICE_PROVIDER must read as "no voice configured" here rather than as a
  // thrown error inside somebody's call.
  if (!VOICE_CATALOG.some((entry) => entry.id === provider)) return null;
  const apiKey = keys[provider]?.trim();
  if (!apiKey) return null;
  return {
    provider,
    apiKey,
    voiceId: (env.VOICE_ID ?? env.ELEVENLABS_VOICE_ID ?? "").trim(),
  };
}

/** Whether this deployment speaks at all, without loading the key. */
export function hasDeploymentVoice(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveDeploymentVoice(env) !== null;
}

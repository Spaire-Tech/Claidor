import {
  createProvider,
  type Model,
  type MutableModels,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import { declaredVisionModelIds, inputModalities } from "./model-modalities.js";

/**
 * Caisra's metered model proxy.
 *
 * Caisra's users never hold a provider key. The proxy at `CAISRA_MODELS_URL`
 * holds the Anthropic and OpenAI keys server-side, meters the call against the
 * signed-in account, and forwards it. From Pi's side it is an ordinary
 * OpenAI-compatible endpoint, so this registers it the way
 * `pi-local-provider.ts` registers a local model server: a catalog entry built
 * from environment configuration, because Pi's built-in catalog only ships
 * providers it knows.
 *
 * Two things differ from the local provider, and both matter:
 *
 * The base URL is fixed by the operator, never typed by a user. That is why
 * this is its own provider rather than a connection through
 * `pi-openai-compatible-provider.ts`, whose URLs are user-supplied and
 * therefore refuse public hosts unless `RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1`.
 * Turning that switch on to admit one trusted host would admit every other
 * host to every user-entered connection as well, which is the SSRF hole that
 * check exists to close.
 *
 * And the key is per user, not per deployment. `resolve` returns a placeholder
 * so Models counts the provider as configured and lists its models; the real
 * bearer is the signed-in account's Caisra token, which reaches the request as
 * the run's `apiKey` through the same path a saved model connection uses.
 * A deployment-wide key would bill every account to one meter.
 */
export const CAISRA_PROVIDER_ID = "caisra";

/**
 * Stands in for the bearer before the account is connected. Deliberately not a
 * credential shape: it must never look like one in a log, and the proxy must
 * refuse it.
 */
export const CAISRA_UNAUTHENTICATED_KEY = "caisra-not-connected";

/** Model ids the proxy serves with vision, declared by the operator. */
export const CAISRA_VISION_MODELS_ENV = "CAISRA_VISION_MODELS";

export function caisraVisionModelIds(): ReadonlySet<string> {
  return declaredVisionModelIds(CAISRA_VISION_MODELS_ENV);
}

const DEFAULT_BASE_URL = "https://api.claidor.com/api/proxy/v1";
const DEFAULT_CONTEXT_WINDOW = 200_000;
const DEFAULT_MAX_TOKENS = 32_000;

export function caisraBaseUrl(): string {
  const value = process.env.CAISRA_MODELS_URL?.trim() || DEFAULT_BASE_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("CAISRA_MODELS_URL must be an absolute HTTP(S) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CAISRA_MODELS_URL must be an absolute HTTP(S) URL");
  }
  if (url.username || url.password) {
    throw new Error("CAISRA_MODELS_URL must not contain credentials");
  }
  return value;
}

/**
 * A token count from the environment, or the default when unset.
 *
 * Only a finite positive integer is a meaningful limit, so anything else is a
 * configuration mistake worth failing on. `Number(x) || default` would accept a
 * negative window and swallow a typo as the default.
 */
function tokenLimit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}"`);
  }
  return value;
}

/** Comma-separated model ids exactly as the proxy names them. */
function caisraModelIds(): string[] {
  return (process.env.CAISRA_MODELS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function caisraModel(id: string): Model<"openai-completions"> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: CAISRA_PROVIDER_ID,
    baseUrl: caisraBaseUrl(),
    reasoning: false,
    // OpenAI answers 400 when `reasoning_effort` arrives with function tools on
    // /v1/chat/completions, and names /v1/responses in its own error. An agent
    // always carries tools, so declaring reasoning support on this wire would
    // fail every tool-holding turn. Reasoning belongs to a later Responses
    // transport, not to a flag here.
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    input: inputModalities(caisraVisionModelIds().has(id)),
    // The proxy meters and bills; Pi's own cost accounting would double-count,
    // and it has no price list for models it does not know.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: tokenLimit("CAISRA_CONTEXT_WINDOW", DEFAULT_CONTEXT_WINDOW),
    maxTokens: tokenLimit("CAISRA_MAX_TOKENS", DEFAULT_MAX_TOKENS),
  };
}

/** The provider, or undefined when no Caisra models are configured. */
export function caisraProvider(): Provider | undefined {
  const ids = caisraModelIds();
  if (!ids.length) return undefined;
  return createProvider({
    id: CAISRA_PROVIDER_ID,
    name: "Caisra",
    baseUrl: caisraBaseUrl(),
    auth: {
      apiKey: {
        name: "Caisra account",
        // The signed-in account's Caisra token when one is stored, and a
        // placeholder otherwise. The fallback is not decoration: Models hides
        // every model of a provider whose auth does not resolve, so returning
        // undefined before sign-in would empty the picker the user is meant to
        // sign in from. The placeholder is never a working bearer — the proxy
        // rejects it — so an unauthenticated call fails at the proxy with a
        // 401 it can explain, rather than silently disappearing from the UI.
        resolve: async ({ credential }) => ({
          auth: { apiKey: credential?.key ?? CAISRA_UNAUTHENTICATED_KEY, baseUrl: caisraBaseUrl() },
          source: "Caisra account",
        }),
      },
    },
    models: ids.map(caisraModel),
    api: openAICompletionsApi(),
  });
}

/** Register the Caisra provider on a Models collection. No-op when unconfigured. */
export function registerCaisraProvider(models: MutableModels): MutableModels {
  const provider = caisraProvider();
  if (provider) models.setProvider(provider);
  return models;
}

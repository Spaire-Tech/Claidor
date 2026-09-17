import { randomUUID } from "node:crypto";

import type { OAuthCredential, ProviderAuthInteraction } from "@earendil-works/pi-ai";
import {
  createProvider,
  type Model,
  type MutableModels,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import {
  CAISRA_ACCESS_TOKEN_TTL_MS,
  caisraSignInUrl,
  exchangeCaisraAuthCode,
  refreshCaisraSession,
} from "./caisra-account.js";
import { declaredVisionModelIds, inputModalities } from "./model-modalities.js";

/**
 * Caisra's metered model proxy, as a provider the runtime already knows how to
 * sign in to.
 *
 * Caisra's users never hold a provider key. The proxy holds the Anthropic and
 * OpenAI keys server-side, meters the call against the signed-in account, and
 * forwards it. From the runtime's side it is an ordinary OpenAI-compatible
 * endpoint, registered the way `pi-local-provider.ts` registers a local model
 * server: a catalog built from environment configuration, because the built-in
 * catalog only ships providers it knows.
 *
 * Two things differ from the local provider, and both matter.
 *
 * The base URL is fixed by the operator, never typed by a user. That is why
 * this is its own provider rather than a connection through
 * `pi-openai-compatible-provider.ts`, whose URLs are user-supplied and
 * therefore refuse public hosts unless `RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1`.
 * Turning that switch on to admit one trusted host would admit every other host
 * to every user-entered connection as well, which is the SSRF hole that check
 * exists to close.
 *
 * And the credential is an account session rather than a key, so it uses the
 * runtime's OAuth slot. A Caisra access token lives an hour and its refresh
 * token thirty days; the OAuth credential is `{ access, refresh, expires }`,
 * which is exactly that session, and `Models` refreshes it under its store lock
 * when it expires. An api-key credential has nowhere to put the refresh token,
 * which is what made an earlier attempt here hand-roll a session holder that
 * this slot already provides.
 */
export const CAISRA_PROVIDER_ID = "caisra";

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

/** An account session as the runtime's canonical OAuth credential. */
function toOAuthCredential(session: {
  accessToken: string;
  refreshToken: string;
}): OAuthCredential {
  return {
    type: "oauth",
    access: session.accessToken,
    refresh: session.refreshToken,
    // Caisra does not return an expiry, so it is derived from the account
    // server's own access-token lifetime, less a skew so a token is replaced
    // before a long turn can outlive it mid-request.
    expires: Date.now() + CAISRA_ACCESS_TOKEN_TTL_MS - 5 * 60 * 1000,
  };
}

/**
 * Sign in: send the person to Caisra, take the code their callback received.
 *
 * `prompt` is how the runtime asks a surface for that code; the desktop app's
 * loopback listener answers it. Caisra hands a code only to that listener or to
 * the `caisra://` deep link, so a hosted web origin cannot complete this.
 */
async function caisraOAuthLogin(interaction: ProviderAuthInteraction): Promise<OAuthCredential> {
  const redirectUri = process.env.CAISRA_REDIRECT_URI?.trim() || "caisra://auth/callback";
  const state = randomUUID();
  interaction.notify({
    type: "auth_url",
    url: caisraSignInUrl({ redirectUri, state }),
    instructions: "Sign in to Caisra in your browser to connect your account.",
  });
  const code = await interaction.prompt({
    type: "manual_code",
    message: "Paste the code from the Caisra sign-in callback:",
    placeholder: redirectUri,
    signal: interaction.signal,
  });
  return toOAuthCredential(await exchangeCaisraAuthCode(code, { signal: interaction.signal }));
}

/** Exchange the refresh token. Throws on rejection; `Models` holds the lock. */
async function caisraOAuthRefresh(
  credential: OAuthCredential,
  signal: AbortSignal,
): Promise<OAuthCredential> {
  return toOAuthCredential(await refreshCaisraSession(credential.refresh, { signal }));
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
      // The runtime's own OAuth slot, not a hand-rolled session. It stores the
      // access and refresh pair, notices the expiry, and runs `refresh` under
      // its store lock, so concurrent runs share one refresh instead of racing
      // to spend the refresh token. That is the whole reason this is `oauth`
      // and not an api key: a Caisra access token lives an hour, and an api-key
      // credential has nowhere to keep the refresh token or the expiry.
      //
      // `isSubscription` stays false. The runtime's other sign-ins are a
      // person's own ChatGPT or Claude plan; a Caisra account is billed by us.
      oauth: {
        name: "Caisra account",
        loginLabel: "Sign in to Caisra",
        isSubscription: false,
        login: caisraOAuthLogin,
        refresh: caisraOAuthRefresh,
        toAuth: async (credential) => ({
          apiKey: credential.access,
          baseUrl: caisraBaseUrl(),
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

import { OPENAI_COMPATIBLE_PROVIDER_ID } from "./openai-compatible-url.js";

export const DEFAULT_OPENROUTER_MODEL_ID = "openai/gpt-5.6-luna";

/**
 * Claidor's metered proxy, which is this deployment's one model service.
 *
 * **The two variables are `CLAIDOR_ACCESS_TOKEN` and `CLAIDOR_MODEL_BASE_URL`,
 * and neither is called an API key or an API base URL, on purpose.** Both of
 * those names are already taken inside Claidor and mean something else:
 * `CLAIDOR_API_KEY` is a customer's own organization access token in Claidor's
 * published guides (`docs/guides/laravel.mdx`), and `CLAIDOR_API_BASE_URL` is
 * the API root `https://api.claidor.com` that the cloud runner reads
 * (`runner/src/settings.ts`, set at `render.yaml`). What this deployment needs
 * is neither: it is a `claidor_pat_` token with the `model_proxy` scope, and a
 * URL that points at the proxy path rather than the root. A name collision
 * between two values that differ only by a path suffix is the kind of thing
 * that fails silently on a host where both services share an environment
 * group.
 *
 * "Access token" is also the honest word. Nobody using this product enters an
 * API key; there is no key here to enter.
 */
export const CLAIDOR_PROVIDER_ID = OPENAI_COMPATIBLE_PROVIDER_ID;
export const CLAIDOR_PROVIDER_NAME = "Claidor";
export const CLAIDOR_DEFAULT_BASE_URL = "https://api.claidor.com/desktop/api/proxy/v1";
export const CLAIDOR_DEFAULT_MODEL_ID = "gpt-5.6-terra";
/**
 * The model for machinery nobody reads as "the agent".
 *
 * Claidor's own catalogue declares this as a role rather than a name
 * (`server/polar/desktop/pricing.py`, `ModelRole`): `primary` is every reply a
 * person reads, `cheap` is sub-agents, compaction, memory flushes, heartbeats,
 * titles and previews. Their words for why: *"The app does not choose a model
 * per message — it cannot know how hard a task is before doing it … Instead
 * there is one model they talk to and cheap ones for machinery they never
 * see."*
 *
 * Rakazo has no such notion; everything it does, including summarising a long
 * thread, runs on whatever model the bot is set to. Reading a whole
 * conversation back through the everyday model to write a summary nobody sees
 * is the expensive half of the bill, and it buys nothing.
 */
export const CLAIDOR_DEFAULT_CHEAP_MODEL_ID = "gpt-5.6-luna";

/**
 * The models Claidor's proxy serves on the Chat Completions wire, and what to
 * call them.
 *
 * Kept here rather than fetched, so the menu draws without a network call and
 * the offline tests stay offline. Claidor serves the authoritative list at
 * `<base URL>/models`; when it changes, `CLAIDOR_MODELS` overrides this without
 * a release.
 *
 * Claude is deliberately absent. Claidor's catalogue has it, but an
 * OpenAI-compatible client speaks Chat Completions only and nothing in that
 * proxy translates a Chat Completions request into an Anthropic one, so naming
 * Claude here would put a model on the menu that the next request refuses.
 */
const CLAIDOR_MODEL_LABELS: Record<string, string> = {
  "gpt-5.6-terra": "Everyday",
  "gpt-5.6-luna": "Quick",
};
const CLAIDOR_DEFAULT_MODEL_IDS = ["gpt-5.6-terra", "gpt-5.6-luna"];

export type ClaidorCatalogEntry = {
  provider: string;
  providerName: string;
  id: string;
  label: string;
  billing: string;
  reasoning: boolean;
};

/** The whole menu, or an empty one when Claidor is not this deployment's model service. */
export function claidorCatalog(env: NodeJS.ProcessEnv = process.env): ClaidorCatalogEntry[] {
  if (!env.CLAIDOR_ACCESS_TOKEN?.trim()) return [];
  const listed = (env.CLAIDOR_MODELS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const ids = listed.length ? listed : CLAIDOR_DEFAULT_MODEL_IDS;
  const chosen = env.CLAIDOR_MODEL?.trim();
  // The configured model is always on its own menu, even when it is not one of
  // the ids above. Offering a menu that excludes the model actually in use
  // would read as a bug at the exact moment somebody went looking.
  const all = chosen && !ids.includes(chosen) ? [chosen, ...ids] : ids;
  return all.map((id) => ({
    provider: CLAIDOR_PROVIDER_ID,
    providerName: CLAIDOR_PROVIDER_NAME,
    id,
    label: CLAIDOR_MODEL_LABELS[id] ?? id,
    // No key to enter, so there is nothing to say about billing except who pays.
    billing: "Included. Your monthly allowance covers it.",
    reasoning: false,
  }));
}

export type DeploymentModel = {
  provider: string;
  model: string;
  key: string | undefined;
  /** Only an OpenAI-compatible endpoint has one; the vendors are fixed. */
  baseUrl?: string;
  /** The model for work nobody reads. Absent on the vendor providers. */
  cheapModel?: string;
};

/**
 * The deployment-wide model: which provider a run uses, and the key for it.
 *
 * Vendor env names and model ids live here, in the adapter layer, not in core.
 *
 * **Claidor wins when it is configured**, whatever else is set. Nobody using
 * this product enters an API key: the keys are Claidor's, held server-side,
 * and every request is metered against the person's own monthly allowance.
 * That is the whole reason there is no longer a screen asking for one — see
 * `docs/product/claidor-on-rakazo.md` in the parent repository.
 *
 * `PI_DEFAULT_PROVIDER` is still read, and still chooses between the two
 * bring-your-own-key providers, because the offline test harness and the eval
 * runner use them and neither should need a Claidor account to run.
 */
export function resolveDeploymentModel(env: NodeJS.ProcessEnv = process.env): DeploymentModel {
  const claidorToken = env.CLAIDOR_ACCESS_TOKEN?.trim();
  if (claidorToken) {
    return {
      provider: CLAIDOR_PROVIDER_ID,
      model: env.CLAIDOR_MODEL?.trim() || CLAIDOR_DEFAULT_MODEL_ID,
      key: claidorToken,
      baseUrl: env.CLAIDOR_MODEL_BASE_URL?.trim() || CLAIDOR_DEFAULT_BASE_URL,
      cheapModel: env.CLAIDOR_CHEAP_MODEL?.trim() || CLAIDOR_DEFAULT_CHEAP_MODEL_ID,
    };
  }

  const provider = env.PI_DEFAULT_PROVIDER?.trim() || "openrouter";
  // A row per provider that ships a deployment key. A third one adds a row here, not a
  // branch at each call site — and an unknown provider gets no key rather than another
  // vendor's, which a ternary on one provider would not give.
  const keys: Record<string, string | undefined> = {
    openrouter: env.OPENROUTER_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
  };
  const models: Record<string, string> = {
    openrouter: DEFAULT_OPENROUTER_MODEL_ID,
    anthropic: "claude-sonnet-5",
  };
  return {
    provider,
    model: env.PI_DEFAULT_MODEL?.trim() || models[provider] || models.openrouter!,
    key: keys[provider],
  };
}

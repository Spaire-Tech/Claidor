import type { ProviderConfig } from '../providers';
import { ProviderName, ProviderRegistry } from '../providers';

/**
 * Which models the agent runs on: the account's allowance, or your own key.
 *
 * **Why this exists.** The founder: *"that's bs. i dont use their credits.
 * i use my open api."* Two things were wrong at once.
 *
 * The message was NetEase's — but the *limit* is ours. Our server counts
 * credits against `DESKTOP_MONTHLY_CREDITS` and answers 402 with code
 * 40200 (`polar/desktop/service.py`), and 40200 is inside the pattern
 * upstream's classifier matches to "upgrade your plan", so our own quota
 * was sending them to LobsterAI's pricing page. That string is fixed.
 *
 * And the escape hatch was gone. A person's own provider key is a real
 * capability — `app_config.providers`, read by the config sync and handed
 * to the engine — but the only screen that could set one was the old
 * thirteen-tab Settings, and I cut the route to it when this Settings
 * replaced it. So the app told them to upgrade, and offered no way to use
 * the key they already had.
 *
 * Everything here is a decision about that config, kept pure so it can be
 * tested without a store: what the rows offer, what gets written, and
 * what "using my own key" means for the providers already in there.
 */

/** The account's own allowance, through the metered proxy. */
export const ACCOUNT_MODELS = 'account';

/**
 * The providers offered by name.
 *
 * Not all twenty. These are the ones somebody outside China plausibly
 * already has a key for; the registry holds the rest and nothing stops a
 * later row offering more. `custom` is deliberately absent — it needs a
 * base URL and a model list, which is a form, not a row.
 */
export const OWN_KEY_PROVIDERS: readonly string[] = [
  ProviderName.OpenAI,
  ProviderName.Anthropic,
  ProviderName.Gemini,
  ProviderName.OpenRouter,
];

export interface ModelChoice {
  /** `ACCOUNT_MODELS`, or a provider id. */
  value: string;
  label: string;
  hint?: string;
}

/** What the "Models" row offers. */
export function modelChoices(): readonly ModelChoice[] {
  return [
    {
      value: ACCOUNT_MODELS,
      label: "Your account's allowance",
      hint: 'Billed to your Claidor account and reset at the start of each month.',
    },
    ...OWN_KEY_PROVIDERS.flatMap(id => {
      const def = ProviderRegistry.get(id);
      if (!def) return [];
      return [{
        value: id,
        label: `My own ${def.label} key`,
        hint: `Billed by ${def.label} to you. Nothing goes through your account's allowance.`,
      }];
    }),
  ];
}

/** Where to get a key, for the line under the field. */
export function apiKeyUrlFor(providerId: string): string | undefined {
  return ProviderRegistry.get(providerId)?.apiKeyUrl;
}

export function providerLabel(providerId: string): string {
  return ProviderRegistry.get(providerId)?.label ?? providerId;
}

type Providers = Record<string, ProviderConfig>;

/**
 * Which choice the stored config represents.
 *
 * The account's allowance is the absence of an enabled key, not a flag —
 * so a config nobody has touched reads as the account, which is what a
 * new install is.
 */
export function currentChoice(providers: Providers | undefined): string {
  if (!providers) return ACCOUNT_MODELS;
  for (const id of OWN_KEY_PROVIDERS) {
    const one = providers[id];
    if (one?.enabled && one.apiKey?.trim()) return id;
  }
  return ACCOUNT_MODELS;
}

/** The key already stored for a provider, for the field to show. */
export function storedKey(providers: Providers | undefined, providerId: string): string {
  return providers?.[providerId]?.apiKey?.trim() ?? '';
}

/**
 * Which model id a choice runs on.
 *
 * This is the half that actually decides. `app_config.providers` only says
 * a key exists; the engine's provider is resolved from
 * `app_config.model.defaultModel` and `defaultModelProvider`
 * (`claudeSettings.ts:resolveMatchedProvider`), and that resolver returns
 * the account's server plan straight away when the stored provider is
 * `lobsterai-server`. So a key written without this would be stored,
 * synced, and never used — a control that does nothing.
 */
export function defaultModelIdFor(
  providers: Providers | undefined,
  choice: string,
): string | undefined {
  if (choice === ACCOUNT_MODELS) return undefined;
  const first = providers?.[choice]?.models?.find(model => model.id?.trim());
  return first?.id.trim();
}

/**
 * The providers map after a choice, with the key that goes with it.
 *
 * Two rules, and both matter:
 *
 *  - **Only one own-key provider is ever enabled.** Two enabled keys is
 *    an ambiguity the config sync resolves by ordering, which is a
 *    coin-toss a person cannot see.
 *  - **`lobsterai-server` is never touched.** It is the billed plan and
 *    it authenticates through the local token proxy rather than a key;
 *    disabling it here would take the account's allowance away as a side
 *    effect of typing a key, and re-enabling it is not this row's job.
 */
export function providersFor(
  providers: Providers | undefined,
  choice: string,
  apiKey: string,
): Providers {
  const next: Providers = { ...(providers ?? {}) };

  for (const id of OWN_KEY_PROVIDERS) {
    const existing = next[id];
    if (!existing) continue;
    // The key is kept. Somebody switching to the account's allowance for
    // a week should not have to find their key again afterwards.
    next[id] = { ...existing, enabled: false };
  }

  if (choice === ACCOUNT_MODELS) return next;

  const def = ProviderRegistry.get(choice);
  if (!def) return next;

  const key = apiKey.trim();
  next[choice] = {
    ...(next[choice] ?? {}),
    enabled: key.length > 0,
    apiKey: key,
    baseUrl: next[choice]?.baseUrl?.trim() || def.defaultBaseUrl,
    apiFormat: next[choice]?.apiFormat ?? def.defaultApiFormat,
    models: next[choice]?.models?.length ? next[choice].models : [...def.defaultModels],
  };
  return next;
}

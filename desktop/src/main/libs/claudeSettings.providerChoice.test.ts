import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
}));

import { ACCOUNT_MODELS, defaultModelIdFor, providersFor } from '../../renderer/design/settings/models';
import { ProviderName } from '../../shared/providers';
import type { SqliteStore } from '../sqliteStore';
import {
  resolveRawApiConfig,
  setAuthTokensGetter,
  setServerBaseUrlGetter,
  setStoreGetter,
} from './claudeSettings';

/**
 * Settings' "Models" row, against the resolver it has to move.
 *
 * The row writes `app_config`. What the engine runs on is decided here, in
 * `resolveMatchedProvider`, and its first branch answers with the account's
 * server plan whenever `model.defaultModelProvider` still says
 * `lobsterai-server` — whatever keys are enabled underneath. So "write the
 * providers map" is not the fix on its own, and this is where that is
 * proved rather than assumed.
 *
 * The row's own decisions (`design/settings/models.ts`) are the input here
 * on purpose: the two halves are only correct together.
 */

let stored: Record<string, unknown> = {};

beforeEach(() => {
  stored = {};
  setStoreGetter(() => ({
    get: <T,>(key: string): T | undefined => stored[key] as T | undefined,
  } as unknown as SqliteStore));
  // The account's allowance: a token and the server it goes to.
  setAuthTokensGetter(() => ({ accessToken: 'tok', refreshToken: 'ref' }));
  setServerBaseUrlGetter(() => 'https://api.claidor.com');
});

const ACCOUNT_MODEL_ID = 'claude-sonnet-4-5';

const write = (choice: string, apiKey: string): void => {
  const before = (stored.app_config as { providers?: Record<string, never> } | undefined)?.providers;
  const providers = providersFor(before, choice, apiKey);
  const modelId = defaultModelIdFor(providers, choice);
  stored.app_config = {
    providers,
    model: choice === ACCOUNT_MODELS
      ? { defaultModel: ACCOUNT_MODEL_ID, defaultModelProvider: ProviderName.LobsteraiServer }
      : { defaultModel: modelId, defaultModelProvider: choice },
  };
};

describe('what the engine ends up running on', () => {
  test('the account, when nobody has typed a key', () => {
    write(ACCOUNT_MODELS, '');
    const { config, providerMetadata } = resolveRawApiConfig();
    expect(providerMetadata?.providerName).toBe(ProviderName.LobsteraiServer);
    expect(config?.baseURL).toBe('https://api.claidor.com/api/proxy/v1');
    expect(config?.apiKey).toBe('tok');
  });

  test('a key alone does not move it — the model field is what decides', () => {
    // This is the fault the row would have shipped with. The providers map
    // says OpenAI is enabled with a key, and the resolver still answers
    // with the account's plan, because that first branch never looks.
    write(ACCOUNT_MODELS, '');
    const config = stored.app_config as { providers: Record<string, unknown>; model: unknown };
    stored.app_config = {
      ...config,
      providers: providersFor(config.providers as never, ProviderName.OpenAI, 'sk-mine'),
    };
    expect(resolveRawApiConfig().providerMetadata?.providerName)
      .toBe(ProviderName.LobsteraiServer);
  });

  test('the key, once the row writes the model with it', () => {
    write(ProviderName.OpenAI, 'sk-mine');
    const { config, providerMetadata } = resolveRawApiConfig();
    expect(providerMetadata?.providerName).toBe(ProviderName.OpenAI);
    expect(config?.apiKey).toBe('sk-mine');
    expect(config?.baseURL).toBe('https://api.openai.com/v1');
    // Nothing on the account's allowance: a different host entirely.
    expect(config?.baseURL).not.toContain('claidor.com');
  });

  test('and back to the account, with the key still stored', () => {
    write(ProviderName.OpenAI, 'sk-mine');
    write(ACCOUNT_MODELS, '');
    const { config, providerMetadata } = resolveRawApiConfig();
    expect(providerMetadata?.providerName).toBe(ProviderName.LobsteraiServer);
    expect(config?.baseURL).toBe('https://api.claidor.com/api/proxy/v1');
    const providers = (stored.app_config as { providers: Record<string, { apiKey: string; enabled: boolean }> }).providers;
    expect(providers[ProviderName.OpenAI].apiKey).toBe('sk-mine');
    expect(providers[ProviderName.OpenAI].enabled).toBe(false);
  });

  test('switching from one key to another leaves only the new one enabled', () => {
    write(ProviderName.OpenAI, 'sk-mine');
    write(ProviderName.Anthropic, 'sk-ant');
    const { config, providerMetadata } = resolveRawApiConfig();
    expect(providerMetadata?.providerName).toBe(ProviderName.Anthropic);
    expect(config?.apiKey).toBe('sk-ant');
  });
});

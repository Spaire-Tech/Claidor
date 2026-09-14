import { describe, expect, test } from 'vitest';

import { ProviderName } from '../providers';
import {
  ACCOUNT_MODELS,
  apiKeyUrlFor,
  currentChoice,
  defaultModelIdFor,
  modelChoices,
  OWN_KEY_PROVIDERS,
  providersFor,
  storedKey,
} from './models';

describe('what the row offers', () => {
  test('the account first, then the keys somebody might already have', () => {
    const choices = modelChoices();
    expect(choices[0].value).toBe(ACCOUNT_MODELS);
    expect(choices.slice(1).map(one => one.value)).toEqual([...OWN_KEY_PROVIDERS]);
  });

  test('every option says who is billed, because that is the whole question', () => {
    for (const choice of modelChoices()) {
      expect(choice.hint, choice.value).toMatch(/billed/i);
    }
  });

  test('each provider carries a real page to get a key from', () => {
    for (const id of OWN_KEY_PROVIDERS) {
      expect(apiKeyUrlFor(id), id).toMatch(/^https:\/\//);
    }
  });
});

describe('reading what is stored', () => {
  test('nothing stored is the account, which is what a new install is', () => {
    expect(currentChoice(undefined)).toBe(ACCOUNT_MODELS);
    expect(currentChoice({})).toBe(ACCOUNT_MODELS);
  });

  test('a provider enabled with a key is that provider', () => {
    expect(currentChoice({
      [ProviderName.OpenAI]: { enabled: true, apiKey: 'sk-x', baseUrl: '' },
    })).toBe(ProviderName.OpenAI);
  });

  test('enabled with no key is not a choice — it is a half-typed one', () => {
    expect(currentChoice({
      [ProviderName.OpenAI]: { enabled: true, apiKey: '   ', baseUrl: '' },
    })).toBe(ACCOUNT_MODELS);
  });

  test('a key that is stored but switched off is the account', () => {
    expect(currentChoice({
      [ProviderName.OpenAI]: { enabled: false, apiKey: 'sk-x', baseUrl: '' },
    })).toBe(ACCOUNT_MODELS);
  });

  test('the field shows the key that is already there', () => {
    const providers = { [ProviderName.OpenAI]: { enabled: false, apiKey: ' sk-x ', baseUrl: '' } };
    expect(storedKey(providers, ProviderName.OpenAI)).toBe('sk-x');
    expect(storedKey(providers, ProviderName.Anthropic)).toBe('');
    expect(storedKey(undefined, ProviderName.OpenAI)).toBe('');
  });
});

describe('writing a choice', () => {
  test('a key fills in the provider\'s own defaults', () => {
    const next = providersFor(undefined, ProviderName.OpenAI, 'sk-x');
    const one = next[ProviderName.OpenAI];
    expect(one.enabled).toBe(true);
    expect(one.apiKey).toBe('sk-x');
    expect(one.baseUrl).toBe('https://api.openai.com/v1');
    expect(one.models?.length).toBeGreaterThan(0);
  });

  test('only one own-key provider is ever enabled', () => {
    // Two enabled keys is an ambiguity the config sync settles by
    // ordering, which is a coin-toss a person cannot see.
    const first = providersFor(undefined, ProviderName.OpenAI, 'sk-x');
    const second = providersFor(first, ProviderName.Anthropic, 'sk-y');
    expect(second[ProviderName.OpenAI].enabled).toBe(false);
    expect(second[ProviderName.Anthropic].enabled).toBe(true);
  });

  test('switching back to the account keeps the key, switched off', () => {
    // A week on the allowance should not cost somebody their key.
    const withKey = providersFor(undefined, ProviderName.OpenAI, 'sk-x');
    const back = providersFor(withKey, ACCOUNT_MODELS, '');
    expect(back[ProviderName.OpenAI].enabled).toBe(false);
    expect(back[ProviderName.OpenAI].apiKey).toBe('sk-x');
  });

  test('an empty key does not enable anything', () => {
    const next = providersFor(undefined, ProviderName.OpenAI, '   ');
    expect(next[ProviderName.OpenAI].enabled).toBe(false);
  });

  test('the billed plan is never touched', () => {
    // It authenticates through the local token proxy rather than a key.
    // Disabling it here would take the account's allowance away as a side
    // effect of somebody typing their own key.
    const providers = {
      [ProviderName.LobsteraiServer]: { enabled: true, apiKey: '', baseUrl: 'http://127.0.0.1:1/v1' },
    };
    const next = providersFor(providers, ProviderName.OpenAI, 'sk-x');
    expect(next[ProviderName.LobsteraiServer]).toEqual(providers[ProviderName.LobsteraiServer]);
  });

  test('a base URL somebody set by hand is not overwritten', () => {
    const providers = {
      [ProviderName.OpenAI]: { enabled: false, apiKey: '', baseUrl: 'https://proxy.example/v1' },
    };
    expect(providersFor(providers, ProviderName.OpenAI, 'sk-x')[ProviderName.OpenAI].baseUrl)
      .toBe('https://proxy.example/v1');
  });

  test('an unknown provider writes nothing rather than a broken entry', () => {
    const next = providersFor(undefined, 'not-a-provider', 'sk-x');
    expect(next['not-a-provider']).toBeUndefined();
  });

  test('a choice carries the model that goes with it', () => {
    // Without this the key is stored and never used: the engine resolves
    // its provider from `model.defaultModel`, not from which keys exist.
    const next = providersFor(undefined, ProviderName.OpenAI, 'sk-x');
    const modelId = defaultModelIdFor(next, ProviderName.OpenAI);
    expect(modelId).toBeTruthy();
    expect(next[ProviderName.OpenAI].models?.some(one => one.id === modelId)).toBe(true);
  });

  test('the account has no model id of its own here', () => {
    // The account's models come from the server, not from this config.
    expect(defaultModelIdFor(undefined, ACCOUNT_MODELS)).toBeUndefined();
    expect(defaultModelIdFor({}, ProviderName.OpenAI)).toBeUndefined();
  });

  test('providers it does not manage are left exactly as they were', () => {
    const providers = { ollama: { enabled: true, apiKey: '', baseUrl: 'http://localhost:11434' } };
    expect(providersFor(providers, ProviderName.OpenAI, 'sk-x').ollama)
      .toEqual(providers.ollama);
  });
});

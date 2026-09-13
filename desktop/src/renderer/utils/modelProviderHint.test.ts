import { describe, expect, test } from 'vitest';

import type { Model } from '../store/slices/modelSlice';
import { getModelDisplayName, resolveModelIconProviderKey, resolveProviderKeyForModelRef } from './modelProviderHint';

const models: Model[] = [
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', isServerModel: true },
  { id: 'gpt-6', name: 'GPT-6', providerKey: 'openai' },
];

describe('the model name and mark above a turn', () => {
  test('uses the record the app has', () => {
    expect(getModelDisplayName('claude-sonnet-5', models)).toBe('Claude Sonnet 5');
    expect(getModelDisplayName('maties/claude-sonnet-5', models)).toBe('Claude Sonnet 5');
  });

  test('tidies a reference the app does not know', () => {
    expect(getModelDisplayName('anthropic/claude-opus-5', [])).toBe('Claude Opus 5');
    expect(getModelDisplayName('gemini-3-pro', [])).toBe('Gemini 3 Pro');
    expect(getModelDisplayName('', models)).toBe('');
  });

  test('picks the provider mark from the name for a plan model', () => {
    expect(resolveModelIconProviderKey(models[0])).toBe('anthropic');
    expect(resolveModelIconProviderKey(models[1])).toBe('openai');
    expect(resolveProviderKeyForModelRef('maties/claude-sonnet-5')).toBe('anthropic');
    expect(resolveProviderKeyForModelRef('something-else')).toBe('');
  });
});

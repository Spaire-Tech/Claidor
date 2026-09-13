import { describe, expect, test } from 'vitest';

import {
  MatiesThinkingLevel,
  resolveOpenClawThinkingProfile,
} from '../../../openclaw-extensions/maties-model-compat/thinkingProfileMapping';

describe('maties model compatibility thinking profile precedence', () => {
  test('prefers a server thinking profile when a Kimi K3 runtime profile also exists', () => {
    expect(resolveOpenClawThinkingProfile({
      options: [
        { level: MatiesThinkingLevel.Off, openclawLevel: 'off' },
        { level: MatiesThinkingLevel.High, openclawLevel: 'high' },
        { level: MatiesThinkingLevel.Max, openclawLevel: 'xhigh' },
      ],
      defaultLevel: MatiesThinkingLevel.High,
    }, true)).toEqual({
      levels: [
        { id: 'off', label: 'off' },
        { id: 'high', label: 'high' },
        { id: 'xhigh', label: 'max' },
      ],
      defaultLevel: 'high',
      preserveWhenCatalogReasoningFalse: true,
    });
  });

  test('uses the max-only Kimi K3 fallback when no server thinking profile exists', () => {
    expect(resolveOpenClawThinkingProfile(undefined, true)).toEqual({
      levels: [{ id: 'max', label: 'max' }],
      defaultLevel: 'max',
      preserveWhenCatalogReasoningFalse: true,
    });
  });
});

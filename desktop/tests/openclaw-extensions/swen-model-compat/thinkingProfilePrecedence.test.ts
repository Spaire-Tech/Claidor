import { describe, expect, test } from 'vitest';

import {
  SwenThinkingLevel,
  resolveOpenClawThinkingProfile,
} from '../../../openclaw-extensions/swen-model-compat/thinkingProfileMapping';

describe('swen model compatibility thinking profile precedence', () => {
  test('prefers a server thinking profile when a Kimi K3 runtime profile also exists', () => {
    expect(resolveOpenClawThinkingProfile({
      options: [
        { level: SwenThinkingLevel.Off, openclawLevel: 'off' },
        { level: SwenThinkingLevel.High, openclawLevel: 'high' },
        { level: SwenThinkingLevel.Max, openclawLevel: 'xhigh' },
      ],
      defaultLevel: SwenThinkingLevel.High,
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

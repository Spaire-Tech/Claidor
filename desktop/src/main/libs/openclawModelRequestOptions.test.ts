import type { StreamFn } from 'openclaw/plugin-sdk/agent-core';
import { describe, expect, test } from 'vitest';

import {
  createMatiesRequestOptionsWrapper,
  resolveMatiesRequestThinkingLevel,
} from '../../../openclaw-extensions/maties-model-compat/requestOptions';
import {
  MATIES_REQUEST_OPTIONS_FIELD,
  MATIES_REQUEST_OPTIONS_VERSION,
} from '../../../openclaw-extensions/maties-model-compat/requestOptionsProtocol';
import type { MatiesThinkingProfile } from '../../../openclaw-extensions/maties-model-compat/thinkingProfileMapping';

const profile: MatiesThinkingProfile = {
  options: [
    { level: 'off', openclawLevel: 'off' },
    { level: 'high', openclawLevel: 'high' },
    { level: 'max', openclawLevel: 'xhigh' },
  ],
  defaultLevel: 'high',
  requestOptionsVersion: 1,
};

describe('Maties request options', () => {
  test('uses an allowed selected level and falls back to the profile default', () => {
    expect(resolveMatiesRequestThinkingLevel(profile, 'off')).toBe('off');
    expect(resolveMatiesRequestThinkingLevel(profile, 'xhigh')).toBe('max');
    expect(resolveMatiesRequestThinkingLevel(profile, 'low')).toBe('high');
    expect(resolveMatiesRequestThinkingLevel(profile, undefined)).toBe('high');
  });

  test('adds the final semantic thinking intent after the caller payload hook', async () => {
    let forwardedOptions: Parameters<StreamFn>[2] | undefined;
    const baseStreamFn: StreamFn = ((_model, _context, options) => {
      forwardedOptions = options;
      return {} as ReturnType<StreamFn>;
    }) as StreamFn;
    const wrapped = createMatiesRequestOptionsWrapper(baseStreamFn, 'off');

    await wrapped({} as never, {} as never, {
      onPayload: () => ({
        model: 'deepseek-v4-flash-YoudaoInner',
        [MATIES_REQUEST_OPTIONS_FIELD]: {
          version: 999,
          thinking: { level: 'max' },
        },
      }),
    });

    const payload = await forwardedOptions?.onPayload?.({}, {} as never);
    expect(payload).toEqual({
      model: 'deepseek-v4-flash-YoudaoInner',
      [MATIES_REQUEST_OPTIONS_FIELD]: {
        version: MATIES_REQUEST_OPTIONS_VERSION,
        thinking: { level: 'off' },
      },
    });
  });
});

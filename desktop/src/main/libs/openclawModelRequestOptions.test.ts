import type { StreamFn } from 'openclaw/plugin-sdk/agent-core';
import { describe, expect, test } from 'vitest';

import {
  createSwenRequestOptionsWrapper,
  resolveSwenRequestThinkingLevel,
} from '../../../openclaw-extensions/swen-model-compat/requestOptions';
import {
  SWEN_REQUEST_OPTIONS_FIELD,
  SWEN_REQUEST_OPTIONS_VERSION,
} from '../../../openclaw-extensions/swen-model-compat/requestOptionsProtocol';
import type { SwenThinkingProfile } from '../../../openclaw-extensions/swen-model-compat/thinkingProfileMapping';

const profile: SwenThinkingProfile = {
  options: [
    { level: 'off', openclawLevel: 'off' },
    { level: 'high', openclawLevel: 'high' },
    { level: 'max', openclawLevel: 'xhigh' },
  ],
  defaultLevel: 'high',
  requestOptionsVersion: 1,
};

describe('Swen request options', () => {
  test('uses an allowed selected level and falls back to the profile default', () => {
    expect(resolveSwenRequestThinkingLevel(profile, 'off')).toBe('off');
    expect(resolveSwenRequestThinkingLevel(profile, 'xhigh')).toBe('max');
    expect(resolveSwenRequestThinkingLevel(profile, 'low')).toBe('high');
    expect(resolveSwenRequestThinkingLevel(profile, undefined)).toBe('high');
  });

  test('adds the final semantic thinking intent after the caller payload hook', async () => {
    let forwardedOptions: Parameters<StreamFn>[2] | undefined;
    const baseStreamFn: StreamFn = ((_model, _context, options) => {
      forwardedOptions = options;
      return {} as ReturnType<StreamFn>;
    }) as StreamFn;
    const wrapped = createSwenRequestOptionsWrapper(baseStreamFn, 'off');

    await wrapped({} as never, {} as never, {
      onPayload: () => ({
        model: 'deepseek-v4-flash-YoudaoInner',
        [SWEN_REQUEST_OPTIONS_FIELD]: {
          version: 999,
          thinking: { level: 'max' },
        },
      }),
    });

    const payload = await forwardedOptions?.onPayload?.({}, {} as never);
    expect(payload).toEqual({
      model: 'deepseek-v4-flash-YoudaoInner',
      [SWEN_REQUEST_OPTIONS_FIELD]: {
        version: SWEN_REQUEST_OPTIONS_VERSION,
        thinking: { level: 'off' },
      },
    });
  });
});

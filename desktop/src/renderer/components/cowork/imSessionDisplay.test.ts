import { describe, expect, test, vi } from 'vitest';

import {
  getIMSessionDisplayTitle,
  getIMSessionPlatformIconClassName,
  getIMSessionPlatformLogo,
} from './imSessionDisplay';

describe('getIMSessionDisplayTitle', () => {
  test('strips only the matching platform prefix', () => {
    expect(getIMSessionDisplayTitle('[Telegram] group:o9cq', 'telegram')).toEqual({
      title: 'group:o9cq',
      strippedPrefix: true,
    });
    expect(getIMSessionDisplayTitle('[Telegram] group:o9cq', 'discord')).toEqual({
      title: '[Telegram] group:o9cq',
      strippedPrefix: false,
    });
  });

  test('keeps user-authored channel-looking titles without a platform', () => {
    expect(getIMSessionDisplayTitle('[Telegram] Marketing plan', null)).toEqual({
      title: '[Telegram] Marketing plan',
      strippedPrefix: false,
    });
  });

  test('supports every title prefix variant of a platform', () => {
    expect(getIMSessionDisplayTitle('[TG] group:o9cq', 'telegram')).toEqual({
      title: 'group:o9cq',
      strippedPrefix: true,
    });
    expect(getIMSessionDisplayTitle('[Discord] general', 'discord')).toEqual({
      title: 'general',
      strippedPrefix: true,
    });
  });

  test('does not leave retired platforms in the session list', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(getIMSessionPlatformLogo('weixin')).toBeNull();
      expect(getIMSessionDisplayTitle('[WeChat] group:o9cq', 'weixin')).toEqual({
        title: '[WeChat] group:o9cq',
        strippedPrefix: false,
      });
    } finally {
      warn.mockRestore();
    }
  });

  test('uses the shared platform registry logos', () => {
    expect(getIMSessionPlatformLogo('telegram')).toBe('telegram.svg');
    expect(getIMSessionPlatformLogo('discord')).toBe('discord.svg');
  });

  test('keeps the default icon size for the offered platforms', () => {
    expect(getIMSessionPlatformIconClassName('telegram')).toBe('h-4 w-4 rounded-sm object-contain');
    expect(getIMSessionPlatformIconClassName('discord')).toBe('h-4 w-4 rounded-sm object-contain');
    expect(getIMSessionPlatformIconClassName(null)).toBe('h-4 w-4 rounded-sm object-contain');
  });

  test('ignores and logs unknown platforms without throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(getIMSessionPlatformLogo('unknown-channel')).toBeNull();
      expect(getIMSessionPlatformLogo('unknown-channel')).toBeNull();
      expect(getIMSessionDisplayTitle('[Telegram] title', 'unknown-channel')).toEqual({
        title: '[Telegram] title',
        strippedPrefix: false,
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        '[IMSessionDisplay] Ignoring unknown IM platform for session list:',
        'unknown-channel',
      );
    } finally {
      warn.mockRestore();
    }
  });
});

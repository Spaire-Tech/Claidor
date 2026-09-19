import { describe, expect, test } from 'vitest';

import {
  hasUnlinkableMedia,
  isInlineMediaUrl,
  isLinkableMediaUrl,
  MAX_RESULT_URL_LENGTH,
  mediaResultLine,
  mediaResultLines,
} from './mediaResultLines';

const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('isInlineMediaUrl', () => {
  test('a data URL carries its content inside itself', () => {
    expect(isInlineMediaUrl(ONE_PIXEL_PNG_DATA_URL)).toBe(true);
    expect(isInlineMediaUrl('DATA:image/png;base64,abc')).toBe(true);
    expect(isInlineMediaUrl('  data:image/png;base64,abc  ')).toBe(true);
  });

  test('a blob URL is equally meaningless in a transcript', () => {
    expect(isInlineMediaUrl('blob:https://example.com/abc')).toBe(true);
  });

  test('an ordinary link points at content instead of carrying it', () => {
    expect(isInlineMediaUrl('https://example.com/a.png')).toBe(false);
    expect(isInlineMediaUrl('file:///tmp/a.png')).toBe(false);
  });
});

describe('isLinkableMediaUrl', () => {
  test('a short https link is fine', () => {
    expect(isLinkableMediaUrl('https://example.com/a.png')).toBe(true);
  });

  test('a data URL is not, however short', () => {
    // The whole point: the Caisra image route answers with these, and a
    // 1024x1024 PNG is 1-2 MB of base64.
    expect(isLinkableMediaUrl('data:image/png;base64,aa')).toBe(false);
  });

  test('an absurdly long link is not, whatever its scheme', () => {
    const tooLong = `https://example.com/${'a'.repeat(MAX_RESULT_URL_LENGTH)}`;
    expect(isLinkableMediaUrl(tooLong)).toBe(false);
  });

  test('a link exactly at the limit is still allowed', () => {
    const exact = `https://e.com/${'a'.repeat(MAX_RESULT_URL_LENGTH - 14)}`;
    expect(exact.length).toBe(MAX_RESULT_URL_LENGTH);
    expect(isLinkableMediaUrl(exact)).toBe(true);
  });

  test('an empty URL is not linkable', () => {
    expect(isLinkableMediaUrl('')).toBe(false);
    expect(isLinkableMediaUrl('   ')).toBe(false);
  });
});

describe('mediaResultLine', () => {
  test('a normal image link keeps exactly the wording it always had', () => {
    // This change is about what happens when a URL cannot be shown. A
    // result that could always be shown must read identically, or the
    // agent's reading of a normal answer has been changed by a bug fix.
    expect(mediaResultLine('https://example.com/a.png', 0, 'image')).toBe(
      '  - ![Generated image 1](https://example.com/a.png)',
    );
  });

  test('a normal video link keeps its bare-URL form', () => {
    expect(mediaResultLine('https://example.com/a.mp4', 2, 'video')).toBe(
      '  - https://example.com/a.mp4',
    );
  });

  test('a data URL is named and never interpolated', () => {
    const line = mediaResultLine(ONE_PIXEL_PNG_DATA_URL, 0, 'image');
    expect(line).toBe('  - Generated image 1');
    expect(line).not.toContain('base64');
    expect(line).not.toContain('data:');
  });

  test('a megabyte of base64 cannot reach the transcript', () => {
    // The actual failure, at the actual scale: a 1024x1024 PNG.
    const huge = `data:image/png;base64,${'A'.repeat(1_500_000)}`;
    const line = mediaResultLine(huge, 0, 'image');
    expect(line.length).toBeLessThan(64);
  });

  test('videos are described too, not just images', () => {
    expect(mediaResultLine('data:video/mp4;base64,AA', 1, 'video')).toBe(
      '  - Generated video 2',
    );
  });
});

describe('mediaResultLines', () => {
  test('it numbers from one and keeps order', () => {
    expect(
      mediaResultLines(
        ['https://example.com/a.png', ONE_PIXEL_PNG_DATA_URL],
        'image',
      ),
    ).toEqual([
      '  - ![Generated image 1](https://example.com/a.png)',
      '  - Generated image 2',
    ]);
  });

  test('no results is no lines', () => {
    expect(mediaResultLines([], 'image')).toEqual([]);
  });
});

describe('hasUnlinkableMedia', () => {
  test('it reports when something had to be described', () => {
    expect(hasUnlinkableMedia([ONE_PIXEL_PNG_DATA_URL])).toBe(true);
    expect(hasUnlinkableMedia(['https://example.com/a.png'])).toBe(false);
    expect(
      hasUnlinkableMedia(['https://example.com/a.png', ONE_PIXEL_PNG_DATA_URL]),
    ).toBe(true);
  });
});

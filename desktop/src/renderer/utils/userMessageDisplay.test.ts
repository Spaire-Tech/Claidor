import { describe, expect, test } from 'vitest';

import { parseUserMessageForDisplay } from './userMessageDisplay';

// ─── Helpers ────────────────────────────────────────────────

const WIN_INBOUND = String.raw`C:\Users\zhangsan\AppData\Roaming\Swen\openclaw\state\media\inbound`;
const MAC_INBOUND = '/Users/zhangsan/Library/Application Support/Swen/openclaw/state/media/inbound';

const fileImg = (dir: string, name: string) => `${dir}${dir.includes('\\') ? '\\' : '/'}${name}`;

const toFileUrl = (p: string) => {
  const normalized = p.replace(/\\/g, '/');
  const urlPath = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `![](file://${encodeURI(urlPath)})`;
};

// ─── Passthrough ────────────────────────────────────────────

describe('passthrough (no transformation)', () => {
  test('empty string', () => {
    expect(parseUserMessageForDisplay('')).toBe('');
  });

  test('null/undefined returns as-is', () => {
    // @ts-expect-error test null input
    expect(parseUserMessageForDisplay(null)).toBe(null);
    // @ts-expect-error test undefined input
    expect(parseUserMessageForDisplay(undefined)).toBe(undefined);
  });

  test('plain text message unchanged', () => {
    expect(parseUserMessageForDisplay('Hello, nice weather today')).toBe('Hello, nice weather today');
  });

  test('message with markdown unchanged', () => {
    const md = '## Hello\n\n- item 1\n- item 2\n\n```js\nconsole.log("hi")\n```';
    expect(parseUserMessageForDisplay(md)).toBe(md);
  });

  test('file path NOT in inbound directory unchanged', () => {
    const msg = String.raw`C:\Users\zhangsan\Desktop\screenshot.jpg`;
    expect(parseUserMessageForDisplay(msg)).toBe(msg);
  });
});

// ─── Swen goal mode ────────────────────────────────────

describe('Swen goal mode command display', () => {
  test('strips /goal start prefix from displayed user text', () => {
    const input = '/goal start Build a showcase page for a bakery studio';
    expect(parseUserMessageForDisplay(input)).toBe('Build a showcase page for a bakery studio');
  });

  test('strips /goal set and preserves following attachment lines', () => {
    const input = [
      '/goal set Ship the landing page',
      '',
      'File: /Users/admin/Desktop/brief.md',
    ].join('\n');
    expect(parseUserMessageForDisplay(input)).toBe([
      'Ship the landing page',
      '',
      'File: /Users/admin/Desktop/brief.md',
    ].join('\n'));
  });

  test('does not strip non-start goal commands', () => {
    expect(parseUserMessageForDisplay('/goal status')).toBe('/goal status');
  });
});

// ─── Pattern A: NIM/DingTalk ────────────────────────────────

describe('Pattern A: NIM/DingTalk', () => {
  test('[Photo] with URL and [Attachment Info] → strip metadata, preserve URL as text', () => {
    const imgPath = fileImg(WIN_INBOUND, 'abc123.jpg');
    const input = [
      '[Photo] https://nos.netease.com/xxx.jpg',
      '',
      '[Attachment Info]',
      `- Type: image, Path: ${imgPath}, MIME: image/jpeg, Size: 1920x1080`,
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe('https://nos.netease.com/xxx.jpg');
    expect(result).not.toContain('[Photo]');
    expect(result).not.toContain('[Attachment Info]');
  });

  test('[Photo] without URL → strip placeholder', () => {
    const input = [
      '[Photo]',
      '',
      '[Attachment Info]',
      `- Type: image, Path: ${fileImg(WIN_INBOUND, 'abc123.jpg')}, MIME: image/jpeg`,
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe('');
  });

  test('user text + [Photo] → preserve user text and URL', () => {
    const input = [
      'Take a look at this picture',
      '[Photo] https://nos.netease.com/xxx.jpg',
      '',
      '[Attachment Info]',
      `- Type: image, Path: ${fileImg(WIN_INBOUND, 'abc123.jpg')}, MIME: image/jpeg`,
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toContain('Take a look at this picture');
    expect(result).toContain('https://nos.netease.com/xxx.jpg');
    expect(result).not.toContain('[Photo]');
  });

  test('[Voice Message] placeholder stripped', () => {
    const input = [
      '[Voice Message]',
      '',
      '[Attachment Info]',
      `- Type: audio, Path: ${WIN_INBOUND}\\voice.mp3, MIME: audio/mp3`,
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).not.toContain('[Voice Message]');
    expect(result).not.toContain('[Attachment Info]');
  });

  test('[File] with URL → preserve URL', () => {
    const input = '[File] https://nos.netease.com/file.pdf';
    const result = parseUserMessageForDisplay(input);
    expect(result).toBe('https://nos.netease.com/file.pdf');
  });

  test('[File] without URL → strip', () => {
    const input = '[File]';
    const result = parseUserMessageForDisplay(input);
    expect(result).toBe('');
  });

  test('multiple images in [Attachment Info] → strip block', () => {
    const input = [
      '[Photo]',
      '',
      '[Attachment Info]',
      `- Type: image, Path: ${fileImg(WIN_INBOUND, 'img1.jpg')}, MIME: image/jpeg`,
      `- Type: image, Path: ${fileImg(WIN_INBOUND, 'img2.png')}, MIME: image/png`,
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).not.toContain('[Attachment Info]');
    expect(result).not.toContain('[Photo]');
  });
});

// ─── Pattern B: OpenClaw gateway ────────────────────────────

describe('Pattern B: WeCom', () => {
  test('full format with pipe → strip all, render image', () => {
    const imgPath = fileImg(WIN_INBOUND, 'b02db622.jpg');
    const input = [
      `[media attached: ${imgPath} (image/jpeg) | ${imgPath}]`,
      'To send an image back, prefer the message tool (media/path/filePath). If you must inline, use MEDIA:https://example.com/image.jpg (spaces ok, quote if needed) or a safe relative path like MEDIA:./image.jpg. Avoid absolute paths (MEDIA:/...) and ~ paths - they are blocked for security. Keep caption in the text body.',
      '',
      'media:image',
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe(toFileUrl(imgPath));
    expect(result).not.toContain('[media attached');
    expect(result).not.toContain('To send an image back');
    expect(result).not.toContain('media:image');
  });
});

describe('Pattern B: WeChat', () => {
  test('format without pipe → strip all, render image', () => {
    const imgPath = fileImg(WIN_INBOUND, '154ba6cf.jpg');
    const input = [
      `[media attached: ${imgPath} (image/*)]`,
      'To send an image back, prefer the message tool (media/path/filePath). If you must inline, use MEDIA:https://example.com/image.jpg (spaces ok, quote if needed) or a safe relative path like MEDIA:./image.jpg. Avoid absolute paths (MEDIA:/...) and ~ paths - they are blocked for security. Keep caption in the text body.',
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe(toFileUrl(imgPath));
  });

  test('OpenClaw 6.1 metadata media path → render image without rewriting text', () => {
    const imgPath = fileImg(WIN_INBOUND, '913d415a.jpg');
    const input = [
      '[Image]',
      'Description:',
      'The image shows a cartoon frog-like creature.',
    ].join('\n');

    const result = parseUserMessageForDisplay(input, {
      localMediaAttachments: [{ localPath: imgPath, mimeType: 'image/jpeg' }],
    });

    expect(result).toBe(`${input}\n\n${toFileUrl(imgPath)}`);
  });

  test('metadata media path dedupes legacy [media attached:] path', () => {
    const imgPath = fileImg(WIN_INBOUND, '913d415a.jpg');
    const input = [
      `[media attached: ${imgPath} (image/jpeg)]`,
      'To send an image back, prefer the message tool (media/path/filePath).',
    ].join('\n');

    const result = parseUserMessageForDisplay(input, {
      localMediaAttachments: [{ localPath: imgPath, mimeType: 'image/jpeg' }],
    });

    expect(result).toBe(toFileUrl(imgPath));
  });

  test('metadata-only image message renders image', () => {
    const imgPath = fileImg(WIN_INBOUND, 'metadata-only.jpg');

    const result = parseUserMessageForDisplay('', {
      localMediaAttachments: [{ localPath: imgPath, mimeType: 'image/jpeg' }],
    });

    expect(result).toBe(toFileUrl(imgPath));
  });
});

describe('Pattern B: Feishu — full content', () => {
  test('full format with System: line and bare path → strip all, render image', () => {
    const imgPath = fileImg(WIN_INBOUND, '0f209ea9.jpg');
    const input = [
      `[media attached: ${imgPath} (image/jpeg) | ${imgPath}]`,
      'To send an image back, prefer the message tool (media/path/filePath). If you must inline, use MEDIA:https://example.com/image.jpg (spaces ok, quote if needed) or a safe relative path like MEDIA:./image.jpg. Avoid absolute paths (MEDIA:/...) and ~ paths - they are blocked for security. Keep caption in the text body.',
      'System: [2026-04-27 15:54:25 GMT+8] Feishu[bot-1] DM | ou_zhangsan [msg:om_x100, image, 1 attachment(s)]',
      '',
      imgPath,
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe(toFileUrl(imgPath));
    expect(result).not.toContain('System:');
    expect(result).not.toContain('[media attached');
  });
});

describe('Pattern B: Feishu — after server-side stripFeishuSystemHeader', () => {
  test('bare inbound path only (post-strip) → render image', () => {
    const imgPath = fileImg(WIN_INBOUND, '58c6a4bb.jpg');
    // After stripFeishuSystemHeader, only the bare path remains
    const result = parseUserMessageForDisplay(imgPath);
    expect(result).toBe(toFileUrl(imgPath));
  });

  test('bare inbound path with \\r\\n → render image', () => {
    const imgPath = fileImg(WIN_INBOUND, '58c6a4bb.jpg');
    const result = parseUserMessageForDisplay(`${imgPath}\r\n`);
    expect(result).toBe(toFileUrl(imgPath));
  });
});

// ─── System: timestamp lines ────────────────────────────────

describe('System: timestamp lines', () => {
  test('NIM system header stripped from text message', () => {
    const input = [
      'System: [2026-04-28 11:53:11 GMT+8] From user889589',
      '',
      '123',
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe('123');
  });

  test('multiple system lines stripped', () => {
    const input = [
      'System: [2026-04-28 11:53:11 GMT+8] From user889589',
      'System: [2026-04-28 11:53:12 GMT+8] NIM[abc123] DM',
      '',
      'hello',
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe('hello');
  });

  test('does NOT strip user text that looks vaguely like System:', () => {
    const msg = 'System: this is not a timestamp line';
    expect(parseUserMessageForDisplay(msg)).toBe(msg);
  });

  test('does NOT strip System: without valid timestamp', () => {
    const msg = 'System: [invalid] something';
    expect(parseUserMessageForDisplay(msg)).toBe(msg);
  });
});

// ─── Mac compatibility ──────────────────────────────────────

describe('Mac compatibility', () => {
  test('Mac inbound path → render image', () => {
    const imgPath = fileImg(MAC_INBOUND, 'abc123.jpg');
    const result = parseUserMessageForDisplay(imgPath);
    expect(result).toBe(toFileUrl(imgPath));
  });

  test('Mac path in [media attached:] → render image', () => {
    const imgPath = fileImg(MAC_INBOUND, 'abc123.jpg');
    const input = [
      `[media attached: ${imgPath} (image/jpeg) | ${imgPath}]`,
      'To send an image back, prefer the message tool (media/path/filePath). If you must inline, use MEDIA:https://example.com/image.jpg.',
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe(toFileUrl(imgPath));
  });
});

// ─── False positive safety ──────────────────────────────────

describe('false positive safety', () => {
  test('user discussing a file path (not inbound) is NOT stripped', () => {
    const msg = String.raw`The file is at C:\Users\test\Documents\photo.jpg`;
    expect(parseUserMessageForDisplay(msg)).toBe(msg);
  });

  test('user typing "media:video" in a sentence is NOT stripped', () => {
    const msg = 'The format looks like media:video';
    expect(parseUserMessageForDisplay(msg)).toBe(msg);
  });

  test('user mentioning "To send an image back" without [media attached:] is NOT stripped', () => {
    const msg = 'To send an image back, prefer the message tool — quoted from the documentation';
    expect(parseUserMessageForDisplay(msg)).toBe(msg);
  });

  test('user typing [Photo] in a sentence is NOT stripped (not on its own line)', () => {
    const msg = 'He put a [Photo] marker inside the message';
    // [Photo] is not on its own line, NIM_PLACEHOLDER_RE requires ^...$
    expect(parseUserMessageForDisplay(msg)).toBe(msg);
  });
});

// ─── \\r\\n handling ─────────────────────────────────────────

describe('\\r\\n handling', () => {
  test('WeCom format with \\r\\n line endings', () => {
    const imgPath = fileImg(WIN_INBOUND, 'b02db622.jpg');
    const input = [
      `[media attached: ${imgPath} (image/jpeg) | ${imgPath}]`,
      'To send an image back, prefer the message tool (media/path/filePath). If you must inline, use MEDIA:https://example.com/image.jpg.',
      '',
      'media:image',
    ].join('\r\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe(toFileUrl(imgPath));
  });

  test('NIM format with \\r\\n line endings', () => {
    const input = [
      '[Photo] https://nos.netease.com/xxx.jpg',
      '',
      '[Attachment Info]',
      `- Type: image, Path: ${fileImg(WIN_INBOUND, 'abc123.jpg')}, MIME: image/jpeg`,
    ].join('\r\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).toBe('https://nos.netease.com/xxx.jpg');
  });
});

// ─── Non-image media ────────────────────────────────────────

describe('non-image media', () => {
  test('[media attached:] with application/pdf → strip markers but no image rendered', () => {
    const pdfPath = fileImg(WIN_INBOUND, 'doc.pdf');
    const input = [
      `[media attached: ${pdfPath} (application/pdf) | ${pdfPath}]`,
      'To send an image back, prefer the message tool (media/path/filePath). If you must inline, use MEDIA:https://example.com/image.jpg.',
    ].join('\n');

    const result = parseUserMessageForDisplay(input);
    expect(result).not.toContain('[media attached');
    // PDF should not be rendered as an image
    expect(result).not.toContain('![](');
  });
});

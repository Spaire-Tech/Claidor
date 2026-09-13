import { describe, expect, test } from 'vitest';

import type { DraftAttachment } from '../../store/slices/coworkSlice';
import {
  buildMediaMentionSegments,
  computeMediaLabels,
  extractMediaReferencesFromPrompt,
  filterMediaLabels,
  MediaMentionSegmentKind,
  MediaMentionType,
  resolveMediaMentionTrigger,
} from './mediaMentionUtils';

const makeAttachment = (overrides: Partial<DraftAttachment>): DraftAttachment => ({
  path: overrides.path ?? `/tmp/${overrides.name ?? 'file.png'}`,
  name: overrides.name ?? 'file.png',
  isImage: overrides.isImage,
  dataUrl: overrides.dataUrl,
});

describe('mediaMentionUtils', () => {
  test('numbers images in attachment order', () => {
    const labels = computeMediaLabels([
      makeAttachment({ path: '/tmp/a.png', name: 'a.png', isImage: true }),
      makeAttachment({ path: '/tmp/b.jpg', name: 'b.jpg', isImage: true }),
      makeAttachment({ path: '/tmp/c.webp', name: 'c.webp', isImage: true }),
    ]);

    expect(labels.map(label => label.label)).toEqual(['image1', 'image2', 'image3']);
    expect(labels.map(label => label.mediaType)).toEqual([
      MediaMentionType.Image,
      MediaMentionType.Image,
      MediaMentionType.Image,
    ]);
  });

  test('numbers mixed media by media type', () => {
    const labels = computeMediaLabels([
      makeAttachment({ path: '/tmp/cover.png', name: 'cover.png' }),
      makeAttachment({ path: '/tmp/demo.mp4', name: 'demo.mp4' }),
      makeAttachment({ path: '/tmp/voice.wav', name: 'voice.wav' }),
      makeAttachment({ path: '/tmp/second.png', name: 'second.png' }),
    ]);

    expect(labels.map(label => label.label)).toEqual(['image1', 'video1', 'audio1', 'image2']);
  });

  test('filters by label or file name', () => {
    const labels = computeMediaLabels([
      makeAttachment({ path: '/tmp/cover.png', name: 'cover.png' }),
      makeAttachment({ path: '/tmp/demo.mp4', name: 'demo.mp4' }),
    ]);

    expect(filterMediaLabels(labels, 'image').map(label => label.label)).toEqual(['image1']);
    expect(filterMediaLabels(labels, 'demo').map(label => label.label)).toEqual(['video1']);
  });

  test('extracts valid media references and deduplicates repeated tokens', () => {
    const labels = computeMediaLabels([
      makeAttachment({ path: '/tmp/first.png', name: 'first.png' }),
      makeAttachment({ path: '/tmp/second.png', name: 'second.png' }),
    ]);

    const refs = extractMediaReferencesFromPrompt('Use @image2 and @image2, ignore @image3', labels);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      token: '@image2',
      mediaType: MediaMentionType.Image,
      index: 2,
      fileId: '/tmp/second.png',
      fileName: 'second.png',
      mimeType: 'image/png',
      localPath: '/tmp/second.png',
      role: 'reference_image',
    });
  });

  test('keeps dataUrl for inline image fallback without localPath', () => {
    const dataUrl = 'data:image/png;base64,abc123';
    const labels = computeMediaLabels([
      makeAttachment({
        path: 'inline:pasted.png:1',
        name: 'pasted.png',
        isImage: true,
        dataUrl,
      }),
    ]);

    const refs = extractMediaReferencesFromPrompt('@image1', labels);

    expect(refs).toHaveLength(1);
    expect(refs[0].localPath).toBeUndefined();
    expect(refs[0].dataUrl).toBe(dataUrl);
  });

  test('extracts the second inline image when prompt references @image2', () => {
    const firstDataUrl = 'data:image/png;base64,first';
    const secondDataUrl = 'data:image/png;base64,second';
    const labels = computeMediaLabels([
      makeAttachment({
        path: 'inline:first.png:1',
        name: 'first.png',
        isImage: true,
        dataUrl: firstDataUrl,
      }),
      makeAttachment({
        path: 'inline:second.png:2',
        name: 'second.png',
        isImage: true,
        dataUrl: secondDataUrl,
      }),
    ]);

    const refs = extractMediaReferencesFromPrompt('@image2 generate a 4s video', labels);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      token: '@image2',
      index: 2,
      fileId: 'inline:second.png:2',
      fileName: 'second.png',
      dataUrl: secondDataUrl,
    });
    expect(refs[0].dataUrl).not.toBe(firstDataUrl);
  });

  test('builds highlight segments for valid media mentions only', () => {
    const labels = computeMediaLabels([
      makeAttachment({ path: '/tmp/first.png', name: 'first.png' }),
    ]);

    const segments = buildMediaMentionSegments('Use @image1, not @image2', labels);

    expect(segments).toEqual([
      { kind: MediaMentionSegmentKind.Text, text: 'Use ' },
      { kind: MediaMentionSegmentKind.Mention, text: '@image1', label: 'image1' },
      { kind: MediaMentionSegmentKind.Text, text: ', not @image2' },
    ]);
  });

  test('resolves mention trigger after non-ASCII text', () => {
    const text = 'Zur Erklärung@';

    expect(resolveMediaMentionTrigger(text, text.length)).toEqual({
      atIndex: text.indexOf('@'),
      cursorPos: text.length,
      filter: '',
    });
  });

  test('resolves mention trigger after English and numeric text', () => {
    const text = 'abc123@';

    expect(resolveMediaMentionTrigger(text, text.length)).toEqual({
      atIndex: text.indexOf('@'),
      cursorPos: text.length,
      filter: '',
    });
  });

  test('resolves mention trigger at the beginning of input', () => {
    const text = '@pic';

    expect(resolveMediaMentionTrigger(text, text.length)).toEqual({
      atIndex: 0,
      cursorPos: text.length,
      filter: 'pic',
    });
  });

  test('does not resolve mention trigger after whitespace in the token', () => {
    expect(resolveMediaMentionTrigger('@image ', '@image '.length)).toBeNull();
    expect(resolveMediaMentionTrigger('@image\n', '@image\n'.length)).toBeNull();
  });

  test('uses the nearest at sign before the cursor as the filter token', () => {
    const text = 'first@old then@pic';

    expect(resolveMediaMentionTrigger(text, text.length)).toEqual({
      atIndex: text.lastIndexOf('@'),
      cursorPos: text.length,
      filter: 'pic',
    });
  });
});

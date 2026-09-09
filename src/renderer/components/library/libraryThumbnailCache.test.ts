import { afterEach, describe, expect, test } from 'vitest';

import {
  cacheLibraryThumbnail,
  clearLibraryThumbnailCache,
  createLibraryThumbnailCacheKey,
  getCachedLibraryThumbnail,
  LibraryThumbnailClientCacheVersion,
  shouldApplyLibraryThumbnailResult,
} from './libraryThumbnailCache';

afterEach(() => {
  clearLibraryThumbnailCache();
});

describe('library thumbnail cache', () => {
  test('changes the cache key when the file mtime changes', () => {
    expect(createLibraryThumbnailCacheKey('/tmp/report.pdf', 100)).not.toBe(
      createLibraryThumbnailCacheKey('/tmp/report.pdf', 200),
    );
  });

  test('changes the cache key when the file size changes', () => {
    expect(createLibraryThumbnailCacheKey('/tmp/report.pdf', 100, 10)).not.toBe(
      createLibraryThumbnailCacheKey('/tmp/report.pdf', 100, 20),
    );
  });

  test('includes the renderer identity version in the cache key', () => {
    expect(createLibraryThumbnailCacheKey('/tmp/report.pdf', 100)).toContain(
      `${LibraryThumbnailClientCacheVersion}\0`,
    );
  });

  test('rejects a completed request after the card identity changes', () => {
    const imageKey = createLibraryThumbnailCacheKey('/tmp/image.png', 100);
    const markdownKey = createLibraryThumbnailCacheKey('/tmp/README.md', 100);

    expect(shouldApplyLibraryThumbnailResult(imageKey, markdownKey, true)).toBe(false);
    expect(shouldApplyLibraryThumbnailResult(imageKey, imageKey, false)).toBe(false);
    expect(shouldApplyLibraryThumbnailResult(imageKey, imageKey, true)).toBe(true);
  });

  test('keeps the loaded thumbnail', () => {
    const cacheKey = createLibraryThumbnailCacheKey('/tmp/report.pdf', 100);
    const dataUrl = 'data:image/png;base64,dGVzdA==';

    cacheLibraryThumbnail(cacheKey, dataUrl);

    expect(getCachedLibraryThumbnail(cacheKey)).toBe(dataUrl);
  });
});

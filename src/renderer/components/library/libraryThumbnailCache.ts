const MAX_CACHE_ENTRIES = 128;
export const LibraryThumbnailClientCacheVersion = 'viewport-scheduler-v4';

const thumbnailCache = new Map<string, string>();

export const createLibraryThumbnailCacheKey = (
  filePath: string,
  fileMtimeMs?: number,
  fileSizeBytes?: number,
): string => [
  LibraryThumbnailClientCacheVersion,
  filePath,
  fileMtimeMs ?? 'unknown-mtime',
  fileSizeBytes ?? 'unknown-size',
].join('\0');

export const shouldApplyLibraryThumbnailResult = (
  requestedCacheKey: string,
  currentCacheKey: string | undefined,
  isActive: boolean,
): boolean => isActive && requestedCacheKey === currentCacheKey;

export const getCachedLibraryThumbnail = (cacheKey: string): string | undefined => {
  const value = thumbnailCache.get(cacheKey);
  if (!value) return undefined;
  thumbnailCache.delete(cacheKey);
  thumbnailCache.set(cacheKey, value);
  return value;
};

export const cacheLibraryThumbnail = (cacheKey: string, dataUrl: string): void => {
  thumbnailCache.delete(cacheKey);
  thumbnailCache.set(cacheKey, dataUrl);
  while (thumbnailCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = thumbnailCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    thumbnailCache.delete(oldestKey);
  }
};

export const clearLibraryThumbnailCache = (): void => {
  thumbnailCache.clear();
};

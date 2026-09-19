"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibraryThumbnailService = exports.getLibraryThumbnailCacheVersion = exports.LibraryThumbnailCacheVersion = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const thumbnail_1 = require("../../shared/library/thumbnail");
exports.LibraryThumbnailCacheVersion = {
    RasterCanvas: 'raster-canvas-v1',
    DirectCanvas: 'direct-canvas-v1',
    PresentedFrame: 'presentation-stamp-v3',
    PptxFirstSlidePresentedFrame: 'pptx-source-aware-presentation-stamp-v5',
};
const DEFAULT_THUMBNAIL_SIZE = { width: 480, height: 270 };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LIBRARY_THUMBNAIL_PRIORITY_SET = new Set(Object.values(thumbnail_1.LibraryThumbnailRequestPriority));
const isValidPngBuffer = (buffer) => (buffer.length > PNG_SIGNATURE.length
    && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE));
const getLibraryThumbnailCacheVersion = (filePath) => {
    const extension = path_1.default.extname(filePath).toLowerCase();
    if (extension === '.pptx') {
        return exports.LibraryThumbnailCacheVersion.PptxFirstSlidePresentedFrame;
    }
    if ((0, thumbnail_1.isLibraryRasterThumbnailExtension)(extension)) {
        return exports.LibraryThumbnailCacheVersion.RasterCanvas;
    }
    if ((0, thumbnail_1.isLibraryDirectPngThumbnailExtension)(extension)) {
        return exports.LibraryThumbnailCacheVersion.DirectCanvas;
    }
    return exports.LibraryThumbnailCacheVersion.PresentedFrame;
};
exports.getLibraryThumbnailCacheVersion = getLibraryThumbnailCacheVersion;
class LibraryThumbnailService {
    createThumbnail;
    getCacheDirectory;
    statFile;
    maxConcurrency;
    maxMemoryEntries;
    maxDiskEntries;
    size;
    memoryCache = new Map();
    inFlight = new Map();
    requestsById = new Map();
    preparingRequestIds = new Set();
    canceledPreparingRequestIds = new Set();
    pendingRequests = [];
    activeCount = 0;
    nextSequence = 0;
    nextTemporaryFileId = 0;
    diskPrunePromise;
    constructor(options) {
        this.createThumbnail = options.createThumbnail;
        this.getCacheDirectory = options.getCacheDirectory;
        this.statFile = options.statFile ?? (filePath => fs_1.default.promises.stat(filePath));
        this.maxConcurrency = Math.max(1, Math.floor(options.maxConcurrency ?? 3));
        this.maxMemoryEntries = Math.max(1, Math.floor(options.maxMemoryEntries ?? 128));
        this.maxDiskEntries = Math.max(1, Math.floor(options.maxDiskEntries ?? 256));
        this.size = options.size ?? DEFAULT_THUMBNAIL_SIZE;
    }
    async generate(filePath, options = {}) {
        if (!filePath.trim())
            throw new Error('Missing file path');
        const resolvedPath = path_1.default.resolve(filePath.trim());
        if (options.requestId)
            this.preparingRequestIds.add(options.requestId);
        let stat;
        try {
            try {
                stat = await this.statFile(resolvedPath);
            }
            catch (error) {
                throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.SourceReadFailed, error instanceof Error ? error.message : 'Thumbnail source could not be read');
            }
            if (options.requestId && this.canceledPreparingRequestIds.delete(options.requestId)) {
                throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.RequestCanceled, 'Thumbnail request was canceled');
            }
        }
        finally {
            if (options.requestId) {
                this.preparingRequestIds.delete(options.requestId);
                this.canceledPreparingRequestIds.delete(options.requestId);
            }
        }
        if (!stat.isFile()) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.SourceReadFailed, 'Thumbnail source is not a file');
        }
        const cacheKey = [
            (0, exports.getLibraryThumbnailCacheVersion)(resolvedPath),
            resolvedPath,
            stat.mtimeMs,
            stat.size,
        ].join('\0');
        const memoryValue = this.getMemoryValue(cacheKey);
        if (memoryValue)
            return memoryValue;
        const priority = options.priority !== undefined
            && LIBRARY_THUMBNAIL_PRIORITY_SET.has(options.priority)
            ? options.priority
            : thumbnail_1.LibraryThumbnailRequestPriority.Background;
        const existingRequest = this.inFlight.get(cacheKey);
        if (existingRequest) {
            if (options.requestId) {
                existingRequest.requestIds.add(options.requestId);
                this.requestsById.set(options.requestId, existingRequest);
            }
            else {
                existingRequest.hasAnonymousConsumer = true;
            }
            if (!existingRequest.started && priority < existingRequest.priority) {
                existingRequest.priority = priority;
                this.pumpQueue();
            }
            return existingRequest.promise;
        }
        let resolveRequest = () => undefined;
        let rejectRequest = () => undefined;
        const promise = new Promise((resolve, reject) => {
            resolveRequest = resolve;
            rejectRequest = reject;
        });
        const request = {
            cacheKey,
            requestIds: new Set(options.requestId ? [options.requestId] : []),
            hasAnonymousConsumer: !options.requestId,
            priority,
            sequence: this.nextSequence++,
            started: false,
            run: async () => {
                const diskValue = await this.readDiskValue(cacheKey);
                if (diskValue)
                    return diskValue;
                const buffer = await this.createThumbnail(resolvedPath, this.size);
                if (!isValidPngBuffer(buffer)) {
                    throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.DirectPngInvalid, 'Thumbnail output is not a valid PNG');
                }
                await this.writeDiskValue(cacheKey, buffer);
                return `data:image/png;base64,${buffer.toString('base64')}`;
            },
            resolve: resolveRequest,
            reject: rejectRequest,
            promise,
        };
        this.inFlight.set(cacheKey, request);
        if (options.requestId)
            this.requestsById.set(options.requestId, request);
        this.pendingRequests.push(request);
        this.pumpQueue();
        return promise;
    }
    cancel(requestId) {
        const request = this.requestsById.get(requestId);
        if (!request) {
            if (!this.preparingRequestIds.has(requestId))
                return false;
            this.canceledPreparingRequestIds.add(requestId);
            return true;
        }
        this.requestsById.delete(requestId);
        request.requestIds.delete(requestId);
        if (request.started || request.hasAnonymousConsumer || request.requestIds.size > 0) {
            return false;
        }
        const pendingIndex = this.pendingRequests.indexOf(request);
        if (pendingIndex >= 0)
            this.pendingRequests.splice(pendingIndex, 1);
        this.inFlight.delete(request.cacheKey);
        request.reject(new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.RequestCanceled, 'Thumbnail request was canceled'));
        return true;
    }
    getMemoryValue(cacheKey) {
        const value = this.memoryCache.get(cacheKey);
        if (!value)
            return undefined;
        this.memoryCache.delete(cacheKey);
        this.memoryCache.set(cacheKey, value);
        return value;
    }
    setMemoryValue(cacheKey, value) {
        this.memoryCache.delete(cacheKey);
        this.memoryCache.set(cacheKey, value);
        while (this.memoryCache.size > this.maxMemoryEntries) {
            const oldestKey = this.memoryCache.keys().next().value;
            if (!oldestKey)
                break;
            this.memoryCache.delete(oldestKey);
        }
    }
    getDiskPath(cacheKey) {
        if (!this.getCacheDirectory)
            return undefined;
        const digest = crypto_1.default.createHash('sha256').update(cacheKey).digest('hex');
        return path_1.default.join(this.getCacheDirectory(), `${digest}.png`);
    }
    async readDiskValue(cacheKey) {
        const cachePath = this.getDiskPath(cacheKey);
        if (!cachePath)
            return undefined;
        try {
            const buffer = await fs_1.default.promises.readFile(cachePath);
            if (!isValidPngBuffer(buffer)) {
                await fs_1.default.promises.unlink(cachePath).catch(() => {
                    // A concurrently removed invalid entry needs no further handling.
                });
                return undefined;
            }
            void fs_1.default.promises.utimes(cachePath, new Date(), new Date()).catch(() => {
                // Cache recency is best-effort.
            });
            return `data:image/png;base64,${buffer.toString('base64')}`;
        }
        catch {
            return undefined;
        }
    }
    async writeDiskValue(cacheKey, buffer) {
        const cachePath = this.getDiskPath(cacheKey);
        if (!cachePath)
            return;
        const temporaryPath = `${cachePath}.${process.pid}.${this.nextTemporaryFileId++}.tmp`;
        try {
            await fs_1.default.promises.mkdir(path_1.default.dirname(cachePath), { recursive: true });
            await fs_1.default.promises.writeFile(temporaryPath, buffer, { flag: 'wx' });
            await fs_1.default.promises.rename(temporaryPath, cachePath);
            this.scheduleDiskPrune();
        }
        catch {
            void fs_1.default.promises.unlink(temporaryPath).catch(() => {
                // Temporary files are best-effort cache state.
            });
            // A cache write failure must not prevent the thumbnail from being displayed.
        }
    }
    scheduleDiskPrune() {
        if (this.diskPrunePromise || !this.getCacheDirectory)
            return;
        this.diskPrunePromise = this.pruneDiskCache()
            .catch(() => {
            // Cache cleanup is best-effort.
        })
            .finally(() => {
            this.diskPrunePromise = undefined;
        });
    }
    async pruneDiskCache() {
        const cacheDirectory = this.getCacheDirectory?.();
        if (!cacheDirectory)
            return;
        const entries = await fs_1.default.promises.readdir(cacheDirectory, { withFileTypes: true });
        const cacheFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('.png'));
        if (cacheFiles.length <= this.maxDiskEntries)
            return;
        const filesWithStats = await Promise.all(cacheFiles.map(async (entry) => {
            const filePath = path_1.default.join(cacheDirectory, entry.name);
            const stat = await fs_1.default.promises.stat(filePath);
            return { filePath, lastUsedAt: stat.mtimeMs };
        }));
        filesWithStats.sort((left, right) => left.lastUsedAt - right.lastUsedAt);
        const deleteCount = filesWithStats.length - this.maxDiskEntries;
        await Promise.all(filesWithStats.slice(0, deleteCount).map(({ filePath }) => (fs_1.default.promises.unlink(filePath).catch(() => {
            // A concurrently removed cache entry needs no further handling.
        }))));
    }
    pumpQueue() {
        while (this.activeCount < this.maxConcurrency && this.pendingRequests.length > 0) {
            this.pendingRequests.sort((left, right) => (left.priority - right.priority || left.sequence - right.sequence));
            const request = this.pendingRequests.shift();
            if (!request)
                return;
            request.started = true;
            this.activeCount += 1;
            void request.run().then(dataUrl => {
                this.setMemoryValue(request.cacheKey, dataUrl);
                request.resolve(dataUrl);
            }).catch(error => {
                request.reject(error);
            }).finally(() => {
                this.activeCount -= 1;
                this.inFlight.delete(request.cacheKey);
                for (const requestId of request.requestIds)
                    this.requestsById.delete(requestId);
                this.pumpQueue();
            });
        }
    }
}
exports.LibraryThumbnailService = LibraryThumbnailService;
//# sourceMappingURL=libraryThumbnailService.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibraryIndexService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/htmlShare/constants");
const constants_2 = require("../../shared/library/constants");
const htmlShareSourceKey_1 = require("../libs/htmlShare/htmlShareSourceKey");
const LibraryIndexMetadataKey = {
    BackfillCursor: 'library.index.backfill.v1.cursor',
    BackfillCompletedAt: 'library.index.backfill.v1.completedAt',
    PolicyVersion: 'library.index.policyVersion',
    LastReconcileAt: 'library.index.lastReconcileAt',
};
const RETRY_DELAYS_MS = [250, 1_000, 3_000, 10_000, 15_000];
const RECONCILE_CONCURRENCY = 8;
const getShareSourceType = (artifactType) => {
    switch (artifactType) {
        case constants_2.LibraryArtifactType.Html:
            return constants_1.HtmlShareSourceType.HtmlFile;
        case constants_2.LibraryArtifactType.Svg:
            return constants_1.HtmlShareSourceType.SvgFile;
        case constants_2.LibraryArtifactType.Image:
            return constants_1.HtmlShareSourceType.ImageFile;
        case constants_2.LibraryArtifactType.Document:
            return constants_1.HtmlShareSourceType.DocumentFile;
        case constants_2.LibraryArtifactType.Markdown:
            return constants_1.HtmlShareSourceType.MarkdownFile;
        case constants_2.LibraryArtifactType.Mermaid:
            return constants_1.HtmlShareSourceType.MermaidFile;
        default:
            return null;
    }
};
const getClientSourceKey = (artifactType, filePath) => {
    const sourceType = getShareSourceType(artifactType);
    if (!sourceType)
        return undefined;
    return sourceType === constants_1.HtmlShareSourceType.HtmlFile
        ? (0, htmlShareSourceKey_1.buildHtmlShareClientSourceKey)(filePath)
        : (0, htmlShareSourceKey_1.buildArtifactFileClientSourceKey)(sourceType, filePath);
};
const isMissingError = (error) => (error instanceof Error && 'code' in error && error.code === 'ENOENT');
const isPermissionError = (error) => (error instanceof Error
    && 'code' in error
    && ['EACCES', 'EPERM'].includes(error.code ?? ''));
const getSanitizedFsError = (message, error) => {
    const code = error instanceof Error && 'code' in error
        ? error.code
        : undefined;
    return new Error(`${message}${code ? ` (${code})` : ''}`);
};
class LibraryIndexService {
    store;
    userDataPath;
    onChanged;
    getMetadata;
    setMetadata;
    watchers = new Map();
    itemPaths = new Map();
    watchTimers = new Map();
    retryTimers = new Set();
    reconcileTimer = null;
    phase = constants_2.LibraryIndexPhase.Idle;
    stopped = false;
    watcherDegraded = false;
    constructor(options) {
        this.store = options.store;
        this.userDataPath = path_1.default.resolve(options.userDataPath);
        this.onChanged = options.onChanged;
        this.getMetadata = options.getMetadata;
        this.setMetadata = options.setMetadata;
    }
    start() {
        this.stopped = false;
        this.rebuildWatchers();
        this.scheduleReconcile(2_000);
    }
    stop() {
        this.stopped = true;
        for (const timer of this.retryTimers)
            clearTimeout(timer);
        this.retryTimers.clear();
        if (this.reconcileTimer)
            clearTimeout(this.reconcileTimer);
        this.reconcileTimer = null;
        for (const timer of this.watchTimers.values())
            clearTimeout(timer);
        this.watchTimers.clear();
        for (const entry of this.watchers.values())
            entry.watcher.close();
        this.watchers.clear();
        this.itemPaths.clear();
    }
    async recordCandidates(candidates) {
        let recorded = 0;
        let ignored = 0;
        const changedIds = [];
        for (const candidate of candidates) {
            if (!this.store.sessionExists(candidate.sessionId)) {
                ignored += 1;
                continue;
            }
            try {
                const item = await this.indexCandidate(candidate);
                if (!item) {
                    ignored += 1;
                    if (this.store.sessionExists(candidate.sessionId)) {
                        this.scheduleCandidateRetry(candidate, 0);
                    }
                    continue;
                }
                recorded += 1;
                changedIds.push(item.itemId);
            }
            catch (error) {
                if (isMissingError(error)) {
                    ignored += 1;
                    this.scheduleCandidateRetry(candidate, 0);
                    continue;
                }
                ignored += 1;
                console.warn('[Library] Failed to index an artifact candidate.', getSanitizedFsError('Artifact candidate indexing failed', error));
            }
        }
        if (changedIds.length > 0) {
            this.onChanged({ reason: 'recorded', itemIds: [...new Set(changedIds)] });
        }
        return { recorded, ignored };
    }
    async addLocalFiles(filePaths) {
        const items = [];
        const ignoredPaths = [];
        for (const filePath of filePaths) {
            try {
                const indexed = await this.resolveIndexedFile(filePath, constants_2.LibraryOrigin.Manual);
                if (!indexed) {
                    ignoredPaths.push(filePath);
                    continue;
                }
                const storedItem = this.store.upsertFile(indexed);
                this.addWatch(storedItem.itemId, storedItem.filePath);
                const visibleItem = this.store.getVisibleItem(storedItem.itemId);
                if (visibleItem)
                    items.push(visibleItem);
            }
            catch {
                ignoredPaths.push(filePath);
            }
        }
        if (items.length > 0) {
            this.onChanged({ reason: 'recorded', itemIds: items.map(item => item.itemId) });
        }
        return { items, ignoredPaths };
    }
    async repair() {
        await this.reconcile({ notify: true });
        this.store.cleanupExpiredMissing(constants_2.LibraryLimits.MissingRetentionMs);
        this.store.cleanupOrphanRelations();
        this.rebuildWatchers();
        return this.getStatus();
    }
    getStatus() {
        const counts = this.store.countByAvailability();
        const backfill = this.getBackfillState();
        return {
            phase: this.phase,
            trackedCount: counts.tracked,
            availableCount: counts.available,
            missingCount: counts.missing,
            watchedDirectoryCount: this.watchers.size,
            watcherDegraded: this.watcherDegraded,
            ...(this.getMetadata(LibraryIndexMetadataKey.LastReconcileAt)
                ? { lastReconcileAt: this.getMetadata(LibraryIndexMetadataKey.LastReconcileAt) }
                : {}),
            ...(backfill.completedAt ? { backfillCompletedAt: backfill.completedAt } : {}),
        };
    }
    getBackfillState() {
        const cursor = this.getMetadata(LibraryIndexMetadataKey.BackfillCursor);
        const completedAt = this.getMetadata(LibraryIndexMetadataKey.BackfillCompletedAt);
        return {
            policyVersion: this.getMetadata(LibraryIndexMetadataKey.PolicyVersion)
                ?? constants_2.LIBRARY_INDEX_POLICY_VERSION,
            ...(cursor ? { cursor } : {}),
            ...(completedAt && completedAt > 0 ? { completedAt } : {}),
        };
    }
    setBackfillState(state) {
        const previousPolicyVersion = this.getMetadata(LibraryIndexMetadataKey.PolicyVersion);
        if (previousPolicyVersion !== state.policyVersion) {
            this.setMetadata(LibraryIndexMetadataKey.BackfillCursor, '');
            this.setMetadata(LibraryIndexMetadataKey.BackfillCompletedAt, 0);
        }
        if (state.cursor !== undefined) {
            this.setMetadata(LibraryIndexMetadataKey.BackfillCursor, state.cursor);
        }
        if (state.completedAt !== undefined) {
            this.setMetadata(LibraryIndexMetadataKey.BackfillCompletedAt, state.completedAt);
        }
        this.setMetadata(LibraryIndexMetadataKey.PolicyVersion, state.policyVersion);
    }
    unwatchItem(itemId) {
        const filePath = this.itemPaths.get(itemId);
        if (!filePath)
            return;
        this.itemPaths.delete(itemId);
        const directory = path_1.default.dirname(filePath);
        const entry = this.watchers.get(directory);
        if (!entry)
            return;
        const baseName = path_1.default.basename(filePath);
        const itemIds = entry.itemsByBaseName.get(baseName);
        itemIds?.delete(itemId);
        if (itemIds?.size === 0)
            entry.itemsByBaseName.delete(baseName);
        if (entry.itemsByBaseName.size === 0) {
            entry.watcher.close();
            this.watchers.delete(directory);
        }
    }
    refreshTrackingForItem(itemId) {
        const item = this.store.getItem(itemId);
        if (item)
            this.addWatch(item.itemId, item.filePath);
    }
    notifyChange(payload) {
        this.onChanged(payload);
    }
    async indexCandidate(candidate) {
        const cwd = this.store.getSessionCwd(candidate.sessionId);
        if (!cwd)
            return null;
        const resolvedPath = path_1.default.isAbsolute(candidate.filePath)
            ? candidate.filePath
            : path_1.default.resolve(cwd, candidate.filePath);
        const indexed = await this.resolveIndexedFile(resolvedPath, candidate.origin ?? constants_2.LibraryOrigin.Conversation);
        if (!indexed)
            return null;
        const item = this.store.upsertFile(indexed, candidate);
        if (!item)
            return null;
        this.addWatch(item.itemId, item.filePath);
        return item;
    }
    async resolveIndexedFile(rawFilePath, origin) {
        const absolutePath = path_1.default.resolve(rawFilePath);
        const realPath = await fs_1.default.promises.realpath(absolutePath);
        if (this.isExcludedPath(realPath))
            return null;
        const stats = await fs_1.default.promises.stat(realPath);
        if (!stats.isFile())
            return null;
        const extension = path_1.default.extname(realPath).toLowerCase();
        const artifactType = (0, constants_2.getLibraryArtifactTypeForExtension)(extension);
        if (!artifactType)
            return null;
        const normalizedPath = path_1.default.normalize(realPath);
        const pathKey = process.platform === 'win32'
            ? normalizedPath.replace(/\\/g, '/').toLowerCase()
            : normalizedPath;
        const verifiedAt = Date.now();
        return {
            pathKey,
            filePath: normalizedPath,
            fileName: path_1.default.basename(normalizedPath),
            extension,
            artifactType,
            category: (0, constants_2.getLibraryCategoryForExtension)(extension),
            fileIdentity: `${stats.dev}:${stats.ino}:${Math.trunc(stats.birthtimeMs)}`,
            clientSourceKey: getClientSourceKey(artifactType, normalizedPath),
            sizeBytes: stats.size,
            fileMtimeMs: Math.trunc(stats.mtimeMs),
            availability: constants_2.LibraryAvailability.Available,
            origin,
            verifiedAt,
        };
    }
    isExcludedPath(filePath) {
        const normalized = path_1.default.normalize(filePath);
        const segments = normalized.split(path_1.default.sep);
        if (segments.includes('node_modules') || segments.includes('.cowork-temp'))
            return true;
        const libraryCachePath = path_1.default.join(this.userDataPath, 'library');
        return normalized === libraryCachePath || normalized.startsWith(`${libraryCachePath}${path_1.default.sep}`);
    }
    scheduleCandidateRetry(candidate, attempt) {
        if (this.stopped || attempt >= RETRY_DELAYS_MS.length)
            return;
        const timer = setTimeout(() => {
            this.retryTimers.delete(timer);
            if (this.stopped || !this.store.sessionExists(candidate.sessionId))
                return;
            void this.indexCandidate(candidate)
                .then(item => {
                if (item) {
                    this.onChanged({ reason: 'recorded', itemIds: [item.itemId] });
                }
                else {
                    this.scheduleCandidateRetry(candidate, attempt + 1);
                }
            })
                .catch(error => {
                if (isMissingError(error))
                    this.scheduleCandidateRetry(candidate, attempt + 1);
            });
        }, RETRY_DELAYS_MS[attempt]);
        this.retryTimers.add(timer);
    }
    rebuildWatchers() {
        for (const timer of this.watchTimers.values())
            clearTimeout(timer);
        this.watchTimers.clear();
        for (const entry of this.watchers.values())
            entry.watcher.close();
        this.watchers.clear();
        this.itemPaths.clear();
        this.watcherDegraded = false;
        for (const item of this.store.listTracked())
            this.addWatch(item.itemId, item.filePath);
    }
    addWatch(itemId, filePath) {
        if (this.stopped)
            return;
        const directory = path_1.default.dirname(filePath);
        const baseName = path_1.default.basename(filePath);
        let entry = this.watchers.get(directory);
        if (!entry) {
            if (this.watchers.size >= constants_2.LibraryLimits.WatchDirectoryLimit) {
                this.watcherDegraded = true;
                return;
            }
            try {
                const itemsByBaseName = new Map();
                const watcher = fs_1.default.watch(directory, (eventType, changedName) => {
                    const changedBaseName = changedName?.toString();
                    if (!changedBaseName) {
                        for (const ids of itemsByBaseName.values()) {
                            for (const id of ids)
                                this.scheduleWatchRefresh(id);
                        }
                        return;
                    }
                    if (eventType === 'rename') {
                        void this.tryRelocateWithinDirectory(directory, changedBaseName);
                    }
                    for (const id of itemsByBaseName.get(changedBaseName) ?? []) {
                        this.scheduleWatchRefresh(id);
                    }
                });
                watcher.on('error', error => {
                    console.warn('[Library] Directory watcher failed; stat reconciliation will be used.', getSanitizedFsError('Directory watcher failed', error));
                    watcher.close();
                    this.watchers.delete(directory);
                    this.watcherDegraded = true;
                });
                entry = { watcher, itemsByBaseName };
                this.watchers.set(directory, entry);
            }
            catch (error) {
                console.warn('[Library] Unable to watch an indexed artifact directory.', getSanitizedFsError('Directory watcher setup failed', error));
                this.watcherDegraded = true;
                return;
            }
        }
        const ids = entry.itemsByBaseName.get(baseName) ?? new Set();
        ids.add(itemId);
        entry.itemsByBaseName.set(baseName, ids);
        this.itemPaths.set(itemId, filePath);
    }
    scheduleWatchRefresh(itemId) {
        const existing = this.watchTimers.get(itemId);
        if (existing)
            clearTimeout(existing);
        const timer = setTimeout(() => {
            this.watchTimers.delete(itemId);
            void this.verifyTrackedItem(itemId, this.itemPaths.get(itemId))
                .then(changed => {
                if (changed)
                    this.onChanged({ reason: 'file_changed', itemIds: [itemId] });
            });
        }, constants_2.LibraryLimits.WatchDebounceMs);
        this.watchTimers.set(itemId, timer);
    }
    async verifyTrackedItem(itemId, filePath) {
        if (!filePath)
            return false;
        try {
            const stats = await fs_1.default.promises.stat(filePath);
            if (!stats.isFile()) {
                return this.store.markMissing(itemId);
            }
            return this.store.refreshFile(itemId, {
                sizeBytes: stats.size,
                fileMtimeMs: Math.trunc(stats.mtimeMs),
            });
        }
        catch (error) {
            if (isPermissionError(error))
                return this.store.markPermissionDenied(itemId);
            if (!isMissingError(error))
                return this.store.markMissing(itemId);
            await new Promise(resolve => setTimeout(resolve, constants_2.LibraryLimits.WatchDebounceMs));
            if (this.stopped)
                return false;
            try {
                const stats = await fs_1.default.promises.stat(filePath);
                if (!stats.isFile())
                    return this.store.markMissing(itemId);
                return this.store.refreshFile(itemId, {
                    sizeBytes: stats.size,
                    fileMtimeMs: Math.trunc(stats.mtimeMs),
                });
            }
            catch (confirmationError) {
                if (isPermissionError(confirmationError)) {
                    return this.store.markPermissionDenied(itemId);
                }
                return this.store.markMissing(itemId);
            }
        }
    }
    async tryRelocateWithinDirectory(directory, baseName) {
        const nextPath = path_1.default.join(directory, baseName);
        let indexed;
        try {
            indexed = await this.resolveIndexedFile(nextPath, constants_2.LibraryOrigin.Conversation);
        }
        catch {
            return;
        }
        if (!indexed?.fileIdentity)
            return;
        const candidates = this.store.findRelocationCandidates(indexed.fileIdentity)
            .filter(candidate => (path_1.default.dirname(candidate.filePath) === directory
            && path_1.default.normalize(candidate.filePath) !== path_1.default.normalize(indexed.filePath)));
        const missingCandidates = [];
        for (const candidate of candidates) {
            try {
                await fs_1.default.promises.stat(candidate.filePath);
            }
            catch (error) {
                if (isMissingError(error))
                    missingCandidates.push(candidate);
            }
        }
        if (missingCandidates.length !== 1)
            return;
        const candidate = missingCandidates[0];
        if (!this.store.relocateFile(candidate.itemId, indexed))
            return;
        this.unwatchItem(candidate.itemId);
        this.addWatch(candidate.itemId, indexed.filePath);
        this.onChanged({ reason: 'file_changed', itemIds: [candidate.itemId] });
    }
    scheduleReconcile(delayMs) {
        if (this.stopped)
            return;
        if (this.reconcileTimer)
            clearTimeout(this.reconcileTimer);
        this.reconcileTimer = setTimeout(() => {
            this.reconcileTimer = null;
            void this.reconcile({
                limit: constants_2.LibraryLimits.ReconcileBatchSize,
                notify: false,
                verifiedBefore: Date.now() - constants_2.LibraryLimits.RecentVerificationWindowMs,
            }).finally(() => this.scheduleReconcile(constants_2.LibraryLimits.ReconcileIntervalMs));
        }, delayMs);
    }
    async reconcile(options) {
        if (this.phase !== constants_2.LibraryIndexPhase.Idle || this.stopped)
            return;
        this.phase = options.notify ? constants_2.LibraryIndexPhase.Repair : constants_2.LibraryIndexPhase.Backfill;
        try {
            const items = this.store.listTracked(options.limit, options.verifiedBefore);
            let nextIndex = 0;
            const changedIds = [];
            const worker = async () => {
                while (nextIndex < items.length && !this.stopped) {
                    const item = items[nextIndex];
                    nextIndex += 1;
                    if (await this.verifyTrackedItem(item.itemId, item.filePath))
                        changedIds.push(item.itemId);
                }
            };
            await Promise.all(Array.from({ length: Math.min(RECONCILE_CONCURRENCY, items.length) }, () => worker()));
            const completedAt = Date.now();
            this.setMetadata(LibraryIndexMetadataKey.LastReconcileAt, completedAt);
            if (options.notify) {
                this.onChanged({ reason: 'repair', itemIds: changedIds });
            }
        }
        finally {
            this.phase = constants_2.LibraryIndexPhase.Idle;
        }
    }
}
exports.LibraryIndexService = LibraryIndexService;
//# sourceMappingURL=libraryIndexService.js.map
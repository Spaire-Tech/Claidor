"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLibraryIpcHandlers = exports.normalizeLibraryTargetItemIds = void 0;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const constants_1 = require("../../shared/library/constants");
const libraryCloudClient_1 = require("./libraryCloudClient");
const libraryLocalStore_1 = require("./libraryLocalStore");
const success = (data) => ({ success: true, data });
const failure = (code, error) => ({
    success: false,
    code,
    error,
});
const normalizeCloudOwnerScope = (value) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 500)
        return null;
    const digest = crypto_1.default.createHash('sha256').update(value.trim()).digest('hex');
    return `${constants_1.LibraryFavoriteScope.CloudPrefix}${digest}`;
};
const requireItemId = (value) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) {
        throw new Error('Invalid library item identifier.');
    }
    return value.trim();
};
const normalizeLibraryTargetItemIds = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid library item request.');
    }
    const input = value;
    if (!Array.isArray(input.itemIds)
        || input.itemIds.length < 1
        || input.itemIds.length > constants_1.LibraryLimits.MaxTargetItemIds) {
        throw new Error('Invalid library item identifiers.');
    }
    return [...new Set(input.itemIds.map(requireItemId))];
};
exports.normalizeLibraryTargetItemIds = normalizeLibraryTargetItemIds;
const normalizeLocalListOptions = (value) => {
    if (value === undefined || value === null)
        return {};
    if (typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid list options.');
    const input = value;
    if (input.category !== undefined && !(0, constants_1.isLibraryCategory)(input.category)) {
        throw new Error('Invalid library category.');
    }
    if (input.sort !== undefined && input.sort !== constants_1.LibrarySort.RecentlyUpdated) {
        throw new Error('Invalid library sort.');
    }
    const cursor = typeof input.cursor === 'string' && input.cursor.trim()
        ? input.cursor.trim()
        : undefined;
    if (cursor && !(0, libraryLocalStore_1.decodeLibraryLocalCursor)(cursor))
        throw new Error('Invalid library cursor.');
    return {
        ...(input.category ? { category: input.category } : {}),
        ...(typeof input.keyword === 'string'
            ? { keyword: input.keyword.slice(0, constants_1.LibraryLimits.MaxKeywordLength) }
            : {}),
        ...(cursor ? { cursor } : {}),
        ...(typeof input.pageSize === 'number' && Number.isInteger(input.pageSize)
            ? { pageSize: input.pageSize }
            : {}),
        ...(input.sort ? { sort: constants_1.LibrarySort.RecentlyUpdated } : {}),
        ...(typeof input.favoritesOnly === 'boolean'
            ? { favoritesOnly: input.favoritesOnly }
            : {}),
    };
};
const normalizeCloudListOptions = (value) => {
    if (value === undefined || value === null)
        return {};
    if (typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid cloud list options.');
    const input = value;
    if (input.kind !== undefined
        && !Object.values(constants_1.LibraryCloudKind).includes(input.kind)) {
        throw new Error('Invalid cloud library kind.');
    }
    if (input.category !== undefined && !(0, constants_1.isLibraryCategory)(input.category)) {
        throw new Error('Invalid library category.');
    }
    if (input.sort !== undefined && input.sort !== constants_1.LibrarySort.RecentlyUpdated) {
        throw new Error('Invalid library sort.');
    }
    if (input.availability !== undefined
        && !(0, constants_1.isLibraryCloudAvailabilityFilter)(input.availability)) {
        throw new Error('Invalid cloud availability filter.');
    }
    if (input.sharedStatus !== undefined
        && !(0, constants_1.isLibrarySharedStatusFilter)(input.sharedStatus)) {
        throw new Error('Invalid shared file status.');
    }
    return {
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.category ? { category: input.category } : {}),
        ...(typeof input.keyword === 'string'
            ? { keyword: input.keyword.slice(0, constants_1.LibraryLimits.MaxKeywordLength) }
            : {}),
        ...(typeof input.cursor === 'string' && input.cursor.trim()
            ? { cursor: input.cursor.trim().slice(0, 2_000) }
            : {}),
        ...(typeof input.pageSize === 'number' && Number.isInteger(input.pageSize)
            ? { pageSize: input.pageSize }
            : {}),
        ...(input.sort ? { sort: constants_1.LibrarySort.RecentlyUpdated } : {}),
        ...(typeof input.favoriteOwnerScope === 'string'
            ? { favoriteOwnerScope: input.favoriteOwnerScope }
            : {}),
        ...(typeof input.favoritesOnly === 'boolean'
            ? { favoritesOnly: input.favoritesOnly }
            : {}),
        ...(input.availability
            ? { availability: input.availability }
            : {}),
        ...(input.sharedStatus
            ? { sharedStatus: input.sharedStatus }
            : {}),
    };
};
const normalizeCandidates = (value) => {
    if (!Array.isArray(value) || value.length > constants_1.LibraryLimits.MaxCandidateBatchSize) {
        throw new Error('Invalid artifact candidate batch.');
    }
    let totalStringLength = 0;
    return value.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error('Invalid artifact candidate.');
        }
        const input = item;
        const sessionId = requireItemId(input.sessionId);
        const filePath = typeof input.filePath === 'string' ? input.filePath.trim() : '';
        if (!filePath || filePath.length > constants_1.LibraryLimits.MaxCandidateStringLength) {
            throw new Error('Invalid artifact candidate path.');
        }
        if (!(0, constants_1.isLibraryArtifactType)(input.detectedType)) {
            throw new Error('Invalid artifact candidate type.');
        }
        if (!(0, constants_1.isLibraryRelationKind)(input.relationKind)) {
            throw new Error('Invalid artifact candidate relation.');
        }
        if (!Number.isSafeInteger(input.relatedAt) || input.relatedAt <= 0) {
            throw new Error('Invalid artifact candidate timestamp.');
        }
        const messageId = typeof input.messageId === 'string'
            ? input.messageId.trim().slice(0, 200)
            : undefined;
        const sessionArtifactId = typeof input.sessionArtifactId === 'string'
            ? input.sessionArtifactId.trim().slice(0, 200)
            : undefined;
        const allowedOrigins = [
            constants_1.LibraryOrigin.Conversation,
            constants_1.LibraryOrigin.Backfill,
            constants_1.LibraryOrigin.Share,
        ];
        const origin = allowedOrigins.includes(input.origin)
            ? input.origin
            : constants_1.LibraryOrigin.Conversation;
        totalStringLength += sessionId.length + filePath.length
            + (messageId?.length ?? 0) + (sessionArtifactId?.length ?? 0);
        if (totalStringLength > constants_1.LibraryLimits.MaxCandidateBatchStringLength) {
            throw new Error('Artifact candidate batch is too large.');
        }
        return {
            sessionId,
            filePath,
            detectedType: input.detectedType,
            relationKind: input.relationKind,
            relatedAt: input.relatedAt,
            origin,
            ...(messageId ? { messageId } : {}),
            ...(sessionArtifactId ? { sessionArtifactId } : {}),
        };
    });
};
const registerLibraryIpcHandlers = ({ localStore, indexService, getServerApiBaseUrl, fetchWithAuth, }) => {
    electron_1.ipcMain.handle(constants_1.LibraryIpc.ListLocal, (_event, input) => {
        try {
            return success(localStore.list(normalizeLocalListOptions(input)));
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid local library request.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.ListCloud, async (_event, input) => {
        try {
            const options = normalizeCloudListOptions(input);
            const ownerScope = normalizeCloudOwnerScope(options.favoriteOwnerScope);
            if (!ownerScope) {
                return failure(constants_1.LibraryErrorCode.NotAuthenticated, 'Sign in to view cloud library items.');
            }
            return await (0, libraryCloudClient_1.listLibraryCloudItems)(getServerApiBaseUrl(), fetchWithAuth, localStore, ownerScope, options);
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid cloud library request.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.GetLocalItems, (_event, input) => {
        try {
            return success(localStore.getVisibleItems((0, exports.normalizeLibraryTargetItemIds)(input)));
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid library item request.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.GetLocalDetail, (_event, itemId) => {
        try {
            const detail = localStore.getDetail(requireItemId(itemId));
            return detail
                ? success(detail)
                : failure(constants_1.LibraryErrorCode.NotFound, 'Library item was not found.');
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid library item.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.RecordCandidates, async (_event, input) => {
        try {
            return success(await indexService.recordCandidates(normalizeCandidates(input)));
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid artifact candidate batch.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.AddLocalFiles, async (_event, input) => {
        try {
            if (!Array.isArray(input) || input.length > constants_1.LibraryLimits.MaxCandidateBatchSize) {
                throw new Error('Invalid local file selection.');
            }
            const paths = input.map(value => {
                if (typeof value !== 'string'
                    || !value.trim()
                    || value.length > constants_1.LibraryLimits.MaxCandidateStringLength) {
                    throw new Error('Invalid local file path.');
                }
                return value.trim();
            });
            return success(await indexService.addLocalFiles(paths));
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid local file selection.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.SetFavorite, (_event, value) => {
        try {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error('Invalid favorite request.');
            }
            const input = value;
            if (!(0, constants_1.isLibraryItemKind)(input.itemKind) || typeof input.favorite !== 'boolean') {
                throw new Error('Invalid favorite request.');
            }
            const itemId = requireItemId(input.itemId);
            const ownerScope = input.itemKind === constants_1.LibraryItemKind.LocalArtifact
                ? constants_1.LibraryFavoriteScope.LocalDevice
                : normalizeCloudOwnerScope(input.ownerScope);
            if (!ownerScope)
                throw new Error('Cloud favorite requires an account scope.');
            if (input.itemKind === constants_1.LibraryItemKind.LocalArtifact && !localStore.getItem(itemId)) {
                return failure(constants_1.LibraryErrorCode.NotFound, 'Library item was not found.');
            }
            localStore.setFavorite({
                ownerScope,
                itemKind: input.itemKind,
                itemId,
                favorite: input.favorite,
            });
            indexService.notifyChange({ reason: constants_1.LibraryChangeReason.Favorite, itemIds: [itemId] });
            return success({ favorite: input.favorite });
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid favorite request.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.OpenLocal, async (_event, value) => {
        try {
            const filePath = localStore.resolvePath(requireItemId(value));
            if (!filePath)
                return failure(constants_1.LibraryErrorCode.NotFound, 'Library item was not found.');
            const error = await electron_1.shell.openPath(filePath);
            return error ? failure(constants_1.LibraryErrorCode.NotAvailable, error) : success(null);
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid library item.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.RevealLocal, (_event, value) => {
        try {
            const filePath = localStore.resolvePath(requireItemId(value));
            if (!filePath)
                return failure(constants_1.LibraryErrorCode.NotFound, 'Library item was not found.');
            electron_1.shell.showItemInFolder(filePath);
            return success(null);
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid library item.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.RepairIndex, async () => {
        try {
            return success(await indexService.repair());
        }
        catch (error) {
            console.error('[Library] Index repair failed.', error);
            return failure(constants_1.LibraryErrorCode.Internal, 'Library index repair failed.');
        }
    });
    electron_1.ipcMain.handle(constants_1.LibraryIpc.GetIndexStatus, () => success(indexService.getStatus()));
    electron_1.ipcMain.handle(constants_1.LibraryIpc.GetBackfillState, () => success(indexService.getBackfillState()));
    electron_1.ipcMain.handle(constants_1.LibraryIpc.SetBackfillState, (_event, value) => {
        try {
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                throw new Error('Invalid backfill state.');
            }
            const input = value;
            if (!Number.isSafeInteger(input.policyVersion) || (input.policyVersion ?? 0) < 1) {
                throw new Error('Invalid backfill policy version.');
            }
            const state = {
                policyVersion: input.policyVersion,
                ...(typeof input.cursor === 'string' && input.cursor.length <= 500
                    ? { cursor: input.cursor }
                    : {}),
                ...(Number.isSafeInteger(input.completedAt) && (input.completedAt ?? 0) > 0
                    ? { completedAt: input.completedAt }
                    : {}),
            };
            indexService.setBackfillState(state);
            return success(state);
        }
        catch (error) {
            return failure(constants_1.LibraryErrorCode.InvalidInput, error instanceof Error ? error.message : 'Invalid backfill state.');
        }
    });
};
exports.registerLibraryIpcHandlers = registerLibraryIpcHandlers;
//# sourceMappingURL=libraryIpc.js.map
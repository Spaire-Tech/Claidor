"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLibraryCloudItems = void 0;
const constants_1 = require("../../shared/htmlShare/constants");
const cloudAvailability_1 = require("../../shared/library/cloudAvailability");
const constants_2 = require("../../shared/library/constants");
const constants_3 = require("../../shared/publishing/constants");
const constants_4 = require("../../shared/site/constants");
const readString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const readNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const readBoolean = (value) => (typeof value === 'boolean' ? value : undefined);
const readTimestamp = (value, fallback) => {
    const numeric = readNumber(value);
    if (numeric !== undefined)
        return numeric;
    const text = readString(value);
    if (!text)
        return fallback;
    const parsed = new Date(text).getTime();
    return Number.isFinite(parsed) ? parsed : fallback;
};
const readOptionalTimestamp = (value) => {
    const numeric = readNumber(value);
    if (numeric !== undefined)
        return numeric;
    const text = readString(value);
    if (!text)
        return undefined;
    const parsed = new Date(text).getTime();
    return Number.isFinite(parsed) ? parsed : undefined;
};
const readNullableTimestamp = (value) => (value === null ? null : readOptionalTimestamp(value));
const normalizeCloudItem = (input, favorites, localStore) => {
    const itemId = readString(input.itemId);
    const title = readString(input.title);
    const url = readString(input.url);
    const sortTime = readNumber(input.sortTime);
    if (!itemId || !title || !url || sortTime === undefined || !(0, constants_2.isLibraryCategory)(input.category)) {
        return null;
    }
    if (input.category === constants_2.LibraryCategory.All)
        return null;
    const sessionId = readString(input.sessionId);
    const clientSourceKey = readString(input.clientSourceKey);
    const latestSession = localStore.resolveCloudSession(sessionId, clientSourceKey);
    const createdAt = readTimestamp(input.createdAt, sortTime);
    const accessExpiresAt = readNullableTimestamp(input.accessExpiresAt);
    const effectiveAvailable = readBoolean(input.effectiveAvailable);
    const effectiveExpiresAt = readNullableTimestamp(input.effectiveExpiresAt);
    const effectiveUnavailableReason = readString(input.effectiveUnavailableReason);
    const normalizedEffectiveUnavailableReason = Object.values(constants_2.LibraryCloudUnavailableReason).includes(effectiveUnavailableReason)
        ? effectiveUnavailableReason
        : undefined;
    const subscriptionRecoveryMode = (0, constants_3.normalizePublishingSubscriptionRecoveryMode)(input.subscriptionRecoveryMode);
    const effectiveAccessFields = {
        ...(effectiveAvailable === undefined ? {} : { effectiveAvailable }),
        ...(effectiveExpiresAt === undefined ? {} : { effectiveExpiresAt }),
        ...(normalizedEffectiveUnavailableReason === undefined
            ? {}
            : { effectiveUnavailableReason: normalizedEffectiveUnavailableReason }),
    };
    if (input.itemKind === constants_2.LibraryItemKind.SharedFile) {
        const sourceType = readString(input.sourceType);
        const accessMode = readString(input.accessMode);
        const status = readString(input.status);
        if (!sourceType
            || !Object.values(constants_1.HtmlShareSourceType).includes(sourceType)
            || !accessMode
            || !Object.values(constants_1.HtmlShareAccessMode).includes(accessMode)
            || !status
            || !Object.values(constants_1.HtmlShareStatus).includes(status)) {
            return null;
        }
        const item = {
            itemKind: constants_2.LibraryItemKind.SharedFile,
            itemId,
            shareId: itemId,
            title,
            url,
            category: input.category,
            sortTime,
            createdAt,
            isFavorite: favorites.has(`${constants_2.LibraryItemKind.SharedFile}:${itemId}`),
            sourceType: sourceType,
            accessMode: accessMode,
            status: status,
            ...(latestSession ? { latestSession } : {}),
            ...(readString(input.moderationStatus)
                ? { moderationStatus: readString(input.moderationStatus) }
                : {}),
            ...(Object.values(constants_1.HtmlShareDisabledSource).includes(readString(input.disabledSource))
                ? { disabledSource: readString(input.disabledSource) }
                : {}),
            ...(readString(input.entryFile) ? { entryFile: readString(input.entryFile) } : {}),
            ...(readNumber(input.totalFiles) === undefined
                ? {}
                : { totalFiles: readNumber(input.totalFiles) }),
            ...(readNumber(input.totalBytes) === undefined
                ? {}
                : { totalBytes: readNumber(input.totalBytes) }),
            ...(clientSourceKey ? { clientSourceKey } : {}),
            ...(readString(input.artifactId) ? { artifactId: readString(input.artifactId) } : {}),
            ...(readString(input.updatedAt) ? { updatedAt: readString(input.updatedAt) } : {}),
            ...(readString(input.contentUpdatedAt)
                ? { contentUpdatedAt: readString(input.contentUpdatedAt) }
                : {}),
            ...(accessExpiresAt === undefined ? {} : { accessExpiresAt }),
            ...(subscriptionRecoveryMode === undefined ? {} : { subscriptionRecoveryMode }),
            ...effectiveAccessFields,
        };
        return item;
    }
    if (input.itemKind === constants_2.LibraryItemKind.DeployedSite) {
        const siteKind = readString(input.siteKind);
        const siteStatus = readString(input.siteStatus);
        const shareStatus = readString(input.shareStatus);
        const accessMode = readString(input.accessMode);
        if (!siteKind
            || !Object.values(constants_4.SiteKind).includes(siteKind)
            || !siteStatus
            || !Object.values(constants_4.SiteStatus).includes(siteStatus)
            || !shareStatus
            || !Object.values(constants_1.HtmlShareStatus).includes(shareStatus)
            || !accessMode
            || !Object.values(constants_1.HtmlShareAccessMode).includes(accessMode)) {
            return null;
        }
        const item = {
            itemKind: constants_2.LibraryItemKind.DeployedSite,
            itemId,
            shareId: itemId,
            title,
            url,
            category: constants_2.LibraryCategory.Site,
            sortTime,
            createdAt,
            isFavorite: favorites.has(`${constants_2.LibraryItemKind.DeployedSite}:${itemId}`),
            siteKind: siteKind,
            siteStatus: siteStatus,
            shareStatus: shareStatus,
            accessMode: accessMode,
            ...(latestSession ? { latestSession } : {}),
            ...(readString(input.deploymentId)
                ? { deploymentId: readString(input.deploymentId) }
                : {}),
            ...(readString(input.deploymentStatus)
                ? { deploymentStatus: readString(input.deploymentStatus) }
                : {}),
            ...(clientSourceKey ? { clientSourceKey } : {}),
            ...(readString(input.artifactId) ? { artifactId: readString(input.artifactId) } : {}),
            ...(readString(input.updatedAt) ? { updatedAt: readString(input.updatedAt) } : {}),
            ...(accessExpiresAt === undefined ? {} : { accessExpiresAt }),
            ...(subscriptionRecoveryMode === undefined ? {} : { subscriptionRecoveryMode }),
            ...effectiveAccessFields,
        };
        return item;
    }
    return null;
};
const listLibraryCloudItems = async (serverBaseUrl, fetchWithAuth, localStore, ownerScope, options) => {
    const pageSize = Math.max(1, Math.min(options.pageSize ?? constants_2.LibraryLimits.DefaultPageSize, constants_2.LibraryLimits.MaxPageSize));
    const favorites = localStore.getFavoriteIds(ownerScope, [
        constants_2.LibraryItemKind.SharedFile,
        constants_2.LibraryItemKind.DeployedSite,
    ]);
    try {
        const requestedKind = options.category === constants_2.LibraryCategory.Site
            ? constants_2.LibraryCloudKind.DeployedSite
            : options.category && options.category !== constants_2.LibraryCategory.All
                && (options.kind === undefined || options.kind === constants_2.LibraryCloudKind.All)
                ? constants_2.LibraryCloudKind.SharedFile
                : options.kind ?? constants_2.LibraryCloudKind.All;
        const requestedCategory = options.category === constants_2.LibraryCategory.Site
            ? constants_2.LibraryCategory.All
            : options.category ?? constants_2.LibraryCategory.All;
        const hasClientFilters = Boolean(options.favoritesOnly
            || (options.availability
                && options.availability !== constants_2.LibraryCloudAvailabilityFilter.All));
        let nextRequestCursor = options.cursor?.trim();
        let nextCursor;
        let hasMore = false;
        let counts = { sharedFile: 0, deployedSite: 0 };
        let sharedStatusCounts = {
            all: 0,
            live: 0,
            disabled: 0,
        };
        let pageCount = 0;
        let serverNow = Date.now();
        let recoveryPending = false;
        const items = new Map();
        do {
            const query = new URLSearchParams({
                kind: requestedKind,
                category: requestedCategory,
                pageSize: String(pageSize),
            });
            if (options.keyword?.trim()) {
                query.set('keyword', options.keyword.trim().slice(0, constants_2.LibraryLimits.MaxKeywordLength));
            }
            if (options.sharedStatus)
                query.set('sharedStatus', options.sharedStatus);
            if (nextRequestCursor)
                query.set('cursor', nextRequestCursor);
            const response = await fetchWithAuth(`${serverBaseUrl}/api/library/cloud-items?${query.toString()}`);
            const body = (await response.json().catch(() => null));
            if (!response.ok || body?.code !== 0 || !body.data) {
                return {
                    success: false,
                    code: response.status === 401
                        ? constants_2.LibraryErrorCode.NotAuthenticated
                        : constants_2.LibraryErrorCode.CloudUnavailable,
                    error: body?.message || response.statusText || 'Cloud library request failed.',
                };
            }
            serverNow = readOptionalTimestamp(body.data.serverNow) ?? serverNow;
            recoveryPending = recoveryPending || readBoolean(body.data.recoveryPending) === true;
            for (const input of body.data.list ?? []) {
                const item = normalizeCloudItem(input, favorites, localStore);
                if (!item
                    || (options.favoritesOnly && !item.isFavorite)
                    || (options.availability
                        && !(0, cloudAvailability_1.matchesLibraryCloudAvailability)(item, options.availability, serverNow))) {
                    continue;
                }
                items.set(`${item.itemKind}:${item.itemId}`, item);
            }
            nextCursor = body.data.nextCursor;
            hasMore = Boolean(body.data.hasMore && nextCursor);
            counts = {
                sharedFile: Number(body.data.counts?.sharedFile ?? 0),
                deployedSite: Number(body.data.counts?.deployedSite ?? 0),
            };
            sharedStatusCounts = {
                all: Number(body.data.sharedStatusCounts?.all ?? 0),
                live: Number(body.data.sharedStatusCounts?.live ?? 0),
                disabled: Number(body.data.sharedStatusCounts?.disabled ?? 0),
            };
            nextRequestCursor = nextCursor;
            pageCount += 1;
        } while (hasClientFilters
            && items.size < pageSize
            && hasMore
            && nextRequestCursor
            && pageCount < constants_2.LibraryLimits.MaxFilteredCloudPages);
        return {
            success: true,
            data: {
                list: [...items.values()],
                hasMore,
                ...(hasMore && nextCursor ? { nextCursor } : {}),
                counts,
                sharedStatusCounts,
                serverNow,
                recoveryPending,
            },
        };
    }
    catch (error) {
        return {
            success: false,
            code: constants_2.LibraryErrorCode.CloudUnavailable,
            error: error instanceof Error ? error.message : 'Cloud library request failed.',
        };
    }
};
exports.listLibraryCloudItems = listLibraryCloudItems;
//# sourceMappingURL=libraryCloudClient.js.map
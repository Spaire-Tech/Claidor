"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchesLibraryCloudAvailability = exports.isLibraryCloudAccessExpired = exports.getLibraryCloudAvailability = void 0;
const constants_1 = require("../htmlShare/constants");
const constants_2 = require("../site/constants");
const constants_3 = require("./constants");
const getLibraryCloudAvailability = (item, now = Date.now()) => {
    if ((typeof item.accessExpiresAt === 'number' && item.accessExpiresAt <= now)
        || (typeof item.effectiveExpiresAt === 'number' && item.effectiveExpiresAt <= now)) {
        return constants_3.LibraryCloudAvailabilityFilter.Unavailable;
    }
    if (item.itemKind === constants_3.LibraryItemKind.SharedFile) {
        return item.status === constants_1.HtmlShareStatus.Live && item.effectiveAvailable !== false
            ? constants_3.LibraryCloudAvailabilityFilter.Available
            : constants_3.LibraryCloudAvailabilityFilter.Unavailable;
    }
    return item.siteStatus === constants_2.SiteStatus.Online
        && item.shareStatus === constants_1.HtmlShareStatus.Live
        && item.effectiveAvailable !== false
        ? constants_3.LibraryCloudAvailabilityFilter.Available
        : constants_3.LibraryCloudAvailabilityFilter.Unavailable;
};
exports.getLibraryCloudAvailability = getLibraryCloudAvailability;
const isLibraryCloudAccessExpired = (item, now = Date.now()) => ((typeof item.accessExpiresAt === 'number' && item.accessExpiresAt <= now)
    || (typeof item.effectiveExpiresAt === 'number' && item.effectiveExpiresAt <= now)
    || item.effectiveUnavailableReason === constants_3.LibraryCloudUnavailableReason.FreeAccessExpired
    || item.effectiveUnavailableReason
        === constants_3.LibraryCloudUnavailableReason.EntitlementGraceExpired);
exports.isLibraryCloudAccessExpired = isLibraryCloudAccessExpired;
const matchesLibraryCloudAvailability = (item, availability, now = Date.now()) => (availability === constants_3.LibraryCloudAvailabilityFilter.All
    || (0, exports.getLibraryCloudAvailability)(item, now) === availability);
exports.matchesLibraryCloudAvailability = matchesLibraryCloudAvailability;
//# sourceMappingURL=cloudAvailability.js.map
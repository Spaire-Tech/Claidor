"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLibraryArtifactType = exports.isLibraryRelationKind = exports.isLibraryCloudAvailabilityFilter = exports.isLibrarySharedStatusFilter = exports.isLibraryCategory = exports.isLibraryItemKind = exports.getLibraryArtifactTypeForExtension = exports.getLibraryCategoryForExtension = exports.LIBRARY_PREVIEWABLE_EXTENSIONS = exports.LibraryFavoriteScope = exports.LIBRARY_INDEX_POLICY_VERSION = exports.LibraryLimits = exports.LibraryIpc = exports.LibraryChangeReason = exports.LibraryErrorCode = exports.LibraryIndexPhase = exports.LibraryArtifactType = exports.LibraryViewMode = exports.LibrarySort = exports.LibraryOrigin = exports.LibraryAvailability = exports.LibraryRelationKind = exports.LibraryCategory = exports.LibraryCloudUnavailableReason = exports.LibraryCloudAvailabilityFilter = exports.LibrarySharedStatusFilter = exports.LibraryCloudKind = exports.LibraryNavigationEvent = exports.LibrarySourceFilter = exports.LibraryItemKind = void 0;
exports.LibraryItemKind = {
    LocalArtifact: 'local_artifact',
    SharedFile: 'shared_file',
    DeployedSite: 'deployed_site',
};
exports.LibrarySourceFilter = {
    Local: 'local',
    Cloud: 'cloud',
};
exports.LibraryNavigationEvent = {
    OpenCloud: 'lobsterai:library-open-cloud',
};
exports.LibraryCloudKind = {
    All: 'all',
    SharedFile: exports.LibraryItemKind.SharedFile,
    DeployedSite: exports.LibraryItemKind.DeployedSite,
};
exports.LibrarySharedStatusFilter = {
    All: 'all',
    Live: 'live',
    Disabled: 'disabled',
};
exports.LibraryCloudAvailabilityFilter = {
    All: 'all',
    Available: 'available',
    Unavailable: 'unavailable',
};
exports.LibraryCloudUnavailableReason = {
    ShareNotLive: 'share_not_live',
    SiteNotOnline: 'site_not_online',
    FreeAccessExpired: 'free_access_expired',
    EntitlementGraceExpired: 'entitlement_grace_expired',
};
exports.LibraryCategory = {
    All: 'all',
    Web: 'web',
    Slides: 'slides',
    Document: 'document',
    Spreadsheet: 'spreadsheet',
    Image: 'image',
    Media: 'media',
    Site: 'site',
    Other: 'other',
};
exports.LibraryRelationKind = {
    Created: 'created',
    Modified: 'modified',
    Referenced: 'referenced',
};
exports.LibraryAvailability = {
    Available: 'available',
    Missing: 'missing',
    PermissionDenied: 'permission_denied',
};
exports.LibraryOrigin = {
    Conversation: 'conversation',
    Manual: 'manual',
    Share: 'share',
    Backfill: 'backfill',
};
exports.LibrarySort = {
    RecentlyUpdated: 'recently_updated',
};
exports.LibraryViewMode = {
    Grid: 'grid',
    List: 'list',
};
exports.LibraryArtifactType = {
    Html: 'html',
    Svg: 'svg',
    Image: 'image',
    Video: 'video',
    Mermaid: 'mermaid',
    Code: 'code',
    Markdown: 'markdown',
    Text: 'text',
    Document: 'document',
};
exports.LibraryIndexPhase = {
    Idle: 'idle',
    Backfill: 'backfill',
    Repair: 'repair',
};
exports.LibraryErrorCode = {
    InvalidInput: 'invalid_input',
    NotFound: 'not_found',
    NotAvailable: 'not_available',
    PermissionDenied: 'permission_denied',
    NotAuthenticated: 'not_authenticated',
    CloudUnavailable: 'cloud_unavailable',
    Internal: 'internal_error',
};
exports.LibraryChangeReason = {
    Recorded: 'recorded',
    FileChanged: 'file_changed',
    Favorite: 'favorite',
    Repair: 'repair',
    SessionDeleted: 'session_deleted',
};
exports.LibraryIpc = {
    ListLocal: 'library:listLocal',
    ListCloud: 'library:listCloud',
    GetLocalItems: 'library:getLocalItems',
    GetLocalDetail: 'library:getLocalDetail',
    RecordCandidates: 'library:recordCandidates',
    AddLocalFiles: 'library:addLocalFiles',
    SetFavorite: 'library:setFavorite',
    OpenLocal: 'library:openLocal',
    RevealLocal: 'library:revealLocal',
    RepairIndex: 'library:repairIndex',
    GetIndexStatus: 'library:getIndexStatus',
    GetBackfillState: 'library:getBackfillState',
    SetBackfillState: 'library:setBackfillState',
    Changed: 'library:changed',
};
exports.LibraryLimits = {
    DefaultPageSize: 24,
    MaxPageSize: 100,
    MaxTargetItemIds: 100,
    MaxKeywordLength: 100,
    MaxCandidateBatchSize: 100,
    MaxCandidateStringLength: 4096,
    MaxCandidateBatchStringLength: 200_000,
    MaxFavoriteCloudPages: 5,
    MaxFilteredCloudPages: 10,
    WatchDirectoryLimit: 512,
    WatchDebounceMs: 300,
    ReconcileBatchSize: 100,
    ReconcileIntervalMs: 60_000,
    RecentVerificationWindowMs: 10 * 60_000,
    MissingRetentionMs: 7 * 24 * 60 * 60_000,
};
exports.LIBRARY_INDEX_POLICY_VERSION = 2;
exports.LibraryFavoriteScope = {
    LocalDevice: 'device',
    CloudPrefix: 'cloud:',
};
const WEB_EXTENSIONS = new Set(['.html', '.htm']);
const SLIDE_EXTENSIONS = new Set(['.pptx']);
const DOCUMENT_EXTENSIONS = new Set(['.docx', '.pdf', '.md', '.txt', '.log']);
const SPREADSHEET_EXTENSIONS = new Set(['.xls', '.xlsx', '.csv', '.tsv']);
const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg',
]);
const MEDIA_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
exports.LIBRARY_PREVIEWABLE_EXTENSIONS = new Set([
    ...WEB_EXTENSIONS,
    ...SLIDE_EXTENSIONS,
    ...DOCUMENT_EXTENSIONS,
    ...SPREADSHEET_EXTENSIONS,
    ...IMAGE_EXTENSIONS,
    ...MEDIA_EXTENSIONS,
    '.mermaid', '.mmd', '.jsx', '.tsx', '.css',
]);
const getLibraryCategoryForExtension = (extension) => {
    const normalized = extension.trim().toLowerCase();
    if (WEB_EXTENSIONS.has(normalized))
        return exports.LibraryCategory.Web;
    if (SLIDE_EXTENSIONS.has(normalized))
        return exports.LibraryCategory.Slides;
    if (DOCUMENT_EXTENSIONS.has(normalized))
        return exports.LibraryCategory.Document;
    if (SPREADSHEET_EXTENSIONS.has(normalized))
        return exports.LibraryCategory.Spreadsheet;
    if (IMAGE_EXTENSIONS.has(normalized))
        return exports.LibraryCategory.Image;
    if (MEDIA_EXTENSIONS.has(normalized))
        return exports.LibraryCategory.Media;
    return exports.LibraryCategory.Other;
};
exports.getLibraryCategoryForExtension = getLibraryCategoryForExtension;
const getLibraryArtifactTypeForExtension = (extension) => {
    const normalized = extension.trim().toLowerCase();
    if (!exports.LIBRARY_PREVIEWABLE_EXTENSIONS.has(normalized))
        return null;
    if (WEB_EXTENSIONS.has(normalized))
        return exports.LibraryArtifactType.Html;
    if (normalized === '.svg')
        return exports.LibraryArtifactType.Svg;
    if (IMAGE_EXTENSIONS.has(normalized))
        return exports.LibraryArtifactType.Image;
    if (MEDIA_EXTENSIONS.has(normalized))
        return exports.LibraryArtifactType.Video;
    if (normalized === '.mermaid' || normalized === '.mmd')
        return exports.LibraryArtifactType.Mermaid;
    if (normalized === '.md')
        return exports.LibraryArtifactType.Markdown;
    if (normalized === '.txt' || normalized === '.log')
        return exports.LibraryArtifactType.Text;
    if (SLIDE_EXTENSIONS.has(normalized)
        || normalized === '.docx'
        || normalized === '.pdf'
        || SPREADSHEET_EXTENSIONS.has(normalized)) {
        return exports.LibraryArtifactType.Document;
    }
    return exports.LibraryArtifactType.Code;
};
exports.getLibraryArtifactTypeForExtension = getLibraryArtifactTypeForExtension;
const isLibraryItemKind = (value) => (typeof value === 'string' && Object.values(exports.LibraryItemKind).includes(value));
exports.isLibraryItemKind = isLibraryItemKind;
const isLibraryCategory = (value) => (typeof value === 'string' && Object.values(exports.LibraryCategory).includes(value));
exports.isLibraryCategory = isLibraryCategory;
const isLibrarySharedStatusFilter = (value) => (typeof value === 'string'
    && Object.values(exports.LibrarySharedStatusFilter).includes(value));
exports.isLibrarySharedStatusFilter = isLibrarySharedStatusFilter;
const isLibraryCloudAvailabilityFilter = (value) => (typeof value === 'string'
    && Object.values(exports.LibraryCloudAvailabilityFilter).includes(value));
exports.isLibraryCloudAvailabilityFilter = isLibraryCloudAvailabilityFilter;
const isLibraryRelationKind = (value) => (typeof value === 'string'
    && Object.values(exports.LibraryRelationKind).includes(value));
exports.isLibraryRelationKind = isLibraryRelationKind;
const isLibraryArtifactType = (value) => (typeof value === 'string'
    && Object.values(exports.LibraryArtifactType).includes(value));
exports.isLibraryArtifactType = isLibraryArtifactType;
//# sourceMappingURL=constants.js.map
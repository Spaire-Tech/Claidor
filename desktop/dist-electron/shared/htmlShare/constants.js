"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HtmlSharePublicRoute = exports.HtmlShareFailureField = exports.HtmlShareFailureKind = exports.HtmlShareErrorCode = exports.HtmlShareDisabledSource = exports.HtmlShareStatus = exports.HtmlShareAccessMode = exports.HtmlShareSourceType = exports.HtmlShareIpc = void 0;
exports.HtmlShareIpc = {
    CreateFromHtmlFile: 'htmlShare:createFromHtmlFile',
    UpdateFromHtmlFile: 'htmlShare:updateFromHtmlFile',
    GetByHtmlFile: 'htmlShare:getByHtmlFile',
    CreateFromArtifactFile: 'htmlShare:createFromArtifactFile',
    UpdateFromArtifactFile: 'htmlShare:updateFromArtifactFile',
    GetByArtifactFile: 'htmlShare:getByArtifactFile',
    CreateFromGeneratedVideo: 'htmlShare:createFromGeneratedVideo',
    GetGeneratedVideoSource: 'htmlShare:getGeneratedVideoSource',
    ResolveLegacyGeneratedVideoSource: 'htmlShare:resolveLegacyGeneratedVideoSource',
    GetBySource: 'htmlShare:getBySource',
    UpdateStatus: 'htmlShare:updateStatus',
    UpdateAccessMode: 'htmlShare:updateAccessMode',
    Disable: 'htmlShare:disable',
    DeletePermanently: 'htmlShare:deletePermanently',
    Get: 'htmlShare:get',
    GetQuota: 'htmlShare:getQuota',
    GetTrialPolicy: 'htmlShare:getTrialPolicy',
    GetAnalytics: 'htmlShare:getAnalytics',
};
exports.HtmlShareSourceType = {
    HtmlFile: 'html_file',
    ImageFile: 'image_file',
    SvgFile: 'svg_file',
    DocumentFile: 'document_file',
    MarkdownFile: 'markdown_file',
    MermaidFile: 'mermaid_file',
    GeneratedVideoFile: 'generated_video_file',
    NodeServiceDeployment: 'node_service_deployment',
    StaticServiceDeployment: 'static_service_deployment',
};
exports.HtmlShareAccessMode = {
    Code: 'code',
    Public: 'public',
};
exports.HtmlShareStatus = {
    Live: 'live',
    Disabled: 'disabled',
    Failed: 'failed',
};
exports.HtmlShareDisabledSource = {
    User: 'user',
    Admin: 'admin',
    Moderation: 'moderation',
    ActiveLimit: 'active_limit',
    System: 'system',
};
exports.HtmlShareErrorCode = {
    InvalidArchive: 41300,
    TooLarge: 41301,
    EntryNotFound: 41302,
    NotFound: 41303,
    ReopenUnavailable: 41304,
    UploadFailed: 41305,
    UnsupportedFile: 41306,
    SubscriptionRequired: 41307,
    AccessCodeInvalid: 41308,
    AccessCodeRateLimited: 41309,
    AccessModeInvalid: 41310,
    ActiveShareLimitReached: 41311,
    UnsafeSvg: 41312,
    AccessExpired: 41313,
    QuotaConfigInvalid: 41314,
    DeleteRequiresDisabled: 41315,
    ActionConflict: 41316,
    VideoTaskNotFound: 41317,
    VideoSourceUnavailable: 41318,
    VideoPrepareFailed: 41319,
    VideoUnsupported: 41320,
    FeatureUnavailable: 49001,
    DisabledCannotUpdate: 49002,
};
exports.HtmlShareFailureKind = {
    InputTooLong: 'input_too_long',
    FileTooLarge: 'file_too_large',
    TotalSizeExceeded: 'total_size_exceeded',
    ArchiveSizeExceeded: 'archive_size_exceeded',
    FileCountExceeded: 'file_count_exceeded',
    InvalidArchive: 'invalid_archive',
    UnsupportedFile: 'unsupported_file',
    UploadFailed: 'upload_failed',
    Unknown: 'unknown',
};
exports.HtmlShareFailureField = {
    Content: 'content',
    FileName: 'file_name',
    FilePath: 'file_path',
    Title: 'title',
};
exports.HtmlSharePublicRoute = {
    Root: '/s',
};
//# sourceMappingURL=constants.js.map
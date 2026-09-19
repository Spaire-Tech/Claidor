"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArtifactBrowserPartition = exports.ArtifactPreviewProtocol = exports.ArtifactPreviewIpc = void 0;
exports.ArtifactPreviewIpc = {
    CreateSession: 'artifact:createPreviewSession',
    CreateOfficeSession: 'artifact:createOfficePreviewSession',
    DestroySession: 'artifact:destroyPreviewSession',
    ClearBrowserCookies: 'artifact:browser:clearCookies',
    ClearBrowserCache: 'artifact:browser:clearCache',
    SaveBrowserAnnotationAsset: 'artifact:browserAnnotation:asset:save',
    ReadBrowserAnnotationAsset: 'artifact:browserAnnotation:asset:read',
    DeleteBrowserAnnotationAsset: 'artifact:browserAnnotation:asset:delete',
    DeleteBrowserAnnotationBatchAssets: 'artifact:browserAnnotation:asset:deleteBatch',
};
exports.ArtifactPreviewProtocol = {
    LocalFile: 'localfile',
};
exports.ArtifactBrowserPartition = {
    Default: 'persist:lobster-artifact-browser',
};
//# sourceMappingURL=constants.js.map
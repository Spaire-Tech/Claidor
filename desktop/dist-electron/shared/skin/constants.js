"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKIN_REGISTRY_VERSION = exports.SkinStoreErrorCode = exports.SkinToolAction = exports.SkinToolName = exports.SkinIpc = exports.SkinProtocol = exports.SkinAssetMimeType = exports.SkinAssetExtension = exports.SkinAssetFormat = exports.SkinParticleDensity = exports.SkinPreferredAppearance = exports.SkinPresentationMode = exports.SkinRecordStatus = exports.SKIN_ASSET_SLOTS = exports.SkinAssetSlot = exports.SkinWorkflowKind = void 0;
exports.SkinWorkflowKind = {
    SkinPack: 'skin_pack',
};
exports.SkinAssetSlot = {
    WorkspaceBackdrop: 'workspace.backdrop',
    HomeEmblem: 'home.emblem',
};
exports.SKIN_ASSET_SLOTS = [
    exports.SkinAssetSlot.WorkspaceBackdrop,
    exports.SkinAssetSlot.HomeEmblem,
];
exports.SkinRecordStatus = {
    Draft: 'draft',
    Ready: 'ready',
};
exports.SkinPresentationMode = {
    ImmersiveShell: 'immersive_shell',
};
exports.SkinPreferredAppearance = {
    Light: 'light',
    Dark: 'dark',
};
exports.SkinParticleDensity = {
    None: 'none',
    Sparse: 'sparse',
};
exports.SkinAssetFormat = {
    Png: 'png',
    Jpeg: 'jpeg',
    Webp: 'webp',
};
exports.SkinAssetExtension = {
    Png: 'png',
    Jpeg: 'jpg',
    Webp: 'webp',
};
exports.SkinAssetMimeType = {
    Png: 'image/png',
    Jpeg: 'image/jpeg',
    Webp: 'image/webp',
};
exports.SkinProtocol = {
    Scheme: 'lobster-skin',
    Host: 'asset',
};
exports.SkinIpc = {
    GetActive: 'skin:getActive',
    List: 'skin:list',
    Apply: 'skin:apply',
    BindTheme: 'skin:bindTheme',
    Deactivate: 'skin:deactivate',
    Delete: 'skin:delete',
    Changed: 'skin:changed',
};
exports.SkinToolName = {
    Manage: 'caisra_skin_manage',
};
exports.SkinToolAction = {
    CreateDraft: 'create_draft',
    RegisterAsset: 'register_asset',
    Status: 'status',
    Apply: 'apply',
    Deactivate: 'deactivate',
};
exports.SkinStoreErrorCode = {
    InvalidRegistry: 'invalid_registry',
    InvalidDraft: 'invalid_draft',
    InvalidSkinId: 'invalid_skin_id',
    InvalidSlot: 'invalid_slot',
    InvalidSource: 'invalid_source',
    UnsupportedSourceScheme: 'unsupported_source_scheme',
    SourceNotFound: 'source_not_found',
    SourceNotRegularFile: 'source_not_regular_file',
    AssetTooLarge: 'asset_too_large',
    UnsupportedAssetFormat: 'unsupported_asset_format',
    InvalidAssetDimensions: 'invalid_asset_dimensions',
    SkinNotFound: 'skin_not_found',
    SkinIncomplete: 'skin_incomplete',
    SlotOutOfOrder: 'slot_out_of_order',
    SlotAlreadyRegistered: 'slot_already_registered',
    ActiveSkinImmutable: 'active_skin_immutable',
    InvalidThemeId: 'invalid_theme_id',
    UnsafeAssetPath: 'unsafe_asset_path',
};
exports.SKIN_REGISTRY_VERSION = 1;
//# sourceMappingURL=constants.js.map
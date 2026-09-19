"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.presentSkin = presentSkin;
const skinProtocol_1 = require("./skinProtocol");
const presentAsset = (skinId, asset) => ({
    url: (0, skinProtocol_1.buildSkinAssetUrl)(skinId, asset.slot, asset.contentHash),
    cacheKey: asset.contentHash,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
});
function presentSkin(record) {
    const assets = {};
    for (const asset of Object.values(record.assets)) {
        if (asset)
            assets[asset.slot] = presentAsset(record.id, asset);
    }
    return {
        id: record.id,
        ...(record.name === undefined ? {} : { name: record.name }),
        workflowKind: record.workflowKind,
        ...(record.baseThemeId === undefined ? {} : { baseThemeId: record.baseThemeId }),
        ...(record.boundThemeId === undefined ? {} : { boundThemeId: record.boundThemeId }),
        ...(record.presentation === undefined ? {} : { presentation: record.presentation }),
        status: record.status,
        assets,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        ...(record.appliedAt === undefined ? {} : { appliedAt: record.appliedAt }),
    };
}
//# sourceMappingURL=skinPresentation.js.map
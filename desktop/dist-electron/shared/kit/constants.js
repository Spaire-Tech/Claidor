"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildKitReferenceUri = exports.KitStoreKey = exports.KitReferenceSource = exports.KitReferenceScheme = exports.KitReferenceKind = void 0;
exports.KitReferenceKind = {
    Kit: 'kit',
};
exports.KitReferenceScheme = {
    Kit: 'kit',
};
exports.KitReferenceSource = {
    LobsterAiKits: 'lobsterai-kits',
};
exports.KitStoreKey = {
    Installed: 'kits_installed',
};
const buildKitReferenceUri = (id) => `${exports.KitReferenceScheme.Kit}://${encodeURIComponent(id)}@${exports.KitReferenceSource.LobsterAiKits}`;
exports.buildKitReferenceUri = buildKitReferenceUri;
//# sourceMappingURL=constants.js.map
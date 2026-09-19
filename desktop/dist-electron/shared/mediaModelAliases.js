"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAPPYHORSE_1_1_MODEL_ID = exports.CANVAS20_LEGACY_MODEL_ID = exports.GPT_IMAGE_2_MODEL_ID = void 0;
exports.canonicalizeMediaModelId = canonicalizeMediaModelId;
exports.mediaModelDisplayName = mediaModelDisplayName;
exports.GPT_IMAGE_2_MODEL_ID = 'gpt-image-2';
exports.CANVAS20_LEGACY_MODEL_ID = 'canvas-20';
exports.HAPPYHORSE_1_1_MODEL_ID = 'HappyHorse-1.1';
const MEDIA_MODEL_ID_ALIASES = {
    [exports.CANVAS20_LEGACY_MODEL_ID]: exports.GPT_IMAGE_2_MODEL_ID,
    'happyhorse-1.1': exports.HAPPYHORSE_1_1_MODEL_ID,
    [exports.HAPPYHORSE_1_1_MODEL_ID]: exports.HAPPYHORSE_1_1_MODEL_ID,
};
function canonicalizeMediaModelId(modelId) {
    const normalized = typeof modelId === 'string' ? modelId.trim() : '';
    return MEDIA_MODEL_ID_ALIASES[normalized] ?? normalized;
}
function mediaModelDisplayName(modelId, fallbackName) {
    const canonicalModelId = canonicalizeMediaModelId(modelId);
    if (canonicalModelId === exports.GPT_IMAGE_2_MODEL_ID) {
        return exports.GPT_IMAGE_2_MODEL_ID;
    }
    if (canonicalModelId === exports.HAPPYHORSE_1_1_MODEL_ID) {
        return exports.HAPPYHORSE_1_1_MODEL_ID;
    }
    const normalizedFallback = typeof fallbackName === 'string' ? fallbackName.trim() : '';
    return normalizedFallback || canonicalModelId;
}
//# sourceMappingURL=mediaModelAliases.js.map
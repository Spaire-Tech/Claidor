"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMediaGenerationGate = exports.MediaGenerationGateReason = exports.MediaSelectionMode = exports.MediaGenerationAction = exports.MediaGenerationTool = void 0;
exports.MediaGenerationTool = {
    Image: 'caisra_image_generate',
    Video: 'caisra_video_generate',
};
exports.MediaGenerationAction = {
    Generate: 'generate',
};
exports.MediaSelectionMode = {
    Auto: 'auto',
    Image: 'image',
    Video: 'video',
    None: 'none',
};
exports.MediaGenerationGateReason = {
    MediaNotEnabled: 'MEDIA_NOT_ENABLED',
    WrongMediaType: 'WRONG_MEDIA_TYPE',
};
const resolveMediaGenerationGate = (input) => {
    if (input.action !== exports.MediaGenerationAction.Generate) {
        return { allowed: true };
    }
    if (!input.selection || input.selection.mode === exports.MediaSelectionMode.None) {
        return {
            allowed: false,
            reason: exports.MediaGenerationGateReason.MediaNotEnabled,
            message: 'Tool unavailable: This media generation tool is not available in this session. No media generation model has been selected by the user. Do not retry.',
        };
    }
    if (input.selection?.mode === exports.MediaSelectionMode.Image && input.tool === exports.MediaGenerationTool.Video) {
        return {
            allowed: false,
            reason: exports.MediaGenerationGateReason.WrongMediaType,
            message: 'Video generation is not available. The user selected an image generation model for this turn.',
        };
    }
    if (input.selection?.mode === exports.MediaSelectionMode.Video && input.tool === exports.MediaGenerationTool.Image) {
        return {
            allowed: false,
            reason: exports.MediaGenerationGateReason.WrongMediaType,
            message: 'Image generation is not available. The user selected a video generation model for this turn.',
        };
    }
    return { allowed: true };
};
exports.resolveMediaGenerationGate = resolveMediaGenerationGate;
//# sourceMappingURL=mediaGenerationPolicy.js.map
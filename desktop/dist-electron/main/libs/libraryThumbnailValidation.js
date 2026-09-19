"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLikelyBlankThumbnailBitmap = exports.LibraryThumbnailVisualThreshold = void 0;
exports.LibraryThumbnailVisualThreshold = {
    MaxSamples: 4_096,
    UniformLuminanceRange: 4,
    LightLuminanceFloor: 235,
    MaxNonLightRatio: 0.002,
};
const isLikelyBlankThumbnailBitmap = (bitmap) => {
    const pixelCount = Math.floor(bitmap.length / 4);
    if (pixelCount <= 0)
        return true;
    const sampleStep = Math.max(1, Math.floor(pixelCount / exports.LibraryThumbnailVisualThreshold.MaxSamples));
    let visibleSamples = 0;
    let lightSamples = 0;
    let minimumLuminance = 255;
    let maximumLuminance = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += sampleStep) {
        const offset = pixel * 4;
        const alpha = bitmap[offset + 3];
        if (alpha <= 8)
            continue;
        // Electron returns a premultiplied BGRA bitmap.
        const blue = bitmap[offset];
        const green = bitmap[offset + 1];
        const red = bitmap[offset + 2];
        const luminance = Math.round((red * 0.2126) + (green * 0.7152) + (blue * 0.0722));
        minimumLuminance = Math.min(minimumLuminance, luminance);
        maximumLuminance = Math.max(maximumLuminance, luminance);
        if (luminance >= exports.LibraryThumbnailVisualThreshold.LightLuminanceFloor) {
            lightSamples += 1;
        }
        visibleSamples += 1;
    }
    if (visibleSamples === 0)
        return true;
    if (maximumLuminance - minimumLuminance
        <= exports.LibraryThumbnailVisualThreshold.UniformLuminanceRange) {
        return true;
    }
    const nonLightRatio = 1 - (lightSamples / visibleSamples);
    return nonLightRatio <= exports.LibraryThumbnailVisualThreshold.MaxNonLightRatio;
};
exports.isLikelyBlankThumbnailBitmap = isLikelyBlankThumbnailBitmap;
//# sourceMappingURL=libraryThumbnailValidation.js.map
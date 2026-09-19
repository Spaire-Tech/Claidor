"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForCommittedThumbnailPresentation = exports.hasLibraryThumbnailPresentationStamp = void 0;
const thumbnail_1 = require("../../shared/library/thumbnail");
const isWithinTolerance = (actual, expected) => (Math.abs(actual - expected) <= thumbnail_1.LibraryThumbnailPresentationStamp.ColorTolerance);
const hasLibraryThumbnailPresentationStamp = (image, expectation) => {
    const size = image.getSize();
    const expectedHeight = expectation.height + thumbnail_1.LibraryThumbnailPresentationStamp.Height;
    if (size.width < expectation.width || size.height < expectedHeight)
        return false;
    const bitmap = image.toBitmap();
    if (bitmap.length % 4 !== 0)
        return false;
    const pixelCount = bitmap.length / 4;
    const expectedAspectRatio = expectation.width / expectedHeight;
    const bitmapWidth = Math.round(Math.sqrt(pixelCount * expectedAspectRatio));
    const bitmapHeight = Math.round(pixelCount / bitmapWidth);
    if (bitmapWidth * bitmapHeight !== pixelCount)
        return false;
    const horizontalScale = bitmapWidth / expectation.width;
    const verticalScale = bitmapHeight / expectedHeight;
    if (horizontalScale < 1
        || verticalScale < 1
        || Math.abs(horizontalScale - verticalScale) > 0.05)
        return false;
    const color = (0, thumbnail_1.getLibraryThumbnailPresentationStampColor)(expectation.renderGeneration);
    const stampStartY = Math.round(expectation.height * verticalScale);
    const stampPixelHeight = Math.max(1, Math.round(thumbnail_1.LibraryThumbnailPresentationStamp.Height * verticalScale));
    const sampleY = Math.min(bitmapHeight - 1, stampStartY + Math.floor(stampPixelHeight / 2));
    const sampleXs = [0.2, 0.5, 0.8].map(ratio => (Math.min(bitmapWidth - 1, Math.floor(expectation.width * horizontalScale * ratio))));
    return sampleXs.every(sampleX => {
        const offset = ((sampleY * bitmapWidth) + sampleX) * 4;
        return isWithinTolerance(bitmap[offset] ?? -1, color.blue)
            && isWithinTolerance(bitmap[offset + 1] ?? -1, color.green)
            && isWithinTolerance(bitmap[offset + 2] ?? -1, color.red);
    });
};
exports.hasLibraryThumbnailPresentationStamp = hasLibraryThumbnailPresentationStamp;
const waitForCommittedThumbnailPresentation = (webContents, timeoutMs, expectation) => new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    let presentedFrameCount = 0;
    const finish = (error, image) => {
        if (settled)
            return;
        settled = true;
        if (timer)
            clearTimeout(timer);
        if (!webContents.isDestroyed()) {
            try {
                webContents.endFrameSubscription();
            }
            catch {
                // The renderer can disappear while a frame is being delivered.
            }
        }
        if (error)
            reject(error);
        else if (image)
            resolve(image);
        else
            reject(new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.PresentationFailed, 'Thumbnail presentation did not provide a frame'));
    };
    timer = setTimeout(() => {
        finish(new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.PresentationTimeout, 'Thumbnail presentation timed out'));
    }, timeoutMs);
    try {
        webContents.beginFrameSubscription(false, image => {
            if (settled)
                return;
            if (expectation) {
                if ((0, exports.hasLibraryThumbnailPresentationStamp)(image, expectation)) {
                    finish(undefined, image);
                    return;
                }
                try {
                    webContents.invalidate();
                }
                catch (error) {
                    finish(new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.PresentationFailed, error instanceof Error ? error.message : 'Thumbnail repaint failed'));
                }
                return;
            }
            presentedFrameCount += 1;
            if (presentedFrameCount === 1) {
                try {
                    webContents.invalidate();
                }
                catch (error) {
                    finish(new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.PresentationFailed, error instanceof Error ? error.message : 'Thumbnail repaint failed'));
                }
                return;
            }
            finish(undefined, image);
        });
        webContents.invalidate();
    }
    catch (error) {
        finish(new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.PresentationFailed, error instanceof Error ? error.message : 'Thumbnail presentation failed'));
    }
});
exports.waitForCommittedThumbnailPresentation = waitForCommittedThumbnailPresentation;
//# sourceMappingURL=libraryThumbnailPresentation.js.map
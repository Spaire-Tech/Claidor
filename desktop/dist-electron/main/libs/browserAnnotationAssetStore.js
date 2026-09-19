"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserAnnotationAssetStore = void 0;
exports.calculateBrowserAnnotationCrop = calculateBrowserAnnotationCrop;
const crypto_1 = require("crypto");
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const browserAnnotations_1 = require("../../shared/cowork/browserAnnotations");
function safeSegment(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}
function draftSegment(value) {
    return (0, crypto_1.createHash)('sha256').update(value).digest('hex');
}
function calculateBrowserAnnotationCrop(imageSize, viewportSize, targetRect, compact = false) {
    if (!targetRect
        || targetRect.width <= 0
        || targetRect.height <= 0
        || viewportSize.width <= 0
        || viewportSize.height <= 0)
        return null;
    const scaleX = imageSize.width / viewportSize.width;
    const scaleY = imageSize.height / viewportSize.height;
    const padding = compact
        ? browserAnnotations_1.BrowserAnnotationLimit.CompactCropPaddingPx
        : browserAnnotations_1.BrowserAnnotationLimit.CropPaddingPx;
    const left = Math.max(0, Math.floor((targetRect.x - padding) * scaleX));
    const top = Math.max(0, Math.floor((targetRect.y - padding) * scaleY));
    const right = Math.min(imageSize.width, Math.ceil((targetRect.x + targetRect.width + padding) * scaleX));
    const bottom = Math.min(imageSize.height, Math.ceil((targetRect.y + targetRect.height + padding) * scaleY));
    if (right <= left || bottom <= top)
        return null;
    return { x: left, y: top, width: right - left, height: bottom - top, padding };
}
class BrowserAnnotationAssetStore {
    rootDir;
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    save(input) {
        const image = electron_1.nativeImage.createFromDataURL(input.imageDataUrl);
        if (image.isEmpty())
            throw new Error('Invalid browser annotation image.');
        const sourceSize = image.getSize();
        const crop = calculateBrowserAnnotationCrop(sourceSize, { width: input.viewportWidth, height: input.viewportHeight }, input.targetRect, input.compact);
        let processed = crop ? image.crop(crop) : image;
        const processedSize = processed.getSize();
        const maxEdge = input.compact
            ? browserAnnotations_1.BrowserAnnotationLimit.CompactLongestEdgePx
            : crop
                ? browserAnnotations_1.BrowserAnnotationLimit.TargetLongestEdgePx
                : browserAnnotations_1.BrowserAnnotationLimit.FallbackLongestEdgePx;
        const longestEdge = Math.max(processedSize.width, processedSize.height);
        if (longestEdge > maxEdge) {
            const ratio = maxEdge / longestEdge;
            processed = processed.resize({
                width: Math.max(1, Math.round(processedSize.width * ratio)),
                height: Math.max(1, Math.round(processedSize.height * ratio)),
                quality: 'best',
            });
        }
        const png = processed.toPNG();
        const assetId = (0, crypto_1.randomUUID)();
        const assetPath = this.resolvePath({ ...input, assetId });
        fs_1.default.mkdirSync(path_1.default.dirname(assetPath), { recursive: true });
        fs_1.default.writeFileSync(assetPath, png, { mode: 0o600 });
        const size = processed.getSize();
        return {
            assetId,
            mimeType: 'image/png',
            width: size.width,
            height: size.height,
            byteSize: png.byteLength,
            isCompact: Boolean(input.compact),
            annotationViewportRect: input.targetRect,
            cropViewportRect: input.targetRect && crop
                ? {
                    x: Math.max(0, input.targetRect.x - crop.padding),
                    y: Math.max(0, input.targetRect.y - crop.padding),
                    width: crop.width,
                    height: crop.height,
                }
                : undefined,
            cropPaddingPx: crop?.padding,
            markerViewportPoint: input.markerViewportPoint,
            capturedAt: Date.now(),
        };
    }
    read(identity) {
        const assetPath = this.resolvePath(identity);
        const bytes = fs_1.default.readFileSync(assetPath);
        return { dataUrl: `data:image/png;base64,${bytes.toString('base64')}`, byteSize: bytes.byteLength };
    }
    delete(identity) {
        fs_1.default.rmSync(this.resolvePath(identity), { force: true });
    }
    deleteBatch(input) {
        const batchPath = path_1.default.join(this.rootDir, draftSegment(input.draftKey), safeSegment(input.batchId));
        if (!batchPath.startsWith(path_1.default.resolve(this.rootDir) + path_1.default.sep)) {
            throw new Error('Invalid browser annotation asset path.');
        }
        fs_1.default.rmSync(batchPath, { recursive: true, force: true });
    }
    resolvePath(identity) {
        const batchId = safeSegment(identity.batchId);
        const annotationId = safeSegment(identity.annotationId);
        const assetId = safeSegment(identity.assetId);
        if (!batchId || !annotationId || !assetId) {
            throw new Error('Invalid browser annotation asset identity.');
        }
        const root = path_1.default.resolve(this.rootDir);
        const result = path_1.default.resolve(root, draftSegment(identity.draftKey), batchId, annotationId, `${assetId}.png`);
        if (!result.startsWith(root + path_1.default.sep))
            throw new Error('Invalid browser annotation asset path.');
        return result;
    }
}
exports.BrowserAnnotationAssetStore = BrowserAnnotationAssetStore;
//# sourceMappingURL=browserAnnotationAssetStore.js.map
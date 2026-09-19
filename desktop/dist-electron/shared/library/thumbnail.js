"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLibraryThumbnailRenderRequest = exports.withLibraryThumbnailErrorMetrics = exports.getLibraryThumbnailFailureDetails = exports.LibraryThumbnailError = exports.isLibraryDirectPngThumbnailExtension = exports.isLibraryRasterThumbnailExtension = exports.LibraryRasterThumbnailExtensions = exports.getLibraryThumbnailFailureStage = exports.isLibraryThumbnailFailureRetryable = exports.LibraryThumbnailFailureCode = exports.LibraryThumbnailFailureStage = exports.LibraryThumbnailRequestPriority = exports.LibraryThumbnailLimits = exports.getLibraryThumbnailPresentationStampColor = exports.LibraryThumbnailPresentationStamp = exports.LibraryThumbnailDimensions = void 0;
const constants_1 = require("./constants");
exports.LibraryThumbnailDimensions = {
    Width: 480,
    Height: 270,
};
exports.LibraryThumbnailPresentationStamp = {
    Height: 2,
    ColorTolerance: 12,
};
const getLibraryThumbnailPresentationStampColor = (renderGeneration) => {
    const normalized = Math.max(0, Math.floor(renderGeneration));
    return {
        red: 32 + ((normalized * 73) % 192),
        green: 32 + ((normalized * 109) % 192),
        blue: 32 + ((normalized * 151) % 192),
    };
};
exports.getLibraryThumbnailPresentationStampColor = getLibraryThumbnailPresentationStampColor;
exports.LibraryThumbnailLimits = {
    MaxSourceBytes: 64 * 1024 * 1024,
    RenderTimeoutMs: 12_000,
    CaptureTimeoutMs: 5_000,
    PresentationTimeoutMs: 3_000,
    MaxRenderAttempts: 2,
};
exports.LibraryThumbnailRequestPriority = {
    Visible: 0,
    NearViewport: 1,
    Background: 2,
};
exports.LibraryThumbnailFailureStage = {
    Source: 'source',
    Renderer: 'renderer',
    PptxParse: 'pptx-parse',
    PptxFirstSlide: 'pptx-first-slide',
    PptxMedia: 'pptx-media',
    PptxLayout: 'pptx-layout',
    Presentation: 'presentation',
    Validation: 'validation',
    NativeFallback: 'native-fallback',
    Unknown: 'unknown',
};
exports.LibraryThumbnailFailureCode = {
    SourceReadFailed: 'source_read_failed',
    SourceTooLarge: 'source_too_large',
    UnsupportedFormat: 'unsupported_format',
    RendererTimeout: 'renderer_timeout',
    RendererResponseInvalid: 'renderer_response_invalid',
    RenderGenerationMismatch: 'render_generation_mismatch',
    RendererFailed: 'renderer_failed',
    DirectPngInvalid: 'direct_png_invalid',
    PptxParseFailed: 'pptx_parse_failed',
    PptxNoSlides: 'pptx_no_slides',
    PptxFirstSlideDomMissing: 'pptx_first_slide_dom_missing',
    PptxFirstSlideDomEmpty: 'pptx_first_slide_dom_empty',
    PptxMediaLoadFailed: 'pptx_media_load_failed',
    PptxMediaTimeout: 'pptx_media_timeout',
    PptxLayoutUnstable: 'pptx_layout_unstable',
    PresentationFailed: 'presentation_failed',
    PresentationTimeout: 'presentation_timeout',
    CaptureTimeout: 'capture_timeout',
    CaptureEmpty: 'capture_empty',
    CaptureBlank: 'capture_blank',
    NativeThumbnailFailed: 'native_thumbnail_failed',
    NativeThumbnailEmpty: 'native_thumbnail_empty',
    NativeThumbnailBlank: 'native_thumbnail_blank',
    RequestCanceled: 'request_canceled',
    Unknown: 'unknown',
};
const LIBRARY_THUMBNAIL_FAILURE_STAGE_BY_CODE = {
    [exports.LibraryThumbnailFailureCode.SourceReadFailed]: exports.LibraryThumbnailFailureStage.Source,
    [exports.LibraryThumbnailFailureCode.SourceTooLarge]: exports.LibraryThumbnailFailureStage.Source,
    [exports.LibraryThumbnailFailureCode.UnsupportedFormat]: exports.LibraryThumbnailFailureStage.Source,
    [exports.LibraryThumbnailFailureCode.RendererTimeout]: exports.LibraryThumbnailFailureStage.Renderer,
    [exports.LibraryThumbnailFailureCode.RendererResponseInvalid]: exports.LibraryThumbnailFailureStage.Renderer,
    [exports.LibraryThumbnailFailureCode.RenderGenerationMismatch]: exports.LibraryThumbnailFailureStage.Renderer,
    [exports.LibraryThumbnailFailureCode.RendererFailed]: exports.LibraryThumbnailFailureStage.Renderer,
    [exports.LibraryThumbnailFailureCode.DirectPngInvalid]: exports.LibraryThumbnailFailureStage.Validation,
    [exports.LibraryThumbnailFailureCode.PptxParseFailed]: exports.LibraryThumbnailFailureStage.PptxParse,
    [exports.LibraryThumbnailFailureCode.PptxNoSlides]: exports.LibraryThumbnailFailureStage.PptxParse,
    [exports.LibraryThumbnailFailureCode.PptxFirstSlideDomMissing]: exports.LibraryThumbnailFailureStage.PptxFirstSlide,
    [exports.LibraryThumbnailFailureCode.PptxFirstSlideDomEmpty]: exports.LibraryThumbnailFailureStage.PptxFirstSlide,
    [exports.LibraryThumbnailFailureCode.PptxMediaLoadFailed]: exports.LibraryThumbnailFailureStage.PptxMedia,
    [exports.LibraryThumbnailFailureCode.PptxMediaTimeout]: exports.LibraryThumbnailFailureStage.PptxMedia,
    [exports.LibraryThumbnailFailureCode.PptxLayoutUnstable]: exports.LibraryThumbnailFailureStage.PptxLayout,
    [exports.LibraryThumbnailFailureCode.PresentationFailed]: exports.LibraryThumbnailFailureStage.Presentation,
    [exports.LibraryThumbnailFailureCode.PresentationTimeout]: exports.LibraryThumbnailFailureStage.Presentation,
    [exports.LibraryThumbnailFailureCode.CaptureTimeout]: exports.LibraryThumbnailFailureStage.Presentation,
    [exports.LibraryThumbnailFailureCode.CaptureEmpty]: exports.LibraryThumbnailFailureStage.Validation,
    [exports.LibraryThumbnailFailureCode.CaptureBlank]: exports.LibraryThumbnailFailureStage.Validation,
    [exports.LibraryThumbnailFailureCode.NativeThumbnailFailed]: exports.LibraryThumbnailFailureStage.NativeFallback,
    [exports.LibraryThumbnailFailureCode.NativeThumbnailEmpty]: exports.LibraryThumbnailFailureStage.NativeFallback,
    [exports.LibraryThumbnailFailureCode.NativeThumbnailBlank]: exports.LibraryThumbnailFailureStage.NativeFallback,
    [exports.LibraryThumbnailFailureCode.RequestCanceled]: exports.LibraryThumbnailFailureStage.Renderer,
    [exports.LibraryThumbnailFailureCode.Unknown]: exports.LibraryThumbnailFailureStage.Unknown,
};
const LIBRARY_THUMBNAIL_RETRYABLE_FAILURE_CODES = new Set([
    exports.LibraryThumbnailFailureCode.SourceReadFailed,
    exports.LibraryThumbnailFailureCode.RendererTimeout,
    exports.LibraryThumbnailFailureCode.RendererResponseInvalid,
    exports.LibraryThumbnailFailureCode.RenderGenerationMismatch,
    exports.LibraryThumbnailFailureCode.RendererFailed,
    exports.LibraryThumbnailFailureCode.DirectPngInvalid,
    exports.LibraryThumbnailFailureCode.PptxMediaLoadFailed,
    exports.LibraryThumbnailFailureCode.PptxMediaTimeout,
    exports.LibraryThumbnailFailureCode.PptxLayoutUnstable,
    exports.LibraryThumbnailFailureCode.PresentationFailed,
    exports.LibraryThumbnailFailureCode.PresentationTimeout,
    exports.LibraryThumbnailFailureCode.CaptureTimeout,
    exports.LibraryThumbnailFailureCode.CaptureEmpty,
    exports.LibraryThumbnailFailureCode.CaptureBlank,
    exports.LibraryThumbnailFailureCode.NativeThumbnailFailed,
    exports.LibraryThumbnailFailureCode.NativeThumbnailEmpty,
    exports.LibraryThumbnailFailureCode.NativeThumbnailBlank,
]);
const isLibraryThumbnailFailureRetryable = (code) => LIBRARY_THUMBNAIL_RETRYABLE_FAILURE_CODES.has(code);
exports.isLibraryThumbnailFailureRetryable = isLibraryThumbnailFailureRetryable;
const getLibraryThumbnailFailureStage = (code) => LIBRARY_THUMBNAIL_FAILURE_STAGE_BY_CODE[code];
exports.getLibraryThumbnailFailureStage = getLibraryThumbnailFailureStage;
exports.LibraryRasterThumbnailExtensions = [
    '.avif',
    '.bmp',
    '.gif',
    '.jpeg',
    '.jpg',
    '.png',
    '.webp',
];
const LIBRARY_RASTER_THUMBNAIL_EXTENSION_SET = new Set(exports.LibraryRasterThumbnailExtensions);
const isLibraryRasterThumbnailExtension = (extension) => (LIBRARY_RASTER_THUMBNAIL_EXTENSION_SET.has(extension.trim().toLowerCase()));
exports.isLibraryRasterThumbnailExtension = isLibraryRasterThumbnailExtension;
const LIBRARY_PRESENTED_THUMBNAIL_EXTENSION_SET = new Set([
    '.docx',
    '.htm',
    '.html',
    '.pptx',
]);
const isLibraryDirectPngThumbnailExtension = (extension) => {
    const normalized = extension.trim().toLowerCase();
    return (0, constants_1.getLibraryArtifactTypeForExtension)(normalized) !== null
        && !LIBRARY_PRESENTED_THUMBNAIL_EXTENSION_SET.has(normalized);
};
exports.isLibraryDirectPngThumbnailExtension = isLibraryDirectPngThumbnailExtension;
class LibraryThumbnailError extends Error {
    code;
    metrics;
    constructor(code, message, metrics) {
        super(message);
        this.name = 'LibraryThumbnailError';
        this.code = code;
        this.metrics = metrics;
    }
}
exports.LibraryThumbnailError = LibraryThumbnailError;
const getLibraryThumbnailFailureDetails = (error, fallbackCode = exports.LibraryThumbnailFailureCode.Unknown, fallbackMessage = 'Thumbnail rendering failed') => {
    const code = error instanceof LibraryThumbnailError ? error.code : fallbackCode;
    return {
        code,
        stage: (0, exports.getLibraryThumbnailFailureStage)(code),
        message: error instanceof Error ? error.message : fallbackMessage,
        metrics: error instanceof LibraryThumbnailError ? error.metrics : undefined,
    };
};
exports.getLibraryThumbnailFailureDetails = getLibraryThumbnailFailureDetails;
const withLibraryThumbnailErrorMetrics = (error, fallbackCode, metrics, fallbackMessage = 'Thumbnail rendering failed') => {
    const failure = (0, exports.getLibraryThumbnailFailureDetails)(error, fallbackCode, fallbackMessage);
    return new LibraryThumbnailError(failure.code, failure.message, { ...failure.metrics, ...metrics });
};
exports.withLibraryThumbnailErrorMetrics = withLibraryThumbnailErrorMetrics;
const createLibraryThumbnailRenderRequest = (fileName, contentBase64, width = exports.LibraryThumbnailDimensions.Width, height = exports.LibraryThumbnailDimensions.Height, renderGeneration = 0) => {
    const dotIndex = fileName.lastIndexOf('.');
    const extension = dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
    const artifactType = (0, constants_1.getLibraryArtifactTypeForExtension)(extension);
    if (!artifactType)
        return null;
    return {
        fileName,
        extension,
        artifactType,
        contentBase64,
        width,
        height,
        renderGeneration,
    };
};
exports.createLibraryThumbnailRenderRequest = createLibraryThumbnailRenderRequest;
//# sourceMappingURL=thumbnail.js.map
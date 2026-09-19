"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibraryThumbnailRenderer = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const thumbnail_1 = require("../../shared/library/thumbnail");
const libraryThumbnailPresentation_1 = require("./libraryThumbnailPresentation");
const libraryThumbnailValidation_1 = require("./libraryThumbnailValidation");
const LIBRARY_THUMBNAIL_PARTITION = 'library-thumbnail-renderer';
const SLOW_RENDER_THRESHOLD_MS = 4_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isRenderResult = (value) => (typeof value === 'object'
    && value !== null
    && typeof value.success === 'boolean');
class LibraryThumbnailRenderer {
    developmentServerUrl;
    productionHtmlPath;
    maxSourceBytes;
    renderTimeoutMs;
    captureTimeoutMs;
    presentationTimeoutMs;
    platform;
    window;
    renderGeneration = 0;
    constructor(options) {
        this.developmentServerUrl = options.developmentServerUrl;
        this.productionHtmlPath = options.productionHtmlPath;
        this.maxSourceBytes = options.maxSourceBytes ?? thumbnail_1.LibraryThumbnailLimits.MaxSourceBytes;
        this.renderTimeoutMs = options.renderTimeoutMs ?? thumbnail_1.LibraryThumbnailLimits.RenderTimeoutMs;
        this.captureTimeoutMs = options.captureTimeoutMs ?? thumbnail_1.LibraryThumbnailLimits.CaptureTimeoutMs;
        this.presentationTimeoutMs = options.presentationTimeoutMs
            ?? thumbnail_1.LibraryThumbnailLimits.PresentationTimeoutMs;
        this.platform = options.platform ?? process.platform;
    }
    render(filePath, size) {
        return this.renderWithRecovery(filePath, size);
    }
    dispose() {
        this.destroyCurrentWindow();
    }
    async renderWithRecovery(filePath, size) {
        let lastError;
        const extension = path_1.default.extname(filePath).toLowerCase();
        for (let attempt = 1; attempt <= thumbnail_1.LibraryThumbnailLimits.MaxRenderAttempts; attempt += 1) {
            try {
                return await this.renderNow(filePath, size);
            }
            catch (error) {
                lastError = error;
                this.destroyCurrentWindow();
                const failure = (0, thumbnail_1.getLibraryThumbnailFailureDetails)(error, thumbnail_1.LibraryThumbnailFailureCode.RendererFailed);
                if (attempt < thumbnail_1.LibraryThumbnailLimits.MaxRenderAttempts
                    && (0, thumbnail_1.isLibraryThumbnailFailureRetryable)(failure.code)) {
                    console.warn('[LibraryThumbnail] Retrying render in a fresh window', {
                        extension,
                        attempt,
                        strategy: (0, thumbnail_1.isLibraryDirectPngThumbnailExtension)(extension)
                            ? 'direct-canvas'
                            : 'isolated-presentation',
                        failureCode: failure.code,
                        failureStage: failure.stage,
                        sourceSizeBytes: failure.metrics?.sourceSizeBytes,
                        slideCount: failure.metrics?.slideCount,
                        imageCount: failure.metrics?.imageCount,
                    });
                    continue;
                }
                break;
            }
        }
        if (lastError instanceof Error)
            throw lastError;
        throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.RendererFailed, 'Thumbnail rendering failed');
    }
    async renderNow(filePath, size) {
        let stat;
        try {
            stat = await fs_1.default.promises.stat(filePath);
        }
        catch (error) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.SourceReadFailed, error instanceof Error ? error.message : 'Thumbnail source could not be read');
        }
        if (stat.size > this.maxSourceBytes) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.SourceTooLarge, 'File is too large for thumbnail rendering', { sourceSizeBytes: stat.size });
        }
        let content;
        try {
            content = await fs_1.default.promises.readFile(filePath);
        }
        catch (error) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.SourceReadFailed, error instanceof Error ? error.message : 'Thumbnail source could not be read', { sourceSizeBytes: stat.size });
        }
        this.renderGeneration += 1;
        const request = (0, thumbnail_1.createLibraryThumbnailRenderRequest)(path_1.default.basename(filePath), content.toString('base64'), size.width, size.height, this.renderGeneration);
        if (!request) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.UnsupportedFormat, 'Unsupported thumbnail format', { sourceSizeBytes: stat.size });
        }
        let rendererWindow;
        try {
            rendererWindow = await this.ensureWindow(size);
        }
        catch (error) {
            throw (0, thumbnail_1.withLibraryThumbnailErrorMetrics)(error, thumbnail_1.LibraryThumbnailFailureCode.RendererFailed, { sourceSizeBytes: stat.size });
        }
        const windowHeight = size.height + thumbnail_1.LibraryThumbnailPresentationStamp.Height;
        const [currentWidth, currentHeight] = rendererWindow.getContentSize();
        if (currentWidth !== size.width || currentHeight !== windowHeight) {
            rendererWindow.setContentSize(size.width, windowHeight, false);
        }
        const script = `window.renderLibraryThumbnail(${JSON.stringify(request)})`;
        let result;
        try {
            result = await this.withTimeout(rendererWindow.webContents.executeJavaScript(script, true), this.renderTimeoutMs, thumbnail_1.LibraryThumbnailFailureCode.RendererTimeout, 'Thumbnail rendering timed out');
        }
        catch (error) {
            throw (0, thumbnail_1.withLibraryThumbnailErrorMetrics)(error, thumbnail_1.LibraryThumbnailFailureCode.RendererFailed, { sourceSizeBytes: stat.size });
        }
        if (!isRenderResult(result)) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.RendererResponseInvalid, 'Invalid thumbnail renderer response', { sourceSizeBytes: stat.size });
        }
        if (result.renderGeneration !== request.renderGeneration) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.RenderGenerationMismatch, 'Thumbnail renderer generation mismatch', { sourceSizeBytes: stat.size, ...result.metrics });
        }
        if (!result.success) {
            throw new thumbnail_1.LibraryThumbnailError(result.failureCode ?? thumbnail_1.LibraryThumbnailFailureCode.RendererFailed, result.error || 'Thumbnail rendering failed', { sourceSizeBytes: stat.size, ...result.metrics });
        }
        const metrics = {
            renderDurationMs: result.metrics?.renderDurationMs ?? 0,
            sourceSizeBytes: stat.size,
            ...result.metrics,
        };
        if (metrics.renderDurationMs >= SLOW_RENDER_THRESHOLD_MS) {
            console.warn('[LibraryThumbnail] Slow renderer completion', {
                extension: request.extension,
                renderGeneration: request.renderGeneration,
                strategy: result.pngBase64 ? 'direct-canvas' : 'isolated-presentation',
                renderDurationMs: metrics.renderDurationMs,
                sourceSizeBytes: metrics.sourceSizeBytes,
                slideCount: metrics.slideCount,
                imageCount: metrics.imageCount,
            });
        }
        if (result.pngBase64 !== undefined) {
            if (!(0, thumbnail_1.isLibraryDirectPngThumbnailExtension)(request.extension)) {
                throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.RendererResponseInvalid, 'Unexpected direct thumbnail output', metrics);
            }
            return this.decodeDirectPng(result.pngBase64, metrics);
        }
        return this.captureRenderedPage(rendererWindow, size, request.extension, request.renderGeneration, metrics);
    }
    async captureRenderedPage(rendererWindow, size, extension, renderGeneration, metrics) {
        let image;
        if (this.platform === 'win32') {
            try {
                const presentedImage = await (0, libraryThumbnailPresentation_1.waitForCommittedThumbnailPresentation)(rendererWindow.webContents, this.presentationTimeoutMs, {
                    width: size.width,
                    height: size.height,
                    renderGeneration,
                });
                image = presentedImage.crop({
                    x: 0,
                    y: 0,
                    width: size.width,
                    height: size.height,
                });
            }
            catch (error) {
                throw (0, thumbnail_1.withLibraryThumbnailErrorMetrics)(error, thumbnail_1.LibraryThumbnailFailureCode.PresentationFailed, metrics ?? {});
            }
        }
        else {
            rendererWindow.webContents.invalidate();
            try {
                image = await this.withTimeout(rendererWindow.webContents.capturePage({
                    x: 0,
                    y: 0,
                    width: size.width,
                    height: size.height,
                }, {
                    stayHidden: true,
                    stayAwake: true,
                }), this.captureTimeoutMs, thumbnail_1.LibraryThumbnailFailureCode.CaptureTimeout, 'Thumbnail capture timed out');
            }
            catch (error) {
                throw (0, thumbnail_1.withLibraryThumbnailErrorMetrics)(error, thumbnail_1.LibraryThumbnailFailureCode.PresentationFailed, metrics ?? {});
            }
        }
        const capturedSize = image.getSize();
        if (image.isEmpty() || capturedSize.width <= 0 || capturedSize.height <= 0) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.CaptureEmpty, 'Thumbnail capture is empty', metrics);
        }
        const hasExpectedVisualContent = metrics?.sourceHasVisualContent === true
            || metrics?.domHasVisualContent === true
            || (metrics?.sourceHasVisualContent === undefined
                && metrics?.domHasVisualContent === undefined
                && metrics?.hasVisualContent === true);
        if (extension === '.pptx'
            && hasExpectedVisualContent
            && (0, libraryThumbnailValidation_1.isLikelyBlankThumbnailBitmap)(image.toBitmap())) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.CaptureBlank, 'Thumbnail capture is visually blank', metrics);
        }
        const png = image.toPNG();
        if (png.length === 0) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.CaptureEmpty, 'Thumbnail PNG is empty', metrics);
        }
        return png;
    }
    decodeDirectPng(pngBase64, metrics) {
        if (!pngBase64.trim()) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.DirectPngInvalid, 'Direct thumbnail output is empty', metrics);
        }
        const png = Buffer.from(pngBase64, 'base64');
        if (png.length <= PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
            throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.DirectPngInvalid, 'Direct thumbnail output is not a PNG', metrics);
        }
        return png;
    }
    async ensureWindow(size) {
        if (this.window && !this.window.isDestroyed())
            return this.window;
        const rendererWindow = new electron_1.BrowserWindow({
            width: size.width,
            height: size.height + thumbnail_1.LibraryThumbnailPresentationStamp.Height,
            show: false,
            frame: false,
            transparent: false,
            backgroundColor: '#F5F6F8',
            paintWhenInitiallyHidden: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                partition: LIBRARY_THUMBNAIL_PARTITION,
                backgroundThrottling: false,
                devTools: false,
                spellcheck: false,
                enableWebSQL: false,
                disableDialogs: true,
                navigateOnDragDrop: false,
            },
        });
        rendererWindow.setMenu(null);
        rendererWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        rendererWindow.webContents.on('will-navigate', event => {
            event.preventDefault();
        });
        rendererWindow.webContents.on('render-process-gone', () => {
            this.resetWindow(rendererWindow);
        });
        rendererWindow.on('closed', () => {
            if (this.window === rendererWindow)
                this.window = undefined;
        });
        try {
            if (this.developmentServerUrl) {
                const rendererUrl = new URL('/library-thumbnail.html', this.developmentServerUrl);
                await rendererWindow.loadURL(rendererUrl.href);
            }
            else {
                await rendererWindow.loadFile(this.productionHtmlPath);
            }
            const isReady = await rendererWindow.webContents.executeJavaScript('typeof window.renderLibraryThumbnail === "function"', true);
            if (isReady !== true) {
                throw new thumbnail_1.LibraryThumbnailError(thumbnail_1.LibraryThumbnailFailureCode.RendererFailed, 'Thumbnail renderer did not initialize');
            }
            this.window = rendererWindow;
            return rendererWindow;
        }
        catch (error) {
            rendererWindow.destroy();
            throw error;
        }
    }
    resetWindow(rendererWindow) {
        if (!rendererWindow.isDestroyed())
            rendererWindow.destroy();
        if (this.window === rendererWindow)
            this.window = undefined;
    }
    destroyCurrentWindow() {
        const rendererWindow = this.window;
        this.window = undefined;
        if (rendererWindow && !rendererWindow.isDestroyed())
            rendererWindow.destroy();
    }
    async withTimeout(promise, timeoutMs, failureCode, message) {
        let timer;
        try {
            return await Promise.race([
                promise,
                new Promise((_resolve, reject) => {
                    timer = setTimeout(() => reject(new thumbnail_1.LibraryThumbnailError(failureCode, message)), timeoutMs);
                }),
            ]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
}
exports.LibraryThumbnailRenderer = LibraryThumbnailRenderer;
//# sourceMappingURL=libraryThumbnailRenderer.js.map
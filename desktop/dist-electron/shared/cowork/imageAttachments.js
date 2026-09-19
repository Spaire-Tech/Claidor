"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoworkImageAttachmentRole = exports.COWORK_IMAGE_ATTACHMENT_PREVIEW_FALLBACK_MAX_BYTES = exports.COWORK_IMAGE_ATTACHMENT_MAX_BYTES = void 0;
exports.isBrowserAnnotationTransportImage = isBrowserAnnotationTransportImage;
exports.stripDataUrlPrefix = stripDataUrlPrefix;
exports.estimateBase64DecodedBytes = estimateBase64DecodedBytes;
exports.formatCoworkImageAttachmentLimit = formatCoworkImageAttachmentLimit;
exports.validateCoworkImageAttachmentSize = validateCoworkImageAttachmentSize;
exports.buildCoworkImageAttachmentPreview = buildCoworkImageAttachmentPreview;
exports.buildCoworkImageAttachmentPreviews = buildCoworkImageAttachmentPreviews;
exports.COWORK_IMAGE_ATTACHMENT_MAX_BYTES = 30 * 1000 * 1000;
exports.COWORK_IMAGE_ATTACHMENT_PREVIEW_FALLBACK_MAX_BYTES = 512 * 1024;
exports.CoworkImageAttachmentRole = {
    /** Browser-annotation screenshot attached only as model transport. */
    BrowserAnnotation: 'browser-annotation',
};
/** Historical transport images predate the role marker; match their fixed name pattern. */
const LEGACY_BROWSER_ANNOTATION_IMAGE_NAME_PREFIXES = [
    '浏览器注释截图-',
    'Browser annotation screenshot-',
];
function isBrowserAnnotationTransportImage(image) {
    if (image.role === exports.CoworkImageAttachmentRole.BrowserAnnotation)
        return true;
    const name = image.name ?? '';
    return LEGACY_BROWSER_ANNOTATION_IMAGE_NAME_PREFIXES.some(prefix => name.startsWith(prefix));
}
function stripDataUrlPrefix(value) {
    const match = /^data:[^;]+;base64,(.*)$/s.exec(value.trim());
    return match ? match[1] : value.trim();
}
function estimateBase64DecodedBytes(base64Value) {
    const base64 = stripDataUrlPrefix(base64Value).replace(/\s+/g, '');
    if (!base64)
        return 0;
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}
function formatCoworkImageAttachmentLimit(bytes = exports.COWORK_IMAGE_ATTACHMENT_MAX_BYTES) {
    return `${Math.floor(bytes / 1000 / 1000)}MB`;
}
function validateCoworkImageAttachmentSize(attachment, maxBytes = exports.COWORK_IMAGE_ATTACHMENT_MAX_BYTES) {
    const declaredSizeBytes = typeof attachment.sizeBytes === 'number' && Number.isFinite(attachment.sizeBytes)
        ? Math.max(0, Math.floor(attachment.sizeBytes))
        : 0;
    const estimatedSizeBytes = estimateBase64DecodedBytes(attachment.base64Data);
    const sizeBytes = Math.max(declaredSizeBytes, estimatedSizeBytes);
    return {
        ok: sizeBytes > 0 && sizeBytes <= maxBytes,
        sizeBytes,
        maxBytes,
    };
}
function buildCoworkImageAttachmentPreview(attachment) {
    const sizeValidation = validateCoworkImageAttachmentSize(attachment);
    const previewBase64Data = attachment.previewBase64Data?.trim();
    const previewMimeType = attachment.previewMimeType?.trim() || attachment.mimeType;
    if (previewBase64Data) {
        return {
            name: attachment.name,
            mimeType: previewMimeType,
            base64Data: stripDataUrlPrefix(previewBase64Data),
            originalMimeType: attachment.mimeType,
            originalSizeBytes: sizeValidation.sizeBytes,
            ...(attachment.localPath ? { localPath: attachment.localPath } : {}),
            ...(attachment.role ? { role: attachment.role } : {}),
            isPreview: true,
        };
    }
    if (sizeValidation.sizeBytes <= exports.COWORK_IMAGE_ATTACHMENT_PREVIEW_FALLBACK_MAX_BYTES) {
        return {
            name: attachment.name,
            mimeType: attachment.mimeType,
            base64Data: stripDataUrlPrefix(attachment.base64Data),
            originalMimeType: attachment.mimeType,
            originalSizeBytes: sizeValidation.sizeBytes,
            ...(attachment.localPath ? { localPath: attachment.localPath } : {}),
            ...(attachment.role ? { role: attachment.role } : {}),
            isPreview: true,
        };
    }
    return undefined;
}
function buildCoworkImageAttachmentPreviews(attachments) {
    const previews = attachments
        ?.map(buildCoworkImageAttachmentPreview)
        .filter((preview) => Boolean(preview));
    return previews?.length ? previews : undefined;
}
//# sourceMappingURL=imageAttachments.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeMediaGenerationParamsForLog = exports.applyMediaReferencesToGenerationParams = exports.MediaAttachmentRole = exports.MediaAttachmentKind = exports.MediaGenerationRequestType = void 0;
exports.MediaGenerationRequestType = {
    Image: 'image',
    Video: 'video',
};
exports.MediaAttachmentKind = {
    Image: 'image',
    Video: 'video',
    Audio: 'audio',
};
exports.MediaAttachmentRole = {
    FirstFrame: 'first_frame',
    LastFrame: 'last_frame',
    ReferenceImage: 'reference_image',
    ReferenceVideo: 'reference_video',
    ReferenceAudio: 'reference_audio',
};
const DATA_URL_RE = /^data:([^;,]+)[;,]/;
const getStringArray = (value) => (Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim().length > 0)
    : []);
const resolveReferencedMediaValue = (ref) => (ref.localPath || ref.dataUrl || ref.remoteUrl);
const isRecord = (value) => (Boolean(value) && typeof value === 'object' && !Array.isArray(value));
const buildReferenceValueByToken = (refs) => {
    const values = new Map();
    for (const ref of refs ?? []) {
        const token = ref.token.trim();
        const value = resolveReferencedMediaValue(ref);
        if (token && value) {
            values.set(token, value);
        }
    }
    return values;
};
const replaceMediaReferenceTokens = (value, valueByToken) => {
    if (typeof value === 'string') {
        return valueByToken.get(value.trim()) ?? value;
    }
    if (Array.isArray(value)) {
        return value.map(item => replaceMediaReferenceTokens(item, valueByToken));
    }
    if (!isRecord(value)) {
        return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        replaceMediaReferenceTokens(item, valueByToken),
    ]));
};
const dedupeValues = (values) => {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (seen.has(value))
            continue;
        seen.add(value);
        result.push(value);
    }
    return result;
};
const normalizeVideoImageRole = (role, isPrimary) => {
    if (role === exports.MediaAttachmentRole.FirstFrame || role === exports.MediaAttachmentRole.LastFrame) {
        return role;
    }
    return isPrimary ? exports.MediaAttachmentRole.FirstFrame : exports.MediaAttachmentRole.ReferenceImage;
};
const normalizeReferenceImageRole = () => exports.MediaAttachmentRole.ReferenceImage;
const removeProviderMedia = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }
    const next = { ...value };
    delete next.media;
    return next;
};
const removeConflictingImageInputs = (params) => {
    delete params.image;
    delete params.firstFrame;
    delete params.lastFrame;
    delete params.referenceImages;
    delete params.media;
    if (params.providerOptions) {
        params.providerOptions = removeProviderMedia(params.providerOptions);
    }
};
const applyMediaReferencesToGenerationParams = ({ mediaType, params, refs, }) => {
    const valueByToken = buildReferenceValueByToken(refs);
    const next = replaceMediaReferenceTokens(params, valueByToken);
    const resolvedRefs = (refs ?? [])
        .map(ref => ({ ref, value: valueByToken.get(ref.token.trim()) }))
        .filter((item) => Boolean(item.value));
    const imageRefs = resolvedRefs.filter(item => item.ref.mediaType === exports.MediaAttachmentKind.Image);
    const videoRefs = resolvedRefs.filter(item => item.ref.mediaType === exports.MediaAttachmentKind.Video);
    if (imageRefs.length > 0) {
        removeConflictingImageInputs(next);
        if (mediaType === exports.MediaGenerationRequestType.Video) {
            const referencedImages = dedupeValues(imageRefs.map(item => item.value));
            const referencedRoles = imageRefs.map((item, index) => normalizeVideoImageRole(item.ref.role, index === 0));
            next.images = referencedImages;
            next.imageRoles = referencedRoles.slice(0, referencedImages.length);
        }
        else {
            const referencedImages = dedupeValues(imageRefs.map(item => item.value));
            const referencedRoles = imageRefs.map(() => normalizeReferenceImageRole());
            next.images = referencedImages;
            next.imageRoles = referencedRoles.slice(0, referencedImages.length);
        }
    }
    if (videoRefs.length > 0) {
        const referencedVideos = videoRefs.map(item => item.value);
        const existingVideos = getStringArray(next.videos);
        const existingVideoRoles = getStringArray(next.videoRoles);
        next.videos = dedupeValues([...referencedVideos, ...existingVideos]);
        next.videoRoles = [
            ...videoRefs.map(item => item.ref.role || exports.MediaAttachmentRole.ReferenceVideo),
            ...existingVideoRoles,
        ].slice(0, next.videos.length);
    }
    return next;
};
exports.applyMediaReferencesToGenerationParams = applyMediaReferencesToGenerationParams;
const summarizeMediaGenerationParamsForLog = (value) => {
    if (typeof value === 'string') {
        const match = DATA_URL_RE.exec(value);
        if (match) {
            return `[data-url:${match[1]},length=${value.length}]`;
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(item => (0, exports.summarizeMediaGenerationParamsForLog)(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        (0, exports.summarizeMediaGenerationParamsForLog)(item),
    ]));
};
exports.summarizeMediaGenerationParamsForLog = summarizeMediaGenerationParamsForLog;
//# sourceMappingURL=mediaGenerationReferences.js.map
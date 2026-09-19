"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSkinAssetUrl = buildSkinAssetUrl;
exports.parseSkinProtocolUrl = parseSkinProtocolUrl;
exports.createSkinProtocolResponse = createSkinProtocolResponse;
exports.createSkinProtocolHandler = createSkinProtocolHandler;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const stream_1 = require("stream");
const constants_1 = require("../../shared/skin/constants");
const SkinProtocolMethod = {
    Get: 'GET',
    Head: 'HEAD',
};
const SKIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_MIME_TYPES = new Set(Object.values(constants_1.SkinAssetMimeType));
function isSkinAssetSlot(value) {
    return constants_1.SKIN_ASSET_SLOTS.includes(value);
}
function decodePathSegment(value) {
    try {
        const decoded = decodeURIComponent(value);
        if (decoded.length === 0 ||
            decoded === '.' ||
            decoded === '..' ||
            decoded.includes('/') ||
            decoded.includes('\\') ||
            decoded.includes('\0')) {
            return null;
        }
        return decoded;
    }
    catch {
        return null;
    }
}
function buildSkinAssetUrl(skinId, slot, contentHash) {
    if (!SKIN_ID_PATTERN.test(skinId) || !isSkinAssetSlot(slot)) {
        throw new TypeError('Invalid skin protocol asset identity');
    }
    if (contentHash !== undefined && !CONTENT_HASH_PATTERN.test(contentHash)) {
        throw new TypeError('Invalid skin protocol content hash');
    }
    const url = new URL(`${constants_1.SkinProtocol.Scheme}://${constants_1.SkinProtocol.Host}`);
    url.pathname = `/${encodeURIComponent(skinId)}/${encodeURIComponent(slot)}`;
    if (contentHash)
        url.searchParams.set('v', contentHash);
    return url.toString();
}
function parseSkinProtocolUrl(requestUrl) {
    let url;
    try {
        url = new URL(requestUrl);
    }
    catch {
        return null;
    }
    if (url.protocol !== `${constants_1.SkinProtocol.Scheme}:` ||
        url.hostname !== constants_1.SkinProtocol.Host ||
        url.username !== '' ||
        url.password !== '' ||
        url.port !== '' ||
        url.hash !== '') {
        return null;
    }
    const pathSegments = url.pathname.split('/');
    if (pathSegments.length !== 3 || pathSegments[0] !== '')
        return null;
    const skinId = decodePathSegment(pathSegments[1]);
    const slot = decodePathSegment(pathSegments[2]);
    if (!skinId || !SKIN_ID_PATTERN.test(skinId) || !slot || !isSkinAssetSlot(slot))
        return null;
    const queryEntries = [...url.searchParams.entries()];
    if (queryEntries.length > 1 || (queryEntries.length === 1 && queryEntries[0][0] !== 'v'))
        return null;
    const contentHash = queryEntries.length === 1 ? queryEntries[0][1] : undefined;
    if (contentHash !== undefined && !CONTENT_HASH_PATTERN.test(contentHash))
        return null;
    return {
        skinId,
        slot,
        ...(contentHash === undefined ? {} : { contentHash }),
    };
}
function resolvePathWithinRoot(rootDir, relativePath) {
    if (!path_1.default.isAbsolute(rootDir) ||
        path_1.default.isAbsolute(relativePath) ||
        relativePath.includes('\\') ||
        relativePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
        return null;
    }
    const resolved = path_1.default.resolve(rootDir, ...relativePath.split('/'));
    const relative = path_1.default.relative(rootDir, resolved);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path_1.default.sep}`) || path_1.default.isAbsolute(relative)) {
        return null;
    }
    return resolved;
}
function isPathWithinRoot(rootDir, filePath) {
    const relative = path_1.default.relative(rootDir, filePath);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path_1.default.sep}`) && !path_1.default.isAbsolute(relative);
}
function notFoundResponse() {
    return new Response(null, {
        status: 404,
        headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
async function createSkinProtocolResponse(request, options) {
    if (request.method !== SkinProtocolMethod.Get && request.method !== SkinProtocolMethod.Head) {
        return new Response(null, {
            status: 405,
            headers: {
                Allow: `${SkinProtocolMethod.Get}, ${SkinProtocolMethod.Head}`,
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    }
    const parsed = parseSkinProtocolUrl(request.url);
    if (!parsed || !path_1.default.isAbsolute(options.rootDir))
        return notFoundResponse();
    try {
        const asset = await options.resolveAsset(parsed.skinId, parsed.slot);
        if (!asset ||
            !CONTENT_HASH_PATTERN.test(asset.contentHash) ||
            !ALLOWED_MIME_TYPES.has(asset.mimeType) ||
            (parsed.contentHash !== undefined && parsed.contentHash !== asset.contentHash)) {
            return notFoundResponse();
        }
        const rootDir = path_1.default.resolve(options.rootDir);
        const filePath = resolvePathWithinRoot(rootDir, asset.relativePath);
        if (!filePath)
            return notFoundResponse();
        const [realRootDir, fileStat] = await Promise.all([
            fs_1.default.promises.realpath(rootDir),
            fs_1.default.promises.lstat(filePath),
        ]);
        if (!fileStat.isFile())
            return notFoundResponse();
        const realFilePath = await fs_1.default.promises.realpath(filePath);
        if (!isPathWithinRoot(realRootDir, realFilePath))
            return notFoundResponse();
        const headers = {
            'Cache-Control': parsed.contentHash
                ? 'private, max-age=31536000, immutable'
                : 'no-store',
            'Content-Length': String(fileStat.size),
            'Content-Type': asset.mimeType,
            ETag: `"sha256-${asset.contentHash}"`,
            'X-Content-Type-Options': 'nosniff',
        };
        return new Response(request.method === SkinProtocolMethod.Head
            ? null
            : stream_1.Readable.toWeb(fs_1.default.createReadStream(realFilePath)), { status: 200, headers });
    }
    catch {
        return notFoundResponse();
    }
}
function createSkinProtocolHandler(options) {
    return request => createSkinProtocolResponse(request, options);
}
//# sourceMappingURL=skinProtocol.js.map
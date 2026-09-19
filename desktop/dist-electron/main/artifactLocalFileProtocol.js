"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalFileProtocolPath = getLocalFileProtocolPath;
exports.getLocalFileMimeType = getLocalFileMimeType;
exports.parseByteRange = parseByteRange;
exports.createLocalFileProtocolResponse = createLocalFileProtocolResponse;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const stream_1 = require("stream");
const LOCAL_FILE_MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
};
function safeDecodeURIComponent(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
function stripMediaTokenPrefix(filePath) {
    const mediaMatch = filePath.match(/(?:^|[\\/])MEDIA:\s*(.+)$/i);
    if (mediaMatch) {
        return mediaMatch[1].trim();
    }
    return filePath.replace(/^MEDIA:\s*/i, '').trim();
}
function getLocalFileProtocolPath(requestUrl) {
    const url = new URL(requestUrl);
    let filePath = safeDecodeURIComponent(url.pathname);
    filePath = stripMediaTokenPrefix(filePath);
    if (process.platform === 'win32' && /^[A-Za-z]$/.test(url.host) && filePath.startsWith('/')) {
        return `${url.host}:${filePath}`;
    }
    if (url.host && process.platform !== 'win32') {
        filePath = stripMediaTokenPrefix(`/${safeDecodeURIComponent(url.host)}${filePath}`);
    }
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1);
    }
    return filePath;
}
function getLocalFileMimeType(filePath) {
    return LOCAL_FILE_MIME_BY_EXT[path_1.default.extname(filePath).toLowerCase()] || 'application/octet-stream';
}
function parseSingleByteRange(rangeText, fileSize) {
    const match = rangeText.match(/^(\d*)\s*-\s*(\d*)$/);
    if (!match)
        return null;
    const [, startText, endText] = match;
    if (!startText && !endText)
        return null;
    if (!startText) {
        const suffixLength = Number(endText);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0)
            return null;
        return {
            start: Math.max(fileSize - suffixLength, 0),
            end: fileSize - 1,
        };
    }
    const start = Number(startText);
    const end = endText ? Number(endText) : fileSize - 1;
    if (!Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        start >= fileSize) {
        return null;
    }
    return {
        start,
        end: Math.min(end, fileSize - 1),
    };
}
function parseByteRange(rangeHeader, fileSize) {
    if (!rangeHeader || fileSize <= 0)
        return null;
    const separatorIndex = rangeHeader.indexOf('=');
    if (separatorIndex < 0)
        return null;
    const unit = rangeHeader.slice(0, separatorIndex).trim().toLowerCase();
    if (unit !== 'bytes')
        return null;
    const rangeSet = rangeHeader.slice(separatorIndex + 1);
    const rangeTexts = rangeSet.split(',').map(range => range.trim()).filter(Boolean);
    for (const rangeText of rangeTexts) {
        const range = parseSingleByteRange(rangeText, fileSize);
        if (range)
            return range;
    }
    return null;
}
function buildLocalFileBaseHeaders(filePath, size, mimeType) {
    const filename = encodeURIComponent(path_1.default.basename(filePath));
    return {
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'Content-Disposition': `inline; filename*=UTF-8''${filename}`,
        'Content-Length': String(size),
        'Content-Type': mimeType,
    };
}
async function createLocalFileProtocolResponse(request) {
    try {
        const filePath = getLocalFileProtocolPath(request.url);
        const stat = await fs_1.default.promises.stat(filePath);
        if (!stat.isFile()) {
            return new Response('Not found', { status: 404 });
        }
        const mimeType = getLocalFileMimeType(filePath);
        const baseHeaders = buildLocalFileBaseHeaders(filePath, stat.size, mimeType);
        const rangeHeader = request.headers.get('range');
        const range = parseByteRange(rangeHeader, stat.size);
        if (rangeHeader && !range) {
            return new Response(null, {
                status: 416,
                headers: {
                    ...baseHeaders,
                    'Content-Length': '0',
                    'Content-Range': `bytes */${stat.size}`,
                },
            });
        }
        if (range) {
            const contentLength = range.end - range.start + 1;
            return new Response(request.method === 'HEAD'
                ? null
                : stream_1.Readable.toWeb(fs_1.default.createReadStream(filePath, { start: range.start, end: range.end })), {
                status: 206,
                headers: {
                    ...baseHeaders,
                    'Content-Length': String(contentLength),
                    'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
                },
            });
        }
        return new Response(request.method === 'HEAD'
            ? null
            : stream_1.Readable.toWeb(fs_1.default.createReadStream(filePath)), {
            status: 200,
            headers: baseHeaders,
        });
    }
    catch (error) {
        console.warn('[ArtifactPreview] local file request failed:', error);
        return new Response('Not found', { status: 404 });
    }
}
//# sourceMappingURL=artifactLocalFileProtocol.js.map
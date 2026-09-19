"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packageArtifactFile = packageArtifactFile;
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("dns/promises"));
const fs_1 = __importDefault(require("fs"));
const net_1 = __importDefault(require("net"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const promises_2 = require("stream/promises");
const url_1 = require("url");
const util_1 = require("util");
const yazl_1 = __importDefault(require("yazl"));
const constants_1 = require("../../../shared/htmlShare/constants");
const htmlShareError_1 = require("./htmlShareError");
const MAX_CLIENT_ARCHIVE_BYTES = 22 * 1024 * 1024;
const MAX_CLIENT_SINGLE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_CLIENT_DOCUMENT_ARCHIVE_BYTES = 105 * 1024 * 1024;
const MAX_CLIENT_DOCUMENT_FILE_BYTES = 100 * 1024 * 1024;
const MAX_CLIENT_TEXT_ARCHIVE_BYTES = 22 * 1024 * 1024;
const MAX_CLIENT_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_CLIENT_TEXT_ASSET_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CLIENT_TEXT_TOTAL_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_CLIENT_TEXT_ASSET_COUNT = 100;
const MAX_REMOTE_REDIRECTS = 3;
const MARKDOWN_ASSET_PREFIX = '_lobster_assets/';
const MARKDOWN_MANIFEST_FILE = '_lobster_share_manifest.json';
const INVALID_ARCHIVE_FILE_NAME_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const MARKDOWN_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);
const MERMAID_EXTENSIONS = new Set(['mmd', 'mermaid']);
const DOCUMENT_CONTENT_TYPES = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
    csv: 'text/csv;charset=UTF-8',
    tsv: 'text/tab-separated-values;charset=UTF-8',
};
const IMAGE_CONTENT_TYPES = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
};
function extensionFromName(fileName) {
    if (!fileName)
        return '';
    const ext = path_1.default.extname(fileName).replace(/^\./, '').toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
}
function cleanFileName(fileName, fallback) {
    const baseName = path_1.default.basename(fileName.replace(/\\/g, '/')).normalize('NFC').trim();
    const cleaned = baseName.replace(INVALID_ARCHIVE_FILE_NAME_CHARS, '_');
    return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}
function imageMagicExtension(bytes) {
    if (bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a) {
        return 'png';
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'jpg';
    }
    if (bytes.length >= 6 &&
        (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' ||
            bytes.subarray(0, 6).toString('ascii') === 'GIF89a')) {
        return 'gif';
    }
    if (bytes.length >= 12 &&
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
        return 'webp';
    }
    return null;
}
function contentTypeForImageExtension(extension) {
    if (extension === 'jpg' || extension === 'jpeg')
        return 'image/jpeg';
    return `image/${extension}`;
}
function parseDataUrl(dataUrl) {
    const match = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/i);
    if (!match)
        return null;
    const contentType = match[1].toLowerCase();
    const isBase64 = Boolean(match[2]);
    const payload = match[3];
    return {
        contentType,
        bytes: isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8'),
    };
}
function isPrivateIPv4(address) {
    const parts = address.split('.').map(part => Number(part));
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }
    const [a, b] = parts;
    return (a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        a >= 224);
}
function isPrivateIPv6(address) {
    const value = address.toLowerCase();
    return (value === '::1' ||
        value.startsWith('fc') ||
        value.startsWith('fd') ||
        value.startsWith('fe80') ||
        value.startsWith('::ffff:127.') ||
        value.startsWith('::ffff:10.') ||
        value.startsWith('::ffff:192.168.') ||
        value.startsWith('::ffff:169.254.'));
}
async function assertSafeRemoteImageUrl(url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Only HTTP(S) image URLs can be shared.');
    }
    if (url.username || url.password) {
        throw new Error('Image URLs with credentials cannot be shared.');
    }
    const hostname = url.hostname;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        throw new Error('Localhost image URLs cannot be shared.');
    }
    const directIpVersion = net_1.default.isIP(hostname);
    const addresses = directIpVersion
        ? [{ address: hostname, family: directIpVersion }]
        : await promises_1.default.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) {
        throw new Error('Image URL host could not be resolved.');
    }
    for (const address of addresses) {
        if (address.family === 4 && isPrivateIPv4(address.address)) {
            throw new Error('Private network image URLs cannot be shared.');
        }
        if (address.family === 6 && isPrivateIPv6(address.address)) {
            throw new Error('Private network image URLs cannot be shared.');
        }
    }
}
async function downloadRemoteImage(remoteUrl) {
    let currentUrl = new URL(remoteUrl);
    for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
        await assertSafeRemoteImageUrl(currentUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try {
            const response = await fetch(currentUrl, {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
            });
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location || redirectCount === MAX_REMOTE_REDIRECTS) {
                    throw new Error('Image URL redirected too many times.');
                }
                currentUrl = new URL(location, currentUrl);
                continue;
            }
            if (!response.ok) {
                throw new Error(`Image download failed with HTTP ${response.status}.`);
            }
            const declaredLength = Number(response.headers.get('content-length') || '0');
            if (declaredLength > MAX_CLIENT_SINGLE_FILE_BYTES) {
                throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.FileTooLarge, 'Image exceeds the share size limit.', {
                    fileName: cleanFileName(path_1.default.basename(currentUrl.pathname), 'image'),
                    limitBytes: MAX_CLIENT_SINGLE_FILE_BYTES,
                    actualBytes: declaredLength,
                });
            }
            const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (contentType && !IMAGE_CONTENT_TYPES[contentType]) {
                throw new Error('Remote URL did not return a supported image type.');
            }
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > MAX_CLIENT_SINGLE_FILE_BYTES) {
                throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.FileTooLarge, 'Image exceeds the share size limit.', {
                    fileName: cleanFileName(path_1.default.basename(currentUrl.pathname), 'image'),
                    limitBytes: MAX_CLIENT_SINGLE_FILE_BYTES,
                    actualBytes: bytes.length,
                });
            }
            return {
                bytes,
                contentType,
                fileName: cleanFileName(path_1.default.basename(currentUrl.pathname), 'image'),
            };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    throw new Error('Image URL redirected too many times.');
}
async function loadArtifactFile(input) {
    if (input.filePath) {
        const resolvedPath = path_1.default.resolve(input.filePath);
        const stat = await fs_1.default.promises.stat(resolvedPath);
        if (!stat.isFile()) {
            throw new Error('Shared artifact file does not exist.');
        }
        const maxBytes = input.sourceType === constants_1.HtmlShareSourceType.DocumentFile
            ? MAX_CLIENT_DOCUMENT_FILE_BYTES
            : MAX_CLIENT_SINGLE_FILE_BYTES;
        if (stat.size > maxBytes) {
            throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.FileTooLarge, 'Artifact exceeds the share size limit.', {
                fileName: input.fileName || path_1.default.basename(resolvedPath),
                limitBytes: maxBytes,
                actualBytes: stat.size,
            });
        }
        return {
            bytes: await fs_1.default.promises.readFile(resolvedPath),
            fileName: input.fileName || path_1.default.basename(resolvedPath),
            filePath: resolvedPath,
        };
    }
    if (input.sourceType === constants_1.HtmlShareSourceType.ImageFile) {
        const content = input.content?.trim();
        const dataUrl = content?.startsWith('data:') ? parseDataUrl(content) : null;
        if (dataUrl) {
            return {
                bytes: dataUrl.bytes,
                contentType: dataUrl.contentType,
                fileName: input.fileName || 'image',
            };
        }
        const remoteUrl = input.remoteUrl || (/^https?:\/\//i.test(content || '') ? content : '');
        if (remoteUrl) {
            return downloadRemoteImage(remoteUrl);
        }
        throw new Error('Current image preview content cannot be shared.');
    }
    if (input.sourceType === constants_1.HtmlShareSourceType.DocumentFile) {
        if (input.remoteUrl) {
            throw new Error('Remote document URLs cannot be shared.');
        }
        const content = input.content?.trim();
        const dataUrl = content?.startsWith('data:') ? parseDataUrl(content) : null;
        if (!dataUrl) {
            throw new Error('Current document preview content cannot be shared.');
        }
        return {
            bytes: dataUrl.bytes,
            contentType: dataUrl.contentType,
            fileName: input.fileName || 'document',
        };
    }
    if (input.sourceType === constants_1.HtmlShareSourceType.MarkdownFile ||
        input.sourceType === constants_1.HtmlShareSourceType.MermaidFile) {
        if (input.remoteUrl) {
            throw new Error('Remote text URLs cannot be shared.');
        }
        const content = input.content ?? '';
        if (!content.trim()) {
            throw new Error('Current text preview content cannot be shared.');
        }
        return {
            bytes: Buffer.from(content, 'utf8'),
            fileName: input.fileName || (input.sourceType === constants_1.HtmlShareSourceType.MarkdownFile ? 'document.md' : 'diagram.mmd'),
        };
    }
    if (input.remoteUrl) {
        throw new Error('Remote SVG URLs cannot be shared.');
    }
    const content = input.content?.trim();
    if (!content) {
        throw new Error('Current SVG preview content cannot be shared.');
    }
    const dataUrl = content.startsWith('data:') ? parseDataUrl(content) : null;
    return {
        bytes: dataUrl ? dataUrl.bytes : Buffer.from(content, 'utf8'),
        contentType: dataUrl?.contentType || 'image/svg+xml',
        fileName: input.fileName || 'image.svg',
    };
}
function normalizeImageFile(loaded) {
    const magicExtension = imageMagicExtension(loaded.bytes);
    const contentTypeExtension = loaded.contentType ? IMAGE_CONTENT_TYPES[loaded.contentType] : undefined;
    const nameExtension = extensionFromName(loaded.fileName);
    const expectedExtension = nameExtension || contentTypeExtension || magicExtension;
    if (!magicExtension || !expectedExtension || !IMAGE_EXTENSIONS.has(expectedExtension)) {
        throw new Error('Current image type is not supported for sharing.');
    }
    if (expectedExtension !== magicExtension && !(expectedExtension === 'jpeg' && magicExtension === 'jpg')) {
        throw new Error('Image extension does not match the file content.');
    }
    const fileName = cleanFileName(extensionFromName(loaded.fileName) ? loaded.fileName : `image.${magicExtension}`, `image.${magicExtension}`);
    return {
        bytes: loaded.bytes,
        fileName,
        contentType: contentTypeForImageExtension(magicExtension),
    };
}
function assertSafeSvgClientSide(bytes) {
    const text = bytes.toString('utf8');
    const normalized = text
        .replace(/\sxmlns(?::[a-z0-9_-]+)?\s*=\s*(['"])https?:\/\/www\.w3\.org\/[^'"]+\1/gi, '')
        .toLowerCase();
    if (!normalized.includes('<svg') ||
        normalized.includes('<script') ||
        /\son[a-z]+\s*=/.test(normalized) ||
        normalized.includes('javascript:') ||
        normalized.includes('<foreignobject') ||
        normalized.includes('<image') ||
        normalized.includes('<use') ||
        hasUnsafeSvgReference(normalized) ||
        normalized.includes('<!doctype')) {
        throw new Error('SVG contains unsafe content and cannot be shared.');
    }
}
function hasUnsafeSvgReference(value) {
    const normalized = value.trim().toLowerCase();
    const compact = normalized.replace(/\s+/g, '');
    return (compact.includes('javascript:') ||
        compact.includes('data:') ||
        normalized.includes('http://') ||
        normalized.includes('https://') ||
        normalized.includes('//') ||
        normalized.includes('@import') ||
        hasUnsafeSvgUrlFunction(normalized));
}
function hasUnsafeSvgUrlFunction(value) {
    let index = 0;
    while ((index = value.indexOf('url(', index)) >= 0) {
        const start = index + 4;
        const end = value.indexOf(')', start);
        if (end < 0)
            return true;
        let reference = value.slice(start, end).trim();
        if ((reference.startsWith('"') && reference.endsWith('"')) ||
            (reference.startsWith("'") && reference.endsWith("'"))) {
            reference = reference.slice(1, -1).trim();
        }
        if (!reference.startsWith('#') || reference.length <= 1)
            return true;
        index = end + 1;
    }
    return false;
}
function normalizeSvgFile(loaded) {
    const nameExtension = extensionFromName(loaded.fileName);
    if (nameExtension && nameExtension !== 'svg') {
        throw new Error('Only SVG files can be shared as SVG.');
    }
    assertSafeSvgClientSide(loaded.bytes);
    const cleanedFileName = cleanFileName(loaded.fileName || 'image.svg', 'image.svg');
    return {
        bytes: loaded.bytes,
        fileName: extensionFromName(cleanedFileName)
            ? cleanedFileName.replace(/\.[^.]+$/, '.svg')
            : `${cleanedFileName}.svg`,
        contentType: 'image/svg+xml',
    };
}
function normalizeDocumentFile(loaded) {
    const extension = extensionFromName(loaded.fileName);
    if (!extension || !DOCUMENT_CONTENT_TYPES[extension]) {
        throw new Error('Current document type is not supported for sharing.');
    }
    if (loaded.bytes.length > MAX_CLIENT_DOCUMENT_FILE_BYTES) {
        throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.FileTooLarge, 'Artifact exceeds the share size limit.', {
            fileName: loaded.fileName,
            limitBytes: MAX_CLIENT_DOCUMENT_FILE_BYTES,
            actualBytes: loaded.bytes.length,
        });
    }
    if (!matchesDocumentMagic(extension, loaded.bytes)) {
        throw new Error('Document extension does not match the file content.');
    }
    const fileName = cleanFileName(loaded.fileName || `document.${extension}`, `document.${extension}`);
    return {
        bytes: loaded.bytes,
        fileName: extensionFromName(fileName) ? fileName : `${fileName}.${extension}`,
        contentType: DOCUMENT_CONTENT_TYPES[extension],
    };
}
function decodeUtf8(bytes) {
    try {
        return new util_1.TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        throw new Error('Text artifact must be valid UTF-8.');
    }
}
function assertTextContent(bytes) {
    const text = decodeUtf8(bytes);
    if (text.includes('\u0000')) {
        throw new Error('Text artifact contains unsupported binary content.');
    }
    if (bytes.length > MAX_CLIENT_TEXT_FILE_BYTES) {
        throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.FileTooLarge, 'Text artifact exceeds the share size limit.', {
            limitBytes: MAX_CLIENT_TEXT_FILE_BYTES,
            actualBytes: bytes.length,
        });
    }
    return text;
}
function normalizeMarkdownFile(loaded) {
    assertTextContent(loaded.bytes);
    const nameExtension = extensionFromName(loaded.fileName);
    if (nameExtension && !MARKDOWN_EXTENSIONS.has(nameExtension)) {
        throw new Error('Only Markdown files can be shared as Markdown.');
    }
    const fileName = cleanFileName(loaded.fileName || 'document.md', 'document.md');
    return {
        ...loaded,
        fileName: MARKDOWN_EXTENSIONS.has(extensionFromName(fileName)) ? fileName : `${fileName}.md`,
        contentType: 'text/markdown;charset=UTF-8',
    };
}
function normalizeMermaidFile(loaded) {
    assertTextContent(loaded.bytes);
    const nameExtension = extensionFromName(loaded.fileName);
    if (nameExtension && !MERMAID_EXTENSIONS.has(nameExtension)) {
        throw new Error('Only Mermaid files can be shared as Mermaid.');
    }
    const fileName = cleanFileName(loaded.fileName || 'diagram.mmd', 'diagram.mmd');
    return {
        ...loaded,
        fileName: MERMAID_EXTENSIONS.has(extensionFromName(fileName)) ? fileName : `${fileName}.mmd`,
        contentType: 'text/plain;charset=UTF-8',
    };
}
function isRemoteOrUnsupportedMarkdownUrl(url) {
    const value = url.trim();
    if (!value || value.startsWith('#') || value.startsWith('//'))
        return true;
    if (/^[A-Za-z]:[\\/]/.test(value))
        return true;
    if (value.startsWith('/') || value.startsWith('\\'))
        return true;
    if (/^file:/i.test(value))
        return false;
    return /^[a-z][a-z0-9+.-]*:/i.test(value);
}
function resolveMarkdownAssetPath(cleanedUrl, baseDir) {
    if (/^file:/i.test(cleanedUrl)) {
        try {
            const url = new URL(cleanedUrl);
            const hostname = url.hostname.toLowerCase();
            if (url.protocol !== 'file:' || (hostname && hostname !== 'localhost')) {
                return { reason: 'unsupported_or_external_reference' };
            }
            const absolutePath = (0, url_1.fileURLToPath)(url);
            return {
                absolutePath,
                displayUrl: path_1.default.basename(absolutePath),
            };
        }
        catch {
            return { reason: 'invalid_asset_url_encoding' };
        }
    }
    const decodedUrl = safeDecodeMarkdownUrl(cleanedUrl);
    if (!decodedUrl) {
        return { reason: 'invalid_asset_url_encoding' };
    }
    return {
        absolutePath: path_1.default.resolve(baseDir, decodedUrl),
        displayUrl: cleanedUrl,
    };
}
function cleanMarkdownUrl(rawUrl) {
    let value = rawUrl.trim();
    if ((value.startsWith('<') && value.endsWith('>')) ||
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).trim();
    }
    const hashIndex = value.indexOf('#');
    const queryIndex = value.indexOf('?');
    const endIndexes = [hashIndex, queryIndex].filter(index => index >= 0);
    if (endIndexes.length) {
        value = value.slice(0, Math.min(...endIndexes));
    }
    return value;
}
function safeDecodeMarkdownUrl(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return null;
    }
}
function markdownImageUrls(markdown) {
    const urls = [];
    const inlinePattern = /!\[[^\]]*]\(([^)\n]+)\)/g;
    let match;
    while ((match = inlinePattern.exec(markdown)) !== null) {
        const destination = match[1].trim().split(/\s+["'(]/)[0];
        if (destination)
            urls.push(destination);
    }
    const definitions = new Map();
    const definitionPattern = /^[ \t]{0,3}\[([^\]]+)]:[ \t]*(\S+)/gm;
    while ((match = definitionPattern.exec(markdown)) !== null) {
        definitions.set(match[1].trim().toLowerCase(), match[2]);
    }
    const referencePattern = /!\[([^\]]*)]\[([^\]]*)]/g;
    while ((match = referencePattern.exec(markdown)) !== null) {
        const key = (match[2] || match[1]).trim().toLowerCase();
        const destination = definitions.get(key);
        if (destination)
            urls.push(destination);
    }
    return Array.from(new Set(urls));
}
async function collectMarkdownLocalAssets(markdown, filePath) {
    if (!filePath) {
        return { assets: [], omittedAssets: [] };
    }
    const baseDir = path_1.default.dirname(path_1.default.resolve(filePath));
    const allowedRoot = await fs_1.default.promises.realpath(baseDir);
    const assets = [];
    const omittedAssets = [];
    const packedByRealPath = new Map();
    for (const rawUrl of markdownImageUrls(markdown)) {
        const originalUrl = rawUrl.trim();
        const cleanedUrl = cleanMarkdownUrl(originalUrl);
        if (isRemoteOrUnsupportedMarkdownUrl(cleanedUrl)) {
            omittedAssets.push({ originalUrl, reason: 'unsupported_or_external_reference' });
            continue;
        }
        const resolved = resolveMarkdownAssetPath(cleanedUrl, baseDir);
        if (!resolved.absolutePath) {
            omittedAssets.push({ originalUrl, reason: resolved.reason || 'unsupported_or_external_reference' });
            continue;
        }
        const extension = extensionFromName(resolved.absolutePath);
        if (!extension || !MARKDOWN_IMAGE_EXTENSIONS.has(extension)) {
            omittedAssets.push({ originalUrl, reason: 'unsupported_asset_type' });
            continue;
        }
        let realPath = '';
        try {
            realPath = await fs_1.default.promises.realpath(resolved.absolutePath);
        }
        catch {
            omittedAssets.push({ originalUrl, reason: 'asset_not_found' });
            continue;
        }
        const relativeToRoot = path_1.default.relative(allowedRoot, realPath);
        if (relativeToRoot.startsWith('..') || path_1.default.isAbsolute(relativeToRoot)) {
            omittedAssets.push({ originalUrl, reason: 'asset_outside_allowed_root' });
            continue;
        }
        const stat = await fs_1.default.promises.stat(realPath);
        if (!stat.isFile()) {
            omittedAssets.push({ originalUrl, reason: 'asset_not_file' });
            continue;
        }
        if (stat.size > MAX_CLIENT_TEXT_ASSET_FILE_BYTES) {
            omittedAssets.push({ originalUrl, reason: 'asset_too_large' });
            continue;
        }
        const existing = packedByRealPath.get(realPath);
        if (existing) {
            assets.push({
                ...existing,
                sourceUrl: originalUrl,
                originalUrl: resolved.displayUrl || existing.originalUrl,
            });
            continue;
        }
        const bytes = await fs_1.default.promises.readFile(realPath);
        if (extension === 'svg') {
            assertSafeSvgClientSide(bytes);
        }
        else {
            const magic = imageMagicExtension(bytes);
            if (!magic || (magic !== extension && !(magic === 'jpg' && extension === 'jpeg'))) {
                omittedAssets.push({ originalUrl, reason: 'asset_magic_mismatch' });
                continue;
            }
        }
        const sha256 = crypto_1.default.createHash('sha256').update(bytes).digest('hex');
        const safeBaseName = cleanFileName(path_1.default.basename(realPath), `asset.${extension}`);
        const relativePath = `${MARKDOWN_ASSET_PREFIX}${sha256.slice(0, 16)}-${safeBaseName}`;
        const asset = {
            sourceUrl: originalUrl,
            originalUrl: resolved.displayUrl || originalUrl,
            absolutePath: realPath,
            relativePath,
            bytes,
            sha256,
        };
        packedByRealPath.set(realPath, asset);
        assets.push(asset);
    }
    const uniqueAssets = Array.from(new Map(assets.map(asset => [asset.relativePath, asset])).values());
    const totalAssetBytes = uniqueAssets.reduce((sum, asset) => sum + asset.bytes.length, 0);
    if (uniqueAssets.length > MAX_CLIENT_TEXT_ASSET_COUNT) {
        throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.FileCountExceeded, 'Markdown image assets exceed the share count limit.', { limitCount: MAX_CLIENT_TEXT_ASSET_COUNT });
    }
    if (totalAssetBytes > MAX_CLIENT_TEXT_TOTAL_ASSET_BYTES) {
        throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.TotalSizeExceeded, 'Markdown image assets exceed the share size limit.', {
            limitBytes: MAX_CLIENT_TEXT_TOTAL_ASSET_BYTES,
            actualBytes: totalAssetBytes,
        });
    }
    return { assets, omittedAssets };
}
function rewriteMarkdownAssetUrls(markdown, assets) {
    const replacements = new Map(assets.map(asset => [asset.sourceUrl, asset.relativePath]));
    const rewrittenInlineImages = markdown.replace(/(!\[[^\]]*]\()([^)\n]+)(\))/g, (match, prefix, destination, suffix) => {
        for (const [sourceUrl, relativePath] of replacements) {
            const sourceIndex = destination.indexOf(sourceUrl);
            if (sourceIndex < 0)
                continue;
            return `${prefix}${destination.slice(0, sourceIndex)}${relativePath}${destination.slice(sourceIndex + sourceUrl.length)}${suffix}`;
        }
        return match;
    });
    return rewrittenInlineImages.replace(/^([ \t]{0,3}\[[^\]]+]:[ \t]*)(\S+)(.*)$/gm, (match, prefix, destination, suffix) => {
        const relativePath = replacements.get(destination);
        return relativePath ? `${prefix}${relativePath}${suffix}` : match;
    });
}
function markdownSourceSha256(entryBytes, assets) {
    const digest = crypto_1.default.createHash('sha256');
    digest.update(entryBytes);
    const uniqueAssets = Array.from(new Map(assets.map(asset => [asset.relativePath, asset])).values())
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    for (const asset of uniqueAssets) {
        digest.update(`${asset.relativePath}\n`);
        digest.update(asset.sha256);
        digest.update('\n');
    }
    return digest.digest('hex');
}
function matchesDocumentMagic(extension, bytes) {
    if (extension === 'pdf') {
        return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    if (extension === 'csv' || extension === 'tsv') {
        return !bytes.includes(0);
    }
    if (extension === 'docx' || extension === 'pptx' || extension === 'xlsx') {
        return bytes.length >= 4 &&
            bytes[0] === 0x50 &&
            bytes[1] === 0x4b &&
            bytes[2] === 0x03 &&
            bytes[3] === 0x04;
    }
    return false;
}
async function writeSingleFileZip(file) {
    const tempDir = await fs_1.default.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'lobster-artifact-share-'));
    try {
        const archivePath = path_1.default.join(tempDir, 'share.zip');
        const sourcePath = path_1.default.join(tempDir, file.fileName);
        await fs_1.default.promises.writeFile(sourcePath, file.bytes);
        const zipFile = new yazl_1.default.ZipFile();
        zipFile.on('error', (err) => {
            zipFile.outputStream.destroy(err);
        });
        zipFile.addFile(sourcePath, file.fileName);
        const outputStream = fs_1.default.createWriteStream(archivePath);
        const pipelinePromise = (0, promises_2.pipeline)(zipFile.outputStream, outputStream);
        zipFile.end();
        await pipelinePromise;
        const stat = await fs_1.default.promises.stat(archivePath);
        const maxArchiveBytes = DOCUMENT_CONTENT_TYPES[extensionFromName(file.fileName)]
            ? MAX_CLIENT_DOCUMENT_ARCHIVE_BYTES
            : MAX_CLIENT_ARCHIVE_BYTES;
        if (stat.size > maxArchiveBytes) {
            throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.ArchiveSizeExceeded, 'Share archive exceeds the size limit.', {
                limitBytes: maxArchiveBytes,
                actualBytes: stat.size,
            });
        }
        const archiveBytes = await fs_1.default.promises.readFile(archivePath);
        return {
            archivePath,
            sourceSha256: crypto_1.default.createHash('sha256').update(archiveBytes).digest('hex'),
        };
    }
    catch (error) {
        await fs_1.default.promises.rm(tempDir, { recursive: true, force: true }).catch((cleanupError) => {
            console.warn('[HtmlShare] failed to clean a temporary artifact archive after packaging failed:', cleanupError);
        });
        throw error;
    }
}
async function writeMarkdownZip(file) {
    const markdown = assertTextContent(file.bytes);
    const { assets, omittedAssets } = await collectMarkdownLocalAssets(markdown, file.filePath);
    const rewrittenMarkdown = rewriteMarkdownAssetUrls(markdown, assets);
    const entryBytes = Buffer.from(rewrittenMarkdown, 'utf8');
    const uniqueAssets = Array.from(new Map(assets.map(asset => [asset.relativePath, asset])).values());
    const manifest = {
        version: 1,
        assets: uniqueAssets.map(asset => ({
            originalUrl: asset.originalUrl,
            relativePath: asset.relativePath,
            sha256: asset.sha256,
            sizeBytes: asset.bytes.length,
        })),
        omittedAssets,
    };
    const tempDir = await fs_1.default.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'lobster-artifact-share-'));
    try {
        const archivePath = path_1.default.join(tempDir, 'share.zip');
        const zipFile = new yazl_1.default.ZipFile();
        zipFile.on('error', (err) => {
            zipFile.outputStream.destroy(err);
        });
        zipFile.addBuffer(entryBytes, file.fileName);
        for (const asset of uniqueAssets) {
            zipFile.addBuffer(asset.bytes, asset.relativePath);
        }
        zipFile.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), MARKDOWN_MANIFEST_FILE);
        const outputStream = fs_1.default.createWriteStream(archivePath);
        const pipelinePromise = (0, promises_2.pipeline)(zipFile.outputStream, outputStream);
        zipFile.end();
        await pipelinePromise;
        const stat = await fs_1.default.promises.stat(archivePath);
        if (stat.size > MAX_CLIENT_TEXT_ARCHIVE_BYTES) {
            throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.ArchiveSizeExceeded, 'Share archive exceeds the size limit.', {
                limitBytes: MAX_CLIENT_TEXT_ARCHIVE_BYTES,
                actualBytes: stat.size,
            });
        }
        return {
            archivePath,
            sourceSha256: markdownSourceSha256(entryBytes, uniqueAssets),
            totalFiles: 1 + uniqueAssets.length + 1,
            totalBytes: entryBytes.length + uniqueAssets.reduce((sum, asset) => sum + asset.bytes.length, 0),
            warnings: omittedAssets.map(asset => `Markdown asset skipped: ${asset.originalUrl} (${asset.reason})`),
        };
    }
    catch (error) {
        await fs_1.default.promises.rm(tempDir, { recursive: true, force: true }).catch((cleanupError) => {
            console.warn('[HtmlShare] failed to clean a temporary Markdown archive after packaging failed:', cleanupError);
        });
        throw error;
    }
}
async function packageArtifactFile(input) {
    const loaded = await loadArtifactFile(input);
    const maxBytes = input.sourceType === constants_1.HtmlShareSourceType.DocumentFile
        ? MAX_CLIENT_DOCUMENT_FILE_BYTES
        : input.sourceType === constants_1.HtmlShareSourceType.MarkdownFile ||
            input.sourceType === constants_1.HtmlShareSourceType.MermaidFile
            ? MAX_CLIENT_TEXT_FILE_BYTES
            : MAX_CLIENT_SINGLE_FILE_BYTES;
    if (loaded.bytes.length > maxBytes) {
        throw (0, htmlShareError_1.createHtmlShareSizeError)(constants_1.HtmlShareFailureKind.FileTooLarge, 'Artifact exceeds the share size limit.', {
            fileName: loaded.fileName,
            limitBytes: maxBytes,
            actualBytes: loaded.bytes.length,
        });
    }
    if (input.sourceType === constants_1.HtmlShareSourceType.MarkdownFile) {
        const normalized = normalizeMarkdownFile(loaded);
        const packaged = await writeMarkdownZip(normalized);
        return {
            archivePath: packaged.archivePath,
            sourceSha256: packaged.sourceSha256,
            entryFile: normalized.fileName,
            totalFiles: packaged.totalFiles,
            totalBytes: packaged.totalBytes,
            contentType: normalized.contentType || 'text/markdown;charset=UTF-8',
            warnings: packaged.warnings,
        };
    }
    if (input.sourceType === constants_1.HtmlShareSourceType.MermaidFile) {
        const normalized = normalizeMermaidFile(loaded);
        const { archivePath } = await writeSingleFileZip(normalized);
        return {
            archivePath,
            sourceSha256: crypto_1.default.createHash('sha256').update(normalized.bytes).digest('hex'),
            entryFile: normalized.fileName,
            totalFiles: 1,
            totalBytes: normalized.bytes.length,
            contentType: normalized.contentType || 'text/plain;charset=UTF-8',
            warnings: [],
        };
    }
    const normalized = input.sourceType === constants_1.HtmlShareSourceType.ImageFile
        ? normalizeImageFile(loaded)
        : input.sourceType === constants_1.HtmlShareSourceType.DocumentFile
            ? normalizeDocumentFile(loaded)
            : normalizeSvgFile(loaded);
    const { archivePath, sourceSha256: archiveSha256 } = await writeSingleFileZip(normalized);
    return {
        archivePath,
        sourceSha256: input.sourceType === constants_1.HtmlShareSourceType.DocumentFile
            ? crypto_1.default.createHash('sha256').update(normalized.bytes).digest('hex')
            : archiveSha256,
        entryFile: normalized.fileName,
        totalFiles: 1,
        totalBytes: normalized.bytes.length,
        contentType: normalized.contentType || 'application/octet-stream',
        warnings: [],
    };
}
//# sourceMappingURL=artifactFileSharePackager.js.map
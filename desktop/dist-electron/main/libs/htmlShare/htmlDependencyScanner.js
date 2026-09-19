"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanHtmlDependencies = scanHtmlDependencies;
const cheerio_1 = require("cheerio");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const CSS_IMPORT_PATTERN = /@import\s+(?:url\(\s*)?["']([^"')]+)["']\s*\)?/gi;
const CSS_URL_PATTERN = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const JS_REFERENCE_PATTERNS = [
    /\bimport\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gi,
    /\bexport\s+[^"']*?\s+from\s+["']([^"']+)["']/gi,
    /\bimport\(\s*["']([^"']+)["']\s*\)/gi,
    /\bnew\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/gi,
    /\bfetch\(\s*["']([^"']+)["']/gi,
    /\bnew\s+(?:Worker|SharedWorker|Audio)\(\s*["']([^"']+)["']/gi,
];
const HTML_ATTRIBUTE_REFERENCES = [
    { selector: 'a[href]', attribute: 'href' },
    { selector: 'area[href]', attribute: 'href' },
    { selector: 'audio[src]', attribute: 'src' },
    { selector: 'embed[src]', attribute: 'src' },
    { selector: 'iframe[src]', attribute: 'src' },
    { selector: 'img[src]', attribute: 'src' },
    { selector: 'input[src]', attribute: 'src' },
    { selector: 'link[href]', attribute: 'href' },
    { selector: 'object[data]', attribute: 'data' },
    { selector: 'script[src]', attribute: 'src' },
    { selector: 'source[src]', attribute: 'src' },
    { selector: 'track[src]', attribute: 'src' },
    { selector: 'video[poster]', attribute: 'poster' },
    { selector: 'video[src]', attribute: 'src' },
];
const SRCSET_SELECTORS = ['img[srcset]', 'source[srcset]'];
function normalizeDisplayPath(rootDir, filePath) {
    const relative = path_1.default.relative(rootDir, filePath);
    return (relative && !relative.startsWith('..') && !path_1.default.isAbsolute(relative)
        ? relative
        : filePath).split(path_1.default.sep).join('/');
}
function isRemoteOrSpecialReference(value) {
    return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|mailto:|tel:|javascript:)/i.test(value.trim());
}
function stripReferenceQuery(value) {
    return value.split(/[?#]/, 1)[0] ?? '';
}
function parseSrcset(value) {
    return value
        .split(',')
        .map(part => part.trim().split(/\s+/, 1)[0])
        .filter(Boolean);
}
function collectPatternReferences(content, patterns) {
    const references = [];
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content))) {
            if (match[1])
                references.push(match[1]);
        }
    }
    return references;
}
function scanCssReferences(content) {
    return collectPatternReferences(content, [CSS_IMPORT_PATTERN, CSS_URL_PATTERN]);
}
function scanJsReferences(content) {
    return collectPatternReferences(content, JS_REFERENCE_PATTERNS);
}
function scanHtmlReferences(content) {
    const references = [];
    const $ = (0, cheerio_1.load)(content);
    for (const { selector, attribute } of HTML_ATTRIBUTE_REFERENCES) {
        $(selector).each((_, element) => {
            const value = $(element).attr(attribute);
            if (value)
                references.push(value);
        });
    }
    for (const selector of SRCSET_SELECTORS) {
        $(selector).each((_, element) => {
            const value = $(element).attr('srcset');
            if (value)
                references.push(...parseSrcset(value));
        });
    }
    $('style').each((_, element) => {
        references.push(...scanCssReferences($(element).html() ?? ''));
    });
    $('[style]').each((_, element) => {
        const value = $(element).attr('style');
        if (value)
            references.push(...scanCssReferences(value));
    });
    return references;
}
function isScannableFile(filePath) {
    return /\.(?:html?|css|mjs|cjs|js|svg)$/i.test(filePath);
}
function scanReferencesForFile(filePath, content) {
    if (/\.css$/i.test(filePath))
        return scanCssReferences(content);
    if (/\.(?:mjs|cjs|js)$/i.test(filePath))
        return scanJsReferences(content);
    if (/\.(?:html?|svg)$/i.test(filePath))
        return scanHtmlReferences(content);
    return [];
}
function resolveReference(allowedRoot, fromFile, reference) {
    const trimmed = reference.trim();
    if (!trimmed)
        return {};
    if (/^file:/i.test(trimmed)) {
        try {
            return { resolvedPath: path_1.default.resolve((0, url_1.fileURLToPath)(trimmed)) };
        }
        catch {
            return { blocked: trimmed };
        }
    }
    if (isRemoteOrSpecialReference(trimmed))
        return {};
    const cleanReference = stripReferenceQuery(trimmed);
    if (!cleanReference)
        return {};
    const baseDir = cleanReference.startsWith('/') ? allowedRoot : path_1.default.dirname(fromFile);
    const resolvedPath = path_1.default.resolve(baseDir, cleanReference.replace(/^\/+/, ''));
    const relative = path_1.default.relative(allowedRoot, resolvedPath);
    if (!relative || relative.startsWith('..') || path_1.default.isAbsolute(relative)) {
        return { blocked: cleanReference };
    }
    return { resolvedPath };
}
async function addReferencedFile(filePath, options, pending, files, missing, blocked) {
    if (options.isBlockedPath(filePath) || !options.isAllowedFile(filePath)) {
        blocked.add(normalizeDisplayPath(options.allowedRoot, filePath));
        return;
    }
    try {
        const stat = await fs_1.default.promises.lstat(filePath);
        if (stat.isSymbolicLink()) {
            blocked.add(normalizeDisplayPath(options.allowedRoot, filePath));
            return;
        }
        if (!stat.isFile()) {
            missing.add(normalizeDisplayPath(options.allowedRoot, filePath));
            return;
        }
    }
    catch {
        missing.add(normalizeDisplayPath(options.allowedRoot, filePath));
        return;
    }
    if (files.has(filePath))
        return;
    files.add(filePath);
    if (isScannableFile(filePath))
        pending.push(filePath);
}
async function scanHtmlDependencies(entryFilePath, options) {
    const resolvedEntry = path_1.default.resolve(entryFilePath);
    const resolvedAllowedRoot = path_1.default.resolve(options.allowedRoot);
    const scanOptions = { ...options, allowedRoot: resolvedAllowedRoot };
    const pending = [];
    const files = new Set();
    const visited = new Set();
    const missing = new Set();
    const blocked = new Set();
    await addReferencedFile(resolvedEntry, scanOptions, pending, files, missing, blocked);
    while (pending.length) {
        const filePath = pending.shift();
        if (visited.has(filePath))
            continue;
        visited.add(filePath);
        let content = '';
        try {
            content = await fs_1.default.promises.readFile(filePath, 'utf8');
        }
        catch {
            missing.add(normalizeDisplayPath(resolvedAllowedRoot, filePath));
            continue;
        }
        for (const reference of scanReferencesForFile(filePath, content)) {
            const resolved = resolveReference(resolvedAllowedRoot, filePath, reference);
            if (resolved.blocked) {
                blocked.add(resolved.blocked);
                continue;
            }
            if (!resolved.resolvedPath)
                continue;
            await addReferencedFile(resolved.resolvedPath, scanOptions, pending, files, missing, blocked);
        }
    }
    return {
        files: Array.from(files).sort((a, b) => a.localeCompare(b)),
        missing: Array.from(missing).sort(),
        blocked: Array.from(blocked).sort(),
    };
}
//# sourceMappingURL=htmlDependencyScanner.js.map
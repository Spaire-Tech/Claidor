"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeKeyfrom = normalizeKeyfrom;
exports.resolveCurrentKeyfrom = resolveCurrentKeyfrom;
exports.readKeyfromAttribution = readKeyfromAttribution;
exports.saveKeyfromAttribution = saveKeyfromAttribution;
exports.initializeKeyfromAttribution = initializeKeyfromAttribution;
exports.getKeyfromAttribution = getKeyfromAttribution;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const keyfrom_1 = require("../../shared/keyfrom");
const KEYFROM_PATTERN = /^[a-z0-9_-]{1,64}$/;
let cachedAttribution = null;
function normalizeKeyfrom(value) {
    if (typeof value !== 'string')
        return keyfrom_1.DefaultKeyfrom.Official;
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return keyfrom_1.DefaultKeyfrom.Official;
    if (!KEYFROM_PATTERN.test(normalized))
        return keyfrom_1.DefaultKeyfrom.Official;
    return normalized;
}
function readJsonFile(filePath) {
    try {
        if (!fs_1.default.existsSync(filePath))
            return null;
        return JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
    }
    catch (error) {
        console.warn(`[Keyfrom] failed to read build keyfrom file at ${filePath}:`, error);
        return null;
    }
}
function shouldUseDevelopmentKeyfromSources(env) {
    return env.NODE_ENV === 'development' || !!env.ELECTRON_START_URL;
}
function resolveBuildInfoPaths(env) {
    const resourcePath = process.resourcesPath
        ? path_1.default.join(process.resourcesPath, keyfrom_1.KeyfromBuildResource.Directory, keyfrom_1.KeyfromBuildResource.Filename)
        : '';
    const devPath = shouldUseDevelopmentKeyfromSources(env)
        ? path_1.default.join(process.cwd(), '.keyfrom-build', keyfrom_1.KeyfromBuildResource.Filename)
        : '';
    const paths = [resourcePath, devPath].filter(Boolean);
    return Array.from(new Set(paths));
}
function resolveCurrentKeyfrom(env = process.env) {
    const rawEnvKeyfrom = env[keyfrom_1.KeyfromEnv.Keyfrom];
    if (rawEnvKeyfrom !== undefined && shouldUseDevelopmentKeyfromSources(env)) {
        const normalized = normalizeKeyfrom(rawEnvKeyfrom);
        if (normalized === keyfrom_1.DefaultKeyfrom.Official &&
            rawEnvKeyfrom.trim().toLowerCase() !== keyfrom_1.DefaultKeyfrom.Official) {
            console.warn('[Keyfrom] invalid KEYFROM environment value, falling back to official');
        }
        return normalized;
    }
    for (const filePath of resolveBuildInfoPaths(env)) {
        const buildInfo = readJsonFile(filePath);
        if (!buildInfo)
            continue;
        const normalized = normalizeKeyfrom(buildInfo.keyfrom);
        if (typeof buildInfo.keyfrom === 'string' &&
            normalized === keyfrom_1.DefaultKeyfrom.Official &&
            buildInfo.keyfrom.trim().toLowerCase() !== keyfrom_1.DefaultKeyfrom.Official) {
            console.warn('[Keyfrom] invalid build keyfrom value, falling back to official');
        }
        return normalized;
    }
    return keyfrom_1.DefaultKeyfrom.Official;
}
function isValidAttribution(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const candidate = value;
    return (normalizeKeyfrom(candidate.firstKeyfrom) === candidate.firstKeyfrom &&
        normalizeKeyfrom(candidate.latestKeyfrom) === candidate.latestKeyfrom &&
        typeof candidate.updatedAt === 'number' &&
        Number.isFinite(candidate.updatedAt));
}
function readKeyfromAttribution(store) {
    try {
        const stored = store.get(keyfrom_1.KeyfromStoreKey.Attribution);
        if (!stored)
            return null;
        if (isValidAttribution(stored))
            return stored;
        console.warn('[Keyfrom] stored attribution is invalid, ignoring it');
        return null;
    }
    catch (error) {
        console.error('[Keyfrom] failed to read attribution from SQLite:', error);
        return null;
    }
}
function saveKeyfromAttribution(store, attribution) {
    try {
        store.set(keyfrom_1.KeyfromStoreKey.Attribution, attribution);
    }
    catch (error) {
        console.error('[Keyfrom] failed to save attribution to SQLite:', error);
    }
}
function initializeKeyfromAttribution(store, options = {}) {
    const currentKeyfrom = normalizeKeyfrom(options.currentKeyfrom ?? resolveCurrentKeyfrom());
    const existing = readKeyfromAttribution(store);
    const firstKeyfrom = existing?.firstKeyfrom || currentKeyfrom;
    const latestKeyfrom = currentKeyfrom;
    const attribution = {
        firstKeyfrom,
        latestKeyfrom,
        updatedAt: options.now ?? Date.now(),
    };
    saveKeyfromAttribution(store, attribution);
    cachedAttribution = attribution;
    if (!existing?.firstKeyfrom) {
        console.log(`[Keyfrom] initialized first keyfrom as ${firstKeyfrom}`);
    }
    if (existing?.latestKeyfrom !== latestKeyfrom) {
        console.log(`[Keyfrom] updated latest keyfrom as ${latestKeyfrom}`);
    }
    console.log(`[Keyfrom] resolved current keyfrom as ${currentKeyfrom}`);
    return attribution;
}
function getKeyfromAttribution(store) {
    if (store) {
        const stored = readKeyfromAttribution(store);
        if (stored) {
            cachedAttribution = stored;
            return stored;
        }
    }
    if (cachedAttribution)
        return cachedAttribution;
    const currentKeyfrom = normalizeKeyfrom(resolveCurrentKeyfrom());
    return {
        firstKeyfrom: currentKeyfrom,
        latestKeyfrom: currentKeyfrom,
        updatedAt: Date.now(),
    };
}
//# sourceMappingURL=keyfromAttribution.js.map
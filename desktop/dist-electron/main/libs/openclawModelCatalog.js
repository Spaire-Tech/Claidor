"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetOpenClawCatalogMaxTokensCacheForTest = exports.resolveOpenClawCatalogModelMaxTokens = void 0;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const module_1 = require("module");
const path_1 = __importDefault(require("path"));
const runtimeRequire = (0, module_1.createRequire)(__filename);
let cachedCatalogIndex;
const isPositiveNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const normalizeLookupPart = (value) => value.trim().toLowerCase();
const compactLookupPart = (value) => normalizeLookupPart(value).replace(/[^a-z0-9]/g, '');
const catalogKey = (providerId, modelId) => `${normalizeLookupPart(providerId)}/${normalizeLookupPart(modelId)}`;
// The bundled OpenClaw catalog may be unavailable in CI or in a trimmed
// runtime, but LobsterAI still needs to write correct limits for known native
// Anthropic-format providers. Keep this fallback scoped to official provider
// IDs so custom providers do not inherit limits by model-name coincidence.
const BUILT_IN_MODEL_MAX_TOKENS = new Map([
    ['anthropic/claude-sonnet-4-6', 64_000],
    ['anthropic/claude-sonnet-4.6', 64_000],
    ['minimax/minimax-m3', 131_072],
    ['minimax/minimax-m2.7', 131_072],
    ['minimax/minimax-m2.7-highspeed', 131_072],
    ['minimax/minimax-m2.5', 131_072],
    ['minimax/minimax-m2.5-highspeed', 131_072],
    ['minimax-portal/minimax-m3', 131_072],
    ['minimax-portal/minimax-m2.7', 131_072],
    ['minimax-portal/minimax-m2.7-highspeed', 131_072],
    ['minimax-portal/minimax-m2.5', 131_072],
    ['minimax-portal/minimax-m2.5-highspeed', 131_072],
]);
const BUILT_IN_PROVIDER_ALIASES = new Map([
    ['minimax-cn', 'minimax'],
    ['minimax-portal-cn', 'minimax-portal'],
]);
const resolveBuiltInModelMaxTokens = (providerId, modelId) => {
    const normalizedProvider = normalizeLookupPart(providerId);
    const providerCandidate = BUILT_IN_PROVIDER_ALIASES.get(normalizedProvider) ?? normalizedProvider;
    if (!providerCandidate)
        return undefined;
    const normalizedModel = normalizeLookupPart(modelId);
    const modelCandidates = [
        normalizedModel,
        normalizedModel.includes('/')
            ? normalizedModel.slice(normalizedModel.lastIndexOf('/') + 1)
            : '',
        normalizedModel.startsWith('claude-') && normalizedModel.includes('.')
            ? normalizedModel.replace(/\./g, '-')
            : '',
    ].filter(Boolean);
    for (const modelCandidate of Array.from(new Set(modelCandidates))) {
        const maxTokens = BUILT_IN_MODEL_MAX_TOKENS.get(catalogKey(providerCandidate, modelCandidate));
        if (isPositiveNumber(maxTokens)) {
            return maxTokens;
        }
    }
    return undefined;
};
const readJsonFile = (filePath) => {
    try {
        return JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
    }
    catch {
        return null;
    }
};
const findExistingPath = (candidates) => {
    for (const candidate of candidates) {
        if (!candidate)
            continue;
        if (!fs_1.default.existsSync(candidate))
            continue;
        try {
            return fs_1.default.realpathSync(candidate);
        }
        catch {
            return candidate;
        }
    }
    return null;
};
const resolveOpenClawRuntimeRoot = () => {
    const candidates = electron_1.app.isPackaged
        ? [path_1.default.join(process.resourcesPath, 'cfmind')]
        : [
            path_1.default.join(electron_1.app.getAppPath(), 'vendor', 'openclaw-runtime', 'current'),
            path_1.default.join(process.cwd(), 'vendor', 'openclaw-runtime', 'current'),
        ];
    return findExistingPath(candidates);
};
const listExtensionDirs = (runtimeRoot) => {
    const extensionsRoot = path_1.default.join(runtimeRoot, 'dist', 'extensions');
    try {
        return fs_1.default.readdirSync(extensionsRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => path_1.default.join(extensionsRoot, entry.name));
    }
    catch {
        return [];
    }
};
const addProviderAlias = (index, alias, provider) => {
    if (typeof alias !== 'string' || typeof provider !== 'string')
        return;
    const normalizedAlias = normalizeLookupPart(alias);
    const normalizedProvider = normalizeLookupPart(provider);
    if (normalizedAlias && normalizedProvider) {
        index.providerAliases.set(normalizedAlias, normalizedProvider);
    }
};
const addModelAlias = (index, providerId, alias, modelId) => {
    if (typeof alias !== 'string' || typeof modelId !== 'string')
        return;
    const normalizedProvider = normalizeLookupPart(providerId);
    const normalizedAlias = normalizeLookupPart(alias);
    const normalizedModelId = normalizeLookupPart(modelId);
    if (!normalizedProvider || !normalizedAlias || !normalizedModelId)
        return;
    const aliases = index.modelAliasesByProvider.get(normalizedProvider) ?? new Map();
    aliases.set(normalizedAlias, normalizedModelId);
    index.modelAliasesByProvider.set(normalizedProvider, aliases);
};
const indexProviderModels = (index, providerId, providerConfig) => {
    const normalizedProvider = normalizeLookupPart(providerId);
    if (!normalizedProvider || !Array.isArray(providerConfig?.models))
        return;
    for (const rawModel of providerConfig.models) {
        const model = rawModel;
        if (typeof model.id !== 'string' || !isPositiveNumber(model.maxTokens))
            continue;
        index.maxTokensByKey.set(catalogKey(normalizedProvider, model.id), model.maxTokens);
    }
};
const readManifestProviderIds = (manifest) => {
    if (!Array.isArray(manifest.providers))
        return [];
    return manifest.providers
        .filter((providerId) => typeof providerId === 'string' && providerId.trim().length > 0);
};
const indexManifestCatalog = (index, manifest) => {
    for (const [providerId, providerConfig] of Object.entries(manifest.modelCatalog?.providers ?? {})) {
        indexProviderModels(index, providerId, providerConfig);
    }
    for (const [alias, target] of Object.entries(manifest.modelCatalog?.aliases ?? {})) {
        addProviderAlias(index, alias, target.provider);
    }
    for (const [alias, provider] of Object.entries(manifest.providerAuthAliases ?? {})) {
        addProviderAlias(index, alias, provider);
    }
    for (const [providerId, config] of Object.entries(manifest.modelIdNormalization?.providers ?? {})) {
        for (const [alias, modelId] of Object.entries(config.aliases ?? {})) {
            addModelAlias(index, providerId, alias, modelId);
        }
    }
};
const selectProviderIdsForBuilder = (builderName, providerIds) => {
    const strippedName = builderName
        .replace(/^build/i, '')
        .replace(/Provider$/i, '')
        .replace(/StaticCatalog$/i, '')
        .replace(/Catalog$/i, '');
    const builderKey = compactLookupPart(strippedName);
    if (!builderKey)
        return [];
    const matches = providerIds
        .map(providerId => ({ providerId, key: compactLookupPart(providerId) }))
        .filter(({ key }) => key && builderKey.includes(key));
    if (matches.length === 0)
        return providerIds.length === 1 ? [providerIds[0]] : [];
    const longest = Math.max(...matches.map(match => match.key.length));
    return matches
        .filter(match => match.key.length === longest)
        .map(match => match.providerId);
};
const indexProviderCatalogBuilders = (index, extensionDir, providerIds) => {
    const providerCatalogPath = path_1.default.join(extensionDir, 'provider-catalog.js');
    if (!providerIds.length || !fs_1.default.existsSync(providerCatalogPath))
        return;
    let providerCatalogModule;
    try {
        providerCatalogModule = runtimeRequire(providerCatalogPath);
    }
    catch {
        return;
    }
    for (const [exportName, exported] of Object.entries(providerCatalogModule)) {
        if (typeof exported !== 'function' || !/^build.*Provider$/.test(exportName))
            continue;
        const matchedProviderIds = selectProviderIdsForBuilder(exportName, providerIds);
        if (matchedProviderIds.length === 0)
            continue;
        let providerConfig;
        try {
            providerConfig = exported(process.env);
        }
        catch {
            continue;
        }
        for (const providerId of matchedProviderIds) {
            indexProviderModels(index, providerId, providerConfig);
        }
    }
};
const buildOpenClawCatalogIndex = () => {
    const runtimeRoot = resolveOpenClawRuntimeRoot();
    if (!runtimeRoot)
        return null;
    const index = {
        maxTokensByKey: new Map(),
        providerAliases: new Map(),
        modelAliasesByProvider: new Map(),
    };
    for (const extensionDir of listExtensionDirs(runtimeRoot)) {
        const manifest = readJsonFile(path_1.default.join(extensionDir, 'openclaw.plugin.json'));
        if (!manifest)
            continue;
        indexManifestCatalog(index, manifest);
        indexProviderCatalogBuilders(index, extensionDir, readManifestProviderIds(manifest));
    }
    return index;
};
const getOpenClawCatalogIndex = () => {
    if (cachedCatalogIndex !== undefined) {
        return cachedCatalogIndex;
    }
    cachedCatalogIndex = buildOpenClawCatalogIndex();
    return cachedCatalogIndex;
};
const resolveProviderCandidates = (index, providerId) => {
    const normalized = normalizeLookupPart(providerId);
    if (!normalized)
        return [];
    const canonical = index.providerAliases.get(normalized);
    return Array.from(new Set([normalized, ...(canonical ? [canonical] : [])]));
};
const resolveModelCandidates = (index, providerId, modelId) => {
    const normalized = normalizeLookupPart(modelId);
    if (!normalized)
        return [];
    const candidates = [normalized];
    const aliases = index.modelAliasesByProvider.get(providerId);
    const aliasTarget = aliases?.get(normalized);
    if (aliasTarget)
        candidates.push(aliasTarget);
    if (normalized.includes('/')) {
        candidates.push(normalized.slice(normalized.lastIndexOf('/') + 1));
    }
    if (normalized.startsWith('claude-') && normalized.includes('.')) {
        candidates.push(normalized.replace(/\./g, '-'));
    }
    return Array.from(new Set(candidates.filter(Boolean)));
};
const resolveOpenClawCatalogModelMaxTokens = (providerId, modelId) => {
    const index = getOpenClawCatalogIndex();
    if (!index)
        return resolveBuiltInModelMaxTokens(providerId, modelId);
    for (const providerCandidate of resolveProviderCandidates(index, providerId)) {
        for (const modelCandidate of resolveModelCandidates(index, providerCandidate, modelId)) {
            const maxTokens = index.maxTokensByKey.get(catalogKey(providerCandidate, modelCandidate));
            if (isPositiveNumber(maxTokens)) {
                return maxTokens;
            }
        }
    }
    return resolveBuiltInModelMaxTokens(providerId, modelId);
};
exports.resolveOpenClawCatalogModelMaxTokens = resolveOpenClawCatalogModelMaxTokens;
const resetOpenClawCatalogMaxTokensCacheForTest = () => {
    cachedCatalogIndex = undefined;
};
exports.resetOpenClawCatalogMaxTokensCacheForTest = resetOpenClawCatalogMaxTokensCacheForTest;
//# sourceMappingURL=openclawModelCatalog.js.map
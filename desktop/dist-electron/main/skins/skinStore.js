"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkinStore = exports.SkinStoreError = exports.SKIN_ASSET_POLICIES = void 0;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const url_1 = require("url");
const constants_1 = require("../../shared/skin/constants");
const presentation_1 = require("../../shared/skin/presentation");
const skinImageValidation_1 = require("./skinImageValidation");
exports.SKIN_ASSET_POLICIES = {
    [constants_1.SkinAssetSlot.WorkspaceBackdrop]: {
        maxBytes: 16 * 1024 * 1024,
        minWidth: 1024,
        minHeight: 576,
        maxWidth: 8192,
        maxHeight: 8192,
        maxPixels: 32 * 1024 * 1024,
        minAspectRatio: 1.25,
        maxAspectRatio: 2.5,
    },
    [constants_1.SkinAssetSlot.HomeEmblem]: {
        maxBytes: 8 * 1024 * 1024,
        minWidth: 64,
        minHeight: 64,
        maxWidth: 4096,
        maxHeight: 4096,
        maxPixels: 16 * 1024 * 1024,
        minAspectRatio: 0.25,
        maxAspectRatio: 4,
    },
};
const SKIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const REGISTRY_FILE_NAME = 'registry.json';
const SLOT_FILE_PREFIX = {
    [constants_1.SkinAssetSlot.WorkspaceBackdrop]: 'workspace-backdrop',
    [constants_1.SkinAssetSlot.HomeEmblem]: 'home-emblem',
};
const FORMAT_EXTENSION = {
    [constants_1.SkinAssetFormat.Png]: constants_1.SkinAssetExtension.Png,
    [constants_1.SkinAssetFormat.Jpeg]: constants_1.SkinAssetExtension.Jpeg,
    [constants_1.SkinAssetFormat.Webp]: constants_1.SkinAssetExtension.Webp,
};
const FORMAT_MIME_TYPE = {
    [constants_1.SkinAssetFormat.Png]: constants_1.SkinAssetMimeType.Png,
    [constants_1.SkinAssetFormat.Jpeg]: constants_1.SkinAssetMimeType.Jpeg,
    [constants_1.SkinAssetFormat.Webp]: constants_1.SkinAssetMimeType.Webp,
};
class SkinStoreError extends Error {
    code;
    constructor(code, message, cause) {
        super(message, cause === undefined ? undefined : { cause });
        this.name = 'SkinStoreError';
        this.code = code;
    }
}
exports.SkinStoreError = SkinStoreError;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNodeErrorWithCode(error, code) {
    return isRecord(error) && error.code === code;
}
function isSkinAssetSlot(value) {
    return typeof value === 'string' && constants_1.SKIN_ASSET_SLOTS.includes(value);
}
function isSkinAssetFormat(value) {
    return Object.values(constants_1.SkinAssetFormat).includes(value);
}
function isSkinWorkflowKind(value) {
    return Object.values(constants_1.SkinWorkflowKind).includes(value);
}
function isSkinRecordStatus(value) {
    return Object.values(constants_1.SkinRecordStatus).includes(value);
}
function isOptionalBoundedString(value, maxLength) {
    return value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= maxLength);
}
function expectedRelativeAssetPath(skinId, slot, contentHash, extension) {
    return `${skinId}/assets/${SLOT_FILE_PREFIX[slot]}-${contentHash}.${extension}`;
}
function isValidAssetRecord(value, skinId, expectedSlot) {
    if (!isRecord(value))
        return false;
    if (value.slot !== expectedSlot ||
        !isSkinAssetFormat(value.format) ||
        typeof value.extension !== 'string' ||
        value.extension !== FORMAT_EXTENSION[value.format] ||
        value.mimeType !== FORMAT_MIME_TYPE[value.format] ||
        typeof value.contentHash !== 'string' ||
        !CONTENT_HASH_PATTERN.test(value.contentHash) ||
        typeof value.relativePath !== 'string' ||
        value.relativePath !== expectedRelativeAssetPath(skinId, expectedSlot, value.contentHash, value.extension) ||
        typeof value.byteLength !== 'number' ||
        !Number.isSafeInteger(value.byteLength) ||
        value.byteLength <= 0 ||
        typeof value.width !== 'number' ||
        !Number.isSafeInteger(value.width) ||
        value.width <= 0 ||
        typeof value.height !== 'number' ||
        !Number.isSafeInteger(value.height) ||
        value.height <= 0 ||
        typeof value.registeredAt !== 'string') {
        return false;
    }
    return hasValidDimensions(expectedSlot, value.width, value.height) &&
        value.byteLength <= exports.SKIN_ASSET_POLICIES[expectedSlot].maxBytes;
}
function parseSkinRecord(value, key) {
    if (!isRecord(value) || value.id !== key || !SKIN_ID_PATTERN.test(key))
        return null;
    const presentation = value.presentation === undefined
        ? undefined
        : (0, presentation_1.parseSkinPresentation)(value.presentation);
    if (!isOptionalBoundedString(value.name, 128) ||
        !isSkinWorkflowKind(value.workflowKind) ||
        !isOptionalBoundedString(value.baseThemeId, 256) ||
        !isOptionalBoundedString(value.boundThemeId, 256) ||
        !isSkinRecordStatus(value.status) ||
        !isRecord(value.assets) ||
        typeof value.createdAt !== 'string' ||
        typeof value.updatedAt !== 'string' ||
        !isOptionalBoundedString(value.appliedAt, 64)
        || (value.presentation !== undefined && !presentation)) {
        return null;
    }
    const assets = {};
    for (const [slot, asset] of Object.entries(value.assets)) {
        if (!isSkinAssetSlot(slot) || !isValidAssetRecord(asset, key, slot))
            return null;
        assets[slot] = asset;
    }
    const ready = constants_1.SKIN_ASSET_SLOTS.every(slot => Boolean(assets[slot]));
    if (value.status !== (ready ? constants_1.SkinRecordStatus.Ready : constants_1.SkinRecordStatus.Draft))
        return null;
    return {
        id: key,
        ...(value.name === undefined ? {} : { name: value.name }),
        workflowKind: value.workflowKind,
        ...(value.baseThemeId === undefined ? {} : { baseThemeId: value.baseThemeId }),
        ...(value.boundThemeId === undefined ? {} : { boundThemeId: value.boundThemeId }),
        ...(presentation ? { presentation } : {}),
        status: value.status,
        assets,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        ...(value.appliedAt === undefined ? {} : { appliedAt: value.appliedAt }),
    };
}
function parseRegistry(value) {
    if (!isRecord(value) || value.version !== constants_1.SKIN_REGISTRY_VERSION || !isRecord(value.skins))
        return null;
    const activeSkinId = value.activeSkinId;
    if (activeSkinId !== null && typeof activeSkinId !== 'string')
        return null;
    const parsedActiveSkinId = typeof activeSkinId === 'string' ? activeSkinId : null;
    const skins = {};
    for (const [skinId, skinValue] of Object.entries(value.skins)) {
        const skin = parseSkinRecord(skinValue, skinId);
        if (!skin)
            return null;
        skins[skinId] = skin;
    }
    if (parsedActiveSkinId && !skins[parsedActiveSkinId])
        return null;
    return {
        version: constants_1.SKIN_REGISTRY_VERSION,
        activeSkinId: parsedActiveSkinId,
        skins,
    };
}
function createEmptyRegistry() {
    return {
        version: constants_1.SKIN_REGISTRY_VERSION,
        activeSkinId: null,
        skins: {},
    };
}
function cloneSkinRecord(record) {
    return structuredClone(record);
}
function hasValidDimensions(slot, width, height) {
    const policy = exports.SKIN_ASSET_POLICIES[slot];
    const aspectRatio = width / height;
    return width >= policy.minWidth &&
        height >= policy.minHeight &&
        width <= policy.maxWidth &&
        height <= policy.maxHeight &&
        width * height <= policy.maxPixels &&
        aspectRatio >= policy.minAspectRatio &&
        aspectRatio <= policy.maxAspectRatio;
}
function validateDraftInput(input) {
    if (!isOptionalBoundedString(input.name, 128)) {
        throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidDraft, 'Skin name must be a non-empty string of at most 128 characters');
    }
    if (!isOptionalBoundedString(input.baseThemeId, 256)) {
        throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidDraft, 'Base theme id must be a non-empty string of at most 256 characters');
    }
    if (input.workflowKind !== undefined && !isSkinWorkflowKind(input.workflowKind)) {
        throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidDraft, 'Unsupported skin workflow kind');
    }
    const presentation = input.presentation === undefined
        ? undefined
        : (0, presentation_1.parseSkinPresentation)(input.presentation);
    if (input.presentation !== undefined && !presentation) {
        throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidDraft, 'Skin presentation must use the supported mode, palette, focus, effects, and accessible color contrast');
    }
    return presentation;
}
class SkinStore {
    rootDir;
    registryPath;
    now;
    idGenerator;
    mutationQueue = Promise.resolve();
    constructor(options) {
        if (!path_1.default.isAbsolute(options.rootDir)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.UnsafeAssetPath, 'Skin root directory must be absolute');
        }
        this.rootDir = path_1.default.resolve(options.rootDir);
        this.registryPath = path_1.default.join(this.rootDir, REGISTRY_FILE_NAME);
        this.now = options.now ?? (() => new Date());
        this.idGenerator = options.idGenerator ?? crypto_1.randomUUID;
    }
    async createDraft(input = {}) {
        const presentation = validateDraftInput(input);
        return this.enqueueMutation(async () => {
            const registry = await this.readRegistry();
            const skinId = this.idGenerator();
            if (!SKIN_ID_PATTERN.test(skinId) || registry.skins[skinId]) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSkinId, 'Generated skin id is invalid or already exists');
            }
            const timestamp = this.now().toISOString();
            const record = {
                id: skinId,
                ...(input.name === undefined ? {} : { name: input.name }),
                workflowKind: input.workflowKind ?? constants_1.SkinWorkflowKind.SkinPack,
                ...(input.baseThemeId === undefined ? {} : { baseThemeId: input.baseThemeId }),
                ...(presentation ? { presentation } : {}),
                status: constants_1.SkinRecordStatus.Draft,
                assets: {},
                createdAt: timestamp,
                updatedAt: timestamp,
            };
            registry.skins[skinId] = record;
            await this.writeRegistry(registry);
            return cloneSkinRecord(record);
        });
    }
    async registerAsset(input) {
        if (!SKIN_ID_PATTERN.test(input.skinId)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSkinId, 'Skin id is invalid');
        }
        if (!isSkinAssetSlot(input.slot)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSlot, 'Skin asset slot is invalid');
        }
        const sourcePath = await this.resolveSourcePath(input.source);
        const policy = exports.SKIN_ASSET_POLICIES[input.slot];
        const sourceStat = await this.getRegularSourceStat(sourcePath);
        if (sourceStat.size > policy.maxBytes) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.AssetTooLarge, 'Skin asset exceeds the slot size limit');
        }
        const data = await fs_1.default.promises.readFile(sourcePath);
        if (data.length === 0 || data.length > policy.maxBytes) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.AssetTooLarge, 'Skin asset exceeds the slot size limit');
        }
        const image = (0, skinImageValidation_1.inspectSkinImage)(data);
        if (!image) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.UnsupportedAssetFormat, 'Skin asset is not a valid PNG, JPEG, or WebP image');
        }
        if (!hasValidDimensions(input.slot, image.width, image.height)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidAssetDimensions, 'Skin asset dimensions do not satisfy the slot policy');
        }
        const contentHash = (0, crypto_1.createHash)('sha256').update(data).digest('hex');
        const relativePath = expectedRelativeAssetPath(input.skinId, input.slot, contentHash, image.extension);
        const destinationPath = this.resolveManagedPath(relativePath);
        return this.enqueueMutation(async () => {
            const registry = await this.readRegistry();
            const skin = registry.skins[input.skinId];
            if (!skin) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.SkinNotFound, 'Skin does not exist');
            }
            if (skin.assets[input.slot]) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.SlotAlreadyRegistered, 'Skin asset slot is already registered');
            }
            if (input.slot === constants_1.SkinAssetSlot.HomeEmblem &&
                !skin.assets[constants_1.SkinAssetSlot.WorkspaceBackdrop]) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.SlotOutOfOrder, 'Workspace backdrop must be registered first');
            }
            if (registry.activeSkinId === input.skinId) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.ActiveSkinImmutable, 'Deactivate the skin before changing its assets');
            }
            await this.writeContentAddressedAsset(destinationPath, data, contentHash);
            const timestamp = this.now().toISOString();
            const asset = {
                ...image,
                slot: input.slot,
                relativePath,
                contentHash,
                byteLength: data.length,
                registeredAt: timestamp,
            };
            skin.assets[input.slot] = asset;
            skin.status = constants_1.SKIN_ASSET_SLOTS.every(slot => Boolean(skin.assets[slot]))
                ? constants_1.SkinRecordStatus.Ready
                : constants_1.SkinRecordStatus.Draft;
            skin.updatedAt = timestamp;
            await this.writeRegistry(registry);
            return structuredClone(asset);
        });
    }
    async apply(skinId, boundThemeId) {
        if (!SKIN_ID_PATTERN.test(skinId)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSkinId, 'Skin id is invalid');
        }
        if (!isOptionalBoundedString(boundThemeId, 256)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidThemeId, 'Bound theme id must be a non-empty string of at most 256 characters');
        }
        return this.enqueueMutation(async () => {
            const registry = await this.readRegistry();
            const skin = registry.skins[skinId];
            if (!skin) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.SkinNotFound, 'Skin does not exist');
            }
            if (skin.status !== constants_1.SkinRecordStatus.Ready) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.SkinIncomplete, 'Skin is missing one or more required assets');
            }
            for (const slot of constants_1.SKIN_ASSET_SLOTS) {
                const asset = skin.assets[slot];
                if (!asset || !(await this.isStoredAssetIntact(asset))) {
                    throw new SkinStoreError(constants_1.SkinStoreErrorCode.SkinIncomplete, 'Skin contains a missing or invalid managed asset');
                }
            }
            const timestamp = this.now().toISOString();
            registry.activeSkinId = skinId;
            if (skin.boundThemeId === undefined && boundThemeId !== undefined) {
                skin.boundThemeId = boundThemeId;
            }
            skin.appliedAt = timestamp;
            skin.updatedAt = timestamp;
            await this.writeRegistry(registry);
            return cloneSkinRecord(skin);
        });
    }
    async bindTheme(skinId, themeId) {
        if (!SKIN_ID_PATTERN.test(skinId)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSkinId, 'Skin id is invalid');
        }
        if (!isOptionalBoundedString(themeId, 256)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidThemeId, 'Bound theme id must be a non-empty string of at most 256 characters');
        }
        return this.enqueueMutation(async () => {
            const registry = await this.readRegistry();
            const skin = registry.skins[skinId];
            if (!skin) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.SkinNotFound, 'Skin does not exist');
            }
            if (skin.boundThemeId !== undefined) {
                return cloneSkinRecord(skin);
            }
            skin.boundThemeId = themeId;
            skin.updatedAt = this.now().toISOString();
            await this.writeRegistry(registry);
            return cloneSkinRecord(skin);
        });
    }
    async deactivate() {
        return this.enqueueMutation(async () => {
            const registry = await this.readRegistry();
            if (registry.activeSkinId === null)
                return;
            registry.activeSkinId = null;
            await this.writeRegistry(registry);
        });
    }
    async deleteSkin(skinId) {
        if (!SKIN_ID_PATTERN.test(skinId)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSkinId, 'Skin id is invalid');
        }
        return this.enqueueMutation(async () => {
            const registry = await this.readRegistry();
            if (!registry.skins[skinId]) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.SkinNotFound, 'Skin does not exist');
            }
            const wasActive = registry.activeSkinId === skinId;
            if (wasActive)
                registry.activeSkinId = null;
            delete registry.skins[skinId];
            await this.writeRegistry(registry);
            const managedSkinDir = this.resolveManagedPath(skinId);
            try {
                await fs_1.default.promises.rm(managedSkinDir, { recursive: true, force: true });
            }
            catch (error) {
                console.warn(`[Skin] Failed to remove managed files for deleted skin "${skinId}".`, error);
            }
            return { wasActive };
        });
    }
    async getActive() {
        await this.mutationQueue;
        const registry = await this.readRegistry();
        const record = registry.activeSkinId ? registry.skins[registry.activeSkinId] : undefined;
        return record ? cloneSkinRecord(record) : null;
    }
    async listSkins() {
        await this.mutationQueue;
        const registry = await this.readRegistry();
        return Object.values(registry.skins)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .map(cloneSkinRecord);
    }
    async getSkin(skinId) {
        if (!SKIN_ID_PATTERN.test(skinId))
            return null;
        await this.mutationQueue;
        const registry = await this.readRegistry();
        const record = registry.skins[skinId];
        return record ? cloneSkinRecord(record) : null;
    }
    async resolveProtocolAsset(skinId, slot) {
        if (!SKIN_ID_PATTERN.test(skinId) || !isSkinAssetSlot(slot))
            return null;
        await this.mutationQueue;
        const registry = await this.readRegistry();
        const asset = registry.skins[skinId]?.assets[slot];
        if (!asset)
            return null;
        return {
            relativePath: asset.relativePath,
            mimeType: asset.mimeType,
            contentHash: asset.contentHash,
        };
    }
    enqueueMutation(operation) {
        const result = this.mutationQueue.then(operation, operation);
        this.mutationQueue = result.then(() => undefined, () => undefined);
        return result;
    }
    async readRegistry() {
        let raw;
        try {
            raw = await fs_1.default.promises.readFile(this.registryPath, 'utf8');
        }
        catch (error) {
            if (isNodeErrorWithCode(error, 'ENOENT'))
                return createEmptyRegistry();
            throw error;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (error) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidRegistry, 'Skin registry contains invalid JSON', error);
        }
        const registry = parseRegistry(parsed);
        if (!registry) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidRegistry, 'Skin registry failed schema validation');
        }
        return registry;
    }
    async writeRegistry(registry) {
        await fs_1.default.promises.mkdir(this.rootDir, { recursive: true });
        const tempPath = path_1.default.join(this.rootDir, `.${REGISTRY_FILE_NAME}.${(0, crypto_1.randomUUID)()}.tmp`);
        try {
            await fs_1.default.promises.writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, {
                encoding: 'utf8',
                flag: 'wx',
            });
            await fs_1.default.promises.rename(tempPath, this.registryPath);
        }
        finally {
            await fs_1.default.promises.rm(tempPath, { force: true }).catch(() => undefined);
        }
    }
    async resolveSourcePath(source) {
        if (typeof source !== 'string' || source.length === 0 || source.includes('\0')) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSource, 'Skin asset source is invalid');
        }
        if (path_1.default.isAbsolute(source))
            return path_1.default.resolve(source);
        let sourceUrl;
        try {
            sourceUrl = new URL(source);
        }
        catch (error) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSource, 'Skin asset source must be an absolute path or file URL', error);
        }
        if (sourceUrl.protocol !== 'file:') {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.UnsupportedSourceScheme, 'Only local file URLs are supported');
        }
        if ((sourceUrl.hostname !== '' && sourceUrl.hostname !== 'localhost') ||
            sourceUrl.username !== '' ||
            sourceUrl.password !== '' ||
            sourceUrl.port !== '' ||
            sourceUrl.search !== '' ||
            sourceUrl.hash !== '') {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSource, 'Skin asset file URL contains unsupported components');
        }
        try {
            const filePath = (0, url_1.fileURLToPath)(sourceUrl);
            if (!path_1.default.isAbsolute(filePath)) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSource, 'Skin asset file URL is not absolute');
            }
            return path_1.default.resolve(filePath);
        }
        catch (error) {
            if (error instanceof SkinStoreError)
                throw error;
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.InvalidSource, 'Skin asset file URL is invalid', error);
        }
    }
    async getRegularSourceStat(sourcePath) {
        let stat;
        try {
            stat = await fs_1.default.promises.lstat(sourcePath);
        }
        catch (error) {
            if (isNodeErrorWithCode(error, 'ENOENT')) {
                throw new SkinStoreError(constants_1.SkinStoreErrorCode.SourceNotFound, 'Skin asset source does not exist', error);
            }
            throw error;
        }
        if (!stat.isFile()) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.SourceNotRegularFile, 'Skin asset source must be a regular local file');
        }
        return stat;
    }
    resolveManagedPath(relativePath) {
        if (path_1.default.isAbsolute(relativePath) ||
            relativePath.includes('\\') ||
            relativePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.UnsafeAssetPath, 'Managed skin asset path is invalid');
        }
        const resolved = path_1.default.resolve(this.rootDir, ...relativePath.split('/'));
        const relative = path_1.default.relative(this.rootDir, resolved);
        if (relative === '' || relative.startsWith(`..${path_1.default.sep}`) || relative === '..' || path_1.default.isAbsolute(relative)) {
            throw new SkinStoreError(constants_1.SkinStoreErrorCode.UnsafeAssetPath, 'Managed skin asset path escapes the skin root');
        }
        return resolved;
    }
    async writeContentAddressedAsset(destinationPath, data, expectedHash) {
        await fs_1.default.promises.mkdir(path_1.default.dirname(destinationPath), { recursive: true });
        if (await this.existingFileMatches(destinationPath, expectedHash))
            return;
        const tempPath = `${destinationPath}.${(0, crypto_1.randomUUID)()}.tmp`;
        try {
            await fs_1.default.promises.writeFile(tempPath, data, { flag: 'wx' });
            try {
                await fs_1.default.promises.link(tempPath, destinationPath);
            }
            catch (error) {
                if (!isNodeErrorWithCode(error, 'EEXIST') || !(await this.existingFileMatches(destinationPath, expectedHash))) {
                    throw error;
                }
            }
        }
        finally {
            await fs_1.default.promises.rm(tempPath, { force: true }).catch(() => undefined);
        }
    }
    async existingFileMatches(filePath, expectedHash) {
        try {
            const stat = await fs_1.default.promises.lstat(filePath);
            if (!stat.isFile())
                return false;
            const hash = (0, crypto_1.createHash)('sha256').update(await fs_1.default.promises.readFile(filePath)).digest('hex');
            return hash === expectedHash;
        }
        catch (error) {
            if (isNodeErrorWithCode(error, 'ENOENT'))
                return false;
            throw error;
        }
    }
    async isStoredAssetIntact(asset) {
        const filePath = this.resolveManagedPath(asset.relativePath);
        try {
            const stat = await fs_1.default.promises.lstat(filePath);
            if (!stat.isFile() || stat.size !== asset.byteLength)
                return false;
            const data = await fs_1.default.promises.readFile(filePath);
            const hash = (0, crypto_1.createHash)('sha256').update(data).digest('hex');
            if (hash !== asset.contentHash)
                return false;
            const image = (0, skinImageValidation_1.inspectSkinImage)(data);
            return Boolean(image &&
                image.format === asset.format &&
                image.width === asset.width &&
                image.height === asset.height);
        }
        catch (error) {
            if (isNodeErrorWithCode(error, 'ENOENT'))
                return false;
            throw error;
        }
    }
}
exports.SkinStore = SkinStore;
//# sourceMappingURL=skinStore.js.map
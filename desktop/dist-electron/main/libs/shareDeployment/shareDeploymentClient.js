"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNodeDeploymentClientSourceKey = buildNodeDeploymentClientSourceKey;
exports.buildStaticDeploymentClientSourceKey = buildStaticDeploymentClientSourceKey;
exports.uploadNodeDeployment = uploadNodeDeployment;
exports.uploadStaticDeployment = uploadStaticDeployment;
exports.getNodeDeployment = getNodeDeployment;
exports.getDeploymentPersistence = getDeploymentPersistence;
exports.downloadDeploymentPersistenceArchive = downloadDeploymentPersistenceArchive;
exports.getNodeDeploymentByLocalService = getNodeDeploymentByLocalService;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../../shared/htmlShare/constants");
const constants_2 = require("../../../shared/publishing/constants");
const constants_3 = require("../../../shared/shareDeployment/constants");
const htmlShareClient_1 = require("../htmlShare/htmlShareClient");
const MAX_API_ERROR_RESPONSE_BYTES = 64 * 1024;
function normalizeLegacyLocalServiceUrl(localServiceUrl) {
    try {
        const url = new URL(localServiceUrl.trim());
        url.hash = '';
        return url.toString().replace(/\/+$/, '/').toLowerCase();
    }
    catch {
        return localServiceUrl.trim().replace(/\/+$/, '/').toLowerCase();
    }
}
function normalizeLocalServiceOrigin(localServiceUrl) {
    try {
        const url = new URL(localServiceUrl.trim());
        return url.origin.toLowerCase();
    }
    catch {
        return localServiceUrl.trim().replace(/\/+$/, '').toLowerCase();
    }
}
function normalizeProjectDirectoryForSourceKey(projectDirectory) {
    return path_1.default.resolve(projectDirectory.trim()).replace(/\\/g, '/').toLowerCase();
}
const SERVICE_DEPLOYMENT_CLIENT_SOURCE_PREFIX = 'service-deployment';
const NODE_DEPLOYMENT_CLIENT_SOURCE_V2 = 'v2';
const SERVICE_DEPLOYMENT_CLIENT_SOURCE_V3 = 'v3';
const STATIC_DEPLOYMENT_CLIENT_SOURCE_V1 = 'static:v1';
function sha256ClientSourceKey(value) {
    return crypto_1.default.createHash('sha256').update(value).digest('hex');
}
function buildLegacyServiceDeploymentClientSourceKey(input) {
    const normalizedUrl = normalizeLegacyLocalServiceUrl(input.localServiceUrl);
    return sha256ClientSourceKey(`${SERVICE_DEPLOYMENT_CLIENT_SOURCE_PREFIX}:${input.sessionId}:${normalizedUrl}`);
}
function buildLegacyNodeDeploymentClientSourceKey(input) {
    const normalizedUrl = normalizeLegacyLocalServiceUrl(input.localServiceUrl);
    return sha256ClientSourceKey(`${constants_1.HtmlShareSourceType.NodeServiceDeployment}:${input.sessionId}:${normalizedUrl}`);
}
function buildNodeDeploymentV2ClientSourceKey(input) {
    const normalizedProjectDirectory = input.projectDirectory?.trim()
        ? normalizeProjectDirectoryForSourceKey(input.projectDirectory)
        : '';
    if (!normalizedProjectDirectory)
        return undefined;
    const normalizedOrigin = normalizeLocalServiceOrigin(input.localServiceUrl);
    return sha256ClientSourceKey(`${constants_1.HtmlShareSourceType.NodeServiceDeployment}:${NODE_DEPLOYMENT_CLIENT_SOURCE_V2}:${normalizedProjectDirectory}:${normalizedOrigin}`);
}
function buildNodeDeploymentClientSourceKey(input) {
    const normalizedProjectDirectory = input.projectDirectory?.trim()
        ? normalizeProjectDirectoryForSourceKey(input.projectDirectory)
        : '';
    if (!normalizedProjectDirectory) {
        return buildLegacyServiceDeploymentClientSourceKey(input);
    }
    return sha256ClientSourceKey(`${SERVICE_DEPLOYMENT_CLIENT_SOURCE_PREFIX}:${SERVICE_DEPLOYMENT_CLIENT_SOURCE_V3}:${normalizedProjectDirectory}`);
}
function buildNodeDeploymentClientSourceKeys(input) {
    return Array.from(new Set([
        buildNodeDeploymentClientSourceKey(input),
        buildLegacyServiceDeploymentClientSourceKey(input),
        buildNodeDeploymentV2ClientSourceKey(input),
        buildLegacyNodeDeploymentClientSourceKey(input),
    ].filter((key) => Boolean(key))));
}
function buildStaticDeploymentClientSourceKey(input) {
    const normalizedProjectDirectory = input.projectDirectory?.trim()
        ? normalizeProjectDirectoryForSourceKey(input.projectDirectory)
        : '';
    if (!normalizedProjectDirectory) {
        return sha256ClientSourceKey(`${constants_1.HtmlShareSourceType.StaticServiceDeployment}:${input.sessionId}:${normalizeLegacyLocalServiceUrl(input.localServiceUrl)}`);
    }
    return sha256ClientSourceKey(`${SERVICE_DEPLOYMENT_CLIENT_SOURCE_PREFIX}:${STATIC_DEPLOYMENT_CLIENT_SOURCE_V1}:${normalizedProjectDirectory}`);
}
function buildDeploymentClientSourceLookups(input) {
    const lookups = [
        {
            sourceType: constants_1.HtmlShareSourceType.StaticServiceDeployment,
            clientSourceKey: buildStaticDeploymentClientSourceKey(input),
        },
        ...buildNodeDeploymentClientSourceKeys(input).map(clientSourceKey => ({
            sourceType: constants_1.HtmlShareSourceType.NodeServiceDeployment,
            clientSourceKey,
        })),
    ];
    const seen = new Set();
    return lookups.filter(lookup => {
        const key = `${lookup.sourceType}:${lookup.clientSourceKey}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function normalizeDeploymentStatus(value) {
    switch (value) {
        case constants_3.ShareDeploymentStatus.Deploying:
            return constants_3.ShareDeploymentStatus.Deploying;
        case constants_3.ShareDeploymentStatus.Live:
            return constants_3.ShareDeploymentStatus.Live;
        case constants_3.ShareDeploymentStatus.DeployFailed:
            return constants_3.ShareDeploymentStatus.DeployFailed;
        case constants_3.ShareDeploymentStatus.Expired:
            return constants_3.ShareDeploymentStatus.Expired;
        case constants_3.ShareDeploymentStatus.Stopped:
            return constants_3.ShareDeploymentStatus.Stopped;
        case constants_3.ShareDeploymentStatus.Queued:
        default:
            return constants_3.ShareDeploymentStatus.Queued;
    }
}
function normalizeDeploymentFailureCode(value) {
    return Object.values(constants_3.ShareDeploymentFailureCode).find(code => code === value);
}
function buildDeploymentRecord(data, publicBaseUrl) {
    if (!data?.deploymentId)
        return null;
    const responseShareUrl = data.url?.trim();
    const url = responseShareUrl || (data.shareId ? (0, htmlShareClient_1.buildHtmlSharePublicUrl)(publicBaseUrl, data.shareId) : undefined);
    return {
        deploymentId: data.deploymentId,
        shareId: data.shareId,
        url,
        deploymentKind: data.deploymentKind === constants_3.ShareDeploymentKind.StaticSite || data.runtimeLanguage === 'static'
            ? constants_3.ShareDeploymentKind.StaticSite
            : constants_3.ShareDeploymentKind.NodeService,
        accessMode: data.accessMode === constants_1.HtmlShareAccessMode.Public
            ? constants_1.HtmlShareAccessMode.Public
            : constants_1.HtmlShareAccessMode.Code,
        shareCode: data.shareCode,
        shareCodeUnavailable: data.shareCodeUnavailable,
        shareStatus: data.status === constants_1.HtmlShareStatus.Disabled
            ? constants_1.HtmlShareStatus.Disabled
            : data.status === constants_1.HtmlShareStatus.Failed
                ? constants_1.HtmlShareStatus.Failed
                : constants_1.HtmlShareStatus.Live,
        disabledSource: typeof data.disabledSource === 'string' && data.disabledSource.trim()
            ? data.disabledSource.trim()
            : null,
        status: normalizeDeploymentStatus(data.deploymentStatus || data.status),
        runtimeLanguage: data.runtimeLanguage,
        runtimeVersion: data.runtimeVersion,
        packageManager: data.packageManager,
        installCommand: data.installCommand,
        buildCommand: data.buildCommand,
        startCommand: data.startCommand,
        targetPort: data.listenPort,
        sourceArchiveBytes: data.sourceArchiveBytes,
        sourceSha256: data.sourceSha256,
        provider: data.provider,
        providerRegion: data.region,
        providerFunctionId: data.providerResourceId,
        providerEndpoint: data.runtimeUrlMasked,
        persistence: data.persistence,
        ...(Object.prototype.hasOwnProperty.call(data, 'expiresAt')
            ? { expiresAt: data.expiresAt }
            : {}),
        subscriptionRecoveryMode: (0, constants_2.normalizePublishingSubscriptionRecoveryMode)(data.subscriptionRecoveryMode),
        lastAccessedAt: data.lastAccessedAt,
        errorCode: normalizeDeploymentFailureCode(data.failureCode),
        errorMessage: data.failureMessage,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        events: data.events,
    };
}
function buildManifest(input) {
    const isStaticDeployment = input.deploymentKind === constants_3.ShareDeploymentKind.StaticSite;
    const persistence = input.persistence ?? input.analysis.persistence;
    const manifestPersistence = !isStaticDeployment && persistence?.enabled && persistence.bindings.length > 0
        ? {
            ...persistence,
            updateMode: input.persistenceUpdateMode ?? constants_3.ShareDeploymentPersistenceUpdateMode.Preserve,
        }
        : undefined;
    return {
        schemaVersion: 1,
        deploymentKind: isStaticDeployment ? constants_3.ShareDeploymentKind.StaticSite : constants_3.ShareDeploymentKind.NodeService,
        runtimeLanguage: isStaticDeployment ? 'static' : 'node',
        runtimeVersion: isStaticDeployment ? undefined : input.nodeVersion,
        packageManager: input.analysis.packageManager,
        installCommand: input.installCommand,
        buildCommand: input.buildCommand,
        startCommand: isStaticDeployment ? '' : input.startCommand,
        listenPort: isStaticDeployment ? 0 : input.port,
        healthPath: '/',
        entryFile: isStaticDeployment ? input.entryFile : undefined,
        spaFallback: isStaticDeployment ? input.spaFallback ?? true : undefined,
        projectRootName: path_1.default.basename(input.analysis.projectDirectory),
        projectRootHash: crypto_1.default
            .createHash('sha256')
            .update(input.analysis.projectDirectory)
            .digest('hex')
            .slice(0, 16),
        includedFileCount: input.analysis.totalFiles,
        estimatedSourceArchiveBytes: input.archiveBytes,
        localServiceUrl: input.localServiceUrl,
        ...(manifestPersistence ? { persistence: manifestPersistence } : {}),
        env: [],
    };
}
async function readArchiveBlob(archivePath) {
    const buffer = await fs_1.default.promises.readFile(archivePath);
    const archiveBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return new Blob([archiveBuffer], { type: 'application/zip' });
}
async function uploadNodeDeployment(serverBaseUrl, publicBaseUrl, fetchWithAuth, input) {
    const archiveBlob = await readArchiveBlob(input.archivePath);
    const form = new FormData();
    form.set('sessionId', input.sessionId);
    form.set('artifactId', input.artifactId);
    form.set('title', input.title);
    form.set('accessMode', input.accessMode ?? constants_1.HtmlShareAccessMode.Code);
    form.set('clientSourceKey', input.clientSourceKey);
    if (input.quotaReservationId) {
        form.set('quotaReservationId', input.quotaReservationId);
    }
    form.set('sourceSha256', input.sourceSha256);
    form.set('manifest', JSON.stringify(buildManifest(input)));
    form.set('sourceArchive', archiveBlob, 'deployment.zip');
    const response = await fetchWithAuth(`${serverBaseUrl}/api/share-deployments/node`, {
        method: 'POST',
        body: form,
    });
    const payload = (await response.json().catch(() => null));
    const deployment = buildDeploymentRecord(payload?.data, publicBaseUrl);
    if (!response.ok || payload?.code !== 0 || !deployment) {
        return {
            success: false,
            error: payload?.message || `Deployment request failed: ${response.status}`,
            code: payload?.code,
            analysis: input.analysis,
        };
    }
    return {
        success: true,
        deployment,
        analysis: input.analysis,
        warnings: input.analysis.warnings,
    };
}
async function uploadStaticDeployment(serverBaseUrl, publicBaseUrl, fetchWithAuth, input) {
    const archiveBlob = await readArchiveBlob(input.archivePath);
    const form = new FormData();
    form.set('sessionId', input.sessionId);
    form.set('artifactId', input.artifactId);
    form.set('title', input.title);
    form.set('accessMode', input.accessMode ?? constants_1.HtmlShareAccessMode.Code);
    form.set('clientSourceKey', input.clientSourceKey);
    if (input.quotaReservationId) {
        form.set('quotaReservationId', input.quotaReservationId);
    }
    form.set('sourceSha256', input.sourceSha256);
    form.set('manifest', JSON.stringify(buildManifest(input)));
    form.set('sourceArchive', archiveBlob, 'deployment.zip');
    const response = await fetchWithAuth(`${serverBaseUrl}/api/share-deployments/static`, {
        method: 'POST',
        body: form,
    });
    const payload = (await response.json().catch(() => null));
    const deployment = buildDeploymentRecord(payload?.data, publicBaseUrl);
    if (!response.ok || payload?.code !== 0 || !deployment) {
        return {
            success: false,
            error: payload?.message || `Static deployment request failed: ${response.status}`,
            code: payload?.code,
            analysis: input.analysis,
        };
    }
    return {
        success: true,
        deployment,
        analysis: input.analysis,
        warnings: input.analysis.warnings,
    };
}
async function getNodeDeployment(serverBaseUrl, publicBaseUrl, fetchWithAuth, deploymentId) {
    const response = await fetchWithAuth(`${serverBaseUrl}/api/share-deployments/${encodeURIComponent(deploymentId)}`);
    const payload = (await response.json().catch(() => null));
    const deployment = buildDeploymentRecord(payload?.data, publicBaseUrl);
    if (!response.ok || payload?.code !== 0 || !deployment) {
        return {
            success: false,
            error: payload?.message || `Deployment lookup failed: ${response.status}`,
            code: payload?.code,
        };
    }
    return {
        success: true,
        deployment,
    };
}
async function getDeploymentPersistence(serverBaseUrl, fetchWithAuth, deploymentId) {
    const response = await fetchWithAuth(`${serverBaseUrl}/api/share-deployments/${encodeURIComponent(deploymentId)}/persistence`);
    const payload = (await response.json().catch(() => null));
    if (!response.ok || payload?.code !== 0) {
        return {
            success: false,
            error: payload?.message || `Service data lookup failed: ${response.status}`,
            code: payload?.code,
        };
    }
    return {
        success: true,
        persistence: payload.data ?? null,
    };
}
async function downloadDeploymentPersistenceArchive(serverBaseUrl, fetchWithAuth, input) {
    const response = await fetchWithAuth(`${serverBaseUrl}/api/share-deployments/${encodeURIComponent(input.deploymentId)}/persistence/archive`);
    if (response.status === 204) {
        return {
            success: true,
            empty: true,
        };
    }
    const archiveBuffer = Buffer.from(await response.arrayBuffer());
    const payload = parsePersistenceArchiveError(archiveBuffer);
    if (!response.ok && isMissingPersistenceDataError(payload?.message)) {
        return {
            success: true,
            empty: true,
        };
    }
    if (!response.ok || !hasZipArchiveSignature(archiveBuffer)) {
        return {
            success: false,
            error: payload?.message || (response.ok
                ? 'Service data download returned an invalid archive.'
                : `Service data download failed: ${response.status}`),
            code: payload?.code,
        };
    }
    const filePath = await writeDeploymentPersistenceArchive(archiveBuffer, input);
    return {
        success: true,
        filePath,
    };
}
async function getNodeDeploymentByLocalService(serverBaseUrl, publicBaseUrl, fetchWithAuth, input) {
    let matchedShare;
    for (const lookupCandidate of buildDeploymentClientSourceLookups(input)) {
        const lookup = await (0, htmlShareClient_1.getHtmlShareBySource)(serverBaseUrl, publicBaseUrl, fetchWithAuth, lookupCandidate.sourceType, lookupCandidate.clientSourceKey);
        if (!lookup.success) {
            return {
                success: false,
                error: lookup.error,
                code: lookup.code,
            };
        }
        if (lookup.share?.shareId) {
            matchedShare = lookup.share;
            break;
        }
    }
    if (!matchedShare?.shareId) {
        return {
            success: true,
            deployment: null,
        };
    }
    const response = await fetchWithAuth(`${serverBaseUrl}/api/html-shares/${encodeURIComponent(matchedShare.shareId)}/deployment`);
    const payload = (await response.json().catch(() => null));
    const deployment = buildDeploymentRecord(payload?.data, publicBaseUrl);
    if (!response.ok || payload?.code !== 0 || !deployment) {
        return {
            success: false,
            error: payload?.message || `Deployment lookup failed: ${response.status}`,
            code: payload?.code,
        };
    }
    return {
        success: true,
        deployment: {
            ...deployment,
            url: deployment.url || matchedShare.url,
            accessMode: matchedShare.accessMode ?? deployment.accessMode,
            shareCode: matchedShare.shareCode ?? deployment.shareCode,
            shareCodeUnavailable: matchedShare.shareCodeUnavailable ?? deployment.shareCodeUnavailable,
            shareStatus: matchedShare.status ?? deployment.shareStatus,
            disabledSource: matchedShare.disabledSource ?? deployment.disabledSource,
        },
    };
}
function sanitizePersistenceArchiveId(id) {
    return id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'service';
}
async function writeDeploymentPersistenceArchive(archiveBuffer, input) {
    const archiveId = sanitizePersistenceArchiveId(input.shareId || input.deploymentId);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectDirectory = input.projectDirectory?.trim();
    const backupRoot = projectDirectory
        ? path_1.default.join(projectDirectory, '.lobster', 'persistence', archiveId, timestamp)
        : path_1.default.join(os_1.default.homedir(), 'Downloads');
    const fileName = projectDirectory
        ? `${archiveId}-service-data.zip`
        : `${archiveId}-service-data-${timestamp}.zip`;
    await fs_1.default.promises.mkdir(backupRoot, { recursive: true });
    const filePath = path_1.default.join(backupRoot, fileName);
    await fs_1.default.promises.writeFile(filePath, archiveBuffer);
    return filePath;
}
function hasZipArchiveSignature(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b)
        return false;
    return ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[2] === 0x05 && buffer[3] === 0x06) ||
        (buffer[2] === 0x07 && buffer[3] === 0x08));
}
function parsePersistenceArchiveError(buffer) {
    if (buffer.length === 0 || buffer.length > MAX_API_ERROR_RESPONSE_BYTES)
        return null;
    try {
        const payload = JSON.parse(buffer.toString('utf8'));
        return payload && typeof payload === 'object' ? payload : null;
    }
    catch {
        return null;
    }
}
function isMissingPersistenceDataError(message) {
    return message?.toLowerCase().includes('cloud data does not exist') ?? false;
}
//# sourceMappingURL=shareDeploymentClient.js.map
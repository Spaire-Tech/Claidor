"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShareDeploymentOperationCoordinator = exports.ShareDeploymentAccessSyncOperation = void 0;
exports.reconcileShareDeploymentAccess = reconcileShareDeploymentAccess;
const constants_1 = require("../../../shared/htmlShare/constants");
const constants_2 = require("../../../shared/shareDeployment/constants");
exports.ShareDeploymentAccessSyncOperation = {
    AccessMode: 'access_mode',
    Status: 'status',
};
function errorMessage(error) {
    return error instanceof Error ? error.message : undefined;
}
function normalizeAccessMode(value, fallback) {
    return value === constants_1.HtmlShareAccessMode.Public || value === constants_1.HtmlShareAccessMode.Code
        ? value
        : fallback;
}
function isPendingDeploymentStatus(status) {
    return status === constants_2.ShareDeploymentStatus.Queued || status === constants_2.ShareDeploymentStatus.Deploying;
}
function mergeShareUpdate(deployment, result, fallbackAccessMode) {
    const accessMode = normalizeAccessMode(result.accessMode, fallbackAccessMode);
    return {
        ...deployment,
        shareId: result.shareId ?? deployment.shareId,
        url: result.url || deployment.url,
        accessMode,
        shareCode: accessMode === constants_1.HtmlShareAccessMode.Code
            ? result.shareCode ?? deployment.shareCode
            : undefined,
        shareCodeUnavailable: result.shareCodeUnavailable ?? deployment.shareCodeUnavailable,
        shareStatus: result.status ?? deployment.shareStatus,
        disabledSource: result.disabledSource !== undefined
            ? result.disabledSource
            : deployment.disabledSource,
    };
}
async function reconcileShareDeploymentAccess(initialDeployment, intent, updater) {
    let deployment = initialDeployment;
    const failures = [];
    const shareId = deployment.shareId;
    if (!shareId) {
        return { deployment, failures };
    }
    const currentAccessMode = normalizeAccessMode(deployment.accessMode, constants_1.HtmlShareAccessMode.Code);
    const shouldUpdateAccessMode = currentAccessMode !== intent.accessMode ||
        (intent.previousAccessMode !== undefined &&
            intent.previousAccessMode !== intent.accessMode);
    if (shouldUpdateAccessMode) {
        try {
            const accessResult = await updater.updateAccessMode(shareId, intent.accessMode);
            if (!accessResult.success) {
                failures.push({
                    operation: exports.ShareDeploymentAccessSyncOperation.AccessMode,
                    error: accessResult.error,
                });
            }
            else {
                deployment = mergeShareUpdate(deployment, accessResult, intent.accessMode);
            }
        }
        catch (error) {
            failures.push({
                operation: exports.ShareDeploymentAccessSyncOperation.AccessMode,
                error: errorMessage(error),
            });
        }
    }
    if ((failures.length === 0 || intent.targetShareStatus === constants_1.HtmlShareStatus.Disabled) &&
        (intent.targetShareStatus === constants_1.HtmlShareStatus.Disabled ||
            deployment.shareStatus !== intent.targetShareStatus)) {
        try {
            const statusResult = await updater.updateStatus(deployment.shareId ?? shareId, intent.targetShareStatus);
            if (!statusResult.success) {
                failures.push({
                    operation: exports.ShareDeploymentAccessSyncOperation.Status,
                    error: statusResult.error,
                });
            }
            else {
                deployment = mergeShareUpdate(deployment, statusResult, normalizeAccessMode(deployment.accessMode, intent.accessMode));
                deployment = {
                    ...deployment,
                    shareStatus: statusResult.status ?? intent.targetShareStatus,
                };
                if (intent.targetShareStatus === constants_1.HtmlShareStatus.Disabled &&
                    !isPendingDeploymentStatus(deployment.status)) {
                    deployment = {
                        ...deployment,
                        status: constants_2.ShareDeploymentStatus.Stopped,
                    };
                }
            }
        }
        catch (error) {
            failures.push({
                operation: exports.ShareDeploymentAccessSyncOperation.Status,
                error: errorMessage(error),
            });
        }
    }
    return { deployment, failures };
}
class ShareDeploymentOperationCoordinator {
    operationTails = new Map();
    async run(sourceKey, operation) {
        const previousTail = this.operationTails.get(sourceKey) ?? Promise.resolve();
        let releaseCurrent = () => undefined;
        const currentBarrier = new Promise(resolve => {
            releaseCurrent = resolve;
        });
        const currentTail = previousTail
            .catch(() => undefined)
            .then(() => currentBarrier);
        this.operationTails.set(sourceKey, currentTail);
        await previousTail.catch(() => undefined);
        try {
            return await operation();
        }
        finally {
            releaseCurrent();
            if (this.operationTails.get(sourceKey) === currentTail) {
                this.operationTails.delete(sourceKey);
            }
        }
    }
}
exports.ShareDeploymentOperationCoordinator = ShareDeploymentOperationCoordinator;
//# sourceMappingURL=shareDeploymentOperationCoordinator.js.map
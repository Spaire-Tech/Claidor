"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerActivityIpcHandlers = registerActivityIpcHandlers;
const constants_1 = require("../../../shared/activity/constants");
const constants_2 = require("../../../shared/auth/constants");
const activityClient_1 = require("../../libs/activity/activityClient");
const authSessionManager_1 = require("../../libs/authSessionManager");
const failure = (error) => ({
    success: false,
    error: error instanceof Error ? error.message : 'Activity operation failed',
});
const containerApiVersionByPlacement = {
    [constants_1.ActivityPlacement.DesktopSidebar]: constants_1.ActivityContainerApiVersion.NativeDailyCheckInV1,
    [constants_1.ActivityPlacement.DesktopStartupModal]: constants_1.ActivityContainerApiVersion.NativeStartupCreditV1,
};
function validateSlotInput(input) {
    if (!input
        || !Object.values(constants_1.ActivityPlacement).includes(input.placement)) {
        throw new Error('Invalid activity placement');
    }
}
function validateActivityBinding(input) {
    if (!input
        || !Object.values(constants_1.ActivityPlacement).includes(input.placement)
        || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(input.activityCode)
        || !Number.isInteger(input.configRevision)
        || input.configRevision < 1) {
        throw new Error('Invalid activity binding');
    }
}
function validateExecuteInput(input) {
    validateActivityBinding(input);
    if (!/^[a-z0-9_-]{1,64}$/.test(input.actionId)
        || !/^[A-Za-z0-9._:-]{1,64}$/.test(input.idempotencyKey)) {
        throw new Error('Invalid activity idempotency key');
    }
}
function registerActivityIpcHandlers(deps) {
    const actionsInFlight = new Set();
    const activeBindings = new Map();
    const activityFetch = async (url, init, authMode) => {
        if (authMode === activityClient_1.ActivityAuthMode.Required) {
            return deps.fetchWithAuth(url, init);
        }
        if (!deps.hasAuthTokens()) {
            return deps.fetchPublic(url, init);
        }
        try {
            return await deps.fetchWithAuth(url, init);
        }
        catch (error) {
            const status = (0, authSessionManager_1.resolveAuthSessionStatusFromError)(error);
            if (status === constants_2.AuthSessionStatus.Unauthenticated
                || status === constants_2.AuthSessionStatus.Expired) {
                return deps.fetchPublic(url, init);
            }
            throw error;
        }
    };
    const requireMainRenderer = (event) => {
        const mainWindow = deps.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed()
            || event.sender !== mainWindow.webContents
            || event.senderFrame !== mainWindow.webContents.mainFrame) {
            throw new Error('Untrusted activity host sender');
        }
    };
    const loadSlot = async (input) => {
        validateSlotInput(input);
        const result = await (0, activityClient_1.getActivitySlot)(deps.getServerBaseUrl(), activityFetch, {
            placement: input.placement,
            clientVersion: deps.getClientVersion(),
            containerApiVersion: containerApiVersionByPlacement[input.placement],
            platform: deps.platform,
        });
        if (result.success) {
            activeBindings.delete(input.placement);
            if (result.data.slotState === constants_1.ActivitySlotState.Available && result.data.activity) {
                validateActivityBinding(result.data.activity);
                if (result.data.activity.placement !== input.placement) {
                    throw new Error('Activity placement does not match the requested slot');
                }
                activeBindings.set(input.placement, {
                    placement: input.placement,
                    activityCode: result.data.activity.activityCode,
                    configRevision: result.data.activity.configRevision,
                });
            }
        }
        return result;
    };
    function requireActiveBinding(input) {
        validateActivityBinding(input);
        const activeBinding = activeBindings.get(input.placement);
        if (!activeBinding
            || activeBinding.activityCode !== input.activityCode
            || activeBinding.configRevision !== input.configRevision) {
            throw new Error('Activity binding is no longer available');
        }
    }
    deps.ipcMain.handle(constants_1.ActivityIpc.HostGetSlot, async (event, input) => {
        try {
            requireMainRenderer(event);
            validateSlotInput(input);
            return await loadSlot(input);
        }
        catch (error) {
            return failure(error);
        }
    });
    deps.ipcMain.handle(constants_1.ActivityIpc.HostGetContext, async (event, input) => {
        try {
            requireMainRenderer(event);
            requireActiveBinding(input);
            return await (0, activityClient_1.getActivityContext)(deps.getServerBaseUrl(), activityFetch, input.activityCode, input.configRevision);
        }
        catch (error) {
            return failure(error);
        }
    });
    deps.ipcMain.handle(constants_1.ActivityIpc.HostExecuteAction, async (event, input) => {
        try {
            requireMainRenderer(event);
            validateExecuteInput(input);
            requireActiveBinding(input);
            const actionKey = [
                input.placement,
                input.activityCode,
                input.configRevision,
                input.actionId,
            ].join(':');
            if (actionsInFlight.has(actionKey)) {
                return {
                    success: false,
                    error: 'An activity action is already in progress',
                };
            }
            actionsInFlight.add(actionKey);
            try {
                return await (0, activityClient_1.executeActivityAction)(deps.getServerBaseUrl(), activityFetch, input);
            }
            finally {
                actionsInFlight.delete(actionKey);
            }
        }
        catch (error) {
            return failure(error);
        }
    });
}
//# sourceMappingURL=handlers.js.map
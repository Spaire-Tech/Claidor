"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSkinPackKitLifecycle = createSkinPackKitLifecycle;
const constants_1 = require("../../shared/kit/constants");
const kit_1 = require("../../shared/skin/kit");
const openclawConfigImpact_1 = require("../libs/openclawConfigImpact");
const skinPackKit_1 = require("./skinPackKit");
const SKILLS_STATE_KEY = 'skills_state';
function appendToStoreResponse(data, additionalBuiltInKits = []) {
    const parsed = JSON.parse(data);
    const valueContainer = parsed.data;
    const rawValue = valueContainer?.value;
    if (!valueContainer || !rawValue) {
        return data;
    }
    const value = typeof rawValue === 'string'
        ? JSON.parse(rawValue)
        : rawValue;
    const kits = Array.isArray(value.kits) ? value.kits : [];
    const builtInKits = [
        (0, skinPackKit_1.buildSkinPackMarketplaceKit)(),
        ...additionalBuiltInKits,
    ];
    const builtInKitIds = new Set(builtInKits.map(kit => kit.id));
    const withoutDuplicate = kits.filter((kit) => (!kit
        || typeof kit !== 'object'
        || !builtInKitIds.has(kit.id)));
    const nextValue = {
        ...value,
        kits: [
            ...withoutDuplicate,
            ...builtInKits,
        ],
    };
    valueContainer.value = typeof rawValue === 'string' ? JSON.stringify(nextValue) : nextValue;
    return JSON.stringify(parsed);
}
function buildOfflineStoreResponse(additionalBuiltInKits = []) {
    return appendToStoreResponse(JSON.stringify({
        data: {
            value: {
                kits: [],
            },
        },
    }), additionalBuiltInKits);
}
function createSkinPackKitLifecycle(deps) {
    const withPausedSkillWatcher = async (operation) => {
        const skillManager = deps.getSkillManager();
        skillManager.stopWatching();
        let watcherRestarted = false;
        try {
            const result = await operation(skillManager);
            skillManager.startWatching();
            watcherRestarted = true;
            deps.notifySkillsChanged();
            return result;
        }
        finally {
            if (!watcherRestarted) {
                try {
                    skillManager.startWatching();
                }
                catch (error) {
                    console.warn('[SkinPackKit] Failed to restart skill watcher:', error);
                }
            }
        }
    };
    const installIfHandled = async (request) => {
        if (request.kitId !== kit_1.SkinPackKitId.BuiltIn) {
            return undefined;
        }
        if (request.bundleUrl !== kit_1.SkinPackKitBundle.BuiltIn) {
            throw new Error('AI Skin Designer kit bundle URL does not match the built-in catalog entry');
        }
        return withPausedSkillWatcher(async (skillManager) => {
            skillManager.syncBundledSkillsToUserData();
            const skinSkill = skillManager.listSkills().find(skill => skill.id === kit_1.SkinPackSkillId.BuiltIn);
            if (!skinSkill) {
                throw new Error('Bundled AI Skin Creator skill is unavailable');
            }
            skillManager.setSkillEnabled(kit_1.SkinPackSkillId.BuiltIn, true);
            const store = deps.getStore();
            const installedMap = store.get(constants_1.KitStoreKey.Installed) ?? {};
            installedMap[kit_1.SkinPackKitId.BuiltIn] = (0, skinPackKit_1.buildInstalledSkinPackKitRecord)();
            store.set(constants_1.KitStoreKey.Installed, installedMap);
            const syncResult = await deps.syncOpenClawConfig({
                reason: 'ai-skin-designer-kit-installed',
                expectedImpact: openclawConfigImpact_1.OpenClawConfigImpact.Sync,
            });
            if (!syncResult.success) {
                throw new Error(syncResult.error || 'Engine config sync failed after AI Skin Designer install');
            }
            console.log(`[SkinPackKit] Kit installed with bundled skill: ${kit_1.SkinPackSkillId.BuiltIn}`);
            return { success: true, skillIds: [kit_1.SkinPackSkillId.BuiltIn] };
        });
    };
    const uninstallIfHandled = async (kitId) => {
        if (kitId !== kit_1.SkinPackKitId.BuiltIn) {
            return undefined;
        }
        const store = deps.getStore();
        const installedMap = store.get(constants_1.KitStoreKey.Installed) ?? {};
        if (!installedMap[kitId]) {
            return { success: false, error: `Kit "${kitId}" is not installed` };
        }
        return withPausedSkillWatcher(async () => {
            const stateMap = store.get(SKILLS_STATE_KEY) ?? {};
            stateMap[kit_1.SkinPackSkillId.BuiltIn] = { enabled: false };
            store.set(SKILLS_STATE_KEY, stateMap);
            delete installedMap[kitId];
            store.set(constants_1.KitStoreKey.Installed, installedMap);
            const syncResult = await deps.syncOpenClawConfig({
                reason: 'ai-skin-designer-kit-uninstalled',
                expectedImpact: openclawConfigImpact_1.OpenClawConfigImpact.Sync,
            });
            if (!syncResult.success) {
                throw new Error(syncResult.error || 'Engine config sync failed after AI Skin Designer uninstall');
            }
            console.log('[SkinPackKit] Kit uninstalled successfully');
            return { success: true };
        });
    };
    return {
        appendToStoreResponse,
        buildOfflineStoreResponse,
        installIfHandled,
        uninstallIfHandled,
    };
}
//# sourceMappingURL=skinPackKitLifecycle.js.map
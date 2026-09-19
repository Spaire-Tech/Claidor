"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSkinToolHandler = createSkinToolHandler;
const constants_1 = require("../../shared/skin/constants");
const presentation_1 = require("../../shared/skin/presentation");
const skinPresentation_1 = require("./skinPresentation");
const skinStore_1 = require("./skinStore");
const errorResult = (message, code) => ({
    content: [{ type: 'text', text: message }],
    isError: true,
    details: {
        status: 'failed',
        code,
    },
});
const readOptionalString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const readSkinId = (args) => (readOptionalString(args.skinId) ?? readOptionalString(args.draftId));
const isSkinAssetSlot = (value) => (typeof value === 'string' && constants_1.SKIN_ASSET_SLOTS.includes(value));
function createSkinToolHandler(options) {
    return async (request) => {
        if (!options.isWorkflowAllowed(request.context.sessionKey)) {
            return errorResult('Skin management is available only inside the AI Skin Designer workflow.', 'workflow_not_allowed');
        }
        const action = readOptionalString(request.args.action);
        try {
            if (action === constants_1.SkinToolAction.CreateDraft) {
                const presentation = request.args.presentation === undefined
                    ? undefined
                    : (0, presentation_1.parseSkinPresentation)(request.args.presentation);
                if (request.args.presentation !== undefined && !presentation) {
                    return errorResult('presentation must use the supported immersive shell schema and accessible colors.', 'invalid_arguments');
                }
                const skin = await options.store.createDraft({
                    name: readOptionalString(request.args.name),
                    baseThemeId: readOptionalString(request.args.baseThemeId),
                    workflowKind: constants_1.SkinWorkflowKind.SkinPack,
                    ...(presentation ? { presentation } : {}),
                });
                const presented = (0, skinPresentation_1.presentSkin)(skin);
                return {
                    content: [{
                            type: 'text',
                            text: `Skin draft created. skinId: ${skin.id}`,
                        }],
                    details: {
                        status: skin.status,
                        skinId: skin.id,
                        skin: presented,
                    },
                };
            }
            if (action === constants_1.SkinToolAction.RegisterAsset) {
                const skinId = readSkinId(request.args);
                const slot = request.args.slot;
                const source = readOptionalString(request.args.sourcePath);
                if (!skinId || !isSkinAssetSlot(slot) || !source) {
                    return errorResult('skinId, a supported slot, and sourcePath are required for register_asset.', 'invalid_arguments');
                }
                await options.store.registerAsset({ skinId, slot, source });
                const skin = await options.store.getSkin(skinId);
                if (!skin)
                    return errorResult('Skin does not exist.', 'skin_not_found');
                const presented = (0, skinPresentation_1.presentSkin)(skin);
                return {
                    content: [{
                            type: 'text',
                            text: `Registered ${slot} for skin ${skinId}. Status: ${skin.status}.`,
                        }],
                    details: {
                        status: skin.status,
                        skinId,
                        slot,
                        skin: presented,
                    },
                };
            }
            if (action === constants_1.SkinToolAction.Status) {
                const skinId = readSkinId(request.args);
                if (!skinId)
                    return errorResult('skinId is required for status.', 'invalid_arguments');
                const skin = await options.store.getSkin(skinId);
                if (!skin)
                    return errorResult('Skin does not exist.', 'skin_not_found');
                const presented = (0, skinPresentation_1.presentSkin)(skin);
                return {
                    content: [{
                            type: 'text',
                            text: `Skin ${skinId} status: ${skin.status}. Registered slots: ${Object.keys(skin.assets).join(', ') || 'none'}.`,
                        }],
                    details: {
                        status: skin.status,
                        skinId,
                        skin: presented,
                    },
                };
            }
            if (action === constants_1.SkinToolAction.Apply) {
                const skinId = readSkinId(request.args);
                if (!skinId)
                    return errorResult('skinId is required for apply.', 'invalid_arguments');
                const skin = await options.store.apply(skinId);
                const presented = (0, skinPresentation_1.presentSkin)(skin);
                options.onChanged?.();
                return {
                    content: [{ type: 'text', text: `Skin ${skinId} was applied.` }],
                    details: {
                        status: 'applied',
                        skinId,
                        skin: presented,
                    },
                };
            }
            if (action === constants_1.SkinToolAction.Deactivate) {
                await options.store.deactivate();
                options.onChanged?.();
                return {
                    content: [{ type: 'text', text: 'The active skin was deactivated.' }],
                    details: { status: 'deactivated' },
                };
            }
            return errorResult('Unsupported skin management action.', 'unsupported_action');
        }
        catch (error) {
            if (error instanceof skinStore_1.SkinStoreError) {
                return errorResult(error.message, error.code);
            }
            return errorResult(error instanceof Error ? error.message : 'Skin management failed.', 'internal_error');
        }
    };
}
//# sourceMappingURL=skinToolHandler.js.map
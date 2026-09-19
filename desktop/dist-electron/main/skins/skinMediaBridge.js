"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkinMediaBridge = void 0;
const constants_1 = require("../../shared/skin/constants");
const mediaGenerationPolicy_1 = require("../mediaGenerationPolicy");
const skinToolHandler_1 = require("./skinToolHandler");
const workflowError = (message, code) => ({
    content: [{ type: 'text', text: message }],
    isError: true,
    details: { status: 'failed', code },
});
const readRequestedSkinId = (args) => {
    if (typeof args.skinId === 'string')
        return args.skinId.trim();
    if (typeof args.draftId === 'string')
        return args.draftId.trim();
    return '';
};
class SkinMediaBridge {
    options;
    skinToolHandler;
    constructor(options) {
        this.options = options;
        this.skinToolHandler = (0, skinToolHandler_1.createSkinToolHandler)({
            store: options.store,
            isWorkflowAllowed: (sessionKey) => {
                const sessionId = options.resolveSessionId(sessionKey);
                return options.workflowRegistry.resolve(sessionId)?.state.workflowKind
                    === constants_1.SkinWorkflowKind.SkinPack;
            },
            onChanged: options.onChanged,
        });
    }
    async handleToolRequest(request) {
        const sessionId = this.options.resolveSessionId(request.context.sessionKey);
        const resolved = this.options.workflowRegistry.resolve(sessionId);
        if (!sessionId || resolved?.state.workflowKind !== constants_1.SkinWorkflowKind.SkinPack) {
            return workflowError('Skin management is available only inside the AI Skin Designer workflow.', 'workflow_not_allowed');
        }
        const { state } = resolved;
        const action = typeof request.args.action === 'string' ? request.args.action : '';
        const requestedSkinId = readRequestedSkinId(request.args);
        if (action === constants_1.SkinToolAction.CreateDraft && state.draftSkinId) {
            return workflowError('This workflow already has a skin draft.', 'draft_already_created');
        }
        if (action !== constants_1.SkinToolAction.CreateDraft
            && action !== constants_1.SkinToolAction.Deactivate
            && !state.draftSkinId) {
            return workflowError('Create the skin draft before continuing.', 'draft_required');
        }
        if (action !== constants_1.SkinToolAction.CreateDraft
            && requestedSkinId
            && state.draftSkinId
            && requestedSkinId !== state.draftSkinId) {
            return workflowError('The skinId does not belong to this workflow.', 'skin_id_mismatch');
        }
        const result = await this.skinToolHandler(request);
        if (!result.isError && action === constants_1.SkinToolAction.CreateDraft) {
            const skinId = typeof result.details?.skinId === 'string'
                ? result.details.skinId
                : undefined;
            if (skinId)
                this.options.workflowRegistry.recordDraft(sessionId, skinId);
        }
        if (!result.isError
            && (action === constants_1.SkinToolAction.Apply || action === constants_1.SkinToolAction.Deactivate)) {
            this.options.workflowRegistry.finishWorkflow(sessionId);
        }
        return result;
    }
    async preflightLobsterImageGeneration(sessionId, selection) {
        const resolved = this.options.workflowRegistry.resolve(sessionId);
        if (!sessionId
            || resolved?.state.workflowKind !== constants_1.SkinWorkflowKind.SkinPack
            || selection?.mode !== mediaGenerationPolicy_1.MediaSelectionMode.Image) {
            return null;
        }
        const { state } = resolved;
        if (!state.draftSkinId) {
            return workflowError('Create the skin draft before generating its first asset.', 'draft_required');
        }
        const draft = await this.options.store.getSkin(state.draftSkinId);
        if (!draft) {
            return workflowError('The skin draft no longer exists.', 'skin_not_found');
        }
        if (constants_1.SKIN_ASSET_SLOTS.every(slot => draft.assets[slot])) {
            return workflowError('All required skin slots are already registered. Apply the skin to continue.', 'skin_assets_complete');
        }
        return null;
    }
}
exports.SkinMediaBridge = SkinMediaBridge;
//# sourceMappingURL=skinMediaBridge.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkinRuntimeController = void 0;
const constants_1 = require("../../shared/skin/constants");
const skinMediaBridge_1 = require("./skinMediaBridge");
const skinStore_1 = require("./skinStore");
const skinWorkflowRegistry_1 = require("./skinWorkflowRegistry");
class SkinRuntimeController {
    store;
    workflowRegistry;
    mediaBridge;
    constructor(options) {
        this.store = new skinStore_1.SkinStore({ rootDir: options.rootDir });
        this.workflowRegistry = new skinWorkflowRegistry_1.SkinWorkflowRegistry({
            getInstalledKits: options.getInstalledKits,
            getParentSessionId: options.getParentSessionId,
        });
        this.mediaBridge = new skinMediaBridge_1.SkinMediaBridge({
            store: this.store,
            workflowRegistry: this.workflowRegistry,
            resolveSessionId: options.resolveSessionId,
            resolveMediaSelection: options.resolveMediaSelection,
            onChanged: options.onChanged,
        });
    }
    prepareTurn(input) {
        return this.workflowRegistry.prepareTurn(input);
    }
    handlesTool(tool) {
        return tool === constants_1.SkinToolName.Manage;
    }
    handleToolRequest(request) {
        return this.mediaBridge.handleToolRequest(request);
    }
    preflightLobsterImageGeneration(sessionId, selection) {
        return this.mediaBridge.preflightLobsterImageGeneration(sessionId, selection);
    }
    handleRuntimeComplete(sessionId) {
        this.workflowRegistry.handleRuntimeComplete(sessionId);
    }
    handleRuntimeError(sessionId) {
        this.workflowRegistry.handleRuntimeError(sessionId);
    }
    handleSessionDeleted(sessionId) {
        this.workflowRegistry.handleSessionDeleted(sessionId);
    }
}
exports.SkinRuntimeController = SkinRuntimeController;
//# sourceMappingURL=skinRuntimeController.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkinPackKitMetadata = exports.SkinPackKitBundle = exports.SkinPackSkillId = exports.SkinPackKitId = void 0;
const constants_1 = require("./constants");
exports.SkinPackKitId = {
    BuiltIn: 'ai-skin-designer',
};
exports.SkinPackSkillId = {
    BuiltIn: 'skin-creator',
};
exports.SkinPackKitBundle = {
    BuiltIn: `builtin://${exports.SkinPackKitId.BuiltIn}`,
};
exports.SkinPackKitMetadata = {
    Version: '0.3.0',
    IconUrl: 'https://ydhardwarecommon.nosdn.127.net/2f862627ac5bd30d4292f9752e7828e6.png',
    WorkflowKind: constants_1.SkinWorkflowKind.SkinPack,
};
//# sourceMappingURL=kit.js.map
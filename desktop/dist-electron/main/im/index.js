"use strict";
/**
 * IM Gateway Module Index
 * Re-exports all IM gateway related modules
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIMMediaInstruction = exports.stripMediaMarkers = exports.parseMediaMarkers = exports.IMGatewayManager = exports.IMCoworkHandler = exports.IMChatHandler = exports.NimGateway = exports.IMStore = void 0;
__exportStar(require("./types"), exports);
var imStore_1 = require("./imStore");
Object.defineProperty(exports, "IMStore", { enumerable: true, get: function () { return imStore_1.IMStore; } });
var nimGateway_1 = require("./nimGateway");
Object.defineProperty(exports, "NimGateway", { enumerable: true, get: function () { return nimGateway_1.NimGateway; } });
var imChatHandler_1 = require("./imChatHandler");
Object.defineProperty(exports, "IMChatHandler", { enumerable: true, get: function () { return imChatHandler_1.IMChatHandler; } });
var imCoworkHandler_1 = require("./imCoworkHandler");
Object.defineProperty(exports, "IMCoworkHandler", { enumerable: true, get: function () { return imCoworkHandler_1.IMCoworkHandler; } });
var imGatewayManager_1 = require("./imGatewayManager");
Object.defineProperty(exports, "IMGatewayManager", { enumerable: true, get: function () { return imGatewayManager_1.IMGatewayManager; } });
var dingtalkMediaParser_1 = require("./dingtalkMediaParser");
Object.defineProperty(exports, "parseMediaMarkers", { enumerable: true, get: function () { return dingtalkMediaParser_1.parseMediaMarkers; } });
Object.defineProperty(exports, "stripMediaMarkers", { enumerable: true, get: function () { return dingtalkMediaParser_1.stripMediaMarkers; } });
var imMediaInstruction_1 = require("./imMediaInstruction");
Object.defineProperty(exports, "buildIMMediaInstruction", { enumerable: true, get: function () { return imMediaInstruction_1.buildIMMediaInstruction; } });
//# sourceMappingURL=index.js.map
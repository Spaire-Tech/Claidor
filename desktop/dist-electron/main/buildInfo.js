"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readBuildInfo = readBuildInfo;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../shared/buildStamp/constants");
/**
 * The build stamp of the running app, read once from the packaged
 * `package.json`. From a checkout (`electron:dev`) the file has no stamp
 * and this says `dev`.
 */
let cached;
function readBuildInfo() {
    if (cached)
        return cached;
    try {
        const raw = fs_1.default.readFileSync(path_1.default.join(electron_1.app.getAppPath(), 'package.json'), 'utf8');
        cached = (0, constants_1.buildInfoFrom)(JSON.parse(raw));
    }
    catch (error) {
        console.warn('[App] could not read the build stamp:', error);
        cached = constants_1.DEV_BUILD;
    }
    return cached;
}
//# sourceMappingURL=buildInfo.js.map
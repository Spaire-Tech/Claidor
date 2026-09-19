"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentOpenClawVersion = getCurrentOpenClawVersion;
exports.getCurrentOpenClawPatchDir = getCurrentOpenClawPatchDir;
exports.readCurrentOpenClawPatch = readCurrentOpenClawPatch;
exports.expectPatchContains = expectPatchContains;
exports.expectCurrentOpenClawPatchMissing = expectCurrentOpenClawPatchMissing;
exports.getOpenClawSourceDir = getOpenClawSourceDir;
exports.isOpenClawSourceAvailable = isOpenClawSourceAvailable;
exports.expectOpenClawSourceContains = expectOpenClawSourceContains;
exports.findBundledOpenClawRuntimeBundlePath = findBundledOpenClawRuntimeBundlePath;
exports.isBundledOpenClawRuntimeAvailable = isBundledOpenClawRuntimeAvailable;
exports.expectBundledOpenClawRuntimeContains = expectBundledOpenClawRuntimeContains;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const vitest_1 = require("vitest");
function getCurrentOpenClawVersion() {
    const packageJson = JSON.parse(fs_1.default.readFileSync(path_1.default.resolve('package.json'), 'utf8'));
    const openclawVersion = packageJson.openclaw?.version;
    (0, vitest_1.expect)(openclawVersion).toBeTruthy();
    return openclawVersion;
}
function getCurrentOpenClawPatchDir() {
    const patchDir = path_1.default.resolve('scripts', 'patches', getCurrentOpenClawVersion());
    (0, vitest_1.expect)(fs_1.default.existsSync(patchDir)).toBe(true);
    return patchDir;
}
function readCurrentOpenClawPatch(patchFile) {
    const patchPath = path_1.default.join(getCurrentOpenClawPatchDir(), patchFile);
    (0, vitest_1.expect)(fs_1.default.existsSync(patchPath)).toBe(true);
    const patchContent = fs_1.default.readFileSync(patchPath, 'utf8');
    (0, vitest_1.expect)(patchContent.trim().length).toBeGreaterThan(0);
    return patchContent;
}
function expectPatchContains(patchFile, snippets) {
    const patchContent = readCurrentOpenClawPatch(patchFile);
    for (const snippet of snippets) {
        (0, vitest_1.expect)(patchContent).toContain(snippet);
    }
}
function expectCurrentOpenClawPatchMissing(patchFile) {
    const patchPath = path_1.default.join(getCurrentOpenClawPatchDir(), patchFile);
    (0, vitest_1.expect)(fs_1.default.existsSync(patchPath)).toBe(false);
}
function getOpenClawSourceDir() {
    return process.env.OPENCLAW_SRC
        ? path_1.default.resolve(process.env.OPENCLAW_SRC)
        : path_1.default.resolve('..', 'openclaw');
}
function isOpenClawSourceAvailable() {
    return fs_1.default.existsSync(path_1.default.join(getOpenClawSourceDir(), 'package.json'));
}
function expectOpenClawSourceContains(checks) {
    const openclawSourceDir = getOpenClawSourceDir();
    (0, vitest_1.expect)(fs_1.default.existsSync(path_1.default.join(openclawSourceDir, 'package.json'))).toBe(true);
    for (const check of checks) {
        const sourcePath = path_1.default.join(openclawSourceDir, check.file);
        (0, vitest_1.expect)(fs_1.default.existsSync(sourcePath)).toBe(true);
        const source = fs_1.default.readFileSync(sourcePath, 'utf8');
        for (const snippet of check.snippets) {
            (0, vitest_1.expect)(source).toContain(snippet);
        }
    }
}
function findBundledOpenClawRuntimeBundlePath() {
    const runtimeDir = path_1.default.resolve('vendor', 'openclaw-runtime');
    if (!fs_1.default.existsSync(runtimeDir))
        return null;
    const candidates = [
        path_1.default.join(runtimeDir, 'current', 'gateway-bundle.mjs'),
        ...fs_1.default.readdirSync(runtimeDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
            .map((entry) => path_1.default.join(runtimeDir, entry.name, 'gateway-bundle.mjs')),
    ];
    return candidates.find((candidate, index) => (candidates.indexOf(candidate) === index && fs_1.default.existsSync(candidate))) ?? null;
}
function isBundledOpenClawRuntimeAvailable() {
    return findBundledOpenClawRuntimeBundlePath() !== null;
}
function expectBundledOpenClawRuntimeContains(snippets) {
    const runtimePath = findBundledOpenClawRuntimeBundlePath();
    (0, vitest_1.expect)(runtimePath).toBeTruthy();
    const source = fs_1.default.readFileSync(runtimePath, 'utf8');
    for (const snippet of snippets) {
        (0, vitest_1.expect)(source).toContain(snippet);
    }
}
//# sourceMappingURL=patchTestUtils.js.map
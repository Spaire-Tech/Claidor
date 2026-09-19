"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isComputerUseKitSupportedPlatform = isComputerUseKitSupportedPlatform;
exports.buildComputerUseMarketplaceKit = buildComputerUseMarketplaceKit;
exports.getInstalledKitsMap = getInstalledKitsMap;
exports.isComputerUseKitInstalled = isComputerUseKitInstalled;
exports.buildInstalledComputerUseKitRecord = buildInstalledComputerUseKitRecord;
exports.removeComputerUseSkillArtifacts = removeComputerUseSkillArtifacts;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/computerUse/constants");
const constants_2 = require("../../shared/kit/constants");
const computerUseRuntime_1 = require("./computerUseRuntime");
const SKILLS_DIR_NAME = 'SKILLs';
const SKILL_STATE_KEY = 'skills_state';
const COMPUTER_USE_KIT_ICON_URL = 'https://ydhardwarecommon.nosdn.127.net/c0c9390a70b99645de82a673a66d5ae1.png';
const COMPUTER_USE_MCP_REF = {
    id: constants_1.ComputerUseKitId.BuiltIn,
    name: 'Computer Use',
    description: 'Built-in local Windows desktop control MCP server.',
};
function isComputerUseKitSupportedPlatform() {
    return process.platform === computerUseRuntime_1.ComputerUseRuntime.Platform
        && process.arch === computerUseRuntime_1.ComputerUseRuntime.Arch;
}
function buildComputerUseMarketplaceKit() {
    return {
        id: constants_1.ComputerUseKitId.BuiltIn,
        name: constants_1.ComputerUseKitMetadata.Name,
        description: constants_1.ComputerUseKitMetadata.Description,
        icon: COMPUTER_USE_KIT_ICON_URL,
        author: 'Caisra',
        version: computerUseRuntime_1.ComputerUseRuntime.Version,
        tryAsking: [
            {
                en: 'Open Notepad and type a short note',
                zh: '打开记事本并输入一段简短笔记',
            },
            {
                en: 'List the desktop applications I can control',
                zh: '列出可以操作的桌面应用',
            },
        ],
        skills: {
            bundle: constants_1.ComputerUseKitBundle.BuiltIn,
            bundleSha256: constants_1.ComputerUseKitBundleIntegrity.Sha256,
            bundleSizeBytes: constants_1.ComputerUseKitBundleIntegrity.SizeBytes,
            list: [
                {
                    id: constants_1.ComputerUseSkillId.BuiltIn,
                    name: constants_1.ComputerUseKitMetadata.SkillName,
                    description: constants_1.ComputerUseKitMetadata.SkillDescription,
                },
            ],
        },
        mcpServers: [COMPUTER_USE_MCP_REF],
        connectors: [],
    };
}
function getInstalledKitsMap(store) {
    return store.get(constants_2.KitStoreKey.Installed) ?? {};
}
function isComputerUseKitInstalled(store) {
    return isComputerUseKitSupportedPlatform()
        && Boolean(getInstalledKitsMap(store)[constants_1.ComputerUseKitId.BuiltIn]);
}
function buildInstalledComputerUseKitRecord(skillIds, metadata) {
    const skills = {
        skillIds,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    };
    return {
        id: constants_1.ComputerUseKitId.BuiltIn,
        version: computerUseRuntime_1.ComputerUseRuntime.Version,
        installedAt: Date.now(),
        skills,
        mcpServers: [COMPUTER_USE_MCP_REF],
        connectors: [],
    };
}
function getUserComputerUseSkillDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), SKILLS_DIR_NAME, constants_1.ComputerUseSkillId.BuiltIn);
}
function removeComputerUseSkillArtifacts(store) {
    fs_1.default.rmSync(getUserComputerUseSkillDir(), { recursive: true, force: true });
    const stateMap = store.get(SKILL_STATE_KEY) ?? {};
    delete stateMap[constants_1.ComputerUseSkillId.BuiltIn];
    store.set(SKILL_STATE_KEY, stateMap);
}
//# sourceMappingURL=computerUseKit.js.map
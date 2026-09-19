"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCoworkApiConfig = loadCoworkApiConfig;
exports.saveCoworkApiConfig = saveCoworkApiConfig;
exports.deleteCoworkApiConfig = deleteCoworkApiConfig;
const electron_1 = require("electron");
const fs_1 = require("fs");
const path_1 = require("path");
const CONFIG_FILE_NAME = 'api-config.json';
function getConfigPath() {
    const userDataPath = electron_1.app.getPath('userData');
    return (0, path_1.join)(userDataPath, CONFIG_FILE_NAME);
}
function loadCoworkApiConfig() {
    try {
        const configPath = getConfigPath();
        if (!(0, fs_1.existsSync)(configPath)) {
            return null;
        }
        const raw = (0, fs_1.readFileSync)(configPath, 'utf8');
        const config = JSON.parse(raw);
        if (config.apiKey && config.baseURL && config.model) {
            const normalizedApiType = config.apiType === 'openai' || config.apiType === 'anthropic'
                ? config.apiType
                : 'anthropic';
            config.apiType = normalizedApiType;
            return config;
        }
        return null;
    }
    catch (error) {
        console.error('[cowork-config] Failed to load API config:', error);
        return null;
    }
}
function saveCoworkApiConfig(config) {
    const configPath = getConfigPath();
    const userDataPath = electron_1.app.getPath('userData');
    if (!(0, fs_1.existsSync)(userDataPath)) {
        (0, fs_1.mkdirSync)(userDataPath, { recursive: true });
    }
    if (!config.apiKey || !config.baseURL || !config.model) {
        throw new Error('Invalid config: apiKey, baseURL, and model are required');
    }
    const normalized = {
        apiKey: config.apiKey.trim(),
        baseURL: config.baseURL.trim(),
        model: config.model.trim(),
        apiType: config.apiType === 'openai' ? 'openai' : 'anthropic',
    };
    (0, fs_1.writeFileSync)(configPath, JSON.stringify(normalized, null, 2), 'utf8');
    console.info('[cowork-config] API config saved successfully');
}
function deleteCoworkApiConfig() {
    try {
        const configPath = getConfigPath();
        if ((0, fs_1.existsSync)(configPath)) {
            (0, fs_1.unlinkSync)(configPath);
            console.info('[cowork-config] API config deleted');
        }
    }
    catch (error) {
        console.error('[cowork-config] Failed to delete API config:', error);
    }
}
//# sourceMappingURL=coworkConfigStore.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROXY_RESOLUTION_TARGETS = void 0;
exports.isSystemProxyEnabled = isSystemProxyEnabled;
exports.setSystemProxyEnabled = setSystemProxyEnabled;
exports.setActiveSystemProxyUrl = setActiveSystemProxyUrl;
exports.getActiveSystemProxyUrl = getActiveSystemProxyUrl;
exports.restoreOriginalProxyEnv = restoreOriginalProxyEnv;
exports.applySystemProxyEnv = applySystemProxyEnv;
exports.resolveSystemProxyUrl = resolveSystemProxyUrl;
exports.resolveSystemProxyUrlForTargets = resolveSystemProxyUrlForTargets;
const electron_1 = require("electron");
const PROXY_ENV_KEYS = [
    'http_proxy',
    'https_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'no_proxy',
    'NO_PROXY',
];
const originalProxyEnv = PROXY_ENV_KEYS.reduce((acc, key) => {
    acc[key] = process.env[key];
    return acc;
}, {});
let systemProxyEnabled = false;
let activeSystemProxyUrl = null;
exports.DEFAULT_PROXY_RESOLUTION_TARGETS = [
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://generativelanguage.googleapis.com',
    'https://openrouter.ai',
];
function setEnvValue(key, value) {
    if (typeof value === 'string' && value.length > 0) {
        process.env[key] = value;
        return;
    }
    delete process.env[key];
}
function parseProxyRule(rule) {
    const normalizedRule = rule.trim();
    if (!normalizedRule || normalizedRule.toUpperCase() === 'DIRECT') {
        return null;
    }
    // Match standard PAC format: TYPE host:port
    // Strictly match host:port to avoid greedy capture of trailing content like ";SOCKS5 ..."
    const match = normalizedRule.match(/^(PROXY|HTTPS?|SOCKS5?|SOCKS4?)\s+([\w.\-]+:\d+)$/i);
    if (!match) {
        // Also try matching URL format: http://host:port (some proxy tools return URLs directly)
        const urlMatch = normalizedRule.match(/^(https?|socks5?|socks4?):\/\/([\w.\-]+:\d+)\/?$/i);
        if (urlMatch) {
            return `${urlMatch[1].toLowerCase()}://${urlMatch[2]}`;
        }
        return null;
    }
    const type = match[1].toUpperCase();
    const hostPort = match[2];
    if (type === 'HTTPS') {
        return `https://${hostPort}`;
    }
    if (type.startsWith('SOCKS4')) {
        return `socks4://${hostPort}`;
    }
    if (type.startsWith('SOCKS')) {
        return `socks5://${hostPort}`;
    }
    return `http://${hostPort}`;
}
function isSystemProxyEnabled() {
    return systemProxyEnabled;
}
function setSystemProxyEnabled(enabled) {
    systemProxyEnabled = enabled;
}
function setActiveSystemProxyUrl(proxyUrl) {
    activeSystemProxyUrl = proxyUrl;
}
function getActiveSystemProxyUrl() {
    return activeSystemProxyUrl;
}
function restoreOriginalProxyEnv() {
    PROXY_ENV_KEYS.forEach((key) => {
        setEnvValue(key, originalProxyEnv[key]);
    });
    setActiveSystemProxyUrl(null);
}
function applySystemProxyEnv(proxyUrl) {
    // Always start from original env so toggling is reversible and predictable.
    restoreOriginalProxyEnv();
    setActiveSystemProxyUrl(proxyUrl);
    if (!proxyUrl) {
        return;
    }
    setEnvValue('http_proxy', proxyUrl);
    setEnvValue('https_proxy', proxyUrl);
    setEnvValue('HTTP_PROXY', proxyUrl);
    setEnvValue('HTTPS_PROXY', proxyUrl);
}
async function resolveSystemProxyUrl(targetUrl) {
    if (!electron_1.app.isReady()) {
        return null;
    }
    try {
        const proxyResult = await electron_1.session.defaultSession.resolveProxy(targetUrl);
        if (!proxyResult) {
            return null;
        }
        const rules = proxyResult.split(';');
        for (const rule of rules) {
            const proxyUrl = parseProxyRule(rule);
            if (proxyUrl) {
                return proxyUrl;
            }
        }
    }
    catch (error) {
        console.error('Failed to resolve system proxy:', error);
    }
    return null;
}
async function resolveSystemProxyUrlForTargets(targetUrls = exports.DEFAULT_PROXY_RESOLUTION_TARGETS) {
    for (const targetUrl of targetUrls) {
        const proxyUrl = await resolveSystemProxyUrl(targetUrl);
        if (proxyUrl) {
            return { proxyUrl, targetUrl };
        }
    }
    return { proxyUrl: null, targetUrl: null };
}
//# sourceMappingURL=systemProxy.js.map
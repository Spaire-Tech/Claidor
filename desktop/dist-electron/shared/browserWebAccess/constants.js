"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBrowserWebAccessConfig = exports.normalizeBrowserCdpUrl = exports.normalizeBrowserHostnamePolicyList = exports.normalizeBrowserHostnameList = exports.normalizeBrowserStringList = exports.defaultBrowserWebAccessConfig = exports.AgentBrowserToolPhase = exports.OpenClawBrowserGatewayMethod = exports.BrowserControlRequestMethod = exports.BrowserIpc = exports.BrowserDiagnosticStatus = exports.BrowserDiagnosticStep = exports.BrowserSnapshotMode = exports.BrowserNetworkMode = exports.BrowserDisplayMode = exports.AgentBrowserPartition = exports.BrowserRuntimeProfile = exports.BrowserProfileMode = void 0;
const constants_1 = require("../browserCredentials/constants");
exports.BrowserProfileMode = {
    Managed: 'managed',
    User: 'user',
    Custom: 'custom',
};
exports.BrowserRuntimeProfile = {
    Managed: 'openclaw',
    InApp: 'caisra-in-app',
    User: 'user',
};
exports.AgentBrowserPartition = {
    Default: 'persist:lobster-agent-browser',
};
exports.BrowserDisplayMode = {
    InApp: 'in-app',
    External: 'external',
};
exports.BrowserNetworkMode = {
    ProxyCompatible: 'proxy-compatible',
    Strict: 'strict',
};
exports.BrowserSnapshotMode = {
    Default: 'default',
    Efficient: 'efficient',
};
exports.BrowserDiagnosticStep = {
    GatewayStatus: 'gateway-status',
    Profiles: 'profiles',
    BrowserStatus: 'browser-status',
    BrowserStart: 'browser-start',
    OpenTestPage: 'open-test-page',
};
exports.BrowserDiagnosticStatus = {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
};
exports.BrowserIpc = {
    GetStatus: 'openclaw:browser:getStatus',
    ListProfiles: 'openclaw:browser:listProfiles',
    Test: 'openclaw:browser:test',
    ResetProfile: 'openclaw:browser:resetProfile',
    GetHostState: 'openclaw:browser:getHostState',
    SetHostView: 'openclaw:browser:setHostView',
    NavigateHost: 'openclaw:browser:navigateHost',
    GoBackHost: 'openclaw:browser:goBackHost',
    GoForwardHost: 'openclaw:browser:goForwardHost',
    ReloadHost: 'openclaw:browser:reloadHost',
    StopHost: 'openclaw:browser:stopHost',
    SelectHostPage: 'openclaw:browser:selectHostPage',
    CloseHostPage: 'openclaw:browser:closeHostPage',
    ResolveCredentialSavePrompt: 'openclaw:browser:resolveCredentialSavePrompt',
    HostState: 'openclaw:browser:hostState',
};
exports.BrowserControlRequestMethod = {
    Get: 'GET',
    Post: 'POST',
    Delete: 'DELETE',
};
exports.OpenClawBrowserGatewayMethod = {
    Request: 'browser.request',
};
exports.AgentBrowserToolPhase = {
    Start: 'start',
    Update: 'update',
    Result: 'result',
};
exports.defaultBrowserWebAccessConfig = {
    browserEnabled: true,
    profileMode: exports.BrowserProfileMode.Managed,
    // In the app, not a second Chromium on the Desktop. The founder
    // designed the panel the agent browses in, and upstream shipped
    // `External` — so the app opened a separate browser window and the
    // designed screen was never reached. Flagged in Stage 5 as "a founder
    // decision" and left alone, which meant shipping upstream's choice.
    displayMode: exports.BrowserDisplayMode.InApp,
    networkMode: exports.BrowserNetworkMode.ProxyCompatible,
    followGlobalProxy: true,
    allowedHostnames: [],
    blockedHostnames: [],
    snapshotMode: exports.BrowserSnapshotMode.Efficient,
    evaluateEnabled: true,
    credentialUseMode: constants_1.BrowserCredentialUseMode.AlwaysAsk,
    credentialSaveMode: constants_1.BrowserCredentialSaveMode.Ask,
    webFetch: {
        enabled: true,
        followGlobalProxy: true,
        readability: true,
    },
};
const normalizeOptionalString = (value) => {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
};
const normalizeOptionalNumber = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
    }
    return value > 0 ? value : undefined;
};
const normalizeBrowserStringList = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value
        .filter((item) => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)));
};
exports.normalizeBrowserStringList = normalizeBrowserStringList;
const BrowserUrlProtocol = {
    Http: 'http:',
    Https: 'https:',
    Ws: 'ws:',
    Wss: 'wss:',
};
const BrowserAccessRootDomainSuffixes = new Set([
    'ai',
    'app',
    'biz',
    'cc',
    'cn',
    'co',
    'com',
    'dev',
    'edu',
    'gov',
    'info',
    'io',
    'me',
    'net',
    'org',
    'tv',
]);
const BrowserAccessCompoundDomainSuffixes = new Set([
    'co.uk',
    'com.au',
    'com.cn',
    'com.hk',
    'com.tw',
    'net.cn',
    'org.cn',
]);
const BrowserAccessUrlSchemePattern = /^([a-z][a-z0-9+.-]*):\/\//i;
const BrowserIpv4HostnamePattern = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const resolveBrowserAccessProtocol = (value) => {
    const match = value.trim().match(BrowserAccessUrlSchemePattern);
    if (!match) {
        return BrowserUrlProtocol.Https;
    }
    const protocol = `${match[1].toLowerCase()}:`;
    return protocol === BrowserUrlProtocol.Http || protocol === BrowserUrlProtocol.Https
        ? protocol
        : BrowserUrlProtocol.Https;
};
const parseBrowserHostnameEntry = (value) => {
    const withoutProtocol = value.trim().replace(BrowserAccessUrlSchemePattern, '');
    const withoutAuth = withoutProtocol.includes('@')
        ? withoutProtocol.slice(withoutProtocol.lastIndexOf('@') + 1)
        : withoutProtocol;
    const hostWithPort = (withoutAuth.split(/[/?#]/, 1)[0] ?? '').trim().toLowerCase();
    if (!hostWithPort) {
        return null;
    }
    if (hostWithPort.startsWith('[')) {
        const ipv6Match = hostWithPort.match(/^\[([^\]]+)\](?::(\d+))?$/);
        if (!ipv6Match) {
            return null;
        }
        return { hostname: ipv6Match[1], port: ipv6Match[2] };
    }
    if ((hostWithPort.match(/:/g) ?? []).length > 1) {
        return { hostname: hostWithPort };
    }
    const hostPortMatch = hostWithPort.match(/^(.+?)(?::(\d+))?$/);
    const hostname = hostPortMatch?.[1]?.replace(/\.+$/, '') ?? '';
    if (!hostname || /\s/.test(hostname)) {
        return null;
    }
    return { hostname, port: hostPortMatch?.[2] };
};
const shouldAddBrowserWwwPrefix = (hostname) => {
    if (hostname === 'localhost'
        || hostname.endsWith('.localhost')
        || hostname.endsWith('.local')
        || hostname.startsWith('*.')
        || hostname.startsWith('www.')
        || hostname.includes(':')
        || BrowserIpv4HostnamePattern.test(hostname)) {
        return false;
    }
    const labels = hostname.split('.').filter(Boolean);
    if (labels.length === 2) {
        return BrowserAccessRootDomainSuffixes.has(labels[1]);
    }
    if (labels.length === 3) {
        return BrowserAccessCompoundDomainSuffixes.has(`${labels[1]}.${labels[2]}`);
    }
    return false;
};
const normalizeBrowserAccessHostname = (hostname) => {
    const normalized = hostname.toLowerCase().replace(/\.+$/, '');
    if (!normalized) {
        return '';
    }
    return shouldAddBrowserWwwPrefix(normalized) ? `www.${normalized}` : normalized;
};
const formatBrowserUrlHostname = (hostname) => (hostname.includes(':') && !hostname.startsWith('*.') ? `[${hostname}]` : hostname);
const normalizeBrowserAccessUrl = (value) => {
    const parsed = parseBrowserHostnameEntry(value);
    if (!parsed) {
        return '';
    }
    const hostname = normalizeBrowserAccessHostname(parsed.hostname);
    if (!hostname) {
        return '';
    }
    if (hostname.startsWith('*.')) {
        return hostname;
    }
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${resolveBrowserAccessProtocol(value)}//${formatBrowserUrlHostname(hostname)}${port}`;
};
const normalizeBrowserHostnameList = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value
        .filter((item) => typeof item === 'string')
        .map(item => normalizeBrowserAccessUrl(item))
        .filter(Boolean)));
};
exports.normalizeBrowserHostnameList = normalizeBrowserHostnameList;
const normalizeBrowserHostnamePolicyList = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return Array.from(new Set(value
        .filter((item) => typeof item === 'string')
        .map(item => parseBrowserHostnameEntry(item)?.hostname.toLowerCase().replace(/\.+$/, '') ?? '')
        .filter(Boolean)));
};
exports.normalizeBrowserHostnamePolicyList = normalizeBrowserHostnamePolicyList;
const normalizeBrowserCdpUrl = (value) => {
    const normalized = normalizeOptionalString(value);
    if (!normalized) {
        return undefined;
    }
    try {
        const parsed = new URL(normalized);
        return [
            BrowserUrlProtocol.Http,
            BrowserUrlProtocol.Https,
            BrowserUrlProtocol.Ws,
            BrowserUrlProtocol.Wss,
        ].includes(parsed.protocol) ? normalized : undefined;
    }
    catch {
        return undefined;
    }
};
exports.normalizeBrowserCdpUrl = normalizeBrowserCdpUrl;
const normalizeBrowserWebAccessConfig = (value) => {
    const webFetch = value?.webFetch ?? {};
    const profileMode = Object.values(exports.BrowserProfileMode).includes(value?.profileMode)
        ? value?.profileMode
        : exports.defaultBrowserWebAccessConfig.profileMode;
    // No `headless === false → External` inference here any more.
    //
    // Upstream inferred it, as back-compat for a settings screen that
    // offered "show the browser window". This product does not offer that
    // choice — the founder designed the panel the agent browses in — and
    // the inference meant a `headless: false` left in the store by that
    // screen silently overrode the default and sent the agent off to a
    // second Chromium on the Desktop, forever. Changing the default could
    // never fix it, because a default only applies when nothing is stored.
    const displayMode = Object.values(exports.BrowserDisplayMode).includes(value?.displayMode)
        ? value?.displayMode
        : exports.defaultBrowserWebAccessConfig.displayMode;
    const networkMode = Object.values(exports.BrowserNetworkMode).includes(value?.networkMode)
        ? value?.networkMode
        : exports.defaultBrowserWebAccessConfig.networkMode;
    const snapshotMode = Object.values(exports.BrowserSnapshotMode).includes(value?.snapshotMode)
        ? value?.snapshotMode
        : exports.defaultBrowserWebAccessConfig.snapshotMode;
    const credentialUseMode = Object.values(constants_1.BrowserCredentialUseMode).includes(value?.credentialUseMode)
        ? value?.credentialUseMode
        : exports.defaultBrowserWebAccessConfig.credentialUseMode;
    const credentialSaveMode = Object.values(constants_1.BrowserCredentialSaveMode).includes(value?.credentialSaveMode)
        ? value?.credentialSaveMode
        : exports.defaultBrowserWebAccessConfig.credentialSaveMode;
    const executablePath = normalizeOptionalString(value?.executablePath);
    const cdpUrl = (0, exports.normalizeBrowserCdpUrl)(value?.cdpUrl);
    const remoteCdpTimeoutMs = normalizeOptionalNumber(value?.remoteCdpTimeoutMs);
    const remoteCdpHandshakeTimeoutMs = normalizeOptionalNumber(value?.remoteCdpHandshakeTimeoutMs);
    const extraArgs = (0, exports.normalizeBrowserStringList)(value?.extraArgs);
    const timeoutSeconds = normalizeOptionalNumber(webFetch.timeoutSeconds);
    const maxRedirects = normalizeOptionalNumber(webFetch.maxRedirects);
    const maxChars = normalizeOptionalNumber(webFetch.maxChars);
    const userAgent = normalizeOptionalString(webFetch.userAgent);
    return {
        browserEnabled: value?.browserEnabled ?? exports.defaultBrowserWebAccessConfig.browserEnabled,
        profileMode,
        displayMode,
        networkMode,
        followGlobalProxy: value?.followGlobalProxy ?? exports.defaultBrowserWebAccessConfig.followGlobalProxy,
        allowedHostnames: (0, exports.normalizeBrowserHostnameList)(value?.allowedHostnames),
        blockedHostnames: (0, exports.normalizeBrowserHostnameList)(value?.blockedHostnames),
        snapshotMode,
        evaluateEnabled: value?.evaluateEnabled ?? exports.defaultBrowserWebAccessConfig.evaluateEnabled,
        credentialUseMode,
        credentialSaveMode,
        ...(executablePath ? { executablePath } : {}),
        ...(cdpUrl ? { cdpUrl } : {}),
        ...(value?.attachOnly === true ? { attachOnly: true } : {}),
        ...(remoteCdpTimeoutMs ? { remoteCdpTimeoutMs } : {}),
        ...(remoteCdpHandshakeTimeoutMs ? { remoteCdpHandshakeTimeoutMs } : {}),
        ...(extraArgs.length ? { extraArgs } : {}),
        webFetch: {
            enabled: webFetch.enabled ?? exports.defaultBrowserWebAccessConfig.webFetch.enabled,
            followGlobalProxy: webFetch.followGlobalProxy ?? exports.defaultBrowserWebAccessConfig.webFetch.followGlobalProxy,
            ...(timeoutSeconds ? { timeoutSeconds } : {}),
            ...(maxRedirects ? { maxRedirects } : {}),
            ...(maxChars ? { maxChars } : {}),
            ...(userAgent ? { userAgent } : {}),
            readability: webFetch.readability ?? exports.defaultBrowserWebAccessConfig.webFetch.readability,
            ...(webFetch.allowRfc2544BenchmarkRange === true ? { allowRfc2544BenchmarkRange: true } : {}),
        },
    };
};
exports.normalizeBrowserWebAccessConfig = normalizeBrowserWebAccessConfig;
//# sourceMappingURL=constants.js.map
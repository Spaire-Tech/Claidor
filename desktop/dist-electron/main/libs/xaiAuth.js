"use strict";
/**
 * xAI (Grok) OAuth login for desktop.
 *
 * Mirrors the OAuth flows of the bundled OpenClaw xai extension
 * (openclaw/extensions/xai/xai-oauth.ts) so the resulting credential is
 * shape-compatible with what `openclaw models auth login --provider xai`
 * produces:
 *   1. OIDC discovery on https://auth.x.ai
 *   2a. Browser PKCE flow with the fixed loopback redirect
 *       http://127.0.0.1:56121/callback, or
 *   2b. Device-code flow (no loopback callback; used when the port is busy)
 *   3. The credential is persisted into the OpenClaw auth-profiles store
 *      (<stateDir>/agents/main/agent/auth-profiles.json)
 *
 * From there the OpenClaw runtime resolves the Bearer token per request and
 * auto-refreshes it via the xai plugin's refreshOAuth hook — LobsterAI never
 * manages token refresh itself. The store is read with mtime-based cache
 * invalidation, so external writes take effect without a gateway restart.
 *
 * The OAuth constants must stay identical to the pinned OpenClaw version:
 * the client id and redirect URI are registered with xAI for the shared
 * client and cannot be changed independently.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.XaiCallbackPortBusyError = void 0;
exports.getXaiAuthStorePath = getXaiAuthStorePath;
exports.getXaiOAuthStatus = getXaiOAuthStatus;
exports.hasXaiOAuthCredential = hasXaiOAuthCredential;
exports.logoutXai = logoutXai;
exports.startXaiOAuthLogin = startXaiOAuthLogin;
exports.startXaiDeviceCodeLogin = startXaiDeviceCodeLogin;
exports.cancelXaiLogin = cancelXaiLogin;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const agent_1 = require("../../shared/agent");
// ─── Constants mirrored from openclaw/extensions/xai/xai-oauth.ts ───────────
const XAI_OAUTH_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const XAI_OAUTH_SCOPE = 'openid profile email offline_access grok-cli:access api:access';
const XAI_OAUTH_ISSUER = 'https://auth.x.ai';
const XAI_OAUTH_DISCOVERY_URL = `${XAI_OAUTH_ISSUER}/.well-known/openid-configuration`;
const XAI_OAUTH_CALLBACK_HOST = '127.0.0.1';
const XAI_OAUTH_CALLBACK_PORT = 56121;
const XAI_OAUTH_CALLBACK_PATH = '/callback';
const XAI_OAUTH_REDIRECT_URI = `http://${XAI_OAUTH_CALLBACK_HOST}:${XAI_OAUTH_CALLBACK_PORT}${XAI_OAUTH_CALLBACK_PATH}`;
// Hosts whose CORS preflight against the loopback redirect URI is echoed;
// everything else gets a 204 without `Access-Control-Allow-*`.
const XAI_OAUTH_CALLBACK_CORS_ORIGIN_ALLOWLIST = ['auth.x.ai', 'accounts.x.ai'];
const XAI_OAUTH_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const XAI_OAUTH_FETCH_TIMEOUT_MS = 30 * 1000;
const XAI_DEVICE_CODE_DEFAULT_INTERVAL_MS = 5 * 1000;
const XAI_DEVICE_CODE_MIN_INTERVAL_MS = 1 * 1000;
const XAI_DEVICE_CODE_SLOW_DOWN_INCREMENT_MS = 5 * 1000;
const XAI_DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
const XAI_PROVIDER_ID = 'xai';
// Matches openclaw's auth-profiles store constants.
const AUTH_STORE_VERSION = 1;
const AUTH_PROFILE_FILENAME = 'auth-profiles.json';
const AUTH_STORE_LOCK_TIMEOUT_MS = 5 * 1000;
const AUTH_STORE_LOCK_STALE_MS = 30 * 1000;
let activeLogin = null;
// Synchronous reentrancy guard: `activeLogin` is only armed once a flow can
// actually be cancelled (server listening / device poll started), so a second
// start() racing through the async setup steps needs this flag to be refused.
let loginInProgress = false;
// ─── Small helpers ───────────────────────────────────────────────────────────
const trimNonEmpty = (value) => {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
function isTrustedXaiOAuthEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:')
            return false;
        return url.hostname === 'x.ai' || url.hostname.endsWith('.x.ai');
    }
    catch {
        return false;
    }
}
function requireTrustedXaiOAuthEndpoint(endpoint, label) {
    if (!isTrustedXaiOAuthEndpoint(endpoint)) {
        throw new Error(`xAI OAuth discovery returned untrusted ${label}`);
    }
    return endpoint;
}
function generateHexPkce() {
    const verifier = crypto_1.default.randomBytes(32).toString('hex');
    const challenge = crypto_1.default.createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}
function decodeJwtPayload(token) {
    if (!token)
        return {};
    const part = token.split('.')[1];
    if (!part)
        return {};
    try {
        const parsed = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
function resolveIdentity(tokens) {
    const payload = decodeJwtPayload(tokens.idToken ?? tokens.accessToken);
    return {
        ...(trimNonEmpty(payload.email) ? { email: trimNonEmpty(payload.email) } : {}),
        ...(trimNonEmpty(payload.name) ? { displayName: trimNonEmpty(payload.name) } : {}),
        ...(trimNonEmpty(payload.sub) ? { accountId: trimNonEmpty(payload.sub) } : {}),
    };
}
async function fetchJson(url, init) {
    const resp = await electron_1.session.defaultSession.fetch(url, {
        method: init.method ?? 'GET',
        headers: { Accept: 'application/json', ...(init.headers ?? {}) },
        ...(init.body !== undefined ? { body: init.body } : {}),
        signal: AbortSignal.timeout(XAI_OAUTH_FETCH_TIMEOUT_MS),
    });
    let body = null;
    try {
        body = await resp.json();
    }
    catch {
        body = null;
    }
    return { ok: resp.ok, status: resp.status, body };
}
function readOAuthError(body) {
    const record = body && typeof body === 'object' ? body : {};
    return {
        ...(typeof record.error === 'string' ? { error: record.error } : {}),
        ...(typeof record.error_description === 'string' ? { description: record.error_description } : {}),
    };
}
function formatOAuthFailure(context, status, body) {
    const { error, description } = readOAuthError(body);
    if (error && description)
        return `${context} failed (${status}): ${error} (${description})`;
    if (error)
        return `${context} failed (${status}): ${error}`;
    return `${context} failed (${status})`;
}
async function fetchXaiDiscovery() {
    const { ok, status, body } = await fetchJson(XAI_OAUTH_DISCOVERY_URL, {});
    if (!ok) {
        throw new Error(formatOAuthFailure('xAI OAuth discovery', status, body));
    }
    const record = body && typeof body === 'object' ? body : {};
    const authorizationEndpoint = trimNonEmpty(record.authorization_endpoint);
    const tokenEndpoint = trimNonEmpty(record.token_endpoint);
    const deviceAuthorizationEndpoint = trimNonEmpty(record.device_authorization_endpoint);
    return {
        ...(authorizationEndpoint
            ? { authorizationEndpoint: requireTrustedXaiOAuthEndpoint(authorizationEndpoint, 'authorization endpoint') }
            : {}),
        ...(tokenEndpoint
            ? { tokenEndpoint: requireTrustedXaiOAuthEndpoint(tokenEndpoint, 'token endpoint') }
            : {}),
        ...(deviceAuthorizationEndpoint
            ? { deviceAuthorizationEndpoint: requireTrustedXaiOAuthEndpoint(deviceAuthorizationEndpoint, 'device authorization endpoint') }
            : {}),
    };
}
function parseTokenResponse(body, options) {
    const record = body && typeof body === 'object' ? body : {};
    const accessToken = trimNonEmpty(record.access_token);
    if (!accessToken) {
        throw new Error('xAI OAuth token response is missing access_token');
    }
    const refreshToken = trimNonEmpty(record.refresh_token);
    if (options.requireRefreshToken && !refreshToken) {
        throw new Error('xAI OAuth token response is missing refresh_token. Re-run the login; '
            + 'if the issue persists, the offline_access scope was likely rejected.');
    }
    const idToken = trimNonEmpty(record.id_token);
    // RFC 6749 expires_in preferred; the access-token JWT exp is the fallback.
    const expiresIn = typeof record.expires_in === 'number' && record.expires_in > 0
        ? record.expires_in
        : undefined;
    const jwtExp = decodeJwtPayload(accessToken).exp;
    const expiresAt = expiresIn !== undefined
        ? Date.now() + expiresIn * 1000
        : (typeof jwtExp === 'number' && jwtExp > 0 ? jwtExp * 1000 : undefined);
    return {
        accessToken,
        ...(refreshToken ? { refreshToken } : {}),
        ...(idToken ? { idToken } : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
    };
}
async function exchangeToken(params) {
    const { ok, status, body } = await fetchJson(requireTrustedXaiOAuthEndpoint(params.tokenEndpoint, 'token endpoint'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params.body).toString(),
    });
    if (!ok) {
        throw new Error(formatOAuthFailure(params.context, status, body));
    }
    return parseTokenResponse(body, { requireRefreshToken: params.requireRefreshToken });
}
// ─── Auth-profiles store access ──────────────────────────────────────────────
/**
 * Default OpenClaw agent dir used by the runtime's auth-profiles store.
 * Non-main agents fall back to the default agent's OAuth profiles, so one
 * credential here covers every agent.
 */
function getOpenClawDefaultAgentDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'openclaw', 'state', 'agents', agent_1.AgentId.Main, 'agent');
}
function getXaiAuthStorePath() {
    return path_1.default.join(getOpenClawDefaultAgentDir(), AUTH_PROFILE_FILENAME);
}
function readAuthStore() {
    try {
        const raw = fs_1.default.readFileSync(getXaiAuthStorePath(), 'utf8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch (err) {
        const code = err?.code;
        if (code !== 'ENOENT') {
            console.warn('[XaiAuth] failed to read auth-profiles store:', err);
        }
        return null;
    }
}
function listXaiProfiles(store) {
    if (!store?.profiles)
        return [];
    return Object.entries(store.profiles)
        .filter(([, credential]) => (credential
        && typeof credential === 'object'
        && credential.provider === XAI_PROVIDER_ID
        && credential.type === 'oauth'))
        .map(([id, credential]) => ({ id, credential }));
}
/**
 * Serialize store writes against the OpenClaw runtime using the same
 * `<store>.lock` exclusive-create protocol as openclaw's
 * updateAuthProfileStoreWithLock, so a concurrent gateway-side refresh never
 * interleaves with our read-modify-write.
 */
async function withAuthStoreLock(fn) {
    const storePath = getXaiAuthStorePath();
    fs_1.default.mkdirSync(path_1.default.dirname(storePath), { recursive: true, mode: 0o700 });
    const lockPath = `${storePath}.lock`;
    const deadline = Date.now() + AUTH_STORE_LOCK_TIMEOUT_MS;
    for (;;) {
        try {
            const fd = fs_1.default.openSync(lockPath, 'wx');
            fs_1.default.writeSync(fd, `${process.pid}`);
            fs_1.default.closeSync(fd);
            break;
        }
        catch (err) {
            if (err?.code !== 'EEXIST')
                throw err;
            try {
                const stat = fs_1.default.statSync(lockPath);
                if (Date.now() - stat.mtimeMs > AUTH_STORE_LOCK_STALE_MS) {
                    fs_1.default.rmSync(lockPath, { force: true });
                    continue;
                }
            }
            catch {
                continue; // lock vanished between openSync and statSync — retry
            }
            if (Date.now() > deadline) {
                throw new Error('Timed out waiting for the engine auth store lock');
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    try {
        return fn();
    }
    finally {
        fs_1.default.rmSync(lockPath, { force: true });
    }
}
function writeAuthStore(store) {
    const storePath = getXaiAuthStorePath();
    fs_1.default.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    try {
        fs_1.default.chmodSync(storePath, 0o600);
    }
    catch {
        // best-effort on platforms where chmod is a no-op (Windows)
    }
}
async function persistXaiCredential(params) {
    // Same key derivation as openclaw's buildAuthProfileId(provider, email ?? accountId).
    const profileName = params.identity.email ?? params.identity.accountId ?? 'default';
    const profileId = `${XAI_PROVIDER_ID}:${profileName}`;
    const credential = {
        type: 'oauth',
        provider: XAI_PROVIDER_ID,
        access: params.tokens.accessToken,
        ...(params.tokens.refreshToken ? { refresh: params.tokens.refreshToken } : {}),
        ...(params.tokens.expiresAt !== undefined ? { expires: params.tokens.expiresAt } : {}),
        ...(params.identity.email ? { email: params.identity.email } : {}),
        ...(params.identity.displayName ? { displayName: params.identity.displayName } : {}),
        tokenEndpoint: params.tokenEndpoint,
        issuer: XAI_OAUTH_ISSUER,
        ...(params.flow === 'device-code'
            ? {
                authFlow: 'device-code',
                ...(params.deviceAuthorizationEndpoint
                    ? { deviceAuthorizationEndpoint: params.deviceAuthorizationEndpoint }
                    : {}),
            }
            : {}),
        ...(params.tokens.idToken ? { idToken: params.tokens.idToken } : {}),
        ...(params.identity.accountId ? { accountId: params.identity.accountId } : {}),
    };
    await withAuthStoreLock(() => {
        const existing = readAuthStore() ?? { version: AUTH_STORE_VERSION, profiles: {} };
        const profiles = { ...(existing.profiles ?? {}) };
        // LobsterAI models a single xAI account: drop any previous xai profiles so
        // a re-login with another account never leaves a stale credential behind.
        for (const staleId of listXaiProfiles(existing).map((p) => p.id)) {
            delete profiles[staleId];
        }
        profiles[profileId] = credential;
        writeAuthStore({
            ...existing,
            version: existing.version ?? AUTH_STORE_VERSION,
            profiles,
        });
    });
}
// ─── Public status/logout API ────────────────────────────────────────────────
function getXaiOAuthStatus() {
    const profile = listXaiProfiles(readAuthStore())[0];
    if (!profile)
        return { loggedIn: false };
    const email = trimNonEmpty(profile.credential.email);
    const displayName = trimNonEmpty(profile.credential.displayName);
    const expires = profile.credential.expires;
    return {
        loggedIn: true,
        ...(email ? { email } : {}),
        ...(displayName ? { displayName } : {}),
        ...(typeof expires === 'number' && expires > 0 ? { expiresAt: expires } : {}),
    };
}
function hasXaiOAuthCredential() {
    return getXaiOAuthStatus().loggedIn;
}
/**
 * Remove the persisted xAI credential(s). The running gateway notices the
 * store mtime change on the next auth resolution.
 */
async function logoutXai() {
    await withAuthStoreLock(() => {
        const existing = readAuthStore();
        if (!existing?.profiles)
            return;
        const xaiProfileIds = listXaiProfiles(existing).map((p) => p.id);
        if (xaiProfileIds.length === 0)
            return;
        const profiles = { ...existing.profiles };
        for (const id of xaiProfileIds) {
            delete profiles[id];
        }
        writeAuthStore({ ...existing, profiles });
    });
    console.log('[XaiAuth] xai credentials removed from auth-profiles store');
}
// ─── Login flows ─────────────────────────────────────────────────────────────
function renderCallbackHtml(success, message) {
    const safeMessage = message.replace(/[<>&]/g, (c) => c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;');
    const color = success ? '#16a34a' : '#dc2626';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Caisra · xAI Login</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #0b0d10; color: #e5e7eb; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { background: #14171c; padding: 32px 40px; border-radius: 16px; border: 1px solid #262b33; max-width: 420px; }
  h1 { color: ${color}; font-size: 18px; margin: 0 0 8px; }
  p { color: #9ca3af; font-size: 14px; line-height: 1.5; margin: 0; }
</style></head>
<body><div class="card"><h1>${success ? 'Login successful' : 'Login failed'}</h1><p>${safeMessage}</p></div></body></html>`;
}
function resolveCorsOrigin(originHeader) {
    const value = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    if (!value)
        return undefined;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:')
            return undefined;
        return XAI_OAUTH_CALLBACK_CORS_ORIGIN_ALLOWLIST.includes(parsed.host.toLowerCase())
            ? parsed.origin
            : undefined;
    }
    catch {
        return undefined;
    }
}
function buildAuthorizeUrl(params) {
    const url = new URL(params.authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', XAI_OAUTH_CLIENT_ID);
    url.searchParams.set('redirect_uri', XAI_OAUTH_REDIRECT_URI);
    url.searchParams.set('scope', XAI_OAUTH_SCOPE);
    url.searchParams.set('state', params.state);
    url.searchParams.set('nonce', params.nonce);
    url.searchParams.set('code_challenge', params.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('plan', 'generic');
    url.searchParams.set('referrer', 'openclaw');
    return url.toString();
}
/** Wait for the OAuth redirect on the fixed loopback port. */
function waitForCallback(expectedState) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let timeout = null;
        const finish = (err, result) => {
            if (settled)
                return;
            settled = true;
            if (timeout)
                clearTimeout(timeout);
            try {
                server.close();
            }
            catch {
                /* ignore */
            }
            if (activeLogin?.cancel === cancel)
                activeLogin = null;
            if (err)
                reject(err);
            else if (result)
                resolve(result);
            else
                reject(new Error('OAuth callback finished without a result'));
        };
        const cancel = (reason) => finish(reason);
        const server = http_1.default.createServer((req, res) => {
            const origin = resolveCorsOrigin(req.headers.origin);
            if (origin) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
            }
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
            const requestUrl = new URL(req.url ?? '/', `http://${XAI_OAUTH_CALLBACK_HOST}:${XAI_OAUTH_CALLBACK_PORT}`);
            if (requestUrl.pathname !== XAI_OAUTH_CALLBACK_PATH) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }
            if (req.method !== 'GET') {
                res.writeHead(405, { Allow: 'GET, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Method not allowed');
                return;
            }
            const errorParam = requestUrl.searchParams.get('error');
            const code = requestUrl.searchParams.get('code')?.trim();
            const state = requestUrl.searchParams.get('state')?.trim();
            if (errorParam) {
                const description = requestUrl.searchParams.get('error_description');
                const msg = description || errorParam;
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(renderCallbackHtml(false, msg));
                finish(new Error(`OAuth error: ${msg}`));
                return;
            }
            if (!code || !state) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(renderCallbackHtml(false, 'Missing code or state in callback'));
                finish(new Error('Missing OAuth code or state'));
                return;
            }
            if (state !== expectedState) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(renderCallbackHtml(false, 'State mismatch — possible CSRF, login aborted'));
                finish(new Error('OAuth state mismatch'));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderCallbackHtml(true, 'You can now close this tab and return to Caisra.'));
            finish(undefined, { code });
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                finish(new XaiCallbackPortBusyError());
                return;
            }
            finish(err);
        });
        server.listen(XAI_OAUTH_CALLBACK_PORT, XAI_OAUTH_CALLBACK_HOST, () => {
            activeLogin = { cancel };
            timeout = setTimeout(() => {
                finish(new Error('xAI login timed out'));
            }, XAI_OAUTH_LOGIN_TIMEOUT_MS);
        });
    });
}
class XaiCallbackPortBusyError extends Error {
    constructor() {
        super(`Port ${XAI_OAUTH_CALLBACK_PORT} is already in use. `
            + 'If another sign-in from this app is running, finish or cancel it first.');
        this.name = 'XaiCallbackPortBusyError';
    }
}
exports.XaiCallbackPortBusyError = XaiCallbackPortBusyError;
/**
 * Browser PKCE login. Opens the authorize URL in the default browser and
 * waits for the loopback callback. Throws XaiCallbackPortBusyError when the
 * fixed callback port is taken (callers may fall back to the device flow).
 */
async function startXaiOAuthLogin() {
    if (loginInProgress) {
        throw new Error('Another xAI login is already in progress');
    }
    loginInProgress = true;
    try {
        return await runXaiBrowserLogin();
    }
    finally {
        loginInProgress = false;
    }
}
async function runXaiBrowserLogin() {
    const discovery = await fetchXaiDiscovery();
    if (!discovery.authorizationEndpoint || !discovery.tokenEndpoint) {
        throw new Error('xAI OAuth discovery response is missing endpoints');
    }
    const pkce = generateHexPkce();
    const state = crypto_1.default.randomBytes(32).toString('hex');
    const nonce = crypto_1.default.randomBytes(16).toString('hex');
    const authorizeUrl = buildAuthorizeUrl({
        authorizationEndpoint: discovery.authorizationEndpoint,
        state,
        nonce,
        challenge: pkce.challenge,
    });
    const callbackPromise = waitForCallback(state);
    // Surface EADDRINUSE (raced through server.on('error')) before opening the browser.
    const opened = await Promise.race([
        callbackPromise.then((cb) => ({ kind: 'callback', cb }), (err) => ({ kind: 'error', err })),
        new Promise((resolve) => setTimeout(() => resolve({ kind: 'listening' }), 150)),
    ]);
    if (opened.kind === 'error') {
        throw opened.err;
    }
    console.log('[XaiAuth] waiting for OAuth callback on', XAI_OAUTH_REDIRECT_URI);
    void electron_1.shell.openExternal(authorizeUrl).catch((err) => {
        console.warn('[XaiAuth] failed to open browser:', err);
    });
    const { code } = opened.kind === 'callback' ? opened.cb : await callbackPromise;
    const tokens = await exchangeToken({
        tokenEndpoint: discovery.tokenEndpoint,
        context: 'xAI OAuth token exchange',
        requireRefreshToken: true,
        body: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: XAI_OAUTH_REDIRECT_URI,
            client_id: XAI_OAUTH_CLIENT_ID,
            code_verifier: pkce.verifier,
            // xAI validates the PKCE fields again at token exchange for this client.
            code_challenge: pkce.challenge,
            code_challenge_method: 'S256',
        },
    });
    const identity = resolveIdentity(tokens);
    await persistXaiCredential({
        tokens,
        identity,
        tokenEndpoint: discovery.tokenEndpoint,
        flow: 'browser',
    });
    console.log('[XaiAuth] browser login successful', identity.email ? `(${identity.email})` : '');
    return { ...identity, flow: 'browser' };
}
/**
 * Device-code login: requests a user code, reports it via onDeviceCode for
 * the UI to display, then polls the token endpoint until the user approves.
 */
async function startXaiDeviceCodeLogin(onDeviceCode) {
    if (loginInProgress) {
        throw new Error('Another xAI login is already in progress');
    }
    loginInProgress = true;
    let cancelled = null;
    activeLogin = {
        cancel: (reason) => {
            cancelled = reason;
        },
    };
    try {
        const discovery = await fetchXaiDiscovery();
        if (!discovery.deviceAuthorizationEndpoint || !discovery.tokenEndpoint) {
            throw new Error('xAI OAuth discovery response is missing device code endpoints');
        }
        const { ok, status, body } = await fetchJson(discovery.deviceAuthorizationEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: XAI_OAUTH_CLIENT_ID,
                scope: XAI_OAUTH_SCOPE,
            }).toString(),
        });
        if (!ok) {
            throw new Error(formatOAuthFailure('xAI device code request', status, body));
        }
        const record = body && typeof body === 'object' ? body : {};
        const deviceCode = trimNonEmpty(record.device_code);
        const userCode = trimNonEmpty(record.user_code);
        const verificationUri = trimNonEmpty(record.verification_uri);
        const verificationUriComplete = trimNonEmpty(record.verification_uri_complete);
        if (!deviceCode || !userCode || !verificationUri) {
            throw new Error('xAI device code response is missing device_code, user_code, or verification_uri');
        }
        requireTrustedXaiOAuthEndpoint(verificationUri, 'device verification URI');
        if (verificationUriComplete) {
            requireTrustedXaiOAuthEndpoint(verificationUriComplete, 'complete device verification URI');
        }
        const expiresInMs = typeof record.expires_in === 'number' && record.expires_in > 0
            ? record.expires_in * 1000
            : XAI_OAUTH_LOGIN_TIMEOUT_MS;
        let intervalMs = typeof record.interval === 'number' && record.interval > 0
            ? record.interval * 1000
            : XAI_DEVICE_CODE_DEFAULT_INTERVAL_MS;
        onDeviceCode({
            userCode,
            verificationUri,
            ...(verificationUriComplete ? { verificationUriComplete } : {}),
            expiresInMs,
        });
        void electron_1.shell.openExternal(verificationUriComplete ?? verificationUri).catch((err) => {
            console.warn('[XaiAuth] failed to open browser for device code:', err);
        });
        const deadline = Date.now() + expiresInMs;
        for (;;) {
            if (cancelled)
                throw cancelled;
            if (Date.now() >= deadline) {
                throw new Error('xAI device authorization timed out');
            }
            const poll = await fetchJson(discovery.tokenEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: XAI_DEVICE_CODE_GRANT_TYPE,
                    client_id: XAI_OAUTH_CLIENT_ID,
                    device_code: deviceCode,
                }).toString(),
            });
            if (poll.ok) {
                const tokens = parseTokenResponse(poll.body, { requireRefreshToken: true });
                const identity = resolveIdentity(tokens);
                await persistXaiCredential({
                    tokens,
                    identity,
                    tokenEndpoint: discovery.tokenEndpoint,
                    flow: 'device-code',
                    deviceAuthorizationEndpoint: discovery.deviceAuthorizationEndpoint,
                });
                console.log('[XaiAuth] device-code login successful', identity.email ? `(${identity.email})` : '');
                return { ...identity, flow: 'device-code' };
            }
            const { error } = readOAuthError(poll.body);
            if (error === 'authorization_pending') {
                // fall through to sleep
            }
            else if (error === 'slow_down') {
                intervalMs += XAI_DEVICE_CODE_SLOW_DOWN_INCREMENT_MS;
            }
            else if (error === 'access_denied' || error === 'authorization_denied') {
                throw new Error('xAI device authorization was denied');
            }
            else if (error === 'expired_token') {
                throw new Error('xAI device code expired. Re-run the login.');
            }
            else {
                throw new Error(formatOAuthFailure('xAI device token exchange', poll.status, poll.body));
            }
            const delay = Math.min(Math.max(intervalMs, XAI_DEVICE_CODE_MIN_INTERVAL_MS), Math.max(0, deadline - Date.now()));
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    finally {
        activeLogin = null;
        loginInProgress = false;
    }
}
/** Cancel an in-flight login. Safe to call when no login is active. */
function cancelXaiLogin() {
    activeLogin?.cancel(new Error('Login cancelled by user'));
}
//# sourceMappingURL=xaiAuth.js.map
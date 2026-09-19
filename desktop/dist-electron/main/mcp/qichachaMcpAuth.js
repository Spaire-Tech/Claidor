"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startQichachaMcpApiKeyLogin = startQichachaMcpApiKeyLogin;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const http_1 = __importDefault(require("http"));
const QICHACHA_ISSUER = 'https://agent.qcc.com';
const QICHACHA_RESOURCE = 'https://agent.qcc.com/mcp/company/stream';
const QICHACHA_CLIENT_NAME = 'Caisra';
const QICHACHA_AUTH_TIMEOUT_MS = 5 * 60 * 1000;
function base64UrlEncode(buffer) {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
function createPkce() {
    const verifier = base64UrlEncode(crypto_1.default.randomBytes(64));
    return {
        challenge: base64UrlEncode(crypto_1.default.createHash('sha256').update(verifier).digest()),
        state: base64UrlEncode(crypto_1.default.randomBytes(32)),
    };
}
function trimNonEmpty(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function maskSecret(value) {
    return value.length <= 12 ? '***' : `${value.slice(0, 6)}...${value.slice(-4)}`;
}
async function registerQichachaClient(redirectUri) {
    const response = await fetch(`${QICHACHA_ISSUER}/oauth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            client_name: QICHACHA_CLIENT_NAME,
            redirect_uris: [redirectUri],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
        }),
    });
    const text = await response.text();
    let data = null;
    try {
        data = JSON.parse(text);
    }
    catch {
        data = null;
    }
    const clientId = trimNonEmpty(data?.client_id);
    if (!response.ok || !clientId) {
        throw new Error(`Qichacha OAuth client registration failed: HTTP ${response.status}`);
    }
    return clientId;
}
function startCallbackServer(expectedState) {
    return new Promise((resolve, reject) => {
        const server = http_1.default.createServer((req, res) => {
            const parsed = new URL(req.url || '/', 'http://localhost');
            if (parsed.pathname !== '/callback') {
                res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('Not found');
                return;
            }
            const state = parsed.searchParams.get('state');
            if (state !== expectedState) {
                res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('Invalid state');
                return;
            }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<h1>Qichacha authorization complete</h1><p>You can return to Caisra.</p>');
        });
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close();
                reject(new Error('Failed to allocate Qichacha callback port'));
                return;
            }
            resolve({
                redirectUri: `http://localhost:${address.port}/callback`,
                close: () => {
                    try {
                        server.close();
                    }
                    catch {
                        // ignore close races
                    }
                },
            });
        });
    });
}
async function probeQichachaApiKey(win) {
    if (win.isDestroyed())
        return {};
    return await win.webContents.executeJavaScript(`
    (async () => {
      const parseJson = (text) => {
        try { return JSON.parse(text); } catch { return null; }
      };
      const readLoginToken = () => {
        const raw = localStorage.getItem('auth-storage');
        const parsed = parseJson(raw);
        return parsed?.state?.token || parsed?.token || null;
      };
      const loginToken = readLoginToken();
      const request = async (url) => {
        if (!loginToken) return null;
        const response = await fetch(url, {
          headers: { Authorization: 'Bearer ' + loginToken },
          cache: 'no-store',
        });
        const text = await response.text();
        return { status: response.status, json: parseJson(text) };
      };
      const userInfo = await request('/api/user/info');
      const credit = userInfo?.json?.data?.token ? null : await request('/api/user-credit/credit');
      return {
        href: location.href,
        loginTokenPresent: Boolean(loginToken),
        apiKey: userInfo?.json?.data?.token || credit?.json?.data?.token || undefined,
      };
    })();
  `);
}
async function startQichachaMcpApiKeyLogin(parentWindow) {
    const { challenge, state } = createPkce();
    const callbackServer = await startCallbackServer(state);
    let authWindow = null;
    let timeout = null;
    let pollTimer = null;
    try {
        const clientId = await registerQichachaClient(callbackServer.redirectUri);
        const authorizeUrl = `${QICHACHA_ISSUER}/oauth/authorize?${new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: callbackServer.redirectUri,
            scope: 'mcp:tools',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            resource: QICHACHA_RESOURCE,
        }).toString()}`;
        console.log('[QichachaMCP] opening OAuth login window');
        return await new Promise((resolve, reject) => {
            let settled = false;
            const settle = (error, apiKey) => {
                if (settled)
                    return;
                settled = true;
                if (timeout)
                    clearTimeout(timeout);
                if (pollTimer)
                    clearInterval(pollTimer);
                callbackServer.close();
                if (authWindow && !authWindow.isDestroyed()) {
                    authWindow.close();
                }
                if (error)
                    reject(error);
                else
                    resolve(apiKey || '');
            };
            authWindow = new electron_1.BrowserWindow({
                width: 1120,
                height: 860,
                parent: parentWindow || undefined,
                modal: false,
                title: 'Qichacha MCP Authorization',
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true,
                    partition: `qichacha-mcp-auth-${crypto_1.default.randomUUID()}`,
                },
            });
            authWindow.on('closed', () => {
                authWindow = null;
                settle(new Error('Qichacha authorization window was closed before API Key was received.'));
            });
            const probe = async () => {
                try {
                    if (!authWindow || authWindow.isDestroyed())
                        return;
                    const result = await probeQichachaApiKey(authWindow);
                    const apiKey = trimNonEmpty(result.apiKey);
                    if (apiKey) {
                        console.log(`[QichachaMCP] API Key received: ${maskSecret(apiKey)}`);
                        settle(null, apiKey);
                    }
                }
                catch (error) {
                    console.debug('[QichachaMCP] API Key probe failed', error);
                }
            };
            authWindow.webContents.on('did-finish-load', () => {
                void probe();
            });
            pollTimer = setInterval(() => {
                void probe();
            }, 2_000);
            timeout = setTimeout(() => {
                settle(new Error('Qichacha authorization timed out.'));
            }, QICHACHA_AUTH_TIMEOUT_MS);
            authWindow.loadURL(authorizeUrl).catch(error => settle(error));
        });
    }
    catch (error) {
        callbackServer.close();
        if (authWindow && !authWindow.isDestroyed())
            authWindow.close();
        throw error;
    }
}
//# sourceMappingURL=qichachaMcpAuth.js.map
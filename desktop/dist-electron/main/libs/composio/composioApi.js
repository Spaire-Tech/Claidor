"use strict";
/**
 * The app's own side of Composio: the three calls the Connect button
 * needs, and the one Disconnect needs.
 *
 * A twin of `openclaw-extensions/composio/client.ts`, on purpose. The
 * extension is copied into the engine's runtime alone and cannot import
 * from `src/`; main cannot import from the extension without moving the
 * electron build's root. Same paths, same reading of the answers — from
 * `@composio/client` 0.1.0-alpha.76, `resources/tool-router/session/session.mjs`:
 *
 *   POST   /api/v3.1/tool_router/session               { user_id }  → { session_id }
 *   POST   /api/v3.1/tool_router/session/{id}/link     { toolkit }  → { redirect_url }
 *   GET    /api/v3.1/tool_router/session/{id}/toolkits              → items[].connected_account
 *   DELETE /api/v3.1/connected_accounts/{id}
 *
 * **There is no key in the app.** The founder: "my users should never
 * put a key. everything happens under the hood." The calls go to the
 * local token proxy at `/composio`, which forwards them to Claidor's
 * server under the account's sign-in; the server holds Claidor's
 * Composio key and puts the account's own id on every session
 * (`polar/desktop/composio.py`). `apiKey` survives as an option for a
 * test that talks to Composio directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPOSIO_USER_ID = exports.composioBaseUrlFor = exports.COMPOSIO_PROXY_PATH = exports.COMPOSIO_BASE_URL = void 0;
exports.createComposioApi = createComposioApi;
exports.COMPOSIO_BASE_URL = 'https://backend.composio.dev';
/** The local token proxy's path for Composio; the server side is `/api/proxy/composio`. */
exports.COMPOSIO_PROXY_PATH = '/composio';
const composioBaseUrlFor = (tokenProxyPort) => (`http://127.0.0.1:${tokenProxyPort}${exports.COMPOSIO_PROXY_PATH}`);
exports.composioBaseUrlFor = composioBaseUrlFor;
/**
 * What the app sends as the user id. The server replaces it with the
 * account's own id, so this is a placeholder and never the identity.
 */
exports.COMPOSIO_USER_ID = 'default';
const isRecord = (value) => (!!value && typeof value === 'object' && !Array.isArray(value));
const describeFailure = (status, payload) => {
    if (isRecord(payload)) {
        const error = payload.error;
        if (typeof error === 'string' && error.trim())
            return `HTTP ${status}: ${error.trim()}`;
        if (isRecord(error) && typeof error.message === 'string')
            return `HTTP ${status}: ${error.message}`;
        if (typeof payload.message === 'string')
            return `HTTP ${status}: ${payload.message}`;
    }
    return `HTTP ${status}`;
};
function createComposioApi(options) {
    const fetchImpl = options.fetch ?? fetch;
    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    const userId = options.userId ?? exports.COMPOSIO_USER_ID;
    let sessionId = null;
    const request = async (method, path, body) => {
        const response = await fetchImpl(`${baseUrl}${path}`, {
            method,
            headers: {
                ...(options.apiKey ? { 'x-api-key': options.apiKey } : {}),
                accept: 'application/json',
                ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        const text = await response.text();
        let payload = null;
        if (text.trim()) {
            try {
                payload = JSON.parse(text);
            }
            catch {
                payload = text;
            }
        }
        if (!response.ok) {
            // The provider's own sentence, into the log and the card. The
            // `upstream_refused` lesson: a refusal without its reason is two
            // hours of guessing.
            const reason = response.status === 401
                ? 'You are signed out. Sign in again to connect apps.'
                : response.status === 503
                    ? 'Apps are not switched on for this server yet.'
                    : `Composio ${describeFailure(response.status, payload)}`;
            console.warn(`[Connections] composio ${method} ${path} — ${reason}`);
            throw new Error(reason);
        }
        return payload;
    };
    const session = () => {
        if (!sessionId) {
            sessionId = request('POST', '/api/v3.1/tool_router/session', { user_id: userId })
                .then(created => {
                if (typeof created.session_id !== 'string' || !created.session_id) {
                    throw new Error('Composio did not return a session id.');
                }
                return created.session_id;
            })
                .catch(error => {
                sessionId = null;
                throw error;
            });
        }
        return sessionId;
    };
    const toolkits = async () => {
        const id = await session();
        const listed = await request('GET', `/api/v3.1/tool_router/session/${encodeURIComponent(id)}/toolkits`);
        return (listed.items ?? [])
            .filter((item) => (typeof item.slug === 'string'))
            .map(item => {
            const account = item.connected_account;
            const active = !!account && (account.status ?? '').toUpperCase() === 'ACTIVE';
            return {
                toolkit: item.slug.toLowerCase(),
                connected: active,
                ...(active && account?.id ? { connectedAccountId: account.id } : {}),
            };
        });
    };
    return {
        async authorizationUrl(toolkit) {
            const id = await session();
            const link = await request('POST', `/api/v3.1/tool_router/session/${encodeURIComponent(id)}/link`, { toolkit: toolkit.toLowerCase() });
            if (typeof link.redirect_url !== 'string' || !link.redirect_url) {
                throw new Error(`Composio gave no sign-in link for ${toolkit}.`);
            }
            return link.redirect_url;
        },
        async toolkitState(toolkit) {
            const slug = toolkit.toLowerCase();
            return (await toolkits()).find(one => one.toolkit === slug) ?? { toolkit: slug, connected: false };
        },
        async disconnect(toolkit) {
            const state = await this.toolkitState(toolkit);
            if (!state.connectedAccountId)
                return false;
            await request('DELETE', `/api/v3.1/connected_accounts/${encodeURIComponent(state.connectedAccountId)}`);
            return true;
        },
    };
}
//# sourceMappingURL=composioApi.js.map
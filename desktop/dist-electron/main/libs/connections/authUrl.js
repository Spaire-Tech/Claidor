"use strict";
/**
 * Reading the engine's `mcp login` output.
 *
 * The engine has everything needed to sign a person into a service —
 * `agents/mcp-oauth.ts` does dynamic registration, PKCE and token
 * storage — but the only caller is its CLI, and the CLI's own flow is
 * built for a terminal:
 *
 *     Open this URL to authorize "connection-gmail":
 *     https://accounts.google.com/o/oauth2/v2/auth?...
 *     After approval, run openclaw mcp login connection-gmail --code <code>
 *
 * It prints a URL and expects a person to come back with a code. The app
 * has to hold that middle, so it reads the URL out of the output and
 * catches the redirect itself.
 *
 * Parsing another program's stdout is a thing to do carefully rather than
 * cleverly, which is why it is here on its own with tests rather than
 * inline in the flow.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_CALLBACK_PATH = void 0;
exports.findAuthorizationUrl = findAuthorizationUrl;
exports.readCallback = readCallback;
exports.saysAuthorized = saysAuthorized;
exports.failureLine = failureLine;
/** How the OAuth provider hands the code back. */
exports.AUTH_CALLBACK_PATH = '/oauth/callback';
/**
 * The authorization URL in the engine's output, or null.
 *
 * Deliberately strict about what counts. It takes the first `https://`
 * URL that carries OAuth's own required parameters, rather than the
 * first URL on a line — the same output also prints a command containing
 * a server name, and a docs link would be just as wrong to open.
 */
function findAuthorizationUrl(output) {
    for (const raw of output.split(/\s+/)) {
        // Brackets and sentence punctuation are the page's, not the address's.
        const candidate = raw.trim().replace(/^[([<"']+/, '').replace(/[)\]>"',.]+$/, '');
        if (!candidate.startsWith('https://'))
            continue;
        let url;
        try {
            url = new URL(candidate);
        }
        catch {
            continue;
        }
        // An authorization request always names where to come back to and
        // what is being asked for. Anything without both is a different link.
        if (!url.searchParams.get('redirect_uri'))
            continue;
        if (!url.searchParams.get('client_id') && !url.searchParams.get('response_type'))
            continue;
        return candidate;
    }
    return null;
}
function readCallback(requestUrl) {
    let url;
    try {
        // The request line is a path, so it needs somewhere to hang off.
        url = new URL(requestUrl, 'http://127.0.0.1');
    }
    catch {
        return { error: 'That redirect could not be read.' };
    }
    const error = url.searchParams.get('error');
    if (error) {
        const described = url.searchParams.get('error_description');
        return { error: described || error };
    }
    const code = url.searchParams.get('code');
    if (!code)
        return { error: 'The service did not send a code back.' };
    return { code, state: url.searchParams.get('state') ?? undefined };
}
/**
 * Whether a login run actually finished.
 *
 * The CLI says so in a sentence and exits 0 either way — 0 also means
 * "I printed a URL, now go and approve it" — so the exit code alone
 * cannot tell the two apart.
 */
function saysAuthorized(output) {
    return /credentials saved/i.test(output);
}
/**
 * What went wrong, in the engine's own words.
 *
 * Its failures are already sentences aimed at a person ("MCP server "x"
 * is not configured with auth: "oauth"."), so the last non-empty line is
 * more use than anything this could compose. Nothing is invented when
 * there is no output: an empty string means the caller says something
 * general rather than quoting silence.
 */
function failureLine(output) {
    const lines = output.split('\n').map(line => line.trim()).filter(Boolean);
    return lines.length > 0 ? lines[lines.length - 1] : '';
}
//# sourceMappingURL=authUrl.js.map
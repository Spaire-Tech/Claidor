/**
 * The wire between the engine's exec and a command running in the box.
 *
 * The engine's sandbox exec path is argv-shaped: `buildExecSpec` hands back a
 * command line and the engine spawns it as an ordinary local child process
 * (`bash-tools.exec-runtime.ts`, `mode: "child"`). A box has no argv — it is
 * reached over the network — so the plugin spawns `execBridge.mjs`, which
 * speaks this protocol to the broker and pretends to be the process.
 *
 * **Why streamed HTTP and not a WebSocket.** The app reaches the Caisra server
 * through a local token proxy (`openclawTokenProxy.ts`), which injects the
 * account's access token and refreshes it when it expires — so nothing has to
 * write a token into a config file that then goes stale. That proxy has no
 * `upgrade` handler and strips the `upgrade` header
 * (`openclawTokenProxy.ts:883`), so a WebSocket cannot pass through it. One
 * chunked POST can: stdin goes up in the request body, and stdout, stderr and
 * the exit code come back as NDJSON frames as they happen.
 *
 * The cost is interactive stdin: a command cannot be fed after it starts. The
 * engine only asks for that with a pty, and the bridge refuses a pty request
 * rather than hanging on one.
 *
 * Plain JavaScript on purpose: `execBridge.mjs` is spawned by node directly and
 * is never compiled, so the framing has to live somewhere both it and the tests
 * can import without a build step.
 */

/** Frames the broker streams back, one JSON object per line. */
export const SERVER_FRAME_KINDS = Object.freeze(['stdout', 'stderr', 'exit', 'error']);

/** Env var names the plugin uses to hand the bridge its instructions. */
export const BRIDGE_ENV = Object.freeze({
  broker: 'CAISRA_BOX_BROKER',
  token: 'CAISRA_BOX_TOKEN',
  boxId: 'CAISRA_BOX_ID',
  command: 'CAISRA_BOX_COMMAND',
  workdir: 'CAISRA_BOX_WORKDIR',
  env: 'CAISRA_BOX_ENV_JSON',
  pty: 'CAISRA_BOX_PTY',
});

/** Exit codes that are the bridge's own, not the command's. */
export const EXIT_BRIDGE_MISCONFIGURED = 78;
export const EXIT_BRIDGE_TRANSPORT = 79;
export const EXIT_BRIDGE_UNSUPPORTED = 80;

/**
 * Where the bridge posts. The token is NOT in the URL — it goes in the
 * Authorization header, because a URL is the thing that ends up in logs.
 */
export function isLoopbackBroker(rawUrl) {
  try {
    const { hostname } = new URL(String(rawUrl));
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
      || hostname === '[::1]';
  } catch {
    return false;
  }
}

export function buildExecRequestUrl(brokerBaseUrl, boxId) {
  const base = String(brokerBaseUrl ?? '').replace(/\/+$/, '');
  if (!base) {
    throw new Error('Box broker base URL is empty.');
  }
  const url = new URL(`${base}/box/sandboxes/${encodeURIComponent(String(boxId))}/exec`);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Box broker base URL must be http or https, got ${url.protocol}`);
  }
  return url.toString();
}

/** The one request body: everything the box needs to start the command. */
export function encodeExecRequest({ command, workdir, env, usePty, stdin }) {
  return JSON.stringify({
    command: String(command ?? ''),
    workdir: workdir ? String(workdir) : undefined,
    env: env && typeof env === 'object' ? env : {},
    pty: usePty === true,
    stdinBase64: stdin === undefined
      ? undefined
      : (Buffer.isBuffer(stdin) ? stdin : Buffer.from(stdin)).toString('base64'),
  });
}

/**
 * Parse one NDJSON frame from the broker.
 *
 * Returns `{ t: 'error', message }` rather than throwing for anything
 * unparseable: a malformed frame must surface as a failed command, never as an
 * unhandled rejection inside the bridge that leaves the engine waiting forever
 * on a tool call that is never coming back.
 */
export function decodeServerFrame(raw) {
  let parsed;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8'));
  } catch {
    return { t: 'error', message: 'Box sent a frame that is not JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.t !== 'string') {
    return { t: 'error', message: 'Box sent a frame with no kind.' };
  }
  switch (parsed.t) {
    case 'stdout':
    case 'stderr':
      return { t: parsed.t, data: decodeBase64(parsed.d) };
    case 'exit':
      return { t: 'exit', code: Number.isInteger(parsed.code) ? parsed.code : null };
    case 'error':
      return {
        t: 'error',
        message: typeof parsed.message === 'string' && parsed.message
          ? parsed.message
          : 'The box reported an error with no message.',
      };
    default:
      return { t: 'error', message: `Box sent an unknown frame kind: ${parsed.t}` };
  }
}

function decodeBase64(value) {
  return typeof value === 'string' ? Buffer.from(value, 'base64') : Buffer.alloc(0);
}

/**
 * Split a byte stream into NDJSON frames.
 *
 * A chunk boundary can land anywhere, including inside a line, so the leftover
 * is carried forward. Returns the complete lines and what is still pending.
 */
export function splitFrames(pending, chunk) {
  const buffer = pending + (typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((line) => line.trim() !== ''), pending: rest };
}

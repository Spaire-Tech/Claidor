/**
 * The wire between the engine's exec and a command running in the box.
 *
 * The engine's sandbox exec path is argv-shaped: `buildExecSpec` hands back a
 * command line and the engine spawns it as an ordinary local child process
 * (`bash-tools.exec-runtime.ts`, `mode: "child"`). A box has no argv — it is
 * reached over the network — so the plugin spawns `execBridge.mjs`, which speaks
 * this protocol to the broker and pretends to be the process.
 *
 * Plain JavaScript on purpose: `execBridge.mjs` is spawned by node directly and
 * is never compiled, so the framing has to live somewhere both it and the tests
 * can import without a build step.
 */

/** Frames the bridge sends to the broker. */
export const CLIENT_FRAME_KINDS = Object.freeze(['stdin', 'stdin-close', 'signal']);
/** Frames the broker sends back. */
export const SERVER_FRAME_KINDS = Object.freeze(['stdout', 'stderr', 'exit', 'error']);

/** Encode a chunk of stdin for the box. */
export function encodeStdin(chunk) {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  return JSON.stringify({ t: 'stdin', d: buffer.toString('base64') });
}

/** Tell the box no more stdin is coming. */
export function encodeStdinClose() {
  return JSON.stringify({ t: 'stdin-close' });
}

/** Ask the broker to signal the command — how an aborted tool call gets killed. */
export function encodeSignal(signal) {
  return JSON.stringify({ t: 'signal', sig: String(signal || 'SIGTERM') });
}

/**
 * Parse a frame from the broker.
 *
 * Returns `{ t: 'error', message }` rather than throwing for anything
 * unparseable: a malformed frame must surface as a failed command, never as an
 * unhandled rejection inside the bridge that leaves the engine waiting forever.
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
    case 'exit': {
      const code = Number.isInteger(parsed.code) ? parsed.code : null;
      return { t: 'exit', code };
    }
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
  if (typeof value !== 'string') {
    return Buffer.alloc(0);
  }
  return Buffer.from(value, 'base64');
}

/**
 * The exec request, sent once as the first frame after the socket opens.
 * `usePty` is carried even though the engine always spawns us as a plain child:
 * the box side still needs to know whether to allocate a tty.
 */
export function encodeExecRequest({ command, workdir, env, usePty }) {
  return JSON.stringify({
    t: 'exec',
    command: String(command ?? ''),
    workdir: workdir ? String(workdir) : undefined,
    env: env && typeof env === 'object' ? env : {},
    pty: usePty === true,
  });
}

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

/**
 * Where the bridge connects. The token is NOT in the URL — it goes in the
 * Authorization header, because a URL is the thing that ends up in logs.
 */
export function buildExecSocketUrl(brokerBaseUrl, boxId) {
  const base = String(brokerBaseUrl ?? '').replace(/\/+$/, '');
  if (!base) {
    throw new Error('Box broker base URL is empty.');
  }
  const url = new URL(`${base}/api/box/sandboxes/${encodeURIComponent(String(boxId))}/exec`);
  if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else {
    throw new Error(`Box broker base URL must be http or https, got ${url.protocol}`);
  }
  return url.toString();
}

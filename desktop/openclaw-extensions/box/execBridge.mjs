#!/usr/bin/env node
/**
 * Stands in for a process that is not on this machine.
 *
 * The engine's sandbox exec path spawns a local child and treats its stdio as
 * the command's stdio. A box has no local process to spawn, so this script is
 * spawned instead: it posts the command to the broker, streams the box's
 * stdout and stderr back out, and exits with the box's exit code.
 *
 * One request per Shell tool call — the one round trip counted in
 * `docs/product/agent-computer-plan.md` §5. See `execProtocol.mjs` for why this
 * is streamed HTTP rather than a WebSocket.
 *
 * Plain .mjs: it is spawned by node directly, so it must run without a build.
 */
import process from 'node:process';

import {
  BRIDGE_ENV,
  buildExecRequestUrl,
  decodeServerFrame,
  encodeExecRequest,
  EXIT_BRIDGE_MISCONFIGURED,
  EXIT_BRIDGE_TRANSPORT,
  EXIT_BRIDGE_UNSUPPORTED,
  splitFrames,
} from './execProtocol.mjs';

function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    fail(EXIT_BRIDGE_MISCONFIGURED, `Box bridge is missing ${name}.`);
  }
  return value;
}

function parseEnvJson(raw) {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Read stdin to EOF. The engine closes it immediately for a non-pty exec. */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Let buffered stdout drain, or the tail of a command's output is lost. */
function exitAfterFlush(code) {
  if (process.stdout.writableLength === 0) {
    process.exit(code);
    return;
  }
  process.stdout.write('', () => process.exit(code));
}

async function main() {
  const broker = required(BRIDGE_ENV.broker);
  const token = required(BRIDGE_ENV.token);
  const boxId = required(BRIDGE_ENV.boxId);
  // A command may legitimately be empty, so it is read without `required`.
  const command = process.env[BRIDGE_ENV.command] ?? '';
  const workdir = process.env[BRIDGE_ENV.workdir] || undefined;
  const env = parseEnvJson(process.env[BRIDGE_ENV.env]);
  const usePty = process.env[BRIDGE_ENV.pty] === '1';

  if (usePty) {
    // Better to say so than to hang waiting for stdin that will never close.
    fail(
      EXIT_BRIDGE_UNSUPPORTED,
      'The box does not support interactive terminal sessions yet: the account proxy the app '
      + 'reaches the server through cannot carry a two-way connection.',
    );
    return;
  }

  let url;
  try {
    url = buildExecRequestUrl(broker, boxId);
  } catch (error) {
    fail(EXIT_BRIDGE_MISCONFIGURED, `Box bridge cannot build its endpoint: ${error.message}`);
    return;
  }

  const stdin = await readStdin();

  // The engine kills this process to abort a tool call. Aborting the request
  // tells the broker to kill the command in the box, instead of leaving it
  // running unattended.
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      controller.abort();
      exitAfterFlush(EXIT_BRIDGE_TRANSPORT);
    });
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: encodeExecRequest({ command, workdir, env, usePty, stdin }),
      signal: controller.signal,
    });
  } catch (error) {
    fail(EXIT_BRIDGE_TRANSPORT, `Box bridge could not reach the box: ${error?.message ?? error}`);
    return;
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 500);
    } catch {
      // The status alone is still worth reporting.
    }
    fail(EXIT_BRIDGE_TRANSPORT, `Box refused the command: ${response.status} ${detail}`.trim());
    return;
  }
  if (!response.body) {
    fail(EXIT_BRIDGE_TRANSPORT, 'Box answered with no output stream.');
    return;
  }

  let pending = '';
  let exitCode = null;
  for await (const chunk of response.body) {
    const split = splitFrames(pending, chunk);
    pending = split.pending;
    for (const line of split.lines) {
      const frame = decodeServerFrame(line);
      if (frame.t === 'stdout') {
        process.stdout.write(frame.data);
      } else if (frame.t === 'stderr') {
        process.stderr.write(frame.data);
      } else if (frame.t === 'exit') {
        exitCode = frame.code ?? 0;
      } else if (frame.t === 'error') {
        process.stderr.write(`${frame.message}\n`);
        exitAfterFlush(EXIT_BRIDGE_TRANSPORT);
        return;
      }
    }
  }
  // A trailing frame with no newline after it is still a frame.
  if (pending.trim()) {
    const frame = decodeServerFrame(pending);
    if (frame.t === 'exit') {
      exitCode = frame.code ?? 0;
    }
  }

  if (exitCode === null) {
    // The stream ended without the box ever saying how the command finished.
    // Reporting success here would be a lie the agent acts on.
    fail(EXIT_BRIDGE_TRANSPORT, 'Box connection ended before the command finished.');
    return;
  }
  exitAfterFlush(exitCode);
}

main().catch((error) => {
  fail(EXIT_BRIDGE_TRANSPORT, `Box bridge failed: ${error?.message ?? String(error)}`);
});

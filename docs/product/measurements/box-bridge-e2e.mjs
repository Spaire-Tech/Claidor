/**
 * End-to-end check of `execBridge.mjs`, the piece most likely to be silently
 * broken: it stands in for a process that is not on this machine, so nothing
 * about it can be verified by reading it.
 *
 * It stands up a local WebSocket server that plays the broker, spawns the real
 * bridge against it, and asserts on what the engine would have seen — stdout,
 * stderr and the exit code of the child it spawned.
 *
 * This is NOT a check against E2B or against the Caisra server. It proves the
 * bridge speaks its own protocol correctly and dies with the right code. A real
 * box has still never been contacted.
 *
 * Run (needs `ws`, which the desktop app does not depend on — use a checkout
 * that has it, e.g. the engine clone the probe uses):
 *   node docs/product/measurements/box-bridge-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const wsModulePath = process.env.WS_MODULE_PATH || 'ws';
const { WebSocketServer } = require(wsModulePath);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bridgePath = path.join(repoRoot, 'desktop/openclaw-extensions/box/execBridge.mjs');

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}${passed || !detail ? '' : ` — ${detail}`}`);
}

/**
 * Run the bridge against a broker whose behaviour the test supplies.
 * `onExec` receives the socket and the parsed exec request.
 */
async function runBridge({ onExec, env = {}, stdin }) {
  const server = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => server.on('listening', resolve));
  const { port } = server.address();

  let seenAuth = null;
  let execRequest = null;
  const stdinFrames = [];

  server.on('connection', (socket, request) => {
    seenAuth = request.headers.authorization ?? null;
    socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString('utf8'));
      if (frame.t === 'exec') {
        execRequest = frame;
        onExec(socket, frame);
        return;
      }
      stdinFrames.push(frame);
      if (frame.t === 'stdin' && onExec.onStdin) {
        onExec.onStdin(socket, Buffer.from(frame.d, 'base64'));
      }
    });
  });

  const child = spawn(process.execPath, [bridgePath], {
    env: {
      PATH: process.env.PATH,
      CAISRA_BOX_BROKER: `http://127.0.0.1:${port}`,
      CAISRA_BOX_TOKEN: 'test-token',
      CAISRA_BOX_ID: 'box_test',
      CAISRA_BOX_COMMAND: 'echo hi',
      CAISRA_BOX_WORKDIR: '/home/user/workspace',
      CAISRA_BOX_ENV_JSON: JSON.stringify({ FOO: 'bar' }),
      CAISRA_BOX_PTY: '0',
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const out = [];
  const err = [];
  child.stdout.on('data', (c) => out.push(c));
  child.stderr.on('data', (c) => err.push(c));
  if (stdin !== undefined) {
    child.stdin.end(stdin);
  } else {
    child.stdin.end();
  }

  const code = await new Promise((resolve) => child.on('close', resolve));
  await new Promise((resolve) => server.close(resolve));

  return {
    code,
    stdout: Buffer.concat(out).toString('utf8'),
    stderr: Buffer.concat(err).toString('utf8'),
    auth: seenAuth,
    execRequest,
    stdinFrames,
  };
}

const send = (socket, frame) => socket.send(JSON.stringify(frame));
const b64 = (s) => Buffer.from(s).toString('base64');

async function main() {
  {
    const r = await runBridge({
      onExec: (socket) => {
        send(socket, { t: 'stdout', d: b64('hello from the box\n') });
        send(socket, { t: 'exit', code: 0 });
      },
    });
    check('stdout from the box reaches the engine', r.stdout === 'hello from the box\n', JSON.stringify(r.stdout));
    check('a clean command exits 0', r.code === 0, `exit ${r.code} stderr=${r.stderr}`);
    check('the token travels as a bearer header', r.auth === 'Bearer test-token', String(r.auth));
    check(
      'the exec request carries command, workdir, env and pty',
      r.execRequest?.command === 'echo hi'
        && r.execRequest?.workdir === '/home/user/workspace'
        && r.execRequest?.env?.FOO === 'bar'
        && r.execRequest?.pty === false,
      JSON.stringify(r.execRequest),
    );
  }

  {
    const r = await runBridge({
      onExec: (socket) => {
        send(socket, { t: 'stderr', d: b64('no such file\n') });
        send(socket, { t: 'exit', code: 2 });
      },
    });
    check('stderr from the box reaches the engine', r.stderr.includes('no such file'), r.stderr);
    check("the box's exit code becomes the bridge's exit code", r.code === 2, `exit ${r.code}`);
  }

  {
    // The engine writes to the child's stdin; it has to arrive in the box.
    const onExec = (socket) => {
      onExec.socket = socket;
    };
    onExec.onStdin = (socket, chunk) => {
      send(socket, { t: 'stdout', d: b64(`got:${chunk.toString('utf8')}`) });
      send(socket, { t: 'exit', code: 0 });
    };
    const r = await runBridge({ onExec, stdin: 'from-the-engine' });
    check('stdin reaches the box', r.stdout === 'got:from-the-engine', JSON.stringify(r.stdout));
  }

  {
    const r = await runBridge({
      onExec: (socket) => send(socket, { t: 'error', message: 'box is gone' }),
    });
    check('an error frame is reported, not swallowed', r.stderr.includes('box is gone'), r.stderr);
    check('an error frame does not exit 0', r.code !== 0, `exit ${r.code}`);
  }

  {
    const r = await runBridge({ onExec: (socket) => socket.close() });
    check(
      'a broker that hangs up mid-command fails loudly',
      r.code !== 0 && /closed before the command finished/.test(r.stderr),
      `exit ${r.code} stderr=${r.stderr}`,
    );
  }

  {
    const r = await runBridge({
      onExec: (socket) => send(socket, { t: 'exit', code: 0 }),
      env: { CAISRA_BOX_TOKEN: '' },
    });
    check('a missing token is refused before any connection', r.code === 78, `exit ${r.code}`);
    check('and says which variable is missing', r.stderr.includes('CAISRA_BOX_TOKEN'), r.stderr);
  }

  {
    const r = await runBridge({
      onExec: (socket) => {
        // A large payload, to prove buffered stdout is drained before exit.
        send(socket, { t: 'stdout', d: b64('x'.repeat(256 * 1024)) });
        send(socket, { t: 'exit', code: 0 });
      },
    });
    check(
      'a large output is not truncated by the exit',
      r.stdout.length === 256 * 1024,
      `got ${r.stdout.length} bytes`,
    );
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * `execBridge.mjs` stands in for a process that is not on this machine, so
 * nothing about it can be verified by reading it. These tests stand up a local
 * HTTP server playing the broker, spawn the real bridge against it, and assert
 * on what the engine would have seen: stdout, stderr and the child's exit code.
 *
 * They contact neither E2B nor the Caisra server.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  BRIDGE_ENV,
  buildExecRequestUrl,
  decodeServerFrame,
  encodeExecRequest,
  EXIT_BRIDGE_MISCONFIGURED,
  EXIT_BRIDGE_TRANSPORT,
  EXIT_BRIDGE_UNSUPPORTED,
  splitFrames,
} from '../../../openclaw-extensions/box/execProtocol.mjs';

const bridgePath = path.resolve(__dirname, '../../../openclaw-extensions/box/execBridge.mjs');
const b64 = (value: string) => Buffer.from(value).toString('base64');
const frame = (value: unknown) => `${JSON.stringify(value)}\n`;

type Broker = (
  request: { body: Record<string, unknown>; auth: string | undefined },
  response: http.ServerResponse,
) => void;

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});

async function runBridge(broker: Broker, env: Record<string, string> = {}, stdin?: string) {
  const seen: { body?: Record<string, unknown>; auth?: string; url?: string } = {};
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      seen.url = req.url;
      seen.auth = req.headers.authorization;
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      seen.body = body;
      broker({ body, auth: req.headers.authorization }, res);
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as { port: number };

  const child = spawn(process.execPath, [bridgePath], {
    env: {
      PATH: process.env.PATH,
      [BRIDGE_ENV.broker]: `http://127.0.0.1:${port}`,
      [BRIDGE_ENV.token]: 'test-token',
      [BRIDGE_ENV.boxId]: 'box_test',
      [BRIDGE_ENV.command]: 'echo hi',
      [BRIDGE_ENV.workdir]: '/home/user/workspace',
      [BRIDGE_ENV.env]: JSON.stringify({ FOO: 'bar' }),
      [BRIDGE_ENV.pty]: '0',
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on('data', (c) => out.push(Buffer.from(c)));
  child.stderr.on('data', (c) => err.push(Buffer.from(c)));
  child.stdin.end(stdin ?? '');

  const code = await new Promise<number>((done) => child.on('close', (c) => done(c ?? -1)));
  return {
    code,
    stdout: Buffer.concat(out).toString('utf8'),
    stderr: Buffer.concat(err).toString('utf8'),
    seen,
  };
}

describe('the exec endpoint', () => {
  test('sits under the account proxy prefix, with the box id escaped', () => {
    expect(buildExecRequestUrl('https://api.claidor.com', 'box_1'))
      .toBe('https://api.claidor.com/box/sandboxes/box_1/exec');
    expect(buildExecRequestUrl('http://127.0.0.1:8123/', 'a/../b'))
      .toBe('http://127.0.0.1:8123/box/sandboxes/a%2F..%2Fb/exec');
  });

  test('never carries the token — a URL is the thing that ends up in logs', () => {
    expect(buildExecRequestUrl('https://api.claidor.com', 'box_1')).not.toContain('token');
  });

  test('refuses an empty or non-http broker', () => {
    expect(() => buildExecRequestUrl('', 'box_1')).toThrow(/empty/);
    expect(() => buildExecRequestUrl('ftp://host', 'box_1')).toThrow(/http or https/);
  });
});

describe('frames', () => {
  test('stdout and stderr decode to buffers', () => {
    expect(decodeServerFrame(frame({ t: 'stdout', d: b64('hi') })))
      .toEqual({ t: 'stdout', data: Buffer.from('hi') });
  });

  test('an exit with no usable code is null, not a silent zero', () => {
    expect(decodeServerFrame(JSON.stringify({ t: 'exit' }))).toEqual({ t: 'exit', code: null });
  });

  /**
   * A malformed frame must become a failed command, never an unhandled
   * rejection inside the bridge — that would leave the engine waiting forever
   * on a tool call that is never coming back.
   */
  test('a frame that is not JSON becomes an error, not a throw', () => {
    expect(decodeServerFrame('not json')).toMatchObject({ t: 'error' });
  });

  test('an unknown kind names itself, so a version skew is debuggable', () => {
    expect(decodeServerFrame(JSON.stringify({ t: 'teleport' })).message).toContain('teleport');
  });

  test('the request body carries everything the box needs', () => {
    expect(JSON.parse(encodeExecRequest({
      command: 'ls', workdir: '/w', env: { A: '1' }, usePty: false, stdin: 'in',
    }))).toEqual({
      command: 'ls', workdir: '/w', env: { A: '1' }, pty: false, stdinBase64: b64('in'),
    });
  });
});

describe('splitting the stream into frames', () => {
  test('a frame split across chunks is reassembled', () => {
    const first = splitFrames('', '{"t":"std');
    expect(first.lines).toEqual([]);
    const second = splitFrames(first.pending, 'out","d":""}\n');
    expect(second.lines).toEqual(['{"t":"stdout","d":""}']);
    expect(second.pending).toBe('');
  });

  test('several frames in one chunk all come out', () => {
    expect(splitFrames('', 'a\nb\nc\n').lines).toEqual(['a', 'b', 'c']);
  });

  test('blank lines are not frames', () => {
    expect(splitFrames('', '\n\na\n').lines).toEqual(['a']);
  });
});

describe('the bridge, end to end against a local broker', () => {
  test('streams the box output back and exits 0', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write(frame({ t: 'stdout', d: b64('hello from the box\n') }));
      res.end(frame({ t: 'exit', code: 0 }));
    });
    expect(r.stdout).toBe('hello from the box\n');
    expect(r.code).toBe(0);
  });

  test('presents the token as a bearer and posts to the box exec path', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'exit', code: 0 }));
    });
    expect(r.seen.auth).toBe('Bearer test-token');
    expect(r.seen.url).toBe('/box/sandboxes/box_test/exec');
  });

  test('sends the command, workdir and env the engine asked for', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'exit', code: 0 }));
    });
    expect(r.seen.body).toMatchObject({
      command: 'echo hi',
      workdir: '/home/user/workspace',
      env: { FOO: 'bar' },
      pty: false,
    });
  });

  test('carries stdin up in the request body', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'exit', code: 0 }));
    }, {}, 'from-the-engine');
    expect(Buffer.from(String(r.seen.body?.stdinBase64), 'base64').toString('utf8'))
      .toBe('from-the-engine');
  });

  test("the box's exit code becomes the bridge's exit code", async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.write(frame({ t: 'stderr', d: b64('no such file\n') }));
      res.end(frame({ t: 'exit', code: 2 }));
    });
    expect(r.stderr).toContain('no such file');
    expect(r.code).toBe(2);
  });

  test('an error frame is reported and never exits 0', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'error', message: 'box is gone' }));
    });
    expect(r.stderr).toContain('box is gone');
    expect(r.code).toBe(EXIT_BRIDGE_TRANSPORT);
  });

  /**
   * Reporting success when the box never said how the command finished would
   * be a lie the agent then acts on.
   */
  test('a stream that ends with no exit frame fails loudly', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'stdout', d: b64('partial') }));
    });
    expect(r.code).toBe(EXIT_BRIDGE_TRANSPORT);
    expect(r.stderr).toMatch(/ended before the command finished/);
  });

  test('a broker that refuses the command says why', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(503);
      res.end('box could not be started');
    });
    expect(r.code).toBe(EXIT_BRIDGE_TRANSPORT);
    expect(r.stderr).toContain('503');
    expect(r.stderr).toContain('box could not be started');
  });

  /**
   * The normal case: the broker is the app's local token proxy, which injects
   * the account's token, so the bridge carries none and sends no header.
   */
  test('a local broker needs no token, and no Authorization header is sent', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'exit', code: 0 }));
    }, { [BRIDGE_ENV.token]: '' });
    expect(r.code).toBe(0);
    expect(r.seen.auth).toBeUndefined();
  });

  /**
   * Without this, a typo in the broker URL sends the command the agent was
   * about to run, unauthenticated, to a stranger.
   */
  test('a remote broker with no token is refused before any request is made', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'exit', code: 0 }));
    }, { [BRIDGE_ENV.token]: '', [BRIDGE_ENV.broker]: 'https://not-ours.example' });
    expect(r.code).toBe(EXIT_BRIDGE_MISCONFIGURED);
    expect(r.stderr).toContain('not on this machine');
    expect(r.seen.url).toBeUndefined();
  });

  test('a missing box id is refused before any request is made', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'exit', code: 0 }));
    }, { [BRIDGE_ENV.boxId]: '' });
    expect(r.code).toBe(EXIT_BRIDGE_MISCONFIGURED);
    expect(r.stderr).toContain(BRIDGE_ENV.boxId);
  });

  /**
   * The account proxy the app reaches the server through cannot carry a
   * two-way connection, so a terminal session cannot work yet. Saying so beats
   * hanging on stdin that never closes.
   */
  test('a pty request is refused with a reason, not a hang', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.end(frame({ t: 'exit', code: 0 }));
    }, { [BRIDGE_ENV.pty]: '1' });
    expect(r.code).toBe(EXIT_BRIDGE_UNSUPPORTED);
    expect(r.stderr).toMatch(/interactive terminal/);
  });

  test('a large output is not truncated by the exit', async () => {
    const big = 'x'.repeat(256 * 1024);
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      res.write(frame({ t: 'stdout', d: b64(big) }));
      res.end(frame({ t: 'exit', code: 0 }));
    });
    expect(r.stdout.length).toBe(big.length);
    expect(r.code).toBe(0);
  });

  test('output arriving in many small chunks is reassembled in order', async () => {
    const r = await runBridge((_req, res) => {
      res.writeHead(200);
      const payload = frame({ t: 'stdout', d: b64('abcdefghij') });
      for (const ch of payload) {
        res.write(ch);
      }
      res.end(frame({ t: 'exit', code: 0 }));
    });
    expect(r.stdout).toBe('abcdefghij');
  });
});

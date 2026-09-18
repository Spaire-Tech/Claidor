import { describe, expect, test } from 'vitest';

import {
  BRIDGE_ENV,
  buildExecSocketUrl,
  decodeServerFrame,
  encodeExecRequest,
  encodeSignal,
  encodeStdin,
  encodeStdinClose,
} from '../../../openclaw-extensions/box/execProtocol.mjs';

describe('the socket the bridge opens', () => {
  test('is wss when the broker is https', () => {
    expect(buildExecSocketUrl('https://api.claidor.com', 'box_1'))
      .toBe('wss://api.claidor.com/api/box/sandboxes/box_1/exec');
  });

  test('is ws for a local broker, so development works', () => {
    expect(buildExecSocketUrl('http://127.0.0.1:8000', 'box_1'))
      .toBe('ws://127.0.0.1:8000/api/box/sandboxes/box_1/exec');
  });

  test('tolerates a trailing slash on the broker URL', () => {
    expect(buildExecSocketUrl('https://api.claidor.com/', 'box_1'))
      .toBe('wss://api.claidor.com/api/box/sandboxes/box_1/exec');
  });

  test('escapes the box id rather than pasting it into a path', () => {
    expect(buildExecSocketUrl('https://api.claidor.com', 'a/../b'))
      .toContain('/api/box/sandboxes/a%2F..%2Fb/exec');
  });

  test('refuses an empty or non-http broker', () => {
    expect(() => buildExecSocketUrl('', 'box_1')).toThrow(/empty/);
    expect(() => buildExecSocketUrl('ftp://host', 'box_1')).toThrow(/http or https/);
  });

  test('never carries the token — a URL is the thing that ends up in logs', () => {
    expect(buildExecSocketUrl('https://api.claidor.com', 'box_1')).not.toContain('token');
  });
});

describe('frames the bridge sends', () => {
  test('stdin survives as base64, so binary is not mangled', () => {
    const payload = Buffer.from([0x00, 0xff, 0x7f]);
    const frame = JSON.parse(encodeStdin(payload));
    expect(frame.t).toBe('stdin');
    expect(Buffer.from(frame.d, 'base64')).toEqual(payload);
  });

  test('closing stdin is its own frame, not an empty chunk', () => {
    expect(JSON.parse(encodeStdinClose())).toEqual({ t: 'stdin-close' });
  });

  test('an abort becomes a signal the box can act on', () => {
    expect(JSON.parse(encodeSignal('SIGTERM'))).toEqual({ t: 'signal', sig: 'SIGTERM' });
    expect(JSON.parse(encodeSignal(''))).toEqual({ t: 'signal', sig: 'SIGTERM' });
  });

  test('the exec request carries everything the box needs to start the command', () => {
    const frame = JSON.parse(encodeExecRequest({
      command: 'ls -la',
      workdir: '/home/user/workspace',
      env: { A: '1' },
      usePty: true,
    }));
    expect(frame).toEqual({
      t: 'exec',
      command: 'ls -la',
      workdir: '/home/user/workspace',
      env: { A: '1' },
      pty: true,
    });
  });
});

describe('frames the broker sends back', () => {
  test('stdout and stderr decode to buffers', () => {
    const out = decodeServerFrame(JSON.stringify({ t: 'stdout', d: Buffer.from('hi').toString('base64') }));
    expect(out).toEqual({ t: 'stdout', data: Buffer.from('hi') });
    const err = decodeServerFrame(JSON.stringify({ t: 'stderr', d: Buffer.from('no').toString('base64') }));
    expect(err).toEqual({ t: 'stderr', data: Buffer.from('no') });
  });

  test('an exit frame carries the code', () => {
    expect(decodeServerFrame(JSON.stringify({ t: 'exit', code: 2 }))).toEqual({ t: 'exit', code: 2 });
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
    expect(decodeServerFrame('not json at all')).toEqual({
      t: 'error',
      message: 'Box sent a frame that is not JSON.',
    });
  });

  test('a frame with no kind becomes an error', () => {
    expect(decodeServerFrame(JSON.stringify({ nope: 1 }))).toMatchObject({ t: 'error' });
  });

  test('an unknown kind names itself, so a version skew is debuggable', () => {
    expect(decodeServerFrame(JSON.stringify({ t: 'teleport' })).message).toContain('teleport');
  });

  test('an error frame with no message still says something', () => {
    expect(decodeServerFrame(JSON.stringify({ t: 'error' })).message).toBeTruthy();
  });
});

describe('the bridge environment contract', () => {
  test('names every variable the bridge reads', () => {
    expect(Object.values(BRIDGE_ENV).sort()).toEqual([
      'CAISRA_BOX_BROKER',
      'CAISRA_BOX_COMMAND',
      'CAISRA_BOX_ENV_JSON',
      'CAISRA_BOX_ID',
      'CAISRA_BOX_PTY',
      'CAISRA_BOX_TOKEN',
      'CAISRA_BOX_WORKDIR',
    ]);
  });
});

import { describe, expect, test } from 'vitest';

import { copyResponseHeaders } from './openclawTokenProxy';

describe('copyResponseHeaders', () => {
  test('drops the encoding and length of a body Electron already decoded', () => {
    // What a compressed JSON answer looks like coming back from the edge.
    // Keeping either of these on a decoded body is what gave the app
    // `TypeError: terminated` on every connector call.
    const headers = new Headers({
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'content-length': '266',
      'cache-control': 'no-store',
    });
    expect(copyResponseHeaders(headers)).toEqual({
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
  });

  test('drops hop-by-hop headers, whatever their case', () => {
    const headers = new Headers({
      'Transfer-Encoding': 'chunked',
      'Connection': 'keep-alive',
      'Keep-Alive': 'timeout=5',
      'content-type': 'text/event-stream',
    });
    expect(copyResponseHeaders(headers)).toEqual({ 'content-type': 'text/event-stream' });
  });

  test('keeps everything else', () => {
    const headers = new Headers({ 'x-request-id': 'abc', 'content-type': 'application/json' });
    expect(copyResponseHeaders(headers)).toEqual({
      'x-request-id': 'abc',
      'content-type': 'application/json',
    });
  });
});

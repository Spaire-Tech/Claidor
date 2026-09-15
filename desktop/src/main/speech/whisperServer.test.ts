import path from 'path';
import { describe, expect, test } from 'vitest';

import { parseInference, WHISPER_BINARY_ENV, WHISPER_MODEL_ENV, whisperBinaryCandidates, whisperModelPath } from './whisperServer';

describe('whisperBinaryCandidates', () => {
  test('looks under resources by platform and arch, after any override', () => {
    const candidates = whisperBinaryCandidates({
      resourcesDir: '/App/Resources', platform: 'darwin', arch: 'arm64', env: {},
    });
    expect(candidates).toEqual([
      path.join('/App/Resources', 'whisper', 'darwin-arm64', 'whisper-server'),
      path.join('/App/Resources', 'whisper', 'darwin', 'whisper-server'),
    ]);
  });

  test('a developer override comes first; Windows gets .exe', () => {
    const candidates = whisperBinaryCandidates({
      resourcesDir: 'C:\\App\\resources', platform: 'win32', arch: 'x64',
      env: { [WHISPER_BINARY_ENV]: '/tmp/whisper-server' },
    });
    expect(candidates[0]).toBe('/tmp/whisper-server');
    expect(candidates[1].endsWith('whisper-server.exe')).toBe(true);
  });
});

describe('whisperModelPath', () => {
  test('lives under the app data directory unless overridden', () => {
    expect(whisperModelPath({ userDataDir: '/data', env: {} })).toBe(path.join('/data', 'speech', 'models', 'ggml-base.bin'));
    expect(whisperModelPath({ userDataDir: '/data', env: { [WHISPER_MODEL_ENV]: '/models/tiny.bin' } })).toBe('/models/tiny.bin');
  });
});

describe('parseInference', () => {
  test('returns the text, collapsed to single spaces', () => {
    expect(parseInference('{"text":" And so my fellow\\n Americans  ask not\\n"}')).toBe('And so my fellow Americans ask not');
  });

  test('surfaces the recogniser\'s own error and refuses an answer without text', () => {
    expect(() => parseInference('{"error":"no audio"}')).toThrow('no audio');
    expect(() => parseInference('{}')).toThrow('without text');
  });
});

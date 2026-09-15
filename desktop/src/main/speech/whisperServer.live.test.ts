import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, test } from 'vitest';

import { WHISPER_BINARY_ENV, WHISPER_MODEL_ENV, WhisperServer } from './whisperServer';

/**
 * The recogniser against a real binary and a real model, when this
 * machine has them. Set `CAISRA_WHISPER_SERVER`, `CAISRA_WHISPER_MODEL`
 * and `CAISRA_WHISPER_SAMPLE` (a 16 kHz mono PCM16 WAV of someone
 * speaking). Skipped otherwise, and says so, rather than passing on
 * nothing.
 */
const binary = process.env[WHISPER_BINARY_ENV];
const model = process.env[WHISPER_MODEL_ENV];
const sample = process.env.CAISRA_WHISPER_SAMPLE;
const live = Boolean(binary && model && sample && fs.existsSync(binary) && fs.existsSync(model) && fs.existsSync(sample));

describe.skipIf(!live)('WhisperServer, live', () => {
  const server = new WhisperServer({
    resourcesDir: path.join(os.tmpdir(), 'no-resources-here'),
    userDataDir: path.join(os.tmpdir(), 'no-user-data-here'),
    env: process.env,
  });

  afterAll(async () => { await server.dispose(); });

  test('transcribes a clip of speech', async () => {
    const wav = fs.readFileSync(sample as string);
    const pcm = wav.subarray(44);
    const text = await server.transcribe(pcm);
    expect(text.length).toBeGreaterThan(10);
    expect(server.getStatus().readiness).toBe('ready');
    console.log(`[live] ${text}`);
  }, 120_000);
});

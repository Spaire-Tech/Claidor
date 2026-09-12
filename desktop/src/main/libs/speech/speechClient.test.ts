import { describe, expect, test, vi } from 'vitest';

import { SPEECH_TEXT_TO_SPEECH_ROUTE } from '../../../shared/speech/constants';
import { describeSpeechFailure, readVoices, SpeechClient } from './speechClient';

const BASE = 'https://api.example/desktop';

const clientWith = (fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>) =>
  new SpeechClient({ getServerBaseUrl: () => BASE, fetchWithAuth });

describe('readVoices', () => {
  test('reads ElevenLabs\' own listing shape', () => {
    expect(readVoices({
      voices: [
        { voice_id: 'abc123', name: 'Rachel', description: 'Calm' },
        { voice_id: 'def456', name: 'Adam' },
      ],
    })).toEqual([
      { voiceId: 'abc123', name: 'Rachel', description: 'Calm' },
      { voiceId: 'def456', name: 'Adam' },
    ]);
  });

  test('drops anything without both an id and a name', () => {
    // A half-named voice in a picker is worse than one voice fewer:
    // there is nothing to click and nothing to read.
    expect(readVoices({ voices: [{ voice_id: 'abc123' }, { name: 'Nameless' }, 'nonsense'] }))
      .toEqual([]);
  });

  test('survives a shape it did not expect', () => {
    expect(readVoices(null)).toEqual([]);
    expect(readVoices({})).toEqual([]);
    expect(readVoices({ voices: 'many' })).toEqual([]);
  });
});

describe('describeSpeechFailure', () => {
  test('tells « not switched on » apart from « broken »', () => {
    // The server answers 503 when it holds no speech key. Saying the
    // voice is broken would send somebody debugging a feature that was
    // simply never turned on.
    const missing = describeSpeechFailure(503);
    expect(missing.unavailable).toBe(true);
    expect(missing.error).toContain('not switched on');

    expect(describeSpeechFailure(500).unavailable).toBe(false);
  });

  test('names the two failures a person can act on', () => {
    expect(describeSpeechFailure(402).error).toContain('credits');
    expect(describeSpeechFailure(401).error).toContain('Sign in');
  });
});

describe('SpeechClient.speak', () => {
  test('asks the right voice to say the words', async () => {
    const fetchWithAuth = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
    }));
    const result = await clientWith(fetchWithAuth).speak('abc123', 'Good morning.');

    expect(result.ok).toBe(true);
    expect(result.audioBase64).toBe(Buffer.from([1, 2, 3]).toString('base64'));

    const [url, options] = fetchWithAuth.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}${SPEECH_TEXT_TO_SPEECH_ROUTE}/abc123`);
    expect(JSON.parse(String(options.body))).toEqual({ text: 'Good morning.' });
  });

  test('escapes the voice id rather than pasting it into the path', async () => {
    const fetchWithAuth = vi.fn(async () => new Response(new Uint8Array([0]), { status: 200 }));
    await clientWith(fetchWithAuth).speak('../../secrets', 'hello');
    const [url] = fetchWithAuth.mock.calls[0] as unknown as [string];
    expect(url).not.toContain('../');
  });

  test('asks for nothing when there is nothing to say', async () => {
    const fetchWithAuth = vi.fn(async () => new Response('', { status: 200 }));
    expect((await clientWith(fetchWithAuth).speak('abc123', '   ')).ok).toBe(false);
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  test('reports a refusal in words rather than a status code', async () => {
    const fetchWithAuth = vi.fn(async () => new Response('', { status: 503 }));
    const result = await clientWith(fetchWithAuth).speak('abc123', 'hello');
    expect(result.ok).toBe(false);
    expect(result.unavailable).toBe(true);
  });

  test('does not throw when the server cannot be reached', async () => {
    const fetchWithAuth = vi.fn(async () => {
      throw new Error('offline');
    });
    const result = await clientWith(fetchWithAuth).speak('abc123', 'hello');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('SpeechClient.listVoices', () => {
  test('returns the voices the server lists', async () => {
    const fetchWithAuth = vi.fn(async () => new Response(
      JSON.stringify({ voices: [{ voice_id: 'abc123', name: 'Rachel' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    const result = await clientWith(fetchWithAuth).listVoices();
    expect(result.ok).toBe(true);
    expect(result.voices).toHaveLength(1);
  });

  test('says the voice is not switched on rather than showing none', async () => {
    const fetchWithAuth = vi.fn(async () => new Response('', { status: 503 }));
    const result = await clientWith(fetchWithAuth).listVoices();
    expect(result.ok).toBe(false);
    expect(result.unavailable).toBe(true);
    expect(result.voices).toEqual([]);
  });
});

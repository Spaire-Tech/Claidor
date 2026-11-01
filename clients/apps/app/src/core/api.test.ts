// The shared core's `TokenTests` (ios/SimeonCore/Tests/SimeonCoreTests/CoreTests.swift),
// the same inputs and the same answers. Left for later steps: the picture
// editor's wording of a refusal (`AppStore.drawingRefusal`) and the account's
// initials (`Account`), which belong to the screens.

import { describe, expect, it } from 'vitest'
import {
  MemoryVault,
  SimeonAPI,
  SimeonAPIError,
  resolveApiBase,
  sessionVault,
} from './api'
import { field } from './json'
import { ScriptedHTTP, Unanswered, answer } from './testing'
import {
  base64URL,
  bytesFromBase64URL,
  expiryOfAccessToken,
  readRefreshAnswer,
  subjectOfAccessToken,
} from './tokens'

function envelope(exp: number): string {
  const claims = base64URL(
    new TextEncoder().encode(`{"exp":${Math.trunc(exp)}}`),
  )
  return `simeon_da_header.${claims}.sig`
}

function api(
  vault: MemoryVault,
  http: ScriptedHTTP | Unanswered,
  now?: () => number,
) {
  return new SimeonAPI({
    base: 'https://api.example.com',
    clientVersion: '1',
    vault,
    http,
    language: 'en',
    now,
  })
}

const signedIn = () =>
  new MemoryVault({ accessToken: 't', refreshToken: 'r', expiresAtMs: 9e15 })

describe('tokens', () => {
  it('reads the expiry from the envelope', () => {
    expect(expiryOfAccessToken(envelope(1_800_000_000), 0)).toBe(
      1_800_000_000_000,
    )
    expect(expiryOfAccessToken('opaque', 1000)).toBe(1000 + 3_600_000)
  })

  it('reads the refresh answers', () => {
    expect(readRefreshAnswer(undefined, undefined, 0)).toEqual({ kind: 'kept' })
    expect(readRefreshAnswer(503, undefined, 0)).toEqual({ kind: 'kept' })
    expect(readRefreshAnswer(429, undefined, 0)).toEqual({ kind: 'kept' })
    expect(readRefreshAnswer(400, undefined, 0)).toEqual({ kind: 'ended' })
    expect(readRefreshAnswer(200, { shouldLogout: true }, 0)).toEqual({
      kind: 'ended',
    })
    expect(
      readRefreshAnswer(200, { access_token: 'a', refresh_token: 'b' }, 0),
    ).toEqual({
      kind: 'refreshed',
      tokens: { accessToken: 'a', refreshToken: 'b', expiresAtMs: 3_600_000 },
    })
  })

  it('reads the account off the token', () => {
    const claims = base64URL(
      new TextEncoder().encode('{"sub":"be26f651","exp":9000000000}'),
    )
    expect(
      subjectOfAccessToken(`simeon_da_eyJhbGciOiJIUzI1NiJ9.${claims}.sig`),
    ).toBe('be26f651')
    expect(subjectOfAccessToken('opaque')).toBeUndefined()
  })

  it('reads and writes base64url as the Mac does', () => {
    expect(base64URL(new Uint8Array([0, 1, 2, 250, 251, 252, 253]))).toBe(
      'AAEC-vv8_Q',
    )
    expect(Array.from(bytesFromBase64URL('AAEC-vv8_Q') ?? [])).toEqual([
      0, 1, 2, 250, 251, 252, 253,
    ])
  })
})

describe('SimeonAPI', () => {
  it('refreshes with five minutes left and keeps the new pair', async () => {
    const vault = new MemoryVault({
      accessToken: 'old',
      refreshToken: 'r1',
      expiresAtMs: 1_000_000 + 4 * 60_000,
    })
    const http = new ScriptedHTTP([
      (request) => {
        expect(new URL(request.url).pathname).toBe('/oauth/token')
        return answer(200, '{"access_token":"new","refresh_token":"r2"}')
      },
      (request) => {
        expect(request.headers.authorization).toBe('Bearer new')
        expect(request.headers['x-simeon-client-type']).toBe('sand')
        return answer(
          200,
          '{"code":0,"data":{"email":"bass@simeonlabs.com","name":"Bass Fall"}}',
        )
      },
    ])
    const profile = await api(vault, http, () => 1_000_000).profile()
    expect(field(profile, 'email')).toBe('bass@simeonlabs.com')
    expect(vault.read()?.refreshToken).toBe('r2')
  })

  it('sends dictation as the Mac does', async () => {
    const http = new ScriptedHTTP([
      (request) => {
        expect(new URL(request.url).pathname).toBe(
          '/desktop/api/proxy/v1/audio/transcriptions',
        )
        expect(request.method).toBe('POST')
        expect(request.headers.authorization).toBe('Bearer t')
        expect(
          request.headers['content-type']?.startsWith(
            'multipart/form-data; boundary=',
          ),
        ).toBe(true)
        const body = new TextDecoder().decode(request.body as Uint8Array)
        expect(body).toContain(
          'Content-Disposition: form-data; name="file"; filename="audio.mp4"\r\nContent-Type: audio/mp4\r\n\r\nRIFF',
        )
        expect(body).not.toContain('language')
        return answer(
          200,
          '{"text":"Move the review to Friday.","seconds":2.4}',
        )
      },
    ])
    const said = await api(signedIn(), http).transcribe(
      new TextEncoder().encode('RIFF'),
      'audio/mp4;codecs=mp4a.40.2',
    )
    expect(said).toBe('Move the review to Friday.')
    expect(SimeonAPI.audioFilename('audio/webm')).toBe('audio.webm')
  })

  it('sends dictation in the app language when it is not English', async () => {
    const http = new ScriptedHTTP([
      (request) => {
        const body = new TextDecoder().decode(request.body as Uint8Array)
        expect(body).toContain('name="language"\r\n\r\nfr\r\n')
        return answer(200, '{"text":"Bonjour"}')
      },
    ])
    const french = new SimeonAPI({
      clientVersion: '1',
      vault: signedIn(),
      http,
      language: 'fr',
    })
    expect(await french.transcribe(new Uint8Array([1]), 'audio/webm')).toBe(
      'Bonjour',
    )
  })

  it("passes a refused picture's sentence and code on", async () => {
    const http = new ScriptedHTTP([
      () =>
        answer(
          400,
          '{"error":{"message":"Your request was rejected by the safety system.","type":"image_generation_user_error","code":"moderation_blocked"}}',
        ),
    ])
    const error = await api(signedIn(), http)
      .data('proxy/v1/images/generations', {
        json: { prompt: 'Lilo from Lilo and Stitch' },
      })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SimeonAPIError)
    expect((error as SimeonAPIError).status).toBe(400)
    expect((error as SimeonAPIError).code).toBe('moderation_blocked')
    expect((error as SimeonAPIError).message).toBe(
      'Your request was rejected by the safety system.',
    )
  })

  it('forgets the pair when the account is deleted, and a refusal says why', async () => {
    const vault = signedIn()
    const http = new ScriptedHTTP([
      () =>
        answer(
          503,
          `{"error":{"type":"account_deletion_blocked","message":"Your agents' computer couldn't be deleted right now. Try again in a few minutes."}}`,
        ),
      () =>
        answer(
          200,
          '{"deleted":true,"subscription":"none","computers":1,"appsDisconnected":0,"transcriptsDeleted":0,"incomplete":[]}',
        ),
    ])
    const server = api(vault, http)
    await expect(server.deleteAccount()).rejects.toThrow(
      "Your agents' computer couldn't be deleted right now. Try again in a few minutes.",
    )
    // Refused: still signed in, so trying again works.
    expect(vault.read()).not.toBeNull()
    await server.deleteAccount()
    expect(vault.read()).toBeNull()
    expect(http.sent).toHaveLength(2)
    expect(http.sent[1]?.method).toBe('DELETE')
    expect(new URL(http.sent[1]?.url ?? '').pathname).toBe(
      '/desktop/api/account',
    )
    expect(http.sent[1]?.headers.authorization).toBe('Bearer t')
  })

  it('checks with the server when the delete answer never came', async () => {
    const vault = signedIn()
    const http = new Unanswered([
      () => answer(200, '{"email":"a@b.c"}'),
      () => answer(401),
    ])
    const server = api(vault, http)
    let ended = false
    server.onSessionEnded(() => {
      ended = true
    })
    const appleRunsOn = await server.deleteAccount({ checkEveryMs: 0 })
    expect(appleRunsOn).toBe(false)
    expect(vault.read()).toBeNull()
    expect(ended).toBe(false)
    expect(http.sent.map((r) => r.method)).toEqual(['DELETE', 'GET', 'GET'])
    expect(http.sent[0]?.timeoutSeconds).toBe(SimeonAPI.deleteTimeout)
    expect(new URL(http.sent[1]?.url ?? '').pathname).toBe(
      '/desktop/api/user/profile',
    )
  })

  it('says so when the delete answer never came and the account is still there', async () => {
    const vault = signedIn()
    const present = () => answer(200, '{"email":"a@b.c"}')
    const http = new Unanswered(Array.from({ length: 6 }, () => present))
    await expect(
      api(vault, http).deleteAccount({ checkEveryMs: 0 }),
    ).rejects.toMatchObject({
      kind: 'timedOut',
    })
    expect(vault.read()).not.toBeNull()
    expect(http.sent).toHaveLength(7)
  })

  it('ends the session on a spent pair', async () => {
    const vault = new MemoryVault({
      accessToken: 'old',
      refreshToken: 'spent',
      expiresAtMs: 0,
    })
    const http = new ScriptedHTTP([() => answer(200, '{"shouldLogout":true}')])
    const server = api(vault, http, () => 1_000_000)
    let ended = false
    server.onSessionEnded(() => {
      ended = true
    })
    expect(await server.accessToken()).toBeNull()
    expect(vault.read()).toBeNull()
    expect(ended).toBe(true)
  })

  it('leaves a good sign-in alone after a stray 401', async () => {
    const vault = new MemoryVault({
      accessToken: 't',
      refreshToken: 'r1',
      expiresAtMs: 9e15,
    })
    const http = new ScriptedHTTP([
      () => answer(401, '{"error":{"message":"Incorrect API key provided."}}'),
      (request) => {
        expect(new URL(request.url).pathname).toBe('/oauth/token')
        return answer(200, '{"access_token":"t2","refresh_token":"r2"}')
      },
    ])
    const server = api(vault, http)
    let ended = false
    server.onSessionEnded(() => {
      ended = true
    })
    await expect(
      server.data('proxy/v1/images/generations', { json: {} }),
    ).rejects.toMatchObject({
      status: 401,
    })
    expect(vault.read()?.refreshToken).toBe('r2')
    expect(ended).toBe(false)
  })

  it('signs out after a 401 whose refresh is refused', async () => {
    const vault = new MemoryVault({
      accessToken: 't',
      refreshToken: 'r1',
      expiresAtMs: 9e15,
    })
    const http = new ScriptedHTTP([
      () =>
        answer(
          401,
          '{"code":40100,"message":"This desktop session has expired."}',
        ),
      () => answer(200, '{"shouldLogout":true,"error":"invalid_grant"}'),
    ])
    const server = api(vault, http)
    let ended = false
    server.onSessionEnded(() => {
      ended = true
    })
    await server.data('user/profile').catch(() => undefined)
    expect(vault.read()).toBeNull()
    expect(ended).toBe(true)
  })

  it('keeps the sign-in after a 401 while the server is unreachable', async () => {
    const vault = new MemoryVault({
      accessToken: 't',
      refreshToken: 'r1',
      expiresAtMs: 9e15,
    })
    const http = new ScriptedHTTP([() => answer(401), () => answer(503)])
    const server = api(vault, http)
    let ended = false
    server.onSessionEnded(() => {
      ended = true
    })
    await server.connect('EnsureSandBox').catch(() => undefined)
    expect(vault.read()?.refreshToken).toBe('r1')
    expect(ended).toBe(false)
  })

  it('refreshes once for calls made together', async () => {
    const vault = new MemoryVault({
      accessToken: 'old',
      refreshToken: 'r1',
      expiresAtMs: 0,
    })
    const http = new ScriptedHTTP([
      () => answer(200, '{"access_token":"new","refresh_token":"r2"}'),
    ])
    const server = api(vault, http, () => 1_000_000)
    const tokens = await Promise.all([
      server.accessToken(),
      server.accessToken(),
    ])
    expect(tokens).toEqual(['new', 'new'])
    expect(http.sent).toHaveLength(1)
  })
})

describe('the web sign-in', () => {
  it('trades the cookie for the pair', async () => {
    const vault = new MemoryVault()
    const http = new ScriptedHTTP([
      (request) => {
        expect(request.url).toBe('https://api.example.com/auth/web-session')
        expect(request.method).toBe('POST')
        expect(request.credentials).toBe('include')
        return answer(
          200,
          `{"accessToken":"${envelope(1_800_000_000)}","refreshToken":"r"}`,
        )
      },
    ])
    expect(await api(vault, http).signInFromCookie()).toBe(true)
    expect(vault.read()?.refreshToken).toBe('r')
    expect(vault.read()?.expiresAtMs).toBe(1_800_000_000_000)
  })

  it('answers false when the website has no sign-in', async () => {
    const vault = new MemoryVault()
    const http = new ScriptedHTTP([() => answer(401)])
    expect(await api(vault, http).signInFromCookie()).toBe(false)
    expect(vault.read()).toBeNull()
  })

  it('finds the API from where the page is', () => {
    const at = (hostname: string, search = '', protocol = 'https:') =>
      resolveApiBase({ hostname, search, protocol })
    expect(at('app.simeonlabs.com')).toBe('https://api.simeonlabs.com')
    expect(at('localhost')).toBe('http://127.0.0.1:8000')
    expect(at('app.simeonlabs.com', '?api=https://api.staging.test/')).toBe(
      'https://api.staging.test',
    )
  })

  it('keeps the pair in the tab under the old web app key', () => {
    const kept = new Map<string, string>()
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    } as unknown as Storage
    const vault = sessionVault(storage)
    vault.write({ accessToken: 'a', refreshToken: 'r', expiresAtMs: 5 })
    expect(JSON.parse(kept.get('simeon.web.tokens') ?? '')).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAtMs: 5,
    })
    expect(vault.read()).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAtMs: 5,
    })
    vault.write(null)
    expect(vault.read()).toBeNull()
  })
})

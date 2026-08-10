/**
 * The token store, and the one part of it that can be wrong quietly.
 *
 * Storage failures are loud — the caller is told the token only survives
 * the session. Shape validation is the quiet one: accept the wrong string
 * and the failure surfaces as a 401 two screens later, which reads as « your
 * sign-in expired » rather than « you pasted the wrong thing ». So the
 * shape is checked here, away from any browser.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  claidorToken,
  hasClaidorToken,
  looksLikeToken,
  setClaidorToken,
} from './session'

/** A token of the shape the server actually mints: prefix, 37 characters,
 *  then a base62 checksum. */
const REAL = `claidor_pat_${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s'}9tUvW`

describe('recognising a Claidor token', () => {
  it('accepts one the server would have issued', () => {
    expect(looksLikeToken(REAL)).toBe(true)
  })

  it('tolerates the whitespace a paste brings with it', () => {
    expect(looksLikeToken(`  ${REAL}\n`)).toBe(true)
  })

  it('rejects a token belonging to something else', () => {
    // The realistic mistakes: a Slack hook, a GitHub token, an OpenAI key.
    expect(looksLikeToken('xoxb-123456789012-abcdefghijklmnop')).toBe(false)
    expect(looksLikeToken('ghp_16CharactersAndThenSomeMoreHere')).toBe(false)
    expect(looksLikeToken('sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false)
  })

  it('rejects the prefix on its own', () => {
    expect(looksLikeToken('claidor_pat_')).toBe(false)
  })

  it('rejects something too short to be an accident worth accepting', () => {
    expect(looksLikeToken('claidor_pat_abc')).toBe(false)
  })

  it('rejects an empty paste', () => {
    expect(looksLikeToken('')).toBe(false)
    expect(looksLikeToken('   ')).toBe(false)
  })
})

describe('keeping the token when storage works', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
    setClaidorToken(null)
  })

  it('reports that it was written down', () => {
    expect(setClaidorToken(REAL)).toBe(true)
    expect(claidorToken()).toBe(REAL)
    expect(hasClaidorToken()).toBe(true)
  })

  it('forgets it when asked', () => {
    setClaidorToken(REAL)
    setClaidorToken(null)
    expect(claidorToken()).toBeNull()
    expect(hasClaidorToken()).toBe(false)
  })
})

describe('keeping the token when storage is blocked', () => {
  // Office storage partitioning, InPrivate windows and some enterprise
  // cookie policies make localStorage throw outright.
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    setClaidorToken(null)
  })

  it('says it could not be written down', () => {
    expect(setClaidorToken(REAL)).toBe(false)
  })

  it('still works for the rest of the session', () => {
    // The caller shows a warning off the `false` above. What it must not do
    // is behave as though the paste failed: the token works until reload,
    // and pretending otherwise sends the user round the loop again.
    setClaidorToken(REAL)
    expect(claidorToken()).toBe(REAL)
    expect(hasClaidorToken()).toBe(true)
  })

  it('does not throw on a read', () => {
    expect(() => claidorToken()).not.toThrow()
  })
})

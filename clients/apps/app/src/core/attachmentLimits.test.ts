// The composer's limits and lines (SimeonCore's `AttachmentLimitTests`).

import { afterEach, describe, expect, it } from 'vitest'
import { admit, refusal, refusedNotice } from './attachmentLimits'
import { setWords } from './words'

afterEach(() => setWords('en', {}))

describe('what the composer takes', () => {
  it('keeps to six files, none empty, none over the limit', () => {
    expect(admit(3, 5).accepted).toBe(1)
    expect(admit(3, 5).notice).toBe(
      "Only 6 attachments allowed — 2 weren't added.",
    )
    expect(admit(2, 5).notice).toBe(
      "Only 6 attachments allowed — 1 wasn't added.",
    )
    expect(admit(2, 0).notice).toBeUndefined()
    expect(admit(4, 6)).toEqual({
      accepted: 0,
      notice: "Only 6 attachments allowed — 4 weren't added.",
    })
    expect(refusal('a.png', 0)).toBe('empty')
    expect(refusal('a.png', 26 * 1024 * 1024)).toBe('tooLarge')
    expect(refusal('a.png', 25 * 1024 * 1024)).toBeUndefined()
    expect(refusal('clip.MOV', 150 * 1024 * 1024)).toBeUndefined()
    expect(refusal('clip.mov', 201 * 1024 * 1024)).toBe('tooLarge')
  })

  it('says what was left out', () => {
    expect(refusedNotice([{ name: 'big.pdf', reason: 'tooLarge' }])).toBe(
      '"big.pdf" is too large to attach (max 25 MB).',
    )
    expect(refusedNotice([{ name: 'clip.mp4', reason: 'tooLarge' }])).toBe(
      '"clip.mp4" is too large to attach (max 200 MB for video).',
    )
    expect(refusedNotice([{ name: 'e.txt', reason: 'empty' }])).toBe(
      '"e.txt" is empty, so it wasn\'t attached.',
    )
    expect(refusedNotice([{ name: 'x', reason: 'failed' }])).toBe(
      'Couldn\'t attach "x".',
    )
    expect(
      refusedNotice([
        { name: 'a', reason: 'tooLarge' },
        { name: 'b', reason: 'tooLarge' },
      ]),
    ).toBe('2 files are too large to attach (max 25 MB, or 200 MB for video).')
    expect(
      refusedNotice([
        { name: 'a', reason: 'tooLarge' },
        { name: 'b', reason: 'failed' },
      ]),
    ).toBe("2 files couldn't be attached.")
    expect(refusedNotice([])).toBeUndefined()
  })

  it('in French, from the core’s catalogue', () => {
    setWords('fr', {
      core: {
        "Only %lld attachments allowed — %lld weren't added.":
          '%lld pièces jointes au maximum — %lld n’ont pas été ajoutées.',
        '"%@" is too large to attach (max 25 MB).':
          '« %@ » est trop volumineux pour être joint (25 Mo max.).',
      },
    })
    expect(admit(8, 0).notice).toBe(
      '6 pièces jointes au maximum — 2 n’ont pas été ajoutées.',
    )
    expect(refusedNotice([{ name: 'big.pdf', reason: 'tooLarge' }])).toBe(
      '« big.pdf » est trop volumineux pour être joint (25 Mo max.).',
    )
  })
})

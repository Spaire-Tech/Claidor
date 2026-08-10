/**
 * The parts of the host bridge that can be tested without Office.
 *
 * Most of this module is calls into an application that is not here, and
 * those are proved by sideloading, not by a test runner. What *can* be
 * checked here is every decision made before the call — which is where the
 * bugs that matter live, because a wrong sheet name or the wrong
 * attachment sends the reader somewhere confidently incorrect.
 */

import { describe, expect, it } from 'vitest'

import { splitRef } from './excel'
import { pickReadable } from './outlook'

describe('a cell reference', () => {
  it('separates the sheet from the address', () => {
    expect(splitRef('DCF!D42')).toEqual({ sheet: 'DCF', address: 'D42' })
  })

  it('has no sheet when none was written', () => {
    expect(splitRef('D42')).toEqual({ sheet: null, address: 'D42' })
  })

  it('unquotes a sheet name with a space in it', () => {
    // Excel writes 'Free Cash Flow'!D42, and getItem wants the bare name.
    expect(splitRef("'Free Cash Flow'!D42")).toEqual({
      sheet: 'Free Cash Flow',
      address: 'D42',
    })
  })

  it('undoubles an apostrophe inside a sheet name', () => {
    expect(splitRef("'Bob''s model'!B7")).toEqual({
      sheet: "Bob's model",
      address: 'B7',
    })
  })

  it('splits on the last bang, not the first', () => {
    // A sheet may legitimately be named with punctuation; the address
    // never contains one, so the last separator is the real one.
    expect(splitRef("'Q3!draft'!C9")).toEqual({
      sheet: 'Q3!draft',
      address: 'C9',
    })
  })
})

describe('which attachment a draft is about', () => {
  const attachment = (name: string) => ({ id: name, name, size: 1 })

  it('takes the deck, not the signature image', () => {
    const found = pickReadable([
      attachment('signature.png'),
      attachment('cascade_deck.pptx'),
    ])
    expect(found?.name).toBe('cascade_deck.pptx')
  })

  it('reads a model as readily as a deck', () => {
    expect(pickReadable([attachment('cascade_model.xlsx')])?.name).toBe(
      'cascade_model.xlsx',
    )
  })

  it('finds nothing in a draft with nothing to check', () => {
    expect(
      pickReadable([attachment('photo.jpg'), attachment('notes.txt')]),
    ).toBeNull()
  })

  it('is not fooled by an extension in the middle of a name', () => {
    // « final.pptx.zip » is a zip. Reading it as a deck fails later and
    // more confusingly than not offering it at all.
    expect(pickReadable([attachment('final.pptx.zip')])).toBeNull()
  })
})

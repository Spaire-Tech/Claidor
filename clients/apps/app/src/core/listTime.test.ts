// The row's time as the core's tests have it (`testStampTexts`,
// `testNoTimeIsNotNineteenSixtyNine` in CoreTests.swift).

import { describe, expect, it } from 'vitest'
import { displayLocale, listTime } from './listTime'

// 2026-10-07 19:06 UTC
const today = new Date(1_791_400_000 * 1000)
const at = (secondsBefore: number) => (1_791_400_000 - secondsBefore) * 1000
// ICU puts a narrow no-break space before "PM".
const spaced = (text: string | undefined) => text?.replace(/\u202f/g, ' ')

describe('the list’s time', () => {
  it('is the window’s', () => {
    const options = { now: today, locale: 'en-US', timeZone: 'UTC' }
    expect(spaced(listTime(at(60), options))).toBe('7:05 PM')
    expect(listTime(at(86_400), options)).toBe('Yesterday')
    expect(listTime(at(86_400 * 3), options)).toBe('Sunday')
    expect(listTime(at(86_400 * 30), options)).toBe('9/7')
    expect(listTime(at(86_400 * 400), options)).toBe('9/2/25')
  })

  it('is nothing for no time, not 1969', () => {
    const options = {
      now: today,
      locale: 'en-US',
      timeZone: 'America/Los_Angeles',
    }
    expect(listTime(0, options)).toBeUndefined()
    expect(listTime(undefined, options)).toBeUndefined()
    expect(listTime(-1, options)).toBeUndefined()
    expect(listTime(Number.NaN, options)).toBeUndefined()
    expect(listTime(at(86_400), options)).toBe('Yesterday')
  })

  it('is written in the app’s language, in the person’s region', () => {
    expect(displayLocale('en', ['fr-FR'])).toBe('en-US')
    expect(displayLocale('fr', ['fr-CA', 'en-US'])).toBe('fr-CA')
    expect(displayLocale('fr', ['en-US'])).toBe('fr')
    expect(displayLocale('pt-BR', ['pt-PT'])).toBe('pt-BR')
    expect(
      listTime(at(86_400 * 30), {
        now: today,
        locale: 'fr-FR',
        timeZone: 'UTC',
      }),
    ).toBe('07/09')
  })
})

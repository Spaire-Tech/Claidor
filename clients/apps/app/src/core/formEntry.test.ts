// The store's forms make sense of what is typed (FormEntryTests.swift, the same cases).
import { describe, expect, it } from 'vitest'
import { draftProblem, newDraft } from './credentialsStore'
import {
  allCountries,
  cardGrouped,
  cardIsExpired,
  cardTyped,
  cardTypedCode,
  cardTypedExpiry,
  country,
  countryFlag,
  hereCountry,
  phoneFormatted,
  phoneJoined,
  phoneNational,
  phoneSplit,
  typedDigits,
} from './formEntry'

describe('a card', () => {
  it('is digits grouped as the card prints them, no longer than its network’s', () => {
    expect(cardGrouped('4242424242424242')).toBe('4242 4242 4242 4242')
    expect(cardGrouped('4242 4242-42a4')).toBe('4242 4242 424')
    expect(cardGrouped('378282246310005')).toBe('3782 822463 10005')
    expect(cardGrouped('30569309025904')).toBe('3056 930902 5904')
    expect(cardTyped('42424242424242429999')).toBe('4242424242424242')
    expect(cardTyped('3782822463100059')).toBe('378282246310005')
    expect(cardGrouped('')).toBe('')
  })

  it('has a security code of digits as long as the card’s', () => {
    expect(cardTypedCode('12a34', 'visa')).toBe('123')
    expect(cardTypedCode('12345', 'amex')).toBe('1234')
    expect(cardTypedCode('12345', '')).toBe('1234')
  })

  it('writes its expiry’s slash by itself', () => {
    expect(cardTypedExpiry('', '0')).toBe('0')
    expect(cardTypedExpiry('0', '08')).toBe('08/')
    expect(cardTypedExpiry('08/', '08/2')).toBe('08/2')
    expect(cardTypedExpiry('08/2', '08/28')).toBe('08/28')
    expect(cardTypedExpiry('08/28', '08/281')).toBe('08/28')
    expect(cardTypedExpiry('', '4')).toBe('04/')
    expect(cardTypedExpiry('1', '12')).toBe('12/')
    expect(cardTypedExpiry('1', '13')).toBe('1')
    expect(cardTypedExpiry('0', '00')).toBe('0')
    expect(cardTypedExpiry('08/', '08')).toBe('0')
    expect(cardTypedExpiry('08/2', '08/')).toBe('08')
    expect(cardTypedExpiry('', '0828')).toBe('08/28')
    expect(cardTypedExpiry('', '8/28')).toBe('08/28')
  })

  it('says when it has expired', () => {
    const now = new Date(2026, 10, 10)
    expect(cardIsExpired('10/26', now)).toBe(true)
    expect(cardIsExpired('11/26', now)).toBe(false)
    expect(cardIsExpired('01/27', now)).toBe(false)
    expect(cardIsExpired('08/25', now)).toBe(true)
    expect(cardIsExpired('13/26', now)).toBe(false)
  })

  it('never stalls deleting a symbol the field writes', () => {
    expect(typedDigits('(415) 5', '(415 5')).toBe('415')
    expect(typedDigits('4242 4', '4242 ')).toBe('4242')
    expect(typedDigits('4242', '4242 4a')).toBe('42424')
  })
})

describe('a country', () => {
  it('has its flag and its code', () => {
    expect(countryFlag('FR')).toBe('🇫🇷')
    expect(countryFlag('us')).toBe('🇺🇸')
    expect(countryFlag('F')).toBe('')
    expect(country('SN')?.dial).toBe('221')
    const all = allCountries('en')
    expect(all.length).toBeGreaterThan(230)
    expect(new Set(all.map((one) => one.code)).size).toBe(all.length)
    expect(all.find((one) => one.code === 'DE')?.name).toBe('Germany')
    expect(allCountries('fr').find((one) => one.code === 'DE')?.name).toBe(
      'Allemagne',
    )
  })

  it('is the person’s own from their languages', () => {
    expect(hereCountry(['fr-FR', 'en'])).toBe('FR')
    expect(hereCountry(['en-GB'])).toBe('GB')
    expect(hereCountry([])).toBe('US')
  })
})

describe('a phone', () => {
  it('is grouped as its country writes it', () => {
    expect(phoneFormatted('4155550132', 'US')).toBe('(415) 555-0132')
    expect(phoneFormatted('415', 'US')).toBe('(415')
    expect(phoneFormatted('4155', 'US')).toBe('(415) 5')
    expect(phoneFormatted('612345678', 'FR')).toBe('6 12 34 56 78')
    expect(phoneFormatted('771234567', 'SN')).toBe('77 123 45 67')
    expect(phoneFormatted('912345678', 'UY')).toBe('912 345 678')
    expect(phoneFormatted('9123456789', 'UY')).toBe('912 345 6789')
    expect(phoneNational('06 12 34 56 78', 'FR')).toBe('612345678')
    expect(phoneNational('0612', 'IT')).toBe('0612')
  })

  it('is kept with its code and read back', () => {
    expect(phoneJoined('FR', '612345678')).toBe('+33 6 12 34 56 78')
    expect(phoneJoined('US', '4155550132')).toBe('+1 (415) 555-0132')
    expect(phoneJoined('FR', '')).toBe('')
    expect(phoneSplit('+33 6 12 34 56 78', 'US')).toEqual({
      country: 'FR',
      national: '612345678',
    })
    expect(phoneSplit('+1 (415) 555-0132', 'FR')).toEqual({
      country: 'US',
      national: '4155550132',
    })
    expect(phoneSplit('+1 416 555 0132', 'CA')).toEqual({
      country: 'CA',
      national: '4165550132',
    })
    expect(phoneSplit('+44 7911 123456', 'US')).toEqual({
      country: 'GB',
      national: '7911123456',
    })
    expect(phoneSplit('00221 77 123 45 67', 'FR')).toEqual({
      country: 'SN',
      national: '771234567',
    })
    expect(phoneSplit('06 12 34 56 78', 'FR')).toEqual({
      country: 'FR',
      national: '612345678',
    })
    expect(phoneSplit('', 'US')).toEqual({ country: 'US', national: '' })
  })
})

describe('a form', () => {
  it('says what to fix before it is saved', () => {
    const contact = { ...newDraft('contact'), country: 'FR' }
    expect(draftProblem(contact)).toBe('Add at least one detail.')
    expect(draftProblem({ ...contact, email: 'ada@example' })).toBe(
      'Check the email.',
    )
    expect(
      draftProblem({ ...contact, email: 'ada@example.com' }),
    ).toBeUndefined()
    const card = {
      ...newDraft('card'),
      number: '4242424242424242',
      expiry: '01/20',
    }
    expect(draftProblem(card)).toBe('This card has expired.')
    expect(draftProblem({ ...card, expiry: '08/49' })).toBeUndefined()
  })
})

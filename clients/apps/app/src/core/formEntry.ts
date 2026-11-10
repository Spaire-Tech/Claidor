// What the Credentials Store's forms make of what is typed (the core's
// FormEntry.swift, the same rules as the iPhone and the Mac), so nobody
// wonders how to write a field (10 November 2026, the founder: "Help the
// user. dont confuse him. have the card number be number only. separate
// them … automatically … add the / automatically … add flags, add area code
// like +1 us"):
//
//   - a card's number: digits only, grouped as the card prints them
//     (4242 4242 4242 4242; American Express 3782 822463 10005), no longer
//     than its network's;
//   - its expiry: the slash written by itself (08/28), a month that can't be
//     one refused as it's typed;
//   - its security code: digits only, 4 for American Express, 3 for the rest;
//   - a phone: the country's flag and code (+1, +33…) apart, the number
//     grouped as that country writes it, kept as "+33 6 12 34 56 78".

import { cardBrand, cardDigits, cardExpiry } from './credentialsStore'

// MARK: A card

/** The most digits a card of this network has. */
export function cardMaxDigits(brand: string): number {
  if (brand === 'amex') return 15
  if (brand === 'diners') return 14
  if (['visa', 'mastercard', 'discover', 'jcb'].includes(brand)) return 16
  return 19
}

/** The digits kept from what was typed: digits only, at most the network's. */
export function cardTyped(text: string): string {
  const all = cardDigits(text)
  return all.slice(0, cardMaxDigits(cardBrand(all)))
}

/** The number as the card prints it: 4-6-5 for American Express, 4-6-4 for Diners Club, else fours. */
export function cardGrouped(text: string): string {
  const number = cardTyped(text)
  const brand = cardBrand(number)
  const sizes =
    brand === 'amex'
      ? [4, 6, 5]
      : brand === 'diners'
        ? [4, 6, 4]
        : [4, 4, 4, 4, 3]
  const groups: string[] = []
  let rest = number
  for (const size of sizes) {
    if (rest === '') break
    groups.push(rest.slice(0, size))
    rest = rest.slice(size)
  }
  return groups.join(' ')
}

/** How many digits the security code has: 4 on American Express, 3 on the others. */
export function cardCodeLength(brand: string): number {
  return brand === 'amex' ? 4 : 3
}

/** The security code as typed: digits only, no more than the card's (4 while the network is unknown). */
export function cardTypedCode(text: string, brand: string): string {
  return cardDigits(text).slice(0, brand === '' ? 4 : cardCodeLength(brand))
}

/**
 * The expiry as it's typed, its slash written by itself: "1" stays (10 to
 * 12 may follow), "4" becomes "04/", "12" becomes "12/", "13" keeps "1"; a
 * slash deleted takes its month's last digit with it, so it can be typed
 * again. At most "MM/YY".
 */
export function cardTypedExpiry(old: string, next: string): string {
  let numbers = cardDigits(next)
  // The slash alone was deleted ("08/" to "08"): the month's last digit goes with it.
  if (
    next.length < old.length &&
    old.endsWith('/') &&
    cardDigits(old) === numbers
  )
    numbers = numbers.slice(0, -1)
  numbers = numbers.slice(0, 4)
  const first = numbers[0]
  if (first === undefined) return ''
  if (numbers.length === 1)
    return first === '0' || first === '1' ? numbers : `0${numbers}/`
  let month = numbers.slice(0, 2)
  let year = numbers.slice(2)
  if (month === '00' || Number(month) > 12) {
    // "13": the 1 is a month's first digit, the 3 can't follow it; "4…" became "04" above.
    if (first === '0' || first === '1') return first
    month = `0${first}`
    year = numbers.slice(1, 3)
  }
  if (year === '') return next.length >= old.length ? `${month}/` : month
  return `${month}/${year}`
}

/** Whether a card expiring "MM/YY" has expired: it's good to the month's last day. */
export function cardIsExpired(text: string, now: Date = new Date()): boolean {
  const expiry = cardExpiry(text)
  if (expiry === undefined) return false
  const [month, year] = expiry.split('/').map(Number) as [number, number]
  const thisYear = now.getFullYear() % 100
  const thisMonth = now.getMonth() + 1
  return year < thisYear || (year === thisYear && month < thisMonth)
}

/**
 * The digits of what was typed. When only a space, a bracket or a slash
 * between them was deleted, the digit before it goes too, so deleting never
 * stalls on a symbol the field writes back.
 */
export function typedDigits(before: string, after: string): string {
  const digits = cardDigits(after)
  if (after.length < before.length && digits === cardDigits(before))
    return digits.slice(0, -1)
  return digits
}

// MARK: Countries

/** Each country's phone code (ITU E.164), by its ISO code. */
// prettier-ignore
export const dialCodes: Readonly<Record<string, string>> = {
  AD: '376', AE: '971', AF: '93', AG: '1', AI: '1', AL: '355', AM: '374', AO: '244', AR: '54', AS: '1',
  AT: '43', AU: '61', AW: '297', AX: '358', AZ: '994', BA: '387', BB: '1', BD: '880', BE: '32', BF: '226',
  BG: '359', BH: '973', BI: '257', BJ: '229', BL: '590', BM: '1', BN: '673', BO: '591', BQ: '599', BR: '55',
  BS: '1', BT: '975', BW: '267', BY: '375', BZ: '501', CA: '1', CC: '61', CD: '243', CF: '236', CG: '242',
  CH: '41', CI: '225', CK: '682', CL: '56', CM: '237', CN: '86', CO: '57', CR: '506', CU: '53', CV: '238',
  CW: '599', CX: '61', CY: '357', CZ: '420', DE: '49', DJ: '253', DK: '45', DM: '1', DO: '1', DZ: '213',
  EC: '593', EE: '372', EG: '20', EH: '212', ER: '291', ES: '34', ET: '251', FI: '358', FJ: '679', FK: '500',
  FM: '691', FO: '298', FR: '33', GA: '241', GB: '44', GD: '1', GE: '995', GF: '594', GG: '44', GH: '233',
  GI: '350', GL: '299', GM: '220', GN: '224', GP: '590', GQ: '240', GR: '30', GT: '502', GU: '1', GW: '245',
  GY: '592', HK: '852', HN: '504', HR: '385', HT: '509', HU: '36', ID: '62', IE: '353', IL: '972', IM: '44',
  IN: '91', IO: '246', IQ: '964', IR: '98', IS: '354', IT: '39', JE: '44', JM: '1', JO: '962', JP: '81',
  KE: '254', KG: '996', KH: '855', KI: '686', KM: '269', KN: '1', KP: '850', KR: '82', KW: '965', KY: '1',
  KZ: '7', LA: '856', LB: '961', LC: '1', LI: '423', LK: '94', LR: '231', LS: '266', LT: '370', LU: '352',
  LV: '371', LY: '218', MA: '212', MC: '377', MD: '373', ME: '382', MF: '590', MG: '261', MH: '692', MK: '389',
  ML: '223', MM: '95', MN: '976', MO: '853', MP: '1', MQ: '596', MR: '222', MS: '1', MT: '356', MU: '230',
  MV: '960', MW: '265', MX: '52', MY: '60', MZ: '258', NA: '264', NC: '687', NE: '227', NF: '672', NG: '234',
  NI: '505', NL: '31', NO: '47', NP: '977', NR: '674', NU: '683', NZ: '64', OM: '968', PA: '507', PE: '51',
  PF: '689', PG: '675', PH: '63', PK: '92', PL: '48', PM: '508', PR: '1', PS: '970', PT: '351', PW: '680',
  PY: '595', QA: '974', RE: '262', RO: '40', RS: '381', RU: '7', RW: '250', SA: '966', SB: '677', SC: '248',
  SD: '249', SE: '46', SG: '65', SH: '290', SI: '386', SJ: '47', SK: '421', SL: '232', SM: '378', SN: '221',
  SO: '252', SR: '597', SS: '211', ST: '239', SV: '503', SX: '1', SY: '963', SZ: '268', TC: '1', TD: '235',
  TG: '228', TH: '66', TJ: '992', TK: '690', TL: '670', TM: '993', TN: '216', TO: '676', TR: '90', TT: '1',
  TV: '688', TW: '886', TZ: '255', UA: '380', UG: '256', US: '1', UY: '598', UZ: '998', VA: '39', VC: '1',
  VE: '58', VG: '1', VI: '1', VN: '84', VU: '678', WF: '681', WS: '685', XK: '383', YE: '967', YT: '262',
  ZA: '27', ZM: '260', ZW: '263',
}

/** The country a shared code means when nothing says otherwise (+1 the United States, +44 the United Kingdom…). */
// prettier-ignore
const primary: Readonly<Record<string, string>> = {
  '1': 'US', '7': 'RU', '39': 'IT', '44': 'GB', '47': 'NO', '61': 'AU', '212': 'MA', '262': 'RE', '358': 'FI', '590': 'GP', '599': 'CW',
}

export interface Country {
  /** "FR". */
  code: string
  /** In the person's language. */
  name: string
  /** "33", without the plus. */
  dial: string
  /** 🇫🇷. */
  flag: string
}

/** 🇫🇷 from "FR": its two letters as the regional indicators every system draws as the flag. */
export function countryFlag(code: string): string {
  const letters = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(letters)) return ''
  return String.fromCodePoint(
    ...[...letters].map((letter) => 127397 + letter.charCodeAt(0)),
  )
}

/** The country's name in the person's language ("France", "Allemagne"), else its code. */
export function countryName(code: string, language = 'en'): string {
  try {
    return (
      new Intl.DisplayNames([language, 'en'], { type: 'region' }).of(code) ??
      code
    )
  } catch {
    return code
  }
}

export function country(code: string, language = 'en'): Country | undefined {
  const key = code.toUpperCase()
  const dial = dialCodes[key]
  return dial === undefined
    ? undefined
    : {
        code: key,
        name: countryName(key, language),
        dial,
        flag: countryFlag(key),
      }
}

/** Every country with a phone code, by its name in the person's language. */
export function allCountries(language = 'en'): Country[] {
  const order = new Intl.Collator(language)
  return Object.keys(dialCodes)
    .map((code) => country(code, language) as Country)
    .sort((a, b) => order.compare(a.name, b.name))
}

/** The person's own country, from their browser's languages ("fr-FR"); the United States when they name none. */
export function hereCountry(
  languages: readonly string[] = navigatorLanguages(),
): string {
  for (const tag of languages) {
    try {
      const region = new Intl.Locale(tag).maximize().region
      if (region !== undefined && dialCodes[region] !== undefined) return region
    } catch {
      // Not a language tag.
    }
  }
  return 'US'
}

function navigatorLanguages(): readonly string[] {
  return typeof navigator === 'undefined' ? [] : navigator.languages
}

// MARK: A phone

/** How each country groups its numbers, without the 0 dialled at home ("#" a digit). */
// prettier-ignore
const patterns: Readonly<Record<string, string>> = {
  US: '(###) ###-####', CA: '(###) ###-####',
  FR: '# ## ## ## ##', MA: '# ## ## ## ##', CM: '# ## ## ## ##',
  GB: '#### ######', DE: '### ########', AT: '### #######', NL: '# ########',
  BE: '### ## ## ##', CH: '## ### ## ##', LU: '### ### ###', IE: '## ### ####',
  ES: '### ## ## ##', PT: '### ### ###', IT: '### ### ####', GR: '### ### ####',
  SE: '## ### ## ##', NO: '### ## ###', DK: '## ## ## ##', FI: '## ### ####',
  PL: '### ### ###', TR: '### ### ## ##', RU: '### ###-##-##', KZ: '### ###-##-##',
  SN: '## ### ## ##', CI: '## ## ## ## ##', DZ: '### ## ## ##', TN: '## ### ###',
  NG: '### ### ####', ZA: '## ### ####', KE: '### ######', EG: '### ### ####',
  AE: '## ### ####', SA: '## ### ####', IL: '##-###-####', IN: '##### #####',
  CN: '### #### ####', JP: '##-####-####', KR: '##-####-####', AU: '### ### ###',
  NZ: '## ### ####', BR: '(##) #####-####', MX: '## #### ####',
}

/** The countries whose numbers are dialled with a 0 at home, a 0 left out after the country's code. */
// prettier-ignore
const homeZero = new Set([
  'FR', 'GB', 'DE', 'AT', 'NL', 'BE', 'CH', 'IE', 'SE', 'FI', 'TR', 'MA', 'DZ', 'TN', 'NG', 'ZA', 'KE', 'EG',
  'AE', 'SA', 'IL', 'IN', 'CN', 'JP', 'KR', 'AU', 'NZ', 'BR', 'MX', 'AR', 'PE', 'CO', 'TH', 'VN', 'MY', 'ID', 'PH', 'PK',
])

/** The most digits a number has after its country's code. */
const phoneMaxDigits = 14

/** The digits kept from what was typed after the country's code: digits only, a home 0 left out. */
export function phoneNational(typed: string, countryCode: string): string {
  let numbers = cardDigits(typed)
  if (homeZero.has(countryCode.toUpperCase()) && numbers.startsWith('0'))
    numbers = numbers.slice(1)
  return numbers.slice(0, phoneMaxDigits)
}

/** The digits grouped as the country writes them; elsewhere in threes, the last group of up to four. */
export function phoneFormatted(national: string, countryCode: string): string {
  const numbers = cardDigits(national)
  if (numbers === '') return ''
  const pattern = patterns[countryCode.toUpperCase()]
  if (
    pattern !== undefined &&
    [...pattern].filter((c) => c === '#').length >= numbers.length
  ) {
    let written = ''
    let index = 0
    for (const character of pattern) {
      if (index >= numbers.length) break
      if (character === '#') {
        written += numbers[index]
        index += 1
      } else {
        written += character
      }
    }
    return written
  }
  // In threes: 612 345 678, 612 345 6789.
  const groups: string[] = []
  let rest = numbers
  while (rest.length > 4) {
    groups.push(rest.slice(0, 3))
    rest = rest.slice(3)
  }
  groups.push(rest)
  return groups.join(' ')
}

/** As it's kept: "+33 6 12 34 56 78"; empty with no number. */
export function phoneJoined(countryCode: string, national: string): string {
  const numbers = cardDigits(national)
  if (numbers === '') return ''
  const dial = dialCodes[countryCode.toUpperCase()] ?? ''
  const written = phoneFormatted(numbers, countryCode)
  return dial === '' ? written : `+${dial} ${written}`
}

/**
 * A kept number taken apart: its country (from its code, the one asked for
 * when the code is shared, as +1 is) and the digits after it. A number with
 * no code is the country asked for.
 */
export function phoneSplit(
  phone: string,
  wanted: string,
): { country: string; national: string } {
  const preferred = wanted.toUpperCase()
  const text = phone.trim()
  let numbers = cardDigits(text)
  const international = text.startsWith('+') || numbers.startsWith('00')
  if (!international)
    return { country: preferred, national: phoneNational(numbers, preferred) }
  if (numbers.startsWith('00')) numbers = numbers.slice(2)
  for (const length of [3, 2, 1]) {
    if (numbers.length <= length) continue
    const dial = numbers.slice(0, length)
    const countries = Object.keys(dialCodes)
      .filter((code) => dialCodes[code] === dial)
      .sort()
    if (countries.length === 0) continue
    const found = countries.includes(preferred)
      ? preferred
      : (primary[dial] ?? (countries[0] as string))
    return {
      country: found,
      national: numbers.slice(length, length + phoneMaxDigits),
    }
  }
  return { country: preferred, national: numbers.slice(0, phoneMaxDigits) }
}

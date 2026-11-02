// The flights an agent found and the travellers' form for the one booked,
// as SimeonCore reads them: Chat.swift's `FlightsCard` (the search's
// offers, read from one `simeon-flights` block), Flights.swift's
// `FlightText` and the words each row and the details say, GroupMembers.swift's
// `FlightPane` key, and FlightBooking.swift's `FlightPassengersCard`,
// `BookedFlight`, `Traveller` (the form's checks, as the host's
// `checkTravellers`) and `FlightBookingAnswer`.
//
// The server's words (`server/simeon/desktop/flights.py`) come in English
// and are only fitted to the row ("2:30 PM" is "2:30pm"); the sentences
// around them are the app's, in the person's language.

import type { Entry } from './entry'
import {
  type JSONObject,
  type JSONValue,
  arr,
  bool,
  field,
  int,
  isObject,
  parseJSON,
  str,
  text,
} from './json'
import { t } from './l10n'
import { soleFence } from './markdown'

// MARK: Swift's ways with text

/** The text cut into what a person reads as characters (Swift's `Character`). */
function characters(value: string): string[] {
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
    (piece) => piece.segment,
  )
}

/** Spaces and tabs off both ends (`trimmingCharacters(in: .whitespaces)`). */
function trimSpaces(value: string): string {
  return value.replace(/^[\p{Zs}\t]+|[\p{Zs}\t]+$/gu, '')
}

/** Spaces and line breaks off both ends (`trimmingCharacters(in: .whitespacesAndNewlines)`). */
function trimLines(value: string): string {
  return value.replace(
    /^[\p{Zs}\t\n\v\f\r\u0085\u2028\u2029]+|[\p{Zs}\t\n\v\f\r\u0085\u2028\u2029]+$/gu,
    '',
  )
}

/** A whole number as Swift's `Int(_ text:)` reads one: a sign at most, then ASCII digits only. */
function swiftInt(value: string): number | undefined {
  if (!/^[+-]?[0-9]+$/.test(value)) return undefined
  const number = Number.parseInt(value, 10)
  // Past what a 64-bit Int holds, Swift reads nothing; JavaScript is exact only this far.
  return Number.isSafeInteger(number) ? number : undefined
}

/**
 * The 91 Han characters that have a value as a number (一, 二, 十, 百, 万…):
 * Swift's `\d` reads a character as a digit when its first scalar has any
 * numeric type (`Character.isNumber`), which takes these as well as every
 * Unicode number (`\p{N}`). Measured from Swift 6.2's `Unicode.Scalar.Properties`.
 */
const hanNumbers = new Set(
  (
    '3405 3483 382A 3B4D 4E00 4E03 4E07 4E09 4E24 4E5D 4E8C 4E94 4E96 4EAC ' +
    '4EBF 4EC0 4EDF 4EE8 4F0D 4F70 4FE9 5006 5104 5146 5169 516B 516D 5341 ' +
    '5343 5344 5345 534C 53C1 53C2 53C3 53C4 56DB 58F1 58F9 5E7A 5EFE 5EFF ' +
    '5F0C 5F0D 5F0E 5F10 62D0 62FE 634C 67D2 6D1E 6F06 7396 767E 7695 79ED ' +
    '8086 842C 8CAE 8CB3 8D30 920E 94A9 9621 9646 964C 9678 96F6 F96B F973 ' +
    'F978 F9B2 F9D1 F9D3 F9FD 20001 20064 200E2 20121 2092A 20983 2098C ' +
    '2099C 20AEA 20AFD 20B19 22390 22998 23B1B 2626D 2F890'
  )
    .split(' ')
    .map((hex) => Number.parseInt(hex, 16)),
)

/** A character Swift's `\d` takes for a digit: its first scalar has a numeric value. */
function isDigit(character: string): boolean {
  const first = character.codePointAt(0)
  if (first == null) return false
  return /^\p{N}/u.test(character) || hanNumbers.has(first)
}

/** A character Swift's `\s` takes for space: its first scalar is white space. */
function isSpace(character: string): boolean {
  return /^\p{White_Space}/u.test(character)
}

// MARK: The row's words (Flights.swift's `FlightText`)

/** "2:30 PM" is "2:30pm" and "10:46 PM +1" is "10:46pm+1" (without the day when `days` is false); anything else stays as it is. */
export function clock(value: string, days = true): string {
  const parts = value.split(' ').filter((part) => part !== '')
  if (
    parts.length < 2 ||
    !parts[0]!.includes(':') ||
    !['AM', 'PM'].includes(parts[1]!.toUpperCase())
  )
    return value
  const later =
    days && parts.length > 2 && parts[2]!.startsWith('+') ? parts[2]! : ''
  return parts[0]! + parts[1]!.toLowerCase() + later
}

/** Minutes in "2h 40m", "2h40m", "3h" or "45m". */
export function minutes(value: string): number | undefined {
  let rest = value.replaceAll(' ', '')
  let total = 0
  let found = false
  const h = rest.indexOf('h')
  if (h >= 0) {
    const hours = swiftInt(rest.slice(0, h))
    if (hours == null) return undefined
    total += hours * 60
    found = true
    rest = rest.slice(h + 1)
  }
  const m = rest.indexOf('m')
  if (m >= 0) {
    const count = swiftInt(rest.slice(0, m))
    if (count == null) return undefined
    total += count
    found = true
    rest = rest.slice(m + 1)
  }
  return found && rest === '' ? total : undefined
}

/** "2h40m", "8h05m", "3h", "45m". */
export function spanOfMinutes(total: number): string {
  const hours = Math.trunc(total / 60)
  const left = total % 60 || 0
  if (hours > 0 && left > 0) return `${hours}h${left < 10 ? '0' : ''}${left}m`
  return hours > 0 ? `${hours}h` : `${left}m`
}

/** "2h 40m" as "2h40m"; anything that isn't a span stays as it is. */
export function span(value: string): string {
  const total = minutes(value)
  return total == null ? value : spanOfMinutes(total)
}

/** The stops a row shows: none for a nonstop ("Nonstop" is the plain case), "1 stop" for "1 stop · PHX 1h 38m". */
export function stopCount(stops: string): string {
  const first = stops.split(' · ')[0] ?? ''
  return first === 'Nonstop' ? '' : first
}

/** "Nonstop" or "1 stop": the first part of the server's stops line (`FlightText.stops`). */
export function stopsWord(stops: string): string {
  return stops.split(' · ')[0] ?? ''
}

// MARK: The search's card (Chat.swift's `FlightsCard`)

/** One flight of an offer, as the server wrote it. */
export interface FlightLeg {
  from: string
  fromCity: string
  to: string
  toCity: string
  depart: string
  arrive: string
  flight: string
  carrier: string
  logo: string
  cabin: string
  duration: string
  layover: string
  /** "Return · Sun, Oct 18" on the first flight back of a round trip. */
  heading: string
  departDay: string
  arriveDay: string
}

/** One airline offer on a flights card (the patch's `__simeonFlightsParse`). */
export interface FlightOffer {
  airline: string
  logo: string
  price: string
  priceNote: string
  date: string
  from: string
  fromCity: string
  to: string
  toCity: string
  depart: string
  arrive: string
  duration: string
  stops: string
  refundable: string
  changeable: string
  bags: string
  returnTimes: string
  legs: FlightLeg[]
  /** Duffel's offer id: what "Book with Simeon" books; empty on a card from before booking. */
  offerId: string
  /** Who sells the ticket when it is not the airline flown ("Hahn Air" on an Air Senegal flight); empty otherwise. */
  soldBy: string
}

/** Flight results: an agent's message that is exactly one `simeon-flights` block of JSON, up to eight offers. */
export interface FlightsCard {
  title: string
  subtitle: string
  offers: FlightOffer[]
  /** Duffel's test mode: pretend fares (the server's `test`, or "Test results" in the subtitle of a card from before it sent one). */
  isTest: boolean
}

/** A field's words, trimmed; "" for anything that isn't words. */
function words(value: JSONValue | undefined, key: string): string {
  return trimLines(str(field(value, key)) ?? '')
}

export function parseFlights(message: string): FlightsCard | undefined {
  const body = soleFence(message, 'simeon-flights')
  const json = body == null ? undefined : parseJSON(body)
  if (json === undefined) return undefined
  const offers = (arr(field(json, 'offers')) ?? [])
    .filter(isObject)
    .slice(0, 8)
    .map((o): FlightOffer => {
      const s = (key: string) => words(o, key)
      const legs = (arr(field(o, 'legs')) ?? [])
        .filter(isObject)
        .map((l): FlightLeg => {
          const w = (key: string) => words(l, key)
          return {
            from: w('from'),
            fromCity: w('fromCity'),
            to: w('to'),
            toCity: w('toCity'),
            depart: w('depart'),
            arrive: w('arrive'),
            flight: w('flight'),
            carrier: w('carrier'),
            logo: w('logo'),
            cabin: w('cabin'),
            duration: w('duration'),
            layover: w('layover'),
            heading: w('heading'),
            departDay: w('departDay'),
            arriveDay: w('arriveDay'),
          }
        })
      return {
        airline: s('airline'),
        logo: s('logo'),
        price: s('price'),
        priceNote: s('priceNote'),
        date: s('date'),
        from: s('from'),
        fromCity: s('fromCity'),
        to: s('to'),
        toCity: s('toCity'),
        depart: s('depart'),
        arrive: s('arrive'),
        duration: s('duration'),
        stops: s('stops'),
        refundable: s('refundable'),
        changeable: s('changeable'),
        bags: s('bags'),
        returnTimes: s('returnTimes'),
        legs,
        offerId: s('offerId'),
        soldBy: s('soldBy'),
      }
    })
  if (offers.length === 0) return undefined
  const subtitle = words(json, 'subtitle')
  return {
    title: words(json, 'title'),
    subtitle,
    offers,
    isTest:
      bool(field(json, 'test')) === true ||
      subtitle.split(' · ').includes('Test results'),
  }
}

/** The flights card a chat line is (its words, as `Chat.row(for:)` reads them), or none. */
export function flightsCard(entry: Entry): FlightsCard | undefined {
  const words =
    entry.kind === 'send-message'
      ? str(field(entry.message, 'content'))
      : entry.content
  return words == null ? undefined : parseFlights(words)
}

/** "AA" for American Airlines: the mark when the airline has no logo (`__simeonInitials`). */
export function initials(name: string): string {
  const named = name
    .split(/\p{White_Space}+/u)
    .filter(
      (word) =>
        word !== '' &&
        !['airline', 'airlines', 'airways', 'air'].includes(word.toLowerCase()),
    )
  if (named.length > 1)
    return (
      (characters(named[0]!)[0] ?? '') + (characters(named[1]!)[0] ?? '')
    ).toUpperCase()
  return characters(named[0] ?? '?')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const dayStarts = [
  'Mon, ',
  'Tue, ',
  'Wed, ',
  'Thu, ',
  'Fri, ',
  'Sat, ',
  'Sun, ',
]
const isDay = (part: string) =>
  dayStarts.some((start) => part.startsWith(start))
const subtitleParts = (card: FlightsCard) =>
  card.subtitle.split(' · ').filter((part) => part !== '')

/** "Seattle to Los Angeles — Sat, Oct 10": the route with its date, as the card's one heading. */
export function flightsHeading(card: FlightsCard): string {
  const day = subtitleParts(card).find(isDay) ?? ''
  return [card.title, day].filter((part) => part !== '').join(' — ')
}

/** What else the subtitle says, under the heading: "Test results · Refundable · 2 adults" (one adult, the usual, is left unsaid). */
export function flightsAside(card: FlightsCard): string {
  return subtitleParts(card)
    .filter((part) => !isDay(part) && part !== '1 adult')
    .join(' · ')
}

/** One line of times on a row: departs, the time in the air (and the stops), arrives. */
export interface FlightTimes {
  depart: string
  label: string
  arrive: string
}

/** The flights one way (out, or back on a round trip), each in its own card. */
export interface FlightWay {
  /** Empty for a one-way trip. */
  title: string
  legs: FlightLeg[]
}

const joined = (parts: string[], separator: string) =>
  parts.filter((part) => part !== '').join(separator)

/** The way out's line: "2:30pm", "2h40m" (with "· 1 stop" when it stops), "5:10pm". */
export function outbound(offer: FlightOffer): FlightTimes {
  return {
    depart: clock(offer.depart),
    label: joined([span(offer.duration), stopCount(offer.stops)], ' · '),
    arrive: clock(offer.arrive),
  }
}

/** The legs of the way back, on a round trip: from the first leg the server heads "Return". */
export function returnLegs(offer: FlightOffer): FlightLeg[] {
  const start = offer.legs.findIndex((leg) => leg.heading.startsWith('Return'))
  return start < 0 ? [] : offer.legs.slice(start)
}

/**
 * The way back's line on a round trip, from the server's "Return 7:46 PM
 * – 10:40 PM +1 · 1 stop · PHX 1h 38m"; its time in the air is its flights
 * and layovers added up, left out when one isn't stated.
 */
export function inbound(offer: FlightOffer): FlightTimes | undefined {
  if (!offer.returnTimes.startsWith('Return ')) return undefined
  const parts = offer.returnTimes.slice('Return '.length).split(' · ')
  const times = parts[0]!.split(' – ')
  if (times.length !== 2) return undefined
  const back = returnLegs(offer)
  let total: number | undefined = back.length === 0 ? undefined : 0
  for (const [index, leg] of back.entries()) {
    const flying = minutes(leg.duration)
    if (flying == null) {
      total = undefined
      break
    }
    if (total != null) total += flying
    if (index < back.length - 1) {
      const wait = minutes(leg.layover.split(' in ')[0] ?? '')
      if (wait == null) {
        total = undefined
        break
      }
      if (total != null) total += wait
    }
  }
  const stops = parts.length > 1 ? stopCount(parts[1]!) : ''
  return {
    depart: clock(times[0]!),
    label: joined([total == null ? '' : spanOfMinutes(total), stops], ' · '),
    arrive: clock(times[1]!),
  }
}

/** The flights, one way after the other; the two ways of a round trip carry titles ("Outbound · Sat, Oct 10", "Return · Sun, Oct 12"). */
export function ways(offer: FlightOffer): FlightWay[] {
  const back = returnLegs(offer)
  if (back.length === 0 || back.length >= offer.legs.length)
    return offer.legs.length === 0 ? [] : [{ title: '', legs: offer.legs }]
  return [
    {
      title: offer.date === '' ? t('Outbound') : t`Outbound · ${offer.date}`,
      legs: offer.legs.slice(0, offer.legs.length - back.length),
    },
    { title: back[0]!.heading, legs: back },
  ]
}

/** The details' subtitle: "Nonstop · 2h40m". */
export function shape(offer: FlightOffer): string {
  return joined([stopsWord(offer.stops), span(offer.duration)], ' · ')
}

/** The fare's terms in a line each: cancelling, changing, bags, and who sells it. */
export function terms(offer: FlightOffer): string[] {
  const lines: string[] = []
  // The server's words (`flights.py`) are read in English; the sentences around them are the app's.
  const refundable = offer.refundable
  if (refundable === 'Full refund') lines.push(t('Full refund if you cancel'))
  else if (refundable === 'No refund') lines.push(t('No refund if you cancel'))
  else if (refundable === 'Not stated') lines.push(t('Refund rules not stated'))
  else if (refundable.startsWith('Refund minus ')) {
    const fee = refundable.slice('Refund minus '.length)
    lines.push(t`Refund minus ${fee} if you cancel`)
  } else if (refundable !== '') lines.push(t`Cancellation: ${refundable}`)
  const changeable = offer.changeable
  if (changeable === 'Free') lines.push(t('Free changes'))
  else if (changeable === 'Not allowed') lines.push(t('No changes allowed'))
  else if (changeable === 'Not stated') lines.push(t('Change rules not stated'))
  else if (changeable.endsWith(' fee')) {
    const fee = changeable.slice(0, -' fee'.length)
    lines.push(t`Changes for a ${fee} fee`)
  } else if (changeable !== '') lines.push(t`Changes: ${changeable}`)
  if (offer.bags === 'Not stated') lines.push(t('Bags not stated'))
  else if (offer.bags !== '') lines.push(offer.bags)
  if (offer.soldBy !== '') lines.push(t`Sold by: ${offer.soldBy}`)
  return lines
}

function when(day: string, time: string): string {
  const shown = clock(time, day === '')
  if (day === '' || shown === '') return day === '' ? shown : day
  return t`${day} at ${shown}`
}

/** "Sat, Oct 10 at 2:30pm" (the day says when it lands a day later, so no "+1"). */
export function departing(leg: FlightLeg): string {
  return when(leg.departDay, leg.depart)
}

export function arriving(leg: FlightLeg): string {
  return when(leg.arriveDay, leg.arrive)
}

/** "DL 2830 · Delta Air Lines", then "Operated by SkyWest" when another airline flies it. */
export function flightLines(leg: FlightLeg): string[] {
  const parts = leg.flight.split(' · operated by ')
  const number = joined([parts[0]!, leg.carrier], ' · ')
  return parts.length > 1 ? [number, t`Operated by ${parts[1]!}`] : [number]
}

/** "1h 38m layover in Phoenix", between this flight and the next. */
export function layoverLine(leg: FlightLeg): string {
  const layover = leg.layover
  if (layover === '' || layover.startsWith('Layover')) return layover
  const place = layover.indexOf(' in ')
  if (place < 0) return t`${layover} layover`
  const stay = layover.slice(0, place)
  const city = layover.slice(place + ' in '.length)
  return t`${stay} layover in ${city}`
}

/**
 * The size of an airline's logo inside its round mark (`AirlineLogo.box`):
 * the largest box of the logo's own shape the circle holds, a little
 * inside it. A square symbol fills about two thirds of the circle; a long
 * wordmark runs nearly across it instead of shrinking to a sliver.
 */
export function logoBox(
  width: number,
  height: number,
  diameter: number,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const aspect = width / height
  const across = (diameter * 0.92) / Math.sqrt(1 + aspect * aspect)
  return { width: across * aspect, height: across }
}

/** The open flight's key: the card's row and the offer's place in it (`FlightPane.key`). */
export function flightKey(row: string, index: number): string {
  return `${row}:${index}`
}

/** A flight's details open beside its chat (`PaneState.OpenFlight`): its key, the offer as it was opened, and the agent whose chat holds the card. */
export interface OpenFlight {
  key: string
  offer: FlightOffer
  agentId: string
}

/** The card's row and the offer's place, read back from a key (the Mac's pane splits it at its last ":"). */
export function flightPlace(
  key: string,
): { rowId: string; index: number } | undefined {
  const parts = key.split(':')
  const index = swiftInt(parts[parts.length - 1] ?? '')
  if (index == null) return undefined
  return { rowId: parts.slice(0, -1).join(':'), index }
}

// MARK: Booking (FlightBooking.swift)

/** A seat on the flight: its passenger id, and adult, child or infant_without_seat. */
export interface Seat {
  id: string
  type: string
}

/** The flight on the form and the checkout card (the host's `FlightBlock`). */
export interface BookedFlight {
  offerId: string
  route: string
  airline: string
  logo: string
  date: string
  from: string
  to: string
  depart: string
  arrive: string
  duration: string
  stops: string
  priceNote: string
  returnTimes: string
  total: string
  documentsRequired: boolean
  /** The airline's conditions (https only). */
  conditionsURL?: string
  passengers: Seat[]
  /** Duffel's test mode: a pretend airline, nothing charged. */
  isTest: boolean
  /** On the checkout card: who flies. */
  travellers: string[]
  /** The day the last flight leaves ("2026-11-12"): an adult is 18 or over on it. */
  lastFlightDate: string
  /** What changed since the person last saw it ("Changed since you picked it: Price now $239.40 (was $214.10)"), or empty. */
  changed: string
}

/** An address that is https, as Swift's `URL(string:)` with that scheme. */
function httpsAddress(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

export function bookedFlight(
  json: JSONValue | undefined,
): BookedFlight | undefined {
  const s = (key: string) => words(json, key)
  if (!s('offerId').startsWith('off_') || s('route') === '') return undefined
  const seats = (arr(field(json, 'passengers')) ?? []).flatMap((seat) => {
    const id = text(field(seat, 'id'))
    return id == null
      ? []
      : [{ id, type: text(field(seat, 'type')) ?? 'adult' }]
  })
  return {
    offerId: s('offerId'),
    route: s('route'),
    airline: s('airline'),
    logo: s('logo'),
    date: s('date'),
    from: s('from'),
    to: s('to'),
    depart: s('depart'),
    arrive: s('arrive'),
    duration: s('duration'),
    stops: s('stops'),
    priceNote: s('priceNote'),
    returnTimes: s('returnTimes'),
    total: s('total'),
    documentsRequired: bool(field(json, 'documentsRequired')) ?? false,
    conditionsURL: httpsAddress(s('conditionsUrl')),
    passengers: seats.length === 0 ? [{ id: '', type: 'adult' }] : seats,
    isTest: bool(field(json, 'test')) ?? false,
    travellers: (arr(field(json, 'travellers')) ?? []).flatMap((name) => {
      const one = text(name)
      return one == null ? [] : [one]
    }),
    lastFlightDate: s('lastFlightDate'),
    changed: s('changed'),
  }
}

/** "Thu, Nov 12 · 6:49am – 9:34am · Nonstop" */
export function whenLine(flight: BookedFlight): string {
  const times = joined([clock(flight.depart), clock(flight.arrive)], ' – ')
  return joined([flight.date, times, stopsWord(flight.stops)], ' · ')
}

/** The fare and its total under the times: "1 adult · Economy · One way · $361.20" (the Mac's `MacFlightLines`). */
export function fareLine(flight: BookedFlight): string {
  return joined([flight.priceNote, flight.total], ' · ')
}

export type PassengersState = 'open' | 'saved' | 'canceled'

/** The traveller form for a flight being booked (`flight-passengers`). */
export interface FlightPassengersCard {
  flight: BookedFlight
  /** What Link knows of the person, for the first traveller (cleared once the form is sent). */
  prefill: Traveller[]
  state: PassengersState
  /** The travellers' names once saved: all the chat keeps. */
  names: string[]
  /** Why Continue didn't go through: Link not connected, a limit. */
  note?: string
  /** The checkout card the form led to. */
  checkoutId?: string
}

export function flightPassengersCard(
  entry: Entry,
): FlightPassengersCard | undefined {
  const message = entry.message
  const flight = bookedFlight(field(message, 'flight'))
  if (!flight) return undefined
  const state = text(entry.get('passengersState'))
  const note = trimLines(text(entry.get('passengersNote')) ?? '')
  return {
    flight,
    prefill: (arr(field(message, 'prefill')) ?? []).map((item, index) =>
      travellerFrom(flight.passengers[index]?.id ?? '', item),
    ),
    state: state === 'saved' || state === 'canceled' ? state : 'open',
    names: (arr(entry.get('passengersNames')) ?? []).flatMap((name) => {
      const one = text(name)
      return one == null ? [] : [one]
    }),
    note: note === '' ? undefined : note,
    checkoutId: text(entry.get('passengersCheckoutId')),
  }
}

/** The form to fill in: one traveller per seat, the first with what Link knows. */
export function startingTravellers(card: FlightPassengersCard): Traveller[] {
  return card.flight.passengers.map((seat, index) => ({
    ...(card.prefill[index] ?? newTraveller(seat.id)),
    id: seat.id,
  }))
}

// The form's words (`FlightPassengersCard`'s), read when shown so they are in the person's language.

/** "Travellers" */
export const travellersTitle = () => t('Travellers')
/** "Add traveller details" */
export const fillInWords = () => t('Add traveller details')
/** "Names exactly as on the ID used to travel." */
export const asOnIDWords = () => t('Names exactly as on the ID used to travel.')
/** "Continue" */
export const continueWords = () => t('Continue')
/** "Cancel" */
export const cancelWords = () => t('Cancel')

/** "Ada wants to book a flight" */
export function bookingHeadline(agent: string): string {
  const who = trimLines(agent)
  return who === ''
    ? t('Your agent wants to book a flight')
    : t`${who} wants to book a flight`
}

const seatType = (card: FlightPassengersCard, index: number) =>
  card.flight.passengers[index]?.type ?? 'adult'

/** "Traveller 1 · Adult", or just "Adult" for one. */
export function seatLabel(card: FlightPassengersCard, index: number): string {
  const type = seatType(card, index)
  const kind =
    type === 'child'
      ? t('Child')
      : type.startsWith('infant')
        ? t('Infant')
        : t('Adult')
  return card.flight.passengers.length > 1
    ? t`Traveller ${index + 1} · ${kind}`
    : kind
}

/** Where it stands once answered, for the line under the card. */
export function passengersStatus(
  card: FlightPassengersCard,
): string | undefined {
  switch (card.state) {
    case 'open':
      return undefined
    case 'saved':
      return card.names.length === 0
        ? t('Details saved')
        : card.names.join(', ')
    case 'canceled':
      return t('Canceled')
  }
}

/** In the chat list and a quote. */
export function passengersListLine(card: FlightPassengersCard): string {
  return t`Traveller details · ${card.flight.route}`
}

/** The day this traveller must be 18 by, for an adult's seat (the last flight's day); none for a child's or with no day. */
export function adultOn(
  card: FlightPassengersCard,
  index: number,
): string | undefined {
  return seatType(card, index) === 'adult' && card.flight.lastFlightDate !== ''
    ? card.flight.lastFlightDate
    : undefined
}

// MARK: A traveller

export type TravellerTitle = 'mr' | 'ms' | 'mrs' | 'miss' | 'dr'
export type TravellerGender = 'f' | 'm'

export const travellerTitles: TravellerTitle[] = [
  'mr',
  'ms',
  'mrs',
  'miss',
  'dr',
]
export const travellerGenders: TravellerGender[] = ['f', 'm']

export function titleLabel(title: TravellerTitle): string {
  switch (title) {
    case 'mr':
      return t('Mr')
    case 'ms':
      return t('Ms')
    case 'mrs':
      return t('Mrs')
    case 'miss':
      return t('Miss')
    case 'dr':
      return t('Dr')
  }
}

export function genderLabel(gender: TravellerGender): string {
  return gender === 'f' ? t('Female') : t('Male')
}

/** One traveller as the form holds them (in the sheet's memory only), and as the host's `checkTravellers` wants them. */
export interface Traveller {
  id: string
  title?: TravellerTitle
  gender?: TravellerGender
  givenName: string
  familyName: string
  /** YYYY-MM-DD */
  bornOn: string
  email: string
  phone: string
  passportNumber: string
  /** Two letters, "US". */
  passportCountry: string
  /** YYYY-MM-DD */
  passportExpires: string
}

export function newTraveller(id: string): Traveller {
  return {
    id,
    givenName: '',
    familyName: '',
    bornOn: '',
    email: '',
    phone: '',
    passportNumber: '',
    passportCountry: '',
    passportExpires: '',
  }
}

/** What Link knows of a traveller (`prefill`): the names, the email and the phone. */
function travellerFrom(id: string, json: JSONValue): Traveller {
  return {
    ...newTraveller(id),
    givenName: str(field(json, 'given_name')) ?? '',
    familyName: str(field(json, 'family_name')) ?? '',
    email: str(field(json, 'email')) ?? '',
    phone: str(field(json, 'phone_number')) ?? '',
  }
}

export function travellerName(traveller: Traveller): string {
  return trimSpaces(`${traveller.givenName} ${traveller.familyName}`)
}

/** What Continue sends (`submitFlightPassengers`). */
export function travellerJSON(traveller: Traveller): JSONObject {
  const fields: JSONObject = {
    id: traveller.id,
    title: traveller.title ?? '',
    gender: traveller.gender ?? '',
    given_name: trimSpaces(traveller.givenName),
    family_name: trimSpaces(traveller.familyName),
    born_on: traveller.bornOn,
    email: trimSpaces(traveller.email),
    phone_number: trimSpaces(traveller.phone),
  }
  if (trimSpaces(traveller.passportNumber) !== '')
    fields.passport = {
      number: traveller.passportNumber,
      issuing_country_code: traveller.passportCountry.toUpperCase(),
      expires_on: traveller.passportExpires,
    }
  return fields
}

const nameMarks = new Set('!"#$%&()*+,./:;<=>?@[\\]^_`{|}~')

/** A name as on the ID: 1 to 40 characters, no digits and none of the marks the host refuses. */
function isName(value: string): boolean {
  const each = characters(value)
  return (
    each.length >= 1 &&
    each.length <= 40 &&
    each.every((character) => !isDigit(character) && !nameMarks.has(character))
  )
}

/** An email: 1 to 64 characters, "@", then a name with a dot in it and at least 2 characters after the dot; no spaces, one "@". */
function isEmail(value: string): boolean {
  const each = characters(value)
  if (each.some(isSpace)) return false
  const at = each.indexOf('@')
  if (at < 1 || at > 64 || each.lastIndexOf('@') !== at) return false
  const domain = each.slice(at + 1)
  return domain.some(
    (character, index) =>
      character === '.' &&
      index >= 1 &&
      index <= 190 &&
      domain.length - index - 1 >= 2,
  )
}

/** A phone with its country code: "+", a digit 1 to 9, then 6 to 14 digits. */
function isPhone(value: string): boolean {
  const each = characters(value)
  return (
    each[0] === '+' &&
    /^[1-9]$/.test(each[1] ?? '') &&
    each.length - 2 >= 6 &&
    each.length - 2 <= 14 &&
    each.slice(2).every(isDigit)
  )
}

/** The first thing to fix, as the host checks it (`checkTravellers`), so Continue says it at once: the field and the sentence. `adultOn`: the day an adult must be 18 by (`adultOn`). */
export function travellerProblem(
  traveller: Traveller,
  passportNeeded: boolean,
  adultOnDay?: string,
  today: Date = new Date(),
): { field: string; message: string } | undefined {
  if (!isName(trimSpaces(traveller.givenName)))
    return {
      field: 'given_name',
      message: t('Write the first name as on the ID.'),
    }
  if (!isName(trimSpaces(traveller.familyName)))
    return {
      field: 'family_name',
      message: t('Write the last name as on the ID.'),
    }
  if (traveller.title == null)
    return { field: 'title', message: t('Choose a title.') }
  if (traveller.gender == null)
    return { field: 'gender', message: t('Choose the gender on the ID.') }
  const now = dayOf(today)
  const born = dateOf(traveller.bornOn)
  if (born == null || !(traveller.bornOn < now) || born.getFullYear() < 1900)
    return {
      field: 'born_on',
      message: t("The date of birth isn't right."),
    }
  if (
    adultOnDay != null &&
    dateOf(adultOnDay) != null &&
    age(traveller.bornOn, adultOnDay) < 18
  )
    return {
      field: 'born_on',
      message: t(
        'An adult must be 18 or older on the day of the last flight; check the date of birth.',
      ),
    }
  if (!isEmail(trimSpaces(traveller.email)))
    return {
      field: 'email',
      message: t("The email address isn't right."),
    }
  const digits = traveller.phone.replace(/[\t\n\f\r\p{Z}().-]/gu, '')
  if (!isPhone(digits))
    return {
      field: 'phone_number',
      message: t(
        'The phone number needs its country code, like +1 206 555 0100.',
      ),
    }
  const passport = traveller.passportNumber.replaceAll(' ', '')
  if (passport !== '') {
    if (!/^[A-Za-z0-9]{5,20}$/.test(passport))
      return {
        field: 'passport',
        message: t("The passport number isn't right."),
      }
    if (!/^[A-Z]{2}$/.test(traveller.passportCountry.toUpperCase()))
      return { field: 'passport', message: t("Choose the passport's country.") }
    if (
      dateOf(traveller.passportExpires) == null ||
      !(traveller.passportExpires > now)
    )
      return { field: 'passport', message: t('That passport has expired.') }
  } else if (passportNeeded)
    return {
      field: 'passport',
      message: t('This airline needs the passport.'),
    }
  return undefined
}

/** Whole years from one "YYYY-MM-DD" to another. */
export function age(born: string, on: string): number {
  const ints = (day: string) =>
    day
      .split('-')
      .filter((part) => part !== '')
      .map(swiftInt)
      .filter((part): part is number => part != null)
  const b = ints(born)
  const d = ints(on)
  if (b.length !== 3 || d.length !== 3) return 0
  const before = d[1]! < b[1]! || (d[1] === b[1] && d[2]! < b[2]!)
  return d[0]! - b[0]! - (before ? 1 : 0)
}

const pad = (value: number, size: number) => String(value).padStart(size, '0')

/** "1987-07-24" for a date picked on the form (the calendar day, wherever the person is). */
export function dayOf(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`
}

/** The day a "YYYY-MM-DD" names, at noon so no time zone moves it; none when it isn't one. */
export function dateOf(value: string): Date | undefined {
  const parts = value
    .split('-')
    .filter((part) => part !== '')
    .map(swiftInt)
    .filter((part): part is number => part != null)
  // Year 0 is 1 BC in Swift's Gregorian calendar, so "0000-…" never reads back as itself there.
  if (parts.length !== 3 || value.length !== 10 || parts[0]! < 1)
    return undefined
  const date = new Date(2000, 0, 1, 12)
  date.setFullYear(parts[0]!, parts[1]! - 1, parts[2]!)
  if (Number.isNaN(date.getTime()) || dayOf(date) !== value) return undefined
  return date
}

// MARK: The computer's answer

/** The answer to Continue or Book: the card it led to, or what to fix. */
export interface FlightBookingAnswer {
  entryId?: string
  message?: string
  /** The traveller and the field the message is about, when it is about one. */
  index?: number
  field?: string
}

export function bookingOK(answer: FlightBookingAnswer): boolean {
  return answer.entryId != null && answer.message == null
}

/** The computer's reply, read (`FlightBookingAnswer(reply:)`); none when it never answered. */
export function bookingAnswer(
  reply: JSONValue | undefined,
): FlightBookingAnswer {
  if (reply === undefined)
    return {
      message: t("The computer didn't answer. Try again in a moment."),
    }
  const entryId = text(field(reply, 'entryId'))
  if (bool(field(reply, 'ok')) === true && entryId != null) return { entryId }
  return {
    message: text(field(reply, 'message')) ?? t("That didn't work."),
    index: int(field(reply, 'index')),
    field: text(field(reply, 'field')),
  }
}

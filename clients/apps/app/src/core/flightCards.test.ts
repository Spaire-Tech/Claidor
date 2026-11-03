// The flight cards as the core reads them: SimeonCore's `FlightCardTests`
// (CoreTests.swift) against the gallery's two searches and its traveller
// form (fixtures/flights.json, the JSON in Demo.swift's
// `DemoData.seed(gallery: true)`), its `PaneMembersFlightTests` (the
// flight's details) and `FlightBookingTests` (the offer to book, the form,
// its checks, the computer's answer). The checks' Swift ways (a phone's
// Unicode digits, a name's 0 to 9, characters counted as a person reads
// them) were measured from the core's own code.

import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { cardText, chatRows } from './chat'
import { Entry } from './entry'
import {
  type FlightOffer,
  type FlightsCard,
  type Traveller,
  adultOn,
  age,
  arriving,
  bookedFlight,
  bookingAnswer,
  bookingOK,
  clock,
  dateOf,
  dayOf,
  departing,
  flightKey,
  flightLines,
  flightPassengersCard,
  flightPlace,
  flightsAside,
  flightsCard,
  flightsHeading,
  genderLabel,
  inbound,
  initials,
  layoverLine,
  logoBox,
  minutes,
  newTraveller,
  outbound,
  parseFlights,
  passengersListLine,
  passengersStatus,
  returnLegs,
  seatLabel,
  shape,
  span,
  startingTravellers,
  stopCount,
  stopsWord,
  terms,
  titleLabel,
  travellerJSON,
  travellerName,
  travellerProblem,
  ways,
  whenLine,
} from './flightCards'
import type { JSONObject, JSONValue } from './json'
import { type Table, setWords } from './words'

const gallery = JSON.parse(
  readFileSync(new URL('./fixtures/flights.json', import.meta.url), 'utf8'),
) as { oneWay: JSONObject; roundTrip: JSONObject; travellers: JSONObject }

const fence = (body: JSONValue) =>
  '```simeon-flights\n' + JSON.stringify(body) + '\n```'

function card(text: string): FlightsCard {
  const read = parseFlights(text)
  if (!read) throw new Error('not a flights card')
  return read
}

function entry(json: JSONObject): Entry {
  const made = Entry.from(json)
  if (!made) throw new Error('no entry')
  return made
}

afterEach(() => setWords('en', {}))

describe('a flights card (FlightCardTests)', () => {
  it('fits the text to the row', () => {
    expect(clock('2:30 PM')).toBe('2:30pm')
    expect(clock('12:18 PM')).toBe('12:18pm')
    expect(clock('6:40 AM +1')).toBe('6:40am+1')
    expect(clock('6:40 AM +1', false)).toBe('6:40am')
    expect(clock('14:30')).toBe('14:30')
    expect(clock('')).toBe('')
    expect(minutes('2h 40m')).toBe(160)
    expect(minutes('2h40m')).toBe(160)
    expect(minutes('3h')).toBe(180)
    expect(minutes('45m')).toBe(45)
    expect(minutes('')).toBeUndefined()
    expect(minutes('layover length not stated')).toBeUndefined()
    expect(span('6h 05m')).toBe('6h05m')
    expect(span('2h 40m')).toBe('2h40m')
    expect(span('26h')).toBe('26h')
    expect(stopCount('Nonstop')).toBe('')
    expect(stopCount('1 stop · PHX 1h 38m')).toBe('1 stop')
    expect(stopsWord('2 stops · PHX 1h 38m, DEN 50m')).toBe('2 stops')
    // Swift's ways: spaces run together, a sign, a number only in ASCII digits.
    expect(clock('2:30  PM')).toBe('2:30pm')
    expect(clock(' 2:30 PM')).toBe('2:30pm')
    expect(clock('2:30 PM x')).toBe('2:30pm')
    expect(clock('2:30 AM+1')).toBe('2:30 AM+1')
    expect(minutes('+2h')).toBe(120)
    expect(minutes('-1h')).toBe(-60)
    expect(minutes('٣h')).toBeUndefined()
    expect(minutes('2h 40m 10s')).toBeUndefined()
    expect(span('-90m')).toBe('-30m')
  })

  it('reads as Muse lays it out', () => {
    const oneWay = card(fence(gallery.oneWay))
    const roundTrip = card(fence(gallery.roundTrip))
    expect(flightsHeading(oneWay)).toBe('Seattle to Los Angeles — Sat, Oct 10')
    expect(flightsAside(oneWay)).toBe('')
    expect(oneWay.isTest).toBe(false)
    const offers = oneWay.offers
    expect(outbound(offers[0]!)).toEqual({
      depart: '2:30pm',
      label: '2h40m',
      arrive: '5:10pm',
    })
    expect(outbound(offers[3]!)).toEqual({
      depart: '11:40am',
      label: '4h35m · 1 stop',
      arrive: '4:15pm',
    })
    expect(inbound(offers[0]!)).toBeUndefined()
    expect(shape(offers[0]!)).toBe('Nonstop · 2h40m')
    expect(ways(offers[0]!).length).toBe(1)
    expect(ways(offers[0]!)[0]!.title).toBe('')
    expect(terms(offers[0]!)).toEqual([
      'No refund if you cancel',
      'Changes for a $99.00 fee',
      '1 carry-on',
    ])
    expect(terms(offers[3]!)).toEqual([
      'Refund minus $25.00 if you cancel',
      'Free changes',
      '2 checked bags',
    ])
    expect(terms(offers[2]!)).toEqual([
      'No refund if you cancel',
      'Change rules not stated',
      'No bags included',
    ])
    const leg = offers[0]!.legs[0]!
    expect(departing(leg)).toBe('Sat, Oct 10 at 2:30pm')
    expect(flightLines(leg)).toEqual(['DL 2830 · Delta Air Lines'])
    expect(layoverLine(offers[3]!.legs[0]!)).toBe(
      '1h 05m layover in Sacramento',
    )

    expect(flightsHeading(roundTrip)).toBe(
      'San Francisco to New York — Fri, Oct 16 – Sun, Oct 18',
    )
    expect(flightsAside(roundTrip)).toBe('Refundable · 2 adults')
    const united = roundTrip.offers[1]!
    expect(outbound(united)).toEqual({
      depart: '10:05pm',
      label: '5h35m',
      arrive: '6:40am+1',
    })
    // 2h 35m, 1h 10m in Chicago, 4h 20m.
    expect(inbound(united)).toEqual({
      depart: '8:00am',
      label: '8h05m · 1 stop',
      arrive: '1:05pm',
    })
    expect(inbound(roundTrip.offers[0]!)).toEqual({
      depart: '6:15pm',
      label: '6h36m',
      arrive: '9:51pm',
    })
    expect(ways(united).map((way) => way.title)).toEqual([
      'Outbound · Fri, Oct 16',
      'Return · Sun, Oct 18',
    ])
    expect(ways(united).map((way) => way.legs.length)).toEqual([1, 2])
    // The day says it lands the next morning; the "+1" would say it twice.
    expect(arriving(united.legs[0]!)).toBe('Sat, Oct 17 at 6:40am')
    expect(flightLines(united.legs[2]!)).toEqual([
      'UA 1281 · United Airlines',
      'Operated by SkyWest',
    ])
  })

  it('says so when the search is a test', () => {
    const test = card(
      '```simeon-flights\n{"title":"A to B","subtitle":"Test results · Fri, Oct 2 · 1 adult","offers":[{"airline":"Duffel Airways","price":"$1.00"}]}\n```',
    )
    expect(test.isTest).toBe(true)
    expect(flightsHeading(test)).toBe('A to B — Fri, Oct 2')
    expect(flightsAside(test)).toBe('Test results')
    expect(
      card(
        '```simeon-flights\n{"title":"A to B","subtitle":"Fri, Oct 2","test":true,"offers":[{"airline":"X"}]}\n```',
      ).isTest,
    ).toBe(true)
  })

  it('fits a logo to its circle by its shape', () => {
    const square = logoBox(80, 80, 40)
    expect(square.width).toBeCloseTo(26.0, 1)
    expect(square.height).toBeCloseTo(square.width, 3)
    // Alaska's wordmark (269 × 80) runs nearly across the circle instead of shrinking into a square.
    const wordmark = logoBox(269, 80, 40)
    expect(wordmark.width).toBeGreaterThan(34)
    expect(wordmark.width).toBeLessThan(40)
    expect(wordmark.width / wordmark.height).toBeCloseTo(269 / 80, 3)
    // Its corners stay inside the circle.
    expect(Math.hypot(wordmark.width, wordmark.height)).toBeLessThanOrEqual(40)
    expect(logoBox(0, 10, 40).width).toBe(0)
  })

  it('shows the gallery’s cards in the chat, with the airlines’ initials', () => {
    const lines = [
      entry({
        kind: 'send-message',
        id: 'f1',
        timestampMs: 1,
        message: { type: 'text', content: fence(gallery.oneWay) },
      }),
      entry({
        kind: 'send-message',
        id: 'f2',
        timestampMs: 2,
        message: { type: 'text', content: fence(gallery.roundTrip) },
      }),
      entry({
        kind: 'send-message',
        id: 'f3',
        timestampMs: 3,
        message: gallery.travellers,
      }),
    ]
    const kinds = chatRows(lines).flatMap((row) => {
      if (row.kind !== 'card') return []
      if (row.card === 'flights')
        return [`flights:${flightsCard(row.entry)!.offers.length}`]
      if (row.card === 'flightPassengers') {
        const form = flightPassengersCard(row.entry)!
        return [`travellers:${form.flight.route}:${form.state}`]
      }
      return []
    })
    expect(kinds).toEqual([
      'flights:4',
      'flights:2',
      'travellers:Seattle to Los Angeles:open',
    ])
    const flights = flightsCard(lines[0]!)!
    expect(flights.title).toBe('Seattle to Los Angeles')
    expect(flights.offers[3]!.legs.length).toBe(2)
    expect(initials('American Airlines')).toBe('AM')
    expect(initials('Alaska Airlines')).toBe('AL')
    expect(initials('Delta Air Lines')).toBe('DL')
    // As the core measured: one word left takes its first two characters; none left, "?".
    expect(initials('Air France')).toBe('FR')
    expect(initials('Air')).toBe('?')
    expect(initials('')).toBe('?')
    expect(initials('ß air')).toBe('SS')
    expect(initials('éclair Air')).toBe('ÉC')
  })

  it('reads the words of an agent’s message and of a line the computer sent', () => {
    const words = fence({ offers: [{ airline: 'Delta' }] })
    expect(
      flightsCard(entry({ kind: 'message', id: 'm', content: words })),
    ).toBeDefined()
    expect(
      flightsCard(
        entry({
          kind: 'send-message',
          id: 's',
          message: { type: 'text', content: words },
        }),
      ),
    ).toBeDefined()
    expect(parseFlights(fence({ title: 'None', offers: [] }))).toBeUndefined()
    expect(parseFlights('Look:\n' + words)).toBeUndefined()
    expect(parseFlights('```simeon-flights\nnot json\n```')).toBeUndefined()
    // Up to eight offers; what isn't an offer, or isn't words, is passed over; words are trimmed.
    const junk = card(
      fence({
        title: 'Junk',
        offers: [
          1,
          'x',
          null,
          { airline: '  Spaced Air  ', price: 12, date: ' Mon, Oct 5 ' },
        ],
      }),
    )
    expect(junk.offers.length).toBe(1)
    expect(junk.offers[0]!.airline).toBe('Spaced Air')
    expect(junk.offers[0]!.price).toBe('')
    expect(junk.offers[0]!.date).toBe('Mon, Oct 5')
    const nine = card(
      fence({ offers: Array.from({ length: 9 }, (_, a) => ({ a })) }),
    )
    expect(nine.offers.length).toBe(8)
  })
})

describe('a flight’s details (PaneMembersFlightTests)', () => {
  it('words the flight as the iPhone’s sheet words it', () => {
    const text = `\`\`\`simeon-flights
{"title":"SFO to JFK","offers":[{"airline":"Alaska","price":"$412","priceNote":"round trip","date":"Thu, Oct 16","duration":"7h 55m","stops":"1 stop · SEA","refundable":"Not refundable","legs":[
  {"from":"SFO","to":"SEA","depart":"6:15 AM","departDay":"Thu, Oct 16","arrive":"8:20 AM","flight":"AS 24 · operated by Horizon Air","carrier":"Horizon Air","layover":"1h 05m in Seattle","heading":"Outbound"},
  {"from":"SEA","to":"JFK","depart":"9:25 AM","arrive":"5:55 PM","flight":"AS 8","carrier":"Alaska","layover":"2h in Nowhere"}]}]}
\`\`\``
    const offer = card(text).offers[0]!
    expect(ways(offer).map((way) => way.legs.length)).toEqual([2])
    expect(departing(offer.legs[0]!)).toBe('Thu, Oct 16 at 6:15am')
    expect(flightLines(offer.legs[0]!)).toEqual([
      'AS 24 · Horizon Air',
      'Operated by Horizon Air',
    ])
    expect(layoverLine(offer.legs[0]!)).toBe('1h 05m layover in Seattle')
    expect(arriving(offer.legs[1]!)).toBe('5:55pm')
    expect(terms(offer)).toEqual(['Cancellation: Not refundable'])
    expect(flightKey('e1', 2)).toBe('e1:2')
    // The pane reads the row and the offer back from the key, at its last ":".
    expect(flightPlace('e1:2')).toEqual({ rowId: 'e1', index: 2 })
    expect(flightPlace('t:1:2:0')).toEqual({ rowId: 't:1:2', index: 0 })
    expect(flightPlace('e1')).toBeUndefined()
  })

  it('says after the terms who sells a ticket another company sells', () => {
    const text =
      '```simeon-flights\n{"title":"Dakar to Casablanca","offers":[{"airline":"Air Senegal","soldBy":"Hahn Air","price":"$380","bags":"1 carry-on","legs":[{"from":"DSS","to":"CMN","flight":"HC 403","carrier":"Air Senegal"}]}]}\n```'
    const offer = card(text).offers[0]!
    expect(offer.airline).toBe('Air Senegal')
    expect(offer.soldBy).toBe('Hahn Air')
    expect(terms(offer)).toEqual(['1 carry-on', 'Sold by: Hahn Air'])
    // An airline that sells its own seats says nothing more.
    const own = card(text.replace('"soldBy":"Hahn Air",', '')).offers[0]!
    expect(terms(own)).toEqual(['1 carry-on'])
  })

  it('words every term, layover and day the server can send', () => {
    const offer = (fields: Record<string, string>): FlightOffer =>
      card(fence({ offers: [{ airline: 'A', ...fields }] })).offers[0]!
    expect(
      terms(
        offer({
          refundable: 'Full refund',
          changeable: 'Not allowed',
          bags: 'Not stated',
        }),
      ),
    ).toEqual([
      'Full refund if you cancel',
      'No changes allowed',
      'Bags not stated',
    ])
    expect(
      terms(
        offer({
          refundable: 'Not stated',
          changeable: 'Ask the airline',
        }),
      ),
    ).toEqual(['Refund rules not stated', 'Changes: Ask the airline'])
    const legs = card(
      fence({
        offers: [
          {
            legs: [
              { flight: '', carrier: '', layover: '' },
              {
                flight: 'X 1 · operated by A · operated by B',
                carrier: 'C',
                layover: '45m',
              },
              {
                depart: '6:40 AM +1',
                arriveDay: 'Tue, Oct 6',
                layover: 'Layover in Rome',
              },
            ],
          },
        ],
      }),
    ).offers[0]!.legs
    expect(flightLines(legs[0]!)).toEqual([''])
    expect(flightLines(legs[1]!)).toEqual(['X 1 · C', 'Operated by A'])
    expect(layoverLine(legs[1]!)).toBe('45m layover')
    expect(layoverLine(legs[2]!)).toBe('Layover in Rome')
    expect(departing(legs[2]!)).toBe('6:40am+1')
    expect(arriving(legs[2]!)).toBe('Tue, Oct 6')
  })

  it('reads a way back that is all of the flights, and a time in the air it can’t add up', () => {
    const offers = card(
      fence({
        offers: [
          {
            airline: 'Out Back',
            date: 'Mon, Oct 5',
            returnTimes: 'Return 7:46 PM – 10:40 PM',
            legs: [
              { duration: '2h' },
              { duration: 'bad', heading: 'Return · Fri, Oct 9' },
            ],
          },
          {
            airline: 'Return Only',
            returnTimes: 'Return 1:00 PM – 3:00 PM',
            legs: [{ duration: '2h', heading: 'Return' }],
          },
          {
            airline: 'No Legs',
            returnTimes: 'Return 1:00 PM – 3:00 PM · Nonstop',
          },
          { airline: 'Hyphen', returnTimes: 'Return 7:46 PM - 10:40 PM' },
        ],
      }),
    ).offers
    expect(inbound(offers[0]!)).toEqual({
      depart: '7:46pm',
      label: '',
      arrive: '10:40pm',
    })
    expect(ways(offers[0]!).map((way) => way.title)).toEqual([
      'Outbound · Mon, Oct 5',
      'Return · Fri, Oct 9',
    ])
    expect(returnLegs(offers[1]!).length).toBe(1)
    expect(ways(offers[1]!)).toEqual([{ title: '', legs: offers[1]!.legs }])
    expect(inbound(offers[2]!)).toEqual({
      depart: '1:00pm',
      label: '',
      arrive: '3:00pm',
    })
    expect(ways(offers[2]!)).toEqual([])
    expect(inbound(offers[3]!)).toBeUndefined()
  })
})

// MARK: Booking

const flight: JSONObject = {
  offerId: 'off_0000AxyzTestOffer01',
  route: 'Seattle to Los Angeles',
  airline: 'Duffel Airways',
  logo: 'https://assets.duffel.com/ZZ.svg',
  date: 'Thu, Nov 12',
  from: 'SEA',
  to: 'LAX',
  depart: '6:49 AM',
  arrive: '9:34 AM',
  duration: '2h 45m',
  stops: 'Nonstop',
  priceNote: '1 adult · Economy · One way',
  total: '$361.20',
  documentsRequired: false,
  conditionsUrl: 'https://duffel.com/conditions',
  passengers: [
    { id: 'pas_0000Ada', type: 'adult' },
    { id: 'pas_0000Kid', type: 'child' },
  ],
  test: true,
}

function formEntry(message: JSONObject, fields: JSONObject = {}): Entry {
  return entry({
    id: 't2s1',
    kind: 'send-message',
    timestampMs: 1,
    message,
    ...fields,
  })
}

function form(fields: JSONObject = {}) {
  const message: JSONObject = {
    type: 'flight-passengers',
    content:
      'Traveller details for Seattle to Los Angeles · Thu, Nov 12 · $361.20',
    flight,
    prefill: [
      {
        given_name: 'Ada',
        family_name: 'Lovelace',
        email: 'ada@example.com',
        phone_number: '+12065550100',
      },
    ],
  }
  const read = flightPassengersCard(formEntry(message, fields))
  if (!read) throw new Error('not the traveller form')
  return read
}

const today = dateOf('2026-10-13')!

function ada(): Traveller {
  return {
    ...newTraveller('pas_0000Ada'),
    givenName: 'Ada',
    familyName: 'Lovelace',
    title: 'ms',
    gender: 'f',
    bornOn: '1987-07-24',
    email: 'ada@example.com',
    phone: '+1 (206) 555-0100',
  }
}

const field = (traveller: Traveller, passport = false, adult?: string) =>
  travellerProblem(traveller, passport, adult, today)?.field

describe('booking a flight (FlightBookingTests)', () => {
  it('carries on the search card the offer to book', () => {
    const search = card(
      '```simeon-flights\n{"title":"Seattle to Los Angeles","offers":[{"offerId":"off_0000AxyzTestOffer01","airline":"Duffel Airways","price":"$361.20"},{"airline":"Older","price":"$1"}]}\n```',
    )
    expect(search.offers[0]!.offerId).toBe('off_0000AxyzTestOffer01')
    // A card from before booking books nothing.
    expect(search.offers[1]!.offerId).toBe('')
  })

  it('starts the form with what Link knows for the first traveller', () => {
    const open = form()
    expect(open.state).toBe('open')
    expect(open.flight.route).toBe('Seattle to Los Angeles')
    expect(whenLine(open.flight)).toBe(
      'Thu, Nov 12 · 6:49am – 9:34am · Nonstop',
    )
    expect(open.flight.isTest).toBe(true)
    const travellers = startingTravellers(open)
    expect(travellers.map((one) => one.id)).toEqual([
      'pas_0000Ada',
      'pas_0000Kid',
    ])
    expect(travellerName(travellers[0]!)).toBe('Ada Lovelace')
    expect(travellers[0]!.email).toBe('ada@example.com')
    // The others start empty.
    expect(travellerName(travellers[1]!)).toBe('')
    expect(seatLabel(open, 0)).toBe('Traveller 1 · Adult')
    expect(seatLabel(open, 1)).toBe('Traveller 2 · Child')
    expect(passengersStatus(open)).toBeUndefined()
    expect(passengersListLine(open)).toBe(
      'Traveller details · Seattle to Los Angeles',
    )
    expect(
      cardText({
        type: 'flight-passengers',
        content: 'Traveller details for Seattle to Los Angeles',
        flight,
      }),
    ).toBe('Traveller details for Seattle to Los Angeles')

    const saved = form({
      passengersState: 'saved',
      passengersNames: ['Ada Lovelace', 'Byron Lovelace'],
      passengersCheckoutId: 't2s2',
    })
    expect(saved.state).toBe('saved')
    expect(passengersStatus(saved)).toBe('Ada Lovelace, Byron Lovelace')
    expect(saved.checkoutId).toBe('t2s2')
    expect(form({ passengersNote: "Link isn't connected." }).note).toBe(
      "Link isn't connected.",
    )
    expect(passengersStatus(form({ passengersState: 'canceled' }))).toBe(
      'Canceled',
    )
    // As the core reads the rest: saved with no names, a note of spaces, a state it doesn't know.
    expect(passengersStatus(form({ passengersState: 'saved' }))).toBe(
      'Details saved',
    )
    expect(form({ passengersNote: '   ' }).note).toBeUndefined()
    expect(form({ passengersState: 'weird' }).state).toBe('open')
  })

  it('checks each traveller as the computer checks them', () => {
    expect(field(ada())).toBeUndefined()
    expect(field(ada(), true)).toBe('passport')
    const fixes: [keyof Traveller, string, string][] = [
      ['givenName', '4da', 'given_name'],
      ['familyName', '', 'family_name'],
      ['bornOn', '2030-01-01', 'born_on'],
      ['bornOn', '1987-02-30', 'born_on'],
      ['email', 'ada', 'email'],
      ['phone', '206 555 0100', 'phone_number'],
      ['passportNumber', '!!', 'passport'],
    ]
    for (const [key, value, expected] of fixes)
      expect(field({ ...ada(), [key]: value }), value).toBe(expected)
    expect(field({ ...ada(), title: undefined })).toBe('title')
    const withPassport: Traveller = {
      ...ada(),
      passportNumber: '533 401 372',
      passportCountry: 'us',
      passportExpires: '2030-01-01',
    }
    expect(field(withPassport, true)).toBeUndefined()
    const sent = travellerJSON(withPassport)
    expect((sent.passport as JSONObject).issuing_country_code).toBe('US')
    expect(travellerJSON(ada()).title).toBe('ms')
    expect(travellerJSON(ada()).gender).toBe('f')
    // No passport, none sent.
    expect(travellerJSON(ada()).passport).toBeUndefined()
    expect(dayOf(dateOf('1987-07-24')!)).toBe('1987-07-24')
    expect(titleLabel('miss')).toBe('Miss')
    expect(titleLabel('dr')).toBe('Dr')
    expect(genderLabel('f')).toBe('Female')

    // An adult is 18 on the day of the last flight (19 October 2026: Muse's booking died on a birth year of 2026, after approval).
    const baby = { ...ada(), bornOn: '2026-03-01' }
    // No flight day, no age check.
    expect(field(baby)).toBeUndefined()
    expect(field(baby, false, '2026-11-12')).toBe('born_on')
    expect(
      field({ ...ada(), bornOn: '2008-11-12' }, false, '2026-11-12'),
    ).toBeUndefined()
    expect(
      travellerProblem(
        { ...ada(), bornOn: '2008-11-13' },
        false,
        '2026-11-12',
        today,
      )?.message,
    ).toBe(
      'An adult must be 18 or older on the day of the last flight; check the date of birth.',
    )
    expect(age('2008-11-12', '2026-11-12')).toBe(18)
    expect(age('2008-11-13', '2026-11-12')).toBe(17)
  })

  it('checks as the core’s own code does, edge by edge', () => {
    const given = (givenName: string) => field({ ...ada(), givenName })
    // Trimmed of spaces and tabs only; an apostrophe, a hyphen, a space are a name's; the marks the host refuses are not.
    expect(given(' Ada ')).toBeUndefined()
    expect(given('Ada\t')).toBeUndefined()
    expect(given(' Ada')).toBeUndefined()
    expect(given("O'Brien")).toBeUndefined()
    expect(given('Ada-Marie')).toBeUndefined()
    expect(given('Ada Byron')).toBeUndefined()
    expect(given('Ada.')).toBe('given_name')
    expect(given('A@a')).toBe('given_name')
    expect(given('A`b')).toBe('given_name')
    expect(given('  ')).toBe('given_name')
    // 40 characters as a person reads them, a letter and its accent one.
    expect(given('a'.repeat(40))).toBeUndefined()
    expect(given('a'.repeat(41))).toBe('given_name')
    expect(given('é'.repeat(40))).toBeUndefined()
    expect(given('é'.repeat(41))).toBe('given_name')
    expect(given('Zoë')).toBeUndefined()
    expect(given('李')).toBeUndefined()
    // A digit is 0 to 9 only, as the computer's (`NAME`) and the core's `[0-9]`: other scripts' digits, ①, Han numerals are a name's.
    expect(given('Ada1')).toBe('given_name')
    expect(given('9')).toBe('given_name')
    expect(given('Ada٣')).toBeUndefined()
    expect(given('A１')).toBeUndefined()
    expect(given('A①')).toBeUndefined()
    expect(given('李一')).toBeUndefined()
    expect(given('健一')).toBeUndefined()
    // A digit with something added to it is no longer the digit, as a mark (Swift's `[0-9]` takes a whole character).
    expect(given('1️⃣')).toBeUndefined()
    expect(given('A1́')).toBeUndefined()
    // A mark with something added to it is no longer the mark.
    expect(given('#️⃣')).toBeUndefined()
    expect(given('A#́')).toBeUndefined()
    expect(given('A;')).toBeUndefined()

    const born = (bornOn: string) => field({ ...ada(), bornOn })
    expect(born('1899-12-31')).toBe('born_on')
    expect(born('1900-01-01')).toBeUndefined()
    expect(born('2026-10-13')).toBe('born_on')
    expect(born('2026-10-12')).toBeUndefined()
    expect(born('1987-7-24')).toBe('born_on')
    expect(born('1987-07-24 ')).toBe('born_on')

    const email = (value: string) => field({ ...ada(), email: value })
    expect(email(' ada@example.com ')).toBeUndefined()
    expect(email('ada@example.c')).toBe('email')
    expect(email('ada@example.co')).toBeUndefined()
    expect(email('ada@x..com')).toBeUndefined()
    expect(email('ada@.com')).toBe('email')
    expect(email('a b@example.com')).toBe('email')
    expect(email('ada x@example.com')).toBe('email')
    expect(email('ada@example.com\n')).toBe('email')
    expect(email('a'.repeat(64) + '@x.io')).toBeUndefined()
    expect(email('a'.repeat(65) + '@x.io')).toBe('email')

    const phone = (value: string) => field({ ...ada(), phone: value })
    expect(phone('+1-206-555-0100')).toBeUndefined()
    expect(phone('+1.206.555.0100')).toBeUndefined()
    expect(phone('+1 206 555 0100')).toBeUndefined()
    expect(phone('+0 206 555 0100')).toBe('phone_number')
    expect(phone('+123456')).toBe('phone_number')
    expect(phone('+1234567')).toBeUndefined()
    expect(phone('+123456789012345')).toBeUndefined()
    expect(phone('+1234567890123456')).toBe('phone_number')
    expect(phone('+1 (206) 555/0100')).toBe('phone_number')
    expect(phone('+1٢٣٤٥٦٧٨')).toBeUndefined()

    const passport = (fields: Partial<Traveller>) =>
      field(
        {
          ...ada(),
          passportNumber: '533 401 372',
          passportCountry: 'us',
          passportExpires: '2030-01-01',
          ...fields,
        },
        true,
      )
    expect(passport({ passportNumber: '1234' })).toBe('passport')
    expect(passport({ passportNumber: '12345' })).toBeUndefined()
    expect(passport({ passportCountry: 'USA' })).toBe('passport')
    expect(passport({ passportExpires: '2026-10-13' })).toBe('passport')
    expect(passport({ passportExpires: '2026-10-14' })).toBeUndefined()
    expect(passport({ passportExpires: '2030-02-30' })).toBe('passport')
    // Only spaces: no passport.
    expect(field({ ...ada(), passportNumber: '   ' })).toBeUndefined()
    expect(travellerJSON({ ...ada(), passportNumber: '   ' }).passport).toBe(
      undefined,
    )
    expect(age('2008-02-29', '2026-02-28')).toBe(17)
    expect(age('bad', '2026-01-01')).toBe(0)
    expect(age('2000-1-1', '2018-1-1')).toBe(18)
    expect(dateOf('2024-02-29')).toBeDefined()
    expect(dateOf('2023-02-29')).toBeUndefined()
    expect(dayOf(dateOf('0001-01-01')!)).toBe('0001-01-01')
    expect(dayOf(dateOf('0099-05-05')!)).toBe('0099-05-05')
    expect(dateOf('1987-07-24x')).toBeUndefined()
  })

  it('brings the flight’s last day and what changed', () => {
    // A form from before the flight's day checks no age.
    expect(adultOn(form(), 0)).toBeUndefined()
    expect(form().flight.changed).toBe('')
    const dated = flightPassengersCard(
      formEntry({
        type: 'flight-passengers',
        content: 'Traveller details',
        flight: {
          ...flight,
          lastFlightDate: '2026-11-12',
          changed:
            'Changed since you picked it: Price now $380.00 (was $361.20)',
        },
      }),
    )!
    expect(adultOn(dated, 0)).toBe('2026-11-12')
    // A child's seat.
    expect(adultOn(dated, 1)).toBeUndefined()
    expect(dated.flight.changed).toBe(
      'Changed since you picked it: Price now $380.00 (was $361.20)',
    )
  })

  it('reads the flight on the checkout card with who flies', () => {
    const booked = bookedFlight({
      ...flight,
      travellers: ['Ada Lovelace'],
      formEntryId: 't2s1',
    })!
    expect(booked.travellers).toEqual(['Ada Lovelace'])
    expect(booked.conditionsURL).toBe('https://duffel.com/conditions')
    // Not a Duffel offer, or no route: no flight.
    expect(bookedFlight({ ...flight, offerId: 'x_1' })).toBeUndefined()
    expect(bookedFlight({ ...flight, route: '  ' })).toBeUndefined()
    // No seats, or seats without an id: one adult's.
    expect(bookedFlight({ ...flight, passengers: [] })!.passengers).toEqual([
      { id: '', type: 'adult' },
    ])
    expect(
      bookedFlight({
        ...flight,
        passengers: [{ type: 'child' }, { id: 'pas_3' }, 5],
      })!.passengers,
    ).toEqual([{ id: 'pas_3', type: 'adult' }])
    const plain = bookedFlight({
      ...flight,
      conditionsUrl: 'http://duffel.com',
      test: 'true',
      documentsRequired: 1,
    })!
    expect(plain.conditionsURL).toBeUndefined()
    expect(plain.isTest).toBe(false)
    expect(plain.documentsRequired).toBe(false)
    expect(
      whenLine(
        bookedFlight({
          ...flight,
          depart: '',
          stops: '1 stop · ZRH 1h',
          date: '',
        })!,
      ),
    ).toBe('9:34am · 1 stop')
  })

  it('reads an infant’s seat, one seat alone, and what Link knows past the seats', () => {
    const seats = (passengers: JSONValue) =>
      flightPassengersCard(
        formEntry({
          type: 'flight-passengers',
          flight: { ...flight, passengers },
          prefill: [{ given_name: 'A' }, 'junk', { given_name: 4 }],
        }),
      )!
    const one = seats([{ id: 'pas_1', type: 'adult' }])
    expect(seatLabel(one, 0)).toBe('Adult')
    expect(startingTravellers(one).map((traveller) => traveller.id)).toEqual([
      'pas_1',
    ])
    expect(one.prefill.map((traveller) => traveller.id)).toEqual([
      'pas_1',
      '',
      '',
    ])
    const infants = seats([
      { id: 'pas_1', type: 'infant_without_seat' },
      { id: 'pas_2', type: 'INFANT' },
    ])
    expect(seatLabel(infants, 0)).toBe('Traveller 1 · Infant')
    expect(seatLabel(infants, 1)).toBe('Traveller 2 · Adult')
    expect(seatLabel(infants, 5)).toBe('Traveller 6 · Adult')
    expect(adultOn(infants, 0)).toBeUndefined()
    const second = startingTravellers(infants)[1]!
    expect(second.id).toBe('pas_2')
    expect(second.givenName).toBe('')
  })

  it('says where to go or what to fix from the computer’s answer', () => {
    expect(bookingAnswer({ ok: true, entryId: 't2s2' }).entryId).toBe('t2s2')
    expect(bookingOK(bookingAnswer({ ok: true, entryId: 't2s2' }))).toBe(true)
    const fix = bookingAnswer({
      ok: false,
      message: "Traveller 2: the email address isn't right.",
      index: 1,
      field: 'email',
    })
    expect(bookingOK(fix)).toBe(false)
    expect(fix.index).toBe(1)
    expect(fix.field).toBe('email')
    expect(bookingAnswer(undefined).message).toBe(
      "The computer didn't answer. Try again in a moment.",
    )
    // As the core reads the rest: no entry, an empty one, "true" in words, nothing, an index in between.
    expect(bookingAnswer({ ok: true }).message).toBe("That didn't work.")
    expect(bookingAnswer({ ok: true, entryId: '' }).message).toBe(
      "That didn't work.",
    )
    expect(bookingOK(bookingAnswer({ ok: 'true', entryId: 'x' }))).toBe(false)
    expect(bookingAnswer(null).message).toBe("That didn't work.")
    expect(
      bookingAnswer({ ok: false, message: '', index: 1.6, field: '' }),
    ).toEqual({ message: "That didn't work.", index: 2, field: undefined })
  })

  it('says it in French, from the core’s catalogue', () => {
    const core = JSON.parse(
      readFileSync(new URL('../words/core/fr.json', import.meta.url), 'utf8'),
    ) as Table
    setWords('fr', { core })
    const open = form()
    expect(seatLabel(open, 0)).toBe('Voyageur 1 · Adulte')
    expect(seatLabel(open, 1)).toBe('Voyageur 2 · Enfant')
    expect(terms(card(fence(gallery.oneWay)).offers[0]!)).toEqual([
      'Aucun remboursement en cas d’annulation',
      'Modifications avec des frais de $99.00',
      '1 carry-on',
    ])
    expect(departing(card(fence(gallery.oneWay)).offers[0]!.legs[0]!)).toBe(
      'Sat, Oct 10 à 2:30pm',
    )
    expect(
      travellerProblem({ ...ada(), title: undefined }, false, undefined, today)
        ?.message,
    ).toBe('Choisis une civilité.')
    // "Ms" is the same in every language (the catalogue doesn't translate it).
    expect(titleLabel('ms')).toBe('Ms')
    expect(titleLabel('mr')).toBe('M.')
  })
})

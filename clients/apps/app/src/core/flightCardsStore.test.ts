// The flight cards' commands, as the Mac's cards send them (SimeonCore's
// Store.swift `startFlightBooking`, `submitFlightPassengers`,
// `cancelFlightPassengers`): what each sends, the computer's answer read,
// a refusal said; and the flight whose details are open beside its chat.

import { describe, expect, it } from 'vitest'
import {
  type FlightOffer,
  type Traveller,
  newTraveller,
  parseFlights,
} from './flightCards'
import type { JSONObject } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend } from './testing'

function computer() {
  const backend = new FakeBackend()
  backend.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
  return backend
}

const sent = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

const offer: FlightOffer = parseFlights(
  '```simeon-flights\n{"title":"Seattle to Los Angeles","offers":[{"offerId":"off_0000AxyzTestOffer01","airline":"Duffel Airways","price":"$361.20"}]}\n```',
)!.offers[0]!

const ada: Traveller = {
  ...newTraveller('pas_0000Ada'),
  givenName: ' Ada ',
  familyName: 'Lovelace',
  title: 'ms',
  gender: 'f',
  bornOn: '1987-07-24',
  email: 'ada@example.com',
  phone: '+1 206 555 0100',
  passportNumber: '533401372',
  passportCountry: 'us',
  passportExpires: '2030-01-01',
}

describe('booking a flight from the store', () => {
  it('asks the computer for the traveller form, and reads its answer', async () => {
    const backend = computer()
    backend.commandAnswers.startFlightBooking = () => ({
      ok: true,
      entryId: 'fb1',
    })
    const store = new AppStore()
    await store.attach(backend)
    const answer = await store.startFlightBooking('f1', 2, 'iris')
    expect(answer).toEqual({ entryId: 'fb1' })
    expect(sent(backend, 'startFlightBooking')).toEqual([
      { agentId: 'iris', entryId: 'f1', offerIndex: 2 },
    ])
    // What the computer says it can't do comes back to the button.
    backend.commandAnswers.startFlightBooking = () => ({
      ok: false,
      message: 'Link isn’t connected.',
    })
    expect(await store.startFlightBooking('f1', 2, 'iris')).toEqual({
      message: 'Link isn’t connected.',
      index: undefined,
      field: undefined,
    })
    // A refusal, its own words; nothing said in the window's problem line.
    backend.refusedCommands.add('startFlightBooking')
    expect(await store.startFlightBooking('f1', 2, 'iris')).toEqual({
      message: "The computer didn't answer.",
    })
    expect(store.problem).toBeUndefined()
  })

  it('says the computer isn’t connected before it is', async () => {
    const store = new AppStore()
    expect(await store.startFlightBooking('f1', 0, 'iris')).toEqual({
      message: "Your computer isn't connected.",
    })
    expect(await store.submitFlightPassengers('fb1', [ada], 'iris')).toEqual({
      message: "Your computer isn't connected.",
    })
  })

  it('sends the travellers as the host checks them, and brings back what to fix', async () => {
    const backend = computer()
    backend.commandAnswers.submitFlightPassengers = () => ({
      ok: false,
      message: "Traveller 2: the email address isn't right.",
      index: 1,
      field: 'email',
    })
    const store = new AppStore()
    await store.attach(backend)
    const kid: Traveller = {
      ...newTraveller('pas_0000Kid'),
      givenName: 'Byron',
    }
    const answer = await store.submitFlightPassengers('fb1', [ada, kid], 'iris')
    expect(answer).toEqual({
      message: "Traveller 2: the email address isn't right.",
      index: 1,
      field: 'email',
    })
    const [args] = sent(backend, 'submitFlightPassengers') as JSONObject[]
    expect(args).toEqual({
      agentId: 'iris',
      entryId: 'fb1',
      passengers: [
        {
          id: 'pas_0000Ada',
          title: 'ms',
          gender: 'f',
          given_name: 'Ada',
          family_name: 'Lovelace',
          born_on: '1987-07-24',
          email: 'ada@example.com',
          phone_number: '+1 206 555 0100',
          passport: {
            number: '533401372',
            issuing_country_code: 'US',
            expires_on: '2030-01-01',
          },
        },
        {
          id: 'pas_0000Kid',
          title: '',
          gender: '',
          given_name: 'Byron',
          family_name: '',
          born_on: '',
          email: '',
          phone_number: '',
        },
      ],
    })
    // Kept: the checkout card it led to.
    backend.commandAnswers.submitFlightPassengers = () => ({
      ok: true,
      entryId: 'fc1',
    })
    expect(await store.submitFlightPassengers('fb1', [ada], 'iris')).toEqual({
      entryId: 'fc1',
    })
    backend.refusedCommands.add('submitFlightPassengers')
    expect(await store.submitFlightPassengers('fb1', [ada], 'iris')).toEqual({
      message: "The computer didn't answer.",
    })
  })

  it('cancels the form, and says so when it can’t', async () => {
    const backend = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.cancelFlightPassengers('fb1', 'iris')
    expect(sent(backend, 'submitFlightPassengers')).toEqual([
      { agentId: 'iris', entryId: 'fb1', cancel: true },
    ])
    expect(store.problem).toBeUndefined()
    backend.refusedCommands.add('submitFlightPassengers')
    await store.cancelFlightPassengers('fb1', 'iris')
    expect(store.problem).toBe(
      "Couldn't cancel the booking: The computer didn't answer.",
    )
  })

  it('opens a flight’s details, closes them on the same row, and forgets them on signing out', async () => {
    const backend = computer()
    const store = new AppStore()
    await store.attach(backend)
    let changes = 0
    store.subscribe(() => (changes += 1))
    store.toggleFlight('f1:0', offer, 'iris')
    expect(store.openFlight).toEqual({ key: 'f1:0', offer, agentId: 'iris' })
    // Another offer shows in its place; the open one again closes them.
    store.toggleFlight('f1:1', offer, 'iris')
    expect(store.openFlight?.key).toBe('f1:1')
    store.toggleFlight('f1:1', offer, 'iris')
    expect(store.openFlight).toBeUndefined()
    store.closeFlight()
    expect(changes).toBe(3)
    store.toggleFlight('f1:0', offer, 'iris')
    store.detach()
    expect(store.openFlight).toBeUndefined()
  })
})

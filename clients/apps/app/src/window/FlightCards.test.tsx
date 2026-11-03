// A flight's details in the agent's pane (PaneMembersFlight.swift's
// `FlightPage`): the route and each flight's places joined by an arrow,
// "SEA → LAX", as the old app's flight pane wrote them, in every language.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FlightLeg, FlightOffer } from '../core/flightCards'
import { FlightPage } from './FlightCards'

const leg = (from: string, to: string): FlightLeg => ({
  from,
  fromCity: '',
  to,
  toCity: '',
  depart: '7:05 AM',
  arrive: '9:50 AM',
  flight: 'AS 1234',
  carrier: 'Alaska Airlines',
  logo: '',
  cabin: 'Economy',
  duration: '2h 45m',
  layover: '',
  heading: '',
  departDay: '',
  arriveDay: '',
})

const offer = (more: Partial<FlightOffer> = {}): FlightOffer => ({
  airline: 'Alaska Airlines',
  logo: '',
  price: '$361.20',
  priceNote: '',
  date: 'Thu, Nov 12',
  from: 'SEA',
  fromCity: 'Seattle',
  to: 'LAX',
  toCity: 'Los Angeles',
  depart: '7:05 AM',
  arrive: '12:40 PM',
  duration: '5h 35m',
  stops: '1 stop',
  refundable: '',
  changeable: '',
  bags: '',
  returnTimes: '',
  legs: [leg('SEA', 'SFO'), leg('SFO', 'LAX')],
  offerId: '',
  soldBy: '',
  ...more,
})

const texts = (markup: string, className: string): string[] =>
  [...markup.matchAll(new RegExp(`class="${className}">([^<]*)<`, 'g'))].map(
    (found) => found[1]!,
  )

describe('a flight’s details', () => {
  it('join the places with an arrow, as the old app’s flight pane', () => {
    const markup = renderToStaticMarkup(<FlightPage offer={offer()} />)
    expect(texts(markup, 'flight-page-route')).toEqual(['SEA → LAX'])
    expect(texts(markup, 'flight-leg-route')).toEqual([
      'SEA → SFO',
      'SFO → LAX',
    ])
  })

  it('show one place alone, with no arrow', () => {
    const markup = renderToStaticMarkup(
      <FlightPage offer={offer({ to: '', legs: [leg('SEA', '')] })} />,
    )
    expect(texts(markup, 'flight-page-route')).toEqual(['SEA'])
    expect(texts(markup, 'flight-leg-route')).toEqual(['SEA'])
  })
})

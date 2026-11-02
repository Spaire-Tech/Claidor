// Step 3d (mac/Simeon/Cards.swift's flights, FlightBooking.swift): the
// flights an agent found, and the travellers' form for the one booked.
// Read by `src/core/flightCards.ts`.

import type { CardKind } from '../core/chat'
import type { CardProps } from './Cards'
import './FlightCards.css'

type FlightKind = Extract<CardKind, 'flights' | 'flightPassengers'>

/** The card for one of the flight kinds, or none when its line doesn't read as one. */
export function flightCardView(
  kind: FlightKind,
  card: CardProps,
): React.ReactNode {
  void kind
  void card
  return undefined
}

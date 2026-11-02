// Step 3c (mac/Simeon/Cards.swift): apps an agent needs connected, Slack or
// GitHub for a routine, the cloud agent's card, and a new teammate joined.
// Read by `src/core/connectCards.ts`.

import type { CardKind } from '../core/chat'
import type { CardProps } from './Cards'
import './ConnectCards.css'

type ConnectKind = Extract<
  CardKind,
  'connectors' | 'listenerConnect' | 'cloudAgent' | 'joined'
>

/** The card for one of 3c's kinds, or none when its line doesn't read as one. */
export function connectCardView(
  kind: ConnectKind,
  card: CardProps,
): React.ReactNode {
  void kind
  void card
  return undefined
}

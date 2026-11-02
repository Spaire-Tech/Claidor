// Step 3d (mac/Simeon/Cards.swift): a checkout waiting on the person's
// answer (paid with Link), and products the agent found to buy. Read by
// `src/core/shopCards.ts`.

import type { CardKind } from '../core/chat'
import type { CardProps } from './Cards'
import './ShopCards.css'

type ShopKind = Extract<CardKind, 'purchase' | 'products'>

/** The card for one of the shop kinds, or none when its line doesn't read as one. */
export function shopCardView(kind: ShopKind, card: CardProps): React.ReactNode {
  void kind
  void card
  return undefined
}

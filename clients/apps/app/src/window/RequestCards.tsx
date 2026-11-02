// Step 3b: what an agent asks of the person (mac/Simeon/Cards.swift and
// its kin): a secret to give, the computer handed over, an in-chat form,
// 1Password's fill and connect cards. Read by `src/core/requestCards.ts`.

import type { CardKind } from '../core/chat'
import type { CardProps } from './Cards'
import './RequestCards.css'

type RequestKind = Extract<
  CardKind,
  'secret' | 'computer' | 'form' | 'credential' | 'onePasswordConnect'
>

/** The card for one of 3b's kinds, or none when its line doesn't read as one. */
export function requestCardView(
  kind: RequestKind,
  card: CardProps,
): React.ReactNode {
  void kind
  void card
  return undefined
}

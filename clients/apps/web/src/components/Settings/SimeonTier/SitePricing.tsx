'use client'

import { PaidTierKey } from '@/hooks/queries/plans'
import { useEffect, useRef } from 'react'
import './billing-pricing.css'
import { PRICING_FOOTNOTE, PricingCardView } from './pricing-cards'

interface SitePricingProps {
  cards: readonly PricingCardView[]
  highlight: PaidTierKey | null
  pendingId: PricingCardView['id'] | null
  onChoose(card: PricingCardView): void
}

/**
 * simeonlabs.com's pricing section, as buttons that start Stripe Checkout.
 * The trial card starts Standard monthly; the server adds the free week.
 */
const SitePricing = ({
  cards,
  highlight,
  pendingId,
  onChoose,
}: SitePricingProps) => {
  const picked = useRef<HTMLDivElement>(null)
  useEffect(() => {
    picked.current?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  return (
    <>
      <div className="plans3">
        {cards.map((card) => {
          const selected = card.id !== 'trial' && card.id === highlight
          return (
            <div
              className={selected ? 'plan3 picked' : 'plan3'}
              id={card.id === 'trial' ? undefined : card.id}
              key={card.id}
              ref={selected ? picked : undefined}
            >
              <h3>{card.name}</h3>
              <p className="tag">{card.tag}</p>
              <div className="pr">
                {card.price || '—'}
                {card.period ? <small>{card.period}</small> : null}
              </div>
              <p className="per">{card.allowance}</p>
              <p className="inc">{card.includes}</p>
              <ul>
                {card.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <button
                className="btn"
                disabled={!card.ready || pendingId !== null}
                onClick={() => onChoose(card)}
                type="button"
              >
                {pendingId === card.id ? 'Opening checkout…' : card.button}
              </button>
            </div>
          )
        })}
      </div>
      <p className="pnote">{PRICING_FOOTNOTE}</p>
    </>
  )
}

export default SitePricing

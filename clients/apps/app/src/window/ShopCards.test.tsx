// The shop cards as the window draws them, and the web's own choices
// (docs/web-app/PROGRESS.md): a card the core can't read is left to the
// chat, which says its words;
// Allow waits for a card to be picked; Review order is offered only where
// it opens something on the web (a Shop checkout's page); the products
// stand side by side when the chat has room, else in rows.

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Entry } from '../core/entry'
import type { JSONObject } from '../core/json'
import { AppStore } from '../core/store'
import type { CardProps } from './Cards'
import { shopCardView } from './ShopCards'

const store = new AppStore()

function draw(
  kind: 'purchase' | 'products',
  message: JSONObject,
  more: JSONObject = {},
  column = 928,
): string {
  const entry = Entry.from({
    kind: 'send-message',
    id: 'p1',
    timestampMs: 1,
    message,
    ...more,
  })!
  const card: CardProps = {
    entry,
    entryId: entry.id,
    agentId: 'iris',
    store,
    column,
    openAgent: () => {},
  }
  return renderToStaticMarkup(<>{shopCardView(kind, card)}</>)
}

const purchase = (more: JSONObject = {}): JSONObject => ({
  type: 'purchase',
  content: 'Checkout at ncvss.com · $80.00',
  purchase: {
    merchant: 'NCVSS',
    domain: 'ncvss.com',
    url: 'https://ncvss.com/checkout',
    total: '$80.00',
    items: [{ name: 'Linen shirt, white' }],
    card: { brand: 'Visa', last4: '1234' },
    ...more,
  },
})

describe('the shop cards on the web', () => {
  it('draws nothing of its own for a card it can’t read (the chat says its words)', () => {
    expect(
      draw('purchase', {
        type: 'purchase',
        content: 'Checkout at oldshop.com · $12.00',
        purchase: { merchant: 'Old shop' },
      }),
    ).toBe('')
    expect(draw('products', { type: 'products', products: [] })).toBe('')
  })

  it('waits for a card to be picked before Allow', () => {
    const page = draw(
      'purchase',
      purchase({
        card: null,
        cards: [
          { id: 'a', brand: 'Visa', last4: '1234' },
          { id: 'b', brand: 'Mastercard', last4: '1005' },
        ],
      }),
    )
    expect(page).toContain('Choose the card that pays')
    expect(page).toMatch(/<button[^>]*class="shop-pill prominent"[^>]*disabled/)
  })

  it('offers Review order only where it opens something on the web', () => {
    // A Link checkout's cart is on the agent's computer, whose screen comes in step 5.
    expect(draw('purchase', purchase())).not.toContain('review-order')
    // A Shop checkout's is the store's page.
    const shop = draw(
      'purchase',
      purchase({ wallet: 'shop', shopCheckout: { handle: 'chk_1' } }),
    )
    expect(shop).toContain('review-order')
    expect(shop).toContain('title="Open the store&#x27;s page"')
    // The bank's check: no Open the computer yet, its words stay.
    const bank = draw(
      'purchase',
      purchase({
        flight: {
          offerId: 'off_1',
          route: 'Seattle to Los Angeles',
          airline: 'Delta Air Lines',
        },
      }),
      { purchaseState: 'approved', purchaseStep: 'verify' },
    )
    expect(bank).toContain('Your bank wants to confirm it&#x27;s you')
    expect(bank).not.toContain('Open the computer<')
  })

  it('stands the products side by side when the chat has room, else in rows', () => {
    const products: JSONObject = {
      type: 'products',
      products: [1, 2, 3].map((n) => ({
        title: `Mug ${n}`,
        url: `https://example.com/mug-${n}`,
        price: '$28.00',
      })),
    }
    // Three tiles are 576 wide: a column of 928 has room (a card at most 640), one of 548 doesn't.
    expect(draw('products', products, {}, 928)).toContain('products-card tiles')
    expect(draw('products', products, {}, 548)).toContain('products-card rows')
  })
})

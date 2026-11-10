// The shared core's tests of the shop's cards (PurchaseCardTests.swift,
// ProductsCardTests.swift, and the flight on a checkout card from
// FlightBookingTests.swift and CoreTests.swift's FlightText): the same
// inputs give the same answers. The store's commands are in
// shopCardsStore.test.ts.

import { afterEach, describe, expect, it } from 'vitest'
import { aspect, cardText, chatRows, rowFor } from './chat'
import { Entry } from './entry'
import { clock, initials, whenLine } from './flightCards'
import type { JSONObject, JSONValue } from './json'
import {
  type ProductsCard,
  type PurchaseCard,
  approvalReason,
  buyLabel,
  byline,
  canChooseCard,
  cardsFooter,
  checkoutHeadline,
  checkoutWords,
  choiceLine,
  firstSentence,
  flightHeadline,
  itemsLine,
  needsCard,
  neighbourProduct,
  openWalletLabel,
  payingLine,
  priceLine,
  product,
  productRepliesOpen,
  productStatus,
  productStatusLabel,
  productWords,
  productsCard,
  purchaseCard,
  purchaseDetail,
  purchaseHeading,
  purchaseListLine,
  purchaseStatus,
  ratingLine,
  ratingText,
  reviewNote,
  reviewsText,
  shownProducts,
  shownPurchase,
  shownTake,
  storeName,
  viewAt,
  waitsOnBank,
  waitsOnPerson,
  walletApp,
  walletLabel,
} from './shopCards'
import { loadWords, setWords } from './words'

afterEach(() => setWords('en', {}))

function line(message: JSONValue, fields: JSONObject = {}): Entry {
  return Entry.from({
    id: 't3s1',
    kind: 'send-message',
    timestampMs: 1,
    message,
    ...fields,
  })!
}

describe('the checkout card', () => {
  const purchase: JSONObject = {
    merchant: 'NCVSS',
    domain: 'ncvss.com',
    url: 'https://ncvss.com/checkout/abc',
    amount: 8000,
    currency: 'usd',
    total: '$80.00',
    items: [{ name: 'Linen shirt, white', quantity: 2, description: 'Size M' }],
    card: { brand: 'Visa', last4: '1234' },
    preview: {
      url: 'file:///home/box/sand-data/agents/a1/assets/abc.jpg',
      width: 1280,
      height: 800,
    },
    test: false,
  }
  const message: JSONObject = {
    type: 'purchase',
    content: 'Checkout at ncvss.com · $80.00',
    purchase,
  }
  const with_ = (more: JSONObject): JSONObject => ({
    ...message,
    purchase: { ...purchase, ...more },
  })
  const card = (
    fields: JSONObject = {},
    of: JSONObject = message,
  ): PurchaseCard => {
    const entry = line(of, fields)
    expect(rowFor(entry)).toMatchObject({ kind: 'card', card: 'purchase' })
    const read = purchaseCard(entry)
    expect(read).toBeDefined()
    return read!
  }

  it('reads what is bought and who pays', () => {
    const read = card()
    expect(read.merchant).toBe('NCVSS')
    expect(read.domain).toBe('ncvss.com')
    expect(read.url).toBe('https://ncvss.com/checkout/abc')
    expect(read.total).toBe('$80.00')
    expect(payingLine(read)).toBe('Visa •••• 1234')
    expect(itemsLine(read)).toBe('Linen shirt, white ×2')
    expect(read.preview?.url).toBe(
      'file:///home/box/sand-data/agents/a1/assets/abc.jpg',
    )
    expect(aspect(read.preview!)).toBeCloseTo(1.6, 3)
    expect(read.state).toBe('review')
    expect(waitsOnPerson(read)).toBe(true)
    expect(purchaseStatus(read)).toBeUndefined()
    expect(checkoutHeadline('Ada', read.domain)).toBe(
      'Ada wants to place an order at ncvss.com',
    )
    expect(checkoutHeadline(' ', read.domain)).toBe(
      'Your agent wants to place an order at ncvss.com',
    )
    expect(purchaseListLine(read)).toBe('Checkout at ncvss.com · $80.00')
    // A quote or a thread's name.
    expect(cardText(message)).toBe('Checkout at ncvss.com · $80.00')
    expect(purchaseHeading(read)).toBe('Checkout')
    expect(walletLabel(read)).toBe('Link by Stripe')
  })

  it('lets the person pick the card on the card (the founder’s Link cards)', () => {
    const cards: JSONValue = [
      {
        id: 'csmrpd_chime',
        brand: 'Visa',
        last4: '0995',
        name: 'Chime Credit Builder',
      },
      {
        id: 'csmrpd_mc',
        brand: 'Mastercard',
        last4: '1005',
        name: 'Mastercard Debit',
      },
      { id: 'csmrpd_rh', brand: 'Visa', last4: '2862', name: 'Robinhood Cash' },
    ]
    const { card: _left, ...withoutCard } = purchase
    void _left
    const none: JSONObject = {
      ...message,
      purchase: {
        ...withoutCard,
        cards,
        icon: { url: 'file:///home/box/sand-data/agents/a1/assets/icon.png' },
      },
    }
    const open = card({}, none)
    expect(payingLine(open)).toBeUndefined()
    // Allow waits for a pick.
    expect(needsCard(open)).toBe(true)
    expect(canChooseCard(open)).toBe(true)
    expect(open.cards.map(choiceLine)).toEqual([
      'Chime Credit Builder •••• 0995',
      'Mastercard Debit •••• 1005',
      'Robinhood Cash •••• 2862',
    ])
    // The shop's icon, for Review order.
    expect(open.icon?.url).toBe(
      'file:///home/box/sand-data/agents/a1/assets/icon.png',
    )

    // Picked here: shown at once, and no longer waiting for a pick.
    const picked = shownPurchase(open, undefined, 'csmrpd_mc')
    expect(payingLine(picked)).toBe('Mastercard Debit •••• 1005')
    expect(picked.cardBrand).toBe('Mastercard')
    expect(picked.cardId).toBe('csmrpd_mc')
    expect(needsCard(picked)).toBe(false)
    // Only a card the card offered.
    expect(shownPurchase(open, undefined, 'not-offered')).toEqual(open)

    // Taken by the computer: its stamp wins on every device.
    const taken = card(
      {
        purchaseState: 'approving',
        purchasePaymentMethodId: 'csmrpd_rh',
        purchaseCard: { brand: 'Visa', last4: '2862', name: 'Robinhood Cash' },
      },
      none,
    )
    expect(payingLine(taken)).toBe('Robinhood Cash •••• 2862')
    expect(taken.cardId).toBe('csmrpd_rh')
    // No switching once allowed.
    expect(canChooseCard(taken)).toBe(false)

    // Link refused the pick: the card still waits, with its line.
    const refused = card(
      {
        purchaseNote:
          "Link won't let an agent pay with the Chime Credit Builder ending 0995. Choose another card.",
      },
      none,
    )
    expect(waitsOnPerson(refused)).toBe(true)
    expect(reviewNote(refused)).toBe(
      "Link won't let an agent pay with the Chime Credit Builder ending 0995. Choose another card.",
    )
    // A new pick clears it.
    expect(
      reviewNote(shownPurchase(refused, undefined, 'csmrpd_mc')),
    ).toBeUndefined()

    // A name that already says the last four, and no name at all.
    expect(
      choiceLine({
        id: 'a',
        brand: 'Visa',
        last4: '4242',
        name: 'Visa 4242',
        isDefault: false,
      }),
    ).toBe('Visa 4242')
    expect(
      choiceLine({ id: 'b', brand: 'Amex', last4: '0005', isDefault: false }),
    ).toBe('Amex •••• 0005')
  })

  it('says where each state stands', () => {
    const approving = card({
      purchaseState: 'approving',
      purchaseActionUrl: 'https://app.link.com/activity/approve/lsrq_1',
    })
    expect(purchaseStatus(approving)?.label).toBe('Approve with Link')
    // Link's wait says no more than its status.
    expect(purchaseDetail(approving)).toBeUndefined()
    expect(purchaseStatus(card({ purchaseState: 'sending' }))?.label).toBe(
      'In progress',
    )
    expect(checkoutWords.linkAppURL).toBe('https://link.com/download')
    expect(approving.actionURL).toBe(
      'https://app.link.com/activity/approve/lsrq_1',
    )
    expect(waitsOnPerson(approving)).toBe(false)
    expect(walletApp(approving)).toEqual({
      label: 'Get the Link app',
      url: 'https://link.com/download',
    })
    expect(openWalletLabel(approving)).toBe('Open Link')

    const ordered = card({
      purchaseState: 'ordered',
      purchaseOrder: '1042',
      purchaseNote: 'Arrives Thu, Oct 18',
    })
    expect(purchaseStatus(ordered)).toEqual({
      label: 'Ordered',
      kind: 'success',
    })
    expect(purchaseDetail(ordered)).toBe('Order #1042 · Arrives Thu, Oct 18')

    const failed = card({
      purchaseState: 'failed',
      purchaseNote: 'Amount exceeds your daily limit.',
    })
    expect(purchaseStatus(failed)).toEqual({
      label: "Didn't go through",
      kind: 'danger',
    })
    expect(purchaseDetail(failed)).toBe('Amount exceeds your daily limit.')
    expect(purchaseDetail(card({ purchaseState: 'failed' }))).toBe(
      'Nothing was paid.',
    )
    expect(purchaseDetail(card({ purchaseState: 'denied' }))).toBe(
      'Nothing was paid.',
    )
    expect(purchaseStatus(card({ purchaseState: 'denied' }))).toEqual({
      label: 'Denied',
      kind: 'neutral',
    })
    expect(purchaseStatus(card({ purchaseState: 'expired' }))?.label).toBe(
      'Expired',
    )
    expect(purchaseStatus(card({ purchaseState: 'canceled' }))?.label).toBe(
      'Canceled',
    )
    expect(purchaseStatus(card({ purchaseState: 'approved' }))).toEqual({
      label: 'Approved · placing your order',
      kind: 'working',
    })
    // A state the app doesn't know waits, as a card with none.
    expect(card({ purchaseState: 'later' }).state).toBe('review')
    // Only Link's own pages open from the card: no plain http, no other scheme.
    expect(
      card({
        purchaseState: 'approving',
        purchaseActionUrl: 'javascript:alert(1)',
      }).actionURL,
    ).toBeUndefined()
    expect(
      card({
        purchaseState: 'approving',
        purchaseActionUrl: 'http://app.link.com/activity/approve/lsrq_1',
      }).actionURL,
    ).toBeUndefined()
    // An answer shows at once, and only on a card that still waited.
    expect(shownPurchase(card(), 'sending').state).toBe('sending')
    expect(shownPurchase(ordered, 'denied').state).toBe('ordered')
    expect(shownPurchase(ordered, 'denied')).toBe(ordered)
  })

  it('says Shop on a Shop card, and needs no app for a Shop checkout', () => {
    const withShop = with_({ wallet: 'shop' })
    const review = card({}, withShop)
    expect(review.wallet).toBe('shop')
    expect(review.isShopCheckout).toBe(false)
    expect(walletLabel(review)).toBe('Shop')
    expect(cardsFooter(review)).toBe(checkoutWords.shopCardsFooter)
    const approving = card(
      {
        purchaseState: 'approving',
        purchaseActionUrl: 'https://shop.app/approvals/abc',
      },
      withShop,
    )
    expect(purchaseStatus(approving)?.label).toBe('Approve it in the Shop app')
    expect(purchaseDetail(approving)).toBe(checkoutWords.shopApprovingDetail)
    expect(openWalletLabel(approving)).toBe('Open Shop')
    expect(walletApp(approving)?.label).toBe('Get the Shop app')
    expect(approving.actionURL).toBe('https://shop.app/approvals/abc')
    expect(purchaseStatus(card({}, withShop))).toBeUndefined()
    expect(
      purchaseStatus(card({ purchaseState: 'sending' }, withShop))?.label,
    ).toBe('Asking Shop…')
    // A Link card is as it was.
    expect(purchaseStatus(card({ purchaseState: 'sending' }))?.label).toBe(
      'In progress',
    )
    expect(walletLabel(card())).toBe('Link by Stripe')
    expect(cardsFooter(card())).toBe(checkoutWords.cardsFooter)

    const checkout: JSONObject = {
      ...withShop,
      purchase: {
        ...(withShop.purchase as JSONObject),
        shopCheckout: { handle: 'chk_0123456789ab' },
      },
    }
    const placing = card({ purchaseState: 'sending' }, checkout)
    expect(placing.isShopCheckout).toBe(true)
    expect(purchaseStatus(placing)?.label).toBe('Placing your order with Shop…')
    expect(cardsFooter(placing)).toBe(checkoutWords.shopCheckoutCardsFooter)
    // No app to approve in.
    expect(walletApp(placing)).toBeUndefined()
    const store = card(
      {
        purchaseState: 'approving',
        purchaseNote: "Confirm your age on the store's page.",
        purchaseActionUrl: 'https://shop.app/checkouts/f/abc',
      },
      checkout,
    )
    expect(purchaseStatus(store)?.label).toBe("Finish on the store's page")
    expect(purchaseDetail(store)).toBe("Confirm your age on the store's page.")
    expect(openWalletLabel(store)).toBe("Open the store's page")
    const ordered = card(
      { purchaseState: 'ordered', purchaseOrder: '#1042' },
      checkout,
    )
    expect(purchaseDetail(ordered)).toBe('Order #1042')
    // A Shop card keeps its wallet when shown with an answer.
    expect(shownPurchase(review, 'sending').wallet).toBe('shop')
    // A Shop checkout is Shop's: a Link card's handle makes none.
    expect(
      card({}, with_({ shopCheckout: { handle: 'chk_0123456789ab' } }))
        .isShopCheckout,
    ).toBe(false)
  })

  it('says the Credentials Store on a saved-card card, and needs no app', () => {
    const saved = with_({ wallet: 'card' })
    const review = card({}, saved)
    expect(review.wallet).toBe('card')
    expect(walletLabel(review)).toBe('Credentials Store')
    expect(cardsFooter(review)).toBe(checkoutWords.savedCardsFooter)
    expect(walletApp(review)).toBeUndefined()
    expect(
      purchaseStatus(card({ purchaseState: 'sending' }, saved))?.label,
    ).toBe('In progress')
    const approved = card({ purchaseState: 'approved' }, saved)
    expect(purchaseStatus(approved)?.label).toBe(
      'Approved · placing your order',
    )
    expect(shownPurchase(review, 'sending').wallet).toBe('card')
  })

  it('reads a card without its facts as none, whose message says its words', () => {
    const broken: JSONObject = {
      type: 'purchase',
      content: 'Checkout at ncvss.com · $80.00',
      purchase: { merchant: 'NCVSS' },
    }
    expect(purchaseCard(line(broken))).toBeUndefined()
    expect(purchaseCard(line({ type: 'purchase' }))).toBeUndefined()
    expect(cardText(broken)).toBe('Checkout at ncvss.com · $80.00')
    // The shop's name is its site when it has none of its own.
    expect(card({}, with_({ merchant: ' ' })).merchant).toBe('ncvss.com')
  })

  it('names the approval Allow would carry: what and where', () => {
    expect(approvalReason(card())).toBe('Approve $80.00 at ncvss.com')
  })

  it('says it in the person’s language', async () => {
    await loadWords('fr')
    const approving = card({ purchaseState: 'approving' })
    expect(purchaseStatus(approving)?.label).toBe('Approuve avec Link')
    expect(checkoutHeadline('Ada', 'ncvss.com')).toBe(
      'Ada veut passer une commande sur ncvss.com',
    )
    expect(checkoutWords.title).toBe('Paiement')
    expect(
      purchaseDetail(card({ purchaseState: 'ordered', purchaseOrder: '1042' })),
    ).toBe('Commande #1042')
    // Link's and Shop's names stay their own.
    expect(walletLabel(approving)).toBe('Link by Stripe')
  })
})

describe('the flight on a checkout card', () => {
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
  const message: JSONObject = {
    type: 'purchase',
    content: 'Flight Seattle to Los Angeles · $361.20',
    purchase: {
      merchant: 'Duffel Airways',
      domain: 'duffel.com',
      url: 'https://duffel.com/conditions',
      amount: 36120,
      currency: 'usd',
      total: '$361.20',
      items: [
        { name: 'Flight Seattle to Los Angeles, Thu, Nov 12', quantity: 1 },
      ],
      card: { brand: 'Visa', last4: '4242' },
      test: true,
      flight: { ...flight, travellers: ['Ada Lovelace'], formEntryId: 't2s1' },
    },
  }
  const card = (fields: JSONObject = {}) =>
    purchaseCard(
      Entry.from({
        id: 't2s1',
        kind: 'send-message',
        timestampMs: 1,
        message,
        ...fields,
      })!,
    )!

  it('says where Simeon is', () => {
    const review = card()
    expect(review.flight?.travellers).toEqual(['Ada Lovelace'])
    expect(purchaseHeading(review)).toBe('Flight')
    expect(purchaseListLine(review)).toBe(
      'Flight Seattle to Los Angeles · $361.20',
    )
    expect(flightHeadline('Ada', 'Duffel Airways')).toBe(
      'Ada wants to book a flight with Duffel Airways',
    )
    expect(flightHeadline('', 'Duffel Airways')).toBe(
      'Your agent wants to book a flight with Duffel Airways',
    )
    expect(flightHeadline('Ada', '')).toBe('Ada wants to book a flight')
    expect(flightHeadline('', '')).toBe('Your agent wants to book a flight')
    expect(waitsOnPerson(review)).toBe(true)
    expect(
      purchaseStatus(
        card({ purchaseState: 'approved', purchaseStep: 'paying' }),
      )?.label,
    ).toBe('Approved · paying the airline')
    const verify = card({ purchaseState: 'approved', purchaseStep: 'verify' })
    expect(waitsOnBank(verify)).toBe(true)
    expect(purchaseStatus(verify)?.label).toBe(
      "Your bank wants to confirm it's you",
    )
    expect(purchaseDetail(verify)).toBe(
      'Open the computer to finish the check; the booking goes on by itself.',
    )
    expect(
      purchaseStatus(
        card({ purchaseState: 'approved', purchaseStep: 'booking' }),
      )?.label,
    ).toBe('Booking with the airline…')
    const booked = card({ purchaseState: 'ordered', purchaseOrder: 'RZPNX8' })
    expect(purchaseStatus(booked)?.label).toBe('Booked')
    expect(purchaseDetail(booked)).toBe(
      'Booking reference RZPNX8 · The airline emails the ticket.',
    )
    const refused = card({
      purchaseState: 'failed',
      purchaseNote:
        'The price changed to $380.00 after it was approved, so nothing was paid.',
    })
    expect(purchaseStatus(refused)?.label).toBe('Not booked')
    expect(purchaseDetail(refused)).toBe(
      'The price changed to $380.00 after it was approved, so nothing was paid.',
    )
    expect(purchaseDetail(card({ purchaseState: 'failed' }))).toBe(
      'Nothing was booked.',
    )
    const uncertain = card({
      purchaseState: 'failed',
      purchaseStep: 'uncertain',
      purchaseNote: "Check for the airline's email.",
    })
    expect(purchaseStatus(uncertain)).toEqual({
      label: 'Not confirmed',
      kind: 'neutral',
    })
    // Before Link approves, a flight's card says Link's words.
    expect(purchaseStatus(card({ purchaseState: 'approving' }))?.label).toBe(
      'Approve with Link',
    )
    expect(approvalReason(review)).toBe(
      'Approve $361.20 for the flight Seattle to Los Angeles',
    )
  })

  it('writes its times as the flight cards do (FlightCards’ own words)', () => {
    expect(whenLine(card().flight!)).toBe(
      'Thu, Nov 12 · 6:49am – 9:34am · Nonstop',
    )
    expect(clock('2:30 PM')).toBe('2:30pm')
    expect(clock('6:40 AM +1', false)).toBe('6:40am')
    expect(initials('Duffel Airways')).toBe('DU')
    expect(initials('Delta Air Lines')).toBe('DL')
    expect(initials('JetBlue')).toBe('JE')
  })

  it('reads no flight without its offer', () => {
    const { offerId: _offer, ...older } = flight
    void _offer
    const read = purchaseCard(
      line({
        ...message,
        purchase: { ...(message.purchase as JSONObject), flight: older },
      }),
    )!
    expect(read.flight).toBeUndefined()
    expect(purchaseHeading(read)).toBe('Checkout')
  })
})

describe('the products card', () => {
  const message: JSONObject = {
    type: 'products',
    content: 'Practice Book "The Ways Of Water" · $2.23',
    products: [
      {
        title:
          'Practice Book "The Ways Of Water": Draw Water Features And Improve Your Skills',
        url: 'https://daribodrawing.gumroad.com/l/water',
        domain: 'daribodrawing.gumroad.com',
        price: '$2.23',
        seller: 'Daria Bogdanova',
        imageUrl: 'https://public-files.gumroad.com/water.png',
      },
      {
        title: 'Sketch pack',
        url: 'https://gumroad.com/l/sketch',
        domain: 'gumroad.com',
        imageUrl: 'http://insecure.example/x.png',
      },
      { title: 'No page', url: 'http://insecure.example/x' },
    ],
  }
  const card = (fields: JSONObject = {}): ProductsCard => {
    const entry = line(message, fields)
    expect(rowFor(entry)).toMatchObject({ kind: 'card', card: 'products' })
    return productsCard(entry)!
  }

  it('reads each product as the shop shows it', () => {
    const read = card()
    // A product without its own https page is left out.
    expect(read.products.length).toBe(2)
    const book = read.products[0]!
    expect(book.index).toBe(0)
    expect(book.price).toBe('$2.23')
    expect(byline(book)).toBe('Daria Bogdanova')
    expect(book.imageURL).toBe('https://public-files.gumroad.com/water.png')
    // Never a plain http picture.
    expect(read.products[1]!.imageURL).toBeUndefined()
    // The shop when no seller is named.
    expect(byline(read.products[1]!)).toBe('gumroad.com')
    expect(read.buying).toBeUndefined()
    expect(buyLabel('Muse')).toBe('Buy with Muse')
    expect(buyLabel(' ')).toBe('Buy')
    // A card from before replies has none, nor a badge.
    expect(read.replies).toEqual([])
    expect(book.badge).toBeUndefined()
    expect(cardText(message)).toBe('Practice Book "The Ways Of Water" · $2.23')
    // None at all: the chat says its words.
    expect(
      productsCard(
        line({ type: 'products', content: 'x', products: [{ title: 'x' }] }),
      ),
    ).toBeUndefined()
    // The shop's site from the address when the agent named none.
    expect(
      productsCard(
        line({
          type: 'products',
          products: [{ title: 'Mug', url: 'https://shop.example.com/mug' }],
        }),
      )!.products[0]!.domain,
    ).toBe('shop.example.com')
  })

  it('reads an opened product as a store’s page', () => {
    const read = productsCard(
      Entry.from({
        id: 't9s1',
        kind: 'send-message',
        timestampMs: 1,
        message: {
          type: 'products',
          content: 'Element 24" · $99.99',
          products: [
            {
              title: 'Element 24" 1080P FHD IPS Display Computer Monitor',
              url: 'https://officedepot.com/a/element-24',
              domain: 'officedepot.com',
              price: '$99.99',
              listPrice: '$119.99',
              seller: 'Office Depot',
              rating: 4.46,
              reviewCount: 153,
              description:
                'A reliable choice. It has a **100Hz refresh rate**.',
            },
            {
              title: 'Element 27" 1080P',
              url: 'https://element.com/27',
              price: '$123.84',
              listPrice: '$123.84',
              seller: 'Element',
              reviewCount: 12,
            },
            {
              title: 'Element 24" 100Hz',
              url: 'https://element.com/24',
              price: '$100.26',
              rating: 4,
              reviewCount: 0,
            },
          ],
        },
      })!,
    )!
    const monitor = read.products[0]!
    // Sold by's value.
    expect(byline(monitor)).toBe('Office Depot')
    expect(monitor.listPrice).toBe('$119.99')
    expect(ratingText(monitor)).toBe('4.5')
    expect(reviewsText(monitor)).toBe('(153)')
    // One star, no row of five.
    expect(ratingLine(monitor)).toBe('★ 4.5 (153)')
    expect(monitor.detail).toBe(
      'A reliable choice. It has a **100Hz refresh rate**.',
    )
    expect(monitor.take).toBeUndefined()
    // A card from before takes: its description's first sentence.
    expect(shownTake(monitor)).toBe('A reliable choice')
    expect(priceLine(monitor)).toBe('$99.99 · A reliable choice')
    // No Why it fits.
    expect(monitor.reasons).toEqual([])
    // The site, when the agent named no store.
    expect(storeName(monitor)).toBe('officedepot.com')
    expect(viewAt(monitor)).toBe('View at officedepot.com')
    // No struck price equal to the price.
    expect(read.products[1]!.listPrice).toBeUndefined()
    expect(read.products[1]!.rating).toBeUndefined()
    // No review count without stars.
    expect(ratingLine(read.products[1]!)).toBeUndefined()
    expect(priceLine(read.products[1]!)).toBe('$123.84')
    expect(ratingLine(read.products[2]!)).toBe('★ 4.0')
    const at = (rating: number) =>
      product({
        index: 0,
        title: 'x',
        url: 'https://a.com',
        domain: 'a.com',
        rating,
      })
    expect(ratingText(at(5.5))).toBeUndefined()
    // ‹ and ›: the card's products in order, stopping at either end.
    expect(neighbourProduct(read, monitor, 1)?.index).toBe(1)
    expect(neighbourProduct(read, monitor, -1)).toBeUndefined()
    expect(neighbourProduct(read, read.products[2]!, -1)?.index).toBe(1)
    expect(neighbourProduct(read, read.products[2]!, 1)).toBeUndefined()
    expect(productWords.whyItFits).toBe('Why it fits')
    expect(productWords.soldBy).toBe('Sold by')
  })

  it('reads the agent’s comparison on the card', () => {
    const read = productsCard(
      Entry.from({
        id: 't9s2',
        kind: 'send-message',
        timestampMs: 1,
        message: {
          type: 'products',
          content: 'Possibly Pink · CA$62.00; Love Blossoms · CA$53.00',
          replies: [
            'Get Possibly Pink',
            ' ',
            'Get Love Blossoms',
            'Show me roses',
            'A fourth',
          ],
          products: [
            {
              title: 'Possibly Pink (Teleflora)',
              url: 'https://www.canadaflowers.ca/p/pink',
              domain: 'canadaflowers.ca',
              price: 'CA$62.00',
              store: 'Canada Flowers',
              take: 'Pink, mauve, peach and lavender in a pink vase',
              reasons: ['Best-reviewed of the four', ''],
              badge: 'Top rated',
              rating: 5,
              reviewCount: 33,
            },
            {
              title: 'Love Blossoms',
              url: 'https://www.canadaflowers.ca/p/love',
              domain: 'canadaflowers.ca',
              price: 'CA$53.00',
              store: 'Canada Flowers',
              take: 'Soft pink and white, cheapest of the four',
              reasons: ['Lowest price, still highly rated'],
              badge: 'Best value',
              description: 'Ignored. The take wins.',
            },
          ],
        },
      })!,
    )!
    const [pink, blossoms] = read.products
    expect(pink!.badge).toBe('Top rated')
    // One badge on a card: the first.
    expect(blossoms!.badge).toBeUndefined()
    // An empty reason is left out.
    expect(pink!.reasons).toEqual(['Best-reviewed of the four'])
    expect(storeName(pink!)).toBe('Canada Flowers')
    expect(viewAt(pink!)).toBe('View at Canada Flowers')
    // Sold by: the store when no seller is named.
    expect(byline(pink!)).toBe('Canada Flowers')
    expect(ratingLine(pink!)).toBe('★ 5.0 (33)')
    // The take wins over the description.
    expect(priceLine(blossoms!)).toBe(
      'CA$53.00 · Soft pink and white, cheapest of the four',
    )
    // Three at most, none empty.
    expect(read.replies).toEqual([
      'Get Possibly Pink',
      'Get Love Blossoms',
      'Show me roses',
    ])
    // Buy keeps the replies.
    expect(shownProducts(read, 1).replies).toEqual(read.replies)
    expect(firstSentence('It costs $2.23 today! More.')).toBe(
      'It costs $2.23 today!',
    )
    expect(firstSentence('A **bold** start.\nThen more.')).toBe('A bold start')
    expect(firstSentence('No full stop')).toBe('No full stop')
    expect(firstSentence('  ')).toBeUndefined()
  })

  it('keeps its replies until the person sends anything after it', () => {
    const products = Entry.from({
      id: 't1',
      kind: 'send-message',
      timestampMs: 1000,
      message: {
        type: 'products',
        content: 'Love Blossoms',
        replies: ['Get Love Blossoms'],
        products: [
          {
            title: 'Love Blossoms',
            url: 'https://www.canadaflowers.ca/p/love',
          },
        ],
      },
    })!
    const said = (id: string, at: number, role: string, words: string) =>
      Entry.from({
        id,
        kind: 'message',
        role,
        content: words,
        timestampMs: at,
      })!
    const open = (entries: Entry[]) =>
      productRepliesOpen(chatRows(entries), 't1')
    // Under the card while nothing follows.
    expect(open([products])).toBe(true)
    // The agent's own line after it keeps them.
    expect(
      open([products, said('a2', 2000, 'assistant', 'I’d pick this.')]),
    ).toBe(true)
    // A reply tapped, or anything the person sends: gone.
    expect(
      open([products, said('u3', 3000, 'user', 'Get Love Blossoms')]),
    ).toBe(false)
    // What came before doesn't count.
    expect(open([said('u0', 500, 'user', 'Find flowers'), products])).toBe(true)
    // A card not in the rows shows none.
    expect(productRepliesOpen(chatRows([]), 't1')).toBe(false)
  })

  it('shows Buy at once, and the computer’s copy wins', () => {
    const read = card()
    expect(shownProducts(read, 0).buying).toBe(0)
    // Only a product on the card.
    expect(shownProducts(read, 9)).toEqual(read)
    expect(card({ productsBuying: 1 }).buying).toBe(1)
  })

  it('is Buying in blue until the computer says Bought', () => {
    const buying = card({ productsBuying: 1 })
    expect(productStatus(buying, buying.products[1]!)).toBe('buying')
    expect(productStatus(buying, buying.products[0]!)).toBeUndefined()
    expect(productStatusLabel('buying')).toBe('Buying')
    const bought = card({ productsBought: [1] })
    expect(bought.bought).toEqual(new Set([1]))
    expect(bought.buying).toBeUndefined()
    expect(productStatus(bought, bought.products[1]!)).toBe('bought')
    expect(productStatusLabel('bought')).toBe('Bought')
    // A bought product isn't bought again.
    expect(shownProducts(bought, 1)).toEqual(bought)
    // Another one still can be.
    expect(productStatus(shownProducts(bought, 0), bought.products[0]!)).toBe(
      'buying',
    )
    expect(shownProducts(bought, 0).bought).toEqual(new Set([1]))
    // Bought wins.
    expect(
      card({ productsBuying: 1, productsBought: [1] }).buying,
    ).toBeUndefined()
  })

  it('says it in the person’s language, its rating as the language writes it', async () => {
    await loadWords('fr')
    const read = card()
    expect(buyLabel('Muse')).toBe('Acheter avec Muse')
    expect(productWords.whyItFits).toBe('Pourquoi ce choix')
    expect(viewAt(read.products[1]!)).toBe('Voir chez gumroad.com')
    expect(productStatusLabel('buying')).toBe('Achat en cours')
    expect(
      ratingLine(
        product({
          index: 0,
          title: 'x',
          url: 'https://a.com',
          domain: 'a.com',
          rating: 4.46,
          reviewCount: 9,
        }),
      ),
    ).toBe('★ 4,5 (9)')
  })

  it('rounds the rating as the core’s "%.1f" does: the stored number, not its decimal', () => {
    const rated = (rating: number) =>
      ratingText(
        product({
          index: 0,
          title: 'x',
          url: 'https://a.com',
          domain: 'a.com',
          rating,
        }),
      )
    // C's printf("%.1f") on these doubles: 4.35 is kept as 4.3499…, 4.25 is exact and rounds to even.
    expect(rated(4.35)).toBe('4.3')
    expect(rated(4.25)).toBe('4.2')
    expect(rated(4.05)).toBe('4.0')
    expect(rated(1.45)).toBe('1.4')
    expect(rated(4.46)).toBe('4.5')
    expect(rated(5)).toBe('5.0')
  })
})

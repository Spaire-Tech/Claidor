// The shop's cards, as SimeonCore reads them: the checkout card
// (PurchaseCard.swift's `PurchaseCard`, with the flight a checkout may be
// for, from FlightBooking.swift's `BookedFlight`), the approval Allow may
// carry (PurchaseApproval.swift), and the products card
// (ProductsCard.swift's `ProductsCard`), with the words each says.
//
// A checkout card (`send-message` of type `purchase`) is one purchase an
// agent wants to make, before any money is asked for: the shop, the
// checkout's picture, the Link card (or Shop) that pays and the total, with
// Allow and Deny. The entry carries where it stands (`purchaseState` and the
// fields beside it), which the computer stamps. A products card (type
// `products`) is what an agent found to buy, each with "Buy with <agent>";
// the entry carries the one being bought (`productsBuying`) and those bought
// (`productsBought`).

import { type ChatImage, chatImageFrom } from './chat'
import type { Entry } from './entry'
import { type BookedFlight, bookedFlight } from './flightCards'
import {
  type JSONValue,
  arr,
  bool,
  field,
  int,
  isObject,
  num,
  str,
} from './json'
import { t } from './l10n'
import { english, isEnglish } from './language'
import { wordsLanguage } from './words'

/** A string field trimmed, "" when it is none (`value?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""`). */
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function present(words: string): string | undefined {
  return words === '' ? undefined : words
}

/** An address that is `https` as written, or none (`URL(string:)` and `scheme == "https"`). */
export function httpsAddress(value: string | undefined): string | undefined {
  if (value == null || !value.startsWith('https:')) return undefined
  try {
    new URL(value)
  } catch {
    return undefined
  }
  return value
}

// MARK: The checkout card

export type PurchaseState =
  /** Waiting for the person's Allow or Deny. */
  | 'review'
  /** Allow pressed: Simeon is asking Link. */
  | 'sending'
  /** Link asked the person to approve it (in the Link app, or at `actionURL`). */
  | 'approving'
  /** Link approved: the agent is placing the order. */
  | 'approved'
  | 'ordered'
  | 'failed'
  | 'denied'
  | 'expired'
  | 'canceled'

const purchaseStates: readonly PurchaseState[] = [
  'review',
  'sending',
  'approving',
  'approved',
  'ordered',
  'failed',
  'denied',
  'expired',
  'canceled',
]

/** The wallet that pays: Link (every card before 14 October 2026) or Shop. */
export type Wallet = 'link' | 'shop'

/** Where Simeon is while paying an approved flight, or that the airline never answered. */
export type PurchaseStep =
  | 'paying'
  /** The bank wants the person: its check is on the computer. */
  | 'verify'
  | 'booking'
  /** The airline never answered: nobody can say whether it's booked. */
  | 'uncertain'

const purchaseSteps: readonly PurchaseStep[] = [
  'paying',
  'verify',
  'booking',
  'uncertain',
]

export interface PurchaseItem {
  name: string
  quantity: number
  detail?: string
}

/** One of the person's Link cards an agent may pay with: the card's chooser (14 October 2026). */
export interface CardChoice {
  /** Link's opaque payment method id (never a card number). */
  id: string
  brand: string
  last4: string
  /** Its name in Link: "Chime Credit Builder". */
  name?: string
  isDefault: boolean
}

export interface PurchaseCard {
  merchant: string
  /** The checkout's site, "ncvss.com". */
  domain: string
  /** The checkout page (https only). */
  url?: string
  /** "$80.00", as the shop writes it. */
  total: string
  items: PurchaseItem[]
  /** "Visa", "1234", "Mastercard Debit": the Link card that pays; none while the person still picks one. */
  cardBrand?: string
  cardLast4?: string
  cardName?: string
  /** Which of `cards` pays (Link's id), when Link named one. */
  cardId?: string
  /** The person's Link cards an agent may pay with, when there are several: the card's chooser. */
  cards: CardChoice[]
  /** The checkout as it looked when the agent asked. */
  preview?: ChatImage
  /** The shop's own icon, which Review order wears. */
  icon?: ChatImage
  /** Link's test mode: a test card, nothing charged. */
  isTest: boolean
  state: PurchaseState
  /** Link's words, why it failed, or the delivery estimate. */
  note?: string
  /** Link's approval page, or what Link asks the person to do first (https only). */
  actionURL?: string
  order?: string
  /** The flight it pays for (FlightBooking.swift's `BookedFlight`, read by FlightCards' `bookedFlight`). */
  flight?: BookedFlight
  step?: PurchaseStep
  wallet: Wallet
  /** A Shopify store's checkout Simeon opened through Shop: Allow places the order, no app to approve in. */
  isShopCheckout: boolean
}

/** A checkout card, or none when the message lacks its shop or its total (the chat then says its words). */
export function purchaseCard(entry: Entry): PurchaseCard | undefined {
  const purchase = field(entry.message, 'purchase')
  if (!isObject(purchase)) return undefined
  const domain = trimmed(purchase.domain)
  const total = trimmed(purchase.total)
  if (domain === '' || total === '') return undefined
  const items = (arr(purchase.items) ?? []).flatMap((item): PurchaseItem[] => {
    const name = trimmed(field(item, 'name'))
    if (name === '') return []
    return [
      {
        name,
        quantity: Math.max(1, int(field(item, 'quantity')) ?? 1),
        detail: present(trimmed(field(item, 'description'))),
      },
    ]
  })
  // The card picked on the card at Allow (stamped by the host) wins over the one it was made with.
  const stamped = entry.get('purchaseCard')
  const paying = isObject(stamped) ? stamped : field(purchase, 'card')
  const chosen = trimmed(entry.get('purchasePaymentMethodId'))
  const cards = (arr(purchase.cards) ?? []).flatMap((card): CardChoice[] => {
    const id = trimmed(field(card, 'id'))
    if (id === '') return []
    const brand = trimmed(field(card, 'brand'))
    return [
      {
        id,
        brand: brand === '' ? t('Card') : brand,
        last4: trimmed(field(card, 'last4')),
        name: present(trimmed(field(card, 'name'))),
        isDefault: bool(field(card, 'isDefault')) ?? false,
      },
    ]
  })
  const state = str(entry.get('purchaseState')) as PurchaseState | undefined
  const step = str(entry.get('purchaseStep')) as PurchaseStep | undefined
  const wallet: Wallet = trimmed(purchase.wallet) === 'shop' ? 'shop' : 'link'
  return {
    merchant:
      trimmed(purchase.merchant) === '' ? domain : trimmed(purchase.merchant),
    domain,
    url: httpsAddress(present(trimmed(purchase.url))),
    total,
    items,
    cardBrand: present(trimmed(field(paying, 'brand'))),
    cardLast4: present(trimmed(field(paying, 'last4'))),
    cardName: present(trimmed(field(paying, 'name'))),
    cardId: present(
      chosen === ''
        ? trimmed(field(field(purchase, 'link'), 'paymentMethodId'))
        : chosen,
    ),
    cards,
    preview: chatImageFrom(purchase.preview),
    icon: chatImageFrom(purchase.icon),
    isTest: bool(purchase.test) ?? false,
    state: state && purchaseStates.includes(state) ? state : 'review',
    note: present(trimmed(entry.get('purchaseNote'))),
    actionURL: httpsAddress(str(entry.get('purchaseActionUrl'))),
    order: present(trimmed(entry.get('purchaseOrder'))),
    flight: bookedFlight(purchase.flight),
    step: step && purchaseSteps.includes(step) ? step : undefined,
    wallet,
    isShopCheckout:
      wallet === 'shop' &&
      trimmed(field(field(purchase, 'shopCheckout'), 'handle')) !== '',
  }
}

/**
 * The card as the person sees it now: the card they picked on it (before
 * Allow, on this device), and their own answer at once, before the
 * computer echoes it (`shown(answered:picked:)`).
 */
export function shownPurchase(
  card: PurchaseCard,
  answered?: PurchaseState,
  picked?: string,
): PurchaseCard {
  const choice =
    card.state === 'review' && picked != null
      ? card.cards.find((one) => one.id === picked)
      : undefined
  if (choice == null && !(card.state === 'review' && answered != null))
    return card
  return {
    ...card,
    cardBrand: choice ? choice.brand : card.cardBrand,
    cardLast4: choice ? choice.last4 : card.cardLast4,
    cardName: choice ? choice.name : card.cardName,
    cardId: choice ? choice.id : card.cardId,
    state: card.state === 'review' ? (answered ?? card.state) : card.state,
    note: choice == null ? card.note : undefined,
  }
}

/** The checkout card's own words (`PurchaseCard`'s static words), in the app's language. */
export const checkoutWords = {
  get title() {
    return t('Checkout')
  },
  get check() {
    return t(
      "Check the items, delivery and terms on the shop's page before you allow it.",
    )
  },
  get reviewOrder() {
    return t('Review order')
  },
  /** Link's own name, never translated. */
  payWithLink: 'Link by Stripe',
  get chooseCard() {
    return t('Choose the card that pays')
  },
  get cardsTitle() {
    return t('Pay with')
  },
  get cardsFooter() {
    return t(
      'Your cards in Link. Add or remove cards in the Link app or at link.com.',
    )
  },
  get totalLabel() {
    return t('Total')
  },
  get deny() {
    return t('Deny')
  },
  get allow() {
    return t('Allow')
  },
  get openLink() {
    return t('Open Link')
  },
  get getLinkApp() {
    return t('Get the Link app')
  },
  /** Where Link sends people for its app (Link's own command-line tool shows the same address). */
  linkAppURL: 'https://link.com/download',
  get testNote() {
    return t("Link's test mode: nothing is charged.")
  },
  // Shop's words (14 October 2026).
  /** Shop's own name, never translated. */
  payWithShop: 'Shop',
  get openShop() {
    return t('Open Shop')
  },
  get getShopApp() {
    return t('Get the Shop app')
  },
  shopAppURL: 'https://shop.app',
  get openStorePage() {
    return t("Open the store's page")
  },
  get shopCardsFooter() {
    return t('Your cards in Shop. Add or remove cards in the Shop app.')
  },
  get shopCheckoutCardsFooter() {
    return t('The ways to pay this store offers you through Shop.')
  },
  get shopApprovingDetail() {
    return t(
      'Shop sent it to the Shop app on your phone. Approve it there; nothing is paid until you do. No Shop app yet? Get it and sign in with the account you connected.',
    )
  },
  // A flight's words.
  get flightTitle() {
    return t('Flight')
  },
  get flightCheck() {
    return t(
      "Check the flight, the travellers' names and the total before you allow it.",
    )
  },
  get flightTestNote() {
    return t('Test mode: a pretend airline, nothing is charged.')
  },
  get openComputer() {
    return t('Open the computer')
  },
}

/** What the card row names beside the card that pays: "Link by Stripe" or "Shop". */
export function walletLabel(card: PurchaseCard): string {
  return card.wallet === 'shop'
    ? checkoutWords.payWithShop
    : checkoutWords.payWithLink
}

/** The chooser's footer, by wallet. */
export function cardsFooter(card: PurchaseCard): string {
  if (card.wallet === 'link') return checkoutWords.cardsFooter
  return card.isShopCheckout
    ? checkoutWords.shopCheckoutCardsFooter
    : checkoutWords.shopCardsFooter
}

/** While the wallet waits on the person: the button that opens its page ("Open Link", "Open Shop", the store's page). */
export function openWalletLabel(card: PurchaseCard): string {
  if (card.wallet === 'link') return checkoutWords.openLink
  return card.isShopCheckout
    ? checkoutWords.openStorePage
    : checkoutWords.openShop
}

/** The wallet's app, for someone without it: none for a Shop checkout (the store's page is the step). */
export function walletApp(
  card: PurchaseCard,
): { label: string; url: string } | undefined {
  if (card.wallet === 'link')
    return { label: checkoutWords.getLinkApp, url: checkoutWords.linkAppURL }
  return card.isShopCheckout
    ? undefined
    : { label: checkoutWords.getShopApp, url: checkoutWords.shopAppURL }
}

/** "Ada wants to place an order at ncvss.com" */
export function checkoutHeadline(agent: string, domain: string): string {
  const who = agent.trim()
  return who === ''
    ? t`Your agent wants to place an order at ${domain}`
    : t`${who} wants to place an order at ${domain}`
}

/** "Ada wants to book a flight with Duffel Airways" */
export function flightHeadline(agent: string, airline: string): string {
  const who = agent.trim()
  if (who === '')
    return airline === ''
      ? t('Your agent wants to book a flight')
      : t`Your agent wants to book a flight with ${airline}`
  return airline === ''
    ? t`${who} wants to book a flight`
    : t`${who} wants to book a flight with ${airline}`
}

/** "Mastercard Debit •••• 1005": the card's name in Link (else its network) and its last four; none when Link gave nothing. */
export function cardLine(
  brand: string | undefined,
  last4: string | undefined,
  name: string | undefined,
): string | undefined {
  const named = present(name?.trim() ?? '')
  // A name that already says the last four ("Visa 1234") is shown as it is.
  if (named != null && last4 != null && named.includes(last4)) return named
  const title = named ?? brand
  if (title != null && last4 != null) return `${title} •••• ${last4}`
  if (title != null) return title
  if (last4 != null) return t`Card •••• ${last4}`
  return undefined
}

/** The card that pays, as one line. */
export function payingLine(card: PurchaseCard): string | undefined {
  return cardLine(card.cardBrand, card.cardLast4, card.cardName)
}

/** One of the person's cards as one line ("Mastercard Debit •••• 1005"). */
export function choiceLine(choice: CardChoice): string {
  return cardLine(choice.brand, choice.last4, choice.name) ?? t('Card')
}

/** The person can answer (Allow, Deny). */
export function waitsOnPerson(card: PurchaseCard): boolean {
  return card.state === 'review'
}

/** The person can switch the card that pays, on the card, before Allow (a flight's card too). */
export function canChooseCard(card: PurchaseCard): boolean {
  return waitsOnPerson(card) && card.cards.length > 1
}

/** No card pays yet: Allow waits for the person to pick one. */
export function needsCard(card: PurchaseCard): boolean {
  return (
    waitsOnPerson(card) &&
    card.cardLast4 == null &&
    card.cardBrand == null &&
    card.cards.length > 1
  )
}

/** A line for the person while the card waits on them (Link refused the card they picked, or none was picked). */
export function reviewNote(card: PurchaseCard): string | undefined {
  return card.state === 'review' ? card.note : undefined
}

/** "Linen shirt ×2, Case": what is bought, for a card without a picture. */
export function itemsLine(card: PurchaseCard): string {
  return card.items
    .map((item) =>
      item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name,
    )
    .join(', ')
}

/** The heading: "Checkout", or "Flight" for a flight. */
export function purchaseHeading(card: PurchaseCard): string {
  return card.flight == null ? checkoutWords.title : checkoutWords.flightTitle
}

/** The bank's check waits on the person, on the computer. */
export function waitsOnBank(card: PurchaseCard): boolean {
  return (
    card.flight != null && card.state === 'approved' && card.step === 'verify'
  )
}

export type StatusKind = 'working' | 'success' | 'danger' | 'neutral'

/** Where it stands, once answered: the line under the card, and whether it went well. */
export function purchaseStatus(
  card: PurchaseCard,
): { label: string; kind: StatusKind } | undefined {
  if (card.flight != null) {
    const flight = flightStatus(card)
    if (flight) return flight
  }
  const link = card.wallet === 'link'
  switch (card.state) {
    case 'review':
      return undefined
    // Link's in short (the founder, 24 October 2026: "no more Asking Link - say In progress … let it be Approve with link").
    case 'sending':
      return {
        label: link
          ? t('In progress')
          : card.isShopCheckout
            ? t('Placing your order with Shop…')
            : t('Asking Shop…'),
        kind: 'working',
      }
    case 'approving':
      return {
        label: link
          ? t('Approve with Link')
          : card.isShopCheckout
            ? t("Finish on the store's page")
            : t('Approve it in the Shop app'),
        kind: 'working',
      }
    case 'approved':
      return { label: t('Approved · placing your order'), kind: 'working' }
    case 'ordered':
      return { label: t('Ordered'), kind: 'success' }
    case 'failed':
      return { label: t("Didn't go through"), kind: 'danger' }
    case 'denied':
      return { label: t('Denied'), kind: 'neutral' }
    case 'expired':
      return { label: t('Expired'), kind: 'neutral' }
    case 'canceled':
      return { label: t('Canceled'), kind: 'neutral' }
  }
}

/** A flight's own words once Link approved (Simeon pays it): paying, the bank's check, booking, booked, not booked. */
function flightStatus(
  card: PurchaseCard,
): { label: string; kind: StatusKind } | undefined {
  switch (card.state) {
    case 'approved':
      switch (card.step) {
        case 'verify':
          return {
            label: t("Your bank wants to confirm it's you"),
            kind: 'working',
          }
        case 'booking':
          return { label: t('Booking with the airline…'), kind: 'working' }
        default:
          return { label: t('Approved · paying the airline'), kind: 'working' }
      }
    case 'ordered':
      return { label: t('Booked'), kind: 'success' }
    case 'failed':
      return card.step === 'uncertain'
        ? { label: t('Not confirmed'), kind: 'neutral' }
        : { label: t('Not booked'), kind: 'danger' }
    default:
      return undefined
  }
}

/** The line under the status: the order's number, Link's words, or how long Link waits. */
export function purchaseDetail(card: PurchaseCard): string | undefined {
  if (card.flight != null) {
    switch (card.state) {
      case 'approved':
        return card.step === 'verify'
          ? t(
              'Open the computer to finish the check; the booking goes on by itself.',
            )
          : undefined
      case 'ordered':
        return [
          card.order != null ? t`Booking reference ${card.order}` : undefined,
          t('The airline emails the ticket.'),
        ]
          .filter((one): one is string => one != null)
          .join(' · ')
      case 'failed':
        return card.note ?? t('Nothing was booked.')
      default:
        break
    }
  }
  switch (card.state) {
    case 'approving':
      // Link's wait says nothing more than its status (the founder, 24 October 2026: "we speak way too much").
      return (
        card.note ??
        (card.wallet === 'link' ? undefined : checkoutWords.shopApprovingDetail)
      )
    case 'ordered': {
      const order = card.order
      const number =
        order != null
          ? t`Order ${order.startsWith('#') ? order : `#${order}`}`
          : undefined
      return present(
        [number, card.note]
          .filter((one): one is string => one != null)
          .join(' · '),
      )
    }
    case 'failed':
      return card.note ?? t('Nothing was paid.')
    case 'denied':
    case 'expired':
    case 'canceled':
      return t('Nothing was paid.')
    default:
      return undefined
  }
}

/** In the chat list and a quote: "Checkout at ncvss.com · $80.00", "Flight Seattle to Los Angeles · $361.20". */
export function purchaseListLine(card: PurchaseCard): string {
  return card.flight != null
    ? t`Flight ${card.flight.route} · ${card.total}`
    : t`Checkout at ${card.domain} · ${card.total}`
}

/** The words under Face ID (or Windows Hello): "Approve $2.47 at gumroad.com" (`PurchaseApproval.reason`). */
export function approvalReason(card: PurchaseCard): string {
  return card.flight != null
    ? t`Approve ${card.total} for the flight ${card.flight.route}`
    : t`Approve ${card.total} at ${card.domain}`
}

// MARK: The products card

export type Star = 'full' | 'half' | 'empty'

export interface Product {
  /** Its place on the card: what Buy sends back. */
  index: number
  title: string
  /** The product's own page on the shop (https). */
  url: string
  /** "gumroad.com" */
  domain: string
  /** "$2.23", as the shop writes it. */
  price?: string
  seller?: string
  imageURL?: string
  /** What it is, in a few sentences; `**bold**` marks the key facts. */
  detail?: string
  /** The price before a sale, struck through after the price: "$119.99". */
  listPrice?: string
  /** Stars out of five: 4.5. */
  rating?: number
  /** How many reviews the stars are from: 153. */
  reviewCount?: number
}

/** A product as the core makes one: no struck price equal to the price, stars only from 0 to 5, a review count only with stars. */
export function product(fields: Product): Product {
  const rating =
    fields.rating != null && fields.rating > 0 && fields.rating <= 5
      ? fields.rating
      : undefined
  return {
    ...fields,
    listPrice:
      fields.listPrice != null && fields.listPrice !== fields.price
        ? fields.listPrice
        : undefined,
    rating,
    reviewCount:
      rating != null && fields.reviewCount != null && fields.reviewCount > 0
        ? fields.reviewCount
        : undefined,
  }
}

export interface ProductsCard {
  products: Product[]
  /** The product the person pressed Buy on, while it is being bought. */
  buying?: number
  /** The products bought from this card. */
  bought: ReadonlySet<number>
}

/** A products card, or none when no product has its name and its own https page. */
export function productsCard(entry: Entry): ProductsCard | undefined {
  const rows = arr(field(entry.message, 'products')) ?? []
  const products = rows.flatMap((row: JSONValue, index): Product[] => {
    const title = trimmed(field(row, 'title'))
    const url = httpsAddress(trimmed(field(row, 'url')))
    if (title === '' || url == null) return []
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      host = ''
    }
    return [
      product({
        index,
        title,
        url,
        domain: present(trimmed(field(row, 'domain'))) ?? host,
        price: present(trimmed(field(row, 'price'))),
        seller: present(trimmed(field(row, 'seller'))),
        imageURL: httpsAddress(trimmed(field(row, 'imageUrl'))),
        detail: present(trimmed(field(row, 'description'))),
        listPrice: present(trimmed(field(row, 'listPrice'))),
        rating: num(field(row, 'rating')),
        reviewCount: int(field(row, 'reviewCount')),
      }),
    ]
  })
  if (products.length === 0) return undefined
  const bought = new Set(
    (arr(entry.get('productsBought')) ?? [])
      .map(int)
      .filter((one): one is number => one != null),
  )
  const buying = int(entry.get('productsBuying'))
  return {
    products,
    bought,
    buying: buying != null && !bought.has(buying) ? buying : undefined,
  }
}

/** The card as the person sees it now: their own Buy shows at once, before the computer echoes it. */
export function shownProducts(
  card: ProductsCard,
  pressed?: number,
): ProductsCard {
  if (
    pressed == null ||
    card.buying === pressed ||
    card.bought.has(pressed) ||
    !card.products.some((one) => one.index === pressed)
  )
    return card
  return { products: card.products, buying: pressed, bought: card.bought }
}

/** "More like this" under an opened product: the card's other products, in the card's order. */
export function otherProducts(card: ProductsCard, of: Product): Product[] {
  return card.products.filter((one) => one.index !== of.index)
}

/** A product's pill on the right of its row: blue while it is being bought, green once it is (as the computer card's ending). */
export type ProductStatus = 'buying' | 'bought'

/** Where one product is: being bought, bought, or neither. */
export function productStatus(
  card: ProductsCard,
  of: Product,
): ProductStatus | undefined {
  if (card.bought.has(of.index)) return 'bought'
  return card.buying === of.index ? 'buying' : undefined
}

export function productStatusLabel(status: ProductStatus): string {
  return status === 'buying' ? t('Buying') : t('Bought')
}

/** "Buy with Ada" */
export function buyLabel(agent: string): string {
  const who = agent.trim()
  return who === '' ? t('Buy') : t`Buy with ${who}`
}

/** The line under the name: the seller, else the shop. */
export function byline(of: Product): string {
  return of.seller ?? of.domain
}

/** "Sold by: Office Depot", over the name. */
export function soldBy(of: Product): string {
  return t`Sold by: ${byline(of)}`
}

/** "4.5" (or "4,5" in French), by the stars (`String(format: "%.1f", locale: L10n.locale(), …)`). */
export function ratingText(of: Product): string | undefined {
  if (of.rating == null) return undefined
  const language = wordsLanguage()
  return new Intl.NumberFormat(
    isEnglish(language) ? `${english}-US` : language,
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      useGrouping: false,
    },
  ).format(of.rating)
}

/** "(153)", after the rating. */
export function reviewsText(of: Product): string | undefined {
  return of.reviewCount != null ? `(${of.reviewCount})` : undefined
}

/** The five stars, to the nearest half: 4.5 is four full and a half. */
export function stars(of: Product): Star[] {
  if (of.rating == null) return []
  const halves = Math.round(of.rating * 2)
  return [0, 1, 2, 3, 4].map((place) =>
    halves >= (place + 1) * 2
      ? 'full'
      : halves === place * 2 + 1
        ? 'half'
        : 'empty',
  )
}

/** The products card's own words (`ProductsCard`'s static words). */
export const productWords = {
  get viewWebsite() {
    return t('View website')
  },
  get seeMore() {
    return t('See more')
  },
  get seeLess() {
    return t('See less')
  },
  get reviews() {
    return t('Reviews')
  },
  get moreLikeThis() {
    return t('More like this')
  },
}

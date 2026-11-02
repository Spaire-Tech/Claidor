// Step 3d (mac/Simeon/Cards.swift): a checkout waiting on the person's
// answer (paid with Link), and products the agent found to buy. Read by
// `src/core/shopCards.ts`.
//
// The web's own choices (docs/web-app/PROGRESS.md, "Decisions"): Allow goes
// without the device's approval, which a browser can't give, so Link asks
// the person in the Link app; Review order and Open the computer, which open
// the agent's computer, wait for the computer's screen (step 5), but for a
// Shop checkout, whose Review order is the store's page; pages open in a new
// tab; the products' pictures come from the shops as the Mac's do, without
// telling them the app's address.

import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { CardKind } from '../core/chat'
import { inlineRuns } from '../core/markdown'
import {
  type CardChoice,
  type CheckoutFlight,
  type Product,
  type ProductStatus,
  type ProductsCard,
  type PurchaseCard,
  type Star,
  type StatusKind,
  airlineInitials,
  airlineLogoBox,
  buyLabel,
  byline,
  canChooseCard,
  cardsFooter,
  checkoutHeadline,
  checkoutWords,
  flightHeadline,
  flightWhenLine,
  itemsLine,
  needsCard,
  openWalletLabel,
  otherProducts,
  payingLine,
  productStatus,
  productStatusLabel,
  productWords,
  productsCard,
  purchaseCard,
  purchaseDetail,
  purchaseHeading,
  purchaseStatus,
  ratingText,
  reviewNote,
  reviewsText,
  shownProducts,
  shownPurchase,
  soldBy,
  stars,
  waitsOnPerson,
  walletApp,
  walletLabel,
} from '../core/shopCards'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { type CardProps, StatusPill, cardWidth } from './Cards'
import { classes } from './classes'
import { Sheet } from './Dialogs'
import './ShopCards.css'

type ShopKind = Extract<CardKind, 'purchase' | 'products'>

/** The card for one of the shop kinds; a card without its facts says its words, as the chat's notice. */
export function shopCardView(kind: ShopKind, card: CardProps): React.ReactNode {
  const props = {
    entryId: card.entryId,
    agentId: card.agentId,
    store: card.store,
  }
  // A line the core can't read is the chat's notice in its own words (ChatPane.tsx's `CardRow`).
  if (kind === 'purchase') {
    const read = purchaseCard(card.entry)
    return read && <PurchaseCardView {...props} card={read} />
  }
  const read = productsCard(card.entry)
  return (
    read && <ProductsCardView {...props} card={read} column={card.column} />
  )
}

/** Opens a page in a new tab (in the Windows app, the default browser). */
function openPage(url: string): void {
  window.open(url, '_blank', 'noopener')
}

/** The Mac's own marks for the wallets (its asset catalogue): Link's, and Shop's. */
const linkMark = new URL(
  '../../../../../mac/Simeon/Assets.xcassets/Brands/link.imageset/link.png',
  import.meta.url,
).href
const shopMark = new URL(
  '../../../../../mac/Simeon/Assets.xcassets/Connectors/shop.imageset/shop.png',
  import.meta.url,
).href

/** A picture's kind for the browser: an SVG is drawn only when named as one. */
function pictureType(url: string): string {
  return /\.svg(?:[?#]|$)/i.test(url) ? 'image/svg+xml' : ''
}

/**
 * A picture on the agent's computer (the checkout as the agent left it,
 * the shop's icon), read as the Mac reads it: a computer that rests is
 * waited for, not woken; at most `limit` bytes. `missing` once it can't be.
 */
function useComputerPicture(
  url: string | undefined,
  agentId: string,
  store: AppStore,
  limit: number,
): { address?: string; missing: boolean } {
  const [read, setRead] = useState<{
    url: string
    address?: string
    missing: boolean
  }>()
  useEffect(() => {
    if (url == null) return
    let live = true
    let made: string | undefined
    void store.readFile(url, agentId, { limit, wakes: false }).then((data) => {
      if (!live) return
      if (!data) {
        setRead({ url, missing: true })
        return
      }
      made = URL.createObjectURL(
        new Blob([data as BlobPart], { type: pictureType(url) }),
      )
      setRead({ url, address: made, missing: false })
    })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [url, agentId, store, limit])
  if (url == null || read?.url !== url) return { missing: false }
  return { address: read.address, missing: read.missing }
}

// MARK: Symbols (SF Symbols the cards wear, drawn at their sizes)

function Cart() {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 1.6c0-.5.4-.9.9-.9h1.6c.8 0 1.4.5 1.6 1.3l.2 1h11.9c.8 0 1.3.7 1.1 1.5l-1.2 5.6c-.2.9-1 1.5-1.9 1.5H7.1l.2 1.2h8.4c.5 0 .9.4.9.9s-.4.9-.9.9H7.2c-.9 0-1.6-.6-1.8-1.5L3.5 2.5H1.9c-.5 0-.9-.4-.9-.9Z"
      />
      <circle cx="7.6" cy="15.8" r="1.5" fill="currentColor" />
      <circle cx="14.6" cy="15.8" r="1.5" fill="currentColor" />
    </svg>
  )
}

function Airplane() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.6 1.4c-.7-.7-1.9-.6-2.7.2l-3 3-7.6-2.2c-.3-.1-.6 0-.8.2l-.6.6c-.3.3-.2.9.2 1.1L8.5 8l-2.7 2.8-2.2-.4c-.2 0-.4 0-.6.2l-.5.5c-.3.3-.2.8.1 1l2.4 1.4 1.4 2.4c.2.4.7.4 1 .1l.5-.5c.2-.2.2-.4.2-.6l-.4-2.2L10 9.5l3.7 6.4c.2.4.8.5 1.1.2l.6-.6c.2-.2.3-.5.2-.8l-2.2-7.6 3-3c.8-.8.9-2 .2-2.7Z"
      />
    </svg>
  )
}

function Photo() {
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="19"
        height="15"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="7" cy="6.5" r="1.7" fill="currentColor" />
      <path
        d="m2.5 14.5 5-4.6 3.4 3 3.8-4.2 4.8 5.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Globe() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r="6.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M1.6 8h12.8M8 1.4c-3.4 3.6-3.4 9.6 0 13.2M8 1.4c3.4 3.6 3.4 9.6 0 13.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  )
}

/** `arrow.up.left.and.arrow.down.right`, small. */
function Expand() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 6.5V2h4.5M2 2l5 5M14 9.5V14H9.5M14 14l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** `chevron.up.chevron.down`, 11 semibold. */
function UpDown() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
      <path
        d="M1 4.3 4 1.3l3 3M1 7.7l3 3 3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CreditCard() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.5 0h11C14.9 0 16 1.1 16 2.5V3H0v-.5C0 1.1 1.1 0 2.5 0ZM0 5h16v4.5c0 1.4-1.1 2.5-2.5 2.5h-11C1.1 12 0 10.9 0 9.5V5Zm2.5 3.2c0 .4.3.8.8.8h2.4c.4 0 .8-.4.8-.8s-.4-.7-.8-.7H3.3c-.5 0-.8.3-.8.7Z"
      />
    </svg>
  )
}

function Tick({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 8.5 6.5 12l6.5-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The status's mark: the blue dot while it works, a filled circle with a tick, a cross or a dash once it ends (15). */
function StatusMark({ kind }: { kind: StatusKind }) {
  if (kind === 'working')
    return (
      <span className="purchase-mark working" aria-hidden="true">
        <span className="dot" />
      </span>
    )
  const inner =
    kind === 'success'
      ? 'M4.6 8.2 7 10.6l4.4-5'
      : kind === 'danger'
        ? 'M5.4 5.4l5.2 5.2M10.6 5.4l-5.2 5.2'
        : 'M4.8 8h6.4'
  return (
    <span className={classes('purchase-mark', kind)} aria-hidden="true">
      <svg width="15" height="15" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7.5" fill="currentColor" />
        <path
          d={inner}
          fill="none"
          stroke="var(--shop-on-mark)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function Bag() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">
      <path
        d="M2.6 6.2h12.8l.9 11c.1.9-.6 1.6-1.5 1.6H3.2c-.9 0-1.6-.7-1.5-1.6l.9-11Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M5.8 8.4V5a3.2 3.2 0 0 1 6.4 0v3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Person() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="4.6" r="3.2" fill="currentColor" />
      <path
        fill="currentColor"
        d="M1.8 14.2c0-2.9 2.8-5 6.2-5s6.2 2.1 6.2 5c0 .7-.5 1.2-1.2 1.2H3c-.7 0-1.2-.5-1.2-1.2Z"
      />
    </svg>
  )
}

// MARK: The checkout card

/**
 * The checkout card (13 October 2026; SimeonCore's `PurchaseCard`), the
 * iPhone's in the Mac's own card (at most 520 wide, padded 16, 20 round, its
 * parts 14 apart): the cart in a 44-point tile, "Checkout" (15, semibold)
 * with a Test pill for Link's test mode, and who wants to order where (13,
 * grey); the check-the-details line while it waits; the checkout as the
 * agent left it (16:10, 12 round, a hairline round it), or what is bought;
 * the Link card that pays with "Link by Stripe" (with several cards, a click
 * picks another), a hairline, and the total (15, semibold, even figures);
 * Deny and Allow at the right, as a Mac's dialog has them. Allowed, it
 * follows the purchase through Link (Get the Link app, Open Link, while Link
 * waits on the person) to the order.
 */
function PurchaseCardView({
  entryId,
  agentId,
  card,
  store,
}: {
  entryId: string
  agentId: string
  card: PurchaseCard
  store: AppStore
}) {
  const shown = shownPurchase(
    card,
    store.answeredPurchases[entryId],
    store.pickedPurchaseCards[entryId],
  )
  const agent = store.agent(agentId)?.name ?? ''
  // A card with Link: the computer keeps watching Link for it (after a restart nothing would); a flight it was paying, it closes.
  const watches =
    card.state === 'approving' ||
    (card.flight != null && card.state === 'approved')
  useEffect(() => {
    if (watches) void store.keepWatchingPurchase(entryId, agentId, card.state)
  }, [watches, store, entryId, agentId, card.state])
  const preview = useComputerPicture(
    card.preview?.url,
    agentId,
    store,
    24 << 20,
  )
  const icon = useComputerPicture(card.icon?.url, agentId, store, 1 << 20)
  // Review order opens the agent's computer on the checkout: on the web, only a Shop checkout's, which is the store's page (the computer's screen comes in step 5).
  const reviewOrder =
    shown.isShopCheckout && shown.url != null
      ? () => openPage(shown.url!)
      : undefined
  const note = reviewNote(shown)
  const line = itemsLine(shown)
  return (
    <div
      className="shop-card purchase-card"
      role="group"
      aria-label={t`${checkoutWords.title} at ${shown.domain}, ${shown.total}`}
    >
      <div className="purchase-head">
        <span className="purchase-tile">
          {shown.flight == null ? <Cart /> : <Airplane />}
        </span>
        <div className="purchase-titles">
          <div className="purchase-heading">
            <span>{purchaseHeading(shown)}</span>
            {shown.isTest && <StatusPill words={t('Test')} />}
          </div>
          <div className="purchase-headline">
            {shown.flight == null
              ? checkoutHeadline(agent, shown.domain)
              : flightHeadline(agent, shown.flight.airline)}
          </div>
        </div>
      </div>
      {waitsOnPerson(shown) && (
        <div className="purchase-check">
          {shown.flight == null
            ? checkoutWords.check
            : checkoutWords.flightCheck}
        </div>
      )}
      {shown.flight != null ? (
        <FlightCheckoutBlock flight={shown.flight} />
      ) : shown.preview != null ? (
        <div
          className="checkout-picture"
          role="group"
          aria-label={t('The checkout page')}
        >
          <div
            className={classes('picture-frame', reviewOrder && 'opens')}
            onClick={reviewOrder}
          >
            {preview.address ? (
              <img src={preview.address} alt="" draggable={false} />
            ) : (
              preview.missing && (
                <span className="picture-missing">
                  <Photo />
                </span>
              )
            )}
          </div>
          {reviewOrder && (
            <ReviewOrderPill icon={icon.address} open={reviewOrder} floats />
          )}
        </div>
      ) : (
        line !== '' && (
          <div className="purchase-items">
            <span className="items-line">{line}</span>
            {reviewOrder && (
              <ReviewOrderPill icon={icon.address} open={reviewOrder} />
            )}
          </div>
        )
      )}
      <div className="purchase-sums">
        <PaymentRow
          shown={shown}
          pick={(id) => store.pickPurchaseCard(entryId, id)}
        />
        {note && <div className="purchase-note">{note}</div>}
        <div className="purchase-rule" />
        <div className="purchase-total">
          <span className="total-label">{checkoutWords.totalLabel}</span>
          <span className="total-sum">{shown.total}</span>
        </div>
      </div>
      <PurchaseFooter
        shown={shown}
        answer={(allow) => void store.answerPurchase(entryId, allow, agentId)}
      />
    </div>
  )
}

/**
 * Review order in glass (28 high), wearing the shop's icon in a white
 * circle (a globe until it comes), with the arrows of a window opening.
 */
function ReviewOrderPill({
  icon,
  open,
  floats = false,
}: {
  icon?: string
  open: () => void
  floats?: boolean
}) {
  return (
    <button
      type="button"
      className={classes('review-order', 'glass', floats && 'floats')}
      title={checkoutWords.openStorePage}
      onClick={open}
    >
      <span className="review-icon">
        {icon ? <img src={icon} alt="" draggable={false} /> : <Globe />}
      </span>
      <span>{checkoutWords.reviewOrder}</span>
      <Expand />
    </button>
  )
}

/** The flight on its checkout card: the airline's mark, the route and times, who flies, and what changed (on white, 12 round, padded 12). */
function FlightCheckoutBlock({ flight }: { flight: CheckoutFlight }) {
  const when = flightWhenLine(flight)
  return (
    <div className="flight-checkout">
      <AirlineMark name={flight.airline} logo={flight.logo} />
      <div className="flight-words">
        <div className="flight-route">{flight.route}</div>
        {when !== '' && <div className="flight-line">{when}</div>}
        {flight.travellers.length > 0 && (
          <div className="flight-line flight-travellers">
            <Person />
            <span>{flight.travellers.join(', ')}</span>
          </div>
        )}
        {flight.changed !== '' && (
          <div className="flight-changed">{flight.changed}</div>
        )}
      </div>
    </div>
  )
}

/** An airline's round mark (36): its logo fitted to the circle, else its initials. */
function AirlineMark({ name, logo }: { name: string; logo: string }) {
  const side = 36
  const usable = logo.startsWith('https://') || logo.startsWith('data:image/')
  const [box, setBox] = useState<{
    logo: string
    width: number
    height: number
  }>()
  const fitted = box?.logo === logo ? box : undefined
  return (
    <span className="airline-mark" aria-hidden="true">
      {usable && (
        <img
          src={logo}
          alt=""
          referrerPolicy="no-referrer"
          draggable={false}
          style={
            fitted
              ? { width: fitted.width, height: fitted.height }
              : { visibility: 'hidden', position: 'absolute' }
          }
          onLoad={(event) => {
            const image = event.currentTarget
            setBox({
              logo,
              ...airlineLogoBox(image.naturalWidth, image.naturalHeight, side),
            })
          }}
        />
      )}
      {!fitted && (
        <span className="airline-initials">{airlineInitials(name)}</span>
      )}
    </span>
  )
}

/**
 * The card that pays (padded 9 above and below): its network's mark, its
 * name in Link and its last four (14, 500; "Choose the card that pays" in
 * blue while none is picked), and "Link by Stripe" with Link's mark under
 * it. With several cards, the row opens the chooser.
 */
function PaymentRow({
  shown,
  pick,
}: {
  shown: PurchaseCard
  pick: (id: string) => void
}) {
  const [choosing, setChoosing] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  const waiting = needsCard(shown)
  const named =
    payingLine(shown) ??
    (waiting
      ? checkoutWords.chooseCard
      : shown.wallet === 'shop'
        ? t('Your Shop card')
        : t('Your Link card'))
  const content = (
    <>
      <PaymentMark brand={waiting ? undefined : shown.cardBrand} />
      <span className="payment-words">
        <MiddleCut
          words={named}
          className={classes('payment-line', waiting && 'choose')}
        />
        <span className="wallet-line">
          <img
            className="wallet-mark"
            src={shown.wallet === 'shop' ? shopMark : linkMark}
            alt=""
            draggable={false}
          />
          <span>{walletLabel(shown)}</span>
        </span>
      </span>
    </>
  )
  if (!canChooseCard(shown)) return <div className="payment-row">{content}</div>
  return (
    <>
      <button
        ref={row}
        type="button"
        className="payment-row chooses"
        title={checkoutWords.chooseCard}
        aria-haspopup="dialog"
        aria-expanded={choosing}
        onClick={() => setChoosing((now) => !now)}
      >
        {content}
        <span className="payment-chevron">
          <UpDown />
        </span>
      </button>
      {choosing && (
        <CardChooser
          anchor={row}
          cards={shown.cards}
          selected={shown.cardId}
          footer={cardsFooter(shown)}
          pick={(choice) => {
            pick(choice.id)
            setChoosing(false)
          }}
          close={() => setChoosing(false)}
        />
      )}
    </>
  )
}

/**
 * One line cut in its middle when it is too long (the Mac's `.middle`
 * truncation): the card's name gives way, its last four ("•••• 1005") stay.
 */
function MiddleCut({ words, className }: { words: string; className: string }) {
  const tail = / •••• \S*$/.exec(words)
  return (
    <span className={classes('middle-cut', className)} title={words}>
      <span className="cut-head">
        {tail ? words.slice(0, tail.index) : words}
      </span>
      {tail && <span className="cut-tail">{tail[0]}</span>}
    </span>
  )
}

/** The card's network on a small white card (40 by 27, 6 round): Visa's word, Mastercard's circles, Amex's blue, Discover's, else a card. */
function PaymentMark({ brand }: { brand?: string }) {
  const name = (brand ?? '').toLowerCase()
  let mark: ReactNode
  switch (name) {
    case 'visa':
      mark = <span className="mark-visa">VISA</span>
      break
    case 'mastercard':
      mark = (
        <span className="mark-mastercard">
          <span className="red" />
          <span className="orange" />
        </span>
      )
      break
    case 'amex':
      mark = <span className="mark-amex">AMEX</span>
      break
    case 'discover':
      mark = (
        <span className="mark-discover">
          DISC
          <span className="disc-dot" />
        </span>
      )
      break
    default:
      mark = (
        <span className="mark-card">
          <CreditCard />
        </span>
      )
  }
  return (
    <span
      className={classes('payment-mark', name === 'amex' && 'amex')}
      aria-hidden="true"
    >
      {mark}
    </span>
  )
}

/**
 * The person's Link cards, to pick the one that pays (14 October 2026), in
 * a popover under the row (300 wide, padded 8): "Pay with", each card with
 * its network's mark, its name in Link and its network and last four, the
 * one that pays now ticked in the blue; Link's line under them. Escape or a
 * click outside closes it.
 */
function CardChooser({
  anchor,
  cards,
  selected,
  footer,
  pick,
  close,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>
  cards: CardChoice[]
  selected?: string
  footer: string
  pick: (choice: CardChoice) => void
  close: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  // A click outside it (the row's own click toggles it), Escape, a scroll elsewhere or the window going to the back closes it.
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    const outside = (event: Event) => {
      const target = event.target as Node
      if (box.current?.contains(target) || anchor.current?.contains(target))
        return
      latest.current()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      latest.current()
      anchor.current?.focus()
    }
    const blur = () => latest.current()
    document.addEventListener('mousedown', outside, true)
    document.addEventListener('wheel', outside, true)
    document.addEventListener('keydown', key, true)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('mousedown', outside, true)
      document.removeEventListener('wheel', outside, true)
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('blur', blur)
    }
  }, [anchor])
  // Under the row, centred on it, kept inside the window (over the row when there is no room under it).
  useLayoutEffect(() => {
    const element = box.current
    const row = anchor.current
    if (!element || !row) return
    const place = () => {
      const rect = row.getBoundingClientRect()
      const width = element.offsetWidth
      const height = element.offsetHeight
      let left = rect.left + rect.width / 2 - width / 2
      left = Math.max(8, Math.min(left, window.innerWidth - 8 - width))
      let top = rect.bottom + 6
      if (top + height > window.innerHeight - 8)
        top = Math.max(8, rect.top - 6 - height)
      element.style.left = `${left}px`
      element.style.top = `${top}px`
      element.style.visibility = 'visible'
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor])
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>('.chooser-card')?.focus()
  }, [])
  return createPortal(
    <div
      ref={box}
      className="card-chooser"
      role="dialog"
      aria-label={checkoutWords.cardsTitle}
    >
      <div className="chooser-title">{checkoutWords.cardsTitle}</div>
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          className="chooser-card"
          aria-pressed={card.id === selected}
          onClick={() => pick(card)}
        >
          <PaymentMark brand={card.brand} />
          <span className="chooser-words">
            <span className="chooser-name">{card.name ?? card.brand}</span>
            <span className="chooser-number">
              {card.last4 === ''
                ? card.brand
                : `${card.brand} •••• ${card.last4}`}
            </span>
          </span>
          {card.id === selected && (
            <span className="chooser-tick">
              <Tick />
            </span>
          )}
        </button>
      ))}
      <div className="chooser-footer">{footer}</div>
    </div>,
    document.body,
  )
}

/** A Mac's pill (21 October 2026): as wide as its words (at least 88), 32 high, 14, 500. */
function Pill({
  title,
  prominent = false,
  disabled,
  onClick,
}: {
  title: string
  prominent?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={classes('shop-pill', prominent && 'prominent')}
      disabled={disabled}
      onClick={onClick}
    >
      {title}
    </button>
  )
}

/**
 * Waiting on the person: Deny and Allow at the right (Allow faded until a
 * card is picked), and Link's test line. Answered: where it stands with its
 * mark, the line under it, and while Link waits on the person, Get the Link
 * app and Open Link.
 */
function PurchaseFooter({
  shown,
  answer,
}: {
  shown: PurchaseCard
  answer: (allow: boolean) => void
}) {
  if (waitsOnPerson(shown)) {
    const waiting = needsCard(shown)
    return (
      <div className="purchase-footer">
        <div className="purchase-buttons">
          <Pill title={checkoutWords.deny} onClick={() => answer(false)} />
          {/* The Mac asks Touch ID first and hands Link that approval; a browser has none to give, so Link asks in its app. */}
          <Pill
            title={checkoutWords.allow}
            prominent
            disabled={waiting}
            onClick={() => answer(true)}
          />
        </div>
        {shown.isTest && (
          <div className="purchase-test">
            {shown.flight == null
              ? checkoutWords.testNote
              : checkoutWords.flightTestNote}
          </div>
        )}
      </div>
    )
  }
  const status = purchaseStatus(shown)
  if (!status) return null
  const detail = purchaseDetail(shown)
  const app = walletApp(shown)
  const action = shown.actionURL
  return (
    <div className="purchase-status-block">
      <div className="purchase-status" role="status">
        <StatusMark kind={status.kind} />
        <div className="status-words">
          <div className="status-label">{status.label}</div>
          {detail && <div className="status-detail">{detail}</div>}
        </div>
      </div>
      {shown.state === 'approving' && (app || action) && (
        <div className="purchase-buttons">
          {app && (
            <Pill
              title={app.label}
              prominent={action == null}
              onClick={() => openPage(app.url)}
            />
          )}
          {action && (
            <Pill
              title={openWalletLabel(shown)}
              prominent
              onClick={() => openPage(action)}
            />
          )}
        </div>
      )}
      {/* The bank's check (`waitsOnBank`): the Mac's Open the computer comes with the computer's screen, step 5. */}
    </div>
  )
}

// MARK: The products card

/** A tile's square picture, the tile padded 8, and the grid's 4 between and 8 round it. */
const tileSide = 168
const tilesAcross = (count: number) => Math.min(3, Math.max(1, count))
/** The tiles' width: three to a line (`Grid` padded 8, its tiles 4 apart, each padded 8). */
function tilesWidth(count: number): number {
  const across = tilesAcross(count)
  return across * (tileSide + 16) + (across - 1) * 4 + 16
}

/**
 * The products card (14 October 2026; SimeonCore's `ProductsCard`): each
 * product's picture, name, seller and price; a click opens it, with "Buy
 * with <agent>" and "View website". On a Mac's chat the products stand side
 * by side as a shop shows them, three to a line, each a square picture over
 * its name, seller and price, Buying or Bought at the right of the price; a
 * chat too narrow for them has the iPhone's rows (`ViewThatFits`).
 */
function ProductsCardView({
  entryId,
  agentId,
  card,
  store,
  column,
}: {
  entryId: string
  agentId: string
  card: ProductsCard
  store: AppStore
  column: number
}) {
  const [open, setOpen] = useState<number>()
  const shown = shownProducts(card, store.pressedProducts[entryId])
  const tiles = tilesWidth(shown.products.length) <= cardWidth(column, 640)
  const opened = shown.products.find((one) => one.index === open)
  return (
    <>
      {tiles ? (
        <div className="shop-card products-card tiles">
          <div
            className="product-grid"
            style={{
              gridTemplateColumns: `repeat(${tilesAcross(shown.products.length)}, auto)`,
            }}
          >
            {shown.products.map((one) => (
              <ProductTile
                key={one.index}
                product={one}
                status={productStatus(shown, one)}
                open={() => setOpen(one.index)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="shop-card products-card rows">
          {shown.products.map((one, index) => (
            <ProductRow
              key={one.index}
              product={one}
              status={productStatus(shown, one)}
              last={index === shown.products.length - 1}
              open={() => setOpen(one.index)}
            />
          ))}
        </div>
      )}
      {opened &&
        createPortal(
          <ProductSheet
            card={shown}
            current={opened}
            agentName={store.agent(agentId)?.name ?? ''}
            show={(other) => setOpen(other.index)}
            buy={(chosen) => {
              setOpen(undefined)
              void store.buyProduct(entryId, chosen.index, agentId)
            }}
            close={() => setOpen(undefined)}
          />,
          document.body,
        )}
    </>
  )
}

/** Buying (the link's blue) or Bought (the green), in their own wash, the dot their colour. */
function ProductPill({
  status,
  large = false,
}: {
  status: ProductStatus
  large?: boolean
}) {
  return (
    <span
      className={classes(
        'status-pill',
        'product-pill',
        status,
        large && 'large',
      )}
      role="status"
    >
      <span className="status-dot" />
      {productStatusLabel(status)}
    </span>
  )
}

/** A price, and the price before the sale struck through after it in grey. */
function Price({ product }: { product: Product }) {
  return (
    <span className="product-price">
      <span>{product.price}</span>
      {product.listPrice && <s>{product.listPrice}</s>}
    </span>
  )
}

/** A product's own picture from its shop; a bag while it loads or when the shop gave none (filling its square, or fitted in it). */
function ProductPicture({
  url,
  fit = false,
  className,
}: {
  url?: string
  fit?: boolean
  className: string
}) {
  const [loaded, setLoaded] = useState<string>()
  return (
    <span
      className={classes('product-picture', fit && 'fit', className)}
      aria-hidden="true"
    >
      {(url == null || loaded !== url) && <Bag />}
      {url && (
        // The shop's own picture, fetched from it as the Mac does; it is not told the app's address.
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          className={loaded === url ? 'loaded' : undefined}
          onLoad={() => setLoaded(url)}
          onError={() => setLoaded(undefined)}
        />
      )}
    </span>
  )
}

/** A product side by side with the others: its square picture (168, 12 round), its name on two lines (13, 500), the seller (12, grey), the price and, at its right, Buying or Bought. */
function ProductTile({
  product,
  status,
  open,
}: {
  product: Product
  status?: ProductStatus
  open: () => void
}) {
  return (
    <button type="button" className="product-tile" onClick={open}>
      <ProductPicture url={product.imageURL} className="tile-picture" />
      <span className="tile-words">
        <span className="tile-title">{product.title}</span>
        <span className="tile-byline">{byline(product)}</span>
        <span className="tile-foot">
          {product.price && <Price product={product} />}
          {status && <ProductPill status={status} />}
        </span>
      </span>
    </button>
  )
}

/** The iPhone's rows, for a narrow chat: the picture (72, 10 round), the name on two lines (14, semibold), the seller, the price and its pill. */
function ProductRow({
  product,
  status,
  last,
  open,
}: {
  product: Product
  status?: ProductStatus
  last: boolean
  open: () => void
}) {
  return (
    <>
      <button type="button" className="product-row" onClick={open}>
        <ProductPicture url={product.imageURL} className="row-picture" />
        <span className="row-words">
          <span className="row-title">{product.title}</span>
          <span className="row-byline">{byline(product)}</span>
          <span className="row-foot">
            {product.price && (
              <span className="row-price">{product.price}</span>
            )}
            {status && <ProductPill status={status} large />}
          </span>
        </span>
      </button>
      {!last && <div className="product-rule" />}
    </>
  )
}

/**
 * One product, opened, as a store's page (780 by 600): its picture at the
 * left (340, fitted, 16 round) and at its right "Sold by", its name (22),
 * its price (16), "Buy with <agent>" in the blue capsule (38 high) and View
 * website, what it is in three lines with See more, its stars under
 * Reviews; under them the card's other products under More like this, each
 * opening in place. Return buys; Escape, a click outside or the X closes it.
 */
function ProductSheet({
  card,
  current,
  agentName,
  show,
  buy,
  close,
}: {
  card: ProductsCard
  current: Product
  agentName: string
  show: (product: Product) => void
  buy: (product: Product) => void
  close: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const status = productStatus(card, current)
  const others = otherProducts(card, current)
  const rating = stars(current)
  // Another product opened in place: back to the top.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [current.index])
  // Return presses Buy, as a Mac's default button.
  const latest = useRef({ status, buy, current })
  useEffect(() => {
    latest.current = { status, buy, current }
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter' ||
        event.isComposing ||
        event.shiftKey ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey
      )
        return
      event.preventDefault()
      const now = latest.current
      if (now.status == null) now.buy(now.current)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <Sheet label={current.title} close={close} className="product-sheet">
      <div ref={scroller} className="product-scroll">
        <div className="product-top">
          <ProductPicture
            url={current.imageURL}
            fit
            className="sheet-picture"
          />
          <div className="product-facts">
            <div className="product-sold-by">{soldBy(current)}</div>
            <div className="product-title">{current.title}</div>
            {current.price && (
              <div className="product-sheet-price">
                <Price product={current} />
              </div>
            )}
            <button
              type="button"
              className={classes('buy-button', status)}
              disabled={status != null}
              onClick={() => buy(current)}
            >
              {status ? productStatusLabel(status) : buyLabel(agentName)}
            </button>
            <button
              type="button"
              className="view-website"
              onClick={() => openPage(current.url)}
            >
              {productWords.viewWebsite}
            </button>
            {current.detail && (
              <Description key={current.index} words={current.detail} />
            )}
            {rating.length > 0 && (
              <>
                <div className="product-heading reviews">
                  {productWords.reviews}
                </div>
                <button
                  type="button"
                  className="reviews-row"
                  title={t("Opens the reviews on the shop's page")}
                  onClick={() => openPage(current.url)}
                >
                  <ProductPicture
                    url={current.imageURL}
                    fit
                    className="reviews-picture"
                  />
                  <span className="reviews-words">
                    <span className="reviews-title">{current.title}</span>
                    <Stars product={current} rating={rating} />
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
        {others.length > 0 && (
          <>
            <div className="product-heading more">
              {productWords.moreLikeThis}
            </div>
            <div className="more-like-this">
              {others.map((other) => (
                <button
                  key={other.index}
                  type="button"
                  className="more-tile"
                  onClick={() => show(other)}
                >
                  <ProductPicture
                    url={other.imageURL}
                    fit
                    className="more-picture"
                  />
                  <span className="more-title">{other.title}</span>
                  <span className="more-byline">{byline(other)}</span>
                  {other.price && <Price product={other} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        className="sheet-close glass-disc"
        title={t('Close')}
        aria-label={t('Close')}
        onClick={close}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M3.5 3.5l9 9M12.5 3.5l-9 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </Sheet>
  )
}

/** Five stars to the nearest half (12, Apple's orange), then "4.5" and "(153)". */
function Stars({ product, rating }: { product: Product; rating: Star[] }) {
  const shownRating = ratingText(product)
  const reviews = reviewsText(product)
  return (
    <span className="product-stars">
      <span className="stars">
        {rating.map((star, index) => (
          <StarMark key={index} star={star} />
        ))}
      </span>
      {shownRating && <span className="stars-rating">{shownRating}</span>}
      {reviews && <span className="stars-count">{reviews}</span>}
    </span>
  )
}

const starPath =
  'M8 1.2l1.9 4.1 4.5.5-3.4 3.1.9 4.4L8 11.1l-3.9 2.2.9-4.4L1.6 5.8l4.5-.5L8 1.2Z'

function StarMark({ star }: { star: Star }) {
  // An id fit for `url(#…)`, whatever React's own looks like.
  const lead = `star-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      {star === 'half' && (
        <clipPath id={lead}>
          <rect x="0" y="0" width="8" height="16" />
        </clipPath>
      )}
      <path
        d={starPath}
        fill={star === 'full' ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {star === 'half' && (
        <path d={starPath} fill="currentColor" clipPath={`url(#${lead})`} />
      )}
    </svg>
  )
}

/** What the product is, in three lines with See more when there is more; `**bold**` drawn bold. */
function Description({ words }: { words: string }) {
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = box.current
    if (!element || open) return
    const measure = () =>
      setMore(element.scrollHeight > element.clientHeight + 1)
    measure()
    const watcher = new ResizeObserver(measure)
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [words, open])
  return (
    <div className="product-description">
      <div
        ref={box}
        className={classes('description-words', !open && 'folded')}
      >
        {words.split('\n').map((line, number) => (
          <span key={number}>
            {number > 0 && '\n'}
            {inlineRuns(line).map((run, index) => {
              let node: ReactNode = run.text
              if (run.code) node = <code>{node}</code>
              if (run.bold) node = <strong>{node}</strong>
              if (run.italic) node = <em>{node}</em>
              if (run.struck) node = <s>{node}</s>
              if (run.link)
                node = (
                  <a href={run.link} target="_blank" rel="noopener noreferrer">
                    {node}
                  </a>
                )
              return <span key={index}>{node}</span>
            })}
          </span>
        ))}
      </div>
      {(open || more) && (
        <button
          type="button"
          className="see-more"
          onClick={() => setOpen((now) => !now)}
        >
          {open ? productWords.seeLess : productWords.seeMore}
        </button>
      )}
    </div>
  )
}

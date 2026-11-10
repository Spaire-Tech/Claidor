// Step 3d (mac/Simeon/Cards.swift): a checkout waiting on the person's
// answer (paid with Link), and products the agent found to buy. Read by
// `src/core/shopCards.ts`.
//
// The web's own choices (docs/web-app/PROGRESS.md, "Decisions"): Allow asks
// first in the window's own alert, with the Mac's Touch ID words, and goes
// without the device's approval, which a browser can't give, so Link asks
// the person in the Link app (a Shop checkout is paid at once: the alert is
// the only ask). In the Windows app Windows Hello asks first, and its yes
// is the approval Allow carries, as the Mac's Touch ID (presence.ts); where
// Hello can't ask, the alert, as on the web. Review order, the checkout's picture and Open the computer
// open the agent's computer over the window (step 5b), but for a Shop
// checkout, whose Review order is the store's page; pages open in a new
// tab; the products' pictures come from the shops as the Mac's do, without
// telling them the app's address.

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { CardKind } from '../core/chat'
import { type BookedFlight, whenLine } from '../core/flightCards'
import { siteOf } from '../core/linkIcons'
import {
  type CardChoice,
  type Product,
  type ProductStatus,
  type ProductsCard,
  type PurchaseCard,
  type StatusKind,
  approvalReason,
  buyLabel,
  byline,
  canChooseCard,
  cardsFooter,
  checkoutHeadline,
  checkoutWords,
  flightHeadline,
  itemsLine,
  needsCard,
  neighbourProduct,
  openWalletLabel,
  payingLine,
  priceLine,
  productRepliesOpen,
  productStatus,
  productStatusLabel,
  productWords,
  productsCard,
  purchaseCard,
  purchaseDetail,
  purchaseHeading,
  purchaseStatus,
  ratingLine,
  reviewNote,
  shownProducts,
  shownPurchase,
  shownTake,
  storeName,
  viewAt,
  waitsOnBank,
  waitsOnPerson,
  walletApp,
  walletLabel,
} from '../core/shopCards'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { useCoverKeys } from './Call'
import { type CardProps, StatusPill } from './Cards'
import { classes } from './classes'
import { openComputerView } from './ComputerView'
import { Alert } from './Dialogs'
import { AirlineMark } from './FlightCards'
import { confirmPresence } from './presence'
import { SiteIconTile } from './SettingsCredentials'
import './ShopCards.css'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

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
  return read && <ProductsCardView {...props} card={read} />
}

/** Opens a page in a new tab (in the Windows app, the default browser). */
function openPage(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
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
  // Allow's question open (the window's alert in place of the Mac's Touch ID).
  const [confirming, setConfirming] = useState(false)
  // Windows Hello asking (the Windows app): one ask at a time.
  const helloAsking = useRef(false)
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
  const model = useWindowModel()
  /** Review order: the agent's computer, on the checkout; for a Shop checkout, the store's page, since Shop holds the checkout and nothing is open on the computer. */
  const shopPage = shown.isShopCheckout ? shown.url : undefined
  const reviewOrder = () =>
    shopPage != null
      ? openPage(shopPage)
      : openComputerView(model, store, agentId)
  const icon = useComputerPicture(card.icon?.url, agentId, store, 1 << 20)
  // A picture that came but can't be drawn shows the photo symbol, as one that never came.
  const [brokenPreview, setBrokenPreview] = useState<string>()
  const previewDrawn =
    preview.address != null && preview.address !== brokenPreview
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
          <div className="picture-frame opens" onClick={reviewOrder}>
            {previewDrawn ? (
              <img
                src={preview.address}
                alt=""
                draggable={false}
                onError={() => setBrokenPreview(preview.address)}
              />
            ) : (
              (preview.missing || preview.address != null) && (
                <span className="picture-missing">
                  <Photo />
                </span>
              )
            )}
          </div>
          <ReviewOrderPill
            icon={icon.address}
            open={reviewOrder}
            shopPage={shopPage != null}
            floats
          />
        </div>
      ) : (
        line !== '' && (
          <div className="purchase-items">
            <span className="items-line">{line}</span>
            <ReviewOrderPill
              icon={icon.address}
              open={reviewOrder}
              shopPage={shopPage != null}
            />
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
        openComputer={() => openComputerView(model, store, agentId)}
        answer={(allow) => {
          // Deny goes at once.
          if (!allow) {
            void store.answerPurchase(entryId, false, agentId)
            return
          }
          // Allow asks first, as the Mac asks for Touch ID (`PurchaseApproval.confirm`): Windows Hello, whose yes Link is handed (no method, as the Mac's passcode); else the window's alert.
          if (helloAsking.current) return
          helloAsking.current = true
          void confirmPresence(approvalReason(shown))
            .then((said) => {
              if (said === 'confirmed')
                void store.answerPurchase(entryId, true, agentId, {})
              else if (said === 'alert') setConfirming(true)
            })
            .finally(() => {
              helloAsking.current = false
            })
        }}
      />
      {/* Only while the card waits: a checkout answered meanwhile (here or on the Mac) asks nothing. */}
      {confirming &&
        waitsOnPerson(shown) &&
        createPortal(
          <Alert
            title={approvalReason(shown)}
            message={itemsLine(shown)}
            action={checkoutWords.allow}
            onAction={() => {
              setConfirming(false)
              // A saved card has no app to approve in: the person's yes here is the approval (Link asks in its own app).
              void store.answerPurchase(
                entryId,
                true,
                agentId,
                shown.wallet === 'card' ? {} : undefined,
              )
            }}
            onCancel={() => setConfirming(false)}
          />,
          document.body,
        )}
    </div>
  )
}

/**
 * Review order in glass (28 high), wearing the shop's icon in a white
 * circle (a globe until it comes), with the arrows of a window opening:
 * the agent's computer on the checkout, or a Shop checkout's store page.
 */
function ReviewOrderPill({
  icon,
  open,
  shopPage,
  floats = false,
}: {
  icon?: string
  open: () => void
  shopPage: boolean
  floats?: boolean
}) {
  return (
    <button
      type="button"
      className={classes('review-order', 'glass', floats && 'floats')}
      title={
        shopPage
          ? checkoutWords.openStorePage
          : t('Open the computer on the checkout')
      }
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
function FlightCheckoutBlock({ flight }: { flight: BookedFlight }) {
  const when = whenLine(flight)
  return (
    <div className="flight-checkout">
      <AirlineMark name={flight.airline} logo={flight.logo} side={36} />
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
          <div className="checkout-changed">{flight.changed}</div>
        )}
      </div>
    </div>
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
        : shown.wallet === 'card'
          ? t('Your card')
          : t('Your Link card'))
  const content = (
    <>
      <PaymentMark brand={waiting ? undefined : shown.cardBrand} />
      <span className="payment-words">
        <MiddleCut
          words={named}
          className={classes('payment-line', waiting && 'choose')}
        />
        <span className="payment-wallet">
          {shown.wallet !== 'card' && (
            <img
              className="payment-wallet-mark"
              src={shown.wallet === 'shop' ? shopMark : linkMark}
              alt=""
              draggable={false}
            />
          )}
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
export function PaymentMark({ brand }: { brand?: string }) {
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
  // The card that pays now takes the focus (the first when none is ticked).
  useEffect(() => {
    const element = box.current
    if (!element) return
    ;(
      element.querySelector<HTMLButtonElement>(
        '.chooser-card[aria-pressed="true"]',
      ) ?? element.querySelector<HTMLButtonElement>('.chooser-card')
    )?.focus()
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
 * mark, the line under it, while Link waits on the person Get the Link app
 * and Open Link, and while the bank checks it's the person Open the
 * computer.
 */
function PurchaseFooter({
  shown,
  answer,
  openComputer,
}: {
  shown: PurchaseCard
  answer: (allow: boolean) => void
  /** The bank's check: the agent's computer over the window (step 5b). */
  openComputer: () => void
}) {
  if (waitsOnPerson(shown)) {
    const waiting = needsCard(shown)
    return (
      <div className="purchase-footer">
        <div className="purchase-buttons">
          <Pill title={checkoutWords.deny} onClick={() => answer(false)} />
          {/* The Mac asks Touch ID first and hands Link that approval; the web asks in its alert (the card's own), and with no approval to give, Link asks in its app. */}
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
      {/* The bank's check, on the agent's computer (`waitsOnBank`). */}
      {waitsOnBank(shown) && (
        <div className="purchase-buttons">
          <Pill
            title={checkoutWords.openComputer}
            prominent
            onClick={openComputer}
          />
        </div>
      )}
    </div>
  )
}

// MARK: The products card

/**
 * The products card (14 October 2026; SimeonCore's `ProductsCard`), as a
 * shop's own cards (10 November 2026, after the founder's reference): no
 * frame round them, each product a card of its own, 200 wide and 20 round,
 * side by side in one row that scrolls sideways when they don't fit. On
 * each, the picture on white (200 by 240, fitted, padded 16) with the badge
 * at its top left, then on the card's colour the name (15, 600, one line),
 * "price · take" in grey (two lines at most) and, at the bottom, the store's
 * icon (16, rounded) and its name in grey, Buying or Bought at its right.
 * Under the row, the agent's replies as chips (36 high, the card's colour)
 * until the person sends anything after the card; one pressed is sent as
 * their message. A click opens the product over the chat (`ProductPage`).
 */
function ProductsCardView({
  entryId,
  agentId,
  card,
  store,
}: {
  entryId: string
  agentId: string
  card: ProductsCard
  store: AppStore
}) {
  const model = useWindowModel()
  const shown = shownProducts(card, store.pressedProducts[entryId])
  // The replies go once the person sends anything after the card (the core's `settlingReplies`).
  const replies = productRepliesOpen(store.rows(agentId), entryId)
    ? shown.replies
    : []
  return (
    <div className="products-card">
      <div className="product-cards" role="list">
        {shown.products.map((one) => (
          <ProductCard
            key={one.index}
            product={one}
            status={productStatus(shown, one)}
            open={() =>
              model.coverChat({
                kind: 'product',
                agentId,
                entryId,
                index: one.index,
              })
            }
          />
        ))}
      </div>
      {replies.length > 0 && (
        <div className="product-replies">
          {replies.map((reply) => (
            <button
              key={reply}
              type="button"
              className="product-reply"
              disabled={store.isSendingPaused}
              onClick={() => void store.send(reply, agentId)}
            >
              {reply}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Buying (the link's blue) or Bought (the green), in their own wash, the dot their colour. */
function ProductPill({ status }: { status: ProductStatus }) {
  return (
    <span
      className={classes('status-pill', 'product-pill', status)}
      role="status"
    >
      <span className="status-dot" />
      {productStatusLabel(status)}
    </span>
  )
}

/** A product's own picture from its shop, fitted on white; a bag while it loads or when the shop gave none. */
function ProductPicture({
  url,
  className,
}: {
  url?: string
  className: string
}) {
  const [loaded, setLoaded] = useState<string>()
  return (
    <span className={classes('product-picture', className)} aria-hidden="true">
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

/** The store's icon (its site's own, as a saved login's) and its name in grey. */
function StoreLine({
  product,
  side,
  children,
}: {
  product: Product
  side: number
  children?: ReactNode
}) {
  return (
    <span className="product-store">
      <SiteIconTile
        site={siteOf(product.url)}
        title={storeName(product)}
        contact={false}
        side={side}
      />
      <span className="product-store-name">{storeName(product)}</span>
      {children}
    </span>
  )
}

/** One product in the row: the picture on white with its badge, its name, "price · take" and its store. */
function ProductCard({
  product,
  status,
  open,
}: {
  product: Product
  status?: ProductStatus
  open: () => void
}) {
  const line = priceLine(product)
  return (
    <button
      type="button"
      className="product-card"
      role="listitem"
      onClick={open}
    >
      <span className="product-card-picture">
        <ProductPicture url={product.imageURL} className="card-picture" />
        {product.badge && (
          <span className="product-badge">{product.badge}</span>
        )}
      </span>
      <span className="product-card-words">
        <span className="product-card-title">{product.title}</span>
        <span className="product-card-line">{line}</span>
        <StoreLine product={product} side={16}>
          {status && <ProductPill status={status} />}
        </StoreLine>
      </span>
    </button>
  )
}

/**
 * The product opened over the chat (`chatCover` of kind `product`), when it
 * is this chat's: the products card's own page, its card read afresh.
 */
export function ProductCover({
  store,
  agentId,
}: {
  store: AppStore
  agentId: string
}): ReactNode {
  const model = useWindowModel()
  useWatched(model)
  useWatched(store)
  const cover = model.chatCover
  if (cover?.kind !== 'product' || cover.agentId !== agentId) return null
  const entry = (store.transcripts[agentId] ?? []).find(
    (line) => line.id === cover.entryId,
  )
  const read = entry && productsCard(entry)
  const card = read && shownProducts(read, store.pressedProducts[cover.entryId])
  const current = card?.products.find((one) => one.index === cover.index)
  if (!card || !current) return null
  return (
    <ProductPage
      card={card}
      current={current}
      agentName={store.agent(agentId)?.name ?? ''}
      show={(other) => model.coverChat({ ...cover, index: other.index })}
      buy={(chosen) => {
        model.coverChat(undefined)
        void store.buyProduct(cover.entryId, chosen.index, agentId)
      }}
      close={() => model.coverChat(undefined)}
    />
  )
}

/**
 * One product opened, over the whole chat (not a sheet: the sidebar stays),
 * after the founder's reference: the X (our glass disc) at the top left, ‹
 * and › at the top right for the card's other products. Two columns, 32
 * apart, at most 880 wide: at the left the picture on a white square (16
 * round), and under it "Why it fits" (17, 600) with each reason after a
 * round green check; at the right the store's icon and name (15, grey), the
 * title (28, 600), the price (20) and "★ 5.0 (12)" (15, grey), the take
 * (15, grey), "Buy with <agent>" in our blue capsule (38 high, full width),
 * "View at <store>" as plain words, a hairline, and "Sold by" with the
 * seller at its right. One column in a narrow chat, the reasons last.
 * Escape or the X closes it; ← and → step as ‹ and ›; Return on the page
 * itself buys, as the sheet's did.
 */
function ProductPage({
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
  useCoverKeys(close, false)
  const status = productStatus(card, current)
  const previous = neighbourProduct(card, current, -1)
  const next = neighbourProduct(card, current, 1)
  const take = shownTake(current)
  const rating = ratingLine(current)
  const scroller = useRef<HTMLDivElement>(null)
  // Another product: back to the top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [current.index])
  // ← and → step, and Return buys, from the page itself: not from a button, a link or a field (which take their own keys).
  const latest = useRef({ status, buy, current, previous, next, show })
  useEffect(() => {
    latest.current = { status, buy, current, previous, next, show }
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.shiftKey ||
        event.altKey ||
        event.metaKey ||
        event.ctrlKey
      )
        return
      const target = event.target instanceof Element ? event.target : null
      if (!target?.closest('.product-page')) return
      const now = latest.current
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (target.closest('input, textarea, select, [contenteditable="true"]'))
          return
        const to = event.key === 'ArrowLeft' ? now.previous : now.next
        event.preventDefault()
        if (to) now.show(to)
        return
      }
      if (event.key !== 'Enter') return
      if (
        target.closest(
          'button, a[href], input, textarea, select, [contenteditable="true"]',
        )
      )
        return
      event.preventDefault()
      if (now.status == null) now.buy(now.current)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <div
      className="chat-cover product-page"
      role="dialog"
      aria-label={current.title}
      tabIndex={-1}
    >
      <div ref={scroller} className="product-page-scroll">
        <div className="product-page-columns">
          <ProductPicture url={current.imageURL} className="page-picture" />
          <div className="product-page-facts">
            <StoreLine product={current} side={18} />
            <h2 className="product-page-title">{current.title}</h2>
            {(current.price || rating) && (
              <div className="product-page-price">
                {current.price && (
                  <span className="product-price">
                    <span>{current.price}</span>
                    {current.listPrice && <s>{current.listPrice}</s>}
                  </span>
                )}
                {rating && <span className="product-rating">{rating}</span>}
              </div>
            )}
            {take && <p className="product-page-take">{take}</p>}
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
              className="view-at"
              onClick={() => openPage(current.url)}
            >
              {viewAt(current)}
            </button>
            <div className="product-page-rule" />
            <div className="product-sold-by">
              <span className="sold-by-label">{productWords.soldBy}</span>
              <span className="sold-by-seller">{byline(current)}</span>
            </div>
          </div>
          {current.reasons.length > 0 && (
            <div className="product-why">
              <h3 className="product-why-heading">{productWords.whyItFits}</h3>
              <ul className="product-reasons">
                {current.reasons.map((reason, index) => (
                  <li key={index}>
                    <CheckCircle />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        className="product-page-close glass-disc"
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
      <div className="product-page-steps">
        <button
          type="button"
          className="glass-disc"
          title={t('Previous product')}
          aria-label={t('Previous product')}
          disabled={previous == null}
          onClick={() => previous && show(previous)}
        >
          <Chevron left />
        </button>
        <button
          type="button"
          className="glass-disc"
          title={t('Next product')}
          aria-label={t('Next product')}
          disabled={next == null}
          onClick={() => next && show(next)}
        >
          <Chevron />
        </button>
      </div>
    </div>
  )
}

/** ‹ or › (SF Symbols' chevron, 13). */
function Chevron({ left = false }: { left?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={left ? 'M10.5 2.5 5 8l5.5 5.5' : 'M5.5 2.5 11 8l-5.5 5.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A reason's mark: a check in a circle, in the green (`checkmark.circle`, 16). */
function CheckCircle() {
  return (
    <svg
      className="reason-check"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5.2 8.2l1.9 1.9 3.8-4.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

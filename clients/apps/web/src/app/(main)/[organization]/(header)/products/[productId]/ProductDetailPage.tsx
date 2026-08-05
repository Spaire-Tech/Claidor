'use client'

import {
  DETAIL_KEYS,
  DETAIL_OPTION_MAP,
} from '@/components/Products/ProductForm/ProductAdditionalDetailsSection'
import { useStorefrontSubscribe } from '@/hooks/queries/emailMarketing'
import { CONFIG } from '@/utils/config'
import { SUBTITLE_METADATA_KEY } from '@/utils/product'
import { api } from '@/utils/client'
import { schemas } from '@spaire/client'
import { formatCurrency } from '@spaire/currency'
import { Poppins } from 'next/font/google'
import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'

// The design is built on Poppins throughout (monochrome, Apple-like).
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
})

// A storefront product, plus the new free-form `subtitle` tagline. The
// generated client type already carries `metadata`, where the byline lives.
type StorefrontProduct = schemas['ProductStorefront']

// The product byline ("A baking book by …") is stored under a reserved
// metadata key — no dedicated DB column, so it needs no migration.
function productSubtitle(
  product: schemas['ProductStorefront'],
): string | undefined {
  const v = product.metadata?.[SUBTITLE_METADATA_KEY]
  return typeof v === 'string' && v.trim() ? v : undefined
}

const CATEGORY_LABELS: Record<string, string> = {
  ebook: 'eBook',
  template: 'Template',
  assets: 'Assets',
  course: 'Course',
  guide: 'Guide',
  music: 'Music',
  video: 'Video',
  photo: 'Photo',
  software: 'Software',
  coaching: 'Coaching',
  membership: 'Membership',
  other: 'Other',
}

/* ---------------- Price ---------------- */
// Resolves the headline price into { code, amount, note }. `amount` already
// includes the currency symbol (formatCurrency disambiguates e.g. CA$).
function priceParts(product: schemas['ProductStorefront']): {
  code: string | null
  amount: string
  note: string
} {
  const price =
    product.prices.find(({ amount_type }) =>
      ['fixed', 'custom', 'free', 'seat_based'].includes(amount_type),
    ) ?? product.prices[0]

  const note = product.is_recurring
    ? product.recurring_interval
      ? `Billed per ${product.recurring_interval}`
      : 'Subscription'
    : 'One-time purchase'

  if (!price) return { code: null, amount: 'Free', note }

  if (price.amount_type === 'fixed') {
    return {
      code: price.price_currency.toUpperCase(),
      amount: formatCurrency('accounting')(
        price.price_amount,
        price.price_currency,
      ),
      note,
    }
  }
  if (price.amount_type === 'seat_based') {
    const tiers = price.seat_tiers.tiers
    if (tiers.length > 0) {
      return {
        code: price.price_currency.toUpperCase(),
        amount: formatCurrency('accounting')(
          tiers[0].price_per_seat,
          price.price_currency,
        ),
        note: tiers.length > 1 ? 'From · per seat' : 'Per seat',
      }
    }
  }
  if (price.amount_type === 'custom') {
    return { code: null, amount: 'Pay what you want', note }
  }
  return { code: null, amount: 'Free', note }
}

// One-line price label used by "More from" cards and the sticky bar.
function priceLabel(product: schemas['ProductStorefront']): string {
  const { code, amount } = priceParts(product)
  return code ? `${code} ${amount}` : amount
}

/* ---------------- Icons (1.6 stroke, currentColor) ---------------- */
type IcoProps = { style?: CSSProperties; width?: number; height?: number }
const Ico = {
  chevL: (p: IcoProps) => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevR: (p: IcoProps) => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrowBack: (p: IcoProps) => (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bag: (p: IcoProps) => (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M6 8h12l-1 11.5a1.5 1.5 0 01-1.5 1.4H8.5A1.5 1.5 0 017 19.5L6 8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 8.5V7a3 3 0 016 0v1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  download: (p: IcoProps) => (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  heart: (p: IcoProps) => (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 2.6 5.3 5.8 5.3c2 0 3.3 1.2 4.2 2.4.9-1.2 2.2-2.4 4.2-2.4 3.2 0 4.5 3.2 3 6.1C19 15.6 12 20 12 20z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  check: (p: IcoProps) => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M5 12.5l4.2 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lock: (p: IcoProps) => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  bolt: (p: IcoProps) => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M13 3L5 13h5l-1 8 8-10h-5l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
}

// Specs hairline-list icons, keyed off the metadata detail key.
function DetailIcon({ detailKey }: { detailKey: string }) {
  const s = { width: 19, height: 19 } as const
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (detailKey) {
    case 'pages':
    case 'chapters':
      return (
        <svg viewBox="0 0 24 24" {...s} {...common}>
          <path d="M4 5.5A1.5 1.5 0 015.5 4H11v15.5H5.5A1.5 1.5 0 014 18V5.5zM20 5.5A1.5 1.5 0 0018.5 4H13v15.5h5.5A1.5 1.5 0 0020 18V5.5z" />
        </svg>
      )
    case 'language':
      return (
        <svg viewBox="0 0 24 24" {...s} {...common}>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M3.8 12h16.4M12 3.8c2.3 2.3 2.3 13.9 0 16.4-2.3-2.5-2.3-14.1 0-16.4z" />
        </svg>
      )
    case 'release_year':
    case 'edition':
      return (
        <svg viewBox="0 0 24 24" {...s} {...common}>
          <rect x="4" y="5.5" width="16" height="14" rx="2.2" />
          <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
        </svg>
      )
    case 'duration':
      return (
        <svg viewBox="0 0 24 24" {...s} {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      )
    default:
      // format / file_size / level / words / size / dimensions / license / …
      return (
        <svg viewBox="0 0 24 24" {...s} {...common}>
          <rect x="5" y="3.5" width="14" height="17" rx="2.2" />
          <path d="M9 8.5h6M9 12h6M9 15.5h4" />
        </svg>
      )
  }
}

/* ---------------- Gallery ---------------- */
function Gallery({
  medias,
  productName,
  active,
  setActive,
}: {
  medias: schemas['ProductStorefront']['medias']
  productName: string
  active: number
  setActive: (updater: (a: number) => number) => void
}) {
  const n = medias.length
  const go = useCallback(
    (d: number) => setActive((a) => (a + d + n) % n),
    [n, setActive],
  )

  useEffect(() => {
    if (n < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, n])

  return (
    <div className="gallery-col">
      <div className="stage">
        {n === 0 ? (
          <div className="frame active placeholder">
            <span className="ph-mark">{(productName[0] ?? 'S').toUpperCase()}</span>
          </div>
        ) : (
          medias.map((m, i) => (
            <div
              key={m.id ?? i}
              className={'frame' + (i === active ? ' active' : '')}
              aria-hidden={i !== active}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.public_url} alt={m.name ?? productName} />
            </div>
          ))
        )}
        {n > 1 && (
          <>
            <button className="nav-arrow prev" onClick={() => go(-1)} aria-label="Previous image">
              {Ico.chevL({})}
            </button>
            <button className="nav-arrow next" onClick={() => go(1)} aria-label="Next image">
              {Ico.chevR({})}
            </button>
            <div className="counter">
              {active + 1} / {n}
            </div>
          </>
        )}
      </div>
      {n > 1 && (
        <div className="thumbs">
          {medias.map((m, i) => (
            <button
              key={m.id ?? i}
              className={'thumb' + (i === active ? ' active' : '')}
              onClick={() => setActive(() => i)}
              aria-label={'View image ' + (i + 1)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.public_url} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- Buy block ---------------- */
function BuyBlock({
  buyRef,
  onBuy,
  loading,
}: {
  buyRef: React.RefObject<HTMLDivElement | null>
  onBuy: () => void
  loading: boolean
}) {
  const [added, setAdded] = useState(false)
  const [saved, setSaved] = useState(false)
  return (
    <div className="buy" ref={buyRef}>
      <button
        className={'btn-primary' + (added ? ' added' : '')}
        disabled={loading}
        onClick={() => {
          setAdded(true)
          onBuy()
        }}
      >
        <span className="lbl">{Ico.bag({ style: { opacity: 0.9 } })} Buy Now</span>
        <span className="done-lbl">
          {Ico.check({ style: { marginRight: 8, verticalAlign: -2 } })} Taking you to checkout
        </span>
      </button>
      <button
        className={'btn-secondary' + (saved ? ' saved' : '')}
        onClick={() => setSaved((s) => !s)}
      >
        {Ico.heart({})} {saved ? 'Saved to wishlist' : 'Add to wishlist'}
      </button>
      <div className="reassure">
        <span>{Ico.bolt({})} Instant download</span>
        <span>{Ico.lock({})} Secure checkout</span>
        <span>{Ico.download({ width: 13, height: 13 })} Lifetime access</span>
      </div>
    </div>
  )
}

/* ---------------- Details rail ---------------- */
function Details({
  product,
  buyRef,
  onBuy,
  loading,
}: {
  product: StorefrontProduct
  buyRef: React.RefObject<HTMLDivElement | null>
  onBuy: () => void
  loading: boolean
}) {
  const { code, amount, note } = priceParts(product)
  const details = product.metadata
    ? Object.entries(product.metadata)
        .filter(([k]) => DETAIL_KEYS.has(k))
        .map(([k, v]) => ({
          key: k,
          label: DETAIL_OPTION_MAP[k] ?? k,
          value: String(v),
        }))
    : []

  return (
    <div className="details-col">
      <h1 className="title">{product.name}</h1>
      {productSubtitle(product) && (
        <p className="byline">{productSubtitle(product)}</p>
      )}

      <div className="price-row">
        <div className="price">
          {code && <span className="cur">{code}</span>}
          {amount}
        </div>
        <div className="price-note">{note}</div>
      </div>

      {details.length > 0 && (
        <div className="specs">
          {details.map((d) => (
            <div className="spec" key={d.key}>
              <span className="ico">
                <DetailIcon detailKey={d.key} />
              </span>
              <span className="k">{d.label}</span>
              <span className="v">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      <BuyBlock buyRef={buyRef} onBuy={onBuy} loading={loading} />
    </div>
  )
}

/* ---------------- Overview (product description) ---------------- */
function Overview({ product }: { product: StorefrontProduct }) {
  if (!product.description && product.benefits.length === 0) return null
  return (
    <section className="section reveal" id="overview">
      <div className="wrap">
        <h2 className="section-head">Overview</h2>
        <div className="prose">
          {product.description &&
            product.description
              .split(/\n\s*\n/)
              .map((para, i) => <p key={i}>{para.trim()}</p>)}
          {product.benefits.length > 0 && (
            <ul className="included">
              {product.benefits.map((b) => (
                <li key={b.id}>
                  {Ico.check({ style: { verticalAlign: -1 } })}
                  {b.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

/* ---------------- Creator (from the Space card) ---------------- */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'S'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Same RFC 5322-ish check Chromium uses for type=email (matches the Space
// card's subscribe form).
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

function Creator({
  organization,
}: {
  organization: schemas['Organization']
}) {
  const settings = organization.storefront_settings
  const title = settings?.profile_title
  const bio = settings?.description

  // Subscribe — same email capture + mutation the Space card uses.
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const subscribe = useStorefrontSubscribe()

  const handleSubscribe = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = email.trim()
    if (subscribing) return
    if (!trimmed) {
      setSubscribeError('Please enter your email.')
      return
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setSubscribeError('Please enter a valid email address.')
      return
    }
    setSubscribeError(null)
    setSubscribing(true)
    try {
      const { error } = await subscribe.mutateAsync({
        slug: organization.slug,
        email: trimmed,
      })
      if (error) {
        const detail = (error as { detail?: unknown }).detail
        setSubscribeError(
          typeof detail === 'string'
            ? detail
            : 'Could not subscribe. Please try again.',
        )
        return
      }
      setSubscribed(true)
      setEmail('')
    } catch {
      setSubscribeError('Could not subscribe. Please try again.')
    } finally {
      setSubscribing(false)
    }
  }

  return (
    <section className="section reveal">
      <div className="wrap">
        <div className="divider" />
        <h2 className="section-head">About the creator</h2>
        <div className="creator">
          <div className="av">
            {organization.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={organization.avatar_url} alt={organization.name} />
            ) : (
              initials(organization.name)
            )}
          </div>
          <div className="meta">
            <div className="nm">{organization.name}</div>
            {title && <div className="role">{title}</div>}
            {bio && <div className="bio">{bio}</div>}
          </div>
          {subscribed ? (
            <div className="creator-sub-done">You&apos;re subscribed!</div>
          ) : (
            <form className="creator-sub" onSubmit={handleSubscribe}>
              <div className="creator-sub-row">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (subscribeError) setSubscribeError(null)
                  }}
                  placeholder="Enter your email…"
                  aria-invalid={subscribeError ? true : undefined}
                  className={'creator-sub-input' + (subscribeError ? ' err' : '')}
                />
                <button
                  type="submit"
                  className="creator-sub-btn"
                  disabled={subscribing || !email.trim()}
                >
                  {subscribing ? 'Subscribing…' : 'Subscribe'}
                </button>
              </div>
              {subscribeError && (
                <p className="creator-sub-err">{subscribeError}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

/* ---------------- More from creator ---------------- */
function MiniCover({
  product,
  index,
}: {
  product: schemas['ProductStorefront']
  index: number
}) {
  const cover = product.medias[0]?.public_url
  if (cover) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cover} alt={product.name} className="cover-img" />
  }
  const grads = [
    'linear-gradient(160deg,#26272c,#0f0f13)',
    'linear-gradient(160deg,#f0f0ec,#d6d6d0)',
    'linear-gradient(160deg,#3a3b40,#1b1c20)',
    'linear-gradient(160deg,#e2e2dd,#c6c6c0)',
  ]
  const dark = index % 2 === 0
  return (
    <div className="cover-fallback" style={{ background: grads[index % grads.length] }}>
      <span style={{ color: dark ? '#fff' : '#16171B' }}>{product.name}</span>
    </div>
  )
}

function MoreFromCreator({
  organization,
  products,
}: {
  organization: schemas['Organization']
  products: schemas['ProductStorefront'][]
}) {
  if (products.length === 0) return null
  return (
    <section className="section reveal">
      <div className="wrap">
        <div className="more-head">
          <h2 className="section-head" style={{ margin: 0 }}>
            More from {organization.name}
          </h2>
          <Link className="lk" href={`/${organization.slug}`}>
            View all →
          </Link>
        </div>
        <div className="cards">
          {products.slice(0, 4).map((p, i) => (
            <Link className="card" key={p.id} href={`/${organization.slug}/products/${p.id}`}>
              <div className="ph">
                <MiniCover product={p} index={i} />
              </div>
              <div className="ct">
                <div className="nm">{p.name}</div>
                <div className="pr">{priceLabel(p)}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------- Sticky purchase bar ---------------- */
function StickyBar({
  product,
  visible,
  activeMedia,
  onBuy,
  loading,
}: {
  product: StorefrontProduct
  visible: boolean
  activeMedia?: schemas['ProductStorefront']['medias'][number]
  onBuy: () => void
  loading: boolean
}) {
  const { code, amount } = priceParts(product)
  const categoryLabel = product.category
    ? (CATEGORY_LABELS[product.category] ?? product.category)
    : null
  return (
    <div className={'stickybar' + (visible ? ' show' : '')}>
      <div className="stickybar-inner">
        <div className="mini">
          {activeMedia ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeMedia.public_url} alt="" />
          ) : (
            <span className="ph-mark sm">{(product.name[0] ?? 'S').toUpperCase()}</span>
          )}
        </div>
        <div className="info">
          <div className="t">{product.name}</div>
          <div className="p">
            {code ? `${code} ${amount}` : amount}
            {categoryLabel ? ` · ${categoryLabel}` : ''}
          </div>
        </div>
        <button className="btn-primary" disabled={loading} onClick={onBuy}>
          <span className="lbl">Buy Now</span>
        </button>
      </div>
    </div>
  )
}

/* ---------------- Page ---------------- */
export const ProductDetailPage = ({
  organization,
  product,
  otherProducts,
}: {
  organization: schemas['Organization']
  product: schemas['ProductStorefront']
  otherProducts: schemas['ProductStorefront'][]
}) => {
  const sp = product as StorefrontProduct
  const [active, setActive] = useState(0)
  const [barVisible, setBarVisible] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buyRef = useRef<HTMLDivElement>(null)

  const handleBuy = useCallback(async () => {
    if (checkoutLoading) return
    setCheckoutLoading(true)
    try {
      const { data: checkout } = await api.POST('/v1/checkouts/client/', {
        body: { product_id: product.id },
      })
      if (checkout?.client_secret) {
        window.location.href = `${CONFIG.FRONTEND_BASE_URL}/checkout/${checkout.client_secret}?theme=light`
      }
    } catch {
      // swallow — button re-enables in finally
    } finally {
      setCheckoutLoading(false)
    }
  }, [checkoutLoading, product.id])

  // Scroll-driven UI: sticky buy bar + section entrance reveals. Scroll math
  // (not IntersectionObserver) for reliability, matching the prototype.
  useEffect(() => {
    const onScroll = () => {
      if (buyRef.current) {
        setBarVisible(buyRef.current.getBoundingClientRect().bottom < 64)
      }
      const vh = window.innerHeight
      rootRef.current
        ?.querySelectorAll('.reveal:not(.in)')
        .forEach((el) => {
          if (el.getBoundingClientRect().top < vh * 0.9) el.classList.add('in')
        })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div className={`${poppins.className} sppdp`} ref={rootRef}>
      <style>{CSS}</style>

      <StickyBar
        product={sp}
        visible={barVisible}
        activeMedia={product.medias[active]}
        onBuy={handleBuy}
        loading={checkoutLoading}
      />

      <div className="wrap">
        <Link className="crumb" href={`/${organization.slug}`}>
          {Ico.arrowBack({})} Back to {organization.name}
        </Link>

        <div className="hero reveal in">
          <Gallery
            medias={product.medias}
            productName={product.name}
            active={active}
            setActive={setActive}
          />
          <Details
            product={sp}
            buyRef={buyRef}
            onBuy={handleBuy}
            loading={checkoutLoading}
          />
        </div>
      </div>

      <Overview product={sp} />
      <Creator organization={organization} />
      <MoreFromCreator organization={organization} products={otherProducts} />

      <footer>
        <div className="wrap foot-inner">
          <div className="l">
            © {new Date().getFullYear()} {organization.name} · Powered by Spaire
          </div>
        </div>
      </footer>
    </div>
  )
}

/* ============================================================
   Scoped styles — ported 1:1 from the Spaire product-page design
   (monochrome, Poppins). Every rule is namespaced under `.sppdp`
   so nothing leaks into the rest of the app.
   ============================================================ */
const CSS = `
.sppdp{
  --ink:#16171B; --ink-2:#34353B; --muted:#74757B; --faint:#9A9AA0;
  --line:#EAEAEA; --line-2:#F1F1EF; --surface:#F6F6F4; --surface-2:#FAFAF9; --bg:#FFFFFF;
  --radius:16px; --radius-lg:24px; --radius-xl:30px; --pill:999px; --maxw:1200px;
  --ease:cubic-bezier(.22,.61,.36,1); --ease-2:cubic-bezier(.4,0,.2,1);
  color:var(--ink); background:var(--bg); font-size:16px; line-height:1.5;
  letter-spacing:-0.01em; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}
.sppdp *{box-sizing:border-box;}
.sppdp ::selection{background:var(--ink);color:#fff;}
.sppdp button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}
.sppdp img{display:block;max-width:100%;}
.sppdp a{color:inherit;text-decoration:none;}

.sppdp .wrap{max-width:var(--maxw);margin:0 auto;padding:0 40px;}

/* Breadcrumb */
.sppdp .crumb{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--muted);font-weight:400;padding:30px 0 0;transition:color .2s var(--ease-2);}
.sppdp .crumb:hover{color:var(--ink);}
.sppdp .crumb svg{transition:transform .25s var(--ease);}
.sppdp .crumb:hover svg{transform:translateX(-3px);}

/* Hero grid */
.sppdp .hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(380px,440px);gap:72px;padding:26px 0 96px;align-items:start;}
.sppdp .gallery-col{position:sticky;top:84px;}

/* Gallery */
.sppdp .stage{position:relative;width:100%;aspect-ratio:1/1;background:var(--surface);border-radius:var(--radius-lg);overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,0.02);}
.sppdp .frame{position:absolute;inset:0;opacity:0;transition:opacity .55s var(--ease),transform .9s var(--ease);pointer-events:none;transform:scale(1.015);}
.sppdp .frame.active{opacity:1;transform:scale(1);pointer-events:auto;}
.sppdp .frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.sppdp .frame.placeholder{display:grid;place-items:center;background:linear-gradient(160deg,#202126,#0e0e12);}
.sppdp .ph-mark{color:rgba(255,255,255,0.92);font-weight:600;font-size:clamp(40px,8vw,96px);letter-spacing:-0.03em;}
.sppdp .ph-mark.sm{color:var(--muted);font-size:18px;}
.sppdp .nav-arrow{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,0.86);backdrop-filter:blur(8px);display:grid;place-items:center;z-index:5;box-shadow:0 4px 18px rgba(0,0,0,0.10),0 0 0 1px rgba(0,0,0,0.03);opacity:0;transition:opacity .3s var(--ease-2),background .2s,transform .25s var(--ease);color:var(--ink);}
.sppdp .stage:hover .nav-arrow{opacity:1;}
.sppdp .nav-arrow:hover{background:#fff;}
.sppdp .nav-arrow.prev{left:16px;}
.sppdp .nav-arrow.next{right:16px;}
.sppdp .nav-arrow.prev:hover{transform:translateY(-50%) translateX(-2px);}
.sppdp .nav-arrow.next:hover{transform:translateY(-50%) translateX(2px);}
.sppdp .counter{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(22,23,27,0.72);backdrop-filter:blur(8px);color:#fff;font-size:12px;font-weight:500;letter-spacing:0.02em;padding:6px 13px;border-radius:var(--pill);z-index:5;opacity:0;transition:opacity .3s var(--ease-2);}
.sppdp .stage:hover .counter{opacity:1;}
.sppdp .thumbs{display:flex;gap:12px;margin-top:16px;}
.sppdp .thumb{flex:1;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:var(--surface);position:relative;box-shadow:inset 0 0 0 1px var(--line-2);transition:box-shadow .25s var(--ease-2),transform .25s var(--ease);}
.sppdp .thumb:hover{transform:translateY(-2px);}
.sppdp .thumb.active{box-shadow:inset 0 0 0 2px var(--ink);}
.sppdp .thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}

/* Details rail */
.sppdp .title{font-size:clamp(24px,2.4vw,34px);font-weight:600;line-height:1.1;letter-spacing:-0.025em;margin:-4px 0 0;text-wrap:balance;}
.sppdp .byline{margin:16px 0 0;font-size:15px;color:var(--muted);font-weight:400;}
.sppdp .price-row{display:flex;align-items:baseline;gap:12px;margin:26px 0 0;}
.sppdp .price{font-size:26px;font-weight:600;letter-spacing:-0.02em;}
.sppdp .price .cur{font-size:15px;color:var(--muted);font-weight:500;margin-right:6px;letter-spacing:0;}
.sppdp .price-note{font-size:13px;color:var(--faint);}
.sppdp .specs{margin:30px 0 0;border-top:1px solid var(--line);}
.sppdp .spec{display:grid;grid-template-columns:26px 1fr auto;align-items:center;gap:14px;padding:15px 2px;border-bottom:1px solid var(--line);}
.sppdp .spec .ico{color:var(--faint);display:grid;place-items:center;}
.sppdp .spec .k{font-size:14px;color:var(--muted);font-weight:400;}
.sppdp .spec .v{font-size:14px;color:var(--ink);font-weight:500;}

/* Buy block */
.sppdp .buy{margin-top:30px;display:flex;flex-direction:column;gap:12px;}
.sppdp .btn-primary{width:100%;height:58px;border-radius:var(--pill);background:var(--ink);color:#fff;font-size:16px;font-weight:600;letter-spacing:-0.01em;display:grid;place-items:center;position:relative;overflow:hidden;transition:transform .25s var(--ease),box-shadow .3s var(--ease);box-shadow:0 6px 20px rgba(22,23,27,0.16);}
.sppdp .btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(22,23,27,0.24);}
.sppdp .btn-primary:active{transform:translateY(0);}
.sppdp .btn-primary:disabled{opacity:.65;pointer-events:none;}
.sppdp .btn-primary .lbl{position:relative;z-index:2;display:flex;align-items:center;gap:9px;transition:opacity .25s;}
.sppdp .btn-primary .done-lbl{position:absolute;inset:0;display:grid;place-items:center;z-index:2;opacity:0;transform:scale(.9);transition:opacity .3s var(--ease),transform .3s var(--ease);}
.sppdp .btn-primary.added .lbl{opacity:0;}
.sppdp .btn-primary.added .done-lbl{opacity:1;transform:scale(1);}
.sppdp .btn-secondary{width:100%;height:52px;border-radius:var(--pill);background:#fff;color:var(--ink);font-size:15px;font-weight:500;box-shadow:inset 0 0 0 1px var(--line);display:flex;align-items:center;justify-content:center;gap:9px;transition:background .2s var(--ease-2),box-shadow .2s;}
.sppdp .btn-secondary:hover{background:var(--surface);box-shadow:inset 0 0 0 1px var(--faint);}
.sppdp .btn-secondary.saved svg{fill:var(--ink);}
.sppdp .reassure{display:flex;flex-wrap:wrap;gap:7px 18px;margin-top:18px;}
.sppdp .reassure span{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:400;}
.sppdp .reassure svg{color:var(--ink);opacity:.55;}

/* Section blocks */
.sppdp .section{padding:0 0 90px;}
.sppdp .section-head{font-size:13px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted);margin:0 0 26px;}
.sppdp .prose{max-width:64ch;}
.sppdp .prose p{margin:0 0 20px;color:var(--ink-2);font-size:16.5px;line-height:1.72;font-weight:400;white-space:pre-wrap;}
.sppdp .prose .included{list-style:none;margin:30px 0 0;padding:0;display:flex;flex-direction:column;gap:13px;}
.sppdp .prose .included li{display:flex;align-items:flex-start;gap:11px;font-size:15px;color:var(--ink-2);line-height:1.5;}
.sppdp .prose .included li svg{flex:none;margin-top:3px;color:var(--ink);}
.sppdp .divider{height:1px;background:var(--line);margin:0 0 64px;}

/* Creator */
.sppdp .creator{display:flex;align-items:center;gap:24px;background:var(--surface);border-radius:var(--radius-lg);padding:30px 34px;}
.sppdp .creator .av{width:74px;height:74px;border-radius:50%;flex:none;overflow:hidden;background:linear-gradient(150deg,#2a2b30,#0e0e12);display:grid;place-items:center;color:#fff;font-weight:600;font-size:24px;letter-spacing:-0.02em;}
.sppdp .creator .av img{width:100%;height:100%;object-fit:cover;}
.sppdp .creator .meta{flex:1;min-width:0;}
.sppdp .creator .nm{font-size:18px;font-weight:600;letter-spacing:-0.02em;}
.sppdp .creator .role{font-size:13.5px;color:var(--muted);margin-top:2px;}
.sppdp .creator .bio{font-size:14px;color:var(--ink-2);margin-top:10px;line-height:1.6;max-width:52ch;}
.sppdp .creator-sub{flex:none;display:flex;flex-direction:column;gap:6px;}
.sppdp .creator-sub-row{display:flex;gap:8px;align-items:center;}
.sppdp .creator-sub-input{height:44px;width:210px;min-width:0;border-radius:var(--pill);background:#fff;box-shadow:inset 0 0 0 1px var(--line);padding:0 18px;font-size:14px;color:var(--ink);transition:box-shadow .2s var(--ease-2);}
.sppdp .creator-sub-input::placeholder{color:var(--faint);}
.sppdp .creator-sub-input:focus{outline:none;box-shadow:inset 0 0 0 1px var(--faint);}
.sppdp .creator-sub-input.err{box-shadow:inset 0 0 0 1px #e0857f;}
.sppdp .creator-sub-btn{flex:none;height:44px;padding:0 22px;border-radius:var(--pill);background:var(--ink);color:#fff;font-size:14px;font-weight:500;display:grid;place-items:center;transition:transform .2s var(--ease),opacity .2s;}
.sppdp .creator-sub-btn:hover{transform:translateY(-1px);}
.sppdp .creator-sub-btn:disabled{opacity:.5;pointer-events:none;}
.sppdp .creator-sub-err{font-size:12px;color:#c4554d;margin:0;}
.sppdp .creator-sub-done{flex:none;display:flex;align-items:center;justify-content:center;height:44px;padding:0 22px;border-radius:var(--pill);background:var(--surface);box-shadow:inset 0 0 0 1px var(--line);font-size:14px;font-weight:500;color:var(--ink);}

/* More from creator */
.sppdp .more-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:26px;}
.sppdp .more-head .lk{font-size:14px;color:var(--muted);transition:color .2s;}
.sppdp .more-head .lk:hover{color:var(--ink);}
.sppdp .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;}
.sppdp .card{cursor:pointer;display:block;}
.sppdp .card .ph{aspect-ratio:3/4;border-radius:var(--radius);overflow:hidden;background:var(--surface);position:relative;box-shadow:inset 0 0 0 1px var(--line-2);transition:transform .35s var(--ease),box-shadow .35s var(--ease);}
.sppdp .card:hover .ph{transform:translateY(-4px);box-shadow:0 16px 34px rgba(0,0,0,0.10),inset 0 0 0 1px var(--line-2);}
.sppdp .card .ph .cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.sppdp .card .ph .cover-fallback{position:absolute;inset:0;display:flex;align-items:flex-end;padding:16%;}
.sppdp .card .ph .cover-fallback span{font-weight:600;font-size:clamp(15px,1.5vw,19px);letter-spacing:-0.02em;line-height:1.1;}
.sppdp .card .ct{margin-top:14px;}
.sppdp .card .nm{font-size:14.5px;font-weight:500;letter-spacing:-0.01em;line-height:1.35;}
.sppdp .card .pr{font-size:13.5px;color:var(--muted);margin-top:4px;}

/* Sticky buy bar */
.sppdp .stickybar{position:fixed;left:0;right:0;top:0;z-index:50;background:rgba(255,255,255,0.82);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line);transform:translateY(-101%);transition:transform .4s var(--ease);}
.sppdp .stickybar.show{transform:translateY(0);}
.sppdp .stickybar-inner{max-width:var(--maxw);margin:0 auto;padding:12px 40px;display:flex;align-items:center;gap:18px;}
.sppdp .stickybar .mini{width:42px;height:42px;border-radius:9px;overflow:hidden;flex:none;position:relative;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2);display:grid;place-items:center;}
.sppdp .stickybar .mini img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}
.sppdp .stickybar .info{flex:1;min-width:0;}
.sppdp .stickybar .t{font-size:14px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sppdp .stickybar .p{font-size:13px;color:var(--muted);margin-top:1px;}
.sppdp .stickybar .btn-primary{width:auto;height:44px;padding:0 30px;font-size:14.5px;box-shadow:0 4px 14px rgba(22,23,27,0.16);}

/* Footer */
.sppdp footer{border-top:1px solid var(--line);padding:40px 0;margin-top:10px;}
.sppdp .foot-inner{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;}
.sppdp .foot-inner .l{font-size:13px;color:var(--faint);}

/* Entrance motion — base state is visible; only pre-hide when motion is OK */
.sppdp .reveal{opacity:1;transform:none;}
@media (prefers-reduced-motion:no-preference){
  .sppdp .reveal:not(.in){opacity:0;transform:translateY(16px);}
  .sppdp .reveal.in{animation:sppdpReveal .7s var(--ease) both;}
}
@keyframes sppdpReveal{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:none;}}

/* Responsive */
@media (max-width:980px){
  .sppdp .wrap{padding:0 28px;}
  .sppdp .hero{grid-template-columns:1fr;gap:36px;padding-top:18px;padding-bottom:60px;}
  .sppdp .gallery-col{position:static;top:auto;}
  .sppdp .stage{max-width:520px;}
  .sppdp .cards{grid-template-columns:repeat(2,1fr);gap:18px;}
  .sppdp .stickybar-inner{padding:10px 28px;}
  .sppdp .stickybar{top:auto;bottom:0;border-bottom:none;border-top:1px solid var(--line);transform:translateY(101%);}
  .sppdp .stickybar.show{transform:translateY(0);}
  .sppdp .stickybar .mini{display:none;}
  .sppdp .stickybar .btn-primary{flex:1;}
}
@media (max-width:560px){
  .sppdp .wrap{padding:0 20px;}
  .sppdp .creator{flex-direction:column;align-items:flex-start;gap:18px;padding:24px;}
  .sppdp .creator-sub{width:100%;}
  .sppdp .creator-sub-input{flex:1;width:auto;}
  .sppdp .cards{grid-template-columns:1fr 1fr;gap:14px;}
  .sppdp .stickybar-inner{padding:10px 20px;gap:12px;}
  .sppdp .reassure{gap:6px 14px;}
}
@media (prefers-reduced-motion:reduce){
  .sppdp *{transition-duration:.01ms!important;animation-duration:.01ms!important;}
}
`

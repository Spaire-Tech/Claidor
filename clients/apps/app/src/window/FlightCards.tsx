// Step 3d (mac/Simeon/Cards.swift's flights, FlightBooking.swift,
// PaneMembersFlight.swift's `FlightPage`, AgentPane.swift's flight in the
// pane): the flights an agent found, a flight's details beside the chat
// with "Book with Simeon", and the travellers' form for the one booked,
// filled on a sheet. Read by `src/core/flightCards.ts`.
//
// The flight's checkout card (`MacFlightCheckoutBlock`) is the purchase
// card's, with the shop's cards (ShopCards.tsx).

import {
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { CardKind } from '../core/chat'
import {
  type BookedFlight,
  type FlightLeg,
  type FlightOffer,
  type FlightPassengersCard,
  type FlightTimes,
  type FlightsCard,
  type OpenFlight,
  type Traveller,
  type TravellerGender,
  type TravellerTitle,
  adultOn,
  arriving,
  asOnIDWords,
  bookingOK,
  cancelWords,
  continueWords,
  dateOf,
  dayOf,
  departing,
  fareLine,
  fillInWords,
  flightKey,
  flightLines,
  flightPassengersCard,
  flightPlace,
  flightsAside,
  flightsCard,
  flightsHeading,
  genderLabel,
  inbound,
  initials,
  layoverLine,
  logoBox,
  outbound,
  passengersStatus,
  seatLabel,
  shape,
  startingTravellers,
  stopsWord,
  terms,
  titleLabel,
  travellerGenders,
  travellerProblem,
  travellerTitles,
  travellersTitle,
  ways,
  whenLine,
} from '../core/flightCards'
import { displayLocale } from '../core/listTime'
import type { AppStore } from '../core/store'
import { t, tk } from '../l10n'
import { type CardProps, StatusPill } from './Cards'
import { classes } from './classes'
import countries from './countries.json'
import { Sheet } from './Dialogs'
import './FlightCards.css'
import { useDarkScheme } from './theme'
import { useWatched } from './useStore'
import { useWindowModel } from './windowModel'

type FlightKind = Extract<CardKind, 'flights' | 'flightPassengers'>

/** The card for one of the flight kinds, or none when its line doesn't read as one. */
export function flightCardView(
  kind: FlightKind,
  card: CardProps,
): React.ReactNode {
  if (kind === 'flights') {
    const read = flightsCard(card.entry)
    return (
      read && (
        <FlightsCardView
          card={read}
          rowId={card.entryId}
          agentId={card.agentId}
        />
      )
    )
  }
  const read = flightPassengersCard(card.entry)
  return (
    read && (
      <FlightPassengersCardView
        entryId={card.entryId}
        agentId={card.agentId}
        card={read}
        store={card.store}
      />
    )
  )
}

// MARK: The look

/** Dark or light, as the theme chosen or the system says, kept up to date. */
function useDark(): boolean {
  return useDarkScheme()
}

type SymbolName =
  | 'chevronRight'
  | 'chevronLeft'
  | 'chevronDown'
  | 'xmark'
  | 'arrowUpRight'
  | 'arrowDownLeft'
  | 'clock'

const symbols: Record<SymbolName, ReactNode> = {
  chevronRight: <path d="M6 3.2 10.8 8 6 12.8" />,
  chevronLeft: <path d="M10 3.2 5.2 8l4.8 4.8" />,
  chevronDown: <path d="M3.5 6 8 10.5 12.5 6" />,
  xmark: <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />,
  arrowUpRight: <path d="M3.5 12.5 12.5 3.5M5 3.5h7.5V11" />,
  arrowDownLeft: <path d="M12.5 3.5 3.5 12.5M11 12.5H3.5V5" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="6.8" />
      <path d="M8 4.2V8l2.6 1.6" />
    </>
  ),
}

/** One of the Mac's symbols, drawn at `size` in the text's colour (`weight`: the stroke, as SF Symbols' weights). */
function MacSymbol({
  name,
  size,
  weight = 1.4,
  className,
}: {
  name: SymbolName
  size: number
  weight?: number
  className?: string
}) {
  return (
    <svg
      className={classes('flight-symbol', className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {symbols[name]}
      </g>
    </svg>
  )
}

/** A filled disc with a mark cut out of it (`checkmark.circle.fill`, `minus.circle.fill`, `plus.circle.fill`). */
function FilledCircle({
  mark,
  size,
}: {
  mark: 'check' | 'minus' | 'plus'
  size: number
}) {
  // Each its own mask: one shared by id would vanish with the first that is hidden.
  const id = useId()
  const cut = {
    check: 'M4.9 8.3 7 10.4l4.1-4.8',
    minus: 'M4.8 8h6.4',
    plus: 'M8 4.8v6.4M4.8 8h6.4',
  }[mark]
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <mask id={id}>
        <rect width="16" height="16" fill="#fff" />
        <path
          d={cut}
          fill="none"
          stroke="#000"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <circle
        cx="8"
        cy="8"
        r="7.4"
        fill="currentColor"
        mask={`url(#${CSS.escape(id)})`}
      />
    </svg>
  )
}

/** The small spinner in a blue button (`ProgressView().controlSize(.small)`), white. */
function Spinner() {
  return <span className="flight-spinner" aria-hidden="true" />
}

// MARK: Fitting (SwiftUI's `ViewThatFits`)

/**
 * The wide layout when its own natural width fits the room, else the
 * narrow one (`ViewThatFits(in: .horizontal)`). The wide one is also laid
 * out unseen at its natural width, to be measured as the room changes.
 */
function Fitting({
  wide,
  narrow,
  className,
}: {
  wide: (measuring: boolean) => ReactNode
  narrow: ReactNode
  className?: string
}) {
  const box = useRef<HTMLSpanElement>(null)
  const ideal = useRef<HTMLSpanElement>(null)
  const [fits, setFits] = useState(true)
  useLayoutEffect(() => {
    const room = box.current
    const natural = ideal.current
    if (!room || !natural) return
    const measure = () =>
      setFits(
        natural.getBoundingClientRect().width <=
          room.getBoundingClientRect().width + 0.5,
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(room)
    observer.observe(natural)
    return () => observer.disconnect()
  }, [])
  return (
    <span ref={box} className={classes('fitting', className)}>
      {fits ? wide(false) : narrow}
      <span ref={ideal} className="fitting-measure" aria-hidden="true" inert>
        {wide(true)}
      </span>
    </span>
  )
}

// MARK: An airline's mark

interface Picture {
  src: string
  width: number
  height: number
  /** Drawn as it came: the site didn't let it be read, so it is neither cut to its edges nor lightened. */
  plain?: boolean
}

/** Each logo once per tab, in memory only: light, and lightened for the dark disc (`RemoteLogos`). */
const painted = new Map<string, Promise<Picture | undefined>>()
const ready = new Map<string, Picture | null>()

/** A painted logo's long side, in pixels: sharp at the marks' sizes on a 3× screen. */
const paintedLong = 240

function picture(url: string, dark: boolean): Promise<Picture | undefined> {
  const key = `${url}#${dark ? 'dark' : 'light'}`
  let found = painted.get(key)
  if (!found) {
    found = (dark ? darkPicture(url) : lightPicture(url)).then((made) => {
      ready.set(key, made ?? null)
      return made
    })
    painted.set(key, found)
  }
  return found
}

function loaded(url: string, readable: boolean): Promise<HTMLImageElement> {
  const image = new Image()
  if (readable) image.crossOrigin = 'anonymous'
  image.decoding = 'async'
  image.src = url
  return image.decode().then(() => image)
}

/** The logo drawn at 240 on its long side and cut to what is drawn on it (alpha above 12 of 255); none when nothing is. */
async function lightPicture(url: string): Promise<Picture | undefined> {
  let image: HTMLImageElement
  try {
    image = await loaded(url, true)
  } catch {
    // The site doesn't let a page read its pictures (no CORS): shown as it came, if it shows at all.
    try {
      const plain = await loaded(url, false)
      return {
        src: url,
        width: plain.naturalWidth || 1,
        height: plain.naturalHeight || 1,
        plain: true,
      }
    } catch {
      return undefined
    }
  }
  const across = image.naturalWidth
  const down = image.naturalHeight
  // An SVG without its own size is drawn in a square, then cut to its shape.
  const scale =
    across > 0 && down > 0 ? paintedLong / Math.max(across, down) : 0
  const width =
    scale > 0 ? Math.max(1, Math.round(across * scale)) : paintedLong
  const height = scale > 0 ? Math.max(1, Math.round(down * scale)) : paintedLong
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.drawImage(image, 0, 0, width, height)
  let pixels: ImageData
  try {
    pixels = context.getImageData(0, 0, width, height)
  } catch {
    return { src: url, width, height, plain: true }
  }
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      if (pixels.data[(y * width + x) * 4 + 3]! > 12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  // Nothing drawn: no logo, so the mark shows the airline's initials.
  if (maxX < minX || maxY < minY) return undefined
  const cut = document.createElement('canvas')
  cut.width = maxX - minX + 1
  cut.height = maxY - minY + 1
  cut
    .getContext('2d')
    ?.drawImage(
      canvas,
      minX,
      minY,
      cut.width,
      cut.height,
      0,
      0,
      cut.width,
      cut.height,
    )
  return {
    src: cut.toDataURL('image/png'),
    width: cut.width,
    height: cut.height,
  }
}

/** The dark disc behind a logo in dark mode (#232325). */
const disc = [0x23, 0x23, 0x25] as const

const linear = (value: number) => {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const luminance = (r: number, g: number, b: number) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)

/** Hue, saturation and lightness, each 0 to 1, of a colour given 0 to 255. */
function hsl(r: number, g: number, b: number): [number, number, number] {
  const [red, green, blue] = [r / 255, g / 255, b / 255]
  const high = Math.max(red, green, blue)
  const low = Math.min(red, green, blue)
  const lightness = (high + low) / 2
  if (high === low) return [0, 0, lightness]
  const delta = high - low
  const saturation =
    lightness > 0.5 ? delta / (2 - high - low) : delta / (high + low)
  let hue =
    high === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : high === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4
  hue /= 6
  return [hue, saturation, lightness]
}

/** Red, green and blue, each 0 to 1, of a hue, saturation and lightness. */
function rgb(
  hue: number,
  saturation: number,
  lightness: number,
): [number, number, number] {
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const channel = (start: number) => {
    let t = start
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 0.5) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)]
}

/**
 * The logo for the dark disc (`RemoteLogos.forDarkDisc`): Duffel has no
 * logos for dark backgrounds, so each part that reads at less than 2:1
 * against the disc is lightened to a light tint of its own hue (a grey to
 * near white); the colours that already read are left as they are.
 */
async function darkPicture(url: string): Promise<Picture | undefined> {
  const light = await picture(url, false)
  if (!light || light.plain) return light
  const image = await loaded(light.src, false).catch(() => undefined)
  if (!image) return light
  const canvas = document.createElement('canvas')
  canvas.width = light.width
  canvas.height = light.height
  const context = canvas.getContext('2d')
  if (!context) return light
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const ground = luminance(...disc)
  const data = pixels.data
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3]! < 8) continue
    const [r, g, b] = [data[index]!, data[index + 1]!, data[index + 2]!]
    if ((luminance(r, g, b) + 0.05) / (ground + 0.05) >= 2) continue
    const [hue, saturation] = hsl(r, g, b)
    const [nr, ng, nb] =
      saturation < 0.15
        ? [0.9, 0.9, 0.9]
        : rgb(hue, Math.min(0.9, saturation), 0.72)
    data[index] = Math.round(nr * 255)
    data[index + 1] = Math.round(ng * 255)
    data[index + 2] = Math.round(nb * 255)
  }
  context.putImageData(pixels, 0, 0)
  return { ...light, src: canvas.toDataURL('image/png') }
}

/** The logo to draw for this address and look: none while it comes, or when there is none to draw. */
function useLogo(logo: string, dark: boolean): Picture | undefined {
  const usable = logo.startsWith('https://') || logo.startsWith('data:image/')
  const key = `${logo}#${dark ? 'dark' : 'light'}`
  const [shown, setShown] = useState<{ key: string; picture?: Picture }>(
    () => ({ key, picture: ready.get(key) ?? undefined }),
  )
  useEffect(() => {
    if (!usable) return
    let current = true
    void picture(logo, dark).then((made) => {
      if (current) setShown({ key, picture: made })
    })
    return () => {
      current = false
    }
  }, [logo, dark, key, usable])
  if (!usable) return undefined
  // Another flight in the same place: its own logo or its initials, never the last one's.
  if (shown.key !== key) return ready.get(key) ?? undefined
  return shown.picture
}

/**
 * An airline's mark (`AirlineMark`): its logo, sized by its own shape in
 * the circle (`logoBox`), or its initials (500, grey, a third of the side).
 * White in light, the dark disc in dark with the logo's too-dark parts
 * lightened; a faint ring.
 */
export function AirlineMark({
  name,
  logo,
  side,
}: {
  name: string
  logo: string
  side: number
}) {
  const dark = useDark()
  const shown = useLogo(logo, dark)
  const box = shown
    ? logoBox(shown.width, shown.height, side)
    : { width: 0, height: 0 }
  return (
    <span
      className="airline-mark"
      style={{ width: side, height: side }}
      aria-hidden="true"
    >
      {shown ? (
        <img
          src={shown.src}
          alt=""
          draggable={false}
          className={shown.plain ? 'plain' : undefined}
          style={{ width: box.width, height: box.height }}
        />
      ) : (
        <span className="airline-initials" style={{ fontSize: side / 3 }}>
          {initials(name)}
        </span>
      )}
    </span>
  )
}

// MARK: The flights card

/**
 * Flight results (`FlightsCardView`), Muse's layout as the iPhone draws it,
 * at a Mac's width: its own card, as wide as a card may be (680 at most),
 * the route and its date as one heading (16, 500) with what else the trip
 * is under it (12, grey); then a row per offer. On a wide chat a row reads
 * across: the airline's mark (40), the airline over its stops, the times
 * on a dashed line with the time in the air between them (a round trip's
 * way back under them), the price and a chevron. On a narrow one it is the
 * iPhone's row: "Airline · price" over the times. Opening an offer shows
 * it beside the chat; again closes it.
 */
function FlightsCardView({
  card,
  rowId,
  agentId,
}: {
  card: FlightsCard
  rowId: string
  agentId: string
}) {
  const heading = flightsHeading(card)
  const aside = flightsAside(card)
  const headed = heading !== '' || aside !== ''
  const model = useWindowModel()
  useWatched(model)
  // Pressed while the pane shows it (`pane.isOpen && pane.flight?.key == key`).
  const open = model.paneOpen ? model.flight : undefined
  return (
    <div
      className="flights-card"
      role="group"
      aria-label={heading === '' ? t('Flights') : heading}
    >
      {headed && (
        <div className="flights-head">
          {heading !== '' && <div className="flights-heading">{heading}</div>}
          {aside !== '' && <div className="flights-aside">{aside}</div>}
        </div>
      )}
      <div className={classes('flights-rows', !headed && 'bare')}>
        {card.offers.map((offer, index) => {
          const key = flightKey(rowId, index)
          return (
            <Fragment key={index}>
              {index > 0 && <div className="flight-rule" />}
              <FlightRow
                offer={offer}
                pressed={open?.key === key}
                open={() => model.toggleFlight(key, offer, agentId)}
              />
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

/** One offer (`FlightRow`): across a wide chat, the iPhone's row on a narrow one; its details open in the pane (`aria-pressed`, the hover's fill kept). */
function FlightRow({
  offer,
  pressed,
  open,
}: {
  offer: FlightOffer
  pressed: boolean
  open: () => void
}) {
  const out = outbound(offer)
  const back = inbound(offer)
  const chevron = (
    <span className="flight-chevron">
      <MacSymbol name="chevronRight" size={12} weight={2} />
    </span>
  )
  const mark = (measuring: boolean) =>
    measuring ? (
      <span className="airline-mark" style={{ width: 40, height: 40 }} />
    ) : (
      <AirlineMark name={offer.airline} logo={offer.logo} side={40} />
    )
  return (
    <button
      type="button"
      className={classes('flight-row', pressed && 'pressed')}
      aria-pressed={pressed}
      onClick={open}
    >
      <Fitting
        wide={(measuring) => (
          <span className="flight-across">
            {mark(measuring)}
            <span className="flight-airline">
              <span className="flight-airline-name">{offer.airline}</span>
              <span className="flight-stops">{stopsWord(offer.stops)}</span>
            </span>
            <span className="flight-times">
              <TimesAcross times={out} />
              {back && <TimesAcross times={back} />}
            </span>
            <span className="flight-price">{offer.price}</span>
            {chevron}
          </span>
        )}
        narrow={
          <span className="flight-stacked">
            {mark(false)}
            <span className="flight-stack-words">
              <span className="flight-stack-top">
                <span className="flight-stack-airline">{offer.airline}</span>
                <span className="flight-price">{offer.price}</span>
              </span>
              <TimesStacked times={out} />
              {back && <TimesStacked times={back} />}
            </span>
            {chevron}
          </span>
        }
      />
    </button>
  )
}

/** The dashed rule between a row's times; it takes what the line leaves, at least 12. */
function Dashes() {
  return <span className="flight-dashes" aria-hidden="true" />
}

/** "2:30pm ----- 2h40m ----- 5:10pm" across a wide row: the times in ink, the time in the air (and the stops) in grey between dashes. */
function TimesAcross({ times }: { times: FlightTimes }) {
  return (
    <span className="times-across">
      <span className="time">{times.depart}</span>
      <Dashes />
      {times.label !== '' && (
        <>
          <span className="times-label">{times.label}</span>
          <Dashes />
        </>
      )}
      <span className="time">{times.arrive}</span>
    </span>
  )
}

/** The iPhone's line: the times on a dashed line, or, too long for the row, the time in the air under the times. */
function TimesStacked({ times }: { times: FlightTimes }) {
  return (
    <Fitting
      className="times-stacked"
      wide={() => (
        <span className="times-line">
          <span className="time">{times.depart}</span>
          <Dashes />
          {times.label !== '' && (
            <>
              <span className="times-label">{times.label}</span>
              <Dashes />
            </>
          )}
          <span className="time">{times.arrive}</span>
        </span>
      )}
      narrow={
        <span className="times-lines">
          <span>
            {[times.depart, times.arrive]
              .filter((part) => part !== '')
              .join(' – ')}
          </span>
          {times.label !== '' && (
            <span className="times-label">{times.label}</span>
          )}
        </span>
      }
    />
  )
}

// MARK: A flight's details, in the agent's pane (AgentPane.tsx)

/**
 * A flight (`FlightPage`), laid out as the iPhone's sheet: the route over
 * its stops and time; the total, its price in green; a card per flight
 * (from and to with the airline's logo, departing and arriving, then the
 * flight, the cabin and the time in the air), the layover between two, a
 * round trip's two ways under their own titles; then the fare's terms in a
 * card of their own. Nothing to press but × and Book.
 */
export function FlightPage({ offer }: { offer: FlightOffer }) {
  const from = offer.from !== '' ? offer.from : (offer.legs[0]?.from ?? '')
  const to = offer.to !== '' ? offer.to : (offer.legs.at(-1)?.to ?? '')
  // "SEA → LAX", as the Mac's (PaneMembersFlight.swift) and the old app's flight pane: an arrow reads the same in every language.
  const route = [from, to].filter((part) => part !== '').join(' → ')
  const fare = terms(offer)
  const flightShape = shape(offer)
  return (
    <section className="flight-page" aria-label={route}>
      <div className="flight-page-head">
        <h2 className="flight-page-route">{route}</h2>
        {flightShape !== '' && (
          <div className="flight-page-shape">{flightShape}</div>
        )}
      </div>
      {offer.price !== '' && (
        <div className="flight-total">
          <div className="flight-total-line">
            <span className="flight-total-words">{t('Total Price')}</span>
            <span className="flight-total-price">{offer.price}</span>
          </div>
          {offer.priceNote !== '' && (
            <div className="flight-total-note">{offer.priceNote}</div>
          )}
        </div>
      )}
      {ways(offer).map((way, wayIndex) => (
        <div key={wayIndex} className="flight-way">
          {way.title !== '' && (
            <div className="flight-way-title">{way.title}</div>
          )}
          {way.legs.map((leg, index) => (
            <Fragment key={index}>
              <FlightLegCard
                leg={leg}
                logo={leg.logo === '' ? offer.logo : leg.logo}
              />
              {index < way.legs.length - 1 && layoverLine(leg) !== '' && (
                <div className="flight-layover">
                  <MacSymbol name="clock" size={15} weight={1.3} />
                  <span>{layoverLine(leg)}</span>
                </div>
              )}
            </Fragment>
          ))}
        </div>
      ))}
      {fare.length > 0 && (
        <div className="flight-terms">
          {fare.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      )}
    </section>
  )
}

/** One flight (`FlightLegCard`): from and to with the airline's logo, departing and arriving, then under a hairline the flight, the cabin and the time in the air, in grey. */
function FlightLegCard({ leg, logo }: { leg: FlightLeg; logo: string }) {
  const details = [
    ...flightLines(leg),
    leg.cabin,
    leg.duration === '' ? '' : t`${leg.duration} in the air`,
  ].filter((line) => line !== '')
  const moment = (
    symbol: SymbolName,
    label: string,
    value: string,
  ): ReactNode =>
    value !== '' && (
      <div className="flight-moment">
        <span className="flight-moment-symbol">
          <MacSymbol name={symbol} size={13} weight={1.6} />
        </span>
        <span className="flight-moment-label">{label}</span>
        <span className="flight-moment-value">{value}</span>
      </div>
    )
  return (
    <div className="flight-leg">
      <div className="flight-leg-head">
        <span className="flight-leg-route">
          {[leg.from, leg.to].filter((part) => part !== '').join(' → ')}
        </span>
        <AirlineMark name={leg.carrier} logo={logo} side={30} />
      </div>
      <div className="flight-moments">
        {moment('arrowUpRight', t('Departing'), departing(leg))}
        {moment('arrowDownLeft', t('Arriving'), arriving(leg))}
      </div>
      {details.length > 0 && (
        <>
          <div className="flight-leg-rule" />
          <div className="flight-leg-details">
            {details.map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** "Book with Simeon" under a flight (`BookFlightButton`): the traveller form goes into the chat and the pane closes (`done`), or the reason it can't. */
export function BookFlightButton({
  store,
  flight,
  done,
}: {
  store: AppStore
  flight: OpenFlight
  done: () => void
}) {
  const [booking, setBooking] = useState(false)
  const [refused, setRefused] = useState<string>()
  // Each flight its own button (keyed by the flight): another flight never shows the last one's refusal.
  const place = flightPlace(flight.key)
  if (flight.offer.offerId === '' || place == null) return null
  const book = async () => {
    setBooking(true)
    setRefused(undefined)
    const answer = await store.startFlightBooking(
      place.rowId,
      place.index,
      flight.agentId,
    )
    setBooking(false)
    // The details close, unless the person has opened another flight meanwhile.
    if (bookingOK(answer)) done()
    else setRefused(answer.message)
  }
  return (
    <div className="book-flight">
      {refused != null && <div className="book-flight-refused">{refused}</div>}
      <button
        type="button"
        className="book-flight-button"
        disabled={booking}
        aria-busy={booking}
        aria-label={t('Book with Simeon')}
        aria-describedby="book-flight-hint"
        onClick={() => void book()}
      >
        {booking ? <Spinner /> : t('Book with Simeon')}
      </button>
      <span id="book-flight-hint" hidden>
        {t('Shows the traveller form in the chat')}
      </span>
    </div>
  )
}

// MARK: The travellers' form

/** The flight's date and times, then its fare and total, and what changed since the search (`MacFlightLines`). */
function FlightLines({ flight }: { flight: BookedFlight }) {
  const when = whenLine(flight)
  const fare = fareLine(flight)
  return (
    <div className="flight-lines">
      {when !== '' && <div className="flight-when">{when}</div>}
      {fare !== '' && <div className="flight-fare">{fare}</div>}
      {flight.changed !== '' && (
        <div className="flight-changed">{flight.changed}</div>
      )}
    </div>
  )
}

/**
 * The traveller form as a card in the chat (`FlightPassengersCardView`), a
 * Mac's: at most 520 wide, 20 round, padded 16, its parts 14 apart; the
 * airline's mark (44) beside "Travellers" (15, 600, with "Test" for a
 * pretend airline) over the route; the flight's lines; then "Add traveller
 * details" at the right, as wide as its words, which opens the sheet, with
 * why Continue didn't go through over it; once answered, the names saved
 * with a green tick, or "Canceled".
 */
function FlightPassengersCardView({
  entryId,
  agentId,
  card,
  store,
}: {
  entryId: string
  agentId: string
  card: FlightPassengersCard
  store: AppStore
}) {
  const [filling, setFilling] = useState(false)
  const title = travellersTitle()
  return (
    <div
      className="passengers-card"
      role="group"
      aria-label={t`${title}, ${card.flight.route}`}
    >
      <div className="passengers-head">
        <AirlineMark
          name={card.flight.airline}
          logo={card.flight.logo}
          side={44}
        />
        <div className="passengers-words">
          <div className="passengers-title-line">
            <span className="passengers-title">{title}</span>
            {card.flight.isTest && <StatusPill words={t('Test')} />}
          </div>
          <div className="passengers-route">{card.flight.route}</div>
        </div>
      </div>
      <FlightLines flight={card.flight} />
      {card.state === 'open' ? (
        <div className="passengers-open">
          {card.note != null && (
            <div className="passengers-note">{card.note}</div>
          )}
          <div className="passengers-buttons">
            <button
              type="button"
              className="passengers-fill"
              onClick={() => setFilling(true)}
            >
              {fillInWords()}
            </button>
          </div>
        </div>
      ) : (
        <div className="passengers-settled" role="status">
          <span className={classes('passengers-tick', card.state)}>
            <FilledCircle
              mark={card.state === 'saved' ? 'check' : 'minus'}
              size={15}
            />
          </span>
          <span className="passengers-status">{passengersStatus(card)}</span>
        </div>
      )}
      {filling && (
        <TravellersSheet
          entryId={entryId}
          agentId={agentId}
          card={card}
          store={store}
          close={() => setFilling(false)}
        />
      )}
    </div>
  )
}

/** The one popover open in the sheet: a day's calendar, by its row. */
type Popover = { row: string; anchor: HTMLElement }

/**
 * The travellers' details on a sheet (`MacTravellersSheet`), in the app's
 * own parts: the glass disc that closes it and the title at its top; the
 * flight on a card; each traveller a group of 56-high rows, the label on
 * the left and the field or the menu ("Choose ⌄") on the right; a day as
 * the iPhone's, its date in a grey pill opening a calendar; Add passport an
 * action in the link blue; Continue the sheet's one wide button in the
 * blue. The first thing to fix shows in red under its traveller. What is
 * typed is held here only, never kept: closing the sheet forgets it.
 */
function TravellersSheet({
  entryId,
  agentId,
  card,
  store,
  close,
}: {
  entryId: string
  agentId: string
  card: FlightPassengersCard
  store: AppStore
  close: () => void
}) {
  const [travellers, setTravellers] = useState<Traveller[]>(() =>
    startingTravellers(card),
  )
  const [problem, setProblem] = useState<{ index: number; message: string }>()
  const [sending, setSending] = useState(false)
  const [popover, setPopover] = useState<Popover>()
  const title = travellersTitle()
  // Escape and a click outside: the calendar first, then the sheet, never while Continue is on its way.
  const dismiss = () => {
    if (popover) {
      const anchor = popover.anchor
      setPopover(undefined)
      anchor.focus()
      return
    }
    if (!sending) close()
  }
  const send = async () => {
    if (sending) return
    for (const [index, traveller] of travellers.entries()) {
      const found = travellerProblem(
        traveller,
        card.flight.documentsRequired,
        adultOn(card, index),
      )
      if (found) {
        setProblem({ index, message: found.message })
        return
      }
    }
    setProblem(undefined)
    setSending(true)
    const answer = await store.submitFlightPassengers(
      entryId,
      travellers,
      agentId,
    )
    setSending(false)
    if (bookingOK(answer)) close()
    else
      setProblem({
        index: answer.index ?? 0,
        message: answer.message ?? t("That didn't work."),
      })
  }
  const fare = fareLine(card.flight)
  const when = whenLine(card.flight)
  return (
    <Sheet label={title} close={dismiss} className="travellers-sheet">
      <div className="travellers-top">
        <div className="travellers-title" role="heading" aria-level={2}>
          {title}
        </div>
        <button
          type="button"
          className="travellers-close glass-disc"
          title={cancelWords()}
          aria-label={cancelWords()}
          disabled={sending}
          onClick={() => {
            if (!sending) close()
          }}
        >
          <MacSymbol name="xmark" size={13} weight={1.4} />
        </button>
      </div>
      <form
        className="travellers-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <div className="travellers-scroll">
          <div className="travellers-flight">
            <div className="travellers-flight-card">
              <AirlineMark
                name={card.flight.airline}
                logo={card.flight.logo}
                side={44}
              />
              <div className="travellers-flight-words">
                <div className="travellers-flight-route-line">
                  <span className="travellers-flight-route">
                    {card.flight.route}
                  </span>
                  {card.flight.isTest && <StatusPill words={t('Test')} />}
                </div>
                {when !== '' && (
                  <div className="travellers-flight-when">{when}</div>
                )}
                {fare !== '' && (
                  <div className="travellers-flight-fare">{fare}</div>
                )}
                {card.flight.changed !== '' && (
                  <div className="travellers-flight-changed">
                    {card.flight.changed}
                  </div>
                )}
              </div>
            </div>
            <div className="travellers-as-on-id">{asOnIDWords()}</div>
          </div>
          {travellers.map((traveller, index) => (
            <TravellerGroup
              key={index}
              row={`t${index}`}
              traveller={traveller}
              change={(next) =>
                setTravellers((now) =>
                  now.map((one, at) => (at === index ? next : one)),
                )
              }
              heading={seatLabel(card, index)}
              passportNeeded={card.flight.documentsRequired}
              problem={problem?.index === index ? problem.message : undefined}
              popover={popover}
              setPopover={setPopover}
            />
          ))}
        </div>
        <div className="travellers-bottom">
          <button
            type="submit"
            className="travellers-continue"
            disabled={sending}
            aria-busy={sending}
          >
            {sending && <Spinner />}
            <span>{continueWords()}</span>
          </button>
        </div>
      </form>
    </Sheet>
  )
}

/** One traveller (`MacTravellerGroup`): their seat's name over a card of rows; the first thing to fix in red under it. */
function TravellerGroup({
  row,
  traveller,
  change,
  heading,
  passportNeeded,
  problem,
  popover,
  setPopover,
}: {
  row: string
  traveller: Traveller
  change: (next: Traveller) => void
  heading: string
  passportNeeded: boolean
  problem?: string
  popover?: Popover
  setPopover: (next: Popover | undefined) => void
}) {
  const [showsPassport, setShowsPassport] = useState(false)
  const set = <K extends keyof Traveller>(key: K, value: Traveller[K]) =>
    change({ ...traveller, [key]: value })
  const now = new Date()
  // Years on from today as the Mac's calendar adds them: 29 February goes to the 28th in a year without one.
  const years = (count: number) => {
    const date = new Date(now)
    date.setDate(1)
    date.setFullYear(date.getFullYear() + count)
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    date.setDate(Math.min(now.getDate(), last.getDate()))
    return date
  }
  const day = (
    name: string,
    label: string,
    value: string,
    pick: (value: string) => void,
    range: [Date, Date],
    start: Date,
  ) => (
    <DayRow
      label={label}
      day={value}
      pick={pick}
      range={range}
      start={start}
      anchor={popover?.row === `${row}.${name}` ? popover.anchor : undefined}
      setOpen={(anchor) =>
        setPopover(anchor ? { row: `${row}.${name}`, anchor } : undefined)
      }
    />
  )
  const headingId = `${row}-heading`
  return (
    <section className="traveller-group" aria-labelledby={headingId}>
      <div className="traveller-heading" id={headingId}>
        {heading}
      </div>
      <div className="traveller-card">
        <TextRow
          label={t('First name')}
          value={traveller.givenName}
          change={(value) => set('givenName', value)}
          autoComplete="given-name"
          divided={false}
        />
        <TextRow
          label={t('Last name')}
          value={traveller.familyName}
          change={(value) => set('familyName', value)}
          autoComplete="family-name"
        />
        <MenuRow
          label={tk('traveller.title')}
          options={travellerTitles.map((value) => ({
            value,
            label: titleLabel(value),
          }))}
          value={traveller.title}
          pick={(value) => set('title', value as TravellerTitle)}
        />
        <MenuRow
          label={t('Gender on ID')}
          options={travellerGenders.map((value) => ({
            value,
            label: genderLabel(value),
          }))}
          value={traveller.gender}
          pick={(value) => set('gender', value as TravellerGender)}
        />
        {day(
          'born',
          t('Date of birth'),
          traveller.bornOn,
          (value) => set('bornOn', value),
          [years(-120), now],
          years(-30),
        )}
        <TextRow
          label={t('Email')}
          value={traveller.email}
          change={(value) => set('email', value)}
          autoComplete="email"
          inputMode="email"
        />
        <TextRow
          label={t('Phone, with country code')}
          value={traveller.phone}
          change={(value) => set('phone', value)}
          autoComplete="tel"
          inputMode="tel"
        />
        {passportNeeded || showsPassport ? (
          <>
            <TextRow
              label={t('Passport number')}
              value={traveller.passportNumber}
              change={(value) => set('passportNumber', value)}
              autoComplete="off"
            />
            <MenuRow
              label={t('Issued by')}
              options={(countries as [string, string][]).map(
                ([value, label]) => ({ value, label }),
              )}
              value={
                traveller.passportCountry === ''
                  ? undefined
                  : traveller.passportCountry
              }
              pick={(value) => set('passportCountry', value)}
            />
            {day(
              'expires',
              t('Passport expires'),
              traveller.passportExpires,
              (value) => set('passportExpires', value),
              [now, years(20)],
              years(1),
            )}
          </>
        ) : (
          <button
            type="button"
            className="traveller-add"
            onClick={() => setShowsPassport(true)}
          >
            <span className="traveller-add-symbol">
              <FilledCircle mark="plus" size={16} />
            </span>
            <span>{t('Add passport')}</span>
          </button>
        )}
      </div>
      {problem != null && problem !== '' && (
        <div className="traveller-problem" role="alert">
          {problem}
        </div>
      )}
    </section>
  )
}

/** A row's frame (`SettingsLine`): the label on the left (13), what it holds on the right; a line above it when it follows another. */
function Line({
  label,
  labelFor,
  divided = true,
  children,
}: {
  label: string
  labelFor?: string
  divided?: boolean
  children: ReactNode
}) {
  return (
    <div className={classes('traveller-line', divided && 'divided')}>
      {labelFor ? (
        <label className="traveller-label" htmlFor={labelFor}>
          {label}
        </label>
      ) : (
        <span className="traveller-label">{label}</span>
      )}
      <span className="traveller-trailing">{children}</span>
    </div>
  )
}

/**
 * A row with a field (`MacTextRow`): what is typed on the right, 300 wide
 * ("Required" until then), kept as typed (a plain text field with the
 * keyboard the content wants: a browser's own email field would rewrite an
 * address). Return is Continue.
 */
function TextRow({
  label,
  value,
  change,
  autoComplete,
  inputMode,
  divided = true,
}: {
  label: string
  value: string
  change: (value: string) => void
  autoComplete: string
  inputMode?: 'email' | 'tel'
  divided?: boolean
}) {
  const id = useId()
  return (
    <Line label={label} labelFor={id} divided={divided}>
      <input
        id={id}
        className="traveller-field"
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={t('Required')}
        autoComplete={autoComplete}
        spellCheck={false}
        onChange={(event) => change(event.target.value)}
      />
    </Line>
  )
}

/**
 * A menu (`SettingsMenu`): "Choose" until something is, then the choice
 * (13, grey) with a chevron down, as wide as its words. The list is the
 * system's own: the menu is the browser's own picker laid over those words,
 * unseen, so it opens, takes the keys and types to a country as the
 * system's menus do.
 */
function MenuRow({
  label,
  options,
  value,
  pick,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string | undefined
  pick: (value: string) => void
}) {
  const id = useId()
  const shown =
    options.find((option) => option.value === value)?.label ?? t('Choose')
  return (
    <Line label={label} labelFor={id}>
      <span className="traveller-menu">
        <span className="traveller-menu-words" aria-hidden="true">
          {shown}
        </span>
        <MacSymbol
          name="chevronDown"
          size={9}
          weight={1.8}
          className="traveller-menu-chevron"
        />
        <select
          id={id}
          className="traveller-select"
          value={value ?? ''}
          onChange={(event) => pick(event.target.value)}
        >
          <option value="" disabled hidden>
            {t('Choose')}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
    </Line>
  )
}

// MARK: A day and its calendar

/** The month shown: its first day, at noon. */
const firstOf = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1, 12)

/** The day of the month in a month, at noon; none past the month's end. */
function dayIn(year: number, month: number, day: number): Date {
  const date = new Date(2000, 0, 1, 12)
  date.setFullYear(year, month, day)
  return date
}

const monthLength = (year: number, month: number) =>
  dayIn(year, month + 1, 0).getDate()

/** Whether a span of time has any of the range in it (`meets`). */
function meets(start: Date, end: Date, range: [Date, Date]): boolean {
  return end > range[0] && start <= range[1]
}

/** A whole day, from its midnight to the next. */
function dayAllowed(date: Date, range: [Date, Date]): boolean {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return meets(start, end, range)
}

function monthAllowed(year: number, month: number, range: [Date, Date]) {
  const start = new Date(2000, 0, 1)
  start.setFullYear(year, month, 1)
  const end = new Date(start)
  end.setMonth(end.getMonth() + 1)
  return meets(start, end, range)
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

/** The day the person's region starts its weeks on: 0 for Sunday, 1 for Monday… (`Calendar.firstWeekday`). */
function weekStart(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const first = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay
    if (first != null) return first % 7
  } catch {
    // An odd locale: Monday, as most of the world.
  }
  return /-(US|CA|MX|BR|JP|KR|IL|PH|TW|HK|IN|ZA)\b/.test(locale) ? 0 : 1
}

/**
 * A day ("YYYY-MM-DD") as the iPhone's (`MacDayRow`): "Choose" until there
 * is one, then the date in a grey pill ("Oct 23, 1996"); either opens the
 * calendar under it. Opened empty, it starts at `start`, as the iPhone's
 * Choose does.
 */
function DayRow({
  label,
  day,
  pick,
  range,
  start,
  anchor,
  setOpen,
}: {
  label: string
  day: string
  pick: (value: string) => void
  range: [Date, Date]
  start: Date
  /** The pill, while its calendar is open. */
  anchor?: HTMLElement
  setOpen: (anchor: HTMLElement | undefined) => void
}) {
  const open = anchor != null
  const date = dateOf(day)
  const locale = displayLocale()
  const shown = date
    ? new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(date)
    : t('Choose')
  return (
    <Line label={label}>
      <button
        type="button"
        className="day-pill"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          if (open) {
            setOpen(undefined)
            return
          }
          // Opened empty, the calendar starts at `start`, and that day is the traveller's.
          if (dateOf(day) == null) pick(dayOf(start))
          setOpen(event.currentTarget)
        }}
      >
        {shown}
      </button>
      {anchor && (
        <CalendarPopover
          anchor={anchor}
          label={label}
          day={dateOf(day) ?? start}
          pick={(next) => pick(dayOf(next))}
          range={range}
          locale={locale}
          close={() => setOpen(undefined)}
        />
      )}
    </Line>
  )
}

/** The calendar's popover under its pill (above it when the window has no room below), with the popover's arrow; a click outside closes it. */
function CalendarPopover({
  anchor,
  label,
  day,
  pick,
  range,
  locale,
  close,
}: {
  anchor: HTMLElement
  label: string
  day: Date
  pick: (date: Date) => void
  range: [Date, Date]
  locale: string
  close: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{
    left: number
    top: number
    above: boolean
    arrow: number
  }>()
  useLayoutEffect(() => {
    const at = () => {
      const pill = anchor.getBoundingClientRect()
      const popover = box.current?.getBoundingClientRect()
      if (!popover) return
      const width = popover.width
      const height = popover.height
      const gap = 10
      const left = Math.max(
        8,
        Math.min(
          window.innerWidth - width - 8,
          pill.left + pill.width / 2 - width / 2,
        ),
      )
      const above =
        pill.bottom + gap + height > window.innerHeight - 8 &&
        pill.top - gap - height >= 8
      const top = above ? pill.top - gap - height : pill.bottom + gap
      setPlace({ left, top, above, arrow: pill.left + pill.width / 2 - left })
    }
    at()
    window.addEventListener('resize', at)
    const scroller = anchor.closest('.travellers-scroll')
    scroller?.addEventListener('scroll', at)
    return () => {
      window.removeEventListener('resize', at)
      scroller?.removeEventListener('scroll', at)
    }
  }, [anchor])
  // Once it is placed (it is laid out unseen first, to be measured), the chosen day has the keys.
  const placed = place != null
  useEffect(() => {
    if (placed)
      box.current
        ?.querySelector<HTMLButtonElement>('[data-focused="true"]')
        ?.focus()
  }, [placed])
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      const target = event.target as Node
      if (box.current?.contains(target) || anchor.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', outside, true)
    return () => document.removeEventListener('mousedown', outside, true)
  }, [anchor, close])
  return (
    <div
      ref={box}
      className={classes('calendar-popover', place?.above && 'above')}
      role="dialog"
      aria-label={label}
      style={
        place
          ? { left: place.left, top: place.top }
          : { left: 0, top: 0, visibility: 'hidden' }
      }
    >
      <span
        className="calendar-arrow"
        style={{ left: (place?.arrow ?? 0) - 9 }}
      />
      <Calendar day={day} pick={pick} range={range} locale={locale} />
    </div>
  )
}

/**
 * The calendar (`MacCalendar`), drawn as the iPhone's: the month and year
 * with a blue chevron that turns them into a month list and a year list (a
 * birthday is decades back), ‹ › for the months either side, then the
 * days; the chosen one blue on a pale blue disc (white on a blue one when
 * it is today), today in blue, a day outside the range grey and still. Six
 * weeks tall whatever the month, so it never jumps. With keys: the arrows
 * walk the days (a week up and down), Page Up and Page Down the months
 * (with Shift the years), Home and End the week; Return or Space picks.
 */
function Calendar({
  day,
  pick,
  range,
  locale,
}: {
  day: Date
  pick: (date: Date) => void
  range: [Date, Date]
  locale: string
}) {
  const [month, setMonth] = useState(() => firstOf(day))
  const [choosing, setChoosing] = useState(false)
  const [focused, setFocused] = useState(() => day)
  const grid = useRef<HTMLDivElement>(null)
  const walking = useRef(false)
  const today = new Date()
  const year = month.getFullYear()
  const first = weekStart(locale)
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short' })
      .format(new Date(2023, 0, 1 + ((first + index) % 7), 12))
      .toLocaleUpperCase(locale),
  )
  const lead = (month.getDay() - first + 7) % 7
  const count = monthLength(year, month.getMonth())
  const cells: (number | undefined)[] = [
    ...Array.from({ length: lead }, () => undefined),
    ...Array.from({ length: count }, (_, index) => index + 1),
  ]
  while (cells.length < 42) cells.push(undefined)
  const title = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
  }).format(month)
  // The day that takes the keys in this month: the one walked to, else the chosen one, else its first in the range.
  const inMonth = (date: Date) =>
    date.getFullYear() === year && date.getMonth() === month.getMonth()
  const keyed = inMonth(focused)
    ? focused
    : inMonth(day)
      ? day
      : (Array.from({ length: count }, (_, index) =>
          dayIn(year, month.getMonth(), index + 1),
        ).find((date) => dayAllowed(date, range)) ?? month)
  const step = (months: number) => {
    const target = new Date(month)
    target.setMonth(target.getMonth() + months)
    return target
  }
  const stepAllowed = (months: number) => {
    const target = step(months)
    return monthAllowed(target.getFullYear(), target.getMonth(), range)
  }
  // The day the keys are on stays in view, and has the keys once they walked.
  useEffect(() => {
    if (!walking.current) return
    walking.current = false
    grid.current
      ?.querySelector<HTMLButtonElement>('[data-focused="true"]')
      ?.focus()
  }, [focused, month])
  const walk = (next: Date) => {
    const clamped =
      next < range[0]
        ? new Date(range[0])
        : next > range[1]
          ? new Date(range[1])
          : next
    clamped.setHours(12, 0, 0, 0)
    walking.current = true
    setFocused(clamped)
    setMonth(firstOf(clamped))
  }
  const keys = (event: React.KeyboardEvent) => {
    const next = new Date(keyed)
    switch (event.key) {
      case 'ArrowLeft':
        next.setDate(next.getDate() - 1)
        break
      case 'ArrowRight':
        next.setDate(next.getDate() + 1)
        break
      case 'ArrowUp':
        next.setDate(next.getDate() - 7)
        break
      case 'ArrowDown':
        next.setDate(next.getDate() + 7)
        break
      case 'Home':
        next.setDate(next.getDate() - ((next.getDay() - first + 7) % 7))
        break
      case 'End':
        next.setDate(next.getDate() + (6 - ((next.getDay() - first + 7) % 7)))
        break
      case 'PageUp':
      case 'PageDown': {
        const by = (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1)
        const target = dayIn(next.getFullYear(), next.getMonth() + by, 1)
        target.setDate(
          Math.min(
            next.getDate(),
            monthLength(target.getFullYear(), target.getMonth()),
          ),
        )
        next.setTime(target.getTime())
        break
      }
      default:
        return
    }
    event.preventDefault()
    walk(next)
  }
  /** A month or a year from the lists: the calendar shows it, and the chosen day moves there (its day of the month kept where the month has it), within the range. */
  const choose = (nextYear: number, nextMonth: number) => {
    const shown = dayIn(nextYear, nextMonth, 1)
    setMonth(shown)
    const moved = dayIn(
      nextYear,
      nextMonth,
      Math.min(day.getDate(), monthLength(nextYear, nextMonth)),
    )
    const kept =
      moved < range[0] ? range[0] : moved > range[1] ? range[1] : moved
    pick(kept)
    setFocused(kept)
  }
  const years: number[] = []
  for (
    let one = range[0].getFullYear();
    one <= range[1].getFullYear();
    one += 1
  )
    years.push(one)
  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { month: 'long' }).format(
      new Date(2023, index, 1, 12),
    ),
  )
  return (
    <div className="calendar">
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-title"
          aria-expanded={choosing}
          onClick={() => setChoosing((now) => !now)}
        >
          <span>{title}</span>
          <MacSymbol
            name="chevronRight"
            size={14}
            weight={2}
            className={classes('calendar-title-chevron', choosing && 'open')}
          />
        </button>
        {!choosing && (
          <span className="calendar-steps">
            {([-1, 1] as const).map((by) => (
              <button
                key={by}
                type="button"
                className="calendar-step"
                disabled={!stepAllowed(by)}
                aria-label={by < 0 ? t('Previous month') : t('Next month')}
                onClick={() => setMonth(step(by))}
              >
                <MacSymbol
                  name={by < 0 ? 'chevronLeft' : 'chevronRight'}
                  size={17}
                  weight={2}
                />
              </button>
            ))}
          </span>
        )}
      </div>
      {choosing ? (
        <div className="calendar-lists">
          <CalendarList
            values={Array.from({ length: 12 }, (_, index) => index)}
            chosen={month.getMonth()}
            name={(value) => monthNames[value]!}
            allowed={(value) => monthAllowed(year, value, range)}
            pick={(value) => choose(year, value)}
          />
          <CalendarList
            values={years}
            chosen={year}
            name={(value) => String(value)}
            allowed={() => true}
            pick={(value) => choose(value, month.getMonth())}
            narrow
          />
        </div>
      ) : (
        <div className="calendar-days">
          <div className="calendar-weekdays" aria-hidden="true">
            {weekdays.map((name, index) => (
              <span key={index}>{name}</span>
            ))}
          </div>
          <div
            ref={grid}
            className="calendar-grid"
            role="group"
            aria-label={title}
            onKeyDown={keys}
          >
            {cells.map((number, index) => {
              if (number == null)
                return (
                  <span
                    key={index}
                    className="calendar-cell"
                    role="presentation"
                  />
                )
              const date = dayIn(year, month.getMonth(), number)
              const chosen = sameDay(date, day)
              const isToday = sameDay(date, today)
              const allowed = dayAllowed(date, range)
              const takesKeys = sameDay(date, keyed)
              return (
                <button
                  key={index}
                  type="button"
                  className={classes(
                    'calendar-day',
                    chosen && 'chosen',
                    isToday && 'today',
                  )}
                  tabIndex={takesKeys ? 0 : -1}
                  data-focused={takesKeys}
                  disabled={!allowed}
                  aria-pressed={chosen}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={new Intl.DateTimeFormat(locale, {
                    dateStyle: 'full',
                  }).format(date)}
                  onClick={() => {
                    setFocused(date)
                    pick(date)
                  }}
                >
                  <span className="calendar-disc">
                    {new Intl.NumberFormat(locale).format(number)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** The month or the year list (`MacCalendarList`): 17 each, the one shown blue on a pale blue band, scrolled to the middle when it opens; ↑ and ↓ walk it. */
function CalendarList({
  values,
  chosen,
  name,
  allowed,
  pick,
  narrow = false,
}: {
  values: number[]
  chosen: number
  name: (value: number) => string
  allowed: (value: number) => boolean
  pick: (value: number) => void
  narrow?: boolean
}) {
  const list = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const shown = list.current?.querySelector<HTMLElement>('.shown')
    const box = list.current
    if (shown && box)
      box.scrollTop =
        shown.offsetTop - box.clientHeight / 2 + shown.offsetHeight / 2
    // Scrolled once, as it opens.
  }, [])
  return (
    <div
      ref={list}
      className={classes('calendar-list', narrow && 'narrow')}
      role="group"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        event.preventDefault()
        const buttons = [
          ...(list.current?.querySelectorAll<HTMLButtonElement>(
            'button:not(:disabled)',
          ) ?? []),
        ]
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[
          Math.max(
            0,
            Math.min(
              buttons.length - 1,
              at + (event.key === 'ArrowDown' ? 1 : -1),
            ),
          )
        ]?.focus()
      }}
    >
      {values.map((value) => (
        <button
          key={value}
          type="button"
          className={classes('calendar-item', value === chosen && 'shown')}
          aria-pressed={value === chosen}
          disabled={!allowed(value)}
          onClick={() => pick(value)}
        >
          {name(value)}
        </button>
      ))}
    </div>
  )
}

/**
 * The design, as values.
 *
 * Every number and colour here was read out of `Pierce_Workspace.html` —
 * the founder's design, checked in at `docs/pierce/design/markup.html` —
 * rather than chosen. Nothing in this file is a preference, and nothing
 * should be adjusted to taste: if a screen needs a shade that is not here,
 * the design does not have that shade and the screen is wrong. Where this
 * file and the markup disagree, the markup is right.
 *
 * The neutral ramp is Microsoft's Fluent ramp. That is what makes the
 * panel look like it belongs inside Word and PowerPoint rather than like a
 * web page someone embedded, and it is worth protecting.
 */

/**
 * The size the design was drawn at.
 *
 * Carried in the design's own props — `{"$preview":{"width":1440,
 * "height":900}}` — and therefore not a guess. The workspace fills whatever
 * viewport it is given, so this is neither a maximum nor a minimum; it is
 * the size the proportions were chosen against, and the size to put a
 * browser at before saying a screen looks right.
 */
export const canvas = { width: 1440, height: 900 }

/**
 * Below this width the design is a different layout, not a squeezed one.
 *
 * `window.innerWidth < 1240` in the design, measured on the window rather
 * than on any container, on mount and on every resize. It moves the chat
 * column's basis, turns split screens from rows into columns, lets ribbons
 * wrap, and *removes* secondary furniture outright. See `useNarrow`.
 */
export const NARROW = 1240

// --- shared with the Office panel: keep byte-identical --------------------
//
// The panel is a separate application with a separate bundler, and these
// values have to be the same in both or the two halves of the product drift
// apart a shade at a time. Rather than couple two build systems over sixty
// lines of constants, the block is copied into
// `clients/apps/panel/src/design.ts` and `design.test.ts` there fails the
// build if the two ever differ. Edit one, edit the other.

export const font = {
  ui: "'Hanken Grotesk', system-ui, sans-serif",
  /** Office surfaces read as Office. */
  office: "'Segoe UI', 'Hanken Grotesk', system-ui, sans-serif",
  /** Figures, cell references, formulas. Never prose. */
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  display: "'Cormorant Garamond', Georgia, serif",
}

export const colour = {
  /** Body text. */
  ink: '#242424',
  /** Secondary text — captions, metadata, the right-hand meta on a tab. */
  muted: '#605e5c',
  /** Tertiary — placeholder, disabled, the quietest labels. */
  faint: '#8a8886',
  fainter: '#a19f9d',
  /** Hairlines. */
  rule: '#f0eeec',
  ruleStrong: '#edebe9',
  ruleHeavy: '#c8c6c4',
  /** Surfaces. */
  paper: '#ffffff',
  wash: '#faf9f8',
  washer: '#f5f4f2',
  band: '#f3f2f1',
  bandWarm: '#f2f1ef',
  /** The one accent. */
  blue: '#0b62c4',
  blueLift: '#1d7de6',
  bluePress: '#0d5cb4',
  blueDeep: '#146fd2',
  blueBright: '#2f8bef',
  /** Severity. Three levels, the design's own vocabulary. */
  critical: '#b04434',
  warning: '#b3822f',
  note: '#8a8886',
  /** Agreement. */
  matching: '#4f7a5c',
  matchingDeep: '#2f5d3f',
  /** Dark chips and the deck canvas. */
  dark: '#15171b',
  darker: '#22252b',
  slate: '#8b909a',
  slateDeep: '#5b6068',
  slateFaint: '#9aa0a8',
  slateMid: '#7c828c',
  /** The composer's own border — the one hairline that is not the ramp. */
  composerRule: '#d7d7d3',
}

// --- end shared ----------------------------------------------------------

/** The page behind the panels. */
export const pageBackground =
  'radial-gradient(120% 100% at 20% -10%, #ffffff 0%, #f4f5f7 42%, #e9ebef 72%, #e2e4e9 100%)'

/**
 * A floating panel — the left surface and the chat column.
 *
 * The frosted glass is the design's signature and the reason the panels
 * read as sitting *above* the page rather than cut into it.
 */
export const panel = {
  background: 'rgba(255,255,255,.92)',
  backdropFilter: 'blur(20px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
  border: '1px solid rgba(255,255,255,.9)',
  borderRadius: 20,
  boxShadow:
    '0 14px 40px rgba(16,20,28,.10), 0 0 0 1px rgba(16,20,28,.04), inset 0 1px 0 rgba(255,255,255,.9)',
  overflow: 'hidden',
} as const

/** The pill that names the open document, top-left of a panel. */
export const tabChip = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  background: 'rgba(255,255,255,.75)',
  border: '1px solid rgba(255,255,255,.7)',
  boxShadow: '0 1px 2px rgba(18,24,40,.08)',
  borderRadius: 11,
  padding: '8px 14px',
  fontWeight: 500,
} as const

/** The chat column. More transparent than the left panel, and a touch more saturated. */
export const chatPanel = {
  background: 'rgba(255,255,255,.74)',
  backdropFilter: 'blur(20px) saturate(1.5)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
  border: '1px solid rgba(255,255,255,.9)',
  borderRadius: 20,
  boxShadow:
    '0 14px 40px rgba(16,20,28,.10), 0 0 0 1px rgba(16,20,28,.04), inset 0 1px 0 rgba(255,255,255,.9)',
  overflow: 'hidden',
} as const

/**
 * How wide the chat is.
 *
 * A fixed basis, not a fraction: the chat is a margin beside the document
 * and stays the width of a margin as the window grows. With nothing beside
 * it, it takes the room and centres a 720px column inside itself, which is
 * why the empty state reads as a page rather than a stretched sidebar.
 */
export const chatWidth = {
  /** `flex`, with the left panel open. */
  beside: { wide: '0 1 430px', narrow: '0 1 340px' },
  /** `flex`, alone. */
  alone: '1 1 auto',
  minWidth: { wide: 330, narrow: 280 },
  /** `max-width` of the thread and the composer within the column. */
  column: { beside: '100%', alone: 720 },
} as const

/** The dock's floating bar. Blurred harder than the panels, and rounder. */
export const dock = {
  /** The row it sits in — a fixed band, so the panels above never shift. */
  row: 86,
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '7px 10px',
    background: 'rgba(255,255,255,.72)',
    backdropFilter: 'blur(30px) saturate(1.6)',
    WebkitBackdropFilter: 'blur(30px) saturate(1.6)',
    border: '1px solid rgba(255,255,255,.95)',
    borderRadius: 22,
    boxShadow:
      '0 10px 28px rgba(16,20,28,.12), 0 0 0 1px rgba(16,20,28,.04), inset 0 1px 0 rgba(255,255,255,.9)',
  },
  /** The live button carries a fill, not a colour. */
  live: 'rgba(16,20,28,.08)',
  /** The divider before the last two. */
  divider: { width: 1, height: 24, background: 'rgba(21,23,27,.14)', margin: '0 7px' },
} as const

/** The composer, in the chat and nowhere else. */
export const composer = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  border: '1px solid #d7d7d3',
  background: '#ffffff',
  borderRadius: 999,
  padding: '9px 9px 9px 16px',
  boxShadow: '0 6px 22px rgba(16,20,28,.13)',
} as const

/** The send button's fill. The one gradient in the design. */
export const sendFill = {
  rest: 'linear-gradient(180deg,#1d7de6 0%,#0b62c4 55%,#0a51a5 100%)',
  shadow:
    '0 1px 2px rgba(0,60,140,.28), 0 0 0 .5px rgba(0,80,180,.35) inset, 0 1px 0 rgba(255,255,255,.45) inset',
} as const

export const size = {
  body: 14.5,
  meta: 13.5,
  small: 12.5,
  tiny: 11.5,
  title: 19,
  headline: 22,
  /** The greeting, and only the greeting. */
  greeting: 25,
  /** What is typed. Larger than what is read. */
  prompt: 15,
}

export const radius = { panel: 20, chip: 11, control: 10, dock: 22, pill: 999 }

export const space = { page: 18, gap: 14, panelPad: 22, row: 14 }

/**
 * The design's values, named.
 *
 * Source of truth: `docs/pierce/design-antford/workspace.html` (the
 * founder's Antford redesign, 14 August, revised 15 August — the v2
 * file with the statement-check sections). Every constant here is a
 * value that appears verbatim in that file; if a value here disagrees
 * with the file, the file is right. Nothing here is invented — where a
 * screen needs something the design does not draw, the component says
 * which pattern it borrowed, not this file.
 */

// --- shared with the Office panel: keep byte-identical --------------------
//
// The panel is a separate application with a separate bundler, and these
// values have to be the same in both or the two halves of the product
// drift apart a shade at a time. Rather than couple two build systems
// over a block of constants, it is copied into
// `clients/apps/panel/src/design.ts` and `design.test.ts` there fails the
// build if the two ever differ. Edit one, edit the other.

/** The face. Loaded by `workspace.css` from the design's own binaries. */
export const font = {
  ui: "'Instrument Sans', -apple-system, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  /** The Antford wordmark, and only the wordmark. */
  brand: "'Bodoni Moda', Didot, Georgia, serif",
} as const

export const ink = {
  /** Body text on the frame — the design's base color. */
  base: '#242424',
  /** Primary text inside cards. */
  primary: '#1d1d1f',
  /** Secondary — row subtitles, meta. */
  secondary: '#86868b',
  /** Muted — "Checked 2 hours ago" on the right of a row. */
  faint: '#aeaeb2',
  /** The dock's inactive tab, chat secondary text. */
  dock: '#5b6068',
  /** Accent: links, primary buttons, "to review" states, active tab. */
  accent: '#0060d0',
  /** Primary button pressed/hover. */
  accentDown: '#0055ba',
  /** Stale text. */
  stale: '#c8790a',
  /** Stale dot and the model grid's highlight. */
  staleDot: '#ff9f0a',
  /** The failing check's dot — the Antford design's amber. */
  failDot: '#e8a33d',
  /** Clean state text and dot. */
  clean: '#34c759',
  /** Destructive — "Sign out". */
  danger: '#ff3b30',
} as const

// --- end shared ----------------------------------------------------------

/** The frame's ground — drawn once, behind everything. */
export const ground =
  'radial-gradient(120% 100% at 20% -10%, #ffffff 0%, #f4f5f7 42%, #e9ebef 72%, #e2e4e9 100%)'

/** The floating main card. */
export const card = {
  background: 'rgba(255,255,255,.92)',
  backdropFilter: 'blur(20px) saturate(1.4)',
  border: '1px solid rgba(255,255,255,.9)',
  borderRadius: 20,
  boxShadow:
    '0 14px 40px rgba(16,20,28,.10), 0 0 0 1px rgba(16,20,28,.04), inset 0 1px 0 rgba(255,255,255,.9)',
} as const

/** Content wells inside the card sit on this. */
export const well = '#f5f5f7'

/** The card's edge — the v2 design retires the drop shadow for a flat
 *  hairline ring, and raises it softly only under a pointer. */
export const cardRing = '0 0 0 .5px rgba(30,32,38,.09)'
export const cardRingHover =
  '0 0 0 .5px rgba(30,32,38,.18), 0 6px 18px rgba(20,23,30,.06)'

/** The white list card that rows live in. */
export const listCard = {
  background: '#fff',
  borderRadius: 14,
  boxShadow: cardRing,
} as const

/** The failing card's headline figure — the v2 design's one purple. */
export const figureInk = '#635bff'

/** The cell reference under a failing card, set in the mono face. */
export const cellRefInk = '#2a9d4f'

/** Hairline between rows — always via border-top, never on the first. */
export const hairline = '.5px solid #eceaec'

/** Section heading over a list card. The Antford design sets it 500. */
export const sectionHead = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  color: '#86868b',
} as const

/**
 * The Antford shell: a full-bleed white pane under a 54px header bar,
 * panes separated by a 1px seam, the dock a translucent bar along the
 * bottom. The floating-card frame of the first workspace is retired
 * with it.
 */
export const shell = {
  headerHeight: 54,
  headerHairline: '1px solid #f0eeec',
  paneSeam: '#eae7e2',
  dockBar: {
    background: 'rgba(247,247,249,.82)',
    borderTop: '1px solid #f0eeec',
    backdropFilter: 'blur(20px) saturate(1.4)',
  },
} as const

/** The wordmark as the design draws it, ready to spread. */
export const wordmark = {
  fontFamily: font.brand,
  fontSize: 23,
  fontWeight: 400,
  letterSpacing: '.005em',
  lineHeight: 1,
} as const

/** The grey secondary button — "Recheck", "Cancel" on cards. */
export const greyButton = {
  border: 0,
  background: '#f0f0f2',
  borderRadius: 9,
  padding: '8px 15px',
  font: 'inherit',
  fontSize: 13.5,
  fontWeight: 500,
  color: '#1d1d1f',
  cursor: 'pointer',
} as const

/** The blue primary button in the header — "New deal", "Check now". */
export const blueButton = {
  border: 0,
  background: '#0060d0',
  color: '#fff',
  borderRadius: 11,
  padding: '9px 16px',
  font: 'inherit',
  fontSize: 13.5,
  fontWeight: 500,
  cursor: 'pointer',
} as const

/**
 * Writing boxes. The standing rule, from the design and from the founder
 * in words: `border:0; outline:none`, background `#f0f0f2` or
 * transparent, focus — where it exists at all — is the soft glow below.
 * Never a border, never an outline, never an underline.
 */
export const inputGlow = '0 0 0 3.5px rgba(0,96,208,.25)'

/** File icons, extracted from the design file and self-hosted. */
export const fileIcon = {
  ppt: '/workspace/powerpoint.webp',
  doc: '/workspace/word.webp',
  xls: '/workspace/excel.webp',
  mail: '/workspace/outlook.webp',
} as const

export const microsoftLogo = '/workspace/microsoft.webp'
export const sharepointLogo = '/workspace/sharepoint.webp'
export const wordLogo = '/workspace/word.webp'
export const excelLogo = '/workspace/excel.webp'
export const powerpointLogo = '/workspace/powerpoint.webp'
export const outlookLogo = '/workspace/outlook.webp'

/** The canvas every screen was drawn at, and the size to verify at. */
export const canvas = { width: 1440, height: 900 } as const

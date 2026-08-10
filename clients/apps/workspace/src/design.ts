/**
 * The design, as values.
 *
 * Every number and colour here was read out of `Pierce_Workspace.html` —
 * the founder's design — rather than chosen. Nothing in this file is a
 * preference, and nothing should be adjusted to taste: if a screen needs a
 * shade that is not here, the design does not have that shade and the
 * screen is wrong.
 *
 * The neutral ramp is Microsoft's Fluent ramp. That is what makes the
 * panel look like it belongs inside Word and PowerPoint rather than like a
 * web page someone embedded, and it is worth protecting.
 */

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
}

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

export const size = {
  body: 14.5,
  meta: 13.5,
  small: 12.5,
  tiny: 11.5,
  title: 19,
  headline: 22,
}

export const radius = { panel: 20, chip: 11, control: 10, pill: 999 }

export const space = { page: 18, gap: 14, panelPad: 22, row: 14 }

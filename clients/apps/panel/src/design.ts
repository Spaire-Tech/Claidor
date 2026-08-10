/**
 * The design's tokens, at panel scale.
 *
 * **Copied from `clients/apps/web/src/components/Workspace/design.ts`,
 * between its « shared with the Office panel » markers, and byte-identical
 * to it.** `design.test.ts` reads both files off disk and fails if they
 * ever differ, so this is a copy that cannot rot rather than a copy that
 * will.
 *
 * Why a copy at all: the panel is a separate application with a separate
 * bundler, and coupling two build systems over sixty lines of constants
 * buys a build failure the first time somebody deploys. The values are the
 * cheap part; being sure they are the same is the whole requirement, and a
 * test does that without touching either build.
 *
 * Everything *below* the shared block is the panel's own, because 320
 * pixels inside Word is not a floating panel on a gradient and the design
 * has no drawing of it. Each piece names the idiom it is composed from.
 */

// --- shared with the web workspace: keep byte-identical ------------------

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

/**
 * The panel is not a floating panel.
 *
 * The workspace's surface is frosted glass sitting above a gradient, and
 * none of that is right here: inside Word the host owns the chrome, the
 * background is Office's own, and a shadowed rounded card in a 320-pixel
 * task pane reads as a web page someone embedded. So the surface is
 * Office's white with the design's own hairline against the document, and
 * the type is `font.office` — Segoe UI first — which is the design's own
 * rule for its Office surfaces.
 */
export const surface = {
  background: colour.paper,
  fontFamily: font.office,
  color: colour.ink,
} as const

/**
 * Type at 320 pixels.
 *
 * Scaled down from the design's own ramp rather than invented: the
 * workspace's 19px heading is a heading on a 900-pixel column and shouting
 * on a 320-pixel one, so the panel takes the sizes the design already uses
 * for its *narrow* furniture — the mail list, the folder rail — where it
 * had the same problem.
 */
export const size = {
  /** The design's own narrow-column body. */
  body: 13.5,
  meta: 13,
  small: 12.5,
  tiny: 12,
  /** The deal name. The mail list's own subject size. */
  title: 15,
}

/** Room to breathe, at panel scale. The design's 26px gutter, halved. */
export const space = { gutter: 13, row: 11 }

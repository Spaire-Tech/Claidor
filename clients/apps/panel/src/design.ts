/**
 * The design's tokens, at panel scale.
 *
 * **Copied from `clients/apps/web/src/components/Workspace/design.ts`,
 * between its « shared with the Office panel » markers, and byte-identical
 * to it.** `design.test.ts` reads both files off disk and fails if they
 * ever differ, so this is a copy that cannot rot rather than a copy that
 * will. (The shared block's own comments describe the web side; here the
 * face is loaded by `panel.css` from the same self-hosted binaries.)
 *
 * Why a copy at all: the panel is a separate application with a separate
 * bundler, and coupling two build systems over a block of constants buys
 * a build failure the first time somebody deploys. The values are the
 * cheap part; being sure they are the same is the whole requirement, and
 * a test does that without touching either build.
 *
 * Everything *below* the shared block is the panel's own, because 320
 * pixels inside Word is not a floating panel on a gradient and the design
 * has no drawing of it. Each piece names the idiom it is composed from.
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
  mono: "'JetBrains Mono', ui-monospace, monospace",
  /** The Swens wordmark and the chat's serif S mark. */
  brand: "'Bodoni Moda', Didot, Georgia, serif",
  /** The reading serif — the chat greeting and the answer lead. */
  serif: 'Newsreader, Georgia, serif',
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
  /** The failing check's dot — the design's amber. */
  failDot: '#e8a33d',
  /** Clean state text and dot. */
  clean: '#34c759',
  /** Destructive — "Sign out". */
  danger: '#ff3b30',
} as const

// --- end shared ----------------------------------------------------------

/**
 * The panel is not a floating panel.
 *
 * The workspace's surface is frosted glass sitting above a gradient, and
 * none of that is right here: inside Word the host owns the chrome, the
 * background is Office's own, and a shadowed rounded card in a 320-pixel
 * task pane reads as a web page someone embedded. So the surface is plain
 * white with the design's hairline against the document, in the design's
 * own face.
 */
export const surface = {
  background: '#ffffff',
  fontFamily: font.ui,
  color: ink.base,
} as const

/** The workspace's hairline and well, by value — the panel's own rules. */
export const shade = {
  rule: '#eceaec',
  wash: '#f5f5f7',
} as const

/**
 * Type at 320 pixels.
 *
 * Scaled down from the design's own ramp rather than invented: the
 * workspace's headings belong to a 900-pixel column and would shout on a
 * 320-pixel one, so the panel takes the sizes the design already uses
 * for its *narrow* furniture — row subtitles, locators, meta.
 */
export const size = {
  /** The design's own narrow-column body. */
  body: 13.5,
  meta: 13,
  small: 12.5,
  tiny: 12,
  /** The deal name. The design's row-title size. */
  title: 15,
}

/** Room to breathe, at panel scale. The design's gutter, halved. */
export const space = { gutter: 13, row: 11 }

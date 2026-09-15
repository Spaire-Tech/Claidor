/**
 * The design, as values.
 *
 * Every number and colour here was counted out of the founder's canvas
 * (`docs/product/design/canvas-template.html`), not invented. Where a
 * value appears many times in the canvas the count is noted, because that
 * is what makes it a token rather than a one-off.
 *
 * This file and `tokens.css` say the same thing twice, on purpose: CSS
 * needs custom properties, and the orb and anything else computing a
 * style in JavaScript needs the values themselves. `tokens.test.ts` holds
 * the two in agreement, so neither can drift.
 *
 * One look, deliberately. The app carries a four-theme skinning system
 * from upstream (`renderer/theme/`) which the old shell uses; this is not
 * a fifth theme, and nothing here goes through that contract.
 */

/** Colour. */
export const color = {
  /** Text, and the dark fill of a primary button. 76 uses. */
  ink: '#1e3358',
  /** A primary button under the pointer. */
  inkHover: '#2c4674',
  /** Secondary text, icon strokes, every hint and caption. 72 uses. */
  muted: '#55606f',
  /** Chevrons and the quietest glyphs. */
  faint: '#7d8797',
  /** The ground, and the raised surface that sits on it. 39 uses. */
  paper: '#fbfbfc',
  /** Inset fills: the composer, search, a key cap, an unselected row. */
  fill: '#e9edf2',
  /** The same idea one step up: a settings group, a card's inner panel. */
  fillRaised: '#eef1f5',
  /** A chip, a selected settings row. */
  fillStrong: '#e3e8ef',
  /** Links, and the label of a selected tab. */
  accent: '#2b6cf5',
  /**
   * A primary button that cannot be pressed yet — Create agent before the
   * name is typed. Greyed rather than hidden, because the button is what
   * tells you the form has an end.
   */
  disabled: '#aab3c0',
  /** The darker half of the shimmer that runs through a status line. */
  shimmerInk: '#1c1f23',
  /** The lighter half of it. */
  shimmerPale: '#b6bcc6',
  /** Connected, installed, done. */
  success: '#1a8547',
  successFill: '#e7f6ec',
  /** The triangle on an approval card. Used once, and it has to be. */
  warning: '#e8a300',
  /** The record dot on "Teach a task", and a destructive button. */
  danger: '#e0322d',
} as const;

/**
 * Lines and shadows, which the canvas writes as rgba rather than hex
 * because they sit over a surface rather than replacing it.
 */
export const line = {
  /** Every border in the design is this one value. */
  hairline: 'rgba(16,22,35,.11)',
  /** A field's border, a shade firmer. */
  field: 'rgba(16,22,35,.13)',
  /** A secondary button's border, firmer still. */
  button: 'rgba(16,22,35,.17)',
  /** The 34px grid on the ground. Barely there, and the reason the app
   *  does not read as a flat sheet of white. */
  grid: 'rgba(16,22,35,.018)',
  /** A row under the pointer. */
  hover: 'rgba(16,22,35,.06)',
} as const;

export const shadow = {
  /** A button, a card at rest. */
  flat: '0 1px 2px rgba(16,22,35,.04)',
  /** The selected row in the sidebar. */
  raised: '0 1px 2px rgba(16,22,35,.04), 0 6px 18px rgba(16,22,35,.11)',
  /** A popover. */
  popover: '0 1px 2px rgba(16,22,35,.04), 0 18px 44px rgba(16,22,35,.18)',
  /** A full modal. */
  modal: '0 1px 2px rgba(16,22,35,.04), 0 24px 60px rgba(16,22,35,.18)',
  /** The white line along the top edge of every glass surface. Small, and
   *  the whole reason the glass reads as glass. */
  glassInset: 'inset 0 1px 0 rgba(255,255,255,.8)',
  /** An orb, which floats a little more than anything else. */
  orb: '0 1px 2px rgba(16,22,35,.11), 0 4px 10px rgba(16,22,35,.10)',
  orbLarge: '0 2px 6px rgba(16,22,35,.11), 0 20px 48px rgba(16,22,35,.14)',
} as const;

/**
 * Glass: every modal, popover and raised row in the canvas is the same
 * recipe. Kept together because using three of the four is what makes a
 * surface look almost right.
 */
export const glass = {
  background: 'rgba(255,255,255,.94)',
  /** Lighter for a card inside a scrolling column. */
  backgroundSoft: 'rgba(255,255,255,.88)',
  blur: 'blur(20px)',
  border: 'rgba(255,255,255,.7)',
  /** What a modal lays over the app behind it. */
  scrim: 'rgba(195,203,214,.42)',
  scrimBlur: 'blur(10px)',
} as const;

/**
 * Type. Fourteen sizes, and they are half-pixel values because the canvas
 * was drawn at a size and then trusted — 14.5 and 15.5 do real work in it.
 *
 * **Every size came down a step on the evening of 15 September**
 * (`canvas-2026-09-15-type-template.html`): 15 became 14, 15.5 became
 * 14.5, 22 became 20.5, and so on down the scale. That canvas also set
 * the face to Switzer, which sits a little larger on the line than the
 * system font, so the smaller numbers read at about the old size.
 */
export const text = {
  /** A key cap, an id, a command: the mono sizes. The canvas puts them at 12. */
  code: 12,
  caption: 12.5,
  /**
   * The same size as `caption` since the 15 September evening canvas,
   * which brought 13 and 13.5 together at 12.5. Two names kept, because
   * they are two roles — a stamp beside a name, and the line under it.
   */
  label: 12.5,
  small: 13,
  /** The workhorse: menu rows, settings labels, buttons. 30 uses. */
  body: 13.5,
  /** Message text, inputs, descriptions. 20 uses. */
  message: 14,
  /** A name in a list, a question card's title. */
  emphasis: 14.5,
  base: 15,
  agentName: 15.5,
  section: 16,
  sidebarTitle: 18,
  dialogTitle: 20,
  screenTitle: 20.5,
  detailTitle: 25.5,
} as const;

/** Tracking tightens as type grows, which is the whole of the system. */
export const tracking = {
  /** Switzer needs no tightening at text sizes; the canvas sets 0 where it had -.005em. */
  body: '0',
  title: '-.01em',
  screenTitle: '-.015em',
  detailTitle: '-.02em',
} as const;

export const radius = {
  /** Anything with a pill shape: the composer, search, chips, tabs. */
  pill: 999,
  key: 6,
  /** The inline chip a file or a code span sits in, inside a sentence. */
  fileChip: 7,
  chip: 8,
  small: 11,
  field: 12,
  control: 13,
  input: 14,
  row: 16,
  card: 18,
  /** A message bubble. The canvas says 20, not the panel's 22. */
  bubble: 20,
  menu: 20,
  panel: 22,
  modal: 24,
} as const;

/** The grid the ground is drawn on. */
export const grid = { size: 34 } as const;

/**
 * Motion. Five animations, and the timings are the canvas's own.
 *
 * `msgIn` is the one that matters most: it is what makes a message land
 * rather than appear.
 */
export const motion = {
  /** A message, a card, a popover arriving. */
  messageIn: { duration: '.16s', longer: '.22s', easing: 'ease-out' },
  /** The voice orb growing into place. */
  orbIn: { duration: '.52s', easing: 'cubic-bezier(.22,.68,.36,1)' },
  /** An orb breathing while it waits. Slow on purpose. */
  orbIdle: { duration: '7.5s', easing: 'ease-in-out' },
  /** An orb while the agent is speaking. */
  orbSpeak: { duration: '2.4s', easing: 'ease-in-out' },
  /** The light that runs through "Running commands". */
  shimmer: { duration: '1.9s', easing: 'linear' },
  /** Hover and state changes. */
  hover: { duration: '.15s', easing: 'ease' },
} as const;

/**
 * The faces.
 *
 * Switzer, from the evening canvas of 15 September — Indian Type
 * Foundry's, served by Fontshare, bundled here at 400 and 500
 * (`fonts/`, declared in `tokens.css`). The system stack stays behind
 * it for the moment before the file is loaded and for any glyph it does
 * not carry. The canvas also names 'Switzer Variable', which is the
 * same face as one file; we ship the two weights and list it anyway so
 * the stack is the canvas's.
 *
 * Emoji get their own stack, for the reactions: a colour emoji drawn by
 * the system's emoji face, never a text glyph from Switzer.
 */
export const font = {
  ui: "'Switzer', 'Switzer Variable', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'SF Mono', ui-monospace, SFMono-Regular, monospace",
  emoji: "'Apple Color Emoji', 'Segoe UI Emoji', sans-serif",
} as const;

/**
 * Orb palettes — the founder's four, and only those.
 *
 * Each is five colours and the seed the canvas pairs with them, copied
 * from `docs/product/design/canvas.html`:
 *
 *   [0] the deep base, carrying the hue
 *   [1] a neighbouring hue, cooler, for the second cloud
 *   [2] a third hue further round the wheel, for depth
 *   [3] a very pale tint — the near-white top of the vertical ramp, and
 *       the reason an orb reads as lit
 *   [4] a mid tone between base and second, for the linear sweep
 *
 * There were fifteen. Eleven were mine, written from a line in `plan.md`
 * saying the founder wanted fifteen, and an agent's orb was chosen by
 * hashing its id — so every agent wore a colour nobody had picked. The
 * founder, on seeing it: "the spheres I designed are COMPLETELY
 * different from what you designed… I want exactly what I designed.
 * Exactly."
 *
 * The seed travels with the palette because the canvas pairs them: the
 * same five colours at another seed is a different orb.
 */
export interface OrbPalette {
  /** Stable name, used in tests and when reading a config. */
  readonly id: string;
  /** The seed the canvas pairs with these colours. */
  readonly seed: number;
  /** Five hex colours, in the order the shader expects. */
  readonly colors: readonly [string, string, string, string, string];
}

export const ORB_PALETTES: readonly OrbPalette[] = [
  { id: 'moss', seed: 11, colors: ['#4f9a2e', '#2a7fa8', '#c9b755', '#e8f0d8', '#4f9c7a'] },
  { id: 'harbour', seed: 22, colors: ['#2f6ab8', '#3f93ad', '#6a56b0', '#dbe6f5', '#4a7fc4'] },
  { id: 'iris', seed: 33, colors: ['#6d4bb8', '#3f66b8', '#a85fa0', '#e2d8f2', '#7d5cc4'] },
  { id: 'fuchsia', seed: 44, colors: ['#bf4a86', '#c07a28', '#8f5cad', '#f2dae5', '#c45f92'] },
] as const;

/** The grain the shader adds over the clouds. One value, everywhere. */
export const ORB_GRAIN = 0.08;

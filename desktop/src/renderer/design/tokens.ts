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
 * Type. Thirteen sizes, and they are half-pixel values because the canvas
 * was drawn at a size and then trusted — 14.5 and 15.5 do real work in it.
 */
export const text = {
  caption: 13,
  label: 13.5,
  small: 14,
  /** The workhorse: menu rows, settings labels, buttons. 30 uses. */
  body: 14.5,
  /** Message text, inputs, descriptions. 20 uses. */
  message: 15,
  /** A name in a list, a question card's title. */
  emphasis: 15.5,
  base: 16,
  agentName: 16.5,
  section: 17,
  sidebarTitle: 19,
  dialogTitle: 21,
  screenTitle: 22,
  detailTitle: 27,
} as const;

/** Tracking tightens as type grows, which is the whole of the system. */
export const tracking = {
  body: '-.005em',
  title: '-.01em',
  screenTitle: '-.015em',
  detailTitle: '-.02em',
} as const;

export const radius = {
  /** Anything with a pill shape: the composer, search, chips, tabs. */
  pill: 999,
  key: 6,
  chip: 8,
  small: 11,
  field: 12,
  control: 13,
  input: 14,
  row: 16,
  card: 18,
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
 * The system font stack, as the canvas sets it. No webfont: the app is a
 * desktop app and should look like one.
 */
export const font = {
  ui: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
  mono: "'SF Mono', ui-monospace, SFMono-Regular, monospace",
} as const;

/**
 * Orb palettes.
 *
 * Five colours and a seed make one orb. The canvas ships four; the
 * founder asked for fifteen, so that two agents rarely look alike.
 *
 * The four from the canvas are first and unchanged — they are the ones
 * that have been seen and approved. The eleven after them follow the same
 * construction, which is what makes the set read as one family rather
 * than fifteen unrelated discs:
 *
 *   [0] the deep base, carrying the hue
 *   [1] a neighbouring hue, cooler, for the second cloud
 *   [2] a third hue further round the wheel, for depth
 *   [3] a very pale tint of the family — this is the near-white top of
 *       the vertical ramp, and the reason an orb reads as lit
 *   [4] a mid tone between base and second, for the linear sweep
 *
 * Ordered so that neighbours in the list are far apart in hue: agents are
 * assigned palettes in order for the seeded set, and two greens side by
 * side in a sidebar is exactly what fifteen palettes are meant to avoid.
 */
export interface OrbPalette {
  /** Stable name, used in tests and when reading a config. */
  readonly id: string;
  /** Five hex colours, in the order the shader expects. */
  readonly colors: readonly [string, string, string, string, string];
}

export const ORB_PALETTES: readonly OrbPalette[] = [
  // The canvas's four, unchanged.
  { id: 'moss', colors: ['#4f9a2e', '#2a7fa8', '#c9b755', '#e8f0d8', '#4f9c7a'] },
  { id: 'harbour', colors: ['#2f6ab8', '#3f93ad', '#6a56b0', '#dbe6f5', '#4a7fc4'] },
  { id: 'iris', colors: ['#6d4bb8', '#3f66b8', '#a85fa0', '#e2d8f2', '#7d5cc4'] },
  { id: 'fuchsia', colors: ['#bf4a86', '#c07a28', '#8f5cad', '#f2dae5', '#c45f92'] },
  // Eleven more, same construction.
  { id: 'jade', colors: ['#1f8f74', '#2a7fa8', '#a8d8c2', '#e8f4ee', '#3f9c86'] },
  { id: 'ember', colors: ['#c07a28', '#bf4a86', '#e0a95c', '#f7e6d2', '#c4694a'] },
  { id: 'cobalt', colors: ['#2f57b8', '#3f93ad', '#a85fa0', '#dbe6f5', '#2f6ab8'] },
  { id: 'plum', colors: ['#5a2fb8', '#2f6ab8', '#8f5cad', '#e2d8f2', '#6d4bb8'] },
  { id: 'fern', colors: ['#3f9c86', '#2f6ab8', '#c9b755', '#e8f4ee', '#1f8f74'] },
  { id: 'slate', colors: ['#55606f', '#2f57b8', '#8f5cad', '#dfe4ec', '#3f66b8'] },
  { id: 'coral', colors: ['#c4544a', '#c07a28', '#a85fa0', '#f7dedb', '#bf4a86'] },
  { id: 'lagoon', colors: ['#2a7fa8', '#1f8f74', '#6a56b0', '#dbeef5', '#3f93ad'] },
  { id: 'mulberry', colors: ['#8f3f7a', '#5a2fb8', '#c07a28', '#f0dcea', '#a85fa0'] },
  { id: 'olive', colors: ['#7a8f2e', '#4f9a2e', '#c9b755', '#eef0d8', '#5f9c4a'] },
  { id: 'dusk', colors: ['#3f4f8f', '#6a56b0', '#3f93ad', '#dee2f2', '#4a5fa8'] },
] as const;

/** The grain the shader adds over the clouds. One value, everywhere. */
export const ORB_GRAIN = 0.08;

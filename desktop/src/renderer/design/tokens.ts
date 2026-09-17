/**
 * The design, as values.
 *
 * Every number and colour here was counted out of the founder's canvas,
 * not invented. Since 17 September that canvas is the "Spatial Light"
 * one (`docs/product/design/canvas-2026-09-17-spatial-light.html`): the
 * app is a floating window on a pale ground, with a glass dock beside it,
 * and the colour is Apple's blue on white and near-black — not the navy
 * and paper of the 15 September canvases. Where a value appears many
 * times in the canvas the count is noted, because that is what makes it
 * a token rather than a one-off.
 *
 * This file and `tokens.css` say the same thing twice, on purpose: CSS
 * needs custom properties, and the orb and anything else computing a
 * style in JavaScript needs the values themselves. `tokens.test.ts` holds
 * the two in agreement, so neither can drift.
 *
 * One look, deliberately. The app carries a four-theme skinning system
 * from upstream (`renderer/theme/`) which the old shell uses; this is not
 * a fifth theme, and nothing here goes through that contract. The dark
 * mode the founder is drawing will be a second set of these values behind
 * one switch, not a theme in that system.
 */

/** Colour. */
export const color = {
  /** Text, the account avatar, the voice picker's current dot. 90 uses. */
  ink: '#0d0d0d',
  /** Secondary text, icon strokes, every hint and caption. 84 uses. */
  muted: '#676767',
  /** Inactive dock glyphs, the other voice dots, the shimmer's dark half. */
  faint: '#8e8e93',
  /** The chevron at the end of a row, and nothing else. */
  chevron: '#b0b0b5',
  /** The label of an unselected Text/Voice or Plugins/Agents tab. */
  tabInk: '#585858',
  /** The page behind the window. */
  ground: '#eff1f5',
  /** The window itself: the sidebar, a settings group, the compose list, a card on the Apps screen. 30 uses. */
  window: '#f6f6f6',
  /** The conversation pane, a card in the thread, a popover, an input. 40 uses. */
  paper: '#ffffff',
  /** Inset fills: the agent's bubble, the composer, search, a key cap, a tag. 28 uses. */
  fill: '#f2f2f2',
  /** The agent panel's ground, one step off the window. */
  fillRaised: '#fafafa',
  /** The selected tab on an agent's page. */
  fillStrong: '#e3e8ef',
  /** A line between rows, and the inline code chip. */
  divider: '#efefef',
  /** The person's bubble, every primary button, links, the selected tab's label, the unread dot. 22 uses. */
  accent: '#0071e3',
  /** A primary button under the pointer. */
  accentHover: '#0059b3',
  /** "Connected", "Use": the word that replaces a button once it is done. */
  successText: '#248a3d',
  /** "Installed" on an agent's page, and its pale fill. */
  success: '#1a8547',
  successFill: '#e7f6ec',
  /** The triangle on an approval card. Used once, and it has to be. */
  warning: '#e8a300',
  /** The record dot on "Teach a task", and a destructive settings button. */
  danger: '#e0322d',
  /** Delete agent: its text, and the trash icon under the pointer. */
  deleteInk: '#c92a25',
  deleteFill: '#fdeceb',
} as const;

/**
 * Lines, which the canvas writes as black at a low alpha so they sit on
 * any of the three surfaces.
 */
export const line = {
  /** Under a header, round a row, round a pill: the quietest line. 17 uses of .05/.055. */
  hairline: 'rgba(0,0,0,.055)',
  /** Round a card in the thread, a popover, a settings field. */
  field: 'rgba(0,0,0,.06)',
  /** Round a card on the Apps screen, an unselected avatar, a chip. */
  card: 'rgba(0,0,0,.08)',
  /** The voice button's border, the firmest line in the design. */
  button: 'rgba(0,0,0,.15)',
  /** A control under the pointer, and the disabled Create button. */
  hover: 'rgba(0,0,0,.08)',
} as const;

export const shadow = {
  /** A card at rest, a white pill, an input in the agent panel. 19 uses. */
  flat: '0 1px 2px rgba(0,0,0,.08)',
  /** The selected segment of Text/Voice and Plugins/Agents. */
  raised: '0 2px 5px rgba(0,0,0,.09), 0 0 0 1px rgba(0,0,0,.045)',
  /** A popover: the account menu, the plus menu, share. */
  popover: '0 1px 2px rgba(0,0,0,.08), 0 18px 44px rgba(0,0,0,.08)',
  /** The emoji row and the message menu, which float over the thread. */
  menu: '0 1px 2px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.14)',
  /** The voice picker. */
  modal: '0 1px 2px rgba(0,0,0,.08), 0 24px 60px rgba(0,0,0,.14)',
  /** The window on the ground. */
  window: '0 40px 110px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.1)',
  /** The dock: a white line along its top, then two drops. */
  dock: 'inset 0 1px 0 rgba(255,255,255,.9), 0 2px 6px rgba(0,0,0,.05), 0 20px 46px rgba(0,0,0,.14)',
  /** The lit button in the dock. */
  dockActive: '0 1px 3px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04)',
  /** The voice orb's glass button. */
  voiceOrb: '0 2px 6px rgba(0,0,0,.04), 0 16px 40px rgba(0,0,0,.1)',
  /** The 163px orb in the voice picker. */
  orbLarge: '0 20px 48px rgba(0,0,0,.14)',
  /** A small orb where one floats: the same idea at row size. */
  orb: '0 1px 2px rgba(0,0,0,.08), 0 4px 10px rgba(0,0,0,.08)',
  /** A toggle's knob. */
  knob: '0 1px 3px rgba(0,0,0,.25)',
} as const;

/**
 * Glass. Two recipes in this canvas, and only two: the dock, and the
 * voice orb's button. Everything else is opaque — a popover is white, a
 * card is white, a settings group is the window's grey.
 */
export const glass = {
  /** The dock. */
  dock: 'rgba(255,255,255,.55)',
  dockBlur: 'blur(30px) saturate(1.8)',
  border: 'rgba(255,255,255,.7)',
  /** The voice orb's button. */
  orb: 'rgba(255,255,255,.6)',
  orbBlur: 'blur(24px) saturate(1.6)',
  /** What the voice picker lays over the pane. */
  scrim: 'rgba(0,0,0,.14)',
  scrimBlur: 'blur(10px)',
  /** The emoji row and the message menu blur what scrolls under them. */
  menuBlur: 'blur(20px)',
} as const;

/**
 * Type. Fourteen sizes, and they are half-pixel values because the canvas
 * was drawn at a size and then trusted — 14.5 and 15.5 do real work in it.
 *
 * The 17 September canvas prints them a tenth off (12.3, 12.9, 13.4,
 * 14.6, 15.1, 15.7, 17.9, 20.2, 25.2): the same scale after its export
 * rounding. These stay, so nothing moves by a fraction of a pixel.
 */
export const text = {
  /** A key cap, an id, a command: the mono sizes. The canvas puts them at 12. */
  code: 12,
  caption: 12.5,
  /** The same size as `caption`; two names, because they are two roles. */
  label: 12.5,
  small: 13,
  /** The workhorse: menu rows, settings labels, buttons. 30 uses. */
  body: 13.5,
  /** Message text, inputs, descriptions. 20 uses. */
  message: 14,
  /** A name in a list, a question card's title, the agent's bubble. */
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
  /** Anything with a pill shape: the composer, search, chips, tabs, the dock. */
  pill: 999,
  key: 6,
  /** The inline chip a file or a code span sits in, inside a sentence. */
  fileChip: 7,
  chip: 8,
  /** A trash button, a settings tab. */
  small: 11,
  field: 12,
  control: 13,
  /** A menu row, a text area, the delete question. */
  input: 14,
  /** A sidebar row, a compose row, the choice list, an avatar grid. */
  row: 16,
  /** A message bubble. 17 in this canvas; it was 20. */
  bubble: 17,
  /** A file card, a settings group, a connector card, the share menu. */
  card: 18,
  /** The account menu, the plus menu, an agent card on the Apps screen. */
  menu: 20,
  /** A choice card, an approval card, the compose list, the new-agent form. */
  panel: 22,
  /** The voice picker. */
  modal: 24,
  /** The conversation pane and the agent panel. */
  pane: 28,
  /** The window. */
  window: 40,
} as const;

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
  orbSpeak: { duration: '1.8s', easing: 'ease-in-out' },
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

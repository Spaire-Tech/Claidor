/* ============================================================
   EMAIL BLOCKS — course-welcome emails, restrained & editorial.
   Faithful TypeScript port of the creator's design data module.
   Premium neutral palettes, high-contrast typography, generous
   whitespace. The render() functions emit inline-styled, inbox-
   correct HTML (no client framework needed for correctness).
   ============================================================ */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { scrubHtml } from './sanitizeHtml'

export type Props = Record<string, any>

export interface Theme {
  name: string
  emailBg: string
  outerBg: string
  font: string
  headingFont: string
  heading: string
  text: string
  muted: string
  link: string
  accent: string
  button: string
  buttonText: string
  border: string
  panel: string
  heroText: string
}

export interface CtlDescriptor {
  kind: string
  [key: string]: any
}
export interface GroupDescriptor {
  kind: 'group'
  title: string
  ctls: CtlDescriptor[]
}
export interface PartDef {
  label: string
  icon: string
  groups: (p: Props, t: Theme) => GroupDescriptor[]
}
export interface BlockDef {
  label: string
  icon: string
  // Palette group. Omit to hide the block from the add-block palette while
  // keeping it renderable (e.g. `trailer`, dropped from the UI but still shown
  // if an older saved email contains one). buildPalette only lists blocks whose
  // group matches one of GROUPS.
  group?: string
  defaults: (t: Theme) => Props
  render: (p: Props, t: Theme) => string
  inspect: (p: Props, t?: Theme) => GroupDescriptor[]
  parts?: Record<string, PartDef>
  noLabel?: boolean
}

export interface TemplateDef {
  theme: string
  name: string
  subtitle: string
  blocks: { type: string; props: Props }[]
}

// Stored block props are rich HTML (format-bubble output), so this is a
// scrub, not an entity-escape: formatting survives, anything executable is
// removed before the canvas re-emits it. (It used to be an identity function,
// which made every stored prop a stored-XSS vector in the dashboard.)
const esc = (s: any): string => scrubHtml(s)

/* Asset resolution is injected by the host (engine maps design asset keys
   such as 'assets/course-cover.jpg' to real course media or a neutral
   placeholder). Defaults to identity so the module stays pure. */
let assetResolver: (p: string) => string = (p) => p
export function setAssetResolver(fn: (p: string) => string) {
  assetResolver = fn
}
const ASSET = (p: string): string => assetResolver(p)

// The canvas renders these family names into inline styles. In the EDITOR the
// `var(--font-*)` tokens resolve to the app's next/font faces (loaded app-wide
// in layout.tsx: --font-geist-sans, --font-instrument-serif, --font-inter), so
// the editor no longer depends on design.css's remote @import — which the
// Next.js/Lightning-CSS build can drop or reorder, silently falling Geist /
// Instrument Serif back to system fonts and wrecking the weights, tracking and
// proportions. In the SENT email the `var()` tokens are undefined and harmlessly
// fall through to the named/Georgia/system fonts, exactly as before.
// IMPORTANT: the next/font token MUST carry its own literal fallback INSIDE the
// var() — `var(--font-x, 'X')` — not merely as a later list item. A bare
// `var(--font-x)` that is undefined invalidates the WHOLE font-family
// declaration (the trailing fallbacks are NOT consulted), collapsing the text to
// inherited/system fonts. With the fallback inside var(), an undefined token
// (the SENT email, or any context without next/font) cleanly degrades to the
// named/Georgia/system fonts instead.
export const FONTS: Record<string, string> = {
  Geist:
    "var(--font-geist-sans, 'Geist'), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  'Instrument Serif':
    "var(--font-instrument-serif, 'Instrument Serif'), Georgia, 'Times New Roman', serif",
  Inter:
    "var(--font-inter, 'Inter'), -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  'IBM Plex Sans Condensed':
    "'IBM Plex Sans Condensed', 'Arial Narrow', Arial, sans-serif",
}

/* full palette across the themes (+ neutrals) for the colour picker presets */
export const PALETTE: string[] = [
  'none',
  '#ffffff',
  '#f2eadf',
  '#f4f1ea',
  '#ece8dd',
  '#e4dfd3',
  '#17120f',
  '#1f1813',
  '#b8ae9f',
  '#847a6d',
  '#c98a5e',
  '#1f241c',
  '#5a6052',
  '#9a9e90',
  '#5e7355',
  '#111315',
  '#181b1c',
  '#aeb3b1',
  '#6b6f6d',
  '#8fa89a',
  '#141518',
  '#1b1c20',
  '#adafb5',
  '#6e7077',
  '#9aa0a8',
  '#000000',
]

/* ---------- THEMES — restrained, premium, one quiet accent each ----------
   Buttons are high-contrast NEUTRAL (cream on dark / ink on light), not coloured.
   accent is desaturated and used only for tiny details. */
export const THEMES: Record<string, Theme> = {
  chef: {
    name: 'Kitchen',
    emailBg: '#17120f',
    outerBg: '#0e0a08',
    font: 'Geist',
    headingFont: 'Instrument Serif',
    heading: '#f2eadf',
    text: '#b8ae9f',
    muted: '#847a6d',
    link: '#f2eadf',
    accent: '#c98a5e',
    button: '#f2eadf',
    buttonText: '#17120f',
    border: 'rgba(242,234,223,.13)',
    panel: '#1f1813',
    heroText: '#f2eadf',
  },
  yoga: {
    name: 'Daylight',
    emailBg: '#f4f1ea',
    outerBg: '#e6e1d6',
    font: 'Geist',
    headingFont: 'Instrument Serif',
    heading: '#1f241c',
    text: '#5a6052',
    muted: '#9a9e90',
    link: '#1f241c',
    accent: '#5e7355',
    button: '#1f241c',
    buttonText: '#f4f1ea',
    border: '#e1dccf',
    panel: '#ece8dd',
    heroText: '#f4f1ea',
  },
  serve: {
    name: 'Graphite',
    emailBg: '#111315',
    outerBg: '#08090a',
    font: 'Geist',
    headingFont: 'Geist',
    heading: '#f4f5f4',
    text: '#aeb3b1',
    muted: '#6b6f6d',
    link: '#f4f5f4',
    accent: '#8fa89a',
    button: '#f4f5f4',
    buttonText: '#111315',
    border: 'rgba(244,245,244,.12)',
    panel: '#181b1c',
    heroText: '#f4f5f4',
  },
  studio: {
    name: 'Midnight',
    emailBg: '#141518',
    outerBg: '#0b0c0e',
    font: 'Geist',
    headingFont: 'Instrument Serif',
    heading: '#efeff1',
    text: '#adafb5',
    muted: '#6e7077',
    link: '#efeff1',
    accent: '#9aa0a8',
    button: '#efeff1',
    buttonText: '#141518',
    border: 'rgba(239,239,241,.12)',
    panel: '#1b1c20',
    heroText: '#efeff1',
  },
}

export const ICO: Record<string, string> = {
  cover:
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 15l5-4 4 3 3-2 6 4"/><circle cx="9" cy="9" r="1.6"/>',
  note: '<path d="M5 4h11l3 3v13H5z"/><path d="M16 4v3h3"/><path d="M8 12h8M8 16h5"/>',
  lessons:
    '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.4"/><circle cx="4" cy="12" r="1.4"/><circle cx="4" cy="18" r="1.4"/>',
  instructor:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 8h5M16 12h5M16 16h3"/>',
  trailer:
    '<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none"/>',
  meta: '<path d="M4 12h4M10 12h4M16 12h4"/><circle cx="6" cy="12" r="0" /><path d="M5 8v8M11 8v8M17 8v8" opacity=".0"/>',
  heading: '<path d="M6 4v16M18 4v16M6 12h12"/>',
  text: '<path d="M4 6h16M4 12h16M4 18h11"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L4 21"/>',
  button: '<rect x="2.5" y="8" width="19" height="8" rx="4"/><path d="M8 12h8"/>',
  cta: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 10h8M8 14h5"/>',
  progress:
    '<rect x="3" y="10" width="18" height="4" rx="2"/><rect x="3" y="10" width="8" height="4" rx="2" fill="currentColor" stroke="none"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  quote:
    '<path d="M9 7H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v3H4M20 7h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v3h-3"/>',
  divider: '<path d="M3 12h18"/>',
  spacer:
    '<path d="M8 5h8M8 19h8M12 9v6"/><path d="m9 9 3-3 3 3M9 15l3 3 3-3"/>',
  footer:
    '<rect x="3" y="14" width="18" height="6" rx="2"/><path d="M6 17h5"/><circle cx="15.5" cy="17" r="1"/><circle cx="18.5" cy="17" r="1"/>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z" fill="currentColor" stroke="none"/>',
  pic: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L4 21"/>',
  social: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
}

export const svg = (p: string, sz?: number, sw?: number): string =>
  `<svg width="${sz || 18}" height="${sz || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.7}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`

const ff = (f: string): string => FONTS[f] || FONTS.Geist
const padBox = (p: Props): string =>
  `padding:${p.pt || 0}px ${p.px == null ? 44 : p.px}px ${p.pb || 0}px`

export function hexA(hex: string, a: number): string {
  if (!hex || hex === 'none') return `rgba(0,0,0,${a})`
  if (hex[0] !== '#') return hex
  let h = hex.replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function btnHTML(b: Props, t: Theme, editPath?: string): string {
  const ep = editPath || 'text'
  const style = b.style || 'solid'
  const font = ff(b.font || t.font)
  const align = b.align || 'left'
  const label = esc(b.text) + (b.arrow ? '&nbsp;&nbsp;→' : '')
  if (style === 'link') {
    return `<div style="text-align:${align}"><a class="eb-btn-link" data-edit="${ep}" contenteditable="true" href="#" onclick="return false" style="color:${b.color || t.link};font-family:${font};font-size:${b.size || 14}px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:3px">${label}</a></div>`
  }
  const radius = b.radius == null ? 999 : b.radius
  const bg = style === 'outline' ? 'transparent' : b.bg || t.button
  const border =
    style === 'outline' ? `border:1px solid ${b.border || t.border};` : ''
  const color = b.color || (style === 'outline' ? t.heading : t.buttonText)
  return `<div style="text-align:${align}"><a class="eb-btn" data-edit="${ep}" contenteditable="true" href="#" onclick="return false" style="background:${bg};color:${color};${border}border-radius:${radius}px;padding:15px 30px;font-family:${font};font-size:${b.size || 14.5}px;font-weight:600;letter-spacing:.005em;text-decoration:none;display:inline-block">${label}</a></div>`
}

/* button controls, reused by any block with an embedded button (key prefix e.g. 'btn').
   `removable` adds a Show-button toggle at the top so an embedded button can be
   dropped or restored, matching the standalone Button block's flexibility. */
function btnGroups(prefix: string, removable?: boolean): GroupDescriptor[] {
  const first: GroupDescriptor = { kind: 'group', title: 'Button', ctls: [] }
  if (removable)
    first.ctls.push({ kind: 'switch', label: 'Show button', key: 'showBtn', sub: 'Include the call-to-action button' })
  first.ctls.push(
    { kind: 'field', label: 'Label', key: prefix + '.text' },
    { kind: 'field', label: 'Link URL', key: prefix + '.href', ph: 'https://…' },
    {
      kind: 'seg',
      key: prefix + '.style',
      opts: [
        ['solid', 'Solid'],
        ['outline', 'Outline'],
        ['link', 'Link'],
      ],
    },
  )
  return [
    first,
    { kind: 'group', title: 'Alignment', ctls: [{ kind: 'align', key: prefix + '.align', opts: ['left', 'center', 'right'] }] },
    {
      kind: 'group',
      title: 'Button colours',
      ctls: [
        { kind: 'color', label: 'Button fill', key: prefix + '.bg' },
        { kind: 'color', label: 'Button label', key: prefix + '.color' },
      ],
    },
    {
      kind: 'group',
      title: 'Shape',
      ctls: [
        { kind: 'radius', key: prefix + '.radius' },
        { kind: 'switch', label: 'Arrow', key: prefix + '.arrow', sub: 'Append → to the label' },
      ],
    },
  ]
}

/* ---- universal text-part controls: Font · Size · Colour · Alignment ----
   Every editable text across the templates routes through these so each one
   behaves identically to the cover's Title / Description parts. */
function txtTypo(
  title: string,
  fontKey: string | null,
  sizeKey: string | null,
  colorKey: string | null,
  min?: number,
  max?: number,
): GroupDescriptor {
  const ctls: CtlDescriptor[] = []
  if (fontKey) ctls.push({ kind: 'select', key: fontKey, opts: Object.keys(FONTS), label: 'Font' })
  if (sizeKey) ctls.push({ kind: 'num', label: 'Size', key: sizeKey, min: min || 11, max: max || 96 })
  if (colorKey) ctls.push({ kind: 'color', label: 'Colour', key: colorKey })
  return { kind: 'group', title: title || 'Text', ctls }
}
function txtAlign(key: string): GroupDescriptor {
  return { kind: 'group', title: 'Alignment', ctls: [{ kind: 'align', key, opts: ['left', 'center', 'right'] }] }
}
function txtPart(
  label: string,
  icon: string,
  fontKey: string | null,
  sizeKey: string | null,
  colorKey: string | null,
  alignKey: string | null,
  min?: number,
  max?: number,
  // When set, the part inspector shows an editable Text field for this prop.
  // Without it, a slot that starts empty (a cover eyebrow / description) had
  // no way to be written, and clearing one made it vanish permanently.
  contentKey?: string,
): PartDef {
  return {
    label,
    icon: icon || ICO.text,
    groups: () => {
      const g: GroupDescriptor[] = []
      if (contentKey)
        g.push({ kind: 'group', title: label, ctls: [{ kind: 'field', label: 'Text', key: contentKey, ph: `Add ${label.toLowerCase()}…` }] })
      g.push(txtTypo(label, fontKey, sizeKey, colorKey, min, max))
      if (alignKey) g.push(txtAlign(alignKey))
      return g
    },
  }
}

/* ============================================================ CONTROL DESCRIPTORS */
function grpColors(pairs: [string, string][]): GroupDescriptor {
  return {
    kind: 'group',
    title: 'Colours',
    ctls: pairs.map((p) => ({ kind: 'color', label: p[0], key: p[1] })),
  }
}
function grpField(label: string, key: string, ph?: string): GroupDescriptor {
  return { kind: 'group', title: label, ctls: [{ kind: 'field', label: null, key, ph }] }
}
function grpImage(label: string, key: string): GroupDescriptor {
  return {
    kind: 'group',
    title: label,
    ctls: [
      { kind: 'upload', key },
      { kind: 'field', label: null, key, ph: 'or paste image URL' },
    ],
  }
}
function grpNum(label: string, key: string, min: number, max: number): GroupDescriptor {
  return { kind: 'group', title: label, ctls: [{ kind: 'num', label, key, min, max }] }
}
function grpRange(
  label: string,
  key: string,
  min: number,
  max: number,
  step?: number,
  fmt?: (v: number) => string,
): GroupDescriptor {
  return {
    kind: 'group',
    title: label,
    ctls: [{ kind: 'range', label, key, min, max, step: step || 1, fmt }],
  }
}
function grpAlign(opts?: string[]): GroupDescriptor {
  return {
    kind: 'group',
    title: 'Alignment',
    ctls: [{ kind: 'align', key: 'align', opts: opts || ['left', 'center', 'right'] }],
  }
}
function grpSeg(label: string, key: string, opts: [string, string][]): GroupDescriptor {
  return { kind: 'group', title: label, ctls: [{ kind: 'seg', key, opts }] }
}
function grpSelect(label: string, key: string, opts: string[]): GroupDescriptor {
  return { kind: 'group', title: label, ctls: [{ kind: 'select', key, opts }] }
}
function grpSwitch(label: string, key: string, sub?: string): GroupDescriptor {
  return { kind: 'group', title: 'Options', ctls: [{ kind: 'switch', label, key, sub }] }
}
function grpPad(): GroupDescriptor {
  return {
    kind: 'group',
    title: 'Spacing',
    ctls: [
      { kind: 'range', label: 'Padding top', key: 'pt', min: 0, max: 140, step: 2 },
      { kind: 'range', label: 'Padding bottom', key: 'pb', min: 0, max: 140, step: 2 },
      { kind: 'range', label: 'Side padding', key: 'px', min: 0, max: 72, step: 2 },
    ],
  }
}
function grpType(title: string, prefix: string, isCover: boolean): GroupDescriptor {
  const ctls: CtlDescriptor[] = [
    { kind: 'select', key: prefix + 'Font', opts: Object.keys(FONTS), label: 'Font' },
    { kind: 'num', label: 'Size', key: prefix + 'Size', min: 16, max: 96 },
  ]
  if (!isCover)
    ctls.push({ kind: 'color', label: (title || 'Heading') + ' colour', key: prefix + 'Color' })
  return { kind: 'group', title: title || 'Heading', ctls }
}
function grpType2(): GroupDescriptor {
  return {
    kind: 'group',
    title: 'Heading',
    ctls: [
      { kind: 'select', key: 'hFont', opts: Object.keys(FONTS), label: 'Font' },
      { kind: 'num', label: 'Size', key: 'hSize', min: 14, max: 88 },
      { kind: 'num', label: 'Weight', key: 'hWeight', min: 300, max: 800 },
      { kind: 'color', label: 'Heading colour', key: 'hColor' },
      {
        kind: 'seg',
        key: 'hTransform',
        opts: [
          ['none', 'Aa'],
          ['uppercase', 'AA'],
          ['capitalize', 'Ab'],
        ],
        label: 'Case',
      },
    ],
  }
}

/* ============================================================ BLOCK REGISTRY */
export const REG: Record<string, BlockDef> = {
  /* ---- CINEMATIC COVER HERO ---- */
  coverHero: {
    label: 'Cover',
    icon: ICO.cover,
    group: 'Course',
    defaults: (t) => ({
      // Empty copy slots — bindCourse fills title / byline / tagline from the
      // real course. The asset key resolves to the course cover (or a neutral
      // placeholder) via the engine's asset resolver.
      img: 'assets/course-cover.jpg',
      height: 560,
      overlay: 58,
      overlayColor: '#0c0a08',
      eyebrow: '',
      eyebrowFont: t.font,
      eyebrowSize: 11,
      eyebrowColor: t.heroText,
      eyebrowAlign: 'left',
      title: '',
      titleFont: t.headingFont,
      titleSize: 66,
      titleColor: t.heroText,
      titleAlign: 'left',
      instructor: '',
      instructorFont: t.font,
      instructorSize: 14.5,
      instructorColor: t.heroText,
      instructorAlign: 'left',
      tagline: '',
      taglineFont: t.font,
      taglineSize: 15,
      taglineColor: t.heroText,
      taglineAlign: 'left',
      showBtn: true,
      btn: { text: 'Start the course', style: 'solid', radius: 999, align: 'left' },
    }),
    render(p, t) {
      const grad = `linear-gradient(180deg, ${hexA(p.overlayColor, p.overlay / 240)} 0%, ${hexA(p.overlayColor, Math.min(0.92, p.overlay / 95))} 100%)`
      const bg = p.img
        ? `${hexA(p.overlayColor, 0.25)} url('${ASSET(p.img)}') center/cover no-repeat`
        : '#26211c'
      const mw = (a: string) =>
        a === 'center' ? 'margin-left:auto;margin-right:auto;' : a === 'right' ? 'margin-left:auto;margin-right:0;' : ''
      const eyebrow = p.eyebrow
        ? `<span data-part="eyebrow" data-edit="eyebrow" contenteditable="true" style="display:block;text-align:${p.eyebrowAlign};font-family:${ff(p.eyebrowFont)};font-size:${p.eyebrowSize}px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:${p.eyebrowColor};opacity:.85">${esc(p.eyebrow)}</span>`
        : '<span></span>'
      let bottom = `<h1 data-part="title" data-edit="title" contenteditable="true" style="margin:0;text-align:${p.titleAlign};font-family:${ff(p.titleFont)};font-size:${p.titleSize}px;font-weight:${p.titleFont === 'Geist' ? 700 : 400};line-height:1.0;letter-spacing:${p.titleFont === 'Geist' ? '-2px' : '-.5px'};color:${p.titleColor};${p.titleFont === 'Geist' ? 'text-transform:uppercase;' : ''}">${esc(p.title)}</h1>`
      if (p.instructor)
        bottom += `<p data-part="byline" data-edit="instructor" contenteditable="true" style="margin:18px 0 0;text-align:${p.instructorAlign};font-family:${ff(p.instructorFont)};font-size:${p.instructorSize}px;font-weight:500;letter-spacing:.01em;color:${p.instructorColor};opacity:.82">${esc(p.instructor)}</p>`
      if (p.tagline)
        bottom += `<p data-part="description" data-edit="tagline" contenteditable="true" style="margin:14px 0 0;max-width:400px;${mw(p.taglineAlign)}text-align:${p.taglineAlign};font-family:${ff(p.taglineFont)};font-size:${p.taglineSize}px;line-height:1.5;color:${p.taglineColor};opacity:.78">${esc(p.tagline)}</p>`
      if (p.showBtn !== false)
        bottom += `<div data-part="button" style="margin-top:32px">${btnHTML(p.btn, t, 'btn.text')}</div>`
      return `<div style="position:relative;min-height:${p.height}px;background:${bg};overflow:hidden">
            <div style="position:absolute;inset:0;background:${grad}"></div>
            <div class="eb-hero" style="position:relative;min-height:${p.height}px;display:flex;flex-direction:column;justify-content:space-between;padding:34px 44px 52px">${eyebrow}<div>${bottom}</div></div>
          </div>`
    },
    inspect: () => [
      grpImage('Background image', 'img'),
      grpRange('Height', 'height', 360, 720, 10),
      grpRange('Overlay', 'overlay', 0, 100, 2, (v) => v + '%'),
      grpColors([['Overlay tint', 'overlayColor']]),
    ],
    parts: {
      eyebrow: txtPart('Eyebrow', ICO.text, 'eyebrowFont', 'eyebrowSize', 'eyebrowColor', 'eyebrowAlign', 9, 24, 'eyebrow'),
      title: txtPart('Title', ICO.heading, 'titleFont', 'titleSize', 'titleColor', 'titleAlign', 24, 96, 'title'),
      byline: txtPart('Byline', ICO.instructor, 'instructorFont', 'instructorSize', 'instructorColor', 'instructorAlign', 11, 28, 'instructor'),
      description: txtPart('Description', ICO.text, 'taglineFont', 'taglineSize', 'taglineColor', 'taglineAlign', 12, 30, 'tagline'),
      button: { label: 'Button', icon: ICO.button, groups: () => btnGroups('btn', true) },
    },
  },

  /* ---- A NOTE FROM YOUR INSTRUCTOR ---- */
  note: {
    label: 'Welcome note',
    icon: ICO.note,
    group: 'Course',
    defaults: (t) => ({
      eyebrow: '',
      eyebrowColor: t.accent,
      heading: 'Welcome — you’re in.',
      hFont: t.headingFont,
      hSize: 38,
      hColor: t.heading,
      headingAlign: 'left',
      body: [
        'I’m really glad you’re here. Everything you need to get started is right inside — there’s no rush, so take it one lesson at a time and go at your own pace.',
      ],
      bodyFont: t.font,
      bodyColor: t.text,
      bodySize: 17,
      bodyAlign: 'left',
      sign: '',
      signFont: t.headingFont,
      signSize: 24,
      signRole: 'Instructor',
      signColor: t.muted,
      signAlign: 'left',
      bg: 'none',
      px: 44,
      pt: 72,
      pb: 56,
    }),
    render(p, t) {
      let h = ''
      if (p.eyebrow)
        h += `<p data-edit="eyebrow" contenteditable="true" style="margin:0 0 18px;text-align:${p.headingAlign};font-family:${ff(t.font)};font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:${p.eyebrowColor}">${esc(p.eyebrow)}</p>`
      h += `<h2 data-part="heading" data-edit="heading" contenteditable="true" style="margin:0 0 26px;text-align:${p.headingAlign};font-family:${ff(p.hFont)};font-size:${p.hSize}px;font-weight:${p.hFont === 'Geist' ? 600 : 400};line-height:1.1;letter-spacing:${p.hFont === 'Geist' ? '-.8px' : '-.3px'};color:${p.hColor}">${esc(p.heading)}</h2>`
      h += `<div data-part="body" style="text-align:${p.bodyAlign}">`
      ;(p.body || []).forEach((para: string, i: number) => {
        h += `<p data-edit="body.${i}" contenteditable="true" style="margin:${i ? 16 : 0}px 0 0;font-family:${ff(p.bodyFont)};font-size:${p.bodySize}px;line-height:1.65;color:${p.bodyColor}">${esc(para)}</p>`
      })
      h += '</div>'
      if (p.sign)
        h += `<div data-part="signature" style="margin-top:30px;text-align:${p.signAlign}"><p data-edit="sign" contenteditable="true" style="margin:0;font-family:${ff(p.signFont)};font-size:${p.signSize}px;${p.signFont === 'Geist' ? '' : 'font-style:italic;'}color:${p.hColor}">${esc(p.sign)}</p><p data-edit="signRole" contenteditable="true" style="margin:4px 0 0;font-family:${ff(t.font)};font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${p.signColor}">${esc(p.signRole)}</p></div>`
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}">${h}</div>`
    },
    inspect: () => [
      grpType('Heading', 'h', false),
      grpColors([
        ['Eyebrow', 'eyebrowColor'],
        ['Body text', 'bodyColor'],
        ['Signature meta', 'signColor'],
      ]),
      grpNum('Body size', 'bodySize', 12, 24),
      grpColors([['Background', 'bg']]),
      grpPad(),
    ],
    parts: {
      heading: txtPart('Heading', ICO.heading, 'hFont', 'hSize', 'hColor', 'headingAlign', 18, 72),
      body: txtPart('Body', ICO.text, 'bodyFont', 'bodySize', 'bodyColor', 'bodyAlign', 12, 24),
      signature: {
        label: 'Signature',
        icon: ICO.instructor,
        groups: () => [
          txtTypo('Signature', 'signFont', 'signSize', 'signColor', 16, 40),
          txtAlign('signAlign'),
        ],
      },
    },
  },

  /* ---- COURSE STATS (minimal hairline row) ---- */
  meta: {
    label: 'Course facts',
    icon: ICO.meta,
    group: 'Course',
    defaults: (t) => ({
      items: [
        { v: '12 lessons', l: '' },
        { v: '3h 40m', l: '' },
        { v: 'All levels', l: '' },
      ],
      valFont: t.font,
      valSize: 13,
      valColor: t.heading,
      divider: t.border,
      font: t.font,
      align: 'left',
      bg: 'none',
      px: 44,
      pt: 0,
      pb: 8,
    }),
    render(p) {
      const justify = p.align === 'center' ? 'center' : p.align === 'right' ? 'flex-end' : 'flex-start'
      const cells = (p.items || [])
        .map(
          (it: Props, i: number) =>
            `<span data-edit="items.${i}.v" contenteditable="true" style="font-family:${ff(p.valFont)};font-size:${p.valSize}px;font-weight:500;letter-spacing:.02em;color:${p.valColor}">${esc(it.v)}</span>`,
        )
        .join(`<span style="color:${p.divider};opacity:.7">·</span>`)
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}"><div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:${justify};border-top:1px solid ${p.divider};border-bottom:1px solid ${p.divider};padding:16px 0">${cells}</div></div>`
    },
    inspect: () => [
      grpSelect('Font', 'valFont', Object.keys(FONTS)),
      grpNum('Size', 'valSize', 10, 22),
      grpColors([
        ['Text', 'valColor'],
        ['Divider', 'divider'],
        ['Background', 'bg'],
      ]),
      grpAlign(['left', 'center', 'right']),
      grpPad(),
    ],
  },

  /* ---- CURRICULUM ---- */
  lessons: {
    label: 'Curriculum',
    icon: ICO.lessons,
    group: 'Course',
    defaults: (t) => ({
      heading: 'What you will learn',
      hFont: t.headingFont,
      hSize: 32,
      hColor: t.heading,
      hAlign: 'left',
      intro: '',
      introColor: t.text,
      // Placeholder rows — bindCourse replaces these with the real curriculum.
      items: [
        { title: 'Lesson one', meta: '' },
        { title: 'Lesson two', meta: '' },
        { title: 'Lesson three', meta: '' },
        { title: 'Lesson four', meta: '' },
        { title: 'Lesson five', meta: '' },
      ],
      listFont: t.font,
      titleSize: 16,
      numColor: t.muted,
      titleColor: t.heading,
      metaColor: t.muted,
      divider: t.border,
      font: t.font,
      bg: 'none',
      px: 44,
      pt: 56,
      pb: 56,
    }),
    render(p, t) {
      let h = `<h2 data-part="heading" data-edit="heading" contenteditable="true" style="margin:0 0 ${p.intro ? 14 : 34}px;text-align:${p.hAlign};font-family:${ff(p.hFont)};font-size:${p.hSize}px;font-weight:${p.hFont === 'Geist' ? 600 : 400};line-height:1.1;letter-spacing:${p.hFont === 'Geist' ? '-.6px' : '-.3px'};color:${p.hColor}">${esc(p.heading)}</h2>`
      if (p.intro)
        h += `<p data-edit="intro" contenteditable="true" style="margin:0 0 34px;font-family:${ff(t.font)};font-size:15px;line-height:1.6;color:${p.introColor};max-width:430px">${esc(p.intro)}</p>`
      const rows = (p.items || [])
        .map(
          (it: Props, i: number) => `<div style="display:flex;align-items:baseline;gap:20px;padding:20px 0;border-top:1px solid ${p.divider}">
            <span style="flex:none;width:22px;font-family:${ff(p.listFont)};font-size:13px;font-weight:500;color:${p.numColor};font-variant-numeric:tabular-nums">${String(i + 1).padStart(2, '0')}</span>
            <span data-edit="items.${i}.title" contenteditable="true" style="flex:1;min-width:0;font-family:${ff(p.listFont)};font-size:${p.titleSize}px;font-weight:500;letter-spacing:-.1px;color:${p.titleColor}">${esc(it.title)}</span>
            <span data-edit="items.${i}.meta" contenteditable="true" style="flex:none;font-family:${ff(p.listFont)};font-size:13px;font-weight:400;color:${p.metaColor};font-variant-numeric:tabular-nums">${esc(it.meta)}</span>
          </div>`,
        )
        .join('')
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}">${h}<div data-part="list" style="border-bottom:1px solid ${p.divider}">${rows}</div></div>`
    },
    inspect: () => [grpColors([['Background', 'bg']]), grpPad()],
    parts: {
      heading: txtPart('Heading', ICO.heading, 'hFont', 'hSize', 'hColor', 'hAlign', 18, 64),
      list: {
        label: 'Lessons',
        icon: ICO.lessons,
        groups: () => [
          txtTypo('Lesson text', 'listFont', 'titleSize', 'titleColor', 12, 24),
          {
            kind: 'group',
            title: 'Colours',
            ctls: [
              { kind: 'color', label: 'Number', key: 'numColor' },
              { kind: 'color', label: 'Duration', key: 'metaColor' },
              { kind: 'color', label: 'Divider', key: 'divider' },
            ],
          },
        ],
      },
    },
  },

  /* ---- PROGRESS BAR ---- */
  progress: {
    label: 'Progress bar',
    icon: ICO.progress,
    group: 'Course',
    defaults: (t) => ({
      label: 'Your progress',
      value: 3,
      total: 12,
      fill: t.heading,
      track: t.border,
      labelColor: t.muted,
      countColor: t.heading,
      labelFont: t.font,
      labelSize: 11,
      font: t.font,
      bg: 'none',
      px: 44,
      pt: 40,
      pb: 40,
    }),
    render(p) {
      const total = Math.max(1, p.total || 1)
      const pct = Math.max(0, Math.min(100, Math.round(((p.value || 0) / total) * 100)))
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}">
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:13px">
              <span data-edit="label" contenteditable="true" style="font-family:${ff(p.labelFont)};font-size:${p.labelSize}px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${p.labelColor}">${esc(p.label)}</span>
              <span style="font-family:${ff(p.font)};font-size:12.5px;font-weight:500;color:${p.countColor};font-variant-numeric:tabular-nums">${p.value} of ${total} &nbsp;·&nbsp; ${pct}%</span>
            </div>
            <div style="height:4px;border-radius:999px;background:${p.track};overflow:hidden"><div style="height:100%;width:${pct}%;background:${p.fill};border-radius:999px"></div></div>
          </div>`
    },
    inspect: () => [
      grpNum('Completed', 'value', 0, 99),
      grpNum('Total', 'total', 1, 99),
      grpSelect('Label font', 'labelFont', Object.keys(FONTS)),
      grpNum('Label size', 'labelSize', 9, 18),
      grpColors([
        ['Fill', 'fill'],
        ['Track', 'track'],
        ['Label', 'labelColor'],
        ['Count', 'countColor'],
        ['Background', 'bg'],
      ]),
      grpPad(),
    ],
  },

  /* ---- TRAILER ---- */
  trailer: {
    label: 'Trailer',
    icon: ICO.trailer,
    // No `group` → hidden from the add-block palette. Trailers don't play in
    // email and the block is dropped from the templates; keeping the render
    // (below) means any already-saved email that still has one won't break.
    defaults: (t) => ({
      img: 'assets/course-trailer.jpg',
      label: 'Watch the trailer',
      sub: '2 min',
      href: '',
      playbackId: '',
      radius: 4,
      playColor: '#ffffff',
      labelFont: t.font,
      labelSize: 14,
      labelColor: t.heading,
      subColor: t.muted,
      bg: 'none',
      px: 44,
      pt: 24,
      pb: 24,
    }),
    render(p, t) {
      const img = p.img
        ? `background:#000 url('${ASSET(p.img)}') center/cover no-repeat`
        : 'background:#26211c'
      // The poster is a real link so the SENT email clicks through to the video
      // (emails can't embed a player). In the editor the engine intercepts the
      // click on [data-trailer-play] and streams the Mux video inline instead.
      const inner = `<div class="eb-trailer" data-trailer-play${p.playbackId ? ` data-playback="${esc(p.playbackId)}"` : ''} style="position:relative;border-radius:${p.radius}px;overflow:hidden;${img};aspect-ratio:16/9;display:block;cursor:pointer">
              <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.28))"></div>
              <div style="position:absolute;inset:0;margin:auto;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;color:${p.playColor}">${svg(ICO.play, 20)}</div>
            </div>`
      const poster = p.href
        ? `<a href="${esc(p.href)}" target="_blank" rel="noopener" style="text-decoration:none;display:block">${inner}</a>`
        : inner
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}">
            ${poster}
            <div style="margin-top:16px;display:flex;align-items:baseline;justify-content:space-between;gap:12px">
              <span data-edit="label" contenteditable="true" style="font-family:${ff(p.labelFont)};font-size:${p.labelSize}px;font-weight:600;color:${p.labelColor}">${esc(p.label)}</span>
              <span data-edit="sub" contenteditable="true" style="font-family:${ff(t.font)};font-size:13px;font-weight:400;color:${p.subColor}">${esc(p.sub)}</span>
            </div>
          </div>`
    },
    inspect: () => [
      grpImage('Thumbnail', 'img'),
      {
        kind: 'group',
        title: 'Video',
        ctls: [
          { kind: 'field', label: 'Mux playback ID', key: 'playbackId', ph: 'plays in the editor' },
          { kind: 'field', label: 'Watch link', key: 'href', ph: 'opens in the sent email' },
        ],
      },
      grpSelect('Caption font', 'labelFont', Object.keys(FONTS)),
      grpNum('Caption size', 'labelSize', 11, 24),
      grpColors([
        ['Label', 'labelColor'],
        ['Sub label', 'subColor'],
        ['Play button', 'playColor'],
        ['Background', 'bg'],
      ]),
      grpRange('Corner radius', 'radius', 0, 24, 2),
      grpPad(),
    ],
  },

  /* ---- INSTRUCTOR ---- */
  instructor: {
    label: 'Instructor',
    icon: ICO.instructor,
    group: 'Course',
    defaults: (t) => ({
      // Filled from the real course by bindCourse (name / role / bio / portrait).
      img: 'assets/course-instructor.jpg',
      name: '',
      role: 'Instructor',
      bio: '',
      nameFont: t.headingFont,
      nameSize: 30,
      nameAlign: 'left',
      nameColor: t.heading,
      roleColor: t.muted,
      bioFont: t.font,
      bioSize: 15,
      bioAlign: 'left',
      bioColor: t.text,
      imgRadius: 4,
      divider: t.border,
      bg: 'none',
      px: 44,
      pt: 56,
      pb: 56,
    }),
    render(p, t) {
      const img = p.img
        ? `<img src="${ASSET(p.img)}" alt="${esc(p.name)}" style="display:block;width:100%;height:100%;object-fit:cover;border-radius:${p.imgRadius}px"/>`
        : `<div class="eb-imgph" style="height:100%;border-radius:${p.imgRadius}px"></div>`
      const text = `<div style="flex:1;min-width:0">
            <div data-part="identity" style="text-align:${p.nameAlign}">
            <p data-edit="role" contenteditable="true" style="margin:0 0 10px;font-family:${ff(t.font)};font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${p.roleColor}">${esc(p.role)}</p>
            <p data-edit="name" contenteditable="true" style="margin:0;font-family:${ff(p.nameFont)};font-size:${p.nameSize}px;font-weight:${p.nameFont === 'Geist' ? 600 : 400};letter-spacing:-.4px;line-height:1.05;color:${p.nameColor}">${esc(p.name)}</p>
            </div>
            <p data-part="bio" data-edit="bio" contenteditable="true" style="margin:16px 0 0;text-align:${p.bioAlign};font-family:${ff(p.bioFont)};font-size:${p.bioSize}px;line-height:1.6;color:${p.bioColor}">${esc(p.bio)}</p>
          </div>`
      const portrait = `<div data-part="portrait" style="flex:none;width:132px;height:160px">${img}</div>`
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}"><div style="border-top:1px solid ${p.divider};padding-top:36px"><div class="eb-insrow" style="display:flex;gap:26px;align-items:flex-start">${portrait}${text}</div></div></div>`
    },
    inspect: () => [
      grpImage('Portrait', 'img'),
      grpColors([
        ['Name', 'nameColor'],
        ['Role', 'roleColor'],
        ['Bio', 'bioColor'],
        ['Divider', 'divider'],
        ['Background', 'bg'],
      ]),
      grpPad(),
    ],
    parts: {
      portrait: {
        label: 'Portrait',
        icon: ICO.image,
        groups: () => [
          grpImage('Portrait', 'img'),
          {
            kind: 'group',
            title: 'Shape',
            ctls: [{ kind: 'range', label: 'Corner radius', key: 'imgRadius', min: 0, max: 24, step: 2 }],
          },
        ],
      },
      identity: {
        label: 'Name & role',
        icon: ICO.instructor,
        groups: () => [
          {
            kind: 'group',
            title: 'Name',
            ctls: [
              { kind: 'select', key: 'nameFont', opts: Object.keys(FONTS), label: 'Font' },
              { kind: 'num', label: 'Size', key: 'nameSize', min: 16, max: 56 },
              { kind: 'color', label: 'Name colour', key: 'nameColor' },
              { kind: 'color', label: 'Role colour', key: 'roleColor' },
            ],
          },
          txtAlign('nameAlign'),
        ],
      },
      bio: txtPart('Bio', ICO.text, 'bioFont', 'bioSize', 'bioColor', 'bioAlign', 12, 24),
    },
  },

  /* ---- IMAGE ---- */
  image: {
    label: 'Image',
    icon: ICO.image,
    group: 'Content',
    defaults: () => ({
      src: 'assets/vision-room.jpg',
      alt: '',
      href: '',
      radius: 0,
      maxw: 640,
      align: 'center',
      bg: 'none',
      px: 0,
      pt: 0,
      pb: 0,
    }),
    render(p) {
      const inner = p.src
        ? `<img src="${ASSET(p.src)}" alt="${esc(p.alt)}" style="display:block;width:100%;max-width:${p.maxw}px;${p.align === 'center' ? 'margin:0 auto;' : ''}border-radius:${p.radius}px;border:0"/>`
        : `<div class="eb-imgph" style="border-radius:${p.radius}px"><span class="pic-ic">${svg(ICO.pic, 22, 1.5)}</span>Add an image</div>`
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''};text-align:${p.align}">${inner}</div>`
    },
    inspect: (p) => [
      grpImage('Image', 'src'),
      grpField('Alt text', 'alt'),
      grpField('Links to', 'href', 'https://…'),
      grpRange('Corner radius', 'radius', 0, 28, 2),
      grpNum('Max width', 'maxw', 120, 640),
      grpColors([['Background', 'bg']]),
      grpPad(),
    ],
  },

  /* ---- HEADING ---- */
  heading: {
    label: 'Heading',
    icon: ICO.heading,
    group: 'Content',
    defaults: (t) => ({
      text: 'Heading',
      hFont: t.headingFont,
      hSize: 32,
      hWeight: t.headingFont === 'Geist' ? 600 : 400,
      hColor: t.heading,
      hLs: -0.3,
      hLh: 1.15,
      hTransform: 'none',
      align: 'left',
      px: 44,
      pt: 16,
      pb: 8,
      bg: 'none',
    }),
    render(p) {
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}"><h2 data-edit="text" contenteditable="true" style="margin:0;font-family:${ff(p.hFont)};font-size:${p.hSize}px;font-weight:${p.hWeight};color:${p.hColor};letter-spacing:${p.hLs}px;line-height:${p.hLh};text-transform:${p.hTransform};text-align:${p.align}">${esc(p.text)}</h2></div>`
    },
    inspect: () => [grpType2(), grpAlign(['left', 'center', 'right']), grpColors([['Background', 'bg']]), grpPad()],
  },

  /* ---- TEXT ---- */
  text: {
    label: 'Text',
    icon: ICO.text,
    group: 'Content',
    defaults: (t) => ({
      text: 'Body copy goes here. Edit it inline, or restyle it from the inspector.',
      font: t.font,
      size: 16,
      color: t.text,
      lh: 1.65,
      align: 'left',
      maxw: 0,
      px: 44,
      pt: 6,
      pb: 14,
      bg: 'none',
    }),
    render(p) {
      const mw = p.maxw
        ? `max-width:${p.maxw}px;${p.align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}`
        : ''
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}"><p data-edit="text" contenteditable="true" style="margin:0;font-family:${ff(p.font)};font-size:${p.size}px;line-height:${p.lh};color:${p.color};text-align:${p.align};${mw}">${esc(p.text)}</p></div>`
    },
    inspect: () => [
      grpSelect('Font', 'font', Object.keys(FONTS)),
      grpNum('Size', 'size', 10, 40),
      grpRange('Line height', 'lh', 1.1, 2.2, 0.05),
      grpAlign(['left', 'center', 'right']),
      grpColors([
        ['Text', 'color'],
        ['Background', 'bg'],
      ]),
      grpPad(),
    ],
  },

  /* ---- BUTTON ---- */
  button: {
    label: 'Button',
    icon: ICO.button,
    group: 'Content',
    defaults: (t) => ({
      text: 'Enter the course',
      href: '#',
      style: 'solid',
      bg: t.button,
      color: t.buttonText,
      border: t.border,
      radius: 999,
      size: 14.5,
      align: 'left',
      arrow: false,
      font: t.font,
      pt: 8,
      pb: 20,
      px: 44,
      blockBg: 'none',
    }),
    render(p, t) {
      return `<div class="eb-sec" style="${padBox(p)};${p.blockBg !== 'none' ? 'background:' + p.blockBg : ''}">${btnHTML(p, t)}</div>`
    },
    inspect: () => [
      grpSeg('Style', 'style', [
        ['solid', 'Solid'],
        ['outline', 'Outline'],
        ['link', 'Link'],
      ]),
      grpField('Link URL', 'href'),
      grpColors([
        ['Background', 'bg'],
        ['Label', 'color'],
        ['Border', 'border'],
      ]),
      { kind: 'group', title: 'Corners', ctls: [{ kind: 'radius', key: 'radius' }] },
      grpAlign(['left', 'center', 'right']),
      grpSwitch('Arrow', 'arrow', 'Append → to the label'),
      grpPad(),
    ],
  },

  /* ---- CTA ---- */
  cta: {
    label: 'Call to action',
    icon: ICO.cta,
    group: 'Course',
    defaults: (t) => ({
      heading: 'Your first lesson is waiting.',
      hFont: t.headingFont,
      hSize: 32,
      hColor: t.heading,
      hAlign: 'center',
      body: 'Begin whenever you’re ready.',
      bodyFont: t.font,
      bodyColor: t.text,
      bodySize: 16,
      bAlign: 'center',
      showBtn: true,
      btn: { text: 'Start watching', style: 'solid', size: 14.5, align: 'center' },
      align: 'center',
      divider: t.border,
      px: 44,
      pt: 64,
      pb: 72,
    }),
    render(p, t) {
      let inner = `<p data-part="heading" data-edit="heading" contenteditable="true" style="margin:0 0 14px;font-family:${ff(p.hFont)};font-size:${p.hSize}px;font-weight:${p.hFont === 'Geist' ? 600 : 400};line-height:1.15;letter-spacing:${p.hFont === 'Geist' ? '-.6px' : '-.3px'};color:${p.hColor};text-align:${p.hAlign}">${esc(p.heading)}</p>`
      if (p.body)
        inner += `<p data-part="body" data-edit="body" contenteditable="true" style="margin:0 0 30px;font-family:${ff(p.bodyFont)};font-size:${p.bodySize}px;line-height:1.55;color:${p.bodyColor};text-align:${p.bAlign}">${esc(p.body)}</p>`
      if (p.btn && p.showBtn !== false)
        inner += `<div data-part="button">${btnHTML(p.btn, t, 'btn.text')}</div>`
      return `<div class="eb-sec" style="${padBox(p)}"><div style="border-top:1px solid ${p.divider};padding-top:56px">${inner}</div></div>`
    },
    inspect: () => [grpColors([['Divider', 'divider']]), grpPad()],
    parts: {
      heading: txtPart('Heading', ICO.heading, 'hFont', 'hSize', 'hColor', 'hAlign', 18, 64),
      body: txtPart('Body', ICO.text, 'bodyFont', 'bodySize', 'bodyColor', 'bAlign', 12, 24),
      button: { label: 'Button', icon: ICO.button, groups: () => btnGroups('btn', true) },
    },
  },

  /* ---- QUOTE ---- */
  quote: {
    label: 'Quote',
    icon: ICO.quote,
    group: 'Content',
    defaults: (t) => ({
      text: 'Add a short, memorable line here.',
      by: '',
      color: t.heading,
      byColor: t.muted,
      font: t.headingFont,
      size: 28,
      align: 'center',
      byFont: t.font,
      bySize: 11,
      byAlign: 'center',
      px: 44,
      pt: 56,
      pb: 56,
      bg: 'none',
    }),
    render(p) {
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''}"><blockquote style="margin:0"><p data-part="quote" data-edit="text" contenteditable="true" style="margin:0;text-align:${p.align};font-family:${ff(p.font)};font-size:${p.size}px;line-height:1.3;letter-spacing:-.4px;${p.font !== 'Geist' ? 'font-style:italic;' : ''}color:${p.color};max-width:460px;${p.align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}">${esc(p.text)}</p><p data-part="attribution" data-edit="by" contenteditable="true" style="margin:18px 0 0;text-align:${p.byAlign};font-family:${ff(p.byFont)};font-size:${p.bySize}px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${p.byColor}">${esc(p.by)}</p></blockquote></div>`
    },
    inspect: () => [grpColors([['Background', 'bg']]), grpPad()],
    parts: {
      quote: txtPart('Quote', ICO.quote, 'font', 'size', 'color', 'align', 16, 48),
      attribution: txtPart('Attribution', ICO.text, 'byFont', 'bySize', 'byColor', 'byAlign', 9, 20),
    },
  },

  /* ---- DIVIDER ---- */
  divider: {
    label: 'Divider',
    icon: ICO.divider,
    group: 'Content',
    defaults: (t) => ({ color: t.border, thick: 1, style: 'solid', width: 100, px: 44, pt: 8, pb: 8, bg: 'none' }),
    render(p) {
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''};text-align:center"><hr style="border:0;border-top:${p.thick}px ${p.style} ${p.color};width:${p.width}%;display:inline-block;margin:0"/></div>`
    },
    inspect: (p) => [
      grpColors([
        ['Colour', 'color'],
        ['Background', 'bg'],
      ]),
      grpSelect('Style', 'style', ['solid', 'dashed', 'dotted']),
      grpNum('Thickness', 'thick', 1, 6),
      grpRange('Width', 'width', 20, 100, 5),
      grpPad(),
    ],
  },

  /* ---- SPACER ---- */
  spacer: {
    label: 'Spacer',
    icon: ICO.spacer,
    group: 'Content',
    defaults: () => ({ h: 40, bg: 'none' }),
    render(p) {
      return `<div style="height:${p.h}px;${p.bg !== 'none' ? 'background:' + p.bg : ''}"></div>`
    },
    inspect: () => [grpRange('Height', 'h', 8, 160, 4), grpColors([['Background', 'bg']])],
    noLabel: true,
  },

  /* ---- FOOTER ---- */
  footer: {
    label: 'Footer',
    icon: ICO.footer,
    group: 'Footer',
    defaults: (t) => ({
      tagline: 'You are receiving this because you enrolled in this course.',
      taglineColor: t.muted,
      links: 'My courses    ·    Help',
      linksColor: t.muted,
      // Deliberately empty: shipping a made-up default address in real emails
      // is a CAN-SPAM problem. The canvas shows an inline nudge (data-ph) and
      // the sent render simply omits the line until the creator fills it in.
      address: '',
      addressColor: t.muted,
      unsub: 'Unsubscribe',
      unsubColor: t.muted,
      font: t.font,
      align: 'center',
      bg: 'none',
      borderTop: true,
      borderColor: t.border,
      linksFont: t.font,
      linksSize: 12.5,
      linksAlign: 'center',
      fpFont: t.font,
      fpSize: 12,
      fpAlign: 'center',
      px: 44,
      pt: 48,
      pb: 56,
    }),
    render(p) {
      const border = p.borderTop ? `border-top:1px solid ${p.borderColor};` : ''
      return `<div class="eb-sec" style="${padBox(p)};${p.bg !== 'none' ? 'background:' + p.bg : ''};${border}">
          <p data-part="links" data-edit="links" contenteditable="true" style="margin:0 0 24px;text-align:${p.linksAlign};font-family:${ff(p.linksFont)};font-size:${p.linksSize}px;font-weight:500;letter-spacing:.02em;color:${p.linksColor}">${esc(p.links)}</p>
          <div data-part="fineprint" style="text-align:${p.fpAlign}">
          <p data-edit="tagline" contenteditable="true" style="margin:0 ${p.fpAlign === 'center' ? 'auto' : '0'} 8px;max-width:340px;font-family:${ff(p.fpFont)};font-size:${p.fpSize}px;line-height:1.6;color:${p.taglineColor}">${esc(p.tagline)}</p>
          <p data-edit="address" data-ph="Add your business postal address (required by anti-spam law)" contenteditable="true" style="margin:0 0 14px;font-family:${ff(p.fpFont)};font-size:11px;line-height:1.5;min-height:1em;color:${p.addressColor}">${esc(p.address)}</p>
          <p style="margin:0;font-family:${ff(p.fpFont)};font-size:11px;color:${p.unsubColor}"><a data-edit="unsub" contenteditable="true" href="#" onclick="return false" style="color:${p.unsubColor};text-decoration:underline;text-underline-offset:2px">${esc(p.unsub)}</a></p>
          </div>
        </div>`
    },
    inspect: () => [
      grpColors([
        ['Links', 'linksColor'],
        ['Tagline', 'taglineColor'],
        ['Address', 'addressColor'],
        ['Unsubscribe', 'unsubColor'],
      ]),
      grpSwitch('Top border', 'borderTop', 'Hairline above the footer'),
      grpColors([
        ['Border', 'borderColor'],
        ['Background', 'bg'],
      ]),
      grpPad(),
    ],
    parts: {
      links: {
        label: 'Links',
        icon: ICO.text,
        groups: () => [txtTypo('Links', 'linksFont', 'linksSize', 'linksColor', 10, 20), txtAlign('linksAlign')],
      },
      fineprint: {
        label: 'Fine print',
        icon: ICO.text,
        groups: () => [
          {
            kind: 'group',
            title: 'Fine print',
            ctls: [
              { kind: 'select', key: 'fpFont', opts: Object.keys(FONTS), label: 'Font' },
              { kind: 'num', label: 'Size', key: 'fpSize', min: 10, max: 18 },
              { kind: 'color', label: 'Tagline', key: 'taglineColor' },
              { kind: 'color', label: 'Address', key: 'addressColor' },
              { kind: 'color', label: 'Unsubscribe', key: 'unsubColor' },
            ],
          },
          txtAlign('fpAlign'),
        ],
      },
    },
  },
}

export const GROUPS = ['Course', 'Content', 'Footer']

/* ============================================================ TEMPLATES
   The six behavioural lifecycle emails, course-agnostic. Copy stays generic;
   bindCourse fills course specifics (title, tagline, lessons, instructor) from
   the real course. Each fires on a student behaviour, not a schedule. */
export const TEMPLATES: Record<string, TemplateDef> = {
  enrolment: {
    theme: 'studio',
    name: 'Enrolment',
    subtitle: 'Sent the moment access is granted',
    blocks: [
      {
        type: 'coverHero',
        props: {
          img: 'assets/course-cover.jpg',
          // No brand eyebrow and no description paragraph — the cover is just
          // the centered title, the "Taught by …" byline, and the CTA.
          eyebrow: '',
          // title / byline are course slots — bindCourse fills them.
          title: '',
          titleSize: 64,
          titleAlign: 'center',
          instructor: '',
          instructorAlign: 'center',
          tagline: '',
          btn: { text: 'Start the course', style: 'solid', align: 'center', radius: 999 },
        },
      },
      {
        type: 'note',
        props: {
          // heading + signature are filled from the course by bindCourse.
          heading: 'Welcome — you’re in.',
          headingAlign: 'center',
          bodyAlign: 'center',
          sign: '',
          signRole: 'Instructor',
          // Signature sits far right, under the centered note.
          signAlign: 'right',
          body: [
            'I’m really glad you’re here. Everything you need to get started is right inside — there’s no rush, so take it one lesson at a time and go at your own pace.',
          ],
        },
      },
      { type: 'meta', props: { align: 'center' } },
      { type: 'lessons', props: { hAlign: 'center' } },
      { type: 'instructor', props: { img: 'assets/course-instructor.jpg' } },
      { type: 'cta', props: {} },
      { type: 'footer', props: {} },
    ],
  },
  firstLesson: {
    theme: 'studio',
    name: 'First lesson completed',
    subtitle: 'Fires on their first finish',
    blocks: [
      {
        type: 'coverHero',
        props: {
          img: 'assets/course-cover.jpg',
          height: 460,
          overlay: 62,
          eyebrow: 'Lesson 1',
          title: 'A good start.',
          titleSize: 60,
          // byline shows the first lesson — bindCourse fills it from the course.
          instructor: '',
          tagline: 'The hardest part of any course is starting. You’ve done that.',
          btn: { text: 'Continue to the next lesson', style: 'solid', align: 'left', radius: 999 },
        },
      },
      { type: 'progress', props: { label: 'Your progress', value: 1, total: 12 } },
      {
        type: 'note',
        props: {
          heading: 'Keep that going.',
          sign: '',
          signRole: 'Instructor',
          body: [
            'The first lesson is the one that decides the rest. Most people never finish it. You did. Everything from here builds on what you just learned.',
          ],
        },
      },
      {
        type: 'cta',
        props: {
          heading: 'Your next lesson is ready.',
          body: 'Pick up where you left off.',
          btn: { text: 'Continue the course', style: 'solid', size: 14.5, align: 'center' },
        },
      },
      { type: 'footer', props: {} },
    ],
  },
  specificLesson: {
    theme: 'studio',
    name: 'Specific lesson completed',
    subtitle: 'Fires when they clear a chosen lesson',
    blocks: [
      {
        type: 'coverHero',
        props: {
          img: 'assets/course-cover.jpg',
          height: 460,
          overlay: 64,
          eyebrow: 'A pivotal lesson',
          title: 'The turning point.',
          titleSize: 58,
          // byline shows the pivotal lesson — bindCourse fills it from the course.
          instructor: '',
          tagline: 'This is the lesson the rest of the course is built on.',
          btn: { text: 'Continue to the next lesson', style: 'solid', align: 'left', radius: 999 },
        },
      },
      { type: 'progress', props: { label: 'Your progress', value: 4, total: 12 } },
      {
        type: 'note',
        props: {
          heading: 'You turned the corner.',
          sign: '',
          signRole: 'Instructor',
          body: [
            'This is one of the lessons the rest of the course leans on. It rewards the time you put in, and you gave it exactly that. You’ll feel the difference in everything that comes after.',
          ],
        },
      },
      {
        type: 'cta',
        props: {
          heading: 'There’s more where that came from.',
          body: 'The next lesson is ready when you are.',
          btn: { text: 'Resume the course', style: 'solid', size: 14.5, align: 'center' },
        },
      },
      { type: 'footer', props: {} },
    ],
  },
  halfway: {
    theme: 'studio',
    name: 'Halfway',
    subtitle: 'Fires at 50% — the retention email',
    blocks: [
      {
        type: 'coverHero',
        props: {
          img: 'assets/course-cover.jpg',
          height: 460,
          overlay: 64,
          eyebrow: 'The halfway mark',
          title: 'You’re halfway.',
          titleSize: 56,
          // byline shows the course name — bindCourse fills it from the course.
          instructor: '',
          tagline: 'This is the middle, where most people drift. You’re still here.',
          btn: { text: 'Continue the course', style: 'solid', align: 'left', radius: 999 },
        },
      },
      { type: 'progress', props: { label: 'Your progress', value: 6, total: 12 } },
      {
        type: 'note',
        props: {
          heading: 'Stay with it.',
          sign: '',
          signRole: 'Instructor',
          body: [
            'The middle is where most people drift — and you’re still here. This is where it starts to click. The second half is where everything you’ve learned so far comes together.',
          ],
        },
      },
      {
        type: 'lessons',
        props: {
          // "Still to come" — bindCourse fills the second half of the curriculum.
          heading: 'Still to come',
          intro: '',
          items: [
            { title: 'Lesson', meta: '' },
            { title: 'Lesson', meta: '' },
            { title: 'Lesson', meta: '' },
          ],
        },
      },
      {
        type: 'cta',
        props: {
          heading: 'The next lesson is ready.',
          body: 'Begin whenever you’re ready.',
          btn: { text: 'Resume the course', style: 'solid', size: 14.5, align: 'center' },
        },
      },
      { type: 'footer', props: {} },
    ],
  },
  courseComplete: {
    theme: 'studio',
    name: 'Course completed',
    subtitle: 'Fires when every lesson is done',
    blocks: [
      {
        type: 'coverHero',
        props: {
          img: 'assets/course-cover.jpg',
          height: 500,
          overlay: 58,
          eyebrow: 'Course complete',
          title: 'You did it.',
          titleSize: 64,
          // byline shows the course name — bindCourse fills it from the course.
          instructor: '',
          tagline: 'Every lesson, done. What you built here is yours now.',
          // No certificates exist on the platform — the completion CTA sends
          // them back into the course they now own.
          btn: { text: 'Rewatch your favorites', style: 'solid', align: 'left', radius: 999 },
        },
      },
      { type: 'progress', props: { label: 'Course progress', value: 12, total: 12 } },
      {
        type: 'note',
        props: {
          heading: 'This is the beginning.',
          sign: '',
          signRole: 'Instructor',
          body: [
            'Finishing the whole thing puts you in rare company. But it only counts if you use it — put what you learned into practice this week. That’s where it truly becomes yours.',
          ],
        },
      },
      {
        type: 'cta',
        props: {
          heading: 'What to learn next.',
          body: 'Your next course is waiting.',
          btn: { text: 'Explore more courses', style: 'solid', size: 14.5, align: 'center' },
        },
      },
      { type: 'footer', props: {} },
    ],
  },
  inactive: {
    theme: 'studio',
    name: 'Inactive for N days',
    subtitle: 'Win-back after a quiet stretch',
    blocks: [
      {
        type: 'coverHero',
        props: {
          img: 'assets/course-cover.jpg',
          height: 460,
          overlay: 62,
          eyebrow: 'Your place is saved',
          title: 'Where you left off.',
          titleSize: 54,
          instructor: 'Right where you left off',
          tagline: 'It’s been a little while. Nothing has moved.',
          btn: { text: 'Pick up where you left off', style: 'solid', align: 'left', radius: 999 },
        },
      },
      // No progress bar here: unlike the lifecycle moments (first lesson /
      // halfway / complete), an inactivity email says nothing about how far
      // the recipient actually got — a fixed bar would be a lie for everyone.
      {
        type: 'note',
        props: {
          heading: 'Five minutes is enough.',
          sign: '',
          signRole: 'Instructor',
          body: [
            'You don’t have to finish today. Press play on one lesson. The next one is short, and it starts exactly where you stopped.',
          ],
        },
      },
      {
        type: 'cta',
        props: {
          heading: 'Whenever you’re ready.',
          body: 'Your next lesson is cued up.',
          btn: { text: 'Resume the course', style: 'solid', size: 14.5, align: 'center' },
        },
      },
      { type: 'footer', props: {} },
    ],
  },
}

export const EMAIL = { THEMES, TEMPLATES, REG, PALETTE, FONTS, GROUPS, svg, ICO, hexA }
export type EmailModule = typeof EMAIL

// Brick 12 — canvas theming. The four email themes from the user's design
// (decoded verbatim: emailBg / outerBg / content colours). A theme recolors the
// email surface, the canvas backdrop, and the preview's text/heading/link/
// button via the --em-* CSS variables that editor.css falls back from.

export type ThemeKey = 'chef' | 'yoga' | 'serve' | 'studio'

export interface EmailTheme {
  key: ThemeKey
  name: string
  emailBg: string
  outerBg: string
  heading: string
  text: string
  muted: string
  link: string
  accent: string
  button: string
  buttonText: string
  border: string
}

export const THEMES: EmailTheme[] = [
  {
    key: 'yoga',
    name: 'Daylight',
    emailBg: '#f4f1ea',
    outerBg: '#e6e1d6',
    heading: '#1f241c',
    text: '#5a6052',
    muted: '#9a9e90',
    link: '#1f241c',
    accent: '#5e7355',
    button: '#1f241c',
    buttonText: '#f4f1ea',
    border: '#e1dccf',
  },
  {
    key: 'chef',
    name: 'Kitchen',
    emailBg: '#17120f',
    outerBg: '#0e0a08',
    heading: '#f2eadf',
    text: '#b8ae9f',
    muted: '#847a6d',
    link: '#f2eadf',
    accent: '#c98a5e',
    button: '#f2eadf',
    buttonText: '#17120f',
    border: 'rgba(242,234,223,.13)',
  },
  {
    key: 'serve',
    name: 'Graphite',
    emailBg: '#111315',
    outerBg: '#08090a',
    heading: '#f4f5f4',
    text: '#aeb3b1',
    muted: '#6b6f6d',
    link: '#f4f5f4',
    accent: '#8fa89a',
    button: '#f4f5f4',
    buttonText: '#111315',
    border: 'rgba(244,245,244,.12)',
  },
  {
    key: 'studio',
    name: 'Midnight',
    emailBg: '#141518',
    outerBg: '#0b0c0e',
    heading: '#efeff1',
    text: '#adafb5',
    muted: '#6e7077',
    link: '#efeff1',
    accent: '#9aa0a8',
    button: '#efeff1',
    buttonText: '#141518',
    border: 'rgba(239,239,241,.12)',
  },
]

export const themeByKey = (key: ThemeKey | null): EmailTheme | null =>
  key ? (THEMES.find((t) => t.key === key) ?? null) : null

/** The --em-* custom properties a theme drives on the .email surface. */
export const themeVars = (t: EmailTheme): Record<string, string> => ({
  '--em-bg': t.emailBg,
  '--em-text': t.text,
  '--em-muted': t.muted,
  '--em-heading': t.heading,
  '--em-link': t.link,
  '--em-accent': t.accent,
  '--em-button': t.button,
  '--em-button-text': t.buttonText,
  '--em-border': t.border,
})

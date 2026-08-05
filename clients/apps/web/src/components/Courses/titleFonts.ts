// Spaire Title Styles — the curated "movie title" typefaces a creator can
// pick for their course title (hero headline on the landing page + the
// course title in the customer portal hero). Every face is an open-licensed
// Google Font, self-hosted by next/font at build time (no runtime requests),
// one weight each to keep the payload small.
//
// The names are OURS — the picker never surfaces the underlying font name.
// "Classic" (key null/absent) is the design's default typography.

import {
  Cinzel,
  Orbitron,
  Playfair_Display,
  Special_Elite,
} from 'next/font/google'

const premiere = Playfair_Display({
  weight: '700',
  subsets: ['latin'],
  display: 'swap',
})
const epic = Cinzel({ weight: '700', subsets: ['latin'], display: 'swap' })
const dossier = Special_Elite({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
})
const orbit = Orbitron({ weight: '700', subsets: ['latin'], display: 'swap' })

export type TitleFont = {
  key: string
  /** The Spaire-brand name shown in the picker. */
  label: string
  /** One-word mood hint shown under the label. */
  mood: string
  fontFamily: string
}

export const TITLE_FONTS: TitleFont[] = [
  { key: 'premiere', label: 'Premiere', mood: 'Elegant', fontFamily: premiere.style.fontFamily },
  { key: 'epic', label: 'Epic', mood: 'Monumental', fontFamily: epic.style.fontFamily },
  { key: 'dossier', label: 'Dossier', mood: 'Typewritten', fontFamily: dossier.style.fontFamily },
  { key: 'orbit', label: 'Orbit', mood: 'Sci-fi', fontFamily: orbit.style.fontFamily },
]

/** CSS font-family for a stored title-style key; undefined for Classic /
 *  unknown keys (the design default wins). */
export function titleFontFamily(
  key: string | null | undefined,
): string | undefined {
  if (!key) return undefined
  return TITLE_FONTS.find((f) => f.key === key)?.fontFamily
}

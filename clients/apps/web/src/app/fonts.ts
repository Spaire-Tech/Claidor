// The web app's fonts, served from this repository (5 October 2026). They
// were `next/font/google` until a Vercel build failed with "module not
// found" inside the generated DM Sans stylesheet: the build downloads each
// Google family while it runs, and a download that fails fails the build.
// The files in ./fonts are Google's own latin woff2 subsets (SIL Open Font
// License), fetched once; see ./fonts/README.md. The three families nobody
// used (DM Sans, Barlow Condensed, Instrument Serif) were dropped.
import localFont from 'next/font/local'

// Inter — the Add-to-Space picker and the editor (styles/picker.css, editor.css).
export const inter = localFont({
  src: [
    {
      path: './fonts/inter-latin-wght.woff2',
      weight: '400 600',
      style: 'normal',
    },
  ],
  variable: '--font-inter',
  display: 'swap',
})

// Source Serif 4 — the Simeon display face (styles/simeon.css).
export const sourceSerif = localFont({
  src: [
    {
      path: './fonts/source-serif-4-latin-wght.woff2',
      weight: '400 600',
      style: 'normal',
    },
  ],
  variable: '--font-simeon-serif',
  display: 'swap',
})

// Newsreader — the website's serif; the sign-in pages set their headings in it.
export const newsreader = localFont({
  src: [
    {
      path: './fonts/newsreader-latin-400.woff2',
      weight: '400',
      style: 'normal',
    },
  ],
  variable: '--font-newsreader',
  display: 'swap',
})

// Poppins — the customer portal (portal.css, portal-auth.css, ProfileOnboarding).
// (The font loader takes literal values only, so the lists are written out.)
export const poppins = localFont({
  src: [
    { path: './fonts/poppins-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-latin-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins-latin-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-latin-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-poppins',
  display: 'swap',
})

// Poppins with its light weight and italics — the storefront product page.
export const poppinsProduct = localFont({
  src: [
    { path: './fonts/poppins-latin-300.woff2', weight: '300', style: 'normal' },
    { path: './fonts/poppins-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-latin-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins-latin-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-latin-700.woff2', weight: '700', style: 'normal' },
    {
      path: './fonts/poppins-latin-300italic.woff2',
      weight: '300',
      style: 'italic',
    },
    {
      path: './fonts/poppins-latin-400italic.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: './fonts/poppins-latin-500italic.woff2',
      weight: '500',
      style: 'italic',
    },
    {
      path: './fonts/poppins-latin-600italic.woff2',
      weight: '600',
      style: 'italic',
    },
    {
      path: './fonts/poppins-latin-700italic.woff2',
      weight: '700',
      style: 'italic',
    },
  ],
  display: 'swap',
})

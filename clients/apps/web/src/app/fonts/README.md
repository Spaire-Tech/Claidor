# The web app's fonts

Google's own latin woff2 subsets, fetched once from the Google Fonts CSS API
on 5 October 2026 and served from here through `next/font/local` (`../fonts.ts`),
so a build no longer downloads them from Google and cannot fail when that
download does. All four families are under the SIL Open Font License.

| File | Family | Axis |
|---|---|---|
| `inter-latin-wght.woff2` | Inter | variable, weight 400–600 |
| `source-serif-4-latin-wght.woff2` | Source Serif 4 | variable, weight 400–600 |
| `newsreader-latin-400.woff2` | Newsreader | 400 |
| `poppins-latin-{300,400,500,600,700}.woff2` | Poppins | static, upright |
| `poppins-latin-{300,400,500,600,700}italic.woff2` | Poppins | static, italic |

To refresh one, request its family from `https://fonts.googleapis.com/css2`
with a current browser's user agent and take the `/* latin */` `woff2` URL.

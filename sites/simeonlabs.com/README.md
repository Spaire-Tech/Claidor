# simeonlabs.com

The public website, with the Simeon app-window demo playing in the hero.

- `public/` is the site Vercel serves, as built.
- `source/` is how it is made: `page.html`, `build.py`, the paintings and
  wordmark (`img/`), who wears which face (`faces.py`), the scripts and styles
  laid over the demo (`demo-faces.js`, `demo-glass.*`, `demo-gate.js`) and its
  scroll guard.
- `vercel.json` tells Vercel there is no install or build step, to serve
  `public/`, and to skip a deploy when nothing under this folder changed.
  On 23 October 2026 its rules were seen not to apply: the `simeon-website`
  project builds from the repository's root (Vercel's pull-request comment
  gives it no root directory), so redirects added here answered 404 and the
  `/app/` files came back with a four-hour cache, not a year. A moved page
  forwards the reader itself instead (`teams.py`'s `/teams`, `legal.py`'s
  `/legal/...`).

## Rebuild

On a Mac, in `desktop/`: `npm run package`, then `node demo/build-demo.mjs`
(writes `dist/demo`). Then:

```
cd sites/simeonlabs.com/source
python3 build.py ../../../desktop/dist/demo
```

The script needs Playwright's Chromium (it captures the stills the hero shows
while the app loads). It rewrites `public/` from scratch; commit what it writes.

Marketplace pages: `python3 source/teams.py` rewrites `public/marketplace/`
from `server/simeon/desktop/packs.json` (build.py runs it too); run it whenever
a pack changes and commit what it writes. `source/connectors.py` writes
`public/connectors/`, with a page for each connector at `/connectors/<id>`
(`source/connector_pages.py`: the apps' connector page, its words and links read
from `ios/SimeonCore/.../ConnectorPages.swift`, so run it again when those
change), `source/pricing.py` writes `public/pricing/` and
`source/contact.py` writes `public/contact/` the same way (its form posts to the
API, `server/simeon/desktop/contact.py`, which e-mails each message to the
founder). `source/newsroom.py` writes `public/newsroom/`, the blog, in Apple Stories'
layout: its posts are the list `POSTS` in that file, stand-ins until the
first real ones (the page asks search engines not to list it while any is); the
bar's Resources and the footer link to it. The bar and the footer every page
shares are `source/nav.py`, their styles in `source/site.css` (30 October 2026):
the bar holds Products and Solutions (their arrows open nothing yet), Resources
(Marketplace, Newsroom), Connectors and Pricing, with Contact Sales and Download
on the right and a menu on a phone; the footer holds the mark, four columns
(Product, Company, Legal, Get started), then the wordmark, the copyright and the
language.
Edit `source/`, never `public/` by hand: a hand edit is lost at the next build
(the Download and plan links, made in `public/` on 11 October 2026, are in
`page.html` since 12 October).

Without a Mac, the demo `public/app/<digest>/` already holds can stand in for
`dist/demo`: copy it, delete `scroll-guard.js`, `demo-gate.js`, `demo-faces.js`
and `demo-glass.*`, and take out of its `index.html` what `build.py` adds (the
scripts and stylesheet next to `demo-bridge.js`, and the style after the
`body::before` rule). Built from the same source, the result is the same
folder byte for byte (checked on 12 October 2026).

## The agents' faces

Every agent on the page and in the demo wears a clay face from the apps'
catalogue (`ios/SimeonCore/Sources/SimeonCore/Resources/Faces`), with no
butterflies and no agent colours (the founder, 12 October 2026). `faces.py`
gives each person the face the apps would give them in one team: Simeon's
own face for the Chief of Staff, otherwise the face their name's gender has
fewest of (`AgentFaces.plan`, ported and checked against the Swift). The page
names a person with `%FACE:theo%`; the build fills in the file. In the demo,
`demo-faces.js` hands each agent its face (`desktop/demo/backend.ts` asks for
it) and dresses each mention as the apps draw one: the face, then the name in
the app's blue, in a glass pill (`demo-glass.css`). The demo's onboarding
shows the faces the apps' first run seated before it became the short one
(kept in `faces.py` as `SEATS`) and, on its first screen, the SimeonLabs logo lighting up where
the butterfly was.

## What is in the page

The page is written by hand in `source/page.html`, light only, on one left
edge shared by the wordmark, the headline and the demo.

- **Bar**: `nav.py`'s, as on every page (above). On a phone the hero shows Download for iOS, unlinked until there is an app.
- **Hero**: "Put intelligent agents to work for whatever needs doing." in the
  serif, then Download for Mac and Request a demo.
- **The app**: the real app window, playing a founder's morning.
- **Statement**: one centred sentence, the key words in black.
- **Gallery**: six cards, light grey and dusk blue in turn, moved with back
  and next: connect your apps, message an agent, a computer of its own, agents
  working together, call an agent, stay in control.
- **Security and integrations**: a serif title beside a paragraph, then two
  pale panels of icon rows. A blue dot marks what is still in progress.
- **An agent that picks up when your customers call**: a serif title beside the promise, written
  from the customer's side, then one big photo (`img/phone.webp`) with a live call playing out
  as text over it and a white Learn more, with nowhere to go yet, inside the picture. The section
  is in the page but `hidden` until the phone product ships; remove the attribute to show it.
- **Pricing** (a free month, Standard $30, Pro $100, Max $200; each card says the week's credits),
  **Questions and answers**, and the closing line.

Download and Download for Mac fetch the Mac app (`api.simeonlabs.com/desktop/download/mac`),
and each plan's button opens billing with that plan (`app.simeonlabs.com/billing?plan=…`).
The footer is `nav.py`'s, as on every page (above).

## The legal pages

`/privacy` and `/terms` (11 October 2026), in the page's bar and footer around a plain
column: the two pages' links on the left, the title, "Last updated", the text with numbered
sections (the policy also opens with its contents in a box that folds). The words are in
`source/legal/privacy.html` and `source/legal/terms.html`, the frame in
`source/legal/template.html`, and `source/legal.py` writes `public/privacy/index.html` and
`public/terms/index.html`, numbering the sections. `build.py` runs it; to change
only the words, run `python3 source/legal.py` and commit what it writes. The apps link to
`/legal/privacy-policy` and `/legal/terms-of-service`; `legal.py` writes a page at each that
sends the reader here. The
words were written from what the code does (sign-in, providers, storage, cookies); when that
changes, change them, and the date at the top of each file.

**`public/app/` is the app's window: the upstream 0.18.0 renderer with Simeon's patches (see `desktop/NOTICE.md`).** The
founder chose on 28 September 2026 to publish it with the site, knowing the
repository otherwise keeps that code out of git (`desktop/.gitignore`,
`/src/app/dist/`).

**The app's folder is named after its content** (`app/<first 12 of a SHA-256
over every file>/`, written by `build.py`). The patched files keep the names
Vite gave them before the patch, and `vercel.json` lets browsers keep
`/app/*/*` for a year, so a fixed `public/app/` would keep serving an old
window to anyone who had seen it; a new build is a new address instead.

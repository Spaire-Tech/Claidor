# simeonlabs.com

The public website, with the Simeon app-window demo playing in the hero.

- `public/` is the site Vercel serves, as built. Nothing in it links anywhere:
  it is a site to try, every button leads nowhere.
- `source/` is how it is made: `page.html`, `build.py`, the paintings and
  wordmark (`img/`), the agents' faces and the demo's scroll guard.
- `vercel.json` tells Vercel there is no install or build step, to serve
  `public/`, and to skip a deploy when nothing under this folder changed.

## Rebuild

On a Mac, in `desktop/`: `npm run package`, then `node demo/build-demo.mjs`
(writes `dist/demo`). Then:

```
cd sites/simeonlabs.com/source
python3 build.py ../../../desktop/dist/demo
```

The script needs Playwright's Chromium (it captures the stills the hero shows
while the app loads). It rewrites `public/` from scratch; commit what it writes.

## What is in the page

The page is written by hand in `source/page.html`, laid out by the rules of
Apple's product pages (apple.com/apple-creator-studio, /apps, /apple-vision-pro
and /apple-intelligence; the founder, 3 October 2026): one left edge, one
section anatomy repeated, pictures without words on them and captions under
them, light only.

- **Product bar**: the wordmark, four section links, "Try it free".
- **Hero**, centred: the wordmark, "Your AI operations team.", the six agents
  as icons, one paragraph, Try it free.
- **Meet your team**: a gallery of big cards (the whole team, then one card
  per agent with one moment on an iPhone or a Mac drawn in CSS). It plays by
  itself while on screen and stops when you swipe or press pause.
- **The app**: the real app window, edge to edge on the blue painting (`FIT` in
  `build.py` scales it from its box). Phones under 600 px see a still of it.
- **One section per agent**, each the same: face and coloured name, a two-line
  headline, a grey paragraph led by a bold sentence, then a row of three square
  cards (a window of the app it works in) with a caption under each. Rows
  scroll sideways with arrows when they do not fit.
- **Nothing goes out without your yes** (a grey box), two tiles (a computer of
  its own, talk to it), **pricing** (Standard $20, Pro $60, Max $100, 20% less
  yearly, a free week), **Questions? Answers.**, and the closing line.

No counts, tables or logo walls. Nothing links outside the page.

**`public/app/` is the app's window: the upstream 0.18.0 renderer with Simeon's patches (see `desktop/NOTICE.md`).** The
founder chose on 28 September 2026 to publish it with the site, knowing the
repository otherwise keeps that code out of git (`desktop/.gitignore`,
`/src/app/dist/`).

**The app's folder is named after its content** (`app/<first 12 of a SHA-256
over every file>/`, written by `build.py`). The patched files keep the names
Vite gave them before the patch, and `vercel.json` lets browsers keep
`/app/*/*` for a year, so a fixed `public/app/` would keep serving an old
window to anyone who had seen it; a new build is a new address instead.

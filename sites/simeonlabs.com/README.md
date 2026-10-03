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

The page is written by hand in `source/page.html`, drawn the way Apple draws a
product page (the founder, 3 October 2026): one idea per screen, large type,
the product doing the explaining, no counts or tables.

- **Hero.** "Your AI operations team.", one line, Download for Mac, and the
  real app window playing in a box over the blue painting (`FIT` in
  `build.py` scales it from the box's own size). Phones under 600 px get a
  still of the app drawn by the page instead.
- **Meet your team.** A gallery like Apple's: one card per agent with its
  cloud face, one sentence, and one moment on an iPhone or a Mac drawn in CSS.
  Chief of Staff (the Friday note on the lock screen), Inbox (replies written
  overnight), Money (a phone call), Growth (the morning chart), Content (a
  post and its picture), Sales (calls booked on the calendar). It plays by
  itself while on screen, stops when you swipe or press pause, and arrow keys
  move it.
- **How the team works.** Large boxes: a computer of its own, nothing goes
  out without your yes, routines, hand-offs, calls, and the tools it works in.
- **Pricing** (Standard $20, Pro $60, Max $100, 20% less yearly, a free week),
  **five questions**, and the closing banner.

Nothing in it links anywhere outside the page: it is a site to try.

**`public/app/` is the app's window: the upstream 0.18.0 renderer with Simeon's patches (see `desktop/NOTICE.md`).** The
founder chose on 28 September 2026 to publish it with the site, knowing the
repository otherwise keeps that code out of git (`desktop/.gitignore`,
`/src/app/dist/`).

**The app's folder is named after its content** (`app/<first 12 of a SHA-256
over every file>/`, written by `build.py`). The patched files keep the names
Vite gave them before the patch, and `vercel.json` lets browsers keep
`/app/*/*` for a year, so a fixed `public/app/` would keep serving an old
window to anyone who had seen it; a new build is a new address instead.

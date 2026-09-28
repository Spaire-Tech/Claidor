# simeonlabs.com

The public website: the Framer design, exported and made static, with the
Simeon app-window demo playing in the hero.

- `public/` is the site Vercel serves, as built. Nothing in it links anywhere:
  it is a site to try, every button leads nowhere.
- `source/` is how it is made: `build.py`, the Framer export
  (`framer-export.html`), the agents' faces, the Simeon mark and the demo's
  scroll guard.
- `vercel.json` tells Vercel there is no install or build step, to serve
  `public/`, and to skip a deploy when nothing under this folder changed.

## Rebuild

On a Mac, in `desktop/`: `npm run package`, then `node demo/build-demo.mjs`
(writes `dist/demo`). Then:

```
cd sites/simeonlabs.com/source
python3 build.py ../../../desktop/dist/demo
```

The script needs Playwright's Chromium and network access to
framerusercontent.com (it fetches the fonts and pictures once). It rewrites
`public/` from scratch; commit what it writes.

## What is in the page

The hero runs the real patched app window (`public/app/`) in an iframe inside
the hero box, scaled from the box's own size, with `scroll-guard.js` so the
app never scrolls the page and the wheel over it scrolls the page. The app's
code is about 6 MB, so the page first shows a still of its opening screen
(`app-poster-{wide,tall,phone}.jpg`, captured by `build.py` from the app
itself) and fades the live app in over it once the app has drawn its sidebar.
On a laptop (at least 1024 × 620, motion allowed) the hero is a scroll
scene instead: the painting spans the page with Simeon's wordmark, narrows
into the card as you scroll, the card pins under the nav, the wordmark fades
and the app window rises onto the painting; the demo's story starts only
then (`source/demo-gate.js` holds it until the page calls it). Smaller
screens keep the window in the card from the start. Phones (under 600 px) show no live app at all: the hero is a still of
the window drawn by the page (a Simeon thread with both sides talking), so
there is nothing to load and the page scrolls natively over it. Each animation below the hero starts when it scrolls into view and starts
over when you come back to it. The four
feature boxes are drawn by the page itself: connectors behind the Simeon
glass tile, Iris, Otto and Nova talking, Otto's computer asking you to sign
in, Iris asking before she sends an email. Pricing is Standard $20, Pro $60
and Max $100 a month, 20% less yearly, 7-day trial on each.

**`public/app/` is Grok Bot 0.18.0's renderer with Simeon's patches.** The
founder chose on 28 September 2026 to publish it with the site, knowing the
repository otherwise keeps that code out of git (`desktop/.gitignore`,
`/src/app/dist/`).

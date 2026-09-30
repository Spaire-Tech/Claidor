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

The hero runs the real patched app window (`public/app/<digest>/`) in an iframe inside
the hero box, scaled from the box's own size, with `scroll-guard.js` so the
app never scrolls the page. The app in the window takes no pointer, so the
wheel and a finger over it scroll the page on the browser's own scroll
thread; a click on the window is handed to the part of the app under the
pointer, and the cursor shows what is clickable, and the app's frame loop is paused while the
page scrolls or the window is out of sight. The app's
code is about 6 MB, so the page first shows a still of its opening screen
(`app-poster-{wide,tall,phone}.jpg`, captured by `build.py` from the app
itself) and fades the live app in over it once the app has drawn its sidebar.
On a laptop (at least 1024 × 620, and Reduce Motion off) the hero is a scroll
scene instead: the painting spans the page with Simeon's wordmark, narrows
into the card as you scroll, the card pins under the nav, the wordmark fades
and the app window rises onto the painting; the demo's story starts only
then (`source/demo-gate.js` holds it until the page calls it). Smaller
screens keep the window in the card from the start. Phones (under 600 px) show no live app at all: the hero is a still of
the window drawn by the page (a Simeon thread with both sides talking), so
there is nothing to load and the page scrolls natively over it. The site is light only: Framer's dark-scheme colour block is removed at
build time. Each animation below the hero starts when it scrolls into view (and runs
whatever the Reduce Motion setting; only the laptop hero's scroll scene honours it) and starts
over when you come back to it. The four
feature boxes are drawn by the page itself: connectors behind the Simeon
glass tile, Iris, Otto and Nova talking, Otto's computer asking you to sign
in, Iris asking before she sends an email. Pricing is Standard $20, Pro $60
and Max $100 a month, 20% less yearly, 7-day trial on each.

**The felt clouds.** Once the page has loaded and the browser is idle, `clouds.js` puts about six of the
approved 3D felt clouds (three on a phone) in open space around the page: beside the hero's headline and in
the margins and gaps of the sections, never over text, controls, pictures or the app's window. Each load
picks new places, sizes and palettes (the app's 12), and each cloud plays its own mix of the app's states,
looks at the pointer, blinks and hops when clicked. One WebGL renderer draws them all (three.js 0.170.0
from jsDelivr, named by the import map in the head); only clouds on screen are drawn, at most 30 times a
second, and with Reduce Motion each is a still. `build.py` writes `clouds.js` from `source/clouds/`
(see its `pre.js`); `?clouds=debug` exposes `window.__clouds.report()`.

**`public/app/` is the app's window: the upstream 0.18.0 renderer with Simeon's patches (see `desktop/NOTICE.md`).** The
founder chose on 28 September 2026 to publish it with the site, knowing the
repository otherwise keeps that code out of git (`desktop/.gitignore`,
`/src/app/dist/`).

**The app's folder is named after its content** (`app/<first 12 of a SHA-256
over every file>/`, written by `build.py`). The patched files keep the names
Vite gave them before the patch, and `vercel.json` lets browsers keep
`/app/*/*` for a year, so a fixed `public/app/` would keep serving an old
window to anyone who had seen it; a new build is a new address instead.

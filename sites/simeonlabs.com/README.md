# simeonlabs.com

The public website, with the Simeon app-window demo playing in the hero.

- `public/` is the site Vercel serves, as built. It is a site to try: the
  only links out are Sign in and the three "Try it free" buttons, which open
  the billing page on `app.simeonlabs.com`; every other button leads nowhere.
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

The page is written by hand in `source/page.html`, light only, on one left
edge shared by the wordmark, the headline and the demo.

- **Bar**: the wordmark (SimeonLabs, `img/wordmark-labs.png`; the footer keeps `img/wordmark.png`), Sign in, Download.
- **Hero**: "Create a team of agents for any part of your business." in the
  serif, then Download for Mac and Request a demo.
- **The app**: the real app window, playing a founder's morning.
- **Statement**: one centred sentence, the key words in black.
- **Gallery**: six cards, light grey and dusk blue in turn, moved with back
  and next: connect your apps, message an agent, a computer of its own, agents
  working together, call an agent, stay in control.
- **Security and integrations**: a serif title beside a paragraph, then two
  pale panels of icon rows. A blue dot marks what is still in progress.
- **Pricing** (Standard $20, Pro $60, Max $200, 20% less yearly, a free week with a card on file; each "Try it free" opens `app.simeonlabs.com/billing` on that plan),
  **Questions and answers**, and the closing line.

Nothing else links outside the page.

**`public/app/` is the app's window: the upstream 0.18.0 renderer with Simeon's patches (see `desktop/NOTICE.md`).** The
founder chose on 28 September 2026 to publish it with the site, knowing the
repository otherwise keeps that code out of git (`desktop/.gitignore`,
`/src/app/dist/`).

**The app's folder is named after its content** (`app/<first 12 of a SHA-256
over every file>/`, written by `build.py`). The patched files keep the names
Vite gave them before the patch, and `vercel.json` lets browsers keep
`/app/*/*` for a year, so a fixed `public/app/` would keep serving an old
window to anyone who had seen it; a new build is a new address instead.

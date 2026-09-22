# The cloud overlay on the 0.18.0 marks, measured (22 September 2026)

The founder packaged `main` at `62c6852b` (PR #160) twice and saw Grok's
faces both times: "i see no changes". The 19 designed cloud bodies and the
animated eyes are painted by `desktop/source/electron-preload/cloud-blob-overlay.ts`
over `.sand-grok-bot-mark` in the checksum-pinned 0.18.0 renderer. Four
causes were proposed, in order: a stale Caisra still running; the overlay
never reaching the packaged preload; the overlay mounting but not hiding
the real painted face; Grok's own blob looking close enough to pass for
ours. This is what could be measured from a Linux container, what could
not, and what changed because of it.

## What was measured

**The packaged preload carries the overlay (cause B is not it).** The
package builds `dist/electron-preload/preload.cjs` from
`source/electron-preload/runtime/primary.ts` with the esbuild options in
`scripts/lib/clean-build.mjs` (`bundlePreloadSource`), stages it through
`executableReplacements` into the fidelity ASAR, and the packaged main
window loads exactly that file: `resolveSandMainWindowPreload` returns
`preload.cjs` whenever `app.isPackaged`
(`source/electron-main/dev/dev-capability.ts`), and `main.ts:307` passes it
as `webPreferences.preload`. The same bundle, built here with the same
options, at `62c6852b`:

| Measure | Value |
|---|---|
| bytes | 923,096 |
| `installCloudBlobOverlay` | 3 occurrences |
| `data:image/png;base64,` | 19 (one per body) |
| `.sand-grok-bot-mark` | present, with the hide rule |

So if the founder opened a fresh package, the overlay code was in the
window. Whether it painted is the next question.

**The shipped renderer could not be read from here.** `src/app/dist` is
gitignored and hydrated by `npm run bootstrap` from the 0.18.0 DMG. The DMG
URL in `scripts/lib/config.mjs` answers `403 AccessDenied` from S3 to a
ranged GET (not the proxy: the body is S3's own XML). No copy of
`index-UbX-y3il.js`, no `app.asar`, no DMG exists anywhere on this disk,
and `research-archives/` (the LFS-tracked archive the bootstrap prefers) is
not in the tree. **The DOM the 0.18.0 renderer builds for a mark is
therefore still unmeasured** — the `--fg` / `data-grok-state` claim in
PR #160 is inherited, not re-checked, and "`$_t`" is a name nobody here
has looked up. The recovered source
(`desktop/frontend/src/recovered/features/conversation/workspace/agent-avatar.tsx`,
evidence at byte offset 2755564) says a `<span class="sand-agent-avatar
sand-grok-bot-mark">` wrapping an `<svg data-grok-state …>`, and its CSS
colours the span with `var(--fg)`; that is a reconstruction, not the bytes.

**What the merged overlay could not have hidden, if the DOM was any of
these.** The hide rule at `62c6852b` was
`.sand-grok-bot-mark > :not([data-caisra-cloud-blob]) { visibility: hidden }`:
a direct-child rule. It leaves a face untouched when the face is a
grandchild (a wrapper `<div>` then the `<svg>`), when the mark is itself the
`<svg>` (the overlay is then appended *inside* the svg, where
`position:absolute` means nothing), or when the mark has a shadow root
(a light-DOM child of a shadow host is not rendered at all). The
stylesheet was appended with `(doc.head ?? doc.documentElement).append`
at preload time, when neither may exist yet, and a throw there is a
thrown preload. None of these is proven to be the case. All of them are
now covered, so the answer no longer depends on which it is.

## What changed

`desktop/source/electron-preload/cloud-blob-overlay.ts`:

- The hide rule reaches every descendant of a mark that is not ours, at any
  depth: `.sand-grok-bot-mark :not([ours]):not([ours] *)`, plus the mark's
  own background, mask and `::before`/`::after`. Our overlay and its
  children are forced visible.
- A mark that is itself an `<svg>` (or any bare face svg) is tagged
  `data-caisra-cloud-host="1"`, hidden by attribute, and the overlay sits
  beside it, absolutely positioned over its parent.
- A mark with an open shadow root gets the stylesheet and the overlay
  inside the shadow tree. A closed one is unreachable and shows up in the
  diagnostic line as an empty mark.
- Colour: inline `--fg`, then computed `--fg`, then computed `color`.
  `cloudBlobColorFromGrokMark` now reads `rgb()`/`rgba()` and `#rgb`, and
  maps a theme shade to the nearest of Grok's 11 inks within an RGB
  distance of 96. The 19 bodies and the eye geometry are untouched.
- Overlay geometry is written through CSSOM (`style.setProperty`), which
  a `style-src` policy without `'unsafe-inline'` cannot refuse; the
  reconstructed `index.html` allows inline styles and `data:` images, but
  that file is also a reconstruction.
- Install never throws into the preload (`installCloudBlobOverlaySafely`),
  defers the stylesheet until `<html>` exists, and resolves
  `MutationObserver` from the document's window.
- **One console line, so the next answer is read and not guessed.** On the
  first paint, and whenever the painted count changes, the renderer console
  gets
  `[CaisraCloudOverlay] marks=N hosts=N painted=N readyState=… first=<the first mark's own markup, our overlay removed>`.
  If nothing was painted four seconds after the document loaded, the line
  says instead how many `svg`, `canvas`, `[data-grok-state]` and
  `[class*='avatar']` elements the page has. That line is the measurement
  this document is missing.

Tests: `desktop/tests/cloud-blob-overlay.test.mjs` (grandchild face, svg
host, open shadow root, computed colour, install before `<head>`, the
diagnostic line) and `desktop/tests/cloud-blob-bodies.test.mjs` (the ink
parser). `tsc` on `source/` and `frontend/`, and `node --test tests/*.test.mjs`:
107 tests, 105 passed, 2 skipped (the pre-existing clean-source renderer
skips), 0 failed.

## What is still not established

That the founder sees clouds. This container has no Mac and no 0.18.0
bytes. The check is on the Mac, and quitting first is not optional:
`open dist/Caisra.app` focuses a Caisra that is already running and shows
the old package.

```
osascript -e 'quit app "Caisra"' -e 'quit app "Grok Bot"'
cd desktop
git pull
npm ci && npm run bootstrap && npm run check && npm run package && npm run verify
open dist/Caisra.app
```

If the faces are still Grok's: View → Toggle Developer Tools, Console,
filter `CaisraCloudOverlay`, and send that line. It names the real mark.
If the line is absent altogether, the preload did not run the overlay, and
that is a different fault from every one listed above.

# The Antford Excel panel — the founder's design

Unpacked from `Antford_Excel_Panel.html` (15 August), the founder's
redesign of the Office panel. **This directory is the source of truth
for `clients/apps/panel`**; where the build and these files disagree,
these files are right.

- `panel.html` — the template, extracted from the bundle's `<x-dc>`
  body. The left half is a mock Excel drawn for context; **the panel
  itself is the right-hand 372px column** (`isOut` / `isAuth` /
  `isChecking` / `isIn` states).
- `component.js` — the demo's data and logic: the problems list, the
  ring animation, the deliberate-note flow, the derivations
  (`failLabel`, `passLabel`, `fineLine`, `footNote`).
- `assets/` — the design's font binaries (Instrument Sans 400/500,
  Bodoni Moda 400 in three subsets).

What the design decides, read off the file:

- The panel's buttons are **black** (`#1d1d1f`), not the workspace's
  blue. Blue is for links and cell references.
- The mark is a Bodoni **« A »**, not the full wordmark.
- Findings say **« N findings »** with a grey « M checks pass · time »
  beside it; each row is a cell reference (Excel's own face, blue,
  jump-on-tap) with the standard beneath and the sentence beside.
- Dismissal is deliberate: « That's fine » → « Why is this
  deliberate? » → « Mark deliberate », disabled until a note exists.
- Inherited findings live in a collapsed **« N older findings »**
  drawer — « carried over from before this file was watched ».
- Stale is one amber line and a black « Recheck ».
- The consent face lists three scopes in words, with why beneath each,
  and « Antford never writes to your cells ».

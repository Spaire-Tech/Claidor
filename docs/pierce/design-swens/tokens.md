# The Swens design, extracted

Source of truth: `Swens_Workspace.html` in this directory — the
founder's export, checked in untouched (`source.txt` is its component
source, extracted for reading). Every value below appears verbatim in
that file; if a value here disagrees with the file, the file is right.

## Type

- **UI**: `'Instrument Sans', -apple-system, system-ui, sans-serif` —
  the root wrapper's own stack. Base 14.5px / 1.5, colour `#242424`.
- **Brand**: `'Bodoni Moda', Didot, Georgia, serif` — the wordmark
  (23px / 400 / `.005em`) and the chat's serif **S** mark.
- **Reading serif**: `Newsreader, Georgia, serif` — the chat greeting
  and the answer lead (17.5px / 1.55).
- **Mono**: `'JetBrains Mono', ui-monospace, monospace` — the ⌘K
  chip, cell references, meta chips. (The Ances build used IBM Plex
  Mono; the Swens export does not.)
- `'Hanken Grotesk', system-ui, sans-serif` appears only inside the
  spreadsheet-evidence fragment (the Excel-look tooltip); it is not a
  product face.

The font binaries are extracted from the export's own resource map
into `clients/apps/web/public/workspace/`:
`jetbrains-mono-var.woff2`, `newsreader-var.woff2` (each one variable
file serving 400–500 — the export serves the same file for both
weights). `instrument-sans-var.woff2` and `bodoni-moda-400.woff2`
were already hosted from the Ances round and the export uses the same
faces.

## The shell

- Ground: `radial-gradient(120% 100% at 20% -10%, #ffffff 0%,
  #f4f5f7 42%, #e9ebef 72%, #e2e4e9 100%)`.
- Pane seam `#eae7e2`, main pane white, `min-width:420px`.
- Header: 54px, hairline `1px solid #f0eeec`, `padding:0 10px`,
  `gap:10px`. Wordmark **Swens** in the brand face,
  `margin:0 6px 0 10px`. Back button (inside a project):
  `rgba(255,255,255,.75)` fill, `1px solid rgba(255,255,255,.7)`,
  `0 1px 2px rgba(18,24,40,.08)`, radius 11, `8px 14px 8px 11px`,
  500, `#0060d0`, chevron 9×15 stroke 2 — label **Project**.
- Header right (inside a project): `Ask` and `Export report` as grey
  buttons (`#f0f0f2`, radius 11, `9px 15px`, 13.5/500, hover
  `#e7e7ea`), then the blue primary.
- Dock bar: `padding:9px 20px 11px`, `rgba(255,255,255,.92)`,
  `border-top:1px solid #f0eeec`, `blur(20px) saturate(1.4)`.
- Dock pills, in order **Ask · Project · Settings**: radius 22,
  `padding:11px 26px`, 14.5px, `-.01em`; active
  `rgba(21,23,27,.055)` / `#0060d0` / 500; inactive `transparent` /
  `#5b6068` / 400; hover `rgba(21,23,27,.03)`; no shadow.
- Divider `1px × 22px rgba(21,23,27,.12)`, `margin:0 8px`. Account
  chip: 26px circle `linear-gradient(150deg,#d8e6ff,#b9cdf5)`,
  `inset 0 0 0 .5px rgba(0,0,0,.06)`, 11px/500 `#2c4a80`.
- Account popover: bottom-up `calc(100% + 12px)`, 272px,
  `rgba(255,255,255,.88)` + `blur(30px) saturate(1.8)`, radius 15,
  `0 18px 44px rgba(0,0,0,.22), 0 0 0 .5px rgba(0,0,0,.08)`; 38px
  avatar, name 15.5/500/`-.015em`, email 13 `#86868b`; items
  Notifications · Settings · Sign out (`#ff3b30`), 14.5, radius 9,
  `9px 11px`, over a `.5px rgba(0,0,0,.09)` rule, `padding:6px`.

## Ink

Unchanged from the Ances shared block except where noted: base
`#242424`, primary `#1d1d1f`, secondary `#86868b`, dock `#5b6068`,
accent `#0060d0`, headings `#1c1f23`/`#15171b`, body-secondary
`#4a4f57`, tertiary `#6b7280`, muted `#8f96a0`/`#9aa1ab`, faintest
`#a2a29c`. Severity: Material `#e0322d`, Significant `#e8a300`,
Observation `#2b6cf5`.

## Later-phase anchors (extracted as their phases arrive)

The project page, Findings rows, Sources map, Settings cards, and the
Ask screen each get their block here when their phase starts, lifted
from `source.txt` the same way — this file grows with the build, it
does not guess ahead.

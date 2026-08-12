# The design, as given

`markup.html`, `component.js` and `stylesheet.css` are the founder's
`Pierce_Workspace.html` — the complete workspace, 12 August — with nothing
removed but the embedded font binaries and the bundler's own wrapper. They
are checked in so that « the design says » is a claim anyone can check
rather than something I remember.

The build is measured against these files. If a value in the web app
disagrees with a value here, the file here is right.

## The canvas

```
data-props: {"$preview":{"width":1440,"height":900}}
```

**1440 × 900.** Every screen was drawn at this size and it is the size to
verify at.

## The one prop

`notConnected` (boolean, default `false`). True gives the first-run state:
the Deals empty screen and the first-run face of Check a file. Everything
else is internal state driven by clicks.

## What the file contains

The whole workspace, one component:

- **Deals** — the list, the empty state, the deal page (sources,
  documents, decision log), the document panel, findings with evidence
- **New deal** — browse SharePoint, confirm (client + which model),
  setup running
- **Check a file** — on its own (`RUN_SOLO`) or against a deal
  (`RUN_SOURCED`), recents, first-run state
- **Settings** — Connections (none/wait/done), House rules (rounding,
  writing, checks with per-rule audit switches, checks-coming-soon),
  People + invite
- **Chat** — per-finding (opens with the chain), per-deal, per-file, with
  scope boundary copy
- **Account** — the popover, notifications/settings/sign out

## Type

- **Switzer** 400/500/600 — the UI face throughout
- **IBM Plex Mono** — the model grid and figures where drawn that way
- Base: `14.5px`, line-height 1.5, `color:#242424`

## The frame

Radial-gradient ground (`#fff → #e2e4e9`), floating translucent cards:
`rgba(255,255,255,.92)`, `backdrop-filter: blur(20px) saturate(1.4)`,
`border-radius:20px`, hairline `#f0eeec` separators inside. Content area
sits on `#f5f5f7`.

## Writing boxes — the standing rule

Every input and textarea in this design is:

```
border:0; outline:none; background:#f0f0f2 (or transparent)
```

Focus, where it exists at all, is a soft glow —
`box-shadow: 0 0 0 3.5px rgba(0,96,208,.25)` — never a border, never an
outline, never an underline. **Do not add focus rectangles or underlines
to inputs anywhere in the build.**

## Colour

- Accent / links / primary buttons: `#0060d0`
- Stale / out of date: `#c8790a` (text), `#ff9f0a` (dots, highlight)
- Clean: `#34c759`
- Ink: `#1d1d1f` primary, `#5b6068` secondary, `#86868b` tertiary

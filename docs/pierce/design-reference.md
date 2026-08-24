# The Ambre design reference

The standing reference for building Ambre's surfaces. The founder
owns the design language; this file records it so the engine side
can build screens in it without inventing a second style. Section 1
is extracted from the founder's own build
(`Ances_Workspace_1.html`); section 2 is the arrangement; section 3
is where the founder's design information goes as it arrives.

**Standing arrangement (23 Aug 2026).** The founder supplies the
design information; I build the surfaces from it, in their style,
and use this file as the reference. Their build is a *rough draft of
how it should look* — its data is placeholder, so mock numbers that
do not reconcile are not defects and are not to be reported as such.
What counts is structure, voice, and the states that are missing.

---

## 1. The style, as extracted from the build

**Type.** One family, system sans. The scale in use, by frequency:
14.5px (the workhorse — body rows, buttons, nav), 14px, 13px
(secondary), 12.5px (meta), 15px, 13.5px, 11.5px (labels, often with
letter-spacing), 16.5–17.5px (section titles), 23px (page titles).
Weights: 400 and 500 do almost all the work; 600 is rare, and
reserved. Serif appears only for the wordmark and the chat's opening
question.

**Letter-spacing.** Tightened everywhere: `-.012em` and `-.01em` are
the defaults, `-.022em` on the largest text. Nothing tracks positive.

**Colour.**
- Ink: `#1d1d1f` primary, `#1c1f23` / `#15171b` for headings,
  `#4a4f57` body-secondary, `#5f6368` / `#6b7280` tertiary,
  `#8f96a0` / `#9aa1ab` / `#86868b` muted, `#a2a29c` faintest.
- Action: `#0060d0` (the single blue — selection, links, active nav).
- Severity: Material `#e0322d`, Significant `#e8a300`,
  Observation `#2b6cf5`. **One palette; do not use the text-colour
  variants (`#c9302c` / blue / purple) that appear in the older
  review page — the dot palette wins.**
- Rules and edges: `#f0eff1` (row rules), `#eceaec`, `#e0e0e0`,
  `#d0d0d0`; wash `#fbfbfc`, `#f6f7f9`.
- State: green `#1f8a4c` / `#137a43`, amber text `#c8790a`.

**Shape.** Radii: `999px` for chips and pills (the dominant shape),
9–11px for cards and rows, 18–24px for large panels and the
composer, 3px for micro-marks.

**Depth.** Barely any. Shadows are two-stop and faint:
`0 1px 2px rgba(16,22,35,.05), 0 6px 18px rgba(16,22,35,.05)`, used
to lift a *selected* chip off the wash rather than to decorate.
Selection is usually white-on-wash plus a hairline, not a border.

**Rhythm.** Lists are hairline-ruled (`.5px solid #f0eff1`) with the
first row's rule suppressed — the `rule: i === 0 ? '0' : …` pattern
throughout. Content columns cap around 1040px.

**Voice.** Sentences, not labels. Plain words, specific facts, no
jargon, no exclamation. « Saved 40 minutes ago, so Friday's verdict
no longer stands. » Severity vocabulary is exactly three words:
**Material · Significant · Observation** — never High/Medium/Low,
never errors/warnings.

**Finding rows.** The preferred design is the newer one
(`fdGroups`): one plain-English sentence carrying the specific fact,
the sheet at the right, the severity word — and on open, a `was →
should` pair, a « why » sentence, and one named action ("Apply the
fix", "Restore the formula", "Point at Inputs"). The older row
shape's *evidence display* is worth keeping: the small spreadsheet
grid with the offending cell highlighted and a hover tooltip.

## 2. What the engine side builds, and how

- The founder sends design information; I build the surface from it
  and hold to section 1 without asking each time.
- Two standing constraints, applied without being asked: nothing
  crosses the independence line (no surface that authors), and
  anything the engine cannot yet do is visibly a placeholder rather
  than mocked to look live.
- Placeholder data is placeholder. Report structure, missing states,
  contradictions in *design*; never mock arithmetic.

## 3. What has been built in this language

`workspace-build.md` is the record: the founder's export, rebuilt so
that every number on screen comes from a run that happened. New
surfaces added in this language, and the tokens they reuse:

- **Documents, Versions, the comparison result, the refusal screen** —
  all built on the same frame: a 23px/600 title with a coloured note
  beside it, a 14px/#86868b sentence under it, then gradient section
  headings over hairline-ruled rows. `screens.py` holds them.
- **Empty states** — a `.5px #f0eff1` box on `#fbfbfc`, a 14.5px
  headline, a 13px/#8f96a0 reason, and where there is one, a single
  blue link. Never a spinner, never a fake row.
- **Modals** — `position:fixed; inset:0; z-index:70` with
  `rgba(16,20,28,.3)` and a 3px backdrop blur, a 24px-radius white
  panel. One lesson: a modal must hang off the root. Put inside the
  dock, which carries a backdrop-filter, `position:fixed` stops
  meaning the viewport and the sheet gets pinned to the bottom bar.
- **The chat's answer** — the serif « A » mark, an 18px gap, one
  column: the answer at 16px/1.7, then findings, evidence chain or
  rows, then « Show the work », then follow-up chips.

Two rules the build follows without being asked, both from §2:
nothing crosses the independence line, and anything the engine cannot
do yet is visibly a placeholder rather than mocked to look live. That
second rule is why four buttons open a sheet saying what they would
have done, rather than doing nothing.

## 4. Design information from the founder

*(to be filled as it arrives — screens, states, copy, layouts)*

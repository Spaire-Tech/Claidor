# Parallel track — the Word add-in foundation

Two sessions working at once. This document exists so they never touch the
same file.

Build order and reasoning: `docs/direction-2026-08.md`.
Registry plan: `docs/registry/plan.md`.

---

## Why this is not a violation of "one product at a time"

The rule is that each product is finished before the next begins. Track B
does **not** build product #2 (the Word Check). It builds the *scaffold and
the test rig* that product #2 will be judged against — the things that must
already exist before "finished" can be measured.

Specifically, product #2's gate is:

> runs clean on Windows M365, Mac and Word on the web … damages no
> formatting in a corpus of test documents kept as a regression suite

That corpus and that harness are not the product. They are the instrument
that decides whether the product is done. Building the instrument first is
the same discipline as writing the eval before the model.

Nothing in Track B implements clause checking, findings, or the registry.

---

## Ownership boundary

| Path | Owner |
|---|---|
| `server/polar/registry/**` | **Track A** (registry) |
| `server/migrations/**` | **Track A** |
| `server/polar/models/**` | **Track A** |
| `server/tests/registry/**` | **Track A** |
| `docs/registry/**` | **Track A** |
| `clients/apps/word-addin/**` | **Track B** |
| `dev/ooxml/**` | **Track B** |
| `docs/word-addin/**` | **Track B** |

**Shared files neither track may edit without saying so first:**
`server/pyproject.toml`, `server/polar/models/__init__.py`,
`clients/package.json`, any lockfile, `docs/direction-2026-08.md`.

Track B adds its own `package.json` inside `clients/apps/word-addin/` and
does not touch the workspace root manifest until its gate is met.

**Branches.** Track B works on `word-addin` and merges when its gate
passes. Track A works on `main`. That makes collision impossible rather
than merely unlikely.

---

## Track B brief

### 1. The add-in scaffold

An Office task-pane add-in for Word. TypeScript, Office.js, its own build.
Loaded from the same domain as the web app.

- Manifest that sideloads on Windows, Mac and Word on the web
- Task pane shell with the empty states and nothing invented in them
- Auth against the existing session (the add-in is just another API client)

### 2. Capability detection, honestly

Requirement sets vary by platform. Verified against Microsoft's current
matrix (2026-08-09):

- `WordApi 1.4` — change tracking — supported on web, Windows M365 2208+,
  volume-licensed Office 2024, Mac, iPad
- `WordApiDesktop 1.1–1.5` — desktop only, **unavailable on
  volume-licensed perpetual Office**, which plenty of law firms run

Every advanced call sits behind
`Office.context.requirements.isSetSupported()` with a working fallback,
and the add-in reports what it can and cannot do on the host it finds
itself in. A feature that silently degrades is the same failure as a
dashboard that silently shows invented data.

### 3. Tracked changes, proven

```js
context.document.changeTrackingMode = Word.ChangeTrackingMode.trackAll
```

Then an edit made by the add-in lands as a Word revision the lawyer
accepts or rejects. Prove it end to end: insert, verify it appears as a
revision, verify `getReviewedText()` returns both versions.

### 4. The formatting regression harness — the real deliverable

This is what product #2 is measured against.

- **Corpus:** at least 50 real commercial contracts. SEC EDGAR EX-10
  exhibits are public domain and available in bulk; convert to `.docx`.
  Favour documents with numbered clauses, cross-references, defined-term
  tables, footnotes and multi-level lists — the things that break.
- **Test:** round-trip each document through a representative edit.
- **Assertion:** the OOXML outside the edited range is byte-identical.
  Numbering, styles, cross-references, section breaks and revision marks
  all survive.
- **Runs in CI.** A regression fails the build.

The OOXML diffing runs headless without Word and belongs in CI. The Office
integration itself does not — it needs a human with Word installed on
Windows and on Mac. **That is a real dependency to confirm early.**

### Track B gate

1. Manifest sideloads and the task pane opens on Windows, Mac and web
2. Capability detection reports correctly on each, with fallbacks working
3. A tracked change inserted via the API appears as a Word revision
4. ≥50 real contracts round-trip with zero OOXML diff outside the edit
5. The harness runs in CI and fails on regression

No clause checking. No findings. No registry.

---

## The API contract

So neither track blocks the other. Track B builds against a mock of this;
Track A implements it. When they meet, the wiring is a base URL.

`POST /v1/registry/check`

```json
{
  "jurisdiction": "US-TX",
  "clauses": [
    { "id": "c1", "text": "…", "formatting": { "allCaps": false, "bold": false } }
  ]
}
```

`200`

```json
{
  "findings": [
    {
      "clause_id": "c1",
      "kind": "rule",
      "doctrine": "tx-express-negligence",
      "headline": "This indemnity may not cover the indemnitee's own negligence.",
      "explanation": "…",
      "authority": [
        { "case": "…", "court": "…", "year": 1987, "url": "…", "quote": "…" }
      ],
      "suggestion": { "replacement": "…" }
    }
  ],
  "checked": ["tx-express-negligence"],
  "no_precedent_found": ["c1-lol"]
}
```

Two rules Track B must honour in the UI:

- **`kind` is either `rule` or `similarity`, and they never look the
  same.** A rule hit is assertive — the doctrine says so. A similarity hit
  is suggestive — wording resembles a clause a court read down, shown
  beside the precedent. Blurring them is the single worst thing the
  interface could do.
- **`no_precedent_found` is displayed, not swallowed.** Silence must read
  as "no court has ruled on this", never as "safe".

`formatting` is present because several target doctrines turn on
conspicuousness, and Office.js exposes font weight, colour, size and case
on the live range. Checking conspicuousness in the document is something a
server-side tool reading a PDF cannot do nearly as well — it is an
advantage of living inside Word, and Track B is what makes it available.

---

## What is explicitly not parallel

- **Clause detection and segmentation.** It needs the doctrine definitions
  the registry produces, and it is Python that would sit beside Track A.
- **The workspace, drafting, Outlook, Excel, PowerPoint.** Products #3–#5.
  Starting them now would be the violation the top of this document is at
  pains to avoid.

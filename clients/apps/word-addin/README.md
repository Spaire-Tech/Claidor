# Claidor for Word

A Microsoft Word task-pane add-in: contract review, playbooks, drafting and
document checks, applied back into the open document as native tracked
changes, comments and content controls.

**This is a fork of [`Vaquill-AI/ms-word-addin`](https://github.com/Vaquill-AI/ms-word-addin)**
(Apache License 2.0), taken on 9 August 2026. `LICENSE` and `NOTICE` carry
upstream's copyright; `FORK.md` is the statement of changes Apache 2.0 §4(b)
requires, and it is also the honest account of what is ours and what is not.
Most of this tree is upstream's.

## Why fork

Upstream had already built the thing that takes months and cannot be
shortened: about 40,000 lines of Office.js integration across 30 feature
areas — tracked-change application, comments anchored to text, content
controls, custom XML parts that survive a document being emailed out and
back, bookmark-based navigation, a document-change watcher, `.docx` export.
None of that is interesting to rebuild and all of it is slow to get right.

What is ours is the engine underneath the checks. Upstream's defined-term
check is 188 lines of client-side regex covering three defects; ours is ten
mechanical checks plus two model-based ones, measured on 30 real SEC filings
and tuned from 43.6 findings per agreement down to 20.3, with severities,
certainties and character offsets. Wiring that in is the point of the fork.

## Two builds

| | Hosted | Community (bring-your-own-key) |
|---|---|---|
| Backend | The Claidor API | None |
| AI | Managed | Your own key: OpenAI, Anthropic, Gemini, Groq, Azure OpenAI, local Ollama |
| Account | Yes | No |
| Manifest | `manifest.xml` | `manifest.community.xml` (hosted) / `manifest.localhost.xml` (your machine) |

The community build is upstream's, and it is kept working. It is also the
only build that runs with no sign-in, which makes it the fastest way to get
the pane in front of a real Word.

## Running it

```bash
pnpm install                # from clients/, this is a workspace package
pnpm dev                    # https://localhost:3000
pnpm dev:community          # the same, with no backend
pnpm test                   # vitest
pnpm type-check
pnpm build                  # or build:community
```

`VITE_API_BASE` points the pane at a Claidor API and defaults to
`http://localhost:8000`. `VITE_APP_BASE` is the web app it deep-links to.
Neither has a production default: see `FORK.md`.

## Sideloading

The manifests ship with `YOUR-DOMAIN.example.com` placeholders. For a local
run use `manifest.localhost.xml`, which needs no editing.

- **Windows** — share a folder, add it in *File → Options → Trust Center →
  Trusted Add-in Catalogs*, then *Insert → My Add-ins → Shared Folder*.
- **Mac** — drop the manifest in
  `~/Library/Containers/com.microsoft.Word/Data/Documents/wef`.

`pnpm validate:manifest` calls a Microsoft web service, so it fails behind a
proxy that blocks it. The manifests are checked locally instead: well-formed,
valid GUIDs, every `resid` declared, every icon present.

## What has not been verified

**None of this has been run in Word.** Office.js only exists inside an Office
host, and there is no way to fake one honestly. So:

| | |
|---|---|
| TypeScript across every file | **Checked.** `pnpm type-check` |
| Both production bundles | **Build.** |
| The manifests | **Well-formed, valid GUIDs, every `resid` declared.** Not validated against Microsoft's schema, not loaded by Word |
| `src/claidor/locate.ts` — offsets to Word searches | **Tested.** 25 unit tests |
| Everything under `src/office/` | **Not verified.** Upstream's, and presumably exercised there, but never here |

## The part most likely to be wrong

Mapping a finding back onto the document.

The server checks a *string* and returns character offsets into it. Word has
no notion of an offset into the whole document — it searches, and hands back
every match. So a finding is re-located by searching for its literal and
taking the *n*th hit, where *n* is the occurrence index the server counted.

That holds only if both sides are looking at the same string. Anything that
trims, normalises or re-encodes it in between breaks every jump in the panel,
and nothing throws: the reader clicks *Go to*, Word selects a different
occurrence of the same words, and the check looks like noise.

`src/claidor/locate.ts` is pure so this can be tested at all, and its tests
exist mostly for that one bridge. Two known gaps, both reported rather than
hidden:

- A literal crossing a paragraph break cannot be searched as written. It is
  collapsed to single spaces, which usually recovers it because the break came
  from line wrapping rather than a real paragraph. The plan says
  `approximate` when it has done this.
- Word refuses a search string over 255 characters. Those findings return
  `null` and the panel says it cannot take you there.

## Two rules the code keeps

**Bearer tokens, never cookies.** An add-in runs in an iframe on its own
origin, so a `SameSite=Lax` session cookie is not sent, and Safari and Edge
block third-party cookies outright. See `docs/vesence-clone/decisions.md`.

**No edit without change tracking.** An untracked edit to a client's
agreement would not be noticed until somebody compared versions.

Only a **wrong case** gets a Fix button. Everything else — a term nobody
defined, a definition nobody uses, two definitions of one term — needs a
drafting decision, and a button that guesses at one is the worst thing this
add-in could do.

## Requirement sets

The manifests require **WordApi 1.6** — change tracking, tracked-change
enumeration and accept/reject, comments and custom XML parts, all GA. This is
upstream's floor and it is a hard one: an older Word will not load the add-in
at all rather than load it degraded.

## Layout

```
src/
  claidor/     ours — the offset-to-Word-search bridge, and its tests
  api/         upstream — HTTP client, typed endpoints
  auth/        upstream — PKCE sign-in through the Office dialog
  community/   upstream — the no-backend build: providers, local router, storage
  features/    upstream — 30 feature areas, one directory each
  office/      upstream — every Office.js call in the add-in
  ui/          upstream — primitives, tokens, icons
```

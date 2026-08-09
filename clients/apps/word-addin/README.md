# Word add-in

The Check panel, inside Word. It reads the open document, sends the text
to `POST /v1/redline/check`, and shows the findings in Vesence's four
buckets — Critical, Warning, To review, Ignored.

## What is verified, and what is not

**This has not been run in Word.** There is no copy of Word in this
environment, and there is no way to fake one honestly: Office.js only
exists inside an Office host. So the status is:

| | |
|---|---|
| Pure logic — offsets to Word searches, grouping, labels, which findings offer a fix | **Tested.** 19 unit tests, `pnpm test` |
| TypeScript across every file | **Checked.** `pnpm typecheck` |
| Production bundle | **Builds.** `pnpm build` |
| The manifest | **Well-formed XML.** Not validated against Microsoft's schema, and not loaded by Word |
| Reading the document, selecting a finding, applying a tracked change | **Not verified.** Every one of these is an Office.js call that has never executed |

The first thing to do with a real Word is sideload this and work through
`Verifying in Word` below. Until then, treat the Office.js paths as
written but unproven.

## The part most likely to be wrong

Mapping a finding back onto the document.

The server checks a *string* and returns character offsets into it. Word
has no notion of an offset into the whole document — it searches, and
hands back every match. So a finding is re-located by searching for its
literal and taking the *n*th hit, where *n* is the occurrence index the
server counted.

That holds only if both sides are looking at the same string.
`documentText()` builds it from `body.paragraphs` in order, joined by a
single `\n`, and the server's offsets index exactly that. Anything that
trims, normalises or re-encodes it in between breaks every jump in the
panel, and nothing throws — the reader clicks *Go to*, Word selects a
different occurrence of the same words, and the check looks like noise.

`locate.ts` is pure so this can be tested at all, and
`locate.test.ts` exists mostly for that one bridge.

Known gaps in it:

- A literal that crosses a paragraph break cannot be searched as written.
  It is collapsed to single spaces, which usually recovers it because the
  break came from line wrapping rather than a real paragraph. The plan
  reports `approximate` when it has done this.
- Word refuses a search string over 255 characters. Those findings return
  `null` and the panel says it cannot take you there, which is better than
  raising inside `Word.run` where the error is far from the cause.

## Two rules the code keeps

**Bearer tokens, never cookies.** An add-in runs in an iframe on its own
origin, so a `SameSite=Lax` session cookie is not sent, and Safari and
Edge block third-party cookies outright. The token lives in
`Office.context.roamingSettings`. When Entra SSO replaces the dialog
sign-in only `token()` changes — see `docs/vesence-clone/decisions.md`.

**No edit without change tracking.** `applyFix` sets
`changeTrackingMode = trackAll`, syncs, reads it back, and refuses to
write if it did not take. A lawyer accepting fixes one at a time is the
whole interaction; an untracked edit to a client's agreement would not be
noticed until somebody compared versions.

Only a **wrong case** gets a Fix button. Everything else — a term nobody
defined, a definition nobody uses, two definitions of one term — needs a
drafting decision, and a button that guesses at one is the worst thing
this add-in could do.

## Requirement sets

The manifest requires **WordApi 1.3** — ranges, search, paragraphs.

Tracked changes need **1.4**, which is *not* required in the manifest on
purpose: requiring it would stop the add-in loading at all on an older
host. Instead `capabilities.ts` probes at runtime, and a firm on an old
build gets the checks with a line in the panel saying fixes cannot be
applied there. Vesence's own answer is a system requirement — "very old
perpetual 2016 or 2019 builds may not support the add-in" — which is
reasonable, and is still not a reason to skip the probe.

## Running it

```bash
pnpm install
pnpm dev        # http://localhost:3100
pnpm test       # 19 unit tests
pnpm typecheck
pnpm build
```

`VITE_API_BASE` points the panel at an API; it defaults to
`https://api.claidor.com`.

## Verifying in Word

Nothing below has been done. It is the checklist for the first person with
a real Word, in the order that finds problems earliest.

1. **Serve over HTTPS.** Word on the web refuses an HTTP task pane.
   `vite --https` with a locally-trusted certificate, or sideload on the
   desktop, which accepts `http://localhost`.
2. **Sideload.** Windows: share a folder, add it as a trusted catalog in
   *File → Options → Trust Center → Trusted Add-in Catalogs*, then
   *Insert → My Add-ins → Shared Folder*. Mac: drop `manifest.xml` in
   `~/Library/Containers/com.microsoft.Word/Data/Documents/wef`.
3. **Check that the pane opens** and Office reaches `onReady` as Word.
4. **Check the capability probe** reports what this build actually
   supports, on a machine with an older Word if one is available.
5. **`documentText()` against a real agreement.** The thing to verify is
   that the string it builds matches what the server is given, because
   every offset depends on it.
6. **Go to.** Pick a finding whose term appears several times and confirm
   Word selects the occurrence the panel meant, not the first one. This is
   the test that catches an off-by-one in the occurrence index.
7. **Fix as tracked change.** Confirm the edit appears as a revision that
   can be accepted or rejected, and that with tracking forced off by the
   document, nothing is written at all.

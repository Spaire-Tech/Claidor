# The panel

Claidor inside Word, Excel, PowerPoint and Outlook. **One React app, four
hosts** — the same findings list, the same chain, the same components. What
differs between the hosts is which document API is called, and all of that
lives in `src/host/`.

## What is here, and what is not

|                        |                                                   |
| ---------------------- | ------------------------------------------------- |
| `manifest.xml`         | Word · Excel · PowerPoint. One file, three hosts  |
| `manifest.outlook.xml` | Outlook. Separate because it must be — see below  |
| `src/host/`            | The four applications behind one interface        |
| `src/api.ts`           | The tie-out API, typed                            |
| `src/auth.ts`          | Bearer tokens via the sign-in dialog              |
| `src/usePanel.ts`      | The state machine — sign in, identify, load, jump |
| `src/Panel.tsx`        | **A placeholder. Replace this.**                  |

`Panel.tsx` is ugly on purpose. It renders every stage the real panel needs
with the data already wired to it, so the plumbing can be sideloaded and
watched working before there is a design. Replacing it means styling what
`usePanel` already returns.

**No screen imports `Office`.** If one ever has to know which host it is
running in, `src/host/` has failed.

## The four states

Every screen needs all four, and the fourth is the one everyone forgets.

- **Empty** — no findings. This is the _good_ outcome and must not look
  like a failure. « Checked, and everything ties out. »
- **Loading** — identification and extraction both take a moment.
- **Error** — the server's messages are written to be shown as they stand.
  « This .xls is password protected », not « request failed ».
- **Too much** — a real deck reaches hundreds of findings, in a 320-pixel
  column with no horizontal scroll available.

## How a document knows which deal it belongs to

The panel opens inside PowerPoint with a deck already on screen. Working
out which artifact that is happens in three steps, in descending order of
how much each can be trusted:

1. **The stamp.** A lineage id in the document's own settings, written the
   first time somebody chose a deal for it. It lives _inside the file_, so
   it survives Save As, a rename, and being emailed onward. Not a guess.
2. **The filename, inside a deal already chosen.** Marked as a guess, and
   never consulted across deals — two deals holding a `model.xlsx` is the
   normal case, not the edge case.
3. **Nothing**, and the panel asks. Once per document, never again.

The lineage id, not the artifact id: an artifact id changes on every
upload and « this deck » does not.

## Why Outlook has its own manifest

Not packaging pedantry. Outlook is a `MailApp` rather than a
`TaskPaneApp`, with a different override schema, because **a draft is not
a document**: there is no `Office.context.document`, nothing to stamp, and
nothing to select when a finding is clicked. `src/host/outlook.ts` returns
false and says why rather than failing quietly.

It is also the surface where being wrong becomes permanent. Everywhere
else a mistake is caught before anyone outside sees it; a draft with the
deck attached is the last moment that is still true.

## Running it

```bash
pnpm dev            # a browser, at :3100 — where most of the panel gets built
pnpm build          # dist/, which the manifests point at
pnpm test           # the parts that can be checked without Office
pnpm type-check
```

Outside Office the host bridge answers « not running inside Office » to
everything and the panel still renders, so a margin can be changed without
sideloading into PowerPoint.

### Sideloading

Office loads a task pane from a **live HTTPS origin** — never a file path,
and on desktop never plain HTTP. The dashboard's build takes care of the
deployment half: every `pnpm build` in `apps/web` embeds the panel at
`/panel/` on the dashboard's own origin and — when that origin is https —
stamps and serves both manifests at `/panel/manifest.xml` and
`/panel/manifest.outlook.xml` (`scripts/stamp-manifests.mjs`; the
checked-in manifests keep their placeholder on purpose). The icons ride
along in `public/assets/`, drawn from the design's own mark.

**[SIDELOAD.md](SIDELOAD.md) is the runbook** — per-host steps for the
web, Mac, Windows and Outlook, the tunnel recipe for pointing real Office
at a local server, and what to look at when it fails.

`pnpm validate:manifest` runs Microsoft's online validator; both stamped
manifests validate clean against it.

## Signing in, and where the panel has to be deployed

The panel cannot be signed in directly. It is an iframe on its own origin
inside Office, so a `SameSite=Lax` session cookie is never sent with its
requests and Safari and Edge block third-party cookies outright.

So `signin.html` is opened by Office as a **real top-level window**. The
cookie works there. It calls `POST /v1/tieout/panel/token`, which mints a
bearer token from the browser session — a web session only, because a
token that can mint a token makes every narrow scope one request away from
a wide one — and hands it back through `messageParent`.

Three consequences worth knowing before deploying:

1. **`signin.html` ships with the panel.** `messageParent` is same-origin
   only and Office enforces it, so this page cannot live on the dashboard.
2. **Deploy the panel under the dashboard's origin** — `/panel/` on the
   same domain. Then the cookie is first-party for the token call and
   there is no CORS to configure at all. A separate origin works, but the
   API's `CORS_ORIGINS` then has to name it or the cookie is not sent.
3. **Two scopes, fixed server-side.** `tieout:read` and `tieout:write`,
   never taken from the request. Thirty days, then the panel asks again
   rather than letting the first 401 of the day be the notification.

Locally, the panel is on `:3100` and the API on `:8000` — different
origins, same site, so the cookie _is_ sent once `CORS_ORIGINS` includes
`http://127.0.0.1:3100`. The sign-in page says exactly that when the call
fails, because `fetch` reports « CORS refused this » and « the server is
down » as the same bare error.

## Selecting a shape, and one honest caveat

The server reads a deck with `python-pptx`, which gives each shape an
integer `shape_id` and a `name`. The JavaScript API gives `Shape.id` and
`Shape.name`. **Only the name is documented to mean the same thing on both
sides.** `Shape.id` is described as opaque, and while it often carries the
same integer, a jump that lands on the wrong shape is worse than one that
does not move — so the name is matched first and the id is a fallback.

When both miss, the slide is still reached and the result says so. Every
outcome carries how it got there: `text` · `shape` · `slide` · `cell` ·
`search` · `none`. A panel that silently fails to move looks exactly like
a panel that moved somewhere wrong.

## Requirement sets

Nothing is hard-required in the manifest, deliberately. A high floor makes
the add-in refuse to load on builds where most of it would work. Instead
each capability is checked at run time and degraded:

| Wanted                                   | Set                   | Without it                     |
| ---------------------------------------- | --------------------- | ------------------------------ |
| Select an exact figure inside a sentence | PowerPointApi 1.4     | Select the shape               |
| Select a shape, select a slide           | PowerPointApi 1.5     | `goToByIdAsync` moves the view |
| Read slides and shapes                   | PowerPointApi 1.3     | Slide only                     |
| Sign-in dialog                           | Mailbox 1.5 (Outlook) | Required there, and stated     |

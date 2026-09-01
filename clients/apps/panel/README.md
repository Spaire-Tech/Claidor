# The panel

Swens inside Excel: the audit of the workbook a person has open, beside
the cells it names. **One React app, one live host** — the manifest
registers Excel only, by the product's own posture (the customer lives in
Excel, and the panel audits the model in front of them). The Word,
PowerPoint and Outlook bridges stay in `src/host/`, dormant; re-adding a
`<Host>` line to the manifest is all it takes to wake one. No screen
imports `Office` — if one ever has to know which host it is running in,
`src/host/` has failed.

## What is here, and what is not

|                        |                                                          |
| ---------------------- | -------------------------------------------------------- |
| `manifest.xml`         | Excel. Word and PowerPoint retired with the pivot        |
| `manifest.outlook.xml` | Outlook. Dormant, separate because it must be — see below |
| `src/host/`            | The host bridges behind one interface — Excel live       |
| `src/api.ts`           | The tie-out API, typed                                   |
| `src/auth.ts`          | Bearer tokens via the sign-in dialog                     |
| `src/usePanel.ts`      | The state machine — sign in, read the workbook, check    |
| `src/Panel.tsx`        | The panel, in the design's own language                  |

## What it does

One job: **check the model that is open.** The panel reads the workbook's
own bytes out of Excel, sends them to `/v1/tieout/check-file` — read,
checked, dropped, nothing lands in a data room — and renders the answer:
the findings, each one a jump to its cell, « Fix the cell » where the fix
is derivable, and a re-check that runs against the workbook as it now
stands.

The deal-identification machinery this app used to carry — identify,
stamp, choose-a-deal — went with that pivot. A model is checked on its
own; nobody is asked which folder their file « belongs » to.

## The faces

- **Signed out** — one button.
- **Allow access** — Swens does not touch the workbook until asked once.
- **No workbook** — a host with no workbook to check says so plainly.
- **Checking** — the check is running on this workbook.
- **Checked** — the verdict and the findings. Empty is the _good_ outcome
  and must not look like a failure.
- **Failed** — what went wrong, in the server's own words. « This .xls is
  password protected », not « request failed ».

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
sideloading into Excel. Dev builds take two query parameters the real
bridge never needs: `?file=<url>` fetches workbook bytes so the whole
checked face runs against the live API in a plain browser, and
`?filename=` names a pretend document. Both are stripped from production
builds.

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

## Jumping, and one honest rule

A finding names a sheet and a cell, and clicking it selects that cell in
the open workbook. Every jump answers with how it went, and a refused one
says why — a panel that silently fails to move looks exactly like a panel
that moved somewhere wrong, so the row claims « Selected in the sheet »
only when the sheet agreed.

## Requirement sets

Nothing is hard-required in the manifest, deliberately. A high floor makes
the add-in refuse to load on builds where most of it would work. Each
capability is checked at run time instead, and the dormant hosts keep
their own degradations in `src/host/` for the day they wake.

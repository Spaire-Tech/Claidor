# The workspace

Pierce, as designed. Every value in `src/design.ts` — fonts, the colour
ramp, the panel treatment, the spacing — was read out of
`Pierce_Workspace.html` rather than chosen, and nothing here should be
adjusted to taste. If a screen needs a shade that is not in that file, the
design does not have that shade and the screen is wrong.

## What is wired

| Screen | Reads |
|---|---|
| Data room | `GET /v1/tieout/deals/{id}` — the real artifacts, with a file that failed to read saying so |
| Check | `GET /v1/tieout/deals/{id}/findings` — real findings, and the coverage line |
| Chain | `GET /v1/tieout/findings/{id}/chain` — the real walk back to the model |
| Figure library | `GET /v1/tieout/deals/{id}/links` — every reconciled figure, not only the ones that broke |
| Applications | The launcher |

Mail, Calendar, SharePoint, Docs, Sheets and Pitchbook are **not faked**.
They say they are not connected, because a screen that shows invented
numbers in a product about numbers being right is the wrong thing to build
first. Each is one component away once its backend lands.

## Two notes on fidelity

**The neutrals are Microsoft's Fluent ramp.** `#f3f2f1`, `#faf9f8`,
`#edebe9`, `#c8c6c4`, `#a19f9d`, `#605e5c`. That is what makes the panel
look like it belongs inside Word rather than like a web page someone
embedded, and it is worth protecting.

**Figures are set in IBM Plex Mono, prose is not.** `$42.6m`, `Ops!B23`,
`=SUM(B18:B22)-B24` read as data. A figure in the body font reads as an
opinion.

## Running it

```bash
pnpm dev            # :3200
pnpm build
pnpm type-check
```

`VITE_API_BASE` points at the server (default `http://127.0.0.1:8000`).
`VITE_DEAL_ID` names the deal while there is one; it becomes a route the
moment Projects lists more than one, and every screen already takes the id
as an argument so that is a wiring change rather than a rewrite.

The API is reached with the session cookie, so the workspace has to be
served from an origin the API's `CORS_ORIGINS` allows.

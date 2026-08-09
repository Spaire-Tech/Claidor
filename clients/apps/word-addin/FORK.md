# Statement of changes

Apache License 2.0, section 4(b) requires that modified files carry
"prominent notices stating that You changed the files". This is that notice,
for the whole work rather than file by file, because the first change below
touched most of the tree at once.

**Original work:** [`Vaquill-AI/ms-word-addin`](https://github.com/Vaquill-AI/ms-word-addin),
Copyright 2026 Vaquill AI, licensed under the Apache License, Version 2.0.

**Forked:** 9 August 2026, from the upstream tree as of its 28 July 2026
commit. The community (bring-your-own-key) build is the starting point.

The upstream `LICENSE` and the upstream half of `NOTICE` are kept verbatim.
`NOTICE` carries the modification statement; this file carries the detail.

---

## What was not copied

- `assets/` — upstream's own icons and its product screenshot. Branding, not
  code. `public/assets/` holds generated placeholders instead.
- `.git/` — the fork starts from the vendored tree, not upstream's history.
- `package-lock.json` — this repository is a pnpm workspace.
- `.env.example` — superseded by the workspace's own environment handling.
- `.env.community` — see below.

## The community build selects itself

Upstream's `--mode community` relied on a committed `.env.community`
containing `VITE_EDITION=community`. This repository's root `.gitignore`
excludes `.env.*`, and a missing file does not fail the build: it produces a
*cloud* bundle from a command named `build:community`, silently. So
`vite.config.ts` now sets the variable from the mode itself and the dotfile is
gone. Verified by reading the minified output: `isBuildCommunity()` folds to
`return true` in the community bundle and keeps the runtime bring-your-own-key
check in the cloud one.

## Branding and identity

Every occurrence of the upstream product name was replaced with Claidor:
348 occurrences across 87 files, covering user-visible strings, manifest
`ProviderName` / `DisplayName` / resource ids, storage keys, IndexedDB
database name, content-control tags, bookmark prefixes and identifiers such
as `VAQUILL_TAG` and `stampVaquillReview`. `SaveToVaquill.tsx` became
`SaveToClaidor.tsx`.

The three real manifests were given fresh GUIDs. Keeping upstream's would
have made a sideloaded Claidor collide with a sideloaded Vaquill in the same
Word install. (Upstream's dev manifest carried
`b1c2d3e4-0000-4dev-9e62-3c5d1a8b6f04`, which is not a valid GUID at all —
`dev` is not hexadecimal.)

The custom XML parts the add-in writes into the `.docx` — the review
snapshot, the negotiation ledger and the governance ledger — were namespaced
under upstream's domain. They are now `urn:claidor:review:1`,
`urn:claidor:negotiation:1` and `urn:claidor:governance:1`. A URN rather than
a URL because the identifier does not have to resolve and Claidor does not
own a domain to point it at. The practical effect is that a document
reviewed in one product does not rehydrate in the other, which is correct.

## Hosts and configuration

Upstream hard-coded its two production hostnames in `src/config.ts` and
chose between them with `import.meta.env.PROD`. Claidor is not deployed, so
`apiBase` and `appBase` now come from `VITE_API_BASE` and `VITE_APP_BASE`,
defaulting to the local development servers. `assertConfigured` additionally
requires `apiBase` in the hosted build: without it every request resolves
against the add-in's own origin and 404s, which is a slow way to discover a
missing build argument.

Everywhere a hostname still has to appear literally — the manifests, the
nginx CSP, the deployment notes — it is `YOUR-DOMAIN.example.com` or
`YOUR-API-DOMAIN.example.com`, matching the convention upstream already used
in its community manifest.

Two upstream hosts were dropped rather than renamed:

- `dbs.vaquill.ai`, upstream's US statutes service. Renaming it would have
  claimed a service that does not exist here.
- `accounts.google.com` in the production manifest's `AppDomains`, replaced
  by `login.microsoftonline.com`. Microsoft Entra is the only sign-in Claidor
  offers.

## React

Upstream pinned React 18.3. This workspace pins `@types/react` to 19 through
a root `pnpm.overrides` entry, so the add-in was typechecking React 18 code
against React 19 typings. The add-in now depends on React 19 as well, which
is where the one genuine type error came from: `useRef<T>()` with no
argument, which React 19's typings reject. The code is otherwise already
React 19-shaped — `createRoot`, no `defaultProps`, no string refs.

## Tests

Upstream ships no tests. `src/claidor/locate.ts` and its 25 tests came from
the add-in this fork replaces; they cover the mapping from a server character
offset to a Word search, which is the part that can be wrong without anything
visibly failing. `vitest.config.ts` is new.

## Icons

`public/assets/icon-{16,32,64,80,128}.png` are generated placeholders, so a
sideloaded manifest resolves every icon reference instead of falling back to
Office's generic one. See `public/assets/README.md`.

## Still upstream's, unchanged

The 30 feature areas, the Office.js layer under `src/office/`, the community
(bring-your-own-key) provider routing, the UI primitives, the deployment
Dockerfile and nginx configuration. That is the reason to fork rather than
keep building: roughly 40,000 lines of Word integration that works.

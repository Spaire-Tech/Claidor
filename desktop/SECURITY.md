# Security notes for the Mac app

Report security problems privately (see `SECURITY.md` at the repository root).

- The updater, Sentry and the upstream telemetry are switched off at the
  Electron main-process packaging boundary; the app talks to Simeon Labs'
  API only.
- The bootstrap download and the `app.asar` it reads are checked against
  pinned SHA-256 values (`NOTICE.md`).
- `npm audit` reports advisories tied to the pinned Electron 42.1 runtime and
  the Undici 5 / Connect 1, AI SDK and OpenTelemetry versions the app is built
  on. Patch-level fixes are applied where they do not change the app's
  behaviour; major upgrades are follow-up work.

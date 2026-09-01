# Getting the panel into real Office

The runbook. The [README](README.md) explains how the panel works; this
page is only about getting it loaded into Excel — first on your own
machine, then for the team. (The manifest registers Excel only since the
pivot; the Word/PowerPoint/Outlook steps below are kept for the day a
dormant host wakes.)

## What is already true, and what is not yet

Proven, in this repository:

- **Every dashboard deploy carries the panel.** `pnpm build` in
  `apps/web` builds the panel first (`scripts/embed-panel.mjs`) and
  serves it at **`/panel/`** on the dashboard's own origin — same domain,
  same TLS, no second deployment.
- **The deploy serves its own manifests.** When
  `NEXT_PUBLIC_FRONTEND_BASE_URL` is https, the build stamps that origin
  into both manifests and serves them at **`/panel/manifest.xml`** and
  **`/panel/manifest.outlook.xml`**. Both stamped manifests validate
  clean against Microsoft's validator (`pnpm validate:manifest` runs it).
- **The panel works against the real API.** Re-proven headlessly 31 Aug
  2026 on this exact code: token minted through `/v1/tieout/panel/token`
  from a real session, the open workbook's bytes through
  `/v1/tieout/check-file`, 11 findings rendered with live sentences,
  « N checks pass » from the house-rules catalogue, re-check, and honest
  refusals for everything that needs Office.

Not yet proven, honestly: **no real Excel has loaded this build of the
add-in.** An earlier build's pane did load inside real Word on the web
(14 Aug — it surfaced the CSP and sign-in-URL bugs, both fixed), but the
Excel-only panel as it stands — ribbon button, workbook bytes read
through `Office.js`, jump to a cell, « Fix the cell » — is built and
unit-tested and has never been watched running inside Excel. The first
sideload below is that test. Expect it to surface something; that is
what it is for.

## First sideload: Excel on the web (10 minutes, no install)

The gentlest full test, because upload-a-manifest is built into the UI:

1. Download `https://<your-dashboard-domain>/panel/manifest.xml`.
2. Open any workbook at excel.office.com (same Microsoft account tier —
   add-ins need a work/school or Microsoft 365 account).
3. **Home → Add-ins → More Add-ins → My Add-ins → Upload My Add-in** and
   pick the downloaded file.
4. An **Ances** group appears on the Home tab. Open it: the sign-in
   screen, then « Allow access », then the check of the workbook you
   have open.

## Desktop

### Mac

Sideloading on Mac is copying the manifest into the application's `wef`
folder:

```bash
# PowerPoint
cp manifest.xml ~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef/
# Excel and Word: same path with com.microsoft.Excel / com.microsoft.Word
```

(the stamped one, downloaded from your deploy — not the checked-in copy,
which carries a placeholder domain on purpose). Restart the application;
the add-in appears under **Home → Add-ins**. If the `wef` folder does
not exist, create it.

### Windows

Two routes:

- **Shared-folder catalog** (by hand): put the stamped manifest in a
  folder, share the folder with yourself, add it under **File → Options
  → Trust Center → Trusted Add-in Catalogs**, restart, then **Insert →
  My Add-ins → Shared Folder**.
- **The scripts** (automated): `pnpm sideload:powerpoint` (or `:excel`,
  `:word`) registers a manifest and launches the app. Point it at a
  stamped copy first — the checked-in `manifest.xml` names the
  placeholder domain, so stamp into `dist/` and run
  `npx office-addin-debugging start dist/manifest.xml desktop --app powerpoint`
  if you want the same against a stamped file. `pnpm sideload:stop`
  unregisters.

### Outlook

Outlook has its own manifest (`/panel/manifest.outlook.xml` — a MailApp
is a different animal, see the README). Go to
[aka.ms/olksideload](https://aka.ms/olksideload) (opens Outlook's
add-ins dialog) → **My add-ins → Add a custom add-in → Add from file**.
Works for both web and new desktop Outlook.

## Pointing real Office at your _local_ server

Office refuses a task pane over plain http (localhost sometimes excepted,
but unreliably so), and the local loop here is http. The dependable way
to develop against a machine-local server with real Office is a tunnel:

1. Run the stack (`uv run task api`, dashboard `pnpm dev`, panel
   `pnpm dev`).
2. Open an https tunnel to the panel dev server:
   `cloudflared tunnel --url http://127.0.0.1:3100` (or ngrok — anything
   that gives an https origin).
3. Stamp with the tunnel's origin:
   `node scripts/stamp-manifests.mjs --origin https://<tunnel-domain>`
   (no `--path` — the dev server serves at `/`).
4. Sideload `dist/manifest.xml` by any route above.

The API must allow the tunnel origin: add it to `CLAIDOR_CORS_ORIGINS`
in `server/.env`, the way `http://127.0.0.1:3100` already is for the
browser loop.

## The browser loop (no Office at all)

Where most of the panel gets built, and the only loop that works in an
environment with no Office:

```bash
cd clients && pnpm --filter @claidor/panel dev   # http://127.0.0.1:3100
```

- `server/.env` needs `CLAIDOR_CORS_ORIGINS=["http://127.0.0.1:3100"]`
  (already there for dev).
- Open `http://127.0.0.1:3100/?file=<url-of-an-xlsx>` — outside Office
  there is no workbook, so `?file=` (dev builds only) hands the detached
  bridge real bytes and the whole checked face runs: findings, the
  catalogue line, re-check. Sign in goes through `signin.html`, which
  needs a dashboard session cookie in the same browser — or put a token
  minted by `POST /v1/tieout/panel/token` into `localStorage` under
  `claidor.panel.token`, which is exactly what the dialog would do.
- One thing behaves differently out here, by design: « jump to it » and
  « Fix the cell » answer that they are not running inside Office.

## What to look at when it fails

- **The button appears but the pane is blank** — the manifest's origin
  is unreachable or wrong. Check `/panel/index.html` loads in a browser
  from the same machine.
- **Sign-in dialog opens and immediately fails** — the dialog page calls
  `POST /v1/tieout/panel/token` with the dashboard session cookie. Not
  signed into the dashboard in that browser profile is the usual cause;
  CORS is the other (only applies when panel and API are on different
  origins).
- **« Which deal does this belong to? » for a file that should be
  known** — expected once per document: the filename is never matched
  across deals, only inside the one you pick, and then the stamp
  remembers. If it asks _every_ time in real PowerPoint, the stamp write
  is failing — that is a bug, report what the panel said.
- **Add-in refuses to load, no useful error** — validate the exact file
  you sideloaded: `npx office-addin-manifest validate <file>`.

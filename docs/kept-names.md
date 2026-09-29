# Earlier names still in the repository

The product is **Simeon**, made by **Simeon Labs**. Earlier names of the
product, and names from the code it came from, must not appear anywhere except
where a rule in `scripts/kept_names.json` allows them. `scripts/check_names.py`
checks this and fails on anything else:

```sh
python3 scripts/check_names.py            # exit 1 on a finding
python3 scripts/check_names.py --summary  # also count what each rule allows
```

It runs on every pull request (`.github/workflows/names.yml`).

## What it looks for

Grok (not as part of "ngrok"), Caisra, Anysphere, Claidor, OHADA, Swens,
Spaire, SpaceX, xAI, LobsterAI, OpenClaw, Youdao, Rakazo, Pierce and Vesence,
in any case, in the text and the name of every file in the repository
(tracked, or new and not ignored by git). Binary files are skipped.

"Cursor" is not on the list: it is an ordinary English word and appears
thousands of times in code (a text cursor, a database cursor, a page cursor).
The strings a person can see are checked by the window patch instead: the
package build records how many "Cursor" and "Anysphere" survive it
(`brand.residue` in `dist/renderer-router-extension.json`).

## The kinds of rule

Each rule names the earlier names it allows, the files it allows them in, an
optional pattern the line must match, and the reason.

- **record**: text that has to name an earlier name: the Mac app's
  `desktop/NOTICE.md`, which states where the app comes from, and the
  documents here that explain a kept identifier.
- **contract**: a name another program expects, which we do not build and
  cannot change. The upstream app's download name and bundle names, the
  strings the window patch looks for in order to replace them, generated
  protocol code, and the Connect service names on the wire.
- **fallback**: an earlier name still read so that existing installs and
  deployments keep working: `CLAIDOR_` settings, tokens and cookies issued
  before the rename, the `~/.caisra` data folder the app moves once, the
  earlier Docker label and the `caisra://` sign-in callback.
- **data**: a value already stored or deployed under an earlier name: meter
  event names, an S3 bucket, database migrations, a published npm package, the
  Render service names.
- **guard**: a test that checks an earlier name is gone from what a person or
  the agent reads has to name it.

## Kept on purpose, not checked

- **`sand`** is the upstream app's internal word for the agent's computer
  (`SAND_*` settings, `/sand/*` routes, `sand-*` file and class names). Nobody
  using Simeon sees it, and much of it has to match the pinned window and the
  box image, so it stays as a code word (decided 29 September 2026).
- **`polar`** (`server/polar/`) is a three-file stand-in that forwards the old
  start commands (`polar.app:app`, `polar.worker.run`) to the `simeon`
  package, because Render keeps each service's start command in its own
  settings. Remove it once every Render service starts `simeon.*`.

## Changing the list

- **To remove a name**: rename it (keeping a fallback if anything stored or
  deployed still uses it), run the check, and delete the rule it reports as
  matching nothing. The check fails while a rule matches nothing, so the list
  cannot quietly keep rules that are no longer needed.
- **To keep a new occurrence**: first ask whether it can be renamed. If it
  cannot, add it to the narrowest rule that fits (a single file, and a `match`
  pattern when only some lines should pass), or add a rule with its reason.
  Never widen a rule to a whole folder to make the check pass.

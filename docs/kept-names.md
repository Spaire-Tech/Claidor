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
in any case, in the text and the name of every file git tracks. Binary files
are skipped.

"Cursor" is not on the list: it is an ordinary English word and appears
thousands of times in code (a text cursor, a database cursor, a page cursor).
The strings a person can see are checked by the window patch instead: the
package build records how many "Cursor" and "Anysphere" survive it
(`brand.residue` in `dist/renderer-router-extension.json`).

## The kinds of rule

Each rule names the earlier names it allows, the files it allows them in, an
optional pattern the line must match, and the reason.

- **record**: a statement of where something comes from that has to name its
  source. The Mac app's `desktop/NOTICE.md` is the only one.
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
- **phase-6**: our own code names that still carry an earlier name (the
  model provider id `claidor`, `GrokBot*` and `Anysphere*` types, logger
  names, test file names). They are renamed in the next step, and these rules
  go with them.

## Changing the list

- **To remove a name**: rename it (keeping a fallback if anything stored or
  deployed still uses it), run the check, and delete the rule it reports as
  matching nothing. The check fails while a rule matches nothing, so the list
  cannot quietly keep rules that are no longer needed.
- **To keep a new occurrence**: first ask whether it can be renamed. If it
  cannot, add it to the narrowest rule that fits (a single file, and a `match`
  pattern when only some lines should pass), or add a rule with its reason.
  Never widen a rule to a whole folder to make the check pass.

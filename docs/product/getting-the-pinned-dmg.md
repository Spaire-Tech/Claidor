# Getting the pinned 0.18.0 DMG

**The app's entire UI lives in one file.** `Grok_Bot_0.18.0.dmg`, 155,793,020
bytes, sha256
`a253ccd8aab01e083f9812a0264354c5034d8ba7f0610bbb557e82ae77d203eb`. Inside it
is `app.asar`, sha256 `6665408168466f9cacc6087e917890c17f59d2e2e9c2404a5c4a59ad79c1de58`,
and inside that the shipped renderer. `npm run bootstrap` extracts it to
`src/app/dist`; everything else in the build is assembled around it.

Without this file there is no app. With it, the whole loop works.

## Just run bootstrap

```sh
cd desktop && npm run bootstrap
```

It now tries, in order, stopping at the first that matches the digest:

1. `GROK_BOT_018_APP` — a 0.18.0 `Grok Bot.app` you already have
2. `.cache/runtime/Grok Bot.app` — a previous run
3. `research-archives/original/0.18.0/macos-arm64/Grok_Bot_0.18.0.dmg` — a local copy
4. `GROK_BOT_DMG_URL` — anywhere you point it
5. `downloads.cursor.com` — the official address
6. the public GitHub forks of the reconstruction

**Every one is checked against `dmgSha256` before it is used.** That is what
makes reaching past the official host safe: the digest is the authority, the
host is not. A file that is truncated, throttled, substituted or simply a
different build is refused, not built.

## Keep a copy, and this stops being a problem

The surest route is not to depend on any of them:

```sh
mkdir -p desktop/research-archives/original/0.18.0/macos-arm64
cp Grok_Bot_0.18.0.dmg desktop/research-archives/original/0.18.0/macos-arm64/
```

Bootstrap checks that path **before** any network call. It is gitignored, so it
stays on the machine. Put a second copy somewhere durable — an external disk,
private storage — because the two published sources have already gone.

If a 0.18.0 app is installed anywhere, that skips the file entirely:

```sh
GROK_BOT_018_APP="/Applications/Grok Bot.app" npm run bootstrap
```

## What is gone, and what still works — measured 19 September 2026

**The official CDN: 403, for everyone.** Confirmed from a build container *and*
from the founder's Mac. It is not an egress problem and there is nothing to
configure around it.

**Gitee: the pointer without the object.** The project's docs name
`research-archives/` as a Git LFS directory in the upstream repository.
Requesting the file returns a 302 to a signed LFS URL whose path is the pinned
digest, and that URL answers:

```
{"message":"'a253ccd8aab01e083f9812a0264354c5034d8ba7f0610bbb557e82ae77d203eb' object not found"}
```

Twice, with distinct request ids. The pointer was committed; the object was
never uploaded.

**Public GitHub forks: this is where it came from.** They carry the LFS object,
and GitHub serves it over ordinary HTTPS. That last detail matters more than it
sounds: macOS ships git **without** the `lfs` subcommand, so the documented
`git lfs pull` route fails with `git: 'lfs' is not a git command` before it
starts. Plain `curl` needs nothing installed.

Check any mirror in about a second, without pulling 148 MB:

```sh
curl -sIL "https://github.com/webdevtodayjason/grok-bot-0.18-reconstructed/raw/main/research-archives/original/0.18.0/macos-arm64/Grok_Bot_0.18.0.dmg" \
  | grep -iE "^(HTTP/|content-length:)"
```

`content-length: 155793020` means it is there. Then:

```sh
curl -L -o Grok_Bot_0.18.0.dmg "https://github.com/webdevtodayjason/grok-bot-0.18-reconstructed/raw/main/research-archives/original/0.18.0/macos-arm64/Grok_Bot_0.18.0.dmg"
shasum -a 256 Grok_Bot_0.18.0.dmg
#   a253ccd8aab01e083f9812a0264354c5034d8ba7f0610bbb557e82ae77d203eb
```

Known forks, in the order bootstrap tries them: `webdevtodayjason` (verified,
19 September), `sergiodekki`, `EpicHacker67`, `agisota`, `woosa0502`,
`xianyu110`. More exist — search GitHub for `grok-bot-0.18-reconstructed`. They
are one project forked many times, so a new one is a new host for the same
bytes, and the digest decides.

## If every source is gone

Bootstrap will say so, list what it tried and why each failed, and point back
here. At that point the file is a thing to ask a person for, not a thing to
engineer: anyone who cloned that project with LFS, or installed Grok Bot 0.18.0
before it was withdrawn, has it. The digest proves whatever they send.

**A copy on a disk you own is worth more than any of this.**

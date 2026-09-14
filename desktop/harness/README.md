# The design harness

A browser page that mounts the real shell with fixture data, and a script
that photographs it. It exists because forty passing tests did not catch
an approval card reading "Allow juno to continue", and a screenshot did.

It is not part of the app. Nothing in `src/` imports it.

```bash
npx vite build --config harness/vite.config.ts
node harness/shoot.mjs                 # all six screens
node harness/shoot.mjs thread voice    # or just these
```

Screenshots land in `harness/shots/`, which is not committed — they are
regenerated in two commands and would otherwise put a couple of megabytes
of PNG into history every time a colour changed.

The script prints anything the page logged as an error and the path of
anything the static server refused, because a bare "404 (Not Found)" is
one guess away from chasing the wrong file.

`?screen=` picks the screen: `signin`, `signin-error`, `thread`,
`choice`, `typing`, `voice`, `compose`, `arriving`.

## Proving the stagger

A still photograph cannot show bubbles arriving 420ms apart, so there is
a second script for the one behaviour that is temporal:

```bash
node harness/stagger.mjs
```

It opens `?screen=arriving`, which appends a three-bubble reply a beat
after mount, and counts how many are on screen every 120ms. A pass looks
like `001112222333333333` — one, then two, then three — with each new
bubble first seen roughly 420ms after the last. The sampling interval is
120ms, so expect the measured gaps to sit within about that of 420.

## What it does and does not prove

It mounts the shipped components — not copies, not mocks. The only thing
faked is the store, so everything below `MessagesShell` is the real code.

It is still a browser and not Electron. Nothing here exercises IPC, the
engine, the gateway, or anything the main process owns.

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
`choice`, `typing`, `voice`.

## What it does and does not prove

It mounts the shipped components — not copies, not mocks. The only thing
faked is the store, so everything below `MessagesShell` is the real code.

It is still a browser and not Electron. Nothing here exercises IPC, the
engine, the gateway, or anything the main process owns.

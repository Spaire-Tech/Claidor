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

`?screen=` picks the screen: `signin`, `signin-error`, `thread`, `files`,
`choice`, `typing`, `voice`, `compose`, `arriving`; and the Apps sheet as
`apps` (Plugins), `apps-adding` (one sign-in running), `apps-agents`
(the Agents tab) and `apps-agent` (the Engineering Lead's page).
`node harness/shoot-canvas.mjs` photographs the same three screens of
the founder's canvas, to put beside them.

## Proving the stagger

A still photograph cannot show bubbles arriving a second apart, so there
is a second script for the one behaviour that is temporal:

```bash
node harness/stagger.mjs
```

It opens `?screen=arriving`, which appends a three-bubble reply a beat
after mount, and counts how many are on screen every 120ms. A pass looks
like `001112222333333333` — one, then two, then three — with each new
bubble first seen roughly a second after the last. The sampling interval
is 120ms, so expect the measured gaps to sit within about that of 1000.

## Proving find-in-conversation

Also temporal — it needs a click and some typing:

```bash
node harness/find.mjs
```

It opens the thread, clicks the magnifier, types `slide`, and checks the
count reads `1 of 2`, that the matching line survived, that a
non-matching one is gone, and that a query with no hits says so.

## Running the app itself

`?screen=live` is not a screen of fixtures. It mounts `FaiserApp` — the
hook, the services, the real Redux store — with only the Electron bridge
stood in for (`live-app.tsx`), and a script drives the two flows that were
reported broken from a built app:

```bash
node harness/live.mjs            # both
node harness/live.mjs open       # a Word file the agent made, clicked
node harness/live.mjs delete     # the open agent, deleted
```

The first clicks the `.docx` chip in a reply and checks the computer panel
opened on Files with the document drawn, that Save a copy is offered, and
that the operating system was never asked to open it. The second deletes
the open agent from the sidebar and checks the other rows keep their last
lines, the main conversation opens with its history, and another agent's
conversation still has its messages — all three at once, not staged.

The script prints every bridge method the app reached for that the
fixture did not know. Listeners and status reads are expected there; a
method a flow depends on is not.

## What it does and does not prove

It mounts the shipped components — not copies, not mocks. The only thing
faked is the store, so everything below `MessagesShell` is the real code.

It is still a browser and not Electron. Nothing here exercises IPC, the
engine, the gateway, or anything the main process owns — `live` included:
its bridge answers from a fixture, so it proves the renderer's side of a
flow and nothing about what the main process does with the call.

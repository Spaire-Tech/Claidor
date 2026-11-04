# Step 0's probe: the engine outside a computer

What it found is in `docs/agents-on-the-server/README.md` ("What step 0
found"). These are the pieces, so it can be run again. Run them on a test
machine, never on a real computer, and point them only at the stand-ins:
the probe reaches no real server, model or computer.

From `desktop/` (after `npm ci`), with `P` a folder of your own:

```sh
# The engine, built as scripts/build-simeon.mjs builds it
node scripts/agents-on-the-server/build-host.mjs $P/engine

# The hands program and the engine's client, bundled by themselves
for f in hands-daemon hands-client; do
  npx esbuild scripts/agents-on-the-server/$f.ts --bundle --platform=node --format=esm \
    --target=node22 --outfile=$P/$f.mjs \
    "--banner:js=import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
done

# The hands program over the network (step 0b): start it, then drive it
PROBE_PORT=41337 PROBE_TOKEN=<a token> PROBE_WORKSPACE=$P/ws node $P/hands-daemon.mjs &
PROBE_HOST=<its address> PROBE_PORT=41337 PROBE_TOKEN=<the token> PROBE_WORKSPACE=$P/ws node $P/hands-client.mjs
```

A whole turn (step 0c) needs a stand-in computer laid out as the real one:

- the hands program on 1337 with the token `local`, its workspace
  `/workspace`:
  `PROBE_PORT=1337 PROBE_TOKEN=local PROBE_WORKSPACE=/workspace node $P/hands-daemon.mjs`;
- the real window router: `node ../box/bin/simeon-window-router.mjs 1339 1337 14000`;
- `/usr/local/bin/start-window` running `stand-in-start-window.sh` with
  `PROBE_HANDS_BUNDLE=$P/hands-daemon.mjs` set, and a `stop-window` that
  exits 0.

Then the stand-in API, and the engine pointed at it:

```sh
node scripts/agents-on-the-server/stand-in-api.mjs 41400 $P/api.log &
cd $P/engine/host && SAND_PACKAGED=1 HOME=$P/home SAND_DATA_ROOT=$P/data \
  SAND_GATEWAY_BIND_HOST=127.0.0.1 SAND_HOST_PORT=41340 SAND_GATEWAY_TOKEN=<a token> \
  SAND_BACKEND_URL=http://127.0.0.1:41400 SAND_INFERENCE_RENEWAL_CREDENTIAL=stand-in \
  SAND_INFERENCE_PROVIDER=simeon SAND_DISABLE_TELEMETRY=1 SAND_DISABLE_ANALYTICS=1 \
  SAND_BOX_LOG_SHIP_DISABLED=1 SAND_BOX_AUTO_UPDATE=0 SAND_USE_EXISTING_BOX_EXEC_DAEMON=1 \
  SAND_TREE_SITTER_NODE_DEPS=<desktop>/node_modules NODE_PATH=<desktop>/node_modules \
  node host-main.cjs
```

Send a message the way the apps do:
`POST http://127.0.0.1:41340/api/sendPrompt` with
`authorization: Bearer <the gateway token>` and
`{"agentId": "<from /api/listAgents>", "prompt": "Run a command on your computer."}`.
`GET /health` says when the engine is busy. `api.log` holds every call,
the command's output included.

Take the stand-in `start-window`, `stop-window` and `/workspace` away
afterwards.

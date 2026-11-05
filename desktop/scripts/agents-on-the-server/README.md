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

## Through the API's door (step 1a)

To check an engine that reaches the computer only through the API, move the
stand-in computer off its usual ports: run the hands program on 41337 and the
router with `simeon-window-router.mjs 41339 41337 14000`. Then start the
stand-in API with `PROBE_BRAIN_TOKEN=<a token> PROBE_ROUTER_PORT=41339`, and
the engine with these settings added:

```sh
SIMEON_HANDS_URL=http://127.0.0.1:41400/hands \
SIMEON_HANDS_HEADERS='{"x-simeon-brain-token":"<the same token>","x-simeon-brain-user":"probe-user"}'
```

`api.log` then shows every call to the computer as a `hands` line: the path,
the answer, the window (`display`) and how long it took.

## The brain's service (step 1d)

The brain's image (`brain/`) run end to end on a test machine with Docker,
against the stand-ins only. With `S` a folder of your own:

```sh
# The engine, packed as a published bundle is
node scripts/agents-on-the-server/build-host.mjs $S/engine
mkdir -p $S/pack/box-exec-daemon $S/bundle && cp -R $S/engine/host $S/pack/host
echo '// unused' > $S/pack/box-exec-daemon/main.cjs
(cd $S/pack && tar -czf $S/bundle/sand-host-bundle-probe0001.tgz host box-exec-daemon)
echo probe0001 > $S/bundle/sand-host-bundle-latest.version
python3 -m http.server 41500 --bind 127.0.0.1 -d $S/bundle &

# The stand-in API, answering the brain's bootstrap
PROBE_BRAIN_TOKEN=<a token> PROBE_GATEWAY_TOKEN=<another> PROBE_HOST_BUNDLE_URL=http://127.0.0.1:41500 \
  node scripts/agents-on-the-server/stand-in-api.mjs 41400 $S/api.log &

# The image (from the repository root)
docker build -f brain/Dockerfile -t simeon-brain:test .
```

Then:
1. **A "computer" with agents and a backup.** Run the engine in its usual
   role from the image, backing up to a local folder
   (`--entrypoint node`, `SAND_BOX_STORE_SYNC=1`,
   `SAND_BOX_STORE_ID=11111111-1111-4111-8111-111111111111`,
   `SAND_BOX_STORE_LOCAL_DIR=/store` with `$S/store` mounted there, and the
   other settings as in step 0c). Make an agent (`/api/createAgent`), then
   take a backup (`/api/snapshotBoxStoreNow`), then stop it.
2. **The brain, as Render runs it.** The image's own command, with
   `--network host`, `$S/store` mounted at `/store`, and
   `SIMEON_BRAIN_USER`, `SIMEON_BRAIN_TOKEN`,
   `SIMEON_API_URL=http://127.0.0.1:41400`, `PORT` and
   `SAND_BOX_STORE_LOCAL_DIR=/store`.

On 5 November 2026 this showed:
- the brain's own backup empty, then 14 of 14 files brought in from the
  computer's;
- the engine started as `brain`, with the agent there;
- its backup written to its own store, and the computer's untouched;
- a restart keeping the disk;
- a new disk brought back from the brain's own backup;
- a wrong token refused and tried again a minute later;
- no token in its log.

If the machine's outbound proxy re-signs HTTPS, build on a local copy of
`debian:trixie-slim` that trusts the proxy's certificate. That changes the
`FROM` line of a copy of the Dockerfile, never the Dockerfile itself.

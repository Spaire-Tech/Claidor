# Simeon

**A team of always-on agents on your Mac, each with a computer of its own.**

Simeon is made by Simeon Labs ([simeonlabs.com](https://simeonlabs.com)).
This repository holds the whole product:

| Folder | What it is |
|---|---|
| `desktop/` | The Mac app: the window, the Electron main process, and the agent loop that runs on each person's cloud computer. |
| `server/` | The API at `api.simeonlabs.com`: sign-in, the model proxy, memory, the cloud computers, routines, sharing, connectors, billing. FastAPI and PostgreSQL. |
| `runner/` | The cloud runner: does a person's queued work when their Mac is closed. |
| `clients/` | The web app at `app.simeonlabs.com` (sign-in pages and the account dashboard) and its shared packages. |
| `sites/simeonlabs.com/` | The public website, with the live demo. |
| `docs/` | How it fits together, how to build it, what each server feature does, and how to run the servers. |

Start with [`docs/README.md`](docs/README.md).

## Build the Mac app

macOS on Apple Silicon only. See [`docs/building-the-app.md`](docs/building-the-app.md).

```sh
cd desktop
npm ci && npm run bootstrap && npm run check && npm run package && npm run verify
```

## Run the server and web app locally

```sh
# API (http://127.0.0.1:8000)
cd server
docker compose up -d          # PostgreSQL, Redis, MinIO
uv sync && uv run task api

# Web app (http://127.0.0.1:3000)
cd clients
pnpm install && pnpm dev

# Tests
cd server && uv run task test
cd clients && pnpm test
cd desktop && npm test
```

Settings are read from the environment as `SIMEON_<NAME>` (the earlier
`CLAIDOR_<NAME>` is still read, so deployments keep working while they are
renamed). The environment is chosen by `SIMEON_ENV`.

## Licence

The server and web app are derived from [Polar](https://github.com/polarsource/polar)
(Polar Software Inc.) and are under the Apache 2.0 licence in [LICENSE](LICENSE);
[NOTICE](NOTICE) lists the attributions. The Mac app's origin and terms are in
[`desktop/NOTICE.md`](desktop/NOTICE.md).

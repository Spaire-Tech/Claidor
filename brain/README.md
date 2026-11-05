# The brain

The brain runs the person's agents' engine **off their cloud computer**, on a
Render service of its own (5 November 2026). The plan is in
`docs/agents-on-the-server/README.md`; this folder is step 1d.

The brain does the thinking, chat, connectors, cards, routines and memory.
The cloud computer (E2B) is used only for its hands: websites, code and
commands, files, sign-ins that stick, and Take control. While the agents
only talk or use connectors, the computer sleeps and costs nothing.

One brain serves one person today.

## What is here

| File | What it is |
|---|---|
| `Dockerfile` | The image: Debian trixie, Node 22 and the engine's tree-sitter add-ons, as on the computer, but no desktop, Chrome or VNC. Built from the repository root. |
| `Dockerfile.dockerignore` | Sends only the start script and the add-ons' lockfile to the build. |
| `start-brain.mjs` | The start script (below). No dependencies. |
| `test/start-brain.test.mjs` | Its tests: `npm test` here. |

## How it starts

1. It asks the API what to start with (`POST /sand-box/brain/bootstrap`, with
   the brain's token and the person's e-mail address). The answer holds:
   - their computer's gateway token (the apps send it; the engine checks it);
   - a credential of the brain's own, for the model;
   - the API's address;
   - the two backup stores: the computer's and the brain's own;
   - where the engine is published.
2. It downloads that engine (the host bundle the computers run) into
   `/home/box/sand-host`. A newly published engine reaches the brain at its
   next restart.
3. On its first start on a disk, it brings the agents in:
   - from the brain's own backup, if it has one (a lost disk);
   - else from the computer's backup, once, taking the agents' folder only;
   - else nothing: a fresh start for a person with no backup.

   A copy that fails is tried again; the engine never starts on an empty
   disk after a failure. A marker on the disk (`.simeon-brain-brought-in.json`)
   says it is done, so later starts keep the disk as it is.
4. It runs the engine as `brain`:
   - with the computer's settings (as the computer's supervisor gives them)
     plus `SIMEON_ENGINE_ROLE=brain`;
   - the door to the computer's hands (`SIMEON_HANDS_URL`, with the brain's
     token and the person's id);
   - its own backup store.

   When the engine stops, it asks the API again (a fresh credential) and
   starts it again. A deploy's `SIGTERM` stops the engine cleanly.

It starts as root only to hand the disk to the `box` user, then runs as
`box`, as the engine runs on the computer.

## Making it on Render (the founder, in the dashboard)

1. **New → Private Service**, from this repository, branch `main`.
   - **Runtime:** Docker. **Dockerfile path:** `brain/Dockerfile`.
     **Docker build context:** `.` (the repository root).
   - **Region:** Oregon, with the API. **Name:** `simeonlabs-brain`.
   - **Instance:** Standard (2 GB, $25 a month). The engine used 244 MB at
     rest and under 400 MB in a turn in step 0, so 2 GB leaves room.
   - **Disk:** mount path `/home/box/sand-data`, 1 GB. The backup's paths
     are written from the root (`home/box/sand-data/…`), so it must be that
     path.
2. **Its settings:**
   - `SIMEON_BRAIN_USER`: the person's e-mail address (the one they sign in
     with).
   - `SIMEON_BRAIN_TOKEN`: a long random secret. Use Render's **Generate**
     button, and type the same value into the API (below). Never paste it
     anywhere else.
   - Nothing else is needed. `SIMEON_API_URL` defaults to
     `https://api.simeonlabs.com`, and `PORT` to 10000.
3. **The API's settings** (only in the order in
   `docs/agents-on-the-server/README.md`, "Switching it on"):
   - `SIMEON_BRAIN_USERS`: the same e-mail address.
   - `SIMEON_BRAIN_URL`: the brain's internal address from its dashboard
     page, e.g. `http://simeonlabs-brain:10000`.
   - `SIMEON_BRAIN_TOKEN`: the same secret.

## Log lines

- `[brain] starting for …`: the address, the API, the data folder and the port.
- `[brain] the API answered: …` / `the API refused the bootstrap (status reason): …`.
  The reasons are those of `sand.brain.refused` on the API: `brain_token`
  (the API isn't set up for the brain, or the tokens differ),
  `not_on_brain`, `no_user`, `no_computer`, `computer_not_hands` (the
  computer still runs the agents itself: rebuild it once), `signed_out`.
  Each is tried again every few minutes.
- `[brain] engine downloaded: sand-host-bundle-<version>.tgz`.
- `[brain] bringing the agents in from the …'s backup`, then the copy's own
  `[box-copy-in] result outcome=… files=…`, then `the agents are in, from …`.
- `[brain] engine starting as brain`, then the engine's `[sand-host] engine role: brain`.
- `[brain] engine stopped (code) after N s`.

No line carries a token or a credential.

## Checking it on a test machine

`desktop/scripts/agents-on-the-server/README.md` ("The brain's service, step
1d") runs the image against the stand-in API: a bundle served from a folder,
a "computer" engine backing up to a local folder, and the brain bringing its
agents in from it.

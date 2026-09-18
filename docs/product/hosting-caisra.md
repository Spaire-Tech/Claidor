# Caisra in production

Everything needed to run this fork on a real server, at a real HTTPS address,
so that handing someone a link or an app is a thing you can actually do.

Written against `rakazo/docs/self-host.md`, `self-host-secrets.md`,
`self-host-sandbox-providers.md`, `desktop-release.md`, `mobile-release.md`,
`infra/compose/docker-compose.prod.yml`, `infra/compose/Caddyfile.prod` and
`apps/desktop/src/setup-config.ts`. Every claim names its file.

**Status: deployed 18 September 2026.** Written before any of it had been run,
then confirmed against the live machine. The layout below is what is actually
running; anything still unverified is marked where it appears.

---

## 0. The live deployment

Confirmed on the server on 18 September:

| | |
|---|---|
| Host | Ubuntu 24.04 LTS, hostname `claidor`, login user `deploy` |
| Compose project | `rakazo-prod`, five services running |
| Compose file | `/srv/rakazo/rakazo/infra/compose/docker-compose.prod.yml` |
| Checkout | `/srv/rakazo/rakazo` |

The checkout path matched the prediction in §A5 — the repository clones to
`/srv/rakazo` and the fork sits one level down inside it, so every Compose
command runs from `/srv/rakazo/rakazo`.

**The IP address is deliberately not written down here, and neither is
anything else that would help someone log in. This repository is public** —
`Spaire-Tech/Claidor` reports `visibility: public`, and `rakazo/AGENTS.md`
opens by saying to assume all tracked content and diffs are public. A
production host's address next to its SSH username is half a credential. Keep
it in a password manager.

**Never guess this layout; ask the machine.** One command answers it, needs no
path, and is the right first move on any server whose arrangement you are not
certain of:

```bash
docker compose ls
```

It prints the project name, how many services are up, and the absolute path of
the compose file in use. That is what confirmed everything in the table above,
after the founder rightly challenged a path I had assumed rather than checked.

---

## 1. The shape of it

Five containers on one Linux server, from
`infra/compose/docker-compose.prod.yml`:

| Service | What it is | Exposed? |
|---|---|---|
| `caddy` | HTTPS front door. Gets certificates from Let's Encrypt by itself. | Yes — ports 80, 443 |
| `web` | The interface. Vite preview serving the built SPA. | No — internal only |
| `api` | Hono + oRPC. Also runs database migrations before it serves. | No — internal only |
| `worker` | Background jobs, routines, anything that runs while nobody is watching. | No |
| `postgres` | The database. | No |

Caddy routes by path (`Caddyfile.prod`): `/health`, `/api/*` and `/rpc/*` go to
the API; everything else goes to the web app. One address, no CORS puzzle.

**Agent computers do not run on this server.** The production Compose file
deliberately ships no sandbox supervisor — `self-host.md` says it "uses E2B for
bot computers, so the VM never exposes a Docker supervisor or browser
containers." `SANDBOX_PROVIDER` defaults to `e2b` in that file. So an E2B
account is required here, not optional. `daytona` and `box` are the documented
alternatives.

**The web app is not optional either.** `apps/desktop/src/main.ts` calls
`loadURL(origin)` — the Mac app is a window onto the deployed web origin, and
`apps/desktop/package.json` builds `@rakazo/web` before packaging. Their
AGENTS.md states it: "Electron hosts the web UI." Not publishing the address is
a choice you can make; not building it is not.

---

## 2. Decide four things first

**The address is `app.claidor.com`**, the founder's decision on 18 September,
taken with the costs below stated and judged not to matter at zero users:
*"those things you mentioned are not big deals. im trying to get this working
asap. it will change later."* It appears in four environment values and in
every client, so a later move re-signs everybody in.

That name currently serves the Claidor dashboard from Vercel, and taking it
over costs six things, five of which only serve screens nobody uses: Google
sign-in for the dashboard, the S3 CORS rule for browser uploads, the Word
add-in's panel and manifests, and two stale Render values
(`CLAIDOR_ALLOWED_HOSTS`, `CLAIDOR_CORS_ORIGINS`). A seventh is not a break but
is worth knowing: `CLAIDOR_USER_SESSION_COOKIE_DOMAIN` is `.claidor.com`, so
the browser sends the `claidor_session` cookie to this deployment too. Rakazo
ignores it; it is still a session credential travelling where it has no
business. Narrowing that value to the dashboard's eventual host is the fix.

**The sixth one is an ordering constraint, not a cost, and it is the only thing
here that can actually strand you.** `CLAIDOR_ACCESS_TOKEN` is minted by a
button on `app.claidor.com` (Account → Developer → Connect the app), so once
that name points at the new server the button is gone. **Mint the token before
moving the DNS.** It lasts a year, which makes this a sequencing detail rather
than a problem. To mint another one later, add a host such as
`dash.claidor.com` to the same Vercel project and name it in those two Render
values.

Also remove `app.claidor.com` from the Vercel project before repointing, or it
keeps trying to claim the name.

**The server.** 8 GB RAM, 4 vCPU, 80 GB disk, Ubuntu 24.04. The Compose file's
own memory limits total about 6.3 GB (postgres 2 g, worker 2 g, api 1.5 g, web
512 m, caddy 256 m) and the first build compiles the monorepo on the machine,
which is the heaviest moment. Roughly $20–40/month at Hetzner or DigitalOcean.

**Whether anyone but you can register.** `SIGNUP_ALLOWLIST` takes a list of
addresses or whole domains (`you@example.com,@company.com`). Leave it empty on
a public address and anyone who finds it can sign up and spend the Claidor
allowance, because every run in the deployment bills one account — see
`claidor-on-rakazo.md`.

**Whether you want password recovery.** This one is easy to skip and annoying
to discover later. Forgotten-password recovery only appears on the sign-in
screen when a transactional email provider is configured, and the offline email
emulator is **forcibly disabled when `NODE_ENV=production`**
(`self-host.md`, "Verification and password recovery email"). So with no SMTP,
a forgotten password is unrecoverable from the UI. Resend takes ten minutes:
host `smtp.resend.com`, username `resend`, an API key as the password.

---

## 3. Accounts and keys to have in hand

| What | Where from | Why |
|---|---|---|
| Server | Hetzner / DigitalOcean | Runs everything |
| DNS record | Wherever `claidor.com` is managed | The address |
| E2B API key | e2b.dev | Agent computers |
| Claidor token | app.claidor.com → Account → Developer → Connect the app | The model service |
| ElevenLabs key | Your Render dashboard, or elevenlabs.io | Voice |
| SMTP credentials | Resend or SES (optional) | Password recovery |

---

## Part A — The server

### A1. Create it

Ubuntu 24.04 LTS, 8 GB RAM, 4 vCPU, 80 GB disk, **your SSH key added at
creation**, not a password. Note the IP.

### A2. Point the domain

One record, wherever `claidor.com`'s DNS lives:

| Type | Name | Value |
|---|---|---|
| `A` | `app` | the server's IP |

Verify from your Mac before continuing:

```bash
dig +short app.claidor.com
```

It must print the IP. **Do not continue until it does.** Caddy proves control
of the name to get a certificate, and that fails if the name points nowhere.

### A3. A user that isn't root

```bash
ssh root@THE-IP
```

On the server:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

**Open a second terminal and verify before going further:**

```bash
ssh deploy@THE-IP
```

Continue in that window.

### A4. Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

Log out, log back in, check:

```bash
docker --version && docker compose version
```

### A5. The code

```bash
sudo mkdir -p /srv/rakazo
sudo chown deploy:deploy /srv/rakazo
git clone https://github.com/Spaire-Tech/Claidor.git /srv/rakazo
cd /srv/rakazo/rakazo
```

The repository is Claidor; the fork is the `rakazo` folder inside it. Every
command below runs from `/srv/rakazo/rakazo`.

### A6. Secrets

Generate them on the server, in the shapes their own installer uses
(`self-host-secrets.md`):

```bash
openssl rand -hex 16   # POSTGRES_PASSWORD — hex keeps it URI-safe
openssl rand -hex 32   # BETTER_AUTH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 32   # SCREEN_PROXY_SECRET
```

**Their distinctness rule, quoted:** `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`,
`SCREEN_PROXY_SECRET` and `SANDBOX_SUPERVISOR_TOKEN` "must be **independent**
random values (do not copy-paste the same secret into multiple keys)." Run
`openssl` once per key.

`POSTGRES_PASSWORD` must stay URI-safe — Compose interpolates it into
`DATABASE_URL`, and `@ : / ? # %` break it. Hex is safe, which is why theirs is
`-hex 16`.

### A7. The `.env`

```bash
cp .env.example .env
nano .env
```

Set these. Everything not listed stays as it ships.

```env
NODE_ENV=production

# The address. All three origins are the same.
RAKAZO_HOST=app.claidor.com
BETTER_AUTH_URL=https://app.claidor.com
WEB_ORIGIN=https://app.claidor.com
API_URL=https://app.claidor.com

# Who may register.
SIGNUPS_ENABLED=true
SIGNUP_ALLOWLIST=you@example.com

# Agent computers, hosted at E2B.
SANDBOX_PROVIDER=e2b
E2B_API_KEY=...

DATA_DIR=/data
RAKAZO_DEPLOY_DIR=/srv/rakazo/rakazo
RAKAZO_IMAGE_TAG=local

# Four independent values from A6.
POSTGRES_PASSWORD=...
BETTER_AUTH_SECRET=...
ENCRYPTION_KEY=...
SCREEN_PROXY_SECRET=...

# Ours.
CLAIDOR_ACCESS_TOKEN=claidor_pat_...
RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1
ELEVENLABS_API_KEY=...

# Optional, for password recovery.
SMTP_URL=smtps://resend:YOUR_RESEND_KEY@smtp.resend.com:465
EMAIL_FROM=Caisra <no-reply@claidor.com>

# Must be empty or absent in production; it is refused there anyway.
EMAIL_EMULATOR=
```

Two notes on values that look wrong and are not:

- `DATABASE_URL` in the file is ignored here. The Compose file sets it per
  service to reach the `postgres` container over a private network, overriding
  the `.env`.
- `RAKAZO_DEPLOY_DIR` names `/srv/rakazo/rakazo`, not `/srv/rakazo`. Their
  layout assumes the repository root and the app root are the same folder; ours
  nests the fork one level down. It "must equal the host path it is mounted
  from, or every relative bind mount in this file would resolve somewhere
  else," in the Compose file's own comment.

### A8. Harden the server (recommended)

`infra/compose/harden-host.sh` disables SSH passwords and root login,
rate-limits SSH, allows only SSH/HTTP/HTTPS through UFW, and enables fail2ban,
unattended security updates, AppArmor and audit rules.

```bash
sudo DEPLOY_USER=deploy bash infra/compose/harden-host.sh
```

**Keep your provider's web console open until a fresh SSH login succeeds after
this runs.** It reloads SSH, and the console is the way back in if it locks you
out. Their own instruction, and worth obeying.

### A9. Build and start

```bash
docker compose --env-file .env -f infra/compose/docker-compose.prod.yml \
  build --build-arg GIT_SHA=$(git rev-parse HEAD)

docker compose --env-file .env -f infra/compose/docker-compose.prod.yml \
  up -d --wait --pull never
```

The build compiles the whole monorepo. Allow fifteen minutes of silence.

`--pull never` is deliberate and not a shortcut: the image tag is `local`,
which no registry serves, so a pull would fail. The Compose file's own comment
explains the choice.

`--wait` does not return until the API reports healthy. The API's start command
is `prisma migrate deploy && pnpm --filter @rakazo/api start`, so the schema —
including our `defaultVoiceId` migration, which has never been applied anywhere
— is created before it serves, and a migration failure keeps health red rather
than silently starting.

### A10. Verify

```bash
curl --fail https://app.claidor.com/health
```

Then open **https://app.claidor.com** in a browser. The first account
registered becomes the deployment owner — make it yours before anyone else's.

Confirm the pieces individually:

- **Model.** Send a message. If it fails, `dc logs -f api` and read the
  provider's own sentence in the error.
- **Voice.** Settings → Voice should list ElevenLabs voices. If it says voice
  is not configured, the key is missing or wrong; `voice.status` reports
  `configured: false` rather than offering a form.
- **Computers.** `self-host-sandbox-providers.md` says to confirm `sandbox`
  equals the intended provider through the health output rather than assuming.

---

## Part B — How someone connects

Three ways in. All three point at the same address.

### B1. A browser

Send the link. They sign up, if their address is on the allowlist.

This is the ten-second demo, and it is the reason to keep the web app even
though the product is app-first: nobody installs 200 MB before they have seen a
screen.

### B2. The Mac app

The desktop app's first-run screen (`apps/desktop/src/setup.html`) offers two
choices: **This computer** and **Existing instance**. Existing instance takes a
URL — its placeholder is literally `https://rakazo.example.com`. Enter
`https://app.claidor.com` and the app is a window onto your deployment.
`setup-config.ts` accepts any host for `existing`, and restricts `new` to
loopback.

Building it, from `/srv/rakazo/rakazo` or your Mac:

```bash
pnpm --filter @rakazo/desktop pack
```

**Unsigned, it will fight the person you give it to.** macOS refuses to open an
app from an unidentified developer on a double-click; they have to right-click
→ Open and confirm. For yourself that is fine. For a stranger it reads as
broken.

Signing needs an Apple Developer ID. `desktop-release.md` lists the five
repository secrets the release workflow wants: `DESKTOP_MAC_CSC_LINK`,
`DESKTOP_MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`,
`APPLE_API_KEY_P8`. With those, tagging `v<version>` on `main` builds, signs,
notarizes and publishes it. Without them, hand-built and unsigned is the
option. This is a $99/year Apple account and an afternoon, not a build.

### B3. The phone

`mobile-release.md`, quoted: "Self-hosters normally do not need to publish
their own mobile app: the Rakazo client can select a compatible server from the
sign-in screen." And from `self-host.md`: on the sign-in screen, tap **Use a
custom server** and enter the same HTTPS origin as `WEB_ORIGIN`. Changing the
server signs the device out of any previous session.

Two caveats, and the second is a product problem rather than a technical one:

1. **I have not verified that a published Rakazo app exists in the App Store.**
   Their doc asserts the capability; I read the doc, not the store.
2. **That app is Rakazo-branded.** Handing someone a competitor's app and
   telling them to type your server address into it is not a product demo. A
   Caisra-branded build means your own Expo project, your own store accounts,
   `EXPO_PUBLIC_API_URL` set in the EAS build environment, and App Store
   review. That is a real project.

So for now: browser for showing people, Mac app for yourself, phone later.

---

## Part C — Living with it

Define the long command once per session:

```bash
cd /srv/rakazo/rakazo
alias dc='docker compose --env-file .env -f infra/compose/docker-compose.prod.yml'
```

```bash
dc ps               # what is running
dc logs -f api      # follow the API
dc logs -f worker   # follow the worker
dc restart api      # restart one service
dc down             # stop everything, keep the data
```

### Deploying a change

On the `local` tag, one command rebuilds and recreates
(`self-host.md`, "Upgrade"):

```bash
cd /srv/rakazo && git pull && cd rakazo
GIT_SHA=$(git rev-parse HEAD) dc up -d --wait --pull never --build api worker web
```

`up --wait` does not report success until the new API is healthy. A failed
recreate does **not** roll back by itself; recover by rebuilding and running it
again.

### Backups

```bash
./scripts/backup.sh
```

Dumps Postgres and archives `data/` into `backups/<stamp>/`. `scripts/restore.sh`
is the other half. The state lives in two Docker volumes, `pgdata` and
`appdata`.

**`docker compose down -v` deletes all Postgres state.** Never reach for `-v`
to fix something.

---

## What will bite you

In the order I would bet on.

1. **`RAKAZO_DEPLOY_DIR`.** Their layout assumes the checkout root is the app
   root; ours nests one level. If bind mounts resolve strangely, this is why.
   The single most likely thing in this document to be wrong on first contact.
2. **DNS not propagated when Caddy first asks.** The certificate request fails
   and the site serves nothing. Fix the record, then `dc restart caddy`.
3. **The build running out of memory** on a smaller machine. It dies without
   explaining itself. This is the whole argument for 8 GB.
4. **E2B missing or out of quota.** Agents boot with no computer. Confirm the
   provider through the health output.
5. **`SIGNUP_ALLOWLIST` empty** on a public address — strangers registering and
   spending the one Claidor allowance that bills every run.
6. **No SMTP, then a forgotten password.** Recovery does not appear on the
   sign-in screen at all, and the emulator is refused in production.
7. **Reusing one random string across several secrets.** Their distinctness
   rule exists for a reason; run `openssl` once per key.

---

## What is not done

Said plainly, because the gap between "deployed" and "a product" is the part
that matters now.

- **Nothing about this has been run.** Not the deployment, not a model request
  through the Claidor connection, not a voice synthesis, not the migration.
- **The face is still Rakazo's.** The sign-up screen, the shell, the name. The
  model and voice plumbing underneath is ours; everything a person looks at is
  upstream's. That work was archived on 18 September and has not been rebuilt
  on this foundation.
- **The Mac app is unsigned** until there is an Apple Developer account.
- **There is no Caisra mobile app**, only Rakazo's client pointed at your
  server — and I have not confirmed that client is published anywhere.
- **One token pays for everyone.** Usage meters against the Claidor account
  that owns `CLAIDOR_ACCESS_TOKEN`. Fine while you are the only user and you
  are paying. A token per person is a build, and it is not started.

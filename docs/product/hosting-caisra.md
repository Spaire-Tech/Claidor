# Putting Caisra on the internet

A step-by-step runbook for deploying this fork to a single Linux server, so the
product is reachable at a real HTTPS address from any device, with nothing
installed on a laptop.

Every claim here is tied to a file in `rakazo/`. Where something has never been
run, it says so.

**Status: never executed.** This is written from
`rakazo/docs/self-host.md`, `rakazo/infra/compose/docker-compose.prod.yml` and
`rakazo/infra/compose/Caddyfile.prod`. Nobody has deployed this fork to a
server. Expect to hit something the docs do not mention, and read the error
rather than guessing — the same rule the rest of this repository runs on.

---

## Why a server and not Render

Rakazo gives every agent its own computer, and that computer is a Docker
container (`rakazo/docs/self-host.md`, "Choosing a computer provider"). Render
runs your code *inside* a container and will not let you start containers from
there, so the agents have nowhere to live.

The production stack also ships as one Compose file with five services that
talk to each other over private networks
(`infra/compose/docker-compose.prod.yml`: postgres, api, worker, web, caddy).
Splitting that into separate Render services is a rewrite, and every upstream
change would have to be re-split by hand. Upstream ships roughly 24 commits a
day.

Render stays right for the Claidor API, which is already there and is a single
Python service. It is wrong for this.

---

## What this costs and what you need first

**A server.** 8 GB RAM, 4 vCPU, 80 GB disk. The Compose file's own memory
limits add up to about 6.3 GB across the five services (2 g postgres, 1.5 g
api, 2 g worker, 512 m web, 256 m caddy), and the first build compiles the
whole monorepo on the machine, which is the heaviest moment. 4 GB may finish
the build by swapping; 8 GB will not make you find out. Roughly $20–40 a month
at Hetzner or DigitalOcean.

**A domain you control.** You own `claidor.com` already, so a subdomain costs
nothing: `caisra.claidor.com`, or whatever you prefer. This runbook writes it
as `YOUR-DOMAIN` throughout.

**An E2B account**, at e2b.dev, for the API key. This is the one third-party
signup, and here is exactly why it is needed: the production Compose file runs
no sandbox supervisor, on purpose — `self-host.md` says it "uses E2B for bot
computers, so the VM never exposes a Docker supervisor or browser containers."
So on this stack the agents' computers run at E2B rather than on your server.
`SANDBOX_PROVIDER` defaults to `e2b` in that file, and `daytona` and `box` are
the documented alternatives if you would rather use one of those.

**Your Claidor token**, from Account → Developer → Connect the app.

**Your ElevenLabs key.**

---

## Step 1 — Create the server

At Hetzner Cloud or DigitalOcean, create a machine with:

- **Ubuntu 24.04 LTS**
- **8 GB RAM, 4 vCPU, 80 GB disk**
- **Your SSH key** added during creation, not a password

Write down the IP address it gives you.

## Step 2 — Point the domain at it

In whatever manages DNS for `claidor.com`, add one record:

| Type | Name | Value |
|---|---|---|
| `A` | `caisra` | the server's IP address |

That makes `caisra.claidor.com` resolve to the server. DNS can take a few
minutes. Check it from your Mac:

```bash
dig +short caisra.claidor.com
```

It should print the IP. **Do not continue until it does** — Caddy asks Let's
Encrypt for a certificate by proving it controls that name, and that fails if
the name does not point at the server yet.

## Step 3 — Log in and make a deploy user

```bash
ssh root@THE-IP
```

Then, on the server:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

**Now open a second terminal on your Mac and prove it works before going
further:**

```bash
ssh deploy@THE-IP
```

If that logs in, keep both terminals open and continue in the new one.

## Step 4 — Harden the server (recommended, not required)

Rakazo ships a script for this. It disables SSH passwords and root login,
rate-limits SSH, closes every port but SSH/HTTP/HTTPS, and turns on fail2ban,
unattended security updates, AppArmor and audit rules
(`rakazo/infra/compose/harden-host.sh`).

Run it **after** Step 3 is verified, because it locks out root:

```bash
sudo DEPLOY_USER=deploy bash /srv/rakazo/rakazo/infra/compose/harden-host.sh
```

(You will have the checkout by Step 6; run this then, or skip it for now.)

**Keep your provider's web console open until a fresh SSH login succeeds after
this runs.** That console is the way back in if the script locks you out.

## Step 5 — Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

Log out and back in so the group takes effect, then check:

```bash
docker --version
docker compose version
```

## Step 6 — Get the code onto the server

The path matters. `/srv/rakazo` is the supported Linux layout and the default
that `RAKAZO_DEPLOY_DIR` falls back to in the Compose file.

```bash
sudo mkdir -p /srv/rakazo
sudo chown deploy:deploy /srv/rakazo
git clone https://github.com/Spaire-Tech/Claidor.git /srv/rakazo
cd /srv/rakazo/rakazo
```

Note the double name: the repository is Claidor, and the fork is the `rakazo`
folder inside it. Every command below runs from `/srv/rakazo/rakazo`.

Because of that nesting, set `RAKAZO_DEPLOY_DIR=/srv/rakazo/rakazo` in the
`.env` — it must equal the directory the Compose file is run from, or the
updater's bind mounts resolve somewhere else. This is the one place where our
layout differs from theirs, and it is the most likely thing in this runbook to
be wrong on first contact.

## Step 7 — Write the `.env`

```bash
cp .env.example .env
nano .env
```

Change these. **Generate fresh secrets for the server — do not reuse the ones
from a laptop.**

```env
NODE_ENV=production

# The public name. All three origins are the same address.
RAKAZO_HOST=caisra.claidor.com
BETTER_AUTH_URL=https://caisra.claidor.com
WEB_ORIGIN=https://caisra.claidor.com
API_URL=https://caisra.claidor.com

# Keep it private while it is yours. Only these addresses can register.
SIGNUPS_ENABLED=true
SIGNUP_ALLOWLIST=you@example.com

# Agent computers run at E2B on this stack, not on the server.
SANDBOX_PROVIDER=e2b
E2B_API_KEY=your-e2b-key

DATA_DIR=/data
RAKAZO_DEPLOY_DIR=/srv/rakazo/rakazo
RAKAZO_IMAGE_TAG=local

# Fresh secrets, server only.
POSTGRES_PASSWORD=...
BETTER_AUTH_SECRET=...
ENCRYPTION_KEY=...
SCREEN_PROXY_SECRET=...

# Ours.
CLAIDOR_ACCESS_TOKEN=claidor_pat_...
RAKAZO_OPENAI_COMPAT_ALLOW_PUBLIC=1
ELEVENLABS_API_KEY=...
```

Generate each secret on the server:

```bash
openssl rand -hex 16    # POSTGRES_PASSWORD (URL-safe: hex has no @ : / ? # %)
openssl rand -hex 32    # ENCRYPTION_KEY (must be 64 hex characters)
openssl rand -base64 36 # BETTER_AUTH_SECRET
openssl rand -base64 36 # SCREEN_PROXY_SECRET
```

`DATABASE_URL` in the file is ignored here: the Compose file sets it per
service to reach the `postgres` container over the private network, overriding
whatever the `.env` says.

## Step 8 — Build and start

```bash
cd /srv/rakazo/rakazo

docker compose --env-file .env -f infra/compose/docker-compose.prod.yml \
  build --build-arg GIT_SHA=$(git rev-parse HEAD)

docker compose --env-file .env -f infra/compose/docker-compose.prod.yml \
  up -d --wait --pull never
```

The build compiles the monorepo and takes a long time on first run — allow
fifteen minutes and do not panic at the silence. `--pull never` is deliberate:
the image tag is `local`, which no registry serves, so a pull would fail.

The API runs `prisma migrate deploy` before it starts serving
(the `command:` on the `api` service), so the database schema — including our
`defaultVoiceId` migration — is applied automatically on first boot.

## Step 9 — Check it

```bash
curl --fail https://caisra.claidor.com/health
```

Certificates are automatic: Caddy gets one from Let's Encrypt the first time
someone hits the address, which is why Step 2 had to be finished first.

Then open **https://caisra.claidor.com** in a browser, on any device, and
create your account. The first account registered becomes the deployment
owner.

## Step 10 — Living with it

All from `/srv/rakazo/rakazo`, and all needing `--env-file .env -f
infra/compose/docker-compose.prod.yml`. Define it once per session:

```bash
alias dc='docker compose --env-file .env -f infra/compose/docker-compose.prod.yml'
```

Then:

```bash
dc ps              # what is running
dc logs -f api     # follow the API's logs
dc logs -f worker  # the worker's
dc restart api     # restart one service
dc down            # stop everything (keeps data)
```

**To deploy a change you have pushed:**

```bash
cd /srv/rakazo && git pull && cd rakazo
dc build --build-arg GIT_SHA=$(git rev-parse HEAD)
dc up -d --wait --pull never
```

**Backups.** The data lives in two Docker volumes, `pgdata` and `appdata`. See
`rakazo/docs/self-host.md`, "Backup" — nothing here is a substitute for reading
that before the data matters.

---

## Where this is most likely to break

Listed because guessing at these afterwards costs more than reading them now.

1. **The nested path.** Their layout assumes the checkout root is the Compose
   root. Ours has the fork one level down, so `RAKAZO_DEPLOY_DIR` has to name
   `/srv/rakazo/rakazo` and not `/srv/rakazo`. If bind mounts resolve
   strangely, this is why.
2. **DNS not propagated when Caddy first asks.** The certificate request fails
   and the site serves nothing. Fix the record, then `dc restart caddy`.
3. **E2B.** No key, or a key without quota, means agents boot with no computer.
   `self-host-sandbox-providers.md` says to confirm the provider through the
   health output rather than assuming it.
4. **The build running out of memory** on a smaller machine. It dies without
   saying why. This is the argument for 8 GB.
5. **`SIGNUP_ALLOWLIST` left empty** on a public address, which lets anyone
   register and spend the Claidor allowance, because every run bills one
   account — see `claidor-on-rakazo.md`.

## What is still Rakazo's, not Caisra's

The model and voice plumbing is ours: one internal model service, no key
fields, ElevenLabs. Everything a person looks at — the sign-up, the shell, the
name — is still upstream's. That work was archived on 18 September and has not
been redone on this foundation.

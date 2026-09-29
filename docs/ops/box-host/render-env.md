# Connecting Render to the box servers

Settings are named `SIMEON_<NAME>` below. A variable still named
`CLAIDOR_<NAME>` on Render keeps working (the server reads both, and the
`SIMEON_` one wins when both are set), so they can be renamed one at a time.

After `setup-box-host.sh` ran on the VM, three files sit in
`/root/box-host-client/` there. Copy them to your Mac:

```
scp root@2.28.35.75:/root/box-host-client/{ca.pem,cert.pem,key.pem} ~/Desktop/box-host/
curl --cacert ~/Desktop/box-host/ca.pem --cert ~/Desktop/box-host/cert.pem --key ~/Desktop/box-host/key.pem https://box1.simeonlabs.com:2376/version
```

The `curl` must print the daemon's version JSON. If it says hostname
mismatch, the DNS record for `box1.simeonlabs.com` is not the VM's IP yet
(create the A record first; the certificate carries both the name and
the IP, so `https://2.28.35.75:2376/version` works meanwhile and
`SIMEON_BOX_DOCKER_HOST` may name the IP instead).

## If the API says "CA cert does not include key usage extension"

The first real run failed that way on every EnsureSandBox. The API runs
Python 3.14, whose TLS check is strict (`VERIFY_X509_STRICT`), and the CA the
first version of `setup-box-host.sh` made had no key-usage extension, which
curl accepts and Python refuses. The script on `main` makes a CA that passes
and replaces an old one when it runs. To fix a host made by the old script:

1. On the VM, run `setup-box-host.sh` from `main` again with the same four
   variables. It prints "the existing CA has no key usage extension; making
   a new one", restarts Docker on the new certificates and rewrites the
   firewall rules as before.
2. Copy the three new files from `/root/box-host-client/` and prove them with
   the `curl … /version` above.
3. Replace the three secret files in the shared environment group with the
   new ones, and redeploy the API and the worker.

Since the same day a failure to reach the daemon is one sentence
(`sand.box.ensure.refused`), not an unhandled 500.

## On Render, the shared environment group

Put everything below in the environment
group both services read (the shared environment group of the Simeon
project on Render), not on the API service alone. Since the cloud box
sleeps when idle, the **worker** talks to the box host too: it runs the
sleeper every minute and wakes a box when a routine fires
(`polar/sand/box_tasks.py`). Settings on the API alone leave the worker
without a host, so no box ever sleeps and a sleeping box is never woken
for a routine. Render environment groups hold secret files as well as
variables.

The worker also dials the box host (port 2376, and each box's `/health`
on its published port), so its outbound addresses must be in the VM's
firewall too. Render lists them on each service's Networking tab; they
are normally the same set for every service in a region. If the worker's
list differs from the API's, add the missing ones to `RENDER_EGRESS_IPS`
and run `setup-box-host.sh` again.


Secret files (Environment → Secret Files; Render mounts them under
`/etc/secrets/`): `ca.pem`, `cert.pem`, `key.pem`.

Environment variables:

| Name | Value |
|---|---|
| `SIMEON_BOX_HOST_PROVIDER` | `docker` |
| `SIMEON_BOX_DOCKER_HOST` | `tcp://box1.simeonlabs.com:2376` |
| `SIMEON_BOX_DOCKER_TLS_CA` | `/etc/secrets/ca.pem` |
| `SIMEON_BOX_DOCKER_TLS_CERT` | `/etc/secrets/cert.pem` |
| `SIMEON_BOX_DOCKER_TLS_KEY` | `/etc/secrets/key.pem` |
| `SIMEON_BOX_HOST_BUNDLE_URL` | the public HTTPS address of the host bundle folder (below) |

Leave `SIMEON_BOX_HOST_ADDRESS` and `SIMEON_BOX_PUBLIC_URL_TEMPLATE`
empty: the API proxies the box's ports itself at `/sand-box/{id}/p/…`
and reaches them on the daemon's hostname.

Sleep, size and capacity have defaults and need nothing unless the VM
differs (`docs/services-core.md`, the cloud computer):

| Name | Default | Meaning |
|---|---|---|
| `SIMEON_BOX_IDLE_HIBERNATE_AFTER` | `PT30M` (30 minutes) | a box idle this long, with no app attached, is stopped with its files kept; `PT0S` never |
| `SIMEON_BOX_MEMORY_LIMIT_MB` | `4096` | memory per box, no swap beyond it; `0` no limit |
| `SIMEON_BOX_CPU_LIMIT` | `2.0` | CPUs per box; `0` no limit |
| `SIMEON_BOX_MAX_RUNNING` | `3` | boxes awake at once; one more is asked to wait a minute; `0` no limit |

Size `SIMEON_BOX_MAX_RUNNING` to the VM: its memory, less about 2 GB for
the system, divided by `SIMEON_BOX_MEMORY_LIMIT_MB`.

## Several box servers

`SIMEON_BOX_HOSTS` lists every server as JSON. A new person's computer is
made on the accepting server with the largest share of its limit free and
stays there for good (its files live on that server). With the list set,
`SIMEON_BOX_DOCKER_HOST` is not read.

```
[{"name": "docker", "docker_host": "tcp://box1.simeonlabs.com:2376", "accepting": false},
 {"name": "us-west-1", "docker_host": "tcp://box2.simeonlabs.com:2376", "max_running": 3}]
```

- `name`: stored on each computer made there. **The first server must stay
  `"docker"`**: that is the name every computer made before this carries.
- `max_running`: computers awake at once there (default
  `SIMEON_BOX_MAX_RUNNING`).
- `accepting: false` drains a server: it keeps the computers it has and gets
  no new one. Do not remove a server from the list while it still holds
  people's computers: a computer whose server is gone is made again,
  empty, on another one.
- `address`: only when the API reaches the published ports at another
  address than the `docker_host` name.

Every server is set up with the same certificate authority, so the three
secret files above open all of them: run `setup-box-host.sh` on the new VM
with `JOIN_CA_DIR` (the script's header says how). Put the new server's
Render outbound addresses in its firewall the same way.

## The API's size

Every message and every screen frame between an app and its computer
passes through the API (`/sand-box/{id}/p/…`). On `starter` Render runs one
worker process. A larger plan runs more (`WEB_CONCURRENCY` follows the
CPUs), and more instances can run side by side: the proxy, the migration
stream and the rate limits keep no state in one process (Redis holds it).
Each worker opens up to 15 database connections (`SIMEON_DATABASE_POOL_SIZE`
5 plus 10 overflow): workers × instances × 15, plus the worker service's,
must stay under the Postgres plan's connection limit.

## The host bundle

The cloud computers run the program the packaged app carries, published in
this layout: a folder holding `sand-host-bundle-latest.version` (a
commit id) and `sand-host-bundle-<commit>.tgz`. The server reads the pointer
at most every ten minutes, with no restart, and moves each computer to a new
version the next time it is idle.

On the Mac, after `cd desktop && npm run package`, with the `aws` command
line signed in to an account that can write the folder:

```
SIMEON_HOST_BUNDLE_S3=s3://<bucket>/host-bundles npm run publish:host-bundle
```

It refuses a build with uncommitted changes (the version is the commit).
The folder must be readable over plain HTTPS without credentials (the same
program ships inside every copy of the app, so it is not a secret);
`SIMEON_BOX_HOST_BUNDLE_URL` is that folder's address, for example
`https://<bucket>.s3.<region>.amazonaws.com/host-bundles`. A URL ending in
`.tgz` still names one fixed file, read once per process, as before.

## Then

Every app uses the cloud computer; there is no switch. Render's API log shows
`sand.box.ensure` with the box id, or `sand.box.ensure.refused` naming
what is missing. `docker ps` on the VM shows the container.

# Connecting Render to the box host (25 September 2026)

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
`CLAIDOR_BOX_DOCKER_HOST` may name the IP instead).

## On Render, the API service

Secret files (Environment → Secret Files; Render mounts them under
`/etc/secrets/`): `ca.pem`, `cert.pem`, `key.pem`.

Environment variables:

| Name | Value |
|---|---|
| `CLAIDOR_BOX_HOST_PROVIDER` | `docker` |
| `CLAIDOR_BOX_DOCKER_HOST` | `tcp://box1.simeonlabs.com:2376` |
| `CLAIDOR_BOX_DOCKER_TLS_CA` | `/etc/secrets/ca.pem` |
| `CLAIDOR_BOX_DOCKER_TLS_CERT` | `/etc/secrets/cert.pem` |
| `CLAIDOR_BOX_DOCKER_TLS_KEY` | `/etc/secrets/key.pem` |
| `CLAIDOR_BOX_HOST_BUNDLE_URL` | the S3 URL of the host bundle (below) |

Leave `CLAIDOR_BOX_HOST_ADDRESS` and `CLAIDOR_BOX_PUBLIC_URL_TEMPLATE`
empty: the API proxies the box's ports itself at `/sand-box/{id}/p/…`
and reaches them on the daemon's hostname.

## The host bundle

On the Mac, after `cd desktop && npm run package`:

```
cd desktop/dist
tar czf ~/Desktop/simeon-host-bundle.tgz host/host-main.cjs box-exec-daemon/main.cjs
```

Upload the tar to S3 (any bucket the API can read; a presigned or public
URL both work) and put its URL in `CLAIDOR_BOX_HOST_BUNDLE_URL`. The
bundle is fetched once per API process and copied into each new box.

## Then

Simeon → Settings → box runtime → remote. Render's API log shows
`sand.box.ensure` with the box id, or `sand.box.ensure.refused` naming
what is missing. `docker ps` on the VM shows the container.

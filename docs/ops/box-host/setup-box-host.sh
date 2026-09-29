#!/usr/bin/env bash
# Simeon's cloud-computer host: one-shot setup for a fresh Ubuntu 24.04 VM
# (25 September 2026; docs/services-core.md is the record).
#
# Run as root on the VM:
#   BOX_HOST_NAME=box1.simeonlabs.com BOX_HOST_IP=2.28.35.75 \
#   RENDER_EGRESS_IPS="74.220.51.0/24,74.220.59.0/24" ADMIN_SSH_IP=any \
#   bash setup-box-host.sh
#
# A second server (29 September 2026) joins the first one's certificate
# authority, so the one client certificate Render holds opens every server:
# copy /etc/docker/certs/ca.pem and ca-key.pem from the first server into a
# folder here and add JOIN_CA_DIR=/that/folder. The server certificate is
# then signed by that CA and no new client files are made; Render needs
# only the new server in SIMEON_BOX_HOSTS (render-env.md).
#
# ADMIN_SSH_IP is the address you SSH from, or `any` to leave SSH open to
# every address with key login only (password login is turned off when
# root already has a key, never before). Safe to run again: every rule,
# the Docker ones included, is rewritten from these variables.
#
# What it does, in order: installs Docker, issues a CA + server + client
# certificate (SAN carries the hostname AND the IP, so the broker can dial
# either), serves the Engine API on 2376 with client-certificate auth,
# locks the firewall to Render's egress and your SSH, pulls the box image.
# Afterwards /root/box-host-client/{ca.pem,cert.pem,key.pem} are the three
# files to put on Render as secret files (see render-env.md).
set -euo pipefail

: "${BOX_HOST_NAME:?set BOX_HOST_NAME, e.g. box1.simeonlabs.com}"
: "${BOX_HOST_IP:?set BOX_HOST_IP, the VM public IPv4}"
: "${RENDER_EGRESS_IPS:?set RENDER_EGRESS_IPS, comma-separated, from Render dashboard, the API service, Networking, Outbound}"
: "${ADMIN_SSH_IP:?set ADMIN_SSH_IP, the address you SSH from, or any for key-only SSH from anywhere}"

CERT_DIR=/etc/docker/certs
CLIENT_DIR=/root/box-host-client
# The pinned image the server runs (SIMEON_BOX_IMAGE_DIGEST's default in
# server/polar/config.py), not the moving sand-box-latest tag: the 28
# September build runs the image's own host (cloud-computer-served.md).
BOX_IMAGE=${BOX_IMAGE:-public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest@sha256:322c3a9031d61e210a05400dd74c82bbb1fdb42db315a8cf5ab39368c2f0c1c8}

echo "== 1. Docker"
apt-get update -q
apt-get install -y -q docker.io ufw openssl curl
systemctl enable --now docker
docker info --format 'engine {{.ServerVersion}} on {{.Architecture}}'

echo "== 2. Certificates (CA, server with SAN, client)"
mkdir -p "$CERT_DIR" "$CLIENT_DIR"; chmod 700 "$CERT_DIR" "$CLIENT_DIR"
cd "$CERT_DIR"
if [ -n "${JOIN_CA_DIR:-}" ]; then
  [ -f "$JOIN_CA_DIR/ca.pem" ] && [ -f "$JOIN_CA_DIR/ca-key.pem" ] || { echo "JOIN_CA_DIR needs ca.pem and ca-key.pem from the first server"; exit 1; }
  openssl x509 -in "$JOIN_CA_DIR/ca.pem" -noout -text | grep -q "X509v3 Key Usage" || { echo "the first server's CA has no key usage extension; run this script on it again first"; exit 1; }
  cp "$JOIN_CA_DIR/ca.pem" ca.pem; cp "$JOIN_CA_DIR/ca-key.pem" ca-key.pem
  echo "joining the first server's certificate authority"
fi
# Python 3.13 and later (the API runs 3.14) verify with VERIFY_X509_STRICT,
# which refuses a CA without a key-usage extension: "CA cert does not
# include key usage extension" on every EnsureSandBox, while curl accepted
# the same files (measured 28 September 2026). So the CA carries
# basicConstraints and keyUsage, the two leaves carry theirs and the key
# identifiers, and a CA made by an earlier run of this script, which has
# no key usage, is replaced. Replacing the CA means the three client files
# change: put the new ones on Render.
if [ -f ca.pem ] && ! openssl x509 -in ca.pem -noout -text | grep -q "X509v3 Key Usage"; then
  echo "the existing CA has no key usage extension; making a new one"
  rm -f ca.pem ca-key.pem ca.srl
fi
if [ ! -f ca.pem ]; then
  openssl genrsa -out ca-key.pem 4096
  openssl req -new -x509 -days 3650 -key ca-key.pem -sha256 -subj "/CN=simeon-box-host-ca" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash" \
    -out ca.pem
fi
openssl genrsa -out server-key.pem 4096
openssl req -subj "/CN=$BOX_HOST_NAME" -sha256 -new -key server-key.pem -out server.csr
printf 'basicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature,keyEncipherment\nsubjectAltName = DNS:%s,IP:%s,IP:127.0.0.1\nextendedKeyUsage = serverAuth\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid,issuer\n' "$BOX_HOST_NAME" "$BOX_HOST_IP" > server-ext.cnf
openssl x509 -req -days 3650 -sha256 -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem -extfile server-ext.cnf
if [ -z "${JOIN_CA_DIR:-}" ]; then
  openssl genrsa -out "$CLIENT_DIR/key.pem" 4096
  openssl req -subj '/CN=simeon-api' -new -key "$CLIENT_DIR/key.pem" -out client.csr
  printf 'basicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature,keyEncipherment\nextendedKeyUsage = clientAuth\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid,issuer\n' > client-ext.cnf
  openssl x509 -req -days 3650 -sha256 -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out "$CLIENT_DIR/cert.pem" -extfile client-ext.cnf
  cp ca.pem "$CLIENT_DIR/ca.pem"
  chmod 600 "$CLIENT_DIR"/key.pem
fi
rm -f server.csr client.csr server-ext.cnf client-ext.cnf
chmod 600 "$CERT_DIR"/*-key.pem

echo "== 3. Engine API on 2376 with client-certificate auth"
cat > /etc/docker/daemon.json <<EOF
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"],
  "tlsverify": true,
  "tlscacert": "$CERT_DIR/ca.pem",
  "tlscert": "$CERT_DIR/server-cert.pem",
  "tlskey": "$CERT_DIR/server-key.pem",
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
EOF
# Ubuntu's unit passes -H fd://, which conflicts with "hosts" in daemon.json.
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/override.conf <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd --containerd=/run/containerd/containerd.sock
EOF
systemctl daemon-reload
systemctl restart docker
sleep 2
ss -ltnp | grep -q ':2376' && echo "daemon listening on 2376"

echo "== 4. Firewall: SSH, 2376 and the boxes' ports from Render only"
IFS=',' read -ra RENDER <<< "$RENDER_EGRESS_IPS"
EXT_IF=$(ip route show default | awk '{print $5; exit}')
[ -n "$EXT_IF" ] || { echo "no default route: cannot name the public interface"; exit 1; }
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
if [ "$ADMIN_SSH_IP" = "any" ] || [ "$ADMIN_SSH_IP" = "0.0.0.0/0" ]; then
  ufw allow 22/tcp
else
  ufw allow from "$ADMIN_SSH_IP" to any port 22 proto tcp
fi
for ip in "${RENDER[@]}"; do
  ip=$(echo "$ip" | tr -d ' ')
  ufw allow from "$ip" to any port 2376 proto tcp
done
# Docker publishes a container's ports through FORWARD, before ufw's own
# rules, so `ufw allow` never governed them: without this block every box
# port answered from anywhere. DOCKER-USER is the chain Docker leaves to
# us and never flushes. It lives in ufw's after.rules, between markers,
# and any earlier copy is removed first, so a second run writes it afresh
# instead of losing or doubling it. Packets from the containers
# themselves (their replies and their own traffic out) are not touched:
# only new connections arriving on the public interface are checked.
sed -i '/^# BEGIN simeon-box-host DOCKER-USER$/,/^# END simeon-box-host DOCKER-USER$/d' /etc/ufw/after.rules
{
  echo "# BEGIN simeon-box-host DOCKER-USER"
  echo "*filter"
  echo ":DOCKER-USER - [0:0]"
  echo "-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN"
  for ip in "${RENDER[@]}"; do
    ip=$(echo "$ip" | tr -d ' ')
    echo "-A DOCKER-USER -i $EXT_IF -s $ip -j RETURN"
  done
  echo "-A DOCKER-USER -i $EXT_IF -j DROP"
  echo "-A DOCKER-USER -j RETURN"
  echo "COMMIT"
  echo "# END simeon-box-host DOCKER-USER"
} >> /etc/ufw/after.rules
ufw --force enable
ufw status numbered
iptables -S DOCKER-USER

if [ -s /root/.ssh/authorized_keys ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' \
    > /etc/ssh/sshd_config.d/10-simeon-keys-only.conf
  systemctl reload ssh || systemctl reload sshd
  echo "SSH: key login only"
else
  echo "SSH: root has no key in /root/.ssh/authorized_keys; password login left on"
fi

echo "== 5. The box image, pulled once so the first EnsureSandBox does not wait on it"
docker pull "$BOX_IMAGE"

echo
if [ -n "${JOIN_CA_DIR:-}" ]; then
  echo "Done. This server trusts the client certificate Render already holds."
  echo "Add it to SIMEON_BOX_HOSTS on Render (render-env.md), then prove it from Render's Shell:"
  echo "  curl --cacert /etc/secrets/ca.pem --cert /etc/secrets/cert.pem --key /etc/secrets/key.pem https://$BOX_HOST_NAME:2376/version"
else
  echo "Done. Copy these three files to your Mac and add them on Render as secret files:"
  ls -la "$CLIENT_DIR"
  echo
  echo "Prove it from your Mac (after scp of $CLIENT_DIR):"
  echo "  curl --cacert ca.pem --cert cert.pem --key key.pem https://$BOX_HOST_NAME:2376/version"
fi

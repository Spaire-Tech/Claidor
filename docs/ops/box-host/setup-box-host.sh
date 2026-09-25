#!/usr/bin/env bash
# Simeon's cloud-computer host: one-shot setup for a fresh Ubuntu 24.04 VM
# (25 September 2026; docs/product/cloud-computer-served.md is the record).
#
# Run as root on the VM:
#   BOX_HOST_NAME=box1.simeonlabs.com BOX_HOST_IP=2.28.35.75 \
#   RENDER_EGRESS_IPS="1.2.3.4,5.6.7.8" ADMIN_SSH_IP="<your Mac's public IP>" \
#   bash setup-box-host.sh
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
: "${ADMIN_SSH_IP:?set ADMIN_SSH_IP, the address you SSH from, or 0.0.0.0/0 to leave SSH open}"

CERT_DIR=/etc/docker/certs
CLIENT_DIR=/root/box-host-client
BOX_IMAGE=${BOX_IMAGE:-public.ecr.aws/k0i0n2g5/cursorenvironments/universal:sand-box-latest}

echo "== 1. Docker"
apt-get update -q
apt-get install -y -q docker.io ufw openssl curl
systemctl enable --now docker
docker info --format 'engine {{.ServerVersion}} on {{.Architecture}}'

echo "== 2. Certificates (CA, server with SAN, client)"
mkdir -p "$CERT_DIR" "$CLIENT_DIR"; chmod 700 "$CERT_DIR" "$CLIENT_DIR"
cd "$CERT_DIR"
if [ ! -f ca.pem ]; then
  openssl genrsa -out ca-key.pem 4096
  openssl req -new -x509 -days 3650 -key ca-key.pem -sha256 -subj "/CN=simeon-box-host-ca" -out ca.pem
fi
openssl genrsa -out server-key.pem 4096
openssl req -subj "/CN=$BOX_HOST_NAME" -sha256 -new -key server-key.pem -out server.csr
printf 'subjectAltName = DNS:%s,IP:%s,IP:127.0.0.1\nextendedKeyUsage = serverAuth\n' "$BOX_HOST_NAME" "$BOX_HOST_IP" > server-ext.cnf
openssl x509 -req -days 3650 -sha256 -in server.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out server-cert.pem -extfile server-ext.cnf
openssl genrsa -out "$CLIENT_DIR/key.pem" 4096
openssl req -subj '/CN=simeon-api' -new -key "$CLIENT_DIR/key.pem" -out client.csr
printf 'extendedKeyUsage = clientAuth\n' > client-ext.cnf
openssl x509 -req -days 3650 -sha256 -in client.csr -CA ca.pem -CAkey ca-key.pem -CAcreateserial -out "$CLIENT_DIR/cert.pem" -extfile client-ext.cnf
cp ca.pem "$CLIENT_DIR/ca.pem"
rm -f server.csr client.csr server-ext.cnf client-ext.cnf
chmod 600 "$CERT_DIR"/*-key.pem "$CLIENT_DIR"/key.pem

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

echo "== 4. Firewall: SSH from you, 2376 and the published ports from Render only"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$ADMIN_SSH_IP" to any port 22 proto tcp
IFS=',' read -ra RENDER <<< "$RENDER_EGRESS_IPS"
for ip in "${RENDER[@]}"; do
  ip=$(echo "$ip" | tr -d ' ')
  ufw allow from "$ip" to any port 2376 proto tcp
  ufw allow from "$ip" to any port 32768:60999 proto tcp
done
ufw --force enable
ufw status numbered

echo "== 5. The box image, pulled once so the first EnsureSandBox does not wait on it"
docker pull "$BOX_IMAGE"

echo
echo "Done. Copy these three files to your Mac and add them on Render as secret files:"
ls -la "$CLIENT_DIR"
echo
echo "Prove it from your Mac (after scp of $CLIENT_DIR):"
echo "  curl --cacert ca.pem --cert cert.pem --key key.pem https://$BOX_HOST_NAME:2376/version"

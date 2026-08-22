#!/usr/bin/env bash

cd "$(dirname "$0")/.." || exit 1

set -euo pipefail

EC2_HOST="ec2-100-55-4-105.compute-1.amazonaws.com"
EC2_USER="ec2-user"
EC2_KEY="../keys/prometheus_key.pem"
REMOTE_APP="/home/ec2-user/staging.tituah"
PM2_NAME="tituah-staging"
APP_PORT="4080"
FIREBASE_KEY="/home/ec2-user/keys/tituah-fbd2a-firebase-adminsdk-fbsvc-ca0d3ca3a5.json"
DOMAIN="staging.tituah.samirrodriguez.click"
NGINX_CONF_LOCAL="scripts/nginx/staging.tituah.samirrodriguez.click.conf"
NGINX_CONF_REMOTE="/etc/nginx/conf.d/staging.tituah.samirrodriguez.click.conf"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"

if [[ ! -f "$EC2_KEY" ]]; then
  echo "Deploy key not found at $EC2_KEY" >&2
  exit 1
fi

echo "🚀 Preparing staging app at $REMOTE_APP..."
ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" \
  "mkdir -p \"$REMOTE_APP/server\" \"$REMOTE_APP/shared\""

echo "📦 Uploading server + shared source..."
export COPYFILE_DISABLE=1

REMOTE_PKG="$(mktemp -t tituah-staging-pkg-XXXXXX).json"
cat > "$REMOTE_PKG" << EOF
{
  "name": "tituah-staging",
  "private": true,
  "workspaces": ["server", "shared"]
}
EOF
scp -i "$EC2_KEY" "$REMOTE_PKG" "$EC2_USER@$EC2_HOST:$REMOTE_APP/package.json"
rm -f "$REMOTE_PKG"

scp -i "$EC2_KEY" \
  server/package.json \
  server/tsconfig.json \
  "$EC2_USER@$EC2_HOST:$REMOTE_APP/server/"

scp -i "$EC2_KEY" \
  shared/package.json \
  shared/tsconfig.json \
  "$EC2_USER@$EC2_HOST:$REMOTE_APP/shared/"

SERVER_TARBALL="$(mktemp -t tituah-staging-server-XXXXXX).tar.gz"
tar -C server -czf "$SERVER_TARBALL" \
  --exclude='._*' \
  --exclude='.DS_Store' \
  src
scp -i "$EC2_KEY" "$SERVER_TARBALL" "$EC2_USER@$EC2_HOST:$REMOTE_APP/server/src-deploy.tar.gz"
rm -f "$SERVER_TARBALL"

SHARED_TARBALL="$(mktemp -t tituah-staging-shared-XXXXXX).tar.gz"
tar -C shared -czf "$SHARED_TARBALL" \
  --exclude='._*' \
  --exclude='.DS_Store' \
  src
scp -i "$EC2_KEY" "$SHARED_TARBALL" "$EC2_USER@$EC2_HOST:$REMOTE_APP/shared/src-deploy.tar.gz"
rm -f "$SHARED_TARBALL"

ECOSYSTEM_LOCAL="$(mktemp -t tituah-staging-eco-XXXXXX).cjs"
cat > "$ECOSYSTEM_LOCAL" << EOF
module.exports = {
  apps: [
    {
      name: "${PM2_NAME}",
      cwd: "${REMOTE_APP}",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "server/src/index.ts",
      env: {
        NODE_ENV: "production",
        PORT: "${APP_PORT}",
        FIREBASE_PROJECT_ID: "tituah-fbd2a",
        GOOGLE_APPLICATION_CREDENTIALS: "${FIREBASE_KEY}",
      },
      max_memory_restart: "300M",
      autorestart: true,
    },
  ],
};
EOF
scp -i "$EC2_KEY" "$ECOSYSTEM_LOCAL" "$EC2_USER@$EC2_HOST:$REMOTE_APP/ecosystem.config.cjs"
rm -f "$ECOSYSTEM_LOCAL"

echo "📥 Installing deps + starting PM2 ($PM2_NAME on :$APP_PORT)..."
ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" << EOF
set -euo pipefail
cd "$REMOTE_APP"

tar -xzf server/src-deploy.tar.gz -C server
rm -f server/src-deploy.tar.gz
tar -xzf shared/src-deploy.tar.gz -C shared
rm -f shared/src-deploy.tar.gz

export NVM_DIR="\$HOME/.nvm"
# shellcheck disable=SC1091
[[ -s "\$NVM_DIR/nvm.sh" ]] && . "\$NVM_DIR/nvm.sh"

npm install --omit=dev --workspaces --include-workspace-root

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 delete "$PM2_NAME"
fi
pm2 start "$REMOTE_APP/ecosystem.config.cjs"
pm2 save
pm2 show "$PM2_NAME" | head -40
EOF

echo "🌐 Ensuring nginx + TLS for $DOMAIN..."
ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" "test -d \"$CERT_DIR\"" && CERT_EXISTS=true || CERT_EXISTS=false

if [[ "$CERT_EXISTS" == true ]]; then
  echo "   Certificate already exists — not overwriting nginx (certbot owns SSL blocks)."
else
  echo "   First-time setup: installing HTTP nginx config and requesting a certificate..."
  scp -i "$EC2_KEY" "$NGINX_CONF_LOCAL" "$EC2_USER@$EC2_HOST:/tmp/staging.tituah.samirrodriguez.click.conf"
  ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" << EOF
set -euo pipefail
sudo mkdir -p /var/www/staging.tituah.samirrodriguez.click
sudo install -m 644 /tmp/staging.tituah.samirrodriguez.click.conf "$NGINX_CONF_REMOTE"
rm -f /tmp/staging.tituah.samirrodriguez.click.conf
sudo nginx -t
sudo systemctl restart nginx

if ! sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --register-unsafely-without-email; then
  echo "⚠️  certbot could not issue a certificate yet."
  echo "   Add a DNS A record: $DOMAIN → 100.55.4.105"
  echo "   Wait for it to resolve, then run:"
  echo "   sudo certbot --nginx -d $DOMAIN"
fi
EOF
fi

echo "✅ Staging server publish complete"
echo "   App dir: $REMOTE_APP"
echo "   PM2:     $PM2_NAME (port $APP_PORT)"
echo "   Site:    https://$DOMAIN"
echo "   WS:      wss://$DOMAIN/ws"

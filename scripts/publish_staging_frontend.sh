#!/usr/bin/env bash

cd "$(dirname "$0")/.." || exit 1

set -euo pipefail

EC2_HOST="ec2-100-55-4-105.compute-1.amazonaws.com"
EC2_USER="ec2-user"
EC2_KEY="../keys/prometheus_key.pem"
REMOTE_APP="/home/ec2-user/staging.tituah"
REMOTE_WWW="/var/www/staging.tituah.samirrodriguez.click"
REMOTE_TAR="$REMOTE_APP/frontend-deploy.tar.gz"

if [[ ! -f "$EC2_KEY" ]]; then
  echo "Deploy key not found at $EC2_KEY" >&2
  exit 1
fi

if [[ ! -d client/dist ]]; then
  echo "No client build found (client/dist missing)." >&2
  echo "Run deploy_staging.sh (or npm run build -w client) first." >&2
  exit 1
fi

echo "📦 Creating client/dist tarball..."
export COPYFILE_DISABLE=1
FRONTEND_TARBALL="$(mktemp -t tituah-staging-frontend-XXXXXX).tar.gz"
tar -C client/dist \
  --exclude='._*' \
  --exclude='.DS_Store' \
  -czf "$FRONTEND_TARBALL" .
echo "   dist tarball: $(du -h "$FRONTEND_TARBALL" | awk '{print $1}')"

echo "🚀 Preparing remote dirs..."
ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" \
  "mkdir -p \"$REMOTE_APP\" && sudo mkdir -p \"$REMOTE_WWW\""

echo "🚀 Uploading frontend build..."
scp -i "$EC2_KEY" "$FRONTEND_TARBALL" "$EC2_USER@$EC2_HOST:$REMOTE_TAR"
rm -f "$FRONTEND_TARBALL"

ssh -i "$EC2_KEY" "$EC2_USER@$EC2_HOST" << EOF
set -euo pipefail
TMPDIR=\$(mktemp -d)
tar -xzf "$REMOTE_TAR" -C "\$TMPDIR"
rm -f "$REMOTE_TAR"
# nginx cannot read /home/ec2-user — publish to /var/www
sudo rsync -a --delete "\$TMPDIR"/ "$REMOTE_WWW"/
sudo chown -R nginx:nginx "$REMOTE_WWW"
rm -rf "\$TMPDIR"
mkdir -p "$REMOTE_APP/client/dist"
sudo rsync -a --delete "$REMOTE_WWW"/ "$REMOTE_APP/client/dist"/
sudo chown -R ec2-user:ec2-user "$REMOTE_APP/client"
EOF

echo "✅ Staging frontend deployed → $REMOTE_WWW"
echo "🌍 Next: publish server (PM2) via deploy script"

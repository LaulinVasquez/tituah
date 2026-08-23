#!/usr/bin/env bash

cd "$(dirname "$0")/.." || exit 1

set -euo pipefail

COMMIT_MESSAGE=""
SKIP_COMMIT=false
DEPLOY_KEY="../keys/prometheus_key.pem"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-commit)
      SKIP_COMMIT=true
      shift
      ;;
    *)
      COMMIT_MESSAGE="$1"
      shift
      ;;
  esac
done

COMMIT_MESSAGE="${COMMIT_MESSAGE:-Deploy staging $(date -u +%Y-%m-%dT%H:%M:%SZ)}"

echo "==> Typechecking..."
npm run typecheck

echo "==> Building client for staging..."
npm run build -w client

echo "==> Committing and pushing to GitHub..."
if [[ "$SKIP_COMMIT" == true ]]; then
  echo "Skipping git commit/push (--no-commit)."
elif [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "$(cat <<EOF
$COMMIT_MESSAGE
EOF
)"
  if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git push
  else
    echo "No upstream branch — skipped git push."
  fi
  echo "Committed local changes."
else
  echo "No local changes to commit. Skipping git commit/push."
fi

if [[ ! -f "$DEPLOY_KEY" ]]; then
  echo "Deploy key not found at $DEPLOY_KEY" >&2
  exit 1
fi

echo "==> Publishing frontend (static Vite build)..."
bash scripts/publish_staging_frontend.sh

echo "==> Publishing game server (PM2) + nginx/TLS..."
bash scripts/publish_staging_server.sh

echo "✅ Staging deploy complete"
echo "   App:  /home/ec2-user/staging.tituah (WS) + /var/www/staging.tituah.samirrodriguez.click (static)"
echo "   WS:   PM2 tituah-staging → :4080"
echo "   Site: https://staging.tituah.samirrodriguez.click"

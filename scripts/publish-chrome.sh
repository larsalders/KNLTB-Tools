#!/usr/bin/env bash
# Upload (and optionally submit) the extension to the Chrome Web Store.
#
# Uploading replaces the draft attached to the store listing and is reversible —
# you can overwrite a draft as often as you like. Submitting for review is the
# outward-facing step, so it requires an explicit --publish flag.
#
# Usage:
#   scripts/publish-chrome.sh                 # upload the draft only
#   scripts/publish-chrome.sh --publish       # upload, then submit for review
#   scripts/publish-chrome.sh --zip path.zip  # upload a specific package
#
# Credentials come from the environment (see docs/chrome-web-store.md). The first
# of these that is set wins:
#   CWS_SERVICE_ACCOUNT_KEY  path to a service account JSON key  (preferred)
#   CWS_ACCESS_TOKEN         a token you already obtained, e.g. via gcloud
#   CWS_CLIENT_ID + CWS_CLIENT_SECRET + CWS_REFRESH_TOKEN       (older OAuth flow)
#   CWS_EXTENSION_ID         optional, defaults to the published KNLTB Tools item

set -euo pipefail
cd "$(dirname "$0")/.."

EXTENSION_ID="${CWS_EXTENSION_ID:-emmhdkcchcmgbpflohecdllhollepalh}"
PUBLISH=0
ZIP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish) PUBLISH=1; shift ;;
    --zip) ZIP="$2"; shift 2 ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "${CWS_SERVICE_ACCOUNT_KEY:-}" && -z "${CWS_ACCESS_TOKEN:-}" && -z "${CWS_CLIENT_ID:-}" ]]; then
  cat >&2 <<'MSG'
ERROR: no Chrome Web Store credentials found. Set one of:

  CWS_SERVICE_ACCOUNT_KEY=/path/to/key.json     (service account — preferred)
  CWS_ACCESS_TOKEN=ya29....                     (token obtained elsewhere)
  CWS_CLIENT_ID + CWS_CLIENT_SECRET + CWS_REFRESH_TOKEN

See docs/chrome-web-store.md for the one-time setup.
MSG
  exit 1
fi

if [[ -z "$ZIP" ]]; then
  VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
  ZIP="dist/knltb-tools-${VERSION}.zip"
  [[ -f "$ZIP" ]] || { echo "Package not found: $ZIP — run scripts/package.sh first." >&2; exit 1; }
fi

jqf() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1',''))"; }

echo "Extension: $EXTENSION_ID"
echo "Package:   $ZIP"

# 1. Obtain a short-lived access token
if [[ -n "${CWS_SERVICE_ACCOUNT_KEY:-}" ]]; then
  echo "Auth:      service account"
  [[ -f "$CWS_SERVICE_ACCOUNT_KEY" ]] || {
    echo "ERROR: service account key not found: $CWS_SERVICE_ACCOUNT_KEY" >&2; exit 1; }
  JWT=$("$(dirname "$0")/cws-jwt.py" "$CWS_SERVICE_ACCOUNT_KEY") || exit 1
  TOKEN_RESPONSE=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
    --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" \
    --data-urlencode "assertion=${JWT}")
elif [[ -n "${CWS_ACCESS_TOKEN:-}" ]]; then
  echo "Auth:      preset access token"
  TOKEN_RESPONSE=""
else
  echo "Auth:      OAuth refresh token"
  for var in CWS_CLIENT_SECRET CWS_REFRESH_TOKEN; do
    [[ -n "${!var:-}" ]] || { echo "ERROR: $var is not set." >&2; exit 1; }
  done
  TOKEN_RESPONSE=$(curl -s -X POST "https://oauth2.googleapis.com/token" \
    -d "client_id=${CWS_CLIENT_ID}" \
    -d "client_secret=${CWS_CLIENT_SECRET}" \
    -d "refresh_token=${CWS_REFRESH_TOKEN}" \
    -d "grant_type=refresh_token")
fi

if [[ -n "${CWS_ACCESS_TOKEN:-}" && -z "$TOKEN_RESPONSE" ]]; then
  ACCESS_TOKEN="$CWS_ACCESS_TOKEN"
else
  ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jqf access_token)
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "ERROR: could not obtain an access token." >&2
  # Surface Google's own reason — "invalid_grant" here usually means the service
  # account has not been added under Account in the Developer Dashboard yet.
  echo "$TOKEN_RESPONSE" | python3 -m json.tool >&2 2>/dev/null || echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

# 2. Upload the package as the item's draft
echo "Uploading…"
UPLOAD=$(curl -s -X PUT \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}")

STATE=$(echo "$UPLOAD" | jqf uploadState)
if [[ "$STATE" != "SUCCESS" ]]; then
  echo "Upload failed (uploadState=$STATE):" >&2
  echo "$UPLOAD" | python3 -m json.tool >&2 || echo "$UPLOAD" >&2
  exit 1
fi
echo "Upload OK — draft updated."

if [[ $PUBLISH -eq 0 ]]; then
  echo
  echo "Draft only. Review it at:"
  echo "  https://chrome.google.com/webstore/devconsole/"
  echo "Re-run with --publish to submit for review."
  exit 0
fi

# 3. Submit for review. Google reviews before it goes live; this is not instant.
echo "Submitting for review…"
PUB=$(curl -s -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-goog-api-version: 2" \
  -H "Content-Length: 0" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish")

echo "$PUB" | python3 -m json.tool 2>/dev/null || echo "$PUB"

if echo "$PUB" | grep -q "OK\|IN_REVIEW\|PUBLISHED"; then
  echo
  echo "Submitted. Google's review typically takes hours to a few days;"
  echo "the listing updates automatically once it passes."
else
  echo "Publish call did not report success — check the output above." >&2
  exit 1
fi

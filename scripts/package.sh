#!/usr/bin/env bash
# Build the Chrome Web Store upload package.
#
# The file list is derived from manifest.json rather than hardcoded, so a script
# added to a content_scripts block is packaged automatically and a removed one
# stops shipping. Nothing outside the manifest (README, assets, tmp, the Safari
# converter command) ends up in the zip.
#
# Usage: scripts/package.sh
# Output: dist/knltb-tools-<version>.zip

set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="dist/knltb-tools-${VERSION}.zip"

# Collect every path the manifest references, plus the manifest itself.
# Read loop rather than mapfile: macOS ships bash 3.2, which has no mapfile.
FILES=()
while IFS= read -r _line; do
  [[ -n "$_line" ]] && FILES+=("$_line")
done < <(python3 - <<'PY'
import json
m = json.load(open('manifest.json'))
files = {'manifest.json'}
icon = m.get('action', {}).get('default_icon')
if isinstance(icon, str):
    files.add(icon)
elif isinstance(icon, dict):
    files.update(icon.values())
for key in ('icons',):
    files.update((m.get(key) or {}).values())
for cs in m.get('content_scripts', []):
    files.update(cs.get('js', []))
    files.update(cs.get('css', []))
for res in m.get('web_accessible_resources', []):
    files.update(res.get('resources', []))
bg = m.get('background', {})
if bg.get('service_worker'):
    files.add(bg['service_worker'])
for f in sorted(files):
    print(f)
PY
)

missing=0
for f in "${FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: manifest references missing file: $f" >&2
    missing=1
  fi
done
[[ $missing -eq 0 ]] || exit 1

mkdir -p dist
rm -f "$OUT"
# -X drops extended attributes / resource forks that macOS would otherwise add
zip -q -X "$OUT" "${FILES[@]}"

echo "Packaged ${#FILES[@]} files -> $OUT"
for f in "${FILES[@]}"; do echo "  $f"; done
echo
echo "Version: $VERSION"
echo "Size:    $(du -h "$OUT" | cut -f1)"

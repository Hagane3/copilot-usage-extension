#!/usr/bin/env bash
# Launch Extension Development Host from terminal (works when F5 does nothing on macOS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -x "$ROOT/node_modules/.bin/tsc" ]]; then
  echo "Missing node_modules — run: npm install"
  exit 1
fi

echo "Compiling…"
"$ROOT/node_modules/.bin/tsc" -p tsconfig.json

if [[ ! -d "$ROOT/dev-fixtures/workspaceStorage" ]] || [[ -z "$(ls -A "$ROOT/dev-fixtures/workspaceStorage" 2>/dev/null)" ]]; then
  echo "Generating dev fixtures…"
  node "$ROOT/scripts/generateDevFixtures.js"
fi

pick_cli() {
  if command -v code >/dev/null 2>&1; then
    echo code
    return
  fi
  if [[ -x "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]]; then
    echo "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
    return
  fi
  if command -v cursor >/dev/null 2>&1; then
    echo cursor
    return
  fi
  if [[ -x "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" ]]; then
    echo "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    return
  fi
  return 1
}

CLI="$(pick_cli)" || {
  echo "Could not find 'code' or 'cursor' CLI."
  echo "In VS Code: Cmd+Shift+P → 'Shell Command: Install code command in PATH'"
  exit 1
}

echo "Starting Extension Development Host via: $CLI"
exec "$CLI" --extensionDevelopmentPath="$ROOT" "$ROOT"

#!/usr/bin/env bash
set -eo pipefail

PLATFORM="${1:-all}"

npm run build
tsc -p electron/tsconfig.json

printf '{"type":"commonjs"}\n' > dist-electron/package.json

case "$PLATFORM" in
  linux)  electron-builder --config electron-builder.json --linux ;;
  mac)    electron-builder --config electron-builder.json --mac ;;
  win)    electron-builder --config electron-builder.json --win ;;
  all)    electron-builder --config electron-builder.json ;;
  *)      echo "Usage: $0 [linux|mac|win|all]" >&2; exit 1 ;;
esac

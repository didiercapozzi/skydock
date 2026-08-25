#!/usr/bin/env bash
set -eo pipefail

PLATFORM="${1:-all}"

npm run build
tsc -p electron/tsconfig.json

printf '{"type":"commonjs"}\n' > dist-electron/package.json

case "$PLATFORM" in
  linux)  electron-builder --linux ;;
  mac)    electron-builder --mac ;;
  win)    electron-builder --win ;;
  all)    electron-builder ;;
  *)      echo "Usage: $0 [linux|mac|win|all]" >&2; exit 1 ;;
esac

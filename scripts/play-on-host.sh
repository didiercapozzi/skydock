#!/bin/sh
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
clip="${1:?give the clip to play}"

[ -S "${SKYDOCK_DOCKER_SOCKET:-/var/run/docker.sock}" ] || exec "${SKYDOCK_HOST_PLAYER:-xdg-open}" "$clip"

player="${SKYDOCK_HOST_PLAYER:-}"
if [ -z "$player" ]; then
  player="$("$here/host.sh" sh -c 'for p in vlc mpv celluloid totem mplayer org.videolan.VLC io.mpv.Mpv; do command -v "$p" >/dev/null 2>&1 && { printf "%s" "$p"; exit 0; }; done; printf "xdg-open"' 2>/dev/null || printf 'xdg-open')"
fi

owner="$(stat -c '%u:%g' "$here/.." 2>/dev/null || echo '')"
if [ -n "$owner" ]; then
  chown "$owner" "$clip" 2>/dev/null || true
fi

exec "$here/host.sh" --detach "$player" "$clip"

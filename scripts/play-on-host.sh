#!/bin/sh
# Playing a clip, from the container, on the machine around it.
#
# SkyDock runs in the development container, which has no video player and no screen of its own.
# `scripts/host.sh` can start one over there, so this hands the clip to it. Point SkyDock at this
# and nothing else changes:
#
#   SKYDOCK_PLAYER_COMMAND=/workspace/scripts/play-on-host.sh npm run dev
#
# which is what `npm run dev` sets. The packaged app needs none of it: it runs where the player is,
# and asks the machine to open the clip directly.
#
#   SKYDOCK_HOST_PLAYER   what plays a clip over there (default: the first of the players below)
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
clip="${1:?give the clip to play}"

# Run somewhere that is not a container around a machine: there is no machine around it to hand the
# clip to, and whatever plays videos is simply here.
[ -S "${SKYDOCK_DOCKER_SOCKET:-/var/run/docker.sock}" ] || exec "${SKYDOCK_HOST_PLAYER:-xdg-open}" "$clip"

# A player rather than "open this with whatever opens it". `xdg-open` starts the player and returns
# at once, and what the session manager is asked to run here is a unit of its own: the moment the
# thing it started exits, everything left in that unit is stopped — which is the player, a second
# after it opened. Asked for the player itself, the unit is the player and lives as long as it does.
player="${SKYDOCK_HOST_PLAYER:-}"
if [ -z "$player" ]; then
  player="$("$here/host.sh" sh -c 'for p in vlc mpv celluloid totem mplayer org.videolan.VLC io.mpv.Mpv; do command -v "$p" >/dev/null 2>&1 && { printf "%s" "$p"; exit 0; }; done; printf "xdg-open"' 2>/dev/null || printf 'xdg-open')"
fi

# The clip is handed to whoever is at the screen. This side runs as root and the player does not:
# being allowed to read a file is not enough for a confined player — a snap or a flatpak may read
# what is in somebody's home only where that somebody owns it, whatever the mode says — and
# everything SkyDock writes in here is owned by root. Whoever owns the repo is whoever will watch
# it: it was checked out on the host, not in here.
owner="$(stat -c '%u:%g' "$here/.." 2>/dev/null || echo '')"
if [ -n "$owner" ]; then
  chown "$owner" "$clip" 2>/dev/null || true
fi

# Detached: the player is the machine's from here on, and outlives whatever asked for it.
exec "$here/host.sh" --detach "$player" "$clip"

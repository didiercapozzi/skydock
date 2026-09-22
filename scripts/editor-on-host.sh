#!/bin/sh
# Opening the editor, from the container, on the machine around it.
#
# SkyDock runs in the development container; kdenlive is installed on the machine outside, and the
# container cannot start a window there itself. `scripts/host.sh` can, so this hands the project
# over to it. Point SkyDock at this and nothing else changes:
#
#   SKYDOCK_EDITOR_COMMAND=/workspace/scripts/editor-on-host.sh npm run dev
#
# which is what `npm run dev` sets. Nothing has to be running on the host for this. The packaged app
# needs none of it: it runs where the editor is, and starts it directly.
#
#   SKYDOCK_HOST_EDITOR   what opens a project over there (default: kdenlive)
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
editor="${SKYDOCK_HOST_EDITOR:-kdenlive}"
project="${1:?give the project to open}"

# Run somewhere that is not a container around a machine: there is no machine around it to hand the
# project to, and the editor is simply here.
[ -S "${SKYDOCK_DOCKER_SOCKET:-/var/run/docker.sock}" ] || exec "$editor" "$project"

# The jump's folder is handed to whoever will be editing it. This side runs as root and the editor
# does not: an editor may decline a project belonging to somebody else however the mode reads, and
# a render that cannot write says so only at the end. Whoever owns the repo is whoever will open
# it — it was checked out on the host, not in here.
owner="$(stat -c '%u:%g' "$here/.." 2>/dev/null || echo '')"
if [ -n "$owner" ]; then
  chown -R "$owner" "$(dirname "$project")" 2>/dev/null || true
fi

# And everything the project points at that lives in the repo: its music, its logos, the proxies it
# plays from. Being allowed to read a file is not enough for a confined editor — kdenlive is a snap
# on this machine, and a snap may read what is in somebody's home only where that somebody owns it,
# whatever the mode says. Everything SkyDock writes from in here is owned by root, so the editor
# opens the project and reports the music and the logo as missing.
#
# The project names them as the machine does, so where the repo is over there is asked for, and the
# same files are found in here by the other name.
repo="$("$here/host.sh" --repo 2>/dev/null || true)"
if [ -n "$owner" ] && [ -n "$repo" ]; then
  grep -o 'name="resource">[^<]*' "$project" | sed 's/^name="resource">//;s/&amp;/\&/g' |
    while IFS= read -r asset; do
      case "$asset" in
      "$repo"/*) chown "$owner" "$here/..${asset#"$repo"}" 2>/dev/null || true ;;
      esac
    done
fi

# Detached: the editor is the machine's from here on, and outlives whatever asked for it.
exec "$here/host.sh" --detach "$editor" "$project"

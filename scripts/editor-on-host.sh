#!/bin/sh
# Opening the editor, from the container, on the machine around it.
#
# SkyDock runs in the development container; kdenlive is installed on the machine outside, and the
# container cannot start a window there itself. `scripts/host.sh` can, so this hands the project
# over to it. Point SkyDock at this and nothing else changes:
#
#   SKYDOCK_EDITOR_COMMAND=/workspace/scripts/editor-on-host.sh npm run dev
#
# which is what `npm run dev:bridge` is. Nothing has to be running on the host for this. The
# packaged app needs none of it: it runs where the editor is, and starts it directly.
#
#   SKYDOCK_HOST_EDITOR   what opens a project over there (default: kdenlive)
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
editor="${SKYDOCK_HOST_EDITOR:-kdenlive}"

# Asked what it is rather than to open something — SkyDock warns when a template was made by a
# kdenlive far from the one that will open it, and that answer has to come back from over there.
case "${1-}" in
-*)
  exec "$here/host.sh" "$editor" "$@"
  ;;
esac

project="${1:?give the project to open}"

# The jump's folder is handed to whoever will be editing it. This side runs as root and the editor
# does not: an editor may decline a project belonging to somebody else however the mode reads, and
# a render that cannot write says so only at the end. Whoever owns the repo is whoever will open
# it — it was checked out on the host, not in here.
owner="$(stat -c '%u:%g' "$here/.." 2>/dev/null || echo '')"
if [ -n "$owner" ]; then
  chown -R "$owner" "$(dirname "$project")" 2>/dev/null || true
fi

# Detached: the editor is the machine's from here on, and outlives whatever asked for it.
exec "$here/host.sh" --detach "$editor" "$project"

#!/bin/sh
# Container side of opening the editor.
#
# SkyDock runs in the development container; kdenlive is installed on the machine around it, and
# the container has no way to start it. So instead of launching anything, this writes down what
# should be opened and leaves it in a file the host can see — output/ is bind-mounted, so both
# sides are looking at the same bytes. `scripts/open-on-host.sh`, run once on the host, picks the
# line up and opens it there.
#
# Point SkyDock at this and nothing else changes:
#   SKYDOCK_EDITOR_COMMAND=/workspace/scripts/editor-bridge.sh npm run dev
#
# The packaged desktop build needs none of this: it runs where kdenlive is, and the default
# command starts it directly.
set -eu

project="$1"
queue="${SKYDOCK_EDITOR_QUEUE:-${SKYDOCK_OUTPUT_DIR:-/workspace/output}/.editor-requests}"

mkdir -p "$(dirname "$queue")"
printf '%s\n' "$project" >>"$queue"

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
watcher="$(dirname "$queue")/.editor-watcher"

mkdir -p "$(dirname "$queue")"
printf '%s\n' "$project" >>"$queue"

# Writing the line always succeeds, which is the trouble: from in here there is no way to see the
# host's processes, so a request nobody is listening for looks exactly like one that worked, and
# the board reports an editor opening that never will. The host script keeps `.editor-watcher`
# fresh while it runs, so its absence — or its age — is the one thing this side can check. Saying
# so on the way out is what turns a silence into something to act on.
if [ ! -e "$watcher" ]; then
  echo "nothing on the host is watching for it — run ./scripts/open-on-host.sh there" >&2
  exit 1
fi

if [ -n "$(find "$watcher" -mmin +2 2>/dev/null)" ]; then
  echo "the host watcher stopped checking in — is ./scripts/open-on-host.sh still running there?" >&2
  exit 1
fi

#!/bin/sh
# Host side of opening the editor. Run this once, on the machine kdenlive is installed on:
#
#   ./scripts/open-on-host.sh
#
# It watches the file the container writes to and opens each project as it arrives. Leave it
# running while you work; stop it with ctrl-c. Nothing else is needed, and the packaged desktop
# build does not need this at all.
#
#   SKYDOCK_EDITOR   what opens a project          (default: kdenlive)
#   SKYDOCK_EDITOR_QUEUE  where the requests land  (default: <repo>/output/.editor-requests)
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
queue="${SKYDOCK_EDITOR_QUEUE:-$root/output/.editor-requests}"
editor="${SKYDOCK_EDITOR:-kdenlive}"

if ! command -v "$editor" >/dev/null 2>&1; then
  echo "No '$editor' on this machine. Set SKYDOCK_EDITOR to what should open a project." >&2
  exit 1
fi

mkdir -p "$(dirname "$queue")"
: >>"$queue"

echo "Watching $queue"
echo "Opening with $editor — leave this running."

# -n 0: only what arrives from now on, so restarting does not reopen everything ever asked for.
tail -n 0 -F "$queue" | while IFS= read -r line; do
  [ -n "$line" ] || continue
  # The container knows the repo as /workspace; here it is wherever this script lives.
  case "$line" in
  /workspace/*) project="$root${line#/workspace}" ;;
  *) project="$line" ;;
  esac
  if [ -e "$project" ]; then
    echo "Opening $project"
    "$editor" "$project" >/dev/null 2>&1 &
  else
    echo "Asked for $project, which is not here" >&2
  fi
done

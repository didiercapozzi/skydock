#!/bin/sh
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
editor="${SKYDOCK_HOST_EDITOR:-kdenlive}"
project="${1:?give the project to open}"

[ -S "${SKYDOCK_DOCKER_SOCKET:-/var/run/docker.sock}" ] || exec "$editor" "$project"

owner="$(stat -c '%u:%g' "$here/.." 2>/dev/null || echo '')"
if [ -n "$owner" ]; then
  chown -R "$owner" "$(dirname "$project")" 2>/dev/null || true
fi

repo="$("$here/host.sh" --repo 2>/dev/null || true)"
if [ -n "$owner" ] && [ -n "$repo" ]; then
  grep -o 'name="resource">[^<]*' "$project" | sed 's/^name="resource">//;s/&amp;/\&/g' |
    while IFS= read -r asset; do
      case "$asset" in
      "$repo"/*) chown "$owner" "$here/..${asset#"$repo"}" 2>/dev/null || true ;;
      esac
    done
fi

exec "$here/host.sh" --detach "$editor" "$project"

#!/bin/sh
# Runs a command on the machine this container runs on, as the person sitting at it.
#
#   scripts/host.sh kdenlive /workspace/output/processed/…/luc_favre.kdenlive
#   scripts/host.sh --detach --env SKYDOCK_DEV_URL=http://127.0.0.1:5173 /workspace/…/SkyDock.AppImage
#
# The container cannot reach the host's desktop: a window drawn on it from in here opens and never
# loads its page. What the container does have is the machine's own docker, at
# /var/run/docker.sock. So the command is handed to a container of a moment, which shares the
# machine's namespaces, becomes whoever owns the repo — the person at the screen — and runs it
# there, on their display and their session bus. Nothing has to be installed or left running on the
# host for this.
#
# It is worth knowing what this is: through that socket the container can already do anything to
# the machine, privileged as it is. This makes it ordinary rather than possible.
#
#   --detach              start it and come back; the window outlives this command
#   --env NAME=VALUE      given to the command over there, repeatable
#
# A path the container knows as /workspace is handed over as the machine knows it, since the two
# are the same bytes under different names.
set -eu

socket="${SKYDOCK_DOCKER_SOCKET:-/var/run/docker.sock}"
detach=''
envs=''

while [ $# -gt 0 ]; do
  case "$1" in
  --detach)
    detach=1
    shift
    ;;
  --env)
    envs="$envs $2"
    shift 2
    ;;
  *) break ;;
  esac
done

[ $# -gt 0 ] || {
  echo "usage: $0 [--detach] [--env NAME=VALUE] <program> [argument...]" >&2
  exit 2
}
[ -S "$socket" ] || {
  echo "No docker socket at $socket — this container cannot reach the machine around it." >&2
  exit 1
}

api() { curl -sS --unix-socket "$socket" "$@"; }

self="$(cat /proc/sys/kernel/hostname)"
me="$(api "http://localhost/containers/$self/json")" || {
  echo "The docker socket did not answer about this container." >&2
  exit 1
}
image="$(printf '%s' "$me" | jq -r '.Image')"
repo="$(printf '%s' "$me" | jq -r '.Mounts[] | select(.Destination=="/workspace") | .Source' | head -n 1)"
[ -n "$repo" ] && [ "$repo" != "null" ] || {
  echo "This container's /workspace is not a folder of the machine's, so nothing there can be opened on it." >&2
  exit 1
}

# What runs over there, once the namespaces are the machine's own: become the owner of the repo,
# with the session they are already logged into, and hand the command their environment. Root has
# no desktop of its own, and an application started as root on somebody's session is refused by
# half of it.
inner='
set -eu
repo="$1"; display="$2"; shift 2
uid="$(stat -c %u "$repo")"
entry="$(getent passwd "$uid" || true)"
home="$(printf "%s" "$entry" | cut -d: -f6)"
[ -n "$home" ] || home="/home/$(printf "%s" "$entry" | cut -d: -f1)"

# Which screen theirs is, asked of the session itself rather than assumed: what this container was
# handed is the display of whatever started it, which need not be the one they are sitting at, and
# a window has to carry the cookie that session opens with or it is simply refused.
xauth=""
for p in /proc/[0-9]*; do
  [ -r "$p/environ" ] || continue
  [ "$(stat -c %u "$p" 2>/dev/null)" = "$uid" ] || continue
  said="$(tr "\0" "\n" <"$p/environ" 2>/dev/null || true)"
  found="$(printf "%s" "$said" | sed -n "s/^DISPLAY=//p" | head -n 1)"
  [ -n "$found" ] || continue
  display="$found"
  xauth="$(printf "%s" "$said" | sed -n "s/^XAUTHORITY=//p" | head -n 1)"
  break
done

exec setpriv --reuid "$uid" --regid "$uid" --init-groups env \
  HOME="$home" \
  DISPLAY="$display" \
  ${xauth:+XAUTHORITY="$xauth"} \
  XDG_RUNTIME_DIR="/run/user/$uid" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" \
  PATH="$home/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/var/lib/flatpak/exports/bin:/snap/bin" \
  "$@"
'

# The command, with what it is given, in the machine's own terms. Handed over with nothing between
# the arguments but a zero byte, since one of ours beginning with a dash is an argument and not an
# option to whatever is reading them.
command_json="$(
  printf '%s\0' "$@" | jq -Rs \
    --arg inner "$inner" \
    --arg repo "$repo" \
    --arg display "${DISPLAY:-:0}" \
    --arg workspace "/workspace" \
    'split("\u0000")[:-1]
     | map(if startswith($workspace) then $repo + .[($workspace | length):] else . end)
     | ["nsenter", "-t", "1", "-m", "-u", "-i", "-n", "-p", "--", "sh", "-c", $inner, "sh", $repo, $display] + .'
)"

if [ -n "$envs" ]; then
  # shellcheck disable=SC2086 # each --env is one NAME=VALUE, and they are separated by spaces here
  env_json="$(printf '%s\0' $envs | jq -Rs 'split("\u0000")[:-1]')"
else
  env_json='[]'
fi

body="$(
  jq -n --arg image "$image" --argjson cmd "$command_json" --argjson env "$env_json" '{
    Image: $image,
    Cmd: $cmd,
    Env: $env,
    Tty: true,
    HostConfig: { Privileged: true, PidMode: "host", NetworkMode: "host", AutoRemove: false }
  }'
)"

created="$(api -X POST -H 'Content-Type: application/json' -d "$body" http://localhost/containers/create)"
id="$(printf '%s' "$created" | jq -r '.Id // empty')"
[ -n "$id" ] || {
  echo "The machine's docker would not take the command: $(printf '%s' "$created" | jq -r '.message // .')" >&2
  exit 1
}

clean() { api -X DELETE "http://localhost/containers/$id?force=true" >/dev/null 2>&1 || true; }

api -X POST "http://localhost/containers/$id/start" >/dev/null || {
  clean
  echo "The command could not be started on the machine." >&2
  exit 1
}

# Detached, the window is the machine's from now on and lives past this command; attached, whatever
# it says comes back here and stopping this stops it over there.
if [ -n "$detach" ]; then
  exit 0
fi

trap 'clean' INT TERM
curl -sN --unix-socket "$socket" \
  "http://localhost/containers/$id/logs?follow=1&stdout=1&stderr=1" 2>/dev/null || true
status="$(api -X POST "http://localhost/containers/$id/wait" | jq -r '.StatusCode // 0')"
trap - INT TERM
clean
exit "${status:-0}"

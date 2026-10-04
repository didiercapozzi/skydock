#!/bin/sh
set -eu

socket="${SKYDOCK_DOCKER_SOCKET:-/var/run/docker.sock}"
detach=''
envs=''
unit="skydock-$$-$(date +%s)"

while [ $# -gt 0 ]; do
  case "$1" in
  --detach)
    detach=1
    shift
    ;;
  --stop)
    unit="$2"
    shift 2
    set -- --stop
    break
    ;;
  --repo)
    shift
    set -- --repo
    break
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

[ "$1" != "--repo" ] || {
  printf '%s\n' "$repo"
  exit 0
}

inner='
set -eu
repo="$1"; display="$2"; detach="$3"; unit="$4"; shift 4

setenvs=""
while [ $# -gt 0 ] && [ "$1" != "--" ]; do
  setenvs="$setenvs --setenv=$1"
  shift
done
[ $# -eq 0 ] || shift
uid="$(stat -c %u "$repo")"
entry="$(getent passwd "$uid" || true)"
home="$(printf "%s" "$entry" | cut -d: -f6)"
[ -n "$home" ] || home="/home/$(printf "%s" "$entry" | cut -d: -f1)"

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

path="$home/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/var/lib/flatpak/exports/bin:/snap/bin"

as_them() {
  setpriv --reuid "$uid" --regid "$uid" --init-groups env \
    SYSTEMD_PAGER="" \
    SYSTEMD_COLORS="0" \
    HOME="$home" \
    DISPLAY="$display" \
    ${xauth:+XAUTHORITY="$xauth"} \
    XDG_RUNTIME_DIR="/run/user/$uid" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" \
    PATH="$path" \
    "$@"
}

handed_over() {
  # shellcheck disable=SC2086
  as_them systemd-run --user --quiet --property=KillMode=mixed \
    --setenv=DISPLAY="$display" ${xauth:+--setenv=XAUTHORITY="$xauth"} $setenvs \
    "$@"
}

session=""
if as_them sh -c "command -v systemd-run >/dev/null 2>&1"; then
  session="$(as_them systemctl --user is-system-running 2>/dev/null || true)"
fi
case "$session" in
running | degraded | starting) ;;
*)
  as_them "$@"
  exit $?
  ;;
esac

if [ "${1-}" = "--stop" ]; then
  as_them systemctl --user stop "$unit.service" >/dev/null 2>&1 || true
  exit 0
fi

if [ -z "$detach" ]; then
  handed_over --unit="$unit" --pipe --wait -- "$@"
  exit $?
fi

as_them systemctl --user reset-failed "skydock-*" >/dev/null 2>&1 || true

handed_over --unit="$unit" -- "$@"

gave_up() {
  as_them journalctl --user -u "$unit.service" -n 5 --no-pager -o cat >&2 2>/dev/null || true
  as_them systemctl --user reset-failed "$unit.service" >/dev/null 2>&1 || true
  exit 1
}

watched=0
while [ "$watched" -lt 8 ]; do
  sleep 0.2
  watched=$((watched + 1))
  state="$(as_them systemctl --user show -p SubState --value "$unit.service" 2>/dev/null || true)"
  case "$state" in
  running | start | activating | auto-restart) exit 0 ;;
  failed) gave_up ;;
  dead | exited)
    code="$(as_them systemctl --user show -p ExecMainStatus --value "$unit.service" 2>/dev/null || true)"
    if [ -z "$code" ] || [ "$code" = "0" ]; then
      exit 0
    fi
    gave_up
    ;;
  esac
done
exit 0
'

command_json="$(
  printf '%s\0' "$@" | jq -Rs \
    --arg inner "$inner" \
    --arg repo "$repo" \
    --arg display "${DISPLAY:-:0}" \
    --arg detach "$detach" \
    --arg unit "$unit" \
    --arg envs "$envs" \
    --arg workspace "/workspace" \
    'split("\u0000")[:-1]
     | map(if startswith($workspace) then $repo + .[($workspace | length):] else . end)
     | ["nsenter", "-t", "1", "-m", "-u", "-i", "-n", "-p", "--", "sh", "-c", $inner, "sh", $repo, $display, $detach]
       + [$unit]
       + ($envs | split(" ") | map(select(. != "")))
       + ["--"] + .'
)"

if [ -n "$envs" ]; then
  # shellcheck disable=SC2086
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

if [ -n "$detach" ]; then
  watched=0
  while [ "$watched" -lt 12 ]; do
    sleep 0.25
    watched=$((watched + 1))
    [ "$(api "http://localhost/containers/$id/json" | jq -r '.State.Running')" = "true" ] || break
  done
  state="$(api "http://localhost/containers/$id/json")"
  [ "$(printf '%s' "$state" | jq -r '.State.Running')" != "true" ] || exit 0
  status="$(printf '%s' "$state" | jq -r '.State.ExitCode // 0')"
  [ "$status" = "0" ] || api "http://localhost/containers/$id/logs?stdout=1&stderr=1&tail=5" >&2 2>/dev/null || true
  clean
  exit "${status:-0}"
fi

interrupted() {
  "$0" --stop "$unit" >/dev/null 2>&1 || true
  clean
  exit 130
}

trap 'interrupted' INT TERM
curl -sN --unix-socket "$socket" \
  "http://localhost/containers/$id/logs?follow=1&stdout=1&stderr=1" 2>/dev/null &
follower=$!
wait "$follower" 2>/dev/null || true
status="$(api -X POST "http://localhost/containers/$id/wait" | jq -r '.StatusCode // 0')"
trap - INT TERM
clean
exit "${status:-0}"

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
#   --repo                print where this container's /workspace is on the machine, and stop
#
# A path the container knows as /workspace is handed over as the machine knows it, since the two
# are the same bytes under different names.
set -eu

socket="${SKYDOCK_DOCKER_SOCKET:-/var/run/docker.sock}"
detach=''
envs=''
# What the command runs as over there, named on this side so that it can also be stopped from here.
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

# Asked only where the repo is on the machine, which is known by now and needs nothing run over
# there: the same folder under two names, and anything that has to speak of it in the machine's
# terms — a path inside a project, for one — needs both.
[ "$1" != "--repo" ] || {
  printf '%s\n' "$repo"
  exit 0
}

# What runs over there, once the namespaces are the machine's own: become the owner of the repo,
# with the session they are already logged into, and hand the command their environment. Root has
# no desktop of its own, and an application started as root on somebody's session is refused by
# half of it.
inner='
set -eu
repo="$1"; display="$2"; detach="$3"; unit="$4"; shift 4

# What was asked to be given to the command, up to the lone dash: a session manager starts a unit
# with an environment of its own, so anything wanted over there has to be named rather than
# inherited. One NAME=VALUE each, and no spaces in a value — these are ours, not the machines own.
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

path="$home/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/var/lib/flatpak/exports/bin:/snap/bin"

# As them, with their session around them. Nothing they are asked is asked through a pager: this is
# a terminal as far as the machine can tell, and an answer wrapped in what a pager draws is an answer
# that matches nothing.
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

# An application is asked for by their own session manager rather than started here. Started here it
# would run in this container of a moment: the files and the screen of the machine, but the cgroup
# of this container, and a confined application looks at that and refuses. A snap is the case in
# hand — kdenlive is one on this machine — and it stops before it draws anything:
#
#   cannot open own cgroup directory /sys/fs/cgroup//../../user.slice/…/snap.kdenlive.kdenlive-….scope
#
# Asked of the session manager, the application belongs to the machine from the first instant: their
# slice, their scope, nothing of this container about it, and it outlives this container without
# having to leave one running. What it says goes to their journal, under the name given here.
handed_over() {
  # shellcheck disable=SC2086 # each is one --setenv=NAME=VALUE, separated by spaces here
  as_them systemd-run --user --quiet \
    --setenv=DISPLAY="$display" ${xauth:+--setenv=XAUTHORITY="$xauth"} $setenvs \
    "$@"
}

# A machine without a session manager — or one whose session is not up — is served the old way, by
# starting the application here and holding this container open for as long as it lives.
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

# Asked to stop something started earlier, rather than to start anything. The near side asks this
# of itself when it is interrupted: what it started belongs to the session manager now, and would
# otherwise outlive the command that asked for it.
if [ "${1-}" = "--stop" ]; then
  as_them systemctl --user stop "$unit.service" >/dev/null 2>&1 || true
  exit 0
fi

if [ -z "$detach" ]; then
  # Waited for: what it says and what it comes to are wanted here — a version asked of the editor,
  # a command run to see what the machine says.
  handed_over --unit="$unit" --pipe --wait -- "$@"
  exit $?
fi

# What an application that did not start left behind, cleared before another is asked for: a unit
# that failed is kept rather than collected — that is the whole of how this knows — and one nobody
# was watching when it died would otherwise sit in their list of failures for good.
as_them systemctl --user reset-failed "skydock-*" >/dev/null 2>&1 || true

handed_over --unit="$unit" -- "$@"

# Given a moment to fail before this is called an opening. An application that cannot start says so
# within a second — a confinement refusing it, a library it has not got — and saying "opening it"
# over a window that never came is the one answer worse than saying nothing.
gave_up() {
  # what it said on its way out, onto this stream: the order matters, since the far end is a
  # terminal and silencing this command would otherwise silence its answer too
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
    # Gone already, which an editor does when it hands the project to a copy of itself that was
    # already open. What it came to says which of the two happened.
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

# The command, with what it is given, in the machine's own terms. Handed over with nothing between
# the arguments but a zero byte, since one of ours beginning with a dash is an argument and not an
# option to whatever is reading them.
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

# Detached, the window is the machine's from now on and lives past this command — but how it went is
# worth a moment's wait, since a window that never came is the thing worth saying. Handed to their
# session manager, the other side comes back at once with a verdict; started the old way it stays up
# for as long as the application does, and that is taken as having started.
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

# Interrupted, what was started over there goes too: it is the session manager's now rather than
# this container's child, so stopping this would otherwise leave a window nobody asked to keep.
interrupted() {
  "$0" --stop "$unit" >/dev/null 2>&1 || true
  clean
  exit 130
}

# What it says, followed as it says it — in the background, since a shell runs what it was asked to
# do about a signal only once the command in front of it has finished, and following output finishes
# when the command over there does. Waited on instead, which an interruption can cut short.
trap 'interrupted' INT TERM
curl -sN --unix-socket "$socket" \
  "http://localhost/containers/$id/logs?follow=1&stdout=1&stderr=1" 2>/dev/null &
follower=$!
wait "$follower" 2>/dev/null || true
status="$(api -X POST "http://localhost/containers/$id/wait" | jq -r '.StatusCode // 0')"
trap - INT TERM
clean
exit "${status:-0}"

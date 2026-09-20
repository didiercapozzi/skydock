#!/bin/sh
# Builds SkyDock for the machine this container runs on, rather than for the container.
#
#   npm run build:host
#
# The two are not the same system — this container is newer — and a program built in here starts on
# the machine outside it only by luck: its C library is too new, or the web engine it was built
# against is not the one it finds, and then the board draws and answers nothing. So the app for the
# machine is built on an image of the machine's own system, which this reads off it, through the
# same docker the container already reaches.
#
# What comes out is in src-tauri/target-host/release/bundle, and `npm run dev:window:host` prefers
# it over the container's own build. The crates it downloads are kept in a volume of docker's, so
# only the first build is slow.
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
socket="${SKYDOCK_DOCKER_SOCKET:-/var/run/docker.sock}"
api() { curl -sS --unix-socket "$socket" "$@"; }

[ -S "$socket" ] || {
  echo "No docker socket at $socket — this container cannot build for the machine around it." >&2
  exit 1
}

version="${SKYDOCK_HOST_UBUNTU:-$("$here/host.sh" sh -c '. /etc/os-release; printf %s "$VERSION_ID"' | tr -d '\r\n')}"
[ -n "$version" ] || {
  echo "The machine would not say which Ubuntu it is. Name it in SKYDOCK_HOST_UBUNTU." >&2
  exit 1
}
image="skydock-build:$version"

self="$(cat /proc/sys/kernel/hostname)"
repo="$(api "http://localhost/containers/$self/json" |
  jq -r '.Mounts[] | select(.Destination=="/workspace") | .Source' | head -n 1)"
[ -n "$repo" ] && [ "$repo" != "null" ] || {
  echo "This container's /workspace is not a folder of the machine's." >&2
  exit 1
}

echo "[SkyDock] building for Ubuntu $version — the machine's own system"

# the image, from one file and nothing else: everything it needs it installs itself
tar -cf - -C "$here" host-build.Dockerfile |
  curl -sS -N --unix-socket "$socket" -X POST \
    -H 'Content-Type: application/x-tar' --data-binary @- \
    "http://localhost/build?t=$image&dockerfile=host-build.Dockerfile&buildargs=%7B%22UBUNTU_VERSION%22%3A%22$version%22%7D" |
  jq -rj 'if .stream then .stream elif .error then "\nERROR: " + .error + "\n" else "" end'

api "http://localhost/images/$image/json" >/dev/null || {
  echo "The build image was not made." >&2
  exit 1
}

# The web app and the server bundle are the same wherever they are built; the program around them
# is not, and neither is what it carries. Built into a folder of its own, so the container's own
# build stays where it is and neither has to undo the other.
build='
set -eu
cd /workspace
export CARGO_TARGET_DIR=/workspace/src-tauri/target-host
npx tauri build --bundles deb,appimage
'

body="$(jq -n --arg image "$image" --arg repo "$repo" --arg build "$build" '{
  Image: $image,
  Cmd: ["sh", "-c", $build],
  WorkingDir: "/workspace",
  Tty: true,
  HostConfig: {
    Binds: [ $repo + ":/workspace", "skydock-host-crates:/usr/local/cargo/registry" ],
    AutoRemove: false
  }
}')"

created="$(api -X POST -H 'Content-Type: application/json' -d "$body" http://localhost/containers/create)"
id="$(printf '%s' "$created" | jq -r '.Id // empty')"
[ -n "$id" ] || {
  echo "The machine's docker would not take the build: $(printf '%s' "$created" | jq -r '.message // .')" >&2
  exit 1
}

clean() { api -X DELETE "http://localhost/containers/$id?force=true" >/dev/null 2>&1 || true; }
trap 'clean' INT TERM

api -X POST "http://localhost/containers/$id/start" >/dev/null
curl -sN --unix-socket "$socket" \
  "http://localhost/containers/$id/logs?follow=1&stdout=1&stderr=1" 2>/dev/null || true
status="$(api -X POST "http://localhost/containers/$id/wait" | jq -r '.StatusCode // 1')"
trap - INT TERM
clean

if [ "${status:-1}" != "0" ]; then
  echo "[SkyDock] the build for the machine failed." >&2
  exit "$status"
fi

echo "[SkyDock] built for Ubuntu $version:"
ls -1 /workspace/src-tauri/target-host/release/bundle/*/* 2>/dev/null | sed 's/^/           /'

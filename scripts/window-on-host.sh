#!/bin/sh
# SkyDock's own window, opened on the machine around this container.
#
#   npm run dev:window:host                    # the development server and the window, one command
#   SKYDOCK_DEV_URL= npm run dev:window:host   # the app on its own: its server, its work folder
#
# A window drawn on the host's screen from inside the container opens and never loads its page, so
# the app is run over there instead, by `scripts/host.sh`. Nothing has to be installed or left
# running on the host.
#
# The server it shows comes up with it, unless one is already answering — one already running is
# used and left running, so `npm run dev` in another terminal still works the way it did.
#
# The AppImage where one is built, since it carries its own WebKit rather than borrowing the
# machine's — a window bound to a WebKit of another version draws the board and then refuses every
# click — and the built program otherwise. Build one with `npm run tauri build`.
set -eu

# What SkyDock writes is written by root in here and read by whoever is at the screen out there.
umask 000

here="$(cd "$(dirname "$0")" && pwd)"
url="${SKYDOCK_DEV_URL-http://127.0.0.1:5173}"

# What was built for the machine, and the plain program before the AppImage: the machine's own
# WebKit then plays the clips with the machine's own codecs, where an AppImage brings half of that
# with it and takes the other half from here — and the two halves meet when a video starts.
# `npm run build:host` is what makes the one that belongs over there.
app=''
for candidate in \
  "$here/../src-tauri/target-host/release/skydock" \
  "$here/../src-tauri/target-host/release/bundle/appimage"/*.AppImage \
  "$here/../src-tauri/target/release/skydock"; do
  [ -x "$candidate" ] && [ -z "$app" ] && app="$candidate"
done

[ -x "$app" ] || {
  echo "SkyDock is not built yet — run 'npm run tauri build'." >&2
  exit 1
}

# said in the terms both sides share, since the machine knows this folder by another name
app="$(cd "$(dirname "$app")" && pwd)/$(basename "$app")"

answering() { curl -sfo /dev/null --max-time 1 "$url"; }

# Only what this started: a server that was already up is somebody else's and stays. What was
# started is a session of its own, named by itself, so the whole of it goes rather than the command
# in front of it — a server killed by its first process leaves the one holding the port behind.
ours=''
stop() {
  [ -n "$ours" ] || return 0
  if [ -s "$ours" ]; then
    kill -TERM "-$(cat "$ours")" 2>/dev/null || kill -TERM "$(cat "$ours")" 2>/dev/null || true
  fi
  rm -f "$ours"
}
trap 'stop' EXIT INT TERM

# The server behind the window, when nothing is answering yet. What it says stays on this stream: a
# server that will not start is the thing worth seeing.
if [ -n "$url" ] && ! answering; then
  echo "Starting the development server on $url…"
  ours="$(mktemp)"
  # shellcheck disable=SC2016 # the session names itself over there, where $$ is its own
  setsid sh -c 'echo $$ >"$0"; exec npm run dev' "$ours" &
  waited=0
  until answering; do
    waited=$((waited + 1))
    [ "$waited" -le 240 ] || {
      echo "The development server did not come up on $url." >&2
      exit 1
    }
    sleep 0.25
  done
fi

echo "Opening $(basename "$app") on the machine${url:+ — showing $url}"
# How big to draw it, when this side was told: `SKYDOCK_ZOOM=150 npm run dev:window:host`.
"$here/host.sh" --env "SKYDOCK_DEV_URL=$url" \
  ${SKYDOCK_ZOOM:+--env "SKYDOCK_ZOOM=$SKYDOCK_ZOOM"} "$app"

#!/bin/sh
# SkyDock's own window, opened on the machine around this container.
#
#   npm run dev:window:host                    # the development server and the window, one command
#   SKYDOCK_DEV_URL= npm run dev:window:host   # the app on its own: its server, its work folder
#
# The window can be opened in here — `npm run app` draws it on this container's own display — and
# this is for seeing it on the machine itself: its screen, its card, its file manager to drag a clip
# out of. The app is run over there by `scripts/host.sh`, which needs nothing installed on the host.
#
# The server it shows comes up with it, unless one is already answering — one already running is
# used and left running, so `npm run dev` in another terminal still works the way it did.
#
# What was built for the machine: `npm run installers` makes it, and what it leaves unpacked is what
# runs here.
set -eu

# What SkyDock writes is written by root in here and read by whoever is at the screen out there.
umask 000

here="$(cd "$(dirname "$0")" && pwd)"
url="${SKYDOCK_DEV_URL-http://127.0.0.1:5173}"

app=''
for candidate in \
  "$here/../build/installers/linux-unpacked/skydock" \
  "$here/../build/installers"/*.AppImage; do
  [ -x "$candidate" ] && [ -z "$app" ] && app="$candidate"
done

[ -x "$app" ] || {
  echo "SkyDock is not built yet — run 'npm run installers'." >&2
  exit 1
}

# said in the terms both sides share, since the machine knows this folder by another name
app="$(cd "$(dirname "$app")" && pwd)/$(basename "$app")"

# The engine's own sandbox helper has to be owned by root and setuid, or the app refuses to start
# rather than run without a sandbox — and a build leaves it plain, since only an installer can set
# it. Installing the package does this; running what was built does not, so it is done here. This
# side is root and the folder is the machine's own, so it is the same file either side.
sandbox="$(dirname "$app")/chrome-sandbox"
if [ -f "$sandbox" ] && [ ! -u "$sandbox" ]; then
  chown root:root "$sandbox" 2>/dev/null && chmod 4755 "$sandbox" 2>/dev/null ||
    echo "Could not make $sandbox setuid root — the window may refuse to start." >&2
fi

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

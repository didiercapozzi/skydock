#!/bin/sh
# SkyDock's own window, from inside the development container, on a display of its own.
#
# The container has the host's X socket, but drawing on the host's session from in here takes that
# session down with it — the container is privileged and holds every DRM card the machine has, and
# a window of ours on the host's screen has crashed it repeatedly. So the app gets a display that
# belongs to the container, and the host watches it: a real SkyDock window, in a browser tab.
#
#   npm run dev            # or dev:bridge, in another terminal — the app itself
#   npm run dev:window     # this, then open http://localhost:6080/vnc.html on the host
#
# Nothing here reaches the host's session. Stopping this stops everything it started.
set -eu

DISPLAY_NUMBER="${SKYDOCK_WINDOW_DISPLAY:-:20}"
SCREEN="${SKYDOCK_WINDOW_SCREEN:-1600x1000x24}"
VNC_PORT="${SKYDOCK_WINDOW_VNC_PORT:-5900}"
WEB_PORT="${SKYDOCK_WINDOW_WEB_PORT:-6080}"
DEV_URL="${SKYDOCK_DEV_URL:-http://127.0.0.1:5173}"
APP="$(dirname "$0")/../src-tauri/target/release/skydock"

if [ ! -x "$APP" ]; then
  echo "Build the app first: npm run tauri build" >&2
  exit 1
fi

started=""

stop() {
  for pid in $started; do kill "$pid" 2>/dev/null || true; done
}
trap stop EXIT INT TERM

# the display itself: no hardware, no host, nothing to crash
Xvfb "$DISPLAY_NUMBER" -screen 0 "$SCREEN" -nolisten tcp >/dev/null 2>&1 &
started="$started $!"
socket="/tmp/.X11-unix/X${DISPLAY_NUMBER#:}"
waited=0
while [ ! -e "$socket" ]; do
  waited=$((waited + 1))
  [ "$waited" -gt 100 ] && echo "The display did not come up." >&2 && exit 1
  sleep 0.1
done

export DISPLAY="$DISPLAY_NUMBER"

# something to move and resize the window with, since a bare display has no such thing
openbox --sm-disable >/dev/null 2>&1 &
started="$started $!"

# what serves that display, and what lets a browser on the host watch it
x11vnc -display "$DISPLAY_NUMBER" -rfbport "$VNC_PORT" -forever -shared -nopw -quiet \
  -localhost -noxdamage >/dev/null 2>&1 &
started="$started $!"
websockify --web /usr/share/novnc "$WEB_PORT" "localhost:$VNC_PORT" >/dev/null 2>&1 &
started="$started $!"

echo "[SkyDock] the window is on http://localhost:$WEB_PORT/vnc.html?autoconnect=true&resize=scale"

# The renderer a container can use: no DMA-BUF, no compositing, no card — this display has none of
# it, and asking for it is how the web process dies before it draws anything.
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  LIBGL_ALWAYS_SOFTWARE=1 \
  SKYDOCK_DEV_URL="$DEV_URL" \
  "$APP"

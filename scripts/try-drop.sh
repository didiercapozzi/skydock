#!/bin/sh
# Drags a file into SkyDock's own window, and says what came of it.
#
#   npm run build && npx tauri build --no-bundle   # once, and after any change to the window
#   scripts/try-drop.sh                            # the drag, and what the app made of it
#
# Why this exists. Every test in this repo runs in Chromium, and the window is drawn by WebKitGTK —
# a different engine, with a different answer to every question about dragging. Five fixes in a row
# passed the tests and failed in the window, each for a reason no test here could have seen: a
# double-click the engine will not send on something draggable, a drag it cancels when it is handed
# no data, a dropped file it refuses to name to the page. So this runs the real program, on a
# display of its own, and drags a real file onto it the way a file manager does.
#
# What it does: a display nobody is looking at (Xvfb), a window manager so windows can be placed,
# a GTK window to drag from (`scripts/drag-source.py`, offering one `text/uri-list` target), and the
# app pointed at a server of its own. Then xdotool presses on the source, moves onto the app and
# lets go. Everything the app says goes to this stream, and the work folder is looked at afterwards:
# a file that arrived is a file on the disk.
#
#   SKYDOCK_TRY_URL   what the window shows (default: the app's own server)
#   SKYDOCK_TRY_KEEP  keep the display up afterwards, to look at it over VNC
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
app="$here/../src-tauri/target/release/skydock"
[ -x "$app" ] || {
  echo "The app is not built for this container — run 'npm run build && npx tauri build --no-bundle'." >&2
  exit 1
}

display="${SKYDOCK_TRY_DISPLAY:-:21}"
work="$(mktemp -d /tmp/skydock-try-XXXXXX)"
offered="$work/from phone.mp4"
started=''

stop() {
  for pid in $started; do kill "$pid" 2>/dev/null || true; done
  [ -n "${SKYDOCK_TRY_KEEP-}" ] || rm -rf "$work"
}
trap stop EXIT INT TERM

# a file worth dragging: a real clip, so what lands can be compared with what was offered
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc=size=320x240:rate=10 -t 1 \
  -pix_fmt yuv420p "$offered"

Xvfb "$display" -screen 0 1600x1000x24 -nolisten tcp >/dev/null 2>&1 &
started="$started $!"
socket="/tmp/.X11-unix/X${display#:}"
waited=0
while [ ! -e "$socket" ]; do
  waited=$((waited + 1))
  [ "$waited" -gt 100 ] && echo "The display did not come up." >&2 && exit 1
  sleep 0.1
done
export DISPLAY="$display"

openbox --sm-disable >/dev/null 2>&1 &
started="$started $!"
sleep 1

python3 "$here/drag-source.py" "$offered" &
started="$started $!"

# The app, on its own server and its own work folder, so what it took in can be counted. The
# renderer a container can use: no card, no compositing, no DMA-BUF.
config="$work/config"
output="$work/output"
mkdir -p "$config/ch.skydock.app" "$output"
# Where the work goes, written down before the app asks: answered once, it never asks again, and
# nothing here is sitting in front of the dialog to answer it.
printf '{"outputDir":"%s"}\n' "$output" >"$config/ch.skydock.app/settings.json"
WEBKIT_DISABLE_DMABUF_RENDERER=1 \
  WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  LIBGL_ALWAYS_SOFTWARE=1 \
  XDG_CONFIG_HOME="$config" \
  XDG_DATA_HOME="$work/data" \
  SKYDOCK_OUTPUT_DIR="$output" \
  SKYDOCK_CONFIG_DIR="$config/ch.skydock.app" \
  SKYDOCK_CAMERA_ROOTS='' \
  ${SKYDOCK_TRY_URL:+SKYDOCK_DEV_URL="$SKYDOCK_TRY_URL"} \
  "$app" 2>&1 | sed -u 's/^/[app] /' &
started="$started $!"

# The board, once it is there to be dropped on. The app puts a window of its own on the display
# besides the board's — ten pixels square, never drawn — so the board is the big one.
board() {
  for w in $(xdotool search --name '^SkyDock$' 2>/dev/null); do
    said="$(xdotool getwindowgeometry --shell "$w" 2>/dev/null | tr '\n' ' ')"
    ( eval "$said"; [ "${WIDTH:-0}" -gt 400 ] && printf '%s' "$said" ) || true
  done
}
waited=0
geometry="$(board)"
while [ -z "$geometry" ] && [ "$waited" -lt 60 ]; do
  waited=$((waited + 1))
  sleep 0.5
  geometry="$(board)"
done
[ -n "$geometry" ] || {
  echo "No board on the display — the window did not open." >&2
  exit 1
}
# the page it shows has to be drawn as well, and it arrives over a server of its own
sleep 5
eval "$geometry"
to_x=$((X + WIDTH / 2))
to_y=$((Y + HEIGHT / 2))
echo "[try] dragging onto the window at $to_x,$to_y"

xdotool mousemove 150 100
xdotool mousedown 1
# moved in steps, because a drag is a gesture and not a jump: GTK starts one only once the pointer
# has travelled, and the engine on the other side wants to be entered before it is dropped on
for step in 1 2 3 4 5 6 7 8; do
  xdotool mousemove $((150 + (to_x - 150) * step / 8)) $((100 + (to_y - 100) * step / 8))
  sleep 0.2
done
sleep 1
xdotool mouseup 1
sleep 3

echo "[try] what the work folder holds now:"
find "$output/original_files" -type f 2>/dev/null | sed 's/^/           /' || true
landed="$(find "$output/original_files" -type f 2>/dev/null | wc -l)"
if [ "$landed" -gt 0 ]; then
  echo "[try] the file arrived."
else
  echo "[try] nothing arrived." >&2
fi
[ -z "${SKYDOCK_TRY_KEEP-}" ] || {
  echo "[try] the display is still up on $display — look at it with x11vnc."
  sleep 600
}
[ "$landed" -gt 0 ]

#!/bin/sh
# SkyDock's own window, opened on the machine around this container.
#
#   npm run dev:window:host                    # the window, on the development server
#   SKYDOCK_DEV_URL= npm run dev:window:host   # the app on its own: its server, its work folder
#
# A window drawn on the host's screen from inside the container opens and never loads its page, so
# the app is run over there instead, by `scripts/host.sh`. Nothing has to be installed or left
# running on the host.
#
# The AppImage where one is built, since it carries its own WebKit rather than borrowing the
# machine's — a window bound to a WebKit of another version draws the board and then refuses every
# click — and the built program otherwise. Build one with `npm run tauri build`.
set -eu

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

echo "Opening $(basename "$app") on the machine${url:+ — showing $url}"
exec "$here/host.sh" --env "SKYDOCK_DEV_URL=$url" "$app"

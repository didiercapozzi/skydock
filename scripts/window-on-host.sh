#!/bin/sh
set -eu

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

app="$(cd "$(dirname "$app")" && pwd)/$(basename "$app")"

sandbox="$(dirname "$app")/chrome-sandbox"
if [ -f "$sandbox" ] && [ ! -u "$sandbox" ]; then
  chown root:root "$sandbox" 2>/dev/null && chmod 4755 "$sandbox" 2>/dev/null ||
    echo "Could not make $sandbox setuid root — the window may refuse to start." >&2
fi

answering() { curl -sfo /dev/null --max-time 5 "$url"; }

ours=''
stop() {
  [ -n "$ours" ] || return 0
  if [ -s "$ours" ]; then
    kill -TERM "-$(cat "$ours")" 2>/dev/null || kill -TERM "$(cat "$ours")" 2>/dev/null || true
  fi
  rm -f "$ours"
}
trap 'stop' EXIT INT TERM

if [ -n "$url" ] && ! answering; then
  echo "Starting the development server on $url…"
  ours="$(mktemp)"
  # shellcheck disable=SC2016
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
"$here/host.sh" --env "SKYDOCK_DEV_URL=$url" \
  ${SKYDOCK_ZOOM:+--env "SKYDOCK_ZOOM=$SKYDOCK_ZOOM"} "$app"

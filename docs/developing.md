# Working on SkyDock

> How to run, build, test and release SkyDock. For using it, see [README.md](../README.md).

**[RULES.md](../RULES.md) says what the app does** — what a jump is, how files are named, what the
board offers, and what it deliberately does not do. Read that first; this file is only how to run it.

## Running it

There are two ways: the development server, which is what this repo is worked on with, and the
installed app, which is what a dropzone gets.

```bash
npm install
npm run dev            # the board, on http://localhost:5173
```

Everything happens on the board: scanning, sorting, processing and uploading. `dev` also points
SkyDock at the editor and the video player on the machine around the container — see _Opening a
montage from the container_ below — so a montage opens from a browser tab the way it would from the
app.

### The window on the host's own screen

To see the app as an app rather than a browser tab. Everything is said from the container; nothing
runs on the machine outside it:

```bash
npm run build:host       # once — the app, built for the machine's own system
npm run dev:window:host  # the window, over there, showing the development server
```

That is one command: the development server comes up with the window and goes down with it. One
already running is used and left alone, so `npm run dev` in another terminal still works.

Said with no development server, the app runs on its own instead — its own server and work folder
and all, exactly as an installed one does:

```bash
SKYDOCK_DEV_URL= npm run dev:window:host
```

The window zooms with ⌘/ctrl and `+` or `−`, as a browser does. To open at a size rather than reach
for it every time, say so — as a factor or as a percentage, half to triple size:

```bash
SKYDOCK_ZOOM=150 npm run dev:window:host
```

The installed app reads the same thing from `"zoom"` in its `settings.json`.

**What the window does with a dragged file is tested here, on the real engine.** The window is
drawn by WebKitGTK and every other test runs in Chromium, and the two answer every question about
dragging differently — a run of fixes once passed the whole suite and failed in the window, one
after another. So [scripts/try-drop.sh](../scripts/try-drop.sh) builds nothing and mocks nothing: it
opens the real program on a display of its own, drags a real file onto it from a real GTK drag
source ([scripts/drag-source.py](../scripts/drag-source.py), standing in for a file manager) with a
real pointer, and looks in the work folder. The container's WebKitGTK is the same version as the
machine's, so what passes here passes there.

```bash
npm run build && npx tauri build --no-bundle   # once, and after any change to the window
scripts/try-drop.sh                            # the drag, and whether the file arrived
```

Two things make that work, and both are worth knowing.

**The command is run on the machine, not in here.** [scripts/host.sh](../scripts/host.sh) hands it to
a container of a moment which shares the machine's namespaces, becomes whoever owns the repo, and
runs it on their display, with their session bus and the screen their session actually uses — which
is rarely the one this container was handed. It reaches the machine through the docker socket the
container already mounts: everything this can do, a privileged container with that socket could
already do, and this makes it ordinary rather than possible.

**The application is asked for by their session manager**, not started in that container of a
moment. Started there it would carry that container's cgroup about with it, and a confined
application — a snap, a flatpak — looks at that and refuses before it draws anything; kdenlive is a
snap on this machine, and said so in a line about a cgroup directory it could not open. Handed to
`systemd-run --user`, it is the machine's own application from the first instant, in their slice,
and it outlives the container without one having to be left running. What it says goes to their
journal. Interrupting this side stops it over there, as it always did.

**The app is built for the machine, not for this container.** The two are different systems — this
one is newer — and a program built in here borrows a C library and a web engine that the machine
has not got. It starts by luck, draws the board and then answers nothing.
[scripts/build-for-host.sh](../scripts/build-for-host.sh) builds on an image of the machine's own
system, read off the machine, into `src-tauri/target-host/` so the container's build stays where it
is. The plain program is preferred to the AppImage for the same reason in miniature: an AppImage
carries its own web engine but takes the codecs from the machine, and the two halves meet the
moment a clip starts playing.

### Drawing on the host's screen from inside the container, and why it is not the way

Running the app _in_ the container and pointing it at the host's X server, through the socket the
container already has, is the obvious thing to try and does not work here. The measurements are
worth keeping.

It used to take the host's session down every time — and with it VS Code, and with VS Code the
container, which stops itself when VS Code goes. That part is fixed: an X client draws through
MIT-SHM, and a shared-memory segment made in the container's own IPC namespace is nothing to the X
server outside it, so every blit came back `BadShmSeg`. Chromium, and so Electron, tests for this
and quietly falls back; WebKitGTK does not. `ipc: host` in `docker-compose.dev.yml` makes both sides
mean the same thing, and the session has been steady since.

What is left is that the window opens and the page never loads. Measured with the same binary, the
same settings and the same server, seconds apart: on the container's own display the board renders;
on the host's display the app makes no request at all. It is not wedged — its thread waits in
`poll`, WebKit's own processes are up and idle, and it makes no system calls at all while it sits
there — so what the desktop reports as "not responding" is a window that never paints. Ruled out
along the way: the card (software rendering and an empty `/dev/dri` change nothing), a deadlock in
the window code, and the WebKit flags (with and without them is the same). What remains is
WebKitGTK against that particular X server, which is further than this is worth chasing.

So: `npm run dev:window:host` to have the host open a window, and the installed app when the real
thing is wanted.

A camera plugged in is copied off by itself while the board's server runs — see
[RULES.md](../RULES.md), _Plugging a camera in is enough_. The command line does the same by hand:

```bash
npm run copy -- /path/to/camera1 /path/to/camera2   # copy the cameras into output/original_files
npm run scan                                       # find the jumps (the board's Scan button)
```

## What the board can be asked to do

[RULES.md](../RULES.md) says what the app does. What it does not say is how it is asked: every change
goes through one of twenty-nine intents, each with its own file, its own words and its own way of
refusing — and the same refusal is often enforced in seven places at once, which is the part nobody
can hold in their head.

[docs/the-board-from-the-inside.md](./the-board-from-the-inside.md) is that map, and it is read
out of the code rather than written down, so it cannot quietly stop being true:

```bash
npx tsx scripts/map-the-board.ts           # write it again
npx tsx scripts/map-the-board.ts --check   # say whether it still matches the code
```

It is generated from the list of names a request is checked against, the table tying each name to
its file, and those files' own comments and refusals — and it says so out loud when the three stop
agreeing: a name nothing answers, or something answered that cannot be asked for.

## Output

```
output/
├── original_files/    every file as it came off the camera, in a folder per day
├── manifest.json      the registry of files
├── groups.json        the jumps, pointing at files in the registry
├── processed/         what gets delivered
├── .status/           the progress of a running upload
└── .thumbs/           the frames the board draws, cut once and kept
```

## Building the installers

The installed app is the same web app, served by a Node of its own on `127.0.0.1` inside a window
([Tauri](https://tauri.app)). It carries that Node, ffmpeg and ffprobe, so nothing has to be
installed on the machine it lands on.

```bash
npm run tauri build     # the installer for this machine, in src-tauri/target/release/bundle
npm run tauri dev       # the window, against a build
```

What it needs to build is in the development container already: the Rust toolchain and the window's
engine (`libwebkit2gtk-4.1-dev` and its like) are installed by
[.devcontainer/Dockerfile.dev](../.devcontainer/Dockerfile.dev), and `@tauri-apps/cli` comes with
`npm install`. Nothing binary is committed —
`node scripts/build-sidecar.mjs`, which Tauri runs first, builds the app, fetches the Node it ships
with, and takes ffmpeg and ffprobe from `SKYDOCK_TOOLS_DIR` or from this machine.
`node scripts/fetch-tools.mjs` fetches builds of those that need nothing beside them, which is what
a release does; it prints the folder to hand over.

The programs the app carries are installed under SkyDock's own name — `skydock-node`,
`skydock-ffmpeg`, `skydock-ffprobe` — so that a package never lands on the machine's own. The server
ends when the app does, whatever ends the app.

The server can also be run without the window, which is how it is checked:

```bash
npm run build && node scripts/build-server.mjs
PORT=5199 node web/build/skydock-server.mjs     # prints SKYDOCK_READY <port>
```

## Making a release

An installer can only be made on the system it is for, so all four are made by
[.github/workflows/release.yml](../.github/workflows/release.yml) on four machines at once, and hung on
a draft release: `.dmg` for both kinds of Mac, `.msi` and a setup `.exe` for Windows, `.deb` and an
AppImage for Linux.

A tag is the whole trigger, and one command makes one:

```bash
npm run release              # the next patch — 0.1.0 becomes 0.1.1
npm run release minor        # 0.1.0 becomes 0.2.0
npm run release 1.0.0        # exactly that
npm run release -- --here    # everything but the push, to look at first
```

It refuses what cannot be taken back once pushed: work that was never committed, a tag that exists
already, a branch that is not `main`. It runs the checks before the tag rather than after it, moves
the version in the three files that state it — the app's own config, its `Cargo.toml` and the
lockfile — and pushes the tag. The build then refuses outright to release a tag that says something
other than the app does, so the two can never drift apart.

Nothing is public until somebody presses publish on the draft. To try a build without releasing
anything, start the workflow by hand from any branch: the same installers come out, attached to the
run instead of to a release.

### Keeping the installed copies current

An installed SkyDock asks GitHub on every start whether a newer release exists, fetches it quietly
and offers it. It will only refuse to install something it cannot prove came from here: each
installer is signed at build time, and the app carries the public half of that key.

Two things have to be true before a single machine updates itself:

- **The repository has to be public.** The app asks
  `github.com/didiercapozzi/skydock/releases/latest/download/latest.json` with no credentials, which
  is the whole point — a token compiled into an app is a token anybody with the app has. Until then
  the check fails, quietly and on purpose, and every copy stays where it is.
- **The build has to hold the private half of the signing key**, as two secrets of the repository:

  ```bash
  gh secret set TAURI_SIGNING_PRIVATE_KEY < config/skydock-updater.key
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""
  ```

  The key was made with `npx tauri signer generate` and lives in `config/`, which git ignores. **Keep
  a copy somewhere safe**: lose it and no installed SkyDock will ever accept another update, because
  the copies in the field only trust that one. The public half is in `tauri.conf.json` and is meant
  to be read.

On Linux only the AppImage replaces itself; a machine installed from the `.deb` updates by
downloading the next one. macOS and Windows update whichever way they were installed.

**They are not signed**, so each system says so once:

- **macOS** — the app is refused the first time; open System Settings → Privacy & Security and
  choose _Open Anyway_ (or `xattr -dr com.apple.quarantine /Applications/SkyDock.app`).
- **Windows** — SmartScreen: _More info_, then _Run anyway_.

Signing them costs money rather than work: an Apple Developer ID (99 USD a year), which also buys
notarisation and removes the warning entirely, and a certificate for Windows. Both are given to the
build as secrets and nothing else changes — [macOS](https://v2.tauri.app/distribute/sign/macos/),
[Windows](https://v2.tauri.app/distribute/sign/windows/).

## Configuration

| Variable                                                               | Purpose                                                                                                                                                                  | Default                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `SKYDOCK_OUTPUT_DIR`                                                   | Where originals, the registry and delivery folders live                                                                                                                  | `/workspace/output`                                                        |
| `SKYDOCK_CONFIG_DIR`                                                   | The app's own settings, kept apart from the work — the storage connection                                                                                                | `/workspace/config`                                                        |
| `SKYDOCK_TRASH_DIR`                                                    | The bin: files put aside, and a camera's files once deleted from it. Never emptied by the app                                                                            | `.trash` inside the output folder                                          |
| `SKYDOCK_MONTAGE_TEMPLATE`                                             | The kdenlive project a montage is built from                                                                                                                             | the one template under `templates/`                                        |
| `SKYDOCK_CAMERA_ROOTS`                                                 | Where cameras get mounted, separated the way this system separates paths. A drive there with a `DCIM` folder is copied off by itself; empty turns it off                 | Linux `/mnt/osmo:/media:/run/media`, macOS `/Volumes`, Windows every drive |
| `SKYDOCK_EDITOR_COMMAND`                                               | What opens a montage — read as a shell command line, with the project appended as its last argument. Quotes group, so `sh -c "… \"$0\" …"` works and `$0` is the project | kdenlive, as each system keeps it                                          |
| `SKYDOCK_FFMPEG_PATH`, `SKYDOCK_FFPROBE_PATH`, `SKYDOCK_EXIFTOOL_PATH` | Where each tool is. The installed app says; otherwise they are looked for on the PATH                                                                                    | found on the PATH                                                          |
| `SKYDOCK_TEMPLATES_DIR`                                                | The templates the app itself ships with, as against a dropzone's own under `output/templates`                                                                            | `templates/` beside the code                                               |
| `SKYDOCK_CLIENT_DIR`                                                   | The built page the packaged server serves                                                                                                                                | beside the server                                                          |
| `PORT`                                                                 | The port the packaged server listens on, on `127.0.0.1` only. `0`, or unset, takes a free one and prints it                                                              | a free one                                                                 |

That is the whole of it — **the network storage is not configured here.** Host, user and password are
entered on the board, and the session is kept in `config/nas.json` — the config folder, apart from
`output/` and ignored by git — with the password encrypted. A session left in `output/.status/` by an
older version is moved there the first time it is read. No credentials are read from the environment
and none are written into the registry.

## Requirements

The installers carry everything: nothing below has to be installed on the machine SkyDock lands on.
Run from this repository instead, each is looked for on the PATH.

- `ffmpeg` / `ffprobe` — to write a cropped video and to make thumbnails. Carried, one build per
  system.
- `exiftool` — processing stamps dates into the files and stops without it. Carried as well, though
  it is a program and the several hundred files it reads formats out of rather than one file, so it
  travels among the app's own rather than beside it. On Windows it brings its own Perl; on a Mac and
  on Linux it runs on the one the system ships with, at `/usr/bin/perl`, which is where both keep it
  — and it is asked for there rather than on the PATH, because an app opened from the desktop has
  hardly any PATH and would otherwise find nothing and say nothing.
- `kdenlive` is **not** required to produce a montage project, only to open and render one.
- `tar` — only to bring in an editing template packed as `.tar.gz`; a `.zip` needs nothing.

### Opening a montage from the container

Installed as a desktop app, SkyDock runs on the machine kdenlive is on and starts it directly —
nothing to set up. The development container is the awkward case: it has no kdenlive and no way to
reach the one outside it, so pressing **Montage** there would report that it cannot open anything.

`npm run dev` bridges it, with nothing extra to run and nothing left running on the host. It is

```sh
umask 000 && SKYDOCK_EDITOR_COMMAND=/workspace/scripts/editor-on-host.sh \
  SKYDOCK_PLAYER_COMMAND=/workspace/scripts/play-on-host.sh npm run dev --workspace=@workspace/web
```

— the variables point SkyDock at [scripts/editor-on-host.sh](../scripts/editor-on-host.sh) and
[scripts/play-on-host.sh](../scripts/play-on-host.sh), which hand the project or the clip to
[scripts/host.sh](../scripts/host.sh) to open over there, as described above, in the machine's own
terms: a path this container knows as `/workspace` is translated on the way. `SKYDOCK_HOST_EDITOR`
and `SKYDOCK_HOST_PLAYER` pick a different one of each. The umask is explained below. Run where
there is no machine around the container — no docker socket — both simply start the program where
they are, so `npm run dev` is right on a plain machine too.

The board is told what came of it. The bridge waits a moment for the editor to fail before calling
it an opening, so an editor that cannot start says why — the line it printed on its way out — rather
than leaving "opening it…" over a window that never came. What it printed afterwards is in the
machine's own journal:

```sh
scripts/host.sh journalctl --user -u 'skydock-*' -n 50
```

**The two sides are not the same user.** The container runs as root; on the host you are yourself.
Everything SkyDock writes into `output/` is therefore owned by root, and the editor running on the
host would get it read-only. Opening a project works, and so does playing its clips — but saving the
edit and rendering the film both write, and both would be refused, the second one only at the end of
a render. Two things answer that, and they answer different halves of it.

`dev` sets `umask 000`, so what SkyDock writes from then on is writable by everybody. That is
a development-machine trade — permissive modes under `output/` — and it covers the folders the
editor only reads, the proxies above all.

The jump being opened gets more than that: the bridge hands its folder over, `chown`ing it to
whoever owns the repo, which on a bind mount is the host user. Being allowed to write a file and
owning it are not the same thing — an editor may decline a project belonging to somebody else
whatever the mode says, and anything written before the umask was set is still the old `0644`. The
container runs as root, so it can settle this rather than leave it to be discovered at a save.

A confined editor makes ownership the only thing that counts. kdenlive installed as a snap may read
what is in your home **only where you own it**, whatever the mode says — a root-owned file at `0755`
is refused, and the editor opens the project and reports the music and the logos as missing. So the
bridge hands over what the project points at as well as the folder it sits in: its music, its logos,
the proxies it plays from. Anything opened before that was handed over shows it missing until the
project is opened again.

Nothing else under `output/` is handed over, so old files stay as they are. To take the lot once:

```sh
sudo chown -R "$USER" output/
```

The packaged desktop build has none of this, since there is only one user in it.

## Checks

```bash
npm run format && npm run check   # typecheck, formatting, lint
npm test                          # every suite: the pipeline, the server routes, the board
```

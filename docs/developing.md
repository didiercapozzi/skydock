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

### The window

To see the app as an app rather than a browser tab. The window is Electron — the same engine the
board is tested in — so it opens on this container's own display, and what it does with a drag is
what Chromium does:

```bash
npm run app            # the window, here, showing whatever `npm run dev` is serving
```

It shows the development server when one is told:

```bash
SKYDOCK_DEV_URL=http://127.0.0.1:5173 npm run app
```

and otherwise it is the app itself — its own server, its own work folder, asked for on the first
run, exactly as an installed one.

To see it on the machine around the container instead — its screen, its card, its file manager to
drag a clip out of — it is run over there:

```bash
npm run installers       # once — the app, built for this system
npm run dev:window:host  # the window, over there, showing the development server
```

What runs over there is the unpacked build, and the engine's sandbox helper beside it has to be
owned by root and setuid or the app refuses to start rather than run without a sandbox. Installing
the package sets that; a build leaves it plain, so `dev:window:host` sets it before it opens the
window. A machine whose kernel allows unprivileged user namespaces never gets that far — which is
why the package sets it only where it is needed, and why the AppImage, which tests for the same
thing and stands its sandbox down when it must, never runs into it.

That is one command: the development server comes up with the window and goes down with it. One
already running is used and left alone, so `npm run dev` in another terminal still works.

Said with no development server, the app runs on its own over there too — its own server, its own
work folder, exactly as an installed one does:

```bash
npm run app:host                          # the whole app on the machine, drawn at 170%
SKYDOCK_DEV_URL= npm run dev:window:host  # the same thing, said longhand
```

The empty `SKYDOCK_DEV_URL=` is the whole of it: the script reads it with `${SKYDOCK_DEV_URL-…}`, the
form that keeps an empty value rather than replacing it, so nothing is started in here and nothing in
here is talked to. It matters for anything the machine can see and this container cannot — a camera
on a cable above all.

The window zooms with ⌘/ctrl and `+` or `−`, as a browser does. To open at a size rather than reach
for it every time, say so — as a factor or as a percentage, half to triple size:

```bash
SKYDOCK_ZOOM=150 npm run dev:window:host
```

The installed app reads the same thing from `"zoom"` in its `settings.json`.

**A file dragged in from the machine is an ordinary drop.** The window is Chromium, so the page is
handed the file itself, and the window is asked where that file already is — the server is on the
same machine, and sending a jump's rushes through a request to reach a folder they are sitting in is
a copy nobody asked for. The board's tests run in the same engine as the window, so a green suite
means the window too. Only the address of a dropped file cannot be had in a browser, and
[web/tests/e2e/drop-from-computer.test.tsx](../web/tests/e2e/drop-from-computer.test.tsx) covers both
sides of that.

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

**What runs over there is what `npm run installers` built** — `build/installers/linux-unpacked/`,
or the AppImage beside it. It is built in here and run out there, which is the ordinary case for an
Electron app: it carries its own engine, and the only thing it takes from the machine is the screen.

### Drawing on the host's screen from inside the container

This used to take the host's session down every time — and with it VS Code, and with VS Code the
container, which stops itself when VS Code goes. An X client draws through MIT-SHM, and a
shared-memory segment made in the container's own IPC namespace is nothing to the X server outside
it, so every blit came back `BadShmSeg`. Chromium tests for this and quietly falls back; WebKitGTK,
which drew the window before Electron, did not. `ipc: host` in `docker-compose.dev.yml` makes both
sides mean the same thing.

The other half of it was that the window opened and the page never loaded — measured, with the same
binary and the same server, seconds apart: on the container's own display the board rendered, on the
host's display the app made no request at all. That was WebKitGTK against that particular X server,
and it went with WebKitGTK.

What is left is the card. This container is privileged and holds every DRM card the machine has, so
the window asks for none of them in here (`app.disableHardwareAcceleration()` when `/.dockerenv` is
there) and asks for them on a machine SkyDock is installed on, where the card is what plays the
clips.

So: `npm run app` for the window in here, `npm run dev:window:host` to see it on the machine's own
screen, and the installed app when the real thing is wanted.

A camera plugged in is copied off by itself while the board's server runs — see
[RULES.md](../RULES.md), _Plugging a camera in is enough_. The command line does the same by hand:

```bash
npm run copy -- /path/to/camera1 /path/to/camera2   # copy the cameras into output/original_files
npm run scan                                       # find the jumps (the board's Scan button)
```

To time the board against a busy season, `npm run big-board -- [files] [folder]` builds a work
folder of 2,000 small files by default (in the system temp folder unless a folder is given), found by
a scan and filed into jumps; it refuses the live work folder and anything under `/mnt`. Point
`SKYDOCK_OUTPUT_DIR` at the folder it names and open the board.

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
([Electron](https://electronjs.org)). The Node is Electron's own — the app's program, told to be
Node and nothing else — and ffmpeg, ffprobe and ExifTool travel with it, so nothing has to be
installed on the machine it lands on.

```bash
npm run app          # the window, from the source
npm run pack         # everything the app carries, into build/resources
npm run installers   # that, and then the installers, into build/installers
```

Nothing binary is committed. `npm run pack`
([scripts/build-payload.ts](../scripts/build-payload.ts)) builds the page and the server, fetches
ExifTool, and takes ffmpeg and ffprobe from `SKYDOCK_TOOLS_DIR` or from this machine;
[scripts/fetch-tools.ts](../scripts/fetch-tools.ts) fetches builds of those two that need nothing
beside them, which is what a release does — it prints the folder to hand over. The window itself is
two TypeScript files built into what Electron runs by
[scripts/build-shell.ts](../scripts/build-shell.ts); `npm run app` and `npm run installers` run it
first.

Everything the app carries sits in its own `resources/` folder, which is where
[electron/main.ts](../electron/main.ts) looks for it — so nothing of SkyDock's is ever installed over
a program of the machine's own. The server ends when the app does, whatever ends the app.

What comes out, built here with this machine's ffmpeg rather than the static one a release fetches:
a `.deb` of 112 MB and an AppImage of 138 MB. Most of it is the engine, and the engine is also the
Node the server runs on — which is why the AppImage is smaller than it was when the app carried a
Node of its own beside a different engine.

The server can also be run without the window, which is how it is checked:

```bash
npm run build && npx tsx scripts/build-server.ts
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
the version where the app states it — `package.json`, which is what the installers are named after —
and pushes the tag. The build then refuses outright to release a tag that says something other than
the app does, so the two can never drift apart.

Nothing is public until somebody presses publish on the draft. To try a build without releasing
anything, start the workflow by hand from any branch: the same installers come out, attached to the
run instead of to a release.

### Keeping the installed copies current

An installed SkyDock asks GitHub on every start whether a newer release exists. What it compares
itself against is the list `electron-builder` writes onto the release — `latest-linux.yml`,
`latest.yml`, `latest-mac.yml` — and what it checks before replacing itself is the length and the
hash that list carries. There is no key to keep and none to lose.

- **The repository has to be public.** The app asks GitHub about the releases with no credentials,
  which is the whole point — a token compiled into an app is a token anybody with the app has. Until
  then the check fails, quietly and on purpose, and every copy stays where it is.
- **Windows and Linux install it themselves** once the answer is yes: it is fetched first, so saying
  yes is a restart rather than a wait. On Linux that is the AppImage; a machine installed from the
  `.deb` is told and downloads the next one.
- **A Mac says what is out and opens the downloads page.** Only an app signed with an Apple
  Developer ID can replace itself there, and this one is not signed. Nothing else about a Mac is
  different.

**The installers are not signed**, so each system says so once:

- **macOS** — the app is refused the first time; open System Settings → Privacy & Security and
  choose _Open Anyway_ (or `xattr -dr com.apple.quarantine /Applications/SkyDock.app`).
- **Windows** — SmartScreen: _More info_, then _Run anyway_.

Signing them costs money rather than work: an Apple Developer ID (99 USD a year), which also buys
notarisation, removes the warning entirely and is what would let a Mac update itself; and a
certificate for Windows. Both are given to the build as secrets and nothing else changes —
[electron-builder on signing](https://www.electron.build/code-signing).

## Configuration

| Variable                                                               | Purpose                                                                                                                                                                  | Default                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `SKYDOCK_OUTPUT_DIR`                                                   | Where originals, the registry and delivery folders live                                                                                                                  | `/workspace/output`                                                        |
| `SKYDOCK_CONFIG_DIR`                                                   | The app's own settings, kept apart from the work — the storage connection                                                                                                | `/workspace/config`                                                        |
| `SKYDOCK_TRASH_DIR`                                                    | The bin: files put aside, and a camera's files once deleted from it. Never emptied by the app                                                                            | `.trash` inside the output folder                                          |
| `SKYDOCK_MONTAGE_TEMPLATE`                                             | The kdenlive project a montage is built from                                                                                                                             | none ships; the ones under `output/templates`                              |
| `SKYDOCK_CAMERA_ROOTS`                                                 | Where cameras get mounted, separated the way this system separates paths. A drive there with a `DCIM` folder is copied off by itself; empty turns it off                 | Linux `/mnt/osmo:/media:/run/media`, macOS `/Volumes`, Windows every drive |
| `SKYDOCK_EDITOR_COMMAND`                                               | What opens a montage — read as a shell command line, with the project appended as its last argument. Quotes group, so `sh -c "… \"$0\" …"` works and `$0` is the project | kdenlive, as each system keeps it                                          |
| `SKYDOCK_FFMPEG_PATH`, `SKYDOCK_FFPROBE_PATH`, `SKYDOCK_EXIFTOOL_PATH` | Where each tool is. The installed app says; otherwise they are looked for on the PATH                                                                                    | found on the PATH                                                          |
| `SKYDOCK_TEMPLATES_DIR`                                                | Where templates that ship with the app would be. None do — a `templates/` folder here is carried into an installer but is never committed                              | `templates/` beside the code                                               |
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

## Translating

SkyDock speaks English, French and German with [Lingui](https://lingui.dev). A sentence is written in
English where it stands, with Lingui's core macros — `` t`…` `` for a sentence, `plural(n, { one, other })`
for one that counts, `msg` for one kept in a constant and said later with `i18n._()` — and never with
JSX `<Trans>`, which would need a provider around every test. Then:

```sh
npm run i18n:extract -w web   # gathers every sentence into web/app/locales/{en,fr,de}/messages.po
```

and the new `msgstr` lines of `fr` and `de` are filled in, in Poedit or by hand. The catalogs are
compiled as they are imported, so there is no compile step; `web/tests/server/languages.test.ts`
fails while any sentence has no French or German. Names a translator needs to read are given to the
placeholders (`` t`${copied} new` ``, not `` t`${camera.copied} new` ``).

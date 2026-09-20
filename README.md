# SkyDock

> The media workflow of a skydiving dropzone: from the cameras to the passenger.

SkyDock copies a day's footage off the cameras, works out which files belong to which jump, and lets
the instructor file each jump under a dropzone or a passenger. It then renames and crops the files
into a delivery folder and sends them to the club's network storage.

**[RULES.md](./RULES.md) says what the app does** — what a jump is, how files are named, what the
board offers, and what it deliberately does not do. Read that first; this file is only how to run it.

## Running it

There are two ways: the development server, which is what this repo is worked on with, and the
installed app, which is what a dropzone gets.

```bash
npm install
npm run dev            # the board, on http://localhost:5173
```

Everything happens on the board: scanning, sorting, processing and uploading.

A camera plugged in is copied off by itself while the board's server runs — see
[RULES.md](./RULES.md), _Plugging a camera in is enough_. The command line does the same by hand:

```bash
npm run copy -- /path/to/camera1 /path/to/camera2   # copy the cameras into output/original_files
npm run scan                                       # find the jumps (the board's Scan button)
```

## Output

```
output/
├── original_files/    every file as it came off the camera, in a folder per day
├── manifest.json      the registry of files
├── groups.json        the jumps, pointing at files in the registry
├── processed/         what gets delivered
└── .status/           the progress of a running upload
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
[.devcontainer/Dockerfile.dev](.devcontainer/Dockerfile.dev), and `@tauri-apps/cli` comes with
`npm install`. Nothing binary is committed —
`node scripts/build-sidecar.mjs`, which Tauri runs first, builds the app, fetches the Node it ships
with, and takes ffmpeg and ffprobe from `SKYDOCK_TOOLS_DIR` or from this machine.
`node scripts/fetch-tools.mjs` fetches builds of those that need nothing beside them, which is what
a release does; it prints the folder to hand over.

An installer is made on the system it is for, so all three are built by
[.github/workflows/release.yml](.github/workflows/release.yml) on a tag (`v1.2.3`), which attaches
`.dmg`, `.msi`, `.deb` and an AppImage to a draft release.

**They are not signed yet**, so each system says so once:

- **macOS** — right-click the app, choose _Open_, then _Open_ again (or
  `xattr -dr com.apple.quarantine /Applications/SkyDock.app`).
- **Windows** — SmartScreen: _More info_, then _Run anyway_.

The programs the app carries are installed under SkyDock's own name — `skydock-node`,
`skydock-ffmpeg`, `skydock-ffprobe` — so that a package never lands on the machine's own. The server
ends when the app does, whatever ends the app.

The server can also be run without the window, which is how it is checked:

```bash
npm run build && node scripts/build-server.mjs
PORT=5199 node web/build/skydock-server.mjs     # prints SKYDOCK_READY <port>
```

## Configuration

| Variable                                                               | Purpose                                                                                                                                                                  | Default                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `SKYDOCK_OUTPUT_DIR`                                                   | Where originals, the registry and delivery folders live                                                                                                                  | `/workspace/output`                                                        |
| `SKYDOCK_CONFIG_DIR`                                                   | The app's own settings, kept apart from the work — the storage connection                                                                                                | `/workspace/config`                                                        |
| `SKYDOCK_TRASH_DIR`                                                    | The bin: files put aside, and a camera's files once deleted from it. Never emptied by the app                                                                            | `/workspace/.trash`                                                        |
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

- `exiftool` — processing stamps dates into the files and stops without it. The installers do not
  carry it: on a Mac and on most Linux machines it is a Perl program that needs more than one file
  beside it. Installed on the machine, it is found and used.
- `ffmpeg` / `ffprobe` — required to write a cropped video and to make thumbnails. The installers
  carry both.
- `kdenlive` is **not** required to produce a montage project, only to open and render one.
- `tar` — only to bring in an editing template packed as `.tar.gz`; a `.zip` needs nothing.

### Opening the editor from the development container

Installed as a desktop app, SkyDock runs on the machine kdenlive is on and starts it directly —
nothing to set up. The development container is the awkward case: it has no kdenlive and no way to
reach the one outside it, so pressing **Montage** there reports that it cannot open anything.

Two small scripts bridge it, using the fact that `output/` is the same folder on both sides:

```sh
# on the host, once, as yourself — never with sudo — and leave it running
./scripts/open-on-host.sh

# in the container — `dev` with the bridge already pointed at
npm run dev:bridge
```

The container writes the project it wants opened into `output/.editor-requests`; the host script
sees the line, turns the container's `/workspace` into wherever the repo actually is, and opens it
there. `SKYDOCK_EDITOR` picks a different editor, `SKYDOCK_EDITOR_QUEUE` a different file.

`dev:bridge` is `umask 000 && SKYDOCK_EDITOR_COMMAND=/workspace/scripts/editor-bridge.sh npm run dev`
— the variable points SkyDock at the bridge, and the umask is explained below.

**The two sides are not the same user.** The container runs as root; on the host you are yourself.
Everything SkyDock writes into `output/` is therefore owned by root, and the editor running on the
host would get it read-only. Opening a project works, and so does playing its clips — but saving the
edit and rendering the film both write, and both would be refused, the second one only at the end of
a render. Two things answer that, and they answer different halves of it.

`dev:bridge` sets `umask 000`, so what SkyDock writes from then on is writable by everybody. That is
a development-machine trade — permissive modes under `output/` — and it covers the folders the
editor only reads, the proxies above all.

The jump being opened gets more than that: the bridge hands its folder over, `chown`ing it to
whoever owns the repo, which on a bind mount is the host user. Being allowed to write a file and
owning it are not the same thing — an editor may decline a project belonging to somebody else
whatever the mode says, and anything written before the umask was set is still the old `0644`. The
container runs as root, so it can settle this rather than leave it to be discovered at a save.
`open-on-host.sh` still warns if it opens something it cannot write, which catches the rest.

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

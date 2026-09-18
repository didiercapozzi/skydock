# SkyDock

> The media workflow of a skydiving dropzone: from the cameras to the passenger.

SkyDock copies a day's footage off the cameras, works out which files belong to which jump, and lets
the instructor file each jump under a dropzone or a passenger. It then renames and crops the files
into a delivery folder and sends them to the club's network storage.

**[RULES.md](./RULES.md) says what the app does** — what a jump is, how files are named, what the
board offers, and what it deliberately does not do. Read that first; this file is only how to run it.

## Running it

```bash
npm install
npm run dev            # the board, on http://localhost:5173
```

Everything happens on the board: scanning, sorting, processing and uploading.

Two command-line tools exist for the one step that happens before the app can see anything:

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
└── .status/           the network-storage session and the progress of a running upload
```

## Configuration

| Variable                   | Purpose                                                                                                                                                                  | Default                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `SKYDOCK_OUTPUT_DIR`       | Where originals, the registry and delivery folders live                                                                                                                  | `/workspace/output`                 |
| `SKYDOCK_MONTAGE_TEMPLATE` | The kdenlive project a montage is built from                                                                                                                             | the one template under `templates/` |
| `SKYDOCK_EDITOR_COMMAND`   | What opens a montage — read as a shell command line, with the project appended as its last argument. Quotes group, so `sh -c "… \"$0\" …"` works and `$0` is the project | `kdenlive`                          |

That is the whole of it — **the network storage is not configured here.** Host, user and password are
entered on the board, and the session is kept in `output/.status/`, with the password encrypted. No
credentials are read from the environment and none are written into the registry.

## Requirements

- `exiftool` — required: processing stamps dates into the files and stops without it.
- `ffmpeg` / `ffprobe` — required to write a cropped video and to make thumbnails.
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

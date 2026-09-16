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
├── .status/           the network-storage session and the progress of a running upload
└── .trash/            folders replaced by a re-process, never emptied automatically
```

## Configuration

| Variable                   | Purpose                                                 | Default                     |
| -------------------------- | ------------------------------------------------------- | --------------------------- |
| `SKYDOCK_OUTPUT_DIR`       | Where originals, the registry and delivery folders live | `/workspace/output`         |
| `SKYDOCK_MONTAGE_TEMPLATE` | The kdenlive project a montage is built from            | `templates/tandem.kdenlive` |

That is the whole of it — **the network storage is not configured here.** Host, user and password are
entered on the board, and the session is kept in `output/.status/`, with the password encrypted. No
credentials are read from the environment and none are written into the registry.

## Requirements

- `exiftool` — required: processing stamps dates into the files and stops without it.
- `ffmpeg` / `ffprobe` — required to write a cropped video and to make thumbnails.
- `kdenlive` is **not** required to produce a montage project, only to open and render one.

## Checks

```bash
npm run format && npm run check   # typecheck, formatting, lint
npm test                          # every suite: the pipeline, the server routes, the board
```

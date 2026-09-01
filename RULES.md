# RULES — SkyDock App Logic

> Single source of truth for how SkyDock works. Covers scripts, output layout, scan/cluster, deduplication, web UI, manifest and API.

## 1. Overview

SkyDock copies media from DJI Osmo Nano cameras to a local folder tree, groups files into skydiving jumps by time gaps, lets the user review/correct dates and regroup, then copies confirmed jumps to `processed/`. No camera identity is tracked — cameras are treated as plain external storage merged into date folders.

**Pipeline:** `Connect cameras` → `processMedia()` → `scanMedia()` → `Review (web UI)` → `executeMedia()` → `output/processed/`

## 2. Output Structure

```
output/
├── original_files/           # Raw files organized by file mtime date
│   ├── 2026-08-24/
│   │   ├── DJI_0001.MP4
│   │   ├── DJI_0002.JPG
│   │   └── ...
│   └── 2026-08-25/
│       ├── DJI_0011.MP4
│       └── ...
├── .cache/                   # Thumbnails + 144p proxies (not processed)
│   ├── thumbs/{id}.jpg
│   └── proxies/{id}.mp4
├── manifest.json             # File registry — source of truth (see §4)
├── jumps.json                # Jumps — lightweight refs {id, cropStart?, cropEnd?} (see §4)
└── processed/                # After per-jump Process
    ├── jump_1/
    │   ├── DJI_0001.MP4
    │   └── ...
    └── jump_2/
        └── ...
```

- `output` defaults to `/workspace/output` or `SKYDOCK_OUTPUT_DIR`.
- `original_files/YYYY-MM-DD/` uses file `mtime` (`fs.statSync().mtimeMs`) and `fs.copyFileSync` to preserve timestamps for scan grouping.

## 3. Deduplication (`processMedia()`)

- Inputs: `{ cameraDirs: string[], outputDir?: string }`.
- For each file: `filename = path.basename`; `targetDate` from `getCaptureDate()` (exiftool or mtime fallback); `destDir = originalFiles/targetDate`.
- `fileMatchesExisting(src, destDir)`: if `destDir/filename` exists and `cmp -s src dest` → skip (same content). If exists but `cmp` differs → copy (overwritten on camera). If not exists → copy.
- `fs.copyFileSync` + `fs.utimesSync` preserves timestamps.
- Writes `output/.status/process.json` (`running` → `done` → `idle` after 5s) for `api/status`.

## 4. Manifest (`output/manifest.json` + `output/jumps.json`)

```ts
type ManifestFile = {
  path: string
  size: number
  mtime: number
  filename: string
  id?: string // SHA-256(file) → 16 hex, computed at scan via computeFileId — sole truth
  originalMtime?: number
  thumbPath?: string
  proxyPath?: string
}
type JumpFileRef = { id: string; cropStart?: number; cropEnd?: number }
type ManifestJump = {
  id: string
  label: string
  confirmed: boolean
  files: ManifestFile[] // in-memory resolved via manifest.files lookup
  processed?: boolean
}
type ManifestStatus = 'empty' | 'proposed' | 'confirmed' | 'executed'
type Manifest = {
  version: number
  status: ManifestStatus
  date: string
  startDatetime: string
  createdAt: string
  theory: ManifestFile[]
  files: ManifestFile[]
  jumps: ManifestJump[]
  cameraClockOffsetSeconds?: number
}
// Persisted on disk as two files (loadManifest merges, saveManifest splits):
// manifest.json: { version, status, date, startDatetime, createdAt, theory, files, cameraClockOffsetSeconds }
// jumps.json:    { jumps: Array<{ id, label, confirmed, processed?, files: JumpFileRef[] }> }
```

- `manifest.json` is **file registry** (source of truth, written by `scan` when files appear/disappear). `jumps.json` is **workspace** (jump grouping, labels, `confirmed`/`processed`, `JumpFileRef`s). `loadManifest` merges both (resolves `ref.id → ManifestFile`); `saveManifest` splits. Migration: old single `manifest.json` with `jumps[].files: ManifestFile[]` auto-splits on first `loadManifest`.
- `scanMedia()` creates `version:1, status:'proposed', date: today, files: [all], theory: [], jumps: [clustered]`, then queues `generateProxies()` in background (both fresh and merge paths). `computeFileId` (streaming SHA-256) sets `file.id` at scan time.
- `files` is flat list of all `original_files` sorted by `mtime`.
- `jumps[].files` are **lightweight refs** `{id, cropStart?, cropEnd?}` — no `path`/`filename`/`size`/`mtime` duplication. Same file `id` may appear in multiple jumps via `copy-files`. In-memory `Manifest` resolves refs to full `ManifestFile` for UI/execute.
- `id` is `jump_1 …` or preserved original id after recluster; `label` defaults `Jump N` and is editable.
- `originalMtime` saved on first time shift to allow `reset-calibration` (stored on `manifest.files`).
- `processed` marks per-jump execution (incremental). `manifest.status` is `executed` only when every jump is `processed`, `confirmed` when some processed, otherwise `proposed`.
- Jump selection for compare/process is **not** persisted in manifest – it is React state `compareIds: string[]` in Review UI (checkbox `checked={isCompareSelected}`); `confirmed` remains only for execution bookkeeping and is auto-set by `execute-jumps`.

## 5. Scan & Cluster

### 5.0 `generateProxies()` — thumbnails + filmstrip (LosslessCut-like)

- Inputs: `output/manifest.json` + `output/jumps.json`, outputs `output/.cache/thumbs/{id}.jpg` + `output/.cache/filmstrip/{id}/%04d.jpg` + `output/.cache/logs/{id}.log` on failure.
- For each video, generates `320px` thumb (`ffmpeg -ss 0.5 -vframes 1 -vf scale=320:-2 -q:v 3`) and **filmstrip** `160px` at `1 fps` (`ffmpeg -vf fps=1,scale=160:-2 -q:v 5`). `video-grid-thumb.tsx` uses only thumb; `video-cropper.tsx` scrubs filmstrip images (instant, no GOP decode) and snaps `cropStart/End` to nearest keyframe (`ffprobe -show_entries frame=key_frame,best_effort_timestamp_time`). Filmstrip `0001.jpg` is at 0s, `0002.jpg` at 1s, etc. Keeps `proxyPath` for backward compat but primary for cropper is `filmstripDir`/`keyframes` on `ManifestFile`. `simulate.ts` makes fake bytes unique per `name-epoch` so each `id` gets distinct filmstrip.
- **File ID:** Content-based `SHA-256(file)` streaming → 16 hex (`computeFileId`) — sole truth for `manifest.files[].id` and `jumps.json` refs.
- Skips if cache newer than source mtime, prunes stale ids (checks both `files` and `jumps[].files`). Updates `manifest.json` `thumbPath`/`proxyPath` only if cache file exists on disk (removes stale paths). Retries failed proxies up to `2` extra attempts before reporting. Parallel via `Promise.all` with configurable concurrency.
- Writes `output/.status/proxies.json` (`running` with total/done, then `done` → `idle` after 8s or `error`) polled by `api/status` for UI banner.

### 5.1 `scanMedia()` — merge-on-scan

- Requires `original_files/` to exist.
- **File discovery:** Recursively finds media files using `MEDIA_EXTENSIONS_SET` (union of `VIDEO_EXTENSIONS` and `PHOTO_EXTENSIONS`: mp4, mov, avi, mkv, mts, m4v, 3gp, jpg, jpeg, png, dng, raw, tif, tiff, heic, heif, arw, cr2, cr3, nef, orf, rw2, raf).
- **Merge behavior:** If `manifest.json` already exists, scans `original_files/` and merges new files into the existing manifest instead of regenerating it. Preserves all user edits (confirmed status, labels, file groupings, calibration offsets). Detects removed files even when all files are deleted from disk (runs merge against existing manifest).
- **File comparison:** Uses content-based file ID as the identity key (SHA-256 of head 1MB + tail 64KB + file size, matching `computeFileId` in `fileId.ts`). Computes ID for each file on disk. Files in manifest whose ID no longer exists on disk are removed. Files whose ID exists but path changed are updated in place. New files (ID not in manifest) are added and clustered into jumps by the 1800 s gap threshold.
- **Jump reclustering:** After adding/removing files, reclusters all files by mtime gaps (`> 1800 s` → new jump). Preserves jump metadata (id, label, confirmed) via majority voting: if a reclustered jump contains files from multiple original jumps, it inherits the id/label of the jump that contributed the most files.
- **Fresh manifest:** If no manifest exists and files are found, creates `version:1, status:'proposed', date:today, files:[all], theory:[], jumps:[clustered]` from scratch. Returns unchanged if no files found and no manifest exists.
- Writes `output/.status/scan.json` (`running` → `done` → `idle` after 5s) for `api/status`.

### 5.2 `reclusterJumps(manifest, preservedPaths?)` (`@skydock/scripts/clustering`)

- `JUMP_GAP_SECONDS = 1800`.
- Dedupes duplicate `jump.id` first: if `seenIds` has id, assigns next `jump_N` and `Jump N` label.
- If `preservedPaths` given, collect `preservedJumps: Set<ManifestJump>` (per-object, not per-id) containing any jump with a preserved path. Each preserved jump's files are kept as a single group (sorted but not split even if internal gap >1800) to avoid splitting a manually edited jump when it is shifted.
- Remaining files clustered by 1800 s gap, then `preservedGroups + groups` sorted by `min mtime`, then merged: adjacent groups with `curMin - lastMax ≤ 1800` are merged (allows drift-corrected jumps to coalesce).
- Previous jump mapping via `previousByPath` to preserve `label`/`confirmed`/`processed` via dominant vote; `usedIds` tracked via `preservedJumps.has(prev)`; preserved jumps keep original `id`/`label` via `[...preservedJumps].find(...)`.

### 5.3 `shiftFiles(manifest, paths, offset)` (`@skydock/scripts/clustering`)

- For each file in `manifest.files` and each `jump.files` where `path` in `paths`, save `originalMtime` if undefined, then `mtime += offset`. Updates both arrays (they are separate objects after JSON parse).

## 6. Execute

### 6.1 `executeMedia({ manifestPath?, jumpIds?, outputDir? })`

- Default manifest `output/manifest.json`, `PROCESSED_DIR=output/processed`.
- If jump IDs given, process only those; else process all `jumps.filter(j => j.confirmed && !j.processed)`.
- For each jump, reads the jump label from the manifest, sanitizes it (alphanumeric + `.` + `-` + `_`), and creates `mkdir -p processed/sanitizedLabel` with subdirs `videos/` and `photos/`. Files are renamed to `sanitizedLabel_YYYYMMDD_HHMMSS.ext` (24h format, based on file mtime). If a video file has `cropStart`/`cropEnd` set and ffmpeg is available, the video is cropped to that range using `ffmpeg -ss -t -c copy`.
- Writes `output/.status/execute.json` (`running` → `done` → `idle` after 5s) for `api/status` polling.

### 6.2 `api.manifest` execute

- `execute-jumps` takes `jumpIds` (from Review React state `compareIds` filtered `!processed`; fallback all `confirmed && !processed` if empty), marks `confirmed=true`, saves, calls `executeMedia()` with those ids, then reloads manifest, sets `jump.processed=true` for those ids, and sets `manifest.status` to `executed` if all processed, `confirmed` if some, else leaves `proposed`.

## 7. Simulation & Testing

### 7.1 `simulateCameras({ outputDir?, clean?, duration?, numFiles?, devData? })`

- Base `.sim` with `camera1/`, `camera2/`.
- Default: `today 09:00` base, `NUM_FILES=8` per camera, files every 30 s interleaved 15 s, `ffmpeg testsrc` if available or random data fallback.
- `devData`: 18 files mixed `JPG`/`MP4` across 2 days → 4 jumps total, demonstrates intra-jump 90 s gaps and inter-jump 40–45 min gaps. Alternates cameras per file.

### 7.2 `watcher({ camDirs?, testMode?, runOnce?, outputDir? })`

- Polls `SKYDOCK_OUTPUT_DIR` (default `/workspace/output`), finds camera root (not intermediate dirs), calls `processMedia()` + `scanMedia()` on detection, then queues `generateProxies()` detached.

### 7.3 `testPipeline({ camDirs?, numFiles?, outputDir?, clean? })`

- `clean` removes `.sim` and `output`, generates cameras, runs `processMedia()` twice to test deduplication, asserts output exists, today folder exists, files copied, and second run copies 0.

## 8. Web App (React Router 8 Framework Mode, SSR)

### 8.1 Routes (`app/routes.ts`)

- `index` → `routes/home.tsx`, `review` → `routes/review.tsx`, `jump/:date/:jumpDir` → `routes/jump.tsx`, `api/file`, `api/library`, `api/jump`, `api/open`, `api/simulate`, `api/scan`, `api/manifest`, `api/status`.

### 8.2 Types (`@skydock/scripts/types`)

- All manifest types (`ManifestFile`, `ManifestJump`, `Manifest`, `ManifestStatus`) are defined in `@skydock/scripts/src/types.ts` and re-exported via `app/lib/types.ts`.
- `FileEntry`, `Jump`, `DayGroup` for library view are also exported from `@skydock/scripts`.

### 8.3 `scanner.server.ts`

- `getOutputDirPath()` returns `SKYDOCK_OUTPUT_DIR` or `/workspace/output`. Used by all server loaders.

### 8.4 `fileId.server.ts`

- Imports `computeFileId` and `ensureManifestFileIds` from `@skydock/scripts`. These add `id` to every file in `manifest.files`, `theory`, and `jumps[].files` if missing or file exists, deduplicates via `idOwners` map, and backfills `thumbPath`/`proxyPath` (`output/.cache/thumbs/{id}.jpg`, `output/.cache/proxies/{id}.mp4`).

### 8.5 `api.simulate.ts`

- `action({request})` with `formAction`:
  - `add-jump`: `simulateCameras({ numFiles: 4 })` → `processMedia()` both cams → `scanMedia()` → `ensureManifestFileIds`.
  - default `reset dev data`: `rm -rf output`, `simulateCameras({ clean: true, devData: true })` → process → scan → ids.

### 8.6 `api.scan.ts`

- Runs `scanMedia()` directly, then `ensureManifestFileIds()`, then spawns `generateProxies()` detached.

### 8.7 `api.file.ts`

- `loader` with `?path=`: `path.resolve`, `fs.existsSync`, `fs.createReadStream` with `Range` support (`206` + `Content-Range`), MIME via extension. Uses `streamResponse` helper with `ReadableStream` and proper cleanup on `cancel()`. Adds `Access-Control-Allow-Origin: *` for thumb canvas.

### 8.71 `api.status.ts` + `lib/status.server.ts`

- `status.server.ts` reads `output/.status/{proxies,scan,execute,process}.json` (written atomically via `*.tmp` + `mv`). `TaskStatus {state: idle|running|done|error, message, total, done, startedAt, updatedAt}`. Running is considered stale after 120s without update.
- `api/status` `loader` returns `{ok:true, status: SystemStatus}` polled by review UI every 2s.

### 8.8 `api.manifest.ts` — handlers (all arrow functions, `ok`/`fail` helpers)

- Imports `loadManifest`, `saveManifest`, `reclusterJumps`, `shiftFiles`, `sanitizeLabel` from `@skydock/scripts`.
- Helpers: `asString`, `asStringArray`, `requireManifest`, `requireJump`, `requireUnprocessed`, `removeProcessedDir`, `requireProcessedPaths`, `isAllProcessed`, `applyShift`, `ok`, `fail`.
- Handlers map: `update-label`, `confirm-jump`/`confirm-all`, `delete-jump`, `create-jump`, `move-files` / `remove-files`, `copy-files`, `reorder-files`, `merge-jumps`, `calibrate-sequences`, `shift-sequences`, `reset-calibration`, `execute-jumps`, `unprocess-jump`, `rename-file`, `set-crop`.
- `loader` returns `{manifest}`. `action` dispatches via `handlers[formAction]`, `requireManifest`, `saveManifest` and returns `ok` with `manifest`.

## 9. Review UI

The Review UI is a single-page interface for viewing, organizing, and processing skydive jumps. It loads the manifest and presents files grouped into jumps by day, with a timeline, drag-and-drop, and a staging tray for moving files between jumps.

### 9.1 Data Loading

- On load, ensure every file in the manifest has a content-based ID (SHA-256 of head+tail+size).
- Read `manifest.json` and display its jumps and files.

### 9.2 Page Layout

- **Header** at the top with title, stats, and action buttons.
- **Staging Tray** on the left (only visible when files are selected). Fixed width, sticks to the viewport while scrolling.
- **Main content** on the right: Unassigned files card at the top, then one card per jump grouped by day, then a timeline at the bottom.
- **Selected Jumps Panel** appears on the right when 1 or more jumps are selected for comparison or processing.

### 9.3 File Display

Each file is shown as a row with:

- A checkbox for selection
- Filename (renamable by clicking on it)
- Time of day
- File size
- A preview button
- A delete button

Selected files are visually highlighted. Files that exist in multiple jumps (copied) are shown with a distinct background color. Deleted files are shown with a red background and strikethrough text.

### 9.4 File Selection

- Clicking a file row toggles its selection (unless it is the first click and no files are selected yet, which opens the preview instead).
- Clicking the checkbox always toggles selection.
- Holding Ctrl/Meta and clicking adds to or removes from the current selection.
- Holding Shift and clicking selects a range from the last clicked file to the current one.
- Selection state is independent per file across all jumps and unassigned.

### 9.5 Staging Tray

- Appears when at least one file is selected.
- Lists all selected files with filename and a remove button to deselect individual files.
- Has a **Move / Copy** toggle. In Move mode, files are removed from their source jump after dropping. In Copy mode, files stay in their source jump and are also added to the target (the same file can exist in multiple jumps).
- Has a **Clear** button to deselect all files.
- The tray itself is draggable. Dragging it to a jump card moves or copies all selected files into that jump.
- After a Move drop, the selection is cleared. After a Copy drop, the selection persists.

### 9.6 Drag & Drop

**Reordering within a jump:**

- Each file row is draggable. Dragging it over another row in the same jump shows a drop indicator line above or below the target row.
- Dropping reorders the files within that jump.

**Moving or copying between jumps:**

- Dragging a file row (or the staging tray) over a different jump card highlights that card as a drop target.
- Dropping moves or copies the files into the target jump, depending on the Move/Copy mode.
- If multiple files are selected, dragging any selected file drags the entire selection.
- Processed jumps cannot receive dropped files.

### 9.7 Jump Card

Each jump is displayed as a card with:

- A checkbox for selecting the jump for comparison or processing
- An expand/collapse toggle
- An editable label (e.g. "Jump 1")
- Editable date and time
- Time range on the right side
- `Videos` and `Photos` filter pills in the header row (always visible, even when collapsed) showing counts, e.g. `▶ 12` / `▣ 11`; disabled/dimmed when 0, gray (colorless) when active (no blue); clicking expands the card and filters to that type (click again to show all) — this makes it instantly visible whether a jump contains videos, photos, or both
- Single colorless icon toggle `List/Grid` (only visible when expanded) to switch between list and thumbnail grid view (grid uses `content-visibility: auto` for 500+ files); switching applies globally to all opened jumps
- A "Remove" link when files are selected (moves selected files out of this jump)
- A "Processed" badge with an "Undo" button if the jump has been processed
- A delete button

Card border color: amber if selected for comparison, blue if processed, gray otherwise. Highlights blue when a drag is hovering over it. Filtered list/grid shows "No matching files" when empty.

### 9.8 Jump Selection for Comparison

- Clicking a jump checkbox adds or removes it from the selection (max 2 jumps).
- Selected jumps appear in the Selected Jumps Panel on the right.
- This selection is for comparison and processing only; it is not saved to the manifest.
- When one or more jumps are selected, an option appears to edit the day assignment (not the time) for all selected jumps.

### 9.9 Day Groups

- Jumps are grouped by day based on the earliest file timestamp in each jump.
- Each day group is a transparent container (no border/background) with a minimal header showing the day name, month, and ordinal date (e.g. "Saturday March 14th"), total file count, number of jumps, and time range — cards float on the page background for easier scanning.
- The day date is not directly editable.
- Below the header, all jumps for that day are listed as cards.

### 9.10 Unassigned Files

- Any file in the manifest that is not part of any jump appears in an "Unassigned" card at the top.
- These files can be staged via selection and then dragged into a jump.

### 9.11 Timeline

- A visual timeline at the bottom shows all jumps as horizontal bars on a 00:00–24:00 time scale, one lane per day.
- Bars are colored by day. Processed jumps are gray. Jumps selected for comparison have an amber ring.
- **Clicking** a bar toggles that jump in the comparison selection.
- **Dragging** a bar left or right shifts the jump's time. The shift snaps to 15-minute intervals (or full-day intervals when holding Shift). If the shift is 60 seconds or more, the time shift is applied to all files in that jump and the jumps may be reclustered.
- A tooltip shows the new date and time while dragging.
- Hour markers at 0, 6, 12, 18, and 24 are shown.

### 9.12 Selected Jumps Panel

- Appears on the right when 1 or more jumps are selected.
- Lists each selected jump with file count, time range, and date.
- **Clear** button deselects all jumps.
- **Compare** button opens the compare view (enabled when exactly 2 jumps are selected).
- **Process selected** button executes the selected jumps that have not been processed yet.

### 9.13 Compare View

- Opens as a panel showing two columns, one per selected jump.
- Each column lists the jump's files with previews.
- A "Merge into" button in each column merges all files from the other jump into this one.

### 9.14 Preview View

- Opens as a right-side panel when a file's preview button is clicked.
- Shows the file (video player or image). Videos use `proxyPath` (`480p` audible proxy) if present with fallback to original on error; thumbnails for grid use `thumbPath` (`320px` jpg) via `VideoGridThumb` with lazy intersection observer.
- **Prev/Next** buttons or arrow keys navigate between files.
- **Escape** or the close button closes the preview.
- **Video cropping**: A timeline below the video with draggable handles to select start/end frames. Click "Start here" / "End here" to set crop points at the current playback position (video pauses). Click "Apply" to save crop range to manifest.json and close the preview. At processing, ffmpeg crops the video to the selected range.
- **Crop bar zoom**: Scroll the mouse wheel while hovering over the crop bar to zoom in/out (up to 50x). Zoom is centered on the cursor position. A "Reset zoom" button appears when zoomed in to return to full view. Zoom allows precise frame-level crop adjustments.

### 9.15 Header Actions

- Displays date, jump count, and file count. Shows processed count.
- **Select All** button selects all jumps that are not yet processed.
- **+ Add Jump** button creates a new empty jump.

### 9.16 System Status (background scripts)

- Review UI polls `api/status` every 2s (`status.server.ts` reads `output/.status/*.json`). `generateProxies()`/`scanMedia()`/`executeMedia()`/`processMedia()` write `running` → `done` → `idle` atomically.
- Header shows `Working…` pulsing pill + `background tasks running` when any task running; banners below header per task: `Generating proxies (done/total)`, `Scanning`, `Copying from cameras`, `Processing jumps` (spinning) and `done` summary for 5-8s. Explains why grid thumbs or 480p previews may still be pending (fallback to original used until proxy ready). Revalidates manifest when proxies finish.

## 10. Dependencies & Tooling

- `tsx` for running TypeScript scripts directly (zero-config).
- `zod` for runtime validation of manifest data.
- `cmp` for file dedup comparison, `exiftool` optional for metadata extraction.
- `ffmpeg` for video proxy generation and thumbnail creation.
- Web: `react-router`, `react`, `oxfmt` (format), `oxlint` (lint), `vitest` (4 suites, 55+ tests), `vite-tsconfig-paths`.
- Scripts are TypeScript only, no Python, no comments in generated scripts.

## 11. Coding Rules

- React Router 8 Framework Mode, SSR, `app/routes.ts` + `app/routes/` modules, `import from ./+types/...`.
- Arrow functions only, `type` over `interface`, never `any`, all exports at end, inferred returns.
- Data schemas (manifest, etc.) use Zod for runtime validation; types are inferred via `z.infer<typeof schema>`.
- Scripts use TypeScript with `tsx` for direct execution.
- `npm run check` (`typecheck` + `format:check` + `lint`) must pass before commit.
- "export" keywords must be at the end of the file and not before a const/variable, function or types
- we use camel case format for const/variables
- use "const" instead of "let" or "var" every time you can
- Scripts package: `@skydock/scripts` — all shared logic lives here
- Never duplicate: if logic is needed in multiple places, extract to `@skydock/scripts`

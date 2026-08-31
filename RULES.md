# RULES — SkyDock App Logic

> Single source of truth for how SkyDock works. Covers scripts, output layout, scan/cluster, deduplication, web UI, manifest and API.

## 1. Overview

SkyDock copies media from DJI Osmo Nano cameras to a local folder tree, groups files into skydiving jumps by time gaps, lets the user review/correct dates and regroup, then copies confirmed jumps to `processed/`. No camera identity is tracked — cameras are treated as plain external storage merged into date folders.

**Pipeline:** `Connect cameras` → `process_media.sh` → `scan_media.sh` → `Review (web UI)` → `execute_media.sh` → `output/processed/`

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
├── manifest.json       # Manifest (see §4)
└── processed/                # After per-jump Process
    ├── jump_1/
    │   ├── DJI_0001.MP4
    │   └── ...
    └── jump_2/
        └── ...
```

- `output` defaults to `/workspace/output` or `SKYDOCK_OUTPUT_DIR`.
- `original_files/YYYY-MM-DD/` uses file `mtime` (`stat -c %Y` → `date -d @mtime +%Y-%m-%d`) and `cp -p` to preserve timestamps for scan grouping.

## 3. Deduplication (`process_media.sh`)

- Inputs: `<camera_dir> [camera_dir ...]` (each contains `*.mp4,*.mov,*.jpg,*.jpeg,*.dng` up to 4 levels deep).
- For each file: `filename=$(basename)`; `target_date` from `mtime`; `dest_dir=original_files/target_date`.
- `file_matches_existing(src, dest_dir)`: if `dest_dir/filename` exists and `cmp -s src dest` → skip (same content). If exists but `cmp` differs → copy (overwritten on camera). If not exists → copy.
- `cp -p --update=none` preserves timestamps.

## 4. Manifest (`output/manifest.json`)

```ts
type ManifestFile = {
  path: string
  size: number
  mtime: number
  filename: string
  id?: string
  originalMtime?: number
}
type ManifestJump = {
  id: string
  label: string
  confirmed: boolean
  files: ManifestFile[]
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
```

- `scan_media.sh` creates `version:1, status:'proposed', date: today, files: [all], theory: [], jumps: [clustered]`.
- `files` is flat list of all `original_files` sorted by `mtime`.
- `jumps` are clusters where gaps `> 1800 s` (30 min) start a new jump. `files` duplicated inside `jumps` (not references) but `path` is the key. Since `copy-files` exists, the same `path` may appear in multiple jumps (file copied to several jumps).
- `id` is `jump_1 …` or preserved original id after recluster; `label` defaults `Jump N` and is editable.
- `originalMtime` saved on first time shift to allow `reset-calibration`.
- `processed` marks per-jump execution (incremental). `manifest.status` is `executed` only when every jump is `processed`, `confirmed` when some processed, otherwise `proposed`.
- Jump selection for compare/process is **not** persisted in manifest – it is React state `compareIds: string[]` in Review UI (checkbox `checked={isCompareSelected}`); `confirmed` remains only for execution bookkeeping and is auto-set by `execute-jumps`.

## 5. Scan & Cluster

### 5.1 `scan_media.sh` — merge-on-scan

- Requires `original_files/` to exist.
- **Merge behavior:** If `manifest.json` already exists, scans `original_files/` and merges new files into the existing manifest instead of regenerating it. Preserves all user edits (confirmed status, labels, file groupings, calibration offsets).
- **File comparison:** Uses content-based file ID as the identity key (SHA-256 of head 1MB + tail 64KB + file size, matching `computeFileId` in `fileId.server.ts`). Computes ID for each file on disk. Files in manifest whose ID no longer exists on disk are removed. Files whose ID exists but path changed are updated in place. New files (ID not in manifest) are added and clustered into jumps by the 1800 s gap threshold.
- **Jump reclustering:** After adding/removing files, reclusters all files by mtime gaps (`> 1800 s` → new jump). Preserves jump metadata (id, label, confirmed) via majority voting: if a reclustered jump contains files from multiple original jumps, it inherits the id/label of the jump that contributed the most files.
- **Fresh manifest:** If no manifest exists, creates `version:1, status:'proposed', date:today, files:[all], theory:[], jumps:[clustered]` from scratch.
- `find original_files -type f -printf '%T@\t%p\n' | sort -n | cut -f2-` gives time-sorted files.
- Writes manifest with `jq` via heredoc.

### 5.2 `web/app/lib/sequences.ts` — date/time formatting helpers

- Helpers: `formatSequenceDate` (`D M YYYY`), `formatDateForInput` (`D M YYYY` → `YYYY-MM-DD`), `formatSequenceTime` (`HH:MM`).

### 5.3 `reclusterJumps(manifest, preservedPaths?)` (api.manifest)

- `JUMP_GAP_SECONDS = 1800`.
- Dedupes duplicate `jump.id` first: if `seenIds` has id, assigns next `jump_N` and `Jump N` label.
- If `preservedPaths` given, collect `preservedJumps: Set<ManifestJump>` (per-object, not per-id) containing any jump with a preserved path. Each preserved jump’s files are kept as a single group (sorted but not split even if internal gap >1800) to avoid splitting a manually edited jump when it is shifted.
- Remaining files clustered by 1800 s gap, then `preservedGroups + groups` sorted by `min mtime`, then merged: adjacent groups with `curMin - lastMax ≤ 1800` are merged (allows drift-corrected jumps to coalesce).
- Previous jump mapping via `previousByPath` to preserve `label`/`confirmed`/`processed` via dominant vote; `usedIds` tracked via `preservedJumps.has(prev)`; preserved jumps keep original `id`/`label` via `[...preservedJumps].find(...)`.

### 5.4 `shiftFiles(manifest, paths, offset)`

- For each file in `manifest.files` and each `jump.files` where `path` in `paths`, save `originalMtime` if undefined, then `mtime += offset`. Updates both arrays (they are separate objects after JSON parse).

## 6. Execute

### 6.1 `execute_media.sh [manifest] [jumpId ...]`

- Default manifest `output/manifest.json`, `PROCESSED_DIR=output/processed`.
- If jump IDs given, process only those; else process all `jumps[] | select(.confirmed==true and .processed!=true)`.
- For each `jump_id`, reads the jump label from the manifest, sanitizes it (alphanumeric + `.` + `-` + `_`), and creates `mkdir -p processed/sanitized_label` with subdirs `videos/` and `photos/`. Files are renamed to `sanitized_label_YYYYMMDD_HHMMSS.ext` (24h format, based on file mtime).

### 6.2 `api.manifest` execute

- `execute-jumps` takes `jumpIds` (from Review React state `compareIds` filtered `!processed`; fallback all `confirmed && !processed` if empty), marks `confirmed=true`, saves, calls script with those ids, then reloads manifest, sets `jump.processed=true` for those ids, and sets `manifest.status` to `executed` if all processed, `confirmed` if some, else leaves `proposed`.

## 7. Simulation & Testing

### 7.1 `simulate_cameras.sh`

- Base `.sim` with `camera1/`, `camera2/`.
- Default: `today 09:00` base, `NUM_FILES=8` per camera, files every 30 s interleaved 15 s, `dd` random or `ffmpeg testsrc` if available, `touch -d @epoch`.
- `--dev-data`: 18 files mixed `JPG`/`MP4` (IDX%3==0 → JPG else MP4) across 2 days → 10 on `3 days ago 09:00` (5 at 09:00, 40 min gap, 5 at 09:46) and 8 on `2 days ago 10:00` (4 at 10:00, 45 min gap, 4 at 10:49) → 4 jumps total, demonstrates intra-jump 90 s gaps and inter-jump 40–45 min gaps. Alternates cameras per file.
- `create_file()` handles JPG vs MP4.

### 7.2 `watcher.sh`

- Polls `SKYDOCK_OUTPUT_DIR` (default `/workspace/output`), finds camera root (not intermediate dirs), calls `process_media.sh` on detection.

### 7.3 `test_pipeline.sh`

- `--clean` removes `.sim` and `output`, generates cameras, runs `process_media.sh` twice to test deduplication, asserts output exists, today folder exists, files copied, and second run copies 0.

## 8. Web App (React Router 8 Framework Mode, SSR)

### 8.1 Routes (`app/routes.ts`)

- `index` → `routes/home.tsx`, `review` → `routes/review.tsx`, `jump/:date/:jumpDir` → `routes/jump.tsx`, `api/file`, `api/library`, `api/jump`, `api/open`, `api/simulate`, `api/scan`, `api/manifest`.

### 8.2 Types (`app/lib/types.ts`)

- `FileEntry`, `Jump`, `DayGroup` for library view; `Manifest*` above; `CameraInfo` deprecated.
- `ManifestFile` no longer has `camera`.

### 8.3 `scanner.server.ts`

- `getOutputDirPath()` returns `SKYDOCK_OUTPUT_DIR` or `/workspace/output`. Used by all server loaders.

### 8.4 `fileId.server.ts`

- `computeFileId(filePath)` SHA-256 of head+tail+size, hex 16; `ensureManifestFileIds` adds `id` to every file in `manifest.files`, `theory`, and `jumps[].files` if missing or file exists, deduplicates via `idOwners` map.

### 8.5 `api.simulate.ts`

- `action({request})` with `formAction`:
  - `add-jump`: `simulate_cameras.sh --num-files 4` → `process_media.sh` both cams → `scan_media.sh` → `ensureManifestFileIds`.
  - default `reset dev data`: `rm -rf output`, `simulate_cameras.sh --clean --dev-data` → process → scan → ids.

### 8.6 `api.scan.ts`

- Only runs `scan_media.sh` (with `SKYDOCK_OUTPUT_DIR`) and `ensureManifestFileIds`; resets manifest from existing `original_files`.

### 8.7 `api.file.ts`

- `loader` with `?path=`: `path.resolve`, `fs.existsSync`, `fs.createReadStream` with `Range` support (`206` + `Content-Range`), MIME via extension. Uses `streamResponse` helper with `ReadableStream` and proper cleanup on `cancel()`.

### 8.8 `api.manifest.ts` — handlers (all arrow functions, `ok`/`fail` helpers)

- Helpers: `asString`, `asStringArray`, `requireManifest`, `requireJump`, `requireUnprocessed`, `removeProcessedDir`, `requireProcessedPaths`, `isAllProcessed`, `applyShift`, `ok`, `fail`.
- Handlers map: `update-label`, `confirm-jump`/`confirm-all` (kept for backward compat, not used for UI selection), `delete-jump` (also deletes `processed/sanitized_label` if `processed`), `create-jump`, `move-files` / `remove-files` (blocked if involved jump `processed`), `copy-files` (duplicates refs to target without splicing source, allows same `path` in multiple jumps, blocked if target `processed`), `reorder-files` (validates `filePaths` length equals current size and all paths belong to jump, then remaps `jump.files` order), `merge-jumps`, `calibrate-sequences` (computes `offset = min(ref)-min(target)`, `scope all` shifts all), `shift-sequences` (takes `paths`/`offsetSeconds`, checks processed, `shiftFiles` + `reclusterJumps(manifest, pathsSet)`), `reset-calibration` (restores `originalMtime` in both `files` and `jump.files`, deletes `cameraClockOffsetSeconds`, reclusters), `execute-jumps` (incremental, see §6.2; `jumpIds` from React state), `unprocess-jump` (deletes `processed/sanitized_label`, clears `processed`, sets `status` back to `confirmed` if was `executed`), `rename-file` (updates `filename` on a file in manifest or jumps).
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
- File count and time range on the right side
- A "Remove" link when files are selected (moves selected files out of this jump)
- A "Processed" badge with an "Undo" button if the jump has been processed
- A delete button

Card border color: amber if selected for comparison, blue if processed, gray otherwise. Highlights blue when a drag is hovering over it.

### 9.8 Jump Selection for Comparison

- Clicking a jump checkbox adds or removes it from the selection (max 2 jumps).
- Selected jumps appear in the Selected Jumps Panel on the right.
- This selection is for comparison and processing only; it is not saved to the manifest.
- When one or more jumps are selected, an option appears to edit the day assignment (not the time) for all selected jumps.

### 9.9 Day Groups

- Jumps are grouped by day based on the earliest file timestamp in each jump.
- Each day group has a header showing the date, total file count, number of jumps, and time range of all files in that day.
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
- Shows the file (video player or image).
- **Prev/Next** buttons or arrow keys navigate between files.
- **Escape** or the close button closes the preview.
- **Video cropping** (planned): A timeline below the video with draggable handles to select start/end frames. Smooth scrubbing without lag, even on large files.

### 9.15 Header Actions

- Displays date, jump count, and file count. Shows processed count.
- **Select All** button selects all jumps that are not yet processed.
- **+ Add Jump** button creates a new empty jump.

## 10. Dependencies & Tooling

- `jq` for JSON in bash, `cmp` for dedup, `exiftool` optional.
- Web: `react-router`, `react`, `oxfmt` (format), `oxlint` (lint), `vitest` (4 suites, 55+ tests), `vite-tsconfig-paths`.
- Scripts are bash only, no Python, no comments in generated scripts.

## 11. Coding Rules

- React Router 8 Framework Mode, SSR, `app/routes.ts` + `app/routes/` modules, `import from ./+types/...`.
- Arrow functions only, `type` over `interface`, never `any`, all exports at end, inferred returns.
- Data schemas (manifest, etc.) use Zod for runtime validation; types are inferred via `z.infer<typeof schema>`.
- Bash scripts use `jq`, no comments in generated scripts.
- `npm run check` (`typecheck` + `format:check` + `lint`) must pass before commit.
- "export" keywords must be at the end of the file and not before a const/variable, function or types
- we use camel case format for const/variables
- use "const" instead of "let" or "var" every time you can


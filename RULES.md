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
├── proposed_jumps.json       # Manifest (see §4)
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

## 4. Manifest (`output/proposed_jumps.json`)

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

### 5.1 `scan_media.sh`

- Requires `original_files/` to exist.
- `find original_files -type f -printf '%T@\t%p\n' | sort -n | cut -f2-` gives time-sorted files.
- Iterates sorted files, builds `ALL_FILES` JSON array and `JUMPS_JSON` by tracking `LAST_EPOCH`; when `mtime - LAST_EPOCH > 1800` closes current jump and starts new.
- Writes manifest with `jq` via heredoc, `cameras: []` not used.

### 5.2 `web/app/lib/sequences.ts` — ground truth for UI

- `Sequence = { id, files, date, startTime, endTime }` where `date = formatSequenceDate(startTime)` (`D M YYYY`).
- `getSequences(manifest)` sorts `manifest.files` by `mtime`, splits on gap `> 900 s` (15 min) into sequences. Used for left “Sequences by day” and timeline ground truth before refactor; now `groupJumpsByDay` is preferred but `getSequences` still exists for unassigned calc.
- Helpers: `formatSequenceDate`, `formatDateForInput` (`D M YYYY` → `YYYY-MM-DD`), `formatSequenceTime` (`HH:MM`), `formatClockOffset`.

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

- Default manifest `output/proposed_jumps.json`, `PROCESSED_DIR=output/processed`.
- If jump IDs given, process only those; else process all `jumps[] | select(.confirmed==true and .processed!=true)`.
- For each `jump_id`, `mkdir -p processed/jump_id` and `jq -r '.jumps[] | select(.id==$id) | .files[].path'` → `cp -p --update=none` each file.

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

- Helpers: `asString`, `asStringArray`, `requireManifest`, `requireJump`, `requireProcessedPaths`, `isAllProcessed`, `ok`, `fail`.
- Handlers map: `update-label`, `confirm-jump`/`confirm-all` (kept for backward compat, not used for UI selection), `delete-jump` (also deletes `processed/jumpId` if `processed`), `create-jump`, `move-files` / `add-to-jump` / `remove-files` (blocked if involved jump `processed`), `copy-files` (duplicates refs to target without splicing source, allows same `path` in multiple jumps, blocked if target `processed`), `reorder-files` (validates `filePaths` length equals current size and all paths belong to jump, then remaps `jump.files` order), `merge-jumps`, `update-start-datetime`, `reset-timestamps` (re-times jump files 30 s apart), `calibrate-sequences` (computes `offset = min(ref)-min(target)`, `scope all` shifts all), `shift-sequences` (takes `paths`/`offsetSeconds`, checks processed, `shiftFiles` + `reclusterJumps(manifest, pathsSet)`), `reset-calibration` (restores `originalMtime` in both `files` and `jump.files`, deletes `cameraClockOffsetSeconds`, reclusters), `execute-jumps` (incremental, see §6.2; `jumpIds` from React state), `unprocess-jump` (deletes `processed/jumpId`, clears `processed`, sets `status` back to `confirmed` if was `executed`).
- `loader` returns `{manifest}`. `action` dispatches via `handlers[formAction]`, `requireManifest`, `saveManifest` and returns `ok` with `manifest`.

## 9. Review UI (`app/routes/review.tsx`)

- **Loader:** `ensureManifestFileIds` then reads `proposed_jumps.json`.
- **Helpers:** `formatSize`, `formatTime`, `groupJumpsByDay` (jumps grouped by `getJumpDate` via `formatSequenceDate(min mtime)`), `getJumpBounds`.
- **State:** `selection: SelectionMap` (file-level), `lastClicked`, `editingDay`, `preview: PreviewState | null`, `copyMode: boolean`, `compareIds: string[]` (jump-level React state only for compare/process, not persisted), `showCompare`, `dragDataRef` (direct FileRow inter-jump), `trayDragRef` (staging tray), `jumpsByDay`, `filesInJumps`, `unassignedFiles = files.filter(not in jumps)`, `allFileIds = [...unassigned, ...jumps]`, `hasCalibration`, `selectedFiles` (file selection), `selectedCount`, `isSelectMode = selectedCount>0`, `processedCount` (no `confirmedCount`; `confirmed` not used for UI).
- **File selection:** `handleSelect` clones `SelectionMap` immutably; `shift` does range via `allFileIds` index; otherwise toggles `next[groupId][filePath]`. `lastClicked` updated. Clicking row when `isSelectMode` or `ctrl/meta/shift` selects, otherwise opens preview drawer; checkbox always selects.
- **Jump selection (React state only):** `handleCompareToggle(jumpId)` toggles `compareIds`: remove if present, else add (max 2 keeps `[prev[1], jumpId]` for compare). `isCompareSelected={compareIds.includes(jump.id)}` drives amber `border-amber-300 ring-1` and `ring-2` on timeline bar. No manifest `confirmed` write; `confirmed` only auto-set by `execute-jumps`.
- **Staging Tray (left column):** When `selectedCount>0` the page becomes `flex gap-6` with sticky `StagingTray` (`w-[300px] sticky top-6 max-h-[80vh]`) left and `flex-1 min-w-0` right content. Tray shows `selectedFiles` with filename + `✕` to deselect, `Move`/`Copy` radio (`copyMode`), `Clear` button, and `draggable` inner list (`handleTrayDragStart` groups `filePaths` by `groupId` into `sourceGroups` and sets `trayDragRef`, `effectAllowed = copyMode?'copy':'move'`). Hint `Drag this tray to a jump to move/copy`. Tray is the primary inter-jump drag source for far jumps; direct `FileRow` drag still works for short moves. On `Move` the tray clears `selection` after drop; on `Copy` it stays so file can be copied to multiple jumps (same `path` may exist in several jumps).
- **Drag & Drop:**
  - **Within-jump reorder:** `FileRow` is `draggable` with `dropPosition` (`above`/`below` → `border-t-2/b-2 border-blue-500`). `JumpCard` holds `hoveredFile`/`dropPosition`/`dragDataRef`/`withinJumpDropRef`. `handleRowDragOver` sets position via `midY`, `handleRowDrop` computes `filtered` (without dragged paths) and `insertIdx` then calls `onReorder` → `reorder-files`. `JumpCard` outer `onDragOver/onDrop` ignores `hoveredFile` and `withinJumpDropRef` to avoid conflict with inter-jump drop.
  - **Inter-jump (tray or direct):** `JumpCard` outer is `onDragOver`/`onDrop` target (disabled if `processed`, highlight `border-blue-400` when `isDragOver && !hoveredFile`). `Review.handleDrop` handles tray first (`copy-files` if `copyMode` else `move-files`/`add-to-jump` per `sourceGroups`), else falls back to `dragDataRef` (direct `FileRow` drag) with same `move-files`/`add-to-jump`. `JumpCard` `FileRow.onDragStart` sets both internal `dragDataRef` (for reorder) and parent `dragDataRef` (for direct inter-jump) with multi-select logic (`sel = jump.files.filter(selected)`, `toDrag = sel.length>0 && selection[file.path] ? sel : [fp]`).
- **FileRow:** checkbox + filename + time + size + `👁` preview button; `draggable` with `handleDragStart` that ignores checkbox/button; `selected` shows `bg-blue-100`. Supports `dropPosition` border for reorder.
- **JumpCard:** header `flex` with checkbox `checked={isCompareSelected}` `text-amber-600` (React state, no `disabled`), expand `▼/▶`, editable label (no time), `ml-auto` right side: `files • HH:MM–HH:MM`, `selectedCount`/`Remove`, `Processed` badge + `Undo` or `✕` delete. Border `amber` if `isCompareSelected`, `blue` if `processed`, else gray; `isDragOver` blue. Body lists `FileRow`s.
- **JumpDaySection:** day header with date (click to edit via `formatDateForInput` → `handleShiftDay` computes `offset = newNoon - oldNoon` and shifts all files of that day), `fileCount • jumps • HH:MM–HH:MM` (first–last file time via `dayStart`/`dayEnd`), `JumpCard`s (`onCompareToggle`, `onReorder`).
- **Unassigned:** amber card on top if `unassignedFiles.length>0`, shows `FileRow`s with `groupId='unassigned'`, hint `select to stage` (inter-jump via tray); still supports `onPreview`.
- **TimelineJumps:** per-day lanes stacked (`height = max(56, days*36)`), fixed `00:00→24:00` per lane (`DAY=86400`, `effectiveRange=DAY`, `pos` = time-of-day/DAY, `width` = duration/DAY, `hourTicks` `0,6,12,18,24`), bars `h-5` `minWidth 32px` `bg-blue/indigo` per day `bg-gray-400` if processed, `ring-2 amber` if `selectedIds`. Dragging bar (`onMouseDown`/`onTouchStart` sets `draggingJump`, `dragOffset` via `dx/w*DAY` snapped `900s` or `86400` with Shift) shows `pos(bounds.start+offset)` only for that jump; `draggedTime` overlay `formatSequenceDate/Time`. On `|off|≥60` calls `onShiftDay(jump.id, off, jumpPaths)` → `shift-sequences`; click without drag toggles `onSelect(jump.id)` (`compareIds`). `useEffect([dayGroups])` clears drag state.
- **SelectedJumpsPanel:** sticky `w-[320px]` shown when `compareIds.length>0`, lists selected jumps (`files • time • date`), `Clear`, `Compare` (enabled if `2`), `Process selected` (enabled if `some !processed`, calls `execute-jumps` with filtered `compareIds`).
- **CompareDrawer / PreviewDrawer:** `CompareDrawer` 2-col grid with file lists and previews, `Merge into` buttons → `merge-jumps`; `PreviewDrawer` right `520px` backdrop, video/img, `Prev/Next`, `Esc/←/→`.
- **Header:** title stats `date — N jumps, M files` plus `• N processed` and `• dates shifted`, actions `Select All` (sets `compareIds` to all `!processed`), `+ Add Jump`, `Reset dates` (if calibrated); no `Confirm All`/`Process` global (process via `SelectedJumpsPanel`).

## 10. Dependencies & Tooling

- `jq` for JSON in bash, `cmp` for dedup, `exiftool` optional.
- Web: `react-router`, `react`, `oxfmt` (format), `oxlint` (lint), `vitest` (4 suites, 55+ tests), `vite-tsconfig-paths`.
- Scripts are bash only, no Python, no comments in generated scripts.

## 11. Coding Rules

- React Router 8 Framework Mode, SSR, `app/routes.ts` + `app/routes/` modules, `import from ./+types/...`.
- Arrow functions only, `type` over `interface`, never `any`, all exports at end, inferred returns.
- Bash scripts use `jq`, no comments in generated scripts.
- `npm run check` (`typecheck` + `format:check` + `lint`) must pass before commit.

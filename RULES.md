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
├── .cache/                   # (live mode: empty — no proxies on disk; legacy: thumbs/filmstrip/logs)
│   ├── thumbs/{id}.jpg       # legacy only
│   ├── filmstrip/{id}/%04d.jpg
│   └── logs/{id}.log
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

### 5.0 Live without disk — `api/stream` + `api/hls` 360p (no proxies)

- **Live mode (current):** No `.cache` proxies on disk. `scanMedia()`/`watcher`/`api/scan` no longer spawn `generateProxies`. `output/.cache/thumbs` + `filmstrip` not used.
- **fMP4 streaming** (`api/stream.ts`): live-transcodes on demand via `ffmpeg` pipe to `Response` `Transfer-Encoding: chunked` `video/mp4` with `frag_keyframe+empty_moov+default_base_moof` (immediate `moov`, no tail Range). Used for thumbnails (`?thumb=1`) and crop bar fMP4 fallback. Concurrency capped `MAX_LIVE=6` (`SKYDOCK_LIVE_MAX`) `429 Retry-After:2`.
- **HLS streaming** (`api.hls.ts`): live-transcodes to `.cache/hls/{uuid}/` temp dir via `ffmpeg -f hls` with `hls_time=4`, `hls_list_size=0` (all segments). Returns `.m3u8` playlist on `GET /api/hls?path=&seek=`. Segments served from same endpoint with `&segment=seg000.ts`. Sessions keyed by `path:seek`, auto-cleaned after30s idle. Used for main video playback via `use-hls-player.ts` hook.
- **Hybrid approach:** `MediaPreview` uses HLS via `useHlsPlayer` for smooth adaptive seeking. `VideoCropper` shares the same `<video>` element — `video.currentTime` works through MSE. For far-seeks beyond buffered range, `onSeekCommit` updates `seekOffset` which restarts HLS from the new offset.
- **Thumb mode:** `GET /api/stream?thumb=1&w=320&t=0.5` → `ffmpeg -ss 0.5 -vframes 1 -vf scale=320:-2 -q:v 3 -f image2 pipe:1` `image/jpeg` `Cache-Control: public max-age=3600`. `video-grid-thumb.tsx` uses `IntersectionObserver`.
- **File ID:** Content-based `SHA-256(file)` streaming → 16 hex (`computeFileId`) — sole truth for `manifest.files[].id` and `jumps.json` refs (unchanged).
- **HW acceleration:** Live uses `-hwaccel auto` + `scale=360:-2` for simplicity; could switch to `vaapi/qsv` `scale_vaapi/scale_qsv` via `SKYDOCK_DRI_DEVICE` `/dev/dri/renderD128` if needed.
- Writes only `output/.status/scan.json` etc.; no `proxies.json` banner in live mode.

### 5.1 `scanMedia()` — merge-on-scan

- Requires `original_files/` to exist.
- **File discovery:** Recursively finds media files using `MEDIA_EXTENSIONS_SET` (union of `VIDEO_EXTENSIONS` and `PHOTO_EXTENSIONS`: mp4, mov, avi, mkv, mts, m4v, 3gp, jpg, jpeg, png, dng, raw, tif, tiff, heic, heif, arw, cr2, cr3, nef, orf, rw2, raf).
- **Merge behavior:** If `manifest.json` already exists, scans `original_files/` and merges new files into the existing manifest instead of regenerating it. Preserves all user edits (confirmed status, labels, file groupings, calibration offsets). Detects removed files even when all files are deleted from disk (runs merge against existing manifest).
- **File comparison:** Uses content-based file ID as the identity key (streaming `SHA-256(file)` → 16 hex via `computeFileId`). Computes ID for each file on disk. Files in manifest whose ID no longer exists on disk are removed. New files (ID not in manifest) are added and clustered into jumps by the 1800 s gap threshold.
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

- Polls `SKYDOCK_OUTPUT_DIR` (default `/workspace/output`), finds camera root (not intermediate dirs), calls `processMedia()` + `scanMedia()` on detection.

### 7.3 `testPipeline({ camDirs?, numFiles?, outputDir?, clean? })`

- `clean` removes `.sim` and `output`, generates cameras, runs `processMedia()` twice to test deduplication, asserts output exists, today folder exists, files copied, and second run copies 0.

## 8. Web App (React Router 8 Framework Mode, SSR)

### 8.1 Routes (`app/routes.ts`)

- `index` → `routes/home.tsx`, `review` → `routes/review.tsx`, `jump/:date/:jumpDir` → `routes/jump.tsx`, `api/file`, `api/library`, `api/jump`, `api/open`, `api/simulate`, `api/scan`, `api/manifest`, `api/status`, `api/stream`, `api/hls`.

### 8.2 Types (`@skydock/scripts/types`)

- All manifest types (`ManifestFile`, `ManifestJump`, `Manifest`, `ManifestStatus`) are defined in `@skydock/scripts/src/types.ts` and re-exported via `app/lib/types.ts`.
- `FileEntry`, `Jump`, `DayGroup` for library view are also exported from `@skydock/scripts`.

### 8.3 `scanner.server.ts`

- `getOutputDirPath()` returns `SKYDOCK_OUTPUT_DIR` or `/workspace/output`. Used by all server loaders.

### 8.4 `fileId.server.ts`

- Imports `computeFileId` and `ensureManifestFileIds` from `@skydock/scripts`. These add `id` to every file in `manifest.files`, `theory`, and `jumps[].files` if missing, deduplicates via `idOwners` map, and cleans legacy `thumbPath`/`filmstripDir` fields.

### 8.5 `api.simulate.ts`

- `action({request})` with `formAction`:
  - `add-jump`: `simulateCameras({ numFiles: 4 })` → `processMedia()` both cams → `scanMedia()` → `ensureManifestFileIds`.
  - default `reset dev data`: `rm -rf output`, `simulateCameras({ clean: true, devData: true })` → process → scan → ids.

### 8.6 `api.scan.ts`

- Runs `scanMedia()` directly, then `ensureManifestFileIds()`.

### 8.7 `api.file.ts`

- `loader` with `?path=`: `path.resolve`, `fs.existsSync`, `fs.createReadStream` with `Range` support (`206` + `Content-Range`), MIME via extension. Uses `streamResponse` helper with `ReadableStream` and proper cleanup on `cancel()`. Adds `Access-Control-Allow-Origin: *` for thumb canvas.

### 8.71 `api.status.ts` + `lib/status.server.ts` + `api/stream.ts` + `api/hls.ts`

- `status.server.ts` reads `output/.status/{scan,execute,process}.json` (written atomically via `*.tmp` + `mv`). `TaskStatus {state: idle|running|done|error, message, total, done, processing?:string[], startedAt, updatedAt}`. Running is considered stale after 120s without update.
- `api/status` `loader` returns `{ok:true, status: SystemStatus}` polled by review UI every2s.
- `api/stream.ts` `loader` `GET ?path=&w=360` or `?thumb=1&w=320` live-transcodes via fMP4. `api/hls.ts` `loader` `GET ?path=&seek=` live-transcodes to HLS segments, returns `.m3u8` playlist.

### 8.8 `api.manifest.ts` — handlers (all arrow functions, `ok`/`fail` helpers)

- Imports `loadManifest`, `saveManifest`, `reclusterJumps`, `shiftFiles`, `sanitizeLabel` from `@skydock/scripts`.
- Helpers: `asString`, `asStringArray`, `requireManifest`, `requireJump`, `requireUnprocessed`, `removeProcessedDir`, `requireProcessedPaths`, `isAllProcessed`, `applyShift`, `ok`, `fail`.
- Handlers map: `update-label`, `confirm-jump`/`confirm-all`, `delete-jump`, `create-jump`, `move-files` / `remove-files`, `copy-files`, `reorder-files`, `merge-jumps`, `calibrate-sequences`, `shift-sequences`, `reset-calibration`, `execute-jumps`, `unprocess-jump`, `rename-file`, `set-crop`.
- `loader` returns `{manifest}`. `action` dispatches via `handlers[formAction]`, `requireManifest`, `saveManifest` and returns `ok` with `manifest`.

## 9. Review UI — Logic (HTML/CSS independent)

> This section is the **behavioral spec** for the Review UI. It defines state, transitions and invariants. Markup, Tailwind classes and layout are presentation details in §9.20 and must not be part of logic assertions. Tests in `TODO-UI-COVERAGE.md` assert against this section, not against class names.

The Review UI is a single-page app `routes/review.tsx:27` that loads `manifest: Manifest|null` and lets the user group files into jumps. All logic below is pure and testable via `vitest` without DOM styling.

### 9.1 Pure helpers (no React)

- `groupJumpsByDay(jumps): DayGroup[]` (`components/review/utils.ts`) — groups by `min mtime` day, sorts days reverse-chronologically. Pure.
- `getJumpBounds(jump): {start, end}` (`components/review/utils.ts`) — `min mtime`/`max mtime` of `jump.files`. Pure.
- `reclusterJumps(manifest, preservedPaths?)` / `shiftFiles(manifest, paths, offset)` (`@skydock/scripts/clustering.ts`, `JUMP_GAP_SECONDS=1800`) — pure manifest transforms.
- `sanitizeLabel(label)` (`@skydock/scripts/utils.ts`) — pure.
- `formatTime(mtime)` / `formatBytes(size)` / `formatTimeCode(t, FPS=30)` — pure display helpers, tested in `ui-preview`.

### 9.2 State (in-memory, not persisted except where noted)

- `manifest: Manifest|null` — from loader `ensureManifestFileIds` → `loadManifest`. `null` → empty states (§9.7).
- `selection: SelectionMap = Record<groupId, Record<path, true>>` (`review.tsx:31`), `lastClicked: string|null` (`review.tsx:32`).
- `preview: PreviewState|null {files: ManifestFile[], index: number, label: string}` (`review.tsx:33`, `types.ts`).
- `copyMode: boolean` (`review.tsx:34`), `compareIds: string[]` max 2 (`review.tsx:35`), `showCompare: boolean` (`review.tsx:36`), `viewMode: 'list'|'grid'` (`review.tsx:37`).
- `systemStatus: SystemStatus|null` — polled `fetch('/api/status')` every 2s (`review.tsx:45`), `cancelled` flag on unmount.
- `preview.seekOffset: number` (`preview-drawer.tsx:20`) — HLS restart offset, `videoDuration: number` from `GET /api/duration` (ffprobe authoritative).
- `VideoCropper` internal: `{start?,end?}` crop, `zoomLevel: number` (1..50) + `viewOffset: 0.5`, `dragging: 'start'|'end'|'playhead'|null`, `scrubTime: number|null`, `playhead = baseSeek + video.currentTime` via `useSyncExternalStore` + `requestAnimationFrame` (`video-cropper.tsx:51`).
- `media-preview` state: `isLoading/useFallback/retryKey/error` via `useReducer` (`media-preview.tsx:14`), `LOADING_TIMEOUT_MS=20_000`.
- `hls` session key: `path:seek` (`api.hls.ts:74`), `active: Set<proc>` capped `MAX_LIVE=6` (`SKYDOCK_LIVE_MAX`).

### 9.3 Invariants

- `filesInJumps = Set(manifest.jumps.flatMap(files.path))` (`review.tsx:80`); `unassignedFiles = manifest.files.filter(p not in filesInJumps)` (`review.tsx:85`); `multiJumpFiles = Set(paths where count>1)` (`review.tsx:90`).
- `jumpsByDay` always derived, never mutated directly. `processed` jumps are read-only for drop/reorder.
- `compareIds` never persisted in `manifest`; `confirmed` is manifest-persisted execution flag, `processed` increments `manifest.status` → `executed` when all `processed`.
- `hasCalibration = files.some(originalMtime!==undefined)` (`review.tsx:109`) controls Reset dates.

### 9.4 Transitions — File selection (`review.tsx:114`)

- `handleSelect(groupId, path, ctrl/shift)` — toggles `selection[groupId][path]`; checkbox always toggles; `Ctrl/Meta` adds without clearing; `Shift` range from `lastClicked` via `allFileIds` (`review.tsx:101`); deselect last in group deletes `selection[groupId]`.

### 9.5 Transitions — Staging tray (`components/review/staging-tray.tsx`)

- Visible iff `selectedCount>0`. `Clear` → `setSelection({})`. `Move/Copy` toggle → `dataTransfer.effectAllowed` `move` vs `copy`. Dragging tray → `trayDragRef {filePaths, sourceGroups: Record<groupId, string[]>}` grouped, `text/x-staging-tray` set.

### 9.6 Transitions — Drag & drop (`review.tsx:168`)

- `handleDragStart(filePaths, sourceJumpId)` → `dragDataRef`. `handleReorder(jumpId, filePaths)` → `reorder-files`. `handleDrop(targetJumpId)` with `trayDragRef` → per `sourceGroups` entry `copy-files` if `copyMode` else `move-files`; clears selection after move. With `dragDataRef` → `move-files` or `copy-files` if unassigned. `dragDataRef/trayDragRef` nulled in `finally`. Processed target rejected.

### 9.7 Transitions — Empty & header (`review.tsx:363`)

- `!manifest` → "No Manifest Found" + Scan; `status==='empty'` → "No Files to Review"; banners per `SystemStatus` (`scan:running → Scanning`, `process → Copying`, `execute → Processing`, `done → idle in 5s`).

### 9.8 Transitions — Jump & timeline (`components/review/jump-card.tsx`, `timeline-jumps.tsx`)

- `onCompareToggle(jumpId)` → toggle `compareIds` max 2. `expand/collapse` toggles `viewMode` globally. `onLabelSave → update-label`, `onShiftJump → shift-sequences` with `offsetSeconds`. `Timeline bar click` → `onSelect(compareIds)`, `drag bar` → `onShiftDay(handleShiftOffset)` snaps 15min / 24h with Shift, commits only if `|offset|≥60s`.

### 9.9 Transitions — Selected/Compare/Preview (`review.tsx:274`, `components/review/preview-drawer.tsx`)

- `SelectedJumpsPanel` appears `compareIds.length>0`, `Clear→[]`, `Compare→setShowCompare(true)` enabled only when 2, `Process→execute-jumps filtered !processed`, `Change Day → newNoon-oldNoon → shift-sequences` per jump.
- `CompareDrawer` when `showCompare&&compareJumps` 2 columns, `Merge into → merge-jumps sourceJumpIds:[target,source]`, closes + clears `compareIds`.
- `PreviewDrawer` `handlePreview(files,index,label) → setPreview`; `handlePreviewPrev/Next` wrap `(index±1+len)%len`; `Escape`/`arrow keys` → `onClose`/`onPrev`/`onNext`; `videoRef` shared `baseSeek` hybrid seeking.

### 9.10 Transitions — Video cropper (`components/review/video-cropper.tsx`)

- `seekTo(time)` clamps `0..safeDuration`, `relative = time-baseSeek`, if `relative in video.buffered` → `video.currentTime=relative` else `onSeekCommit(clamped)`.
- `timeFromX(clientX)` via `getBoundingClientRect`. Wheel zoom centered on cursor `zoomFactor 1.2` `MAX_ZOOM 50` → `viewOffset`. `pointer down` pauses if `!paused` + `setPointerCapture` + `dragging`; `pointer move` start `min(time,cropEnd-0.1)` / end `max(time,cropStart+0.1)` / playhead `seekTo`; `pointer up` clears. `Start here/End here → setCrop({start/end: currentTime}) + seekTo`; `Apply → set-crop filePath,cropStart,cropEnd`.

### 9.11 Transitions — Streaming (`routes/api.stream.ts`, `api.hls.ts`, `use-hls-player.ts`)

- `api/stream` fMP4 `?path=&w=&seek=` → `buildBaseArgs` + `scale=W:-2` + `FFMPEG_VIDEO/AUDIO_FLAGS` + `frag_keyframe+empty_moov` chunked `video/mp4`, 429 if `active.size≥MAX_LIVE`. Thumb `?thumb=1&w=&t=`.
- `api/hls` `?path=&seek=` → `buildHlsArgs` `hls_time 4` `seg%03d.ts` `playlist.m3u8` `rewritePlaylist` `&segment=`, session `path:seek` 30s TTL `setTimeout 30_000`, `request.signal abort → proc.kill`.
- `useHlsPlayer` lazy `import('hls.js')` `isSupported→MSE` else native, `maxBufferLength:30/60` `stopLoad→destroy` on src change/unmount, `NETWORK_ERROR→startLoad` `MEDIA_ERROR→recoverMediaError`.

### 9.12 Presentation (non-logic, not asserted in `TODO-UI-COVERAGE`)

Layout, Tailwind classes, colors/borders (`amber/blue/gray`), `content-visibility:auto`, `dark:` variants, `IntersectionObserver` thumbs, hour markers 0/6/12/18/24, tooltips, `List/Grid` icon, filter pills `▶ 12`/`▣ 11` are presentation details. They live in `*.tsx` JSX and may change without breaking logic tests which assert against state + `fetcher.submit` payloads + `fetch` calls, not class names.

### 9.13 Video Preview & Live Streaming — Details

#### Server — dual endpoints

1. **fMP4** (`api/stream`): `ffmpeg -hwaccel auto -i src -vf scale=W:-2 -c:v libx264 -preset ultrafast -tune zerolatency -crf 28 ... -movflags frag_keyframe+empty_moov+default_base_moof -f mp4 pipe:1`. Chunked `video/mp4`, `Accept-Ranges: none`, `Cache-Control: no-store`. Used for thumbnails and crop bar fMP4 fallback. `seek` query param: when provided, ffmpeg starts from that offset (`-ss seek`). Concurrency capped at `MAX_LIVE` (default 6). Returns `429 Retry-After:2` when full.

2. **HLS** (`api.hls`): `ffmpeg ... -hls_time 4 -hls_list_size 0 -hls_segment_filename {dir}/seg%03d.ts -f hls {dir}/playlist.m3u8`. Returns `.m3u8` playlist (`Content-Type: application/vnd.apple.mpegurl`). Segments served via `&segment=seg000.ts` (`Content-Type: video/mp2t`). Sessions keyed by `path:seek`, auto-cleaned after30s idle. Used for main video playback.

#### Client — `use-hls-player.ts` hook

- Lazy-loads `hls.js` on client only (dynamic `import()`). `Hls.isSupported()` → use MSE; fallback to native HLS (`canPlayType('application/vnd.apple.mpegurl')`).
- Config: `enableWorker`, `lowLatencyMode`, `maxBufferLength: 30`, `maxMaxBufferLength: 60`, `startFragPrefetch`.
- Bandwidth: `stopLoad()` before `destroy()` on seek/unmount, session reuse for same `path:seek`, 30s idle cleanup, `MAX_LIVE=6` throttling (429).
- Fatal error handling: `NETWORK_ERROR` → `startLoad()`, `MEDIA_ERROR` → `recoverMediaError()`, fallback to fMP4/raw on fatal.
- `destroy()` on unmount and on `src` change. Tested in `video-ux` (29) and `hls-lifecycle` (20) suites.

#### `MediaPreview` — HLS playback

- Primary: `useHlsPlayer` with `src=/api/hls?path=&seek=`. `<video>` element managed by hls.js via MSE.
- Fallback: on HLS error, switches to `useFallback` mode with `src=/api/file?path=` (raw file).
- Loading timeout20s with spinner. Retry resets state. "Fallback to original" button.

#### Duration — ffprobe only

- `ffprobe` (`/api/duration`): runs `ffprobe -show_entries format=duration` on the original file. Returns the **true, complete duration** in one shot. This is the authoritative value for the crop bar.
- Browser-reported durations from `<video>` are ignored for the crop bar.

#### Crop bar interaction (hybrid approach)

- `VideoCropper` shares the same `<video>` element as the HLS player.
- `video.currentTime` works through MSE — seeking within buffered range is instant.
- `seekTo()` checks `video.buffered` ranges. For out-of-buffer seeks, calls `onSeekCommit` which updates `seekOffset` in `PreviewDrawer`, restarting HLS from the new offset.
- `baseSeek` offsets the playhead display for far-seek scenarios.

## 10. Dependencies & Tooling

- `tsx` for running TypeScript scripts directly (zero-config).
- `zod` for runtime validation of manifest data.
- `cmp` for file dedup comparison, `exiftool` optional for metadata extraction.
- `ffmpeg` for live on-demand transcoding via `api/stream` (fMP4 + thumbs) and `api/hls` (HLS segments).
- Web: `react-router`, `react`, `hls.js` (HLS client), `oxfmt` (format), `oxlint` (lint), `vitest` (10 suites,145 tests: `seek`, `api.stream`, `api.hls`, `video-ux` (29), `hls-lifecycle` (20), `api.manifest`, `review`, `timeline` etc.), `vite-tsconfig-paths`.
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

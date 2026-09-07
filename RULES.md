# RULES — SkyDock App Logic

> Single source of truth for how SkyDock works. Covers scripts, output layout, scan/cluster, deduplication, web UI, manifest and API.

## 1. Overview

SkyDock copies media from DJI Osmo Nano cameras to a local folder tree, groups files into skydiving jumps by time gaps, lets the user review/correct dates and regroup, then copies confirmed jumps to `processed/`. No camera identity is tracked — cameras are treated as plain external storage merged into date folders.

**Pipeline:** `Connect cameras` → `processMedia()` → `scanMedia()` → `Home (web UI)` → `executeMedia()` → `output/processed/`

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
├── manifest.json             # File registry — source of truth (see §4)
├── jumps.json                # Jumps — lightweight refs (see §4)
└── processed/                # After per-jump Process
    ├── jump_1/
    │   ├── DJI_0001.MP4
    │   └── ...
    └── jump_2/
        └── ...
```

- `output` defaults to `/workspace/output` or `SKYDOCK_OUTPUT_DIR`.
- `original_files/YYYY-MM-DD/` uses file `mtime` and preserves timestamps for scan grouping.

## 3. Deduplication (`processMedia()`)

- For each file: determine target date from capture date (exiftool or mtime fallback), destination is `original_files/targetDate`.
- If destination file exists and content matches → skip (same content).
- If destination file exists but content differs → copy (overwritten on camera).
- If destination file doesn't exist → copy.
- Preserves timestamps during copy.
- Writes status file for API polling.

## 4. Manifest (`output/manifest.json` + `output/jumps.json`)

- `manifest.json` is **file registry** (source of truth, written by `scan` when files appear/disappear). `jumps.json` is **workspace** (jump grouping, labels, confirmed/processed status).
- All types (`ManifestFile`, `ManifestJump`, `Manifest`, `ManifestStatus`) are inferred from Zod schemas via `z.infer<typeof schema>` — never defined separately.
- `loadManifest` merges both files; `saveManifest` splits them. Old single-file format auto-migrates on first load.
- `scanMedia()` creates a new manifest with status `proposed`, today's date, all files, and clustered jumps.
- `files` is flat list of all files sorted by `mtime`.
- `jumps[].files` are lightweight refs — same file may appear in multiple jumps via copy. In-memory manifest resolves refs to full files for UI/execute.
- Jump IDs are `jump_1 ...` or preserved original IDs after recluster; labels default to `Jump N` and are editable.
- `originalMtime` saved on first time shift to allow reset-calibration.
- `processed` marks per-jump execution (incremental). Manifest status becomes `executed` only when every jump is processed, `confirmed` when some processed, otherwise `proposed`.
- Jump selection for compare/process is React state in Review UI, not persisted in manifest.

## 5. Scan & Cluster

### 5.0 Live without disk

- **Live mode (current):** No proxies on disk. Scan/watcher/API no longer spawn proxy generation.
- **fMP4 streaming:** Live-transcodes on demand via ffmpeg pipe. Used for thumbnails and crop bar fallback. Concurrency capped.
- **HLS streaming:** Live-transcodes to temp directory. Returns playlist on request. Sessions keyed by path and seek offset, auto-cleaned after idle timeout. Used for main video playback.
- **Hybrid approach:** MediaPreview uses HLS for smooth adaptive seeking. VideoCropper shares the same video element. For far-seeks beyond buffered range, seek offset updates restart HLS from the new offset.
- **Thumb mode:** Single frame extraction for grid thumbnails and crop bar filmstrip using IntersectionObserver.
- **File ID:** Content-based SHA-256 hash → 16 hex characters — sole truth for manifest file IDs and jump refs.

### 5.1 `scanMedia()` — merge-on-scan

- Requires `original_files/` to exist.
- **File discovery:** Recursively finds media files using supported extensions (video: mp4, mov, avi, mkv, mts, m4v, 3gp; photo: jpg, jpeg, png, dng, raw, tif, tiff, heic, heif, arw, cr2, cr3, nef, orf, rw2, raf).
- **Merge behavior:** If manifest exists, scans `original_files/` and merges new files into existing manifest. Preserves all user edits (confirmed status, labels, file groupings, calibration offsets). Detects removed files.
- **File comparison:** Uses content-based file ID as identity key. Files in manifest whose ID no longer exists on disk are removed. New files are added and clustered into jumps.
- **Jump reclustering:** After adding/removing files, reclusters all files by mtime gaps (>1800 seconds → new jump). Preserves jump metadata via majority voting.
- **Fresh manifest:** If no manifest exists and files are found, creates new manifest from scratch.
- Writes status file for API polling.

### 5.2 `reclusterJumps()`

- Gap threshold: 1800 seconds.
- Deduplicates jump IDs first.
- If preserved paths given, keeps those jumps as single groups (not split even if internal gap >1800) to avoid splitting manually edited jumps.
- Remaining files clustered by gap, then preserved and new groups sorted and merged if adjacent.
- Previous jump mapping preserves label/confirmed/processed via dominant vote.

### 5.3 `shiftFiles()`

- For each file in paths, saves original mtime if undefined, then adjusts mtime by offset. Updates both file registry and jump references.

## 6. Execute

### 6.1 `executeMedia()`

- Default manifest `output/manifest.json`, processed directory `output/processed`.
- If jump IDs given, process only those; else process all confirmed and unprocessed jumps.
- For each jump: reads label, sanitizes it, creates directory structure with `videos/` and `photos/` subdirectories. Files renamed to standard format based on mtime. If crop range set and ffmpeg available, video is cropped.
- Writes status file for API polling.

### 6.2 API execute

- Takes jump IDs from Review UI state, marks them confirmed, saves, executes, then marks them processed. Updates manifest status accordingly.

## 7. Simulation & Testing

### 7.1 `simulateCameras()`

- Creates simulated camera directories with test files.
- Default: today at 09:00, 8 files per camera, files every 30 seconds interleaved.
- Dev data mode: 18 files across 2 days → 4 jumps total, demonstrates intra-jump gaps and inter-jump gaps.

### 7.2 `watcher()`

- Polls output directory, finds camera roots, calls process and scan on detection.

### 7.3 `testPipeline()`

- Generates cameras, runs process twice to test deduplication, asserts output exists and files copied correctly.

## 8. Web App (React Router 8 Framework Mode, SSR)

### 8.1 Routes

- Home page at `/` (`routes/home.tsx`) with jump grouping, selection, drag and drop, and preview. API endpoints for file serving, library, jumps, file opening, simulation, scanning, manifest operations, status, streaming, and HLS.

### 8.2 Types

- All manifest types defined in scripts package and re-exported via web app.
- `home` reuses `ManifestFile`/`ManifestJump` from `@skydock/scripts` via `web/app/components/types.ts`.
- Shared UI lives in `web/app/components/` (flat, no `review/` subfolder).
- Additional types for library view also exported from scripts.

### 8.3 Server Utilities

- Output directory path resolution uses environment variable or default.
- File ID computation and manifest file ID enforcement.

### 8.4 API Endpoints

- **Simulate:** Actions to add jumps or reset dev data.
- **Scan:** Runs scan and ensures file IDs.
- **File:** Serves files with range support and proper MIME types.
- **Status:** Reads status files, returns system status polled by review UI.
- **Thumb:** Single frame JPEG extraction via ffmpeg for crop bar thumbnails.
- **Stream:** Live-transcodes to fMP4 for thumbnails and crop bar fallback.
- **HLS:** Live-transcodes to HLS segments for main playback.
- **Manifest:** Full CRUD for jumps, files, calibration, execution.

## 9. Home — Review UI — Logic

> This section is the **behavioral spec** for the Review UI. It defines state, transitions and invariants.

The Review UI is mounted at `/` (`routes/home.tsx`) and lets the user group files into jumps. Home runs on local fixture jumps (`useState`, `groupJumpsByDay`) with no loader and no manifest. Sections marked `Full Review (not in home)` describe the loader-backed app and are not mounted in home.

### 9.1 Pure helpers

- Groups jumps by minimum mtime day, sorts days reverse-chronologically.
- Returns minimum and maximum mtime of jump files.
- Pure manifest transforms for reclustering and time shifting.
- Pure label sanitization.
- Display helpers for time, bytes, and timecodes.

### 9.2 State (in-memory, not persisted except where noted)

Home state:

- `jumps` — local fixture jumps, grouped for display.
- `selection` — tracks selected files by group.
- `lastClicked` — for shift-range selection.
- `preview` — files, current index, and group for preview drawer.
- `compareIds` — max 2 jump IDs for comparison.
- `dropDialog` — pending cross-jump move/copy dialog.
- `dropHint` — insertion index indicator during drag.
- `dragDataRef` — packaged drag payload, cleared after drop.

Full Review state (loader-backed app, not in home):

- `manifest` — from loader. Null triggers empty states.
- `showCompare` — toggle for compare drawer.
- `viewMode` — list or grid display.
- `systemStatus` — polled from API every 2 seconds.
- Preview state includes seek offset for HLS restart.
- VideoCropper internal state: crop range, zoom, dragging, scrub time.
- Media preview state: loading, fallback, retry key, error.
- HLS session key: path and seek offset.

### 9.4 Transitions — File selection

- Toggle selection per file. Checkbox always toggles. Ctrl/Meta adds without clearing. Shift selects range from last clicked. Deselect last in group deletes group.

### 9.5 Transitions — Staging tray

- Visible when files selected. Clear resets selection. Acts as holding area for files to be moved or copied to other jumps.

### 9.6 Transitions — Drag & drop

All drag and drop operations follow these rules:

#### 9.6.1 Drag sources

| Source       | Behavior                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| File row     | Packages file paths and source jump. If multiple files selected, carries all selected paths. |
| Staging tray | Packages files grouped by source jump. Always available when files are selected.             |

#### 9.6.2 Drop targets

| Target    | Behavior                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Jump card | Shows dialog at mouse position with Move, Copy, or Cancel options. Clears selection after operation. |
| Same jump | Reorders files directly. No dialog, no copy within same jump.                                        |

#### 9.6.3 Constraints

- Processed jumps cannot receive drops (rejected).
- Drag references are cleared after drop completes.
- Drop indicator shows above/below position during drag over file rows.

#### 9.6.4 Staging tray

- Visible when files are selected.
- Acts as holding area for files to be moved or copied.
- Drag source only, not a drop target.
- Clear button resets selection.

#### 9.6.5 User interactions

- Moving files within a jump reorders them.
- Moving or copying files between jumps shows dialog with Move, Copy, Cancel options.
- If target jump is far away, use tray as intermediate step: select files, scroll to target, drag from tray.

### 9.7 Transitions — Timeline drag (Full Review, not in home)

- Timeline bar click selects jump for comparison.
- Timeline bar drag shifts jump day with snap options (15min or 24h with Shift key).
- Drag commits only if offset ≥ 60 seconds.
- Processed jumps cannot be dragged.

### 9.8 Transitions — Empty & header

- No manifest shows "No Manifest Found" with Scan button. Empty status shows "No Files to Review". Banners per system status: scanning, copying, processing. Scan button disabled when scanning.

### 9.9 Transitions — Jump & timeline

- Compare toggle limited to 2 jumps. Expand/collapse toggles view mode. Label save updates jump. Shift jump adjusts timestamps.

### 9.10 Transitions — Selected/Compare/Preview

- Selected jumps panel appears when jumps selected. Clear resets. Compare enables only with 2. Process executes unprocessed. Change Day shifts all selected jumps.
- Compare dialog shows 2 columns side-by-side with jump navigation (< >) to cycle through all jumps independently, skipping the other side's current jump. Each side shows file list and preview panel (video with read-only time bar/zoom, or image). Merge button present (no-op for now). Close dismisses dialog.

### 9.11 Transitions — Video cropper

- The VideoCropper component lives inside the PreviewDrawer (right panel), directly below the video player for video files.
- **Thumbnail filmstrip:** Small JPEG thumbnails rendered along the crop bar background, loaded lazily via `/api/thumb/` endpoint. Thumbnails are positioned by time offset and scale with zoom level. Hidden when zoom level too low for meaningful resolution.
- Seek to time clamps to valid range. Checks if time is buffered, seeks directly or commits offset. Time from screen position via bounding rect. Wheel zoom centered on cursor. Pointer events for dragging crop markers. Start/End here sets crop points. Apply saves crop to manifest.
- **UI optimistic crop bar:** The blue playhead and crop range (start/end handles, blue selection region) must move instantly and be fully draggable across the entire bar, regardless of video loading state. The video may still be loading/buffering, but the crop UI must never block or lag behind user input. Dragging start/end handles or clicking the bar updates the visual position immediately; video seek happens asynchronously.
- Quick timestamp switching: clicking the crop bar seeks the video. Users can rapidly jump between timestamps by clicking different positions on the zoomable time bar.
- **Zoom pinned to cursor hover:** Mouse wheel zooms centered on cursor hover position (1x–5x range). The time under the cursor stays pinned to that screen position while zoom changes around it.
- The crop bar shares the same video element as the player — seek changes propagate immediately.

### 9.12 Transitions — Streaming (Full Review, not in home)

- fMP4 endpoint live-transcodes with hardware acceleration. Returns chunked video with proper headers. Concurrency capped with retry headers.
- HLS endpoint live-transcodes to segments. Returns playlist. Sessions auto-cleaned after idle timeout. Request abort kills process.
- HLS player lazy-loads library. Uses MSE if supported, else native. Configures buffer lengths. Handles network and media errors gracefully. Destroys on unmount.

### 9.13 Presentation (non-logic)

- Layout, styling, colors, content visibility, thumbnails, hour markers, tooltips, icons, filter pills are presentation details. They live in JSX and may change without breaking logic tests.

### 9.14 Video Preview & Live Streaming — Details (Full Review, not in home)

#### Server — dual endpoints

1. **fMP4:** Live-transcodes with hardware acceleration. Used for thumbnails and crop bar fallback. Seek parameter for offset. Concurrency capped with retry headers.
2. **HLS:** Live-transcodes to segments. Returns playlist. Sessions keyed by path and seek, auto-cleaned after idle. Used for main playback.

#### Client — HLS player hook

- Lazy-loads library on client only. Uses MSE if supported, else native fallback.
- Configures worker, low latency, buffer lengths, fragment prefetch.
- Manages bandwidth with stop/destroy on seek/unmount, session reuse, idle cleanup, concurrency throttling.
- Fatal error handling with network recovery, media error recovery, fallback to raw.

#### MediaPreview — HLS playback

- Primary: HLS via player hook. Video element managed by library.
- Fallback: on error, switches to raw file mode.
- Loading timeout with spinner. Retry resets state.

#### Duration — ffprobe only

- ffprobe returns true complete duration in one shot. Authoritative value for crop bar.
- Browser-reported durations ignored for crop bar.

#### Crop bar interaction (hybrid approach)

- VideoCropper lives inside PreviewDrawer, directly below the video player.
- VideoCropper shares video element with HLS player.
- Video.currentTime works through MSE within buffered range.
- For out-of-buffer seeks, offset updates restart HLS from new offset.
- Base seek offsets playhead display for far-seek scenarios.
- Quick timestamp switching: clicking the crop bar seeks the video instantly.
- Zoom on crop bar: mouse wheel zooms centered on cursor position (1x–5x).

### 9.15 Visual UI Preview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SkyDock                                                          [Scan]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Review Proposed Jumps                                                       │
│ 2026-08-24 — 3 jumps, 12 files                              [Reset dates]  │
│                                                                             │
│ ┌─ Unassigned files • 2 ──────────────────────────────────────────────────┐ │
│ │ not in any jump — select to stage                                        │ │
│ │ ☐ DJI_0007.MP4                              10:45:32        125.3 MB    │ │
│ │ ☐ DJI_0008.JPG                              10:46:01          8.2 MB    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ 2026-08-24                                            3 jumps ─────────── │
│                                                                             │
│ ┌─ Jump 1 (3 files) ─────────────────────────────────────────────────────┐ │
│ │ ☐ DJI_0001.MP4                              09:12:05        245.1 MB   │ │
│ │ ☐ DJI_0002.MP4                              09:15:33        198.7 MB   │ │
│ │ ☐ DJI_0003.JPG                              09:16:01          9.4 MB   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ Jump 2 (2 files) ─────────────────────────────────────────────────────┐ │
│ │ ☐ DJI_0004.MP4                              10:02:11        312.5 MB   │ │
│ │ ☐ DJI_0005.MP4                              10:05:47        287.3 MB   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ Jump 3 (5 files) ─────────────────────────────────────────────────────┐ │
│ │ ☐ DJI_0009.MP4                              11:30:22        156.8 MB   │ │
│ │ ☐ DJI_0010.MP4                              11:33:45        203.1 MB   │ │
│ │ ☐ DJI_0011.JPG                              11:34:01          7.9 MB   │ │
│ │ ☐ DJI_0012.MP4                              11:37:18        178.4 MB   │ │
│ │ ☐ DJI_0013.JPG                              11:37:55          8.1 MB   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ Selected Jumps Panel ─────────────────────────────────────────────────┐  │
│ │ 2 jumps selected    [Clear] [Compare] [Process selected] [Change Day]  │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key UI elements:**

- **Header:** SkyDock link + Scan button
- **Status banner:** Shows scanning/copying/processing state
- **Unassigned files:** Files not in any jump, highlighted amber
- **Day groups:** Jumps organized by date with jump count
- **Jump cards:** Expandable cards showing files with size/time
- **File rows:** Checkbox, filename, timestamp, size, preview button
- **Selection panel:** Appears when jumps selected for compare/process
- **Duplicate highlighting:** Files in multiple jumps shown with purple background
- **Calibration indicator:** Shows when dates have been shifted

## 10. Dependencies & Tooling

- `tsx` for running TypeScript scripts directly.
- `zod` for runtime validation of manifest data.
- `cmp` for file dedup comparison, `exiftool` optional for metadata extraction.
- `ffmpeg` for live on-demand transcoding via streaming endpoints.
- Web: React Router, React, HLS client library, formatting tools, linting tools, testing framework with multiple test suites.
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
- Never use "import" inside of the code, all import words must be listed at the top of the files
- E2E and browser tests always use the most visually realistic user simulation to avoid false positives: `userEvent` from `vitest/browser` (`page`, `userEvent.dragAndDrop`/`userEvent.click`/`userEvent.fill`) or `locator.dropTo`/`dragTo` with Playwright provider. Never synthesize `new DragEvent`/`new MouseEvent` + `dispatchEvent` — they bypass `preventDefault` checks, `DataTransfer` sharing, and viewport hit-testing. For drag & drop, use `userEvent.dragAndDrop(source, target, { targetPosition })` (or `source.dropTo(target)`) with `targetPosition: {x,y}` for above/below precision; pre-scroll the drop target into view first so no auto-scroll breaks the gesture mid-drag. Assert DOM order via `expect.poll`, persistence via stubbed `action`, and visual state via `page.screenshot`.
- When app code changes, tests are the source of truth: adapt the code to the tests first. Tests change only when explicitly requested or when RULES.md behavior changes
- Never call an endpoint using a string URL; always use the typesafe `routingEngine` (`routingEngine.href({ url })`, `useSafeFetcher`, `useSafeSubmit`) with routes from the generated `Register`
- Server actions always use `createValidatedFormAction` with a Zod schema; field errors via `errors.addFieldError`, global errors via `errors.addGlobalError`, and return `errors.toResponse(422)` when `errors.hasErrors()`
- Shared routing and form logic lives in `@skydock/ui` (`routingEngine`, safe hooks, validated actions); never reimplement endpoint calls per route
- Never use React memoization (`useCallback`, `useMemo`, `memo`) — React Compiler handles memoization automatically; write plain functions and values

## 12. Rule Changes

> RULES.md is the single source of truth. Any change that impacts a rule must follow this process.

**Before implementing any change that may affect RULES.md:**

1. **Identify impact:** Check if the change modifies any behavior described in §1-§11.
2. **Warn user:** Present the affected sections and proposed modification.
3. **Get approval:** Wait for user confirmation before proceeding.
4. **Update RULES.md:** After implementation, update the relevant section(s) to reflect the new behavior.
5. **Commit together:** Commit code changes and RULES.md updates in the same commit.

**Examples of rule-impacting changes:**

- Modifying manifest structure or file registry behavior
- Changing scan/cluster thresholds or algorithms
- Altering drag & drop operations or selection logic
- Adding/removing API endpoints or changing their behavior
- Modifying video preview, streaming, or crop interactions
- Changing deduplication or file comparison logic

**Non-rule changes (no warning needed):**

- Bug fixes that preserve existing behavior
- Refactoring that doesn't change external behavior
- Presentation/styling changes (§9.13)
- Test additions or updates

**Commit rule:** No commit is ever made until the user explicitly requests it. All changes are staged and reviewed before committing.

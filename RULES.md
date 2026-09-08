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
- For each jump:
  - Skip if no files.
  - Require complete passenger (firstname, lastname, email) — refuse otherwise.
  - Build base name: `{firstname}_{lastname}_{YYYYMMDD}` (all lowercase, jump date).
  - Create `videos/` and `photos/` subdirectories only if files of that type exist.
  - File naming: `{baseName}_{HHMMSS}.{ext}` where HHMMSS comes from original file capture time.
  - Collision: if two files share the same capture time, add counter suffix: `_1`, `_2`.
  - If crop range set and ffmpeg available, video is cropped.
  - Set filesystem timestamps (creation + modification) to jump date + original capture time.
  - Set EXIF metadata dates (creation + modification) to match filename date-time.
  - On re-process: move existing processed folder to `output/.trash/` before creating new one.
  - Mark jump processed, clear publish state, save manifest.
- Writes status file for API polling.

### 6.2 Manifest action intents

- save-jumps persists the working jump list.
- merge-jumps combines two jumps server-side with a date anchor for the merged files.
- process-jump runs `executeMedia` for one jump with complete passenger details, marks it processed and clears its publish state.
- upload-jump uploads one processed jump to network storage using Synology DSM API. Binary comparison via SHA-256 hash skips files already present. Upload uses 10 MB chunks. Per-file progress tracked. Failed uploads retry from beginning. Share link reused if already exists; otherwise created via FileStation Sharing API.

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
- **Manifest:** Full CRUD for jumps, files, calibration, execution. Intents: save-jumps, merge-jumps (with date anchor), process-jump (requires complete passenger), upload-jump (requires processed jump and configured storage).

## 9. Review UI (`/`)

> Behavioral spec for the Review UI: state, interactions and invariants.

Mounted at `/` (`routes/home.tsx`). The loader reads the manifest; jumps live in React state and persist through the `save-jumps` manifest action, while selection stays in memory. Sections under §9.7 are planned behavior, not mounted.

### 9.1 Pure helpers

- Groups jumps by minimum mtime day, sorts days reverse-chronologically.
- Returns minimum and maximum mtime of jump files.
- Pure manifest transforms for reclustering and time shifting.
- Pure label sanitization.
- Display helpers for time, bytes, and timecodes.

### 9.2 State

#### 9.2.1 Mounted state

- `jumps` — working copy of manifest jumps, grouped for display.
- `selection` — selected files by group; `lastClicked` — anchor for shift-range selection.
- `preview` — drawer files, current index, and group.
- `compareIds` — max 2 jump IDs for comparison; `showComparison` — comparison dialog toggle.
- `dropDialog` — pending cross-jump move/copy dialog; `dropHint` — insertion index indicator; `dragDataRef` — drag payload, cleared after drop.
- `videoCrop`, `videoZoom`, `videoCurrentTime`, `videoDuration` — active preview video state.

#### 9.2.2 Planned state (not mounted)

- `viewMode` — list or grid display.
- `systemStatus` — polled from API every 2 seconds.
- Preview seek offset for HLS restart; HLS session key (path and seek offset).
- Media preview state: loading, fallback, retry key, error.

### 9.3 Organizing files

#### 9.3.1 Selecting files

- Toggle selection per file. Checkbox always toggles. Ctrl/Meta adds without clearing. Shift selects range from last clicked. Deselect last in group deletes group.

#### 9.3.2 Staging tray

- Visible when files are selected. Clear resets selection. Acts as holding area for files to be moved or copied to other jumps.
- Drag source only, never a drop target.

#### 9.3.3 Drag & drop

All drag and drop operations follow these rules:

**Drag sources**

| Source       | Behavior                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| File row     | Packages file paths and source jump. If multiple files selected, carries all selected paths. |
| Staging tray | Packages files grouped by source jump. Always available when files are selected.             |

**Drop targets**

| Target    | Behavior                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------- |
| Jump card | Shows dialog at mouse position with Move, Copy, or Cancel options. Clears selection after operation. |
| Same jump | Reorders files directly. No dialog, no copy within same jump.                                        |

**Constraints**

- Processed jumps cannot receive drops (rejected).
- Drag references are cleared after drop completes.
- Drop indicator shows above/below position during drag over file rows.

**User interactions**

- Moving files within a jump reorders them.
- Moving or copying files between jumps shows dialog with Move, Copy, Cancel options.
- If target jump is far away, use tray as intermediate step: select files, scroll to target, drag from tray.

### 9.4 Browsing jumps

#### 9.4.1 Empty states & header

- No manifest shows "No Manifest Found" with a Scan button; the button is disabled while scanning.
- Status banners reflect copying/scanning/processing activity.

#### 9.4.2 Day groups & jump cards

- Jumps grouped by day, days newest-first with per-day jump counts.
- Compare checkbox per card, max 2 jumps. Cards expand/collapse. Each card has Process and Upload buttons (Process needs complete passenger details, shows a spinner while busy and Reprocess once done; Upload needs a processed jump) with a Processed badge; the expanded card shows the share section (link, copy, mail) once published. The card title shows the passenger name once firstname and lastname are set, otherwise the jump label. The expanded card shows passenger names as labels (click to edit) or an Add passenger button; Done saves to the manifest, Cancel discards drafts.

### 9.5 Comparing & merging jumps

#### 9.5.1 Selection panel

- Appears when jumps are selected. Clear resets selection. Compare appears only with exactly 2 selected and opens the comparison dialog.

#### 9.5.2 Compare dialog

- Two columns side-by-side with jump navigation (< >) to cycle through all jumps independently, skipping the other side's current jump. Each side shows file list and preview panel (video with read-only time bar/zoom, or image). Close dismisses dialog.

#### 9.5.3 Merge

- Merge opens a date popup (left jump's date, right jump's date, or custom date+time) and combines the two currently displayed jumps into the left one (union of files by path, sorted by mtime; confirmed only if both were confirmed; never processed).
- Merged files shift rigidly so the earliest lands on the chosen anchor; the chosen side keeps its exact times.
- Merge is disabled when either jump is processed. After merge the dialog closes and selection clears.

### 9.6 Video cropping

The VideoCropper component lives inside the PreviewDrawer (right panel), directly below the video player for video files. It shares the same video element as the player — seek changes propagate immediately.

#### 9.6.1 Crop bar

- Seek clamps to the valid range; seeks directly when buffered, otherwise commits an offset. Time maps from screen position via bounding rect. Crop markers drag with pointer events. Start/End here sets crop points. Apply saves crop to manifest.
- **Optimistic UI:** the blue playhead and crop range (start/end handles, blue selection region) move instantly and stay draggable across the entire bar regardless of video loading state; video seek happens asynchronously.
- Clicking the bar switches timestamps instantly for rapid seeking.

#### 9.6.2 Filmstrip

- Small JPEG thumbnails rendered along the crop bar background, loaded lazily via `/api/thumb/` endpoint. Thumbnails are keyframe-only fast seeks (`skip_frame nokey`, no audio, 80px wide, lanczos downscale, medium JPEG quality) so all 8 load in well under a second. Positioned by time offset and scale with zoom level.

#### 9.6.3 Zoom

- Mouse wheel zooms centered on cursor hover position (1x–10x range, exponential steps so ~12 notches span the full range). The time under the cursor stays pinned to that screen position while zoom changes around it.
- A Reset button appears next to the zoom value whenever zoom is not 1x; clicking it restores 1x.

### 9.7 Planned — not mounted

#### 9.7.1 Timeline drag

- Timeline bar click selects jump for comparison.
- Timeline bar drag shifts jump day with snap options (15min or 24h with Shift key).
- Drag commits only if offset ≥ 60 seconds.
- Processed jumps cannot be dragged.

#### 9.7.2 Streaming endpoints

- fMP4 endpoint live-transcodes with hardware acceleration. Returns chunked video with proper headers. Concurrency capped with retry headers.
- HLS endpoint live-transcodes to segments. Returns playlist. Sessions auto-cleaned after idle timeout. Request abort kills process.
- HLS player lazy-loads library. Uses MSE if supported, else native. Configures buffer lengths. Handles network and media errors gracefully. Destroys on unmount.

#### 9.7.3 HLS playback details

**Server — dual endpoints**

1. **fMP4:** Live-transcodes with hardware acceleration. Used for thumbnails and crop bar fallback. Seek parameter for offset. Concurrency capped with retry headers.
2. **HLS:** Live-transcodes to segments. Returns playlist. Sessions keyed by path and seek, auto-cleaned after idle. Used for main playback.

**Client — HLS player hook**

- Lazy-loads library on client only. Uses MSE if supported, else native fallback.
- Configures worker, low latency, buffer lengths, fragment prefetch.
- Manages bandwidth with stop/destroy on seek/unmount, session reuse, idle cleanup, concurrency throttling.
- Fatal error handling with network recovery, media error recovery, fallback to raw.

**MediaPreview — HLS playback**

- Primary: HLS via player hook. Video element managed by library.
- Fallback: on error, switches to raw file mode.
- Loading timeout with spinner. Retry resets state.

**Duration — ffprobe only**

- ffprobe returns true complete duration in one shot. Authoritative value for crop bar.
- Browser-reported durations ignored for crop bar.

**Crop bar interaction (hybrid approach)**

- VideoCropper lives inside PreviewDrawer, directly below the video player.
- VideoCropper shares video element with HLS player.
- Video.currentTime works through MSE within buffered range.
- For out-of-buffer seeks, offset updates restart HLS from new offset.
- Base seek offsets playhead display for far-seek scenarios.
- Quick timestamp switching: clicking the crop bar seeks the video instantly.
- Zoom on crop bar: mouse wheel zooms centered on cursor position (1x–10x).

### 9.8 Presentation (non-logic)

- Layout, styling, colors, content visibility, thumbnails, hour markers, tooltips, icons, filter pills are presentation details. They live in JSX and may change without breaking logic tests.

### 9.9 Layout reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SkyDock                                                          [Scan]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Review Proposed Jumps                                                       │
│ 2026-08-24 — 3 jumps, 12 files                                              │
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
│ │ 2 jumps selected    [Clear] [Compare]                                    │  │
│ └──────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key UI elements:**

- **Header:** SkyDock link + Scan button
- **Status banner:** Shows scanning/copying/processing state
- **Unassigned files:** Files not in any jump, highlighted amber
- **Day groups:** Jumps organized by date with jump count
- **Jump cards:** Expandable cards showing files with size/time
- **File rows:** Checkbox, filename, timestamp, size, preview button
- **Selection panel:** Appears when jumps selected for compare
- **Duplicate highlighting:** Files in multiple jumps shown with purple background

## 10. Dependencies & Tooling

- `tsx` for running TypeScript scripts directly.
- `zod` for runtime validation of manifest data.
- `cmp` for file dedup comparison, `exiftool` optional for metadata extraction.
- `ffmpeg` for live on-demand transcoding via streaming endpoints.
- Web: React Router, React, formatting tools, linting tools, testing framework with multiple test suites.
- Scripts are TypeScript only, no Python, no comments in generated scripts.
- Scripts package: `@skydock/scripts` — pipeline (`process`, `scan`, `execute`, `watcher`) plus dev (`simulate`, `test-pipeline`) and shared libs (`lib/exif`, `lib/fs`, `lib/cli`, `workspace`, `manifest`, `clustering`); no `proxies` script.

## 11. Coding Rules

- React Router 8 Framework Mode, SSR, `app/routes.ts` + `app/routes/` modules, `import from ./+types/...`.
- Arrow functions only, `type` over `interface`, never `any`, all exports at end, inferred returns.
- Never explicitly type function return types — let TypeScript infer them.
- Data schemas use Zod for runtime validation; types are inferred via `z.infer<typeof schema>` — never defined separately.
- Write the cleanest, most reusable, most readable, most reduced code possible — no verbosity, no redundancy.
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
- Never commit without explicit user approval
- Never use bypass eslint comment code like // eslint-disable-next-line react/set-state-in-effect for example

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
- Presentation/styling changes (§9.8)
- Test additions or updates

**Commit rule:** No commit is ever made until the user explicitly requests it. All changes are staged and reviewed before committing.

## 13. Tandem passenger publishing

> How tandem jumps go from processed files to the passenger's inbox.

### 13.1 Passenger details

- Each jump can carry the tandem passenger's first name, last name and email address.
- Passenger details are optional while reviewing, and jumps without them fall back to the jump label wherever a name is needed. Processing a jump requires all three fields.
- They are edited on the jump card and saved with the rest of the workspace.

### 13.2 Naming

- Folder: `{firstname}_{lastname}_{YYYYMMDD}` (all lowercase, jump date).
- Files: `{firstname}_{lastname}_{YYYYMMDD}_{HHMMSS}.{ext}` (HHMMSS from original capture time).
- Date source: jump date (from scan or manually updated). If updated, re-processing applies the new date.
- Time source: original file capture time (follows date if updated).
- Collision: counter suffix only when needed: `_1`, `_2`.
- Videos and photos keep separate subdirectories.
- Empty subdirectories are not created.
- EXIF metadata dates (creation + modification) match filename date-time.

Example:

```
output/processed/bim_bam_20260829/
├── videos/
│   ├── bim_bam_20260829_113015.mp4
│   └── bim_bam_20260829_113015_1.mp4
└── photos/
    └── bim_bam_20260829_182506.jpg
```

### 13.3 Per-jump lifecycle

- Each jump moves through proposed, processed, uploaded, in that order.
- The Process button is available once a jump has files and all three passenger fields are set. Processing copies and renames the files and marks the jump processed; re-processing clears any previous publishing state.
- The Upload button is only enabled for processed jumps and starts the upload immediately.
  - Upload destination: processed folder placed directly inside the user's selected NAS folder: `{NAS_FOLDER}/{baseName}/...`
  - Binary comparison: each file compared by SHA-256 hash. Files with matching hash on NAS are skipped.
  - Chunked upload: files uploaded in 10 MB chunks.
  - Progress: each file shows a progress bar with percentage.
  - Failure: on upload failure, retry from beginning.
  - Share link: reused if already exists. Otherwise created via Synology FileStation Sharing API and stored on the jump.

### 13.4 Freshness rules

- Re-processing a jump moves the existing processed folder to `output/.trash/` before creating the new one.
- Re-processing a jump discards its share link and sent record, because the files changed and the old link is stale.
- Merged jumps start unpublished, with no link and no sent record.
- Re-uploading replaces the share link and resets the sent record for the same reason.

### 13.5 Secrets

- NAS session ID (`sessionId`), hostname, and username are stored in `output/.status/nas.json`. Password is never written to disk.
- On app restart, the stored session ID is reused if still valid on the NAS. If expired, the user is prompted to re-enter credentials.
- Mail credentials removed — email uses prefilled `mailto:` link, user sends manually.

### 13.6 NAS connection

- On first upload (or when no valid session exists), a connection dialog appears asking for NAS hostname, username, and password.
- On successful login, the session ID is saved to `output/.status/nas.json` (password is not saved).
- On app restart, the stored session ID is validated. If still active, connection is ready without re-login. If expired, the login dialog reappears.
- The user can disconnect or update credentials, which clears the stored session.

### 13.7 NAS folder browser

- Custom visual file-tree browser displays NAS folder structure.
- Folders expand/collapse on click.
- "Create Folder" button allows creating new folders inline.
- User selects a destination folder for processed uploads.
- Selected folder stored in `output/.status/nas.json` as default destination.
- Future uploads go directly to default folder (unless user changes it).

### 13.8 Upload progress

- Each file being uploaded displays a progress bar with percentage.
- Upload uses 10 MB chunks for accurate progress calculation.
- Overall upload status shows which file is currently uploading.
- On failure, upload retries from beginning of failed file.

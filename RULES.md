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
├── groups.json               # Groups — lightweight refs (see §4)
└── processed/                # After Process (see §6.1)
    ├── Yverdon/                        # destination
    │   ├── yverdon_20260101_103000.mp4 # loose files in the destination
    │   └── ...
    ├── Tandems/                        # destination
    │   └── Luc Favre/                  # passenger folder — the name as typed, never dated
    │       ├── videos/
    │       └── photos/
    └── group_1_20260829/               # group without destination
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

## 4. Manifest (`output/manifest.json` + `output/groups.json`)

- `manifest.json` is **file registry** (source of truth, written by `scan` when files appear/disappear). `groups.json` is **workspace** (group grouping, labels, confirmed/processed status, destination assignments).
- All types (`ManifestFile`, `ManifestGroup`, `Manifest`, `ManifestStatus`) are inferred from Zod schemas via `z.infer<typeof schema>` — never defined separately.
- `loadManifest` merges both files; `saveManifest` splits them. Old single-file format auto-migrates on first load.
- `scanMedia()` creates a new manifest with status `proposed`, today's date, all files, and clustered groups.
- `files` is flat list of all files sorted by `mtime`.
- `groups[].files` are lightweight refs (`id` + `cropStart`/`cropEnd` + `keep`) — same file may appear in multiple groups via copy. In-memory manifest resolves refs to full files for UI/execute. A cropped video that is moved or copied retains its crop in the target; a copy's crop is independent — it can be uncropped or re-cropped to a different range without affecting the source (crop is stored per group ref, not per file registry).
- Group IDs are `group_1 ...` or preserved original IDs after recluster; labels default to `Group N` and are editable. For fun groups `label` holds the location (`yverdon`, `colombier`) and acts as `Group` name — see §13.2.
- Each `Group` in `groups.json` is a regroupment where `EXIF createdAt` gap `<1800s` (30 mins) → same `Group`, otherwise new `Group` (`scan` and `+ Create Group` share same logic). Each `Group` gets a mandatory `date` (`YYYY.MM.DD` locale `de-CH`, e.g. `24.08.2026`) by default the minimum `EXIF createdAt` of its files (fallback `mtime` if `EXIF` missing), stored as `day` and used for grouping and `execute` base name. `+ Create Group` empty `Group`s store `day` to keep them under the selected `Day` (files empty → `getGroupDate` falls back to `day`).
- `keep` on a group file ref marks whether the file takes part in processing. Absent or `true` means it does; `false` means it was removed in the UI and is skipped by `execute` (the source file is never touched).
- `originalMtime` saved on first time shift to allow reset-calibration.
- `processed` marks per-group execution (incremental). Manifest status becomes `executed` only when every group is processed, `confirmed` when some processed, otherwise `proposed`.
- Group selection for compare/process is React state in Review UI, not persisted in manifest.
- `destination` field on groups links them to destinations for NAS upload organization.
- Two records on a manifest file say what has become of it, and they are **facts with evidence**, not flags someone has to remember to clear (§14.5):
  - `processed` = `{ path, size, at, source: { id, size, mtime, cropStart, cropEnd } }` — where `execute` wrote the copy **and the exact inputs that produced it**. Change any of those inputs and the copy on disk is no longer this file's copy.
  - `uploaded` = `{ remotePath, md5, size, localPath, at }` — proof that those bytes are on the NAS, written only by the upload path (§12.3).
  - They replace the old bare `processedPath`, which is still read once on load and migrated (its record is stamped `size: 0, at: 0`, meaning "unverified", until the next process writes a real one).
- A **grouped** file's crop lives on its group ref in `groups.json` (`resolveGroups` merges it onto the resolved file); a **lone** file's crop lives on its registry entry, because it has no ref to hold it. `execute` stamps whichever one it actually copied.

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
- **A merge keeps what the registry knows and lets the disk win on what the disk measures** (`{ ...entry, ...disk }`): `destination`, crops, `keep` and the processed/uploaded records survive a rescan, while `size`/`mtime`/`id` come fresh from disk — so a file that really did change invalidates its own records through the stamp comparison. Replacing the entry with the bare disk object used to drop the destination of every lone file whenever a scan added or removed a single file.
- **File comparison:** Uses content-based file ID as identity key. Files in manifest whose ID no longer exists on disk are removed. New files are added and clustered into jumps.
- **Jump reclustering:** After adding/removing files, reclusters all files by `EXIF createdAt` gaps (`<1800s` → same `Jump`, `≥1800s` → new `Jump`, fallback `mtime` if `EXIF` missing). Preserves jump metadata via majority voting. New `Jump`s get mandatory `date` = `min EXIF` of its files (same rule as `+ Create Group`).
- **Fresh manifest:** If no manifest exists and files are found, creates new manifest from scratch.
- Writes status file for API polling.

### 5.2 `reclusterJumps()`

- Gap threshold: `1800s` on `EXIF createdAt` (fallback `mtime` if missing) — `<1800s` same `Jump`, `≥1800s` new `Jump`. `scan` and `+ Create Group` share same `Jump` creation logic.
- Each new `Jump` gets mandatory `date` = `min EXIF` of its files.
- Deduplicates jump IDs first.
- If preserved paths given, keeps those jumps as single groups (not split even if internal gap >1800) to avoid splitting manually edited jumps.
- Remaining files clustered by gap, then preserved and new groups sorted and merged if adjacent.
- Previous jump mapping preserves `label`/`day`/`confirmed`/`processed`/`destination` via dominant vote. A preserved group additionally keeps its `publish`; a group rebuilt by dominant vote does not, because its files changed and the published folder is stale (§12.4). Losing `destination` on a rescan would silently undo the user's sorting, so it is preserved on both paths.

### 5.3 `shiftFiles()`

- For each file in paths, saves original mtime if undefined, then adjusts mtime by offset. Updates both file registry and jump references.

### 5.4 `regroupLooseFiles()`

- Clusters only files that are in no group and have no `destination`, by the same `1800s` gap rule as the scan. Existing groups are left alone, so sorting work already done is never disturbed.
- New groups are built by `groupFromFiles` (§5.5).
- Returns the number of groups created; the caller refuses the request when that is zero.

### 5.5 `groupFromFiles()`

- Builds one group from a given list of files: a fresh `group_N` id that collides with nothing, `label` = that id, `confirmed: false`, `day` = `formatDay(min mtime)`, files sorted by mtime, and the `destination` passed in (omitted when there is none). Returns `null` for an empty list.
- `regroupLooseFiles` uses it for every batch it makes, and `move-files` uses it for `newGroup` (§6.2), so there is exactly one place that decides what a newly made group looks like.

## 6. Execute

### 6.1 `executeMedia()`

- Default manifest `output/manifest.json`, processed directory `output/processed`.
- Scope (one call, server-side loop):
  - `groupIds` given → only those groups; each group's folder is rebuilt, nothing else is touched.
  - `destination` given → every group with that `destination` plus every loose file in it (`file.destination` set, not in any group). The whole `processed/{destination}/` folder is moved to `.trash` and rebuilt.
  - Neither → everything: every destination (as above) plus every group without destination. `confirmed`/`processed` flags do not filter — processing always rebuilds from `manifest.json` + `groups.json`.
- Output folder: a **tandem** group (complete passenger) → `processed/{destination}/{Passenger Name}/` with `videos/` and `photos/` inside; a **flat fun jump** (destination, no passenger) → straight into `processed/{destination}/`, no folder of its own and no subdirectories; a group with no destination at all → `processed/{baseName}/`; loose destination files → `processed/{destination}/` flat.
- For each jump/group:
  - Skip if no files.
  - Passenger is optional for `Process` — if `passenger` with `firstname`/`lastname` present use `firstname_lastname`, otherwise use `label` (`yverdon`, `colombier`, `Jump N`) sanitized lowercased. Passenger is only mandatory for `Email`/`Share` generation.
  - Build base name: `{base}_{YYYYMMDD}` where `base` is `firstname_lastname` or `label` (all lowercase, jump/group date). For `Group` (`label=yverdon`) on `2026-08-02` → `yverdon_20260802`.
  - Reprocessing always writes to the same folder — never numbered folder variants (`_1`, `_2`).
  - Create `videos/` and `photos/` subdirectories only if files of that type exist.
  - File naming: `{baseName}_{HHMMSS}.{ext}` where HHMMSS comes from original file capture time.
  - Collision: if two files share the same capture time, add counter suffix: `_1`, `_2`.
  - If crop range set and ffmpeg available, video is cropped.
  - Set filesystem timestamps (creation + modification) to jump date + original capture time.
  - Set EXIF metadata dates (creation + modification) to match filename date-time.
  - Before writing, only a folder a **single group owns** is moved to `output/.trash/` — that is, a tandem's passenger folder, so a stale `.kdenlive` and the old zips inside it go to `.trash` too. A **destination folder is never rebuilt**, whatever the scope of the request: it is shared by every day ever shot there, while the manifest only holds what the last scan found, so binning it would take older days with it. Flat fun jumps therefore overwrite their own files in place. Stale files are removed precisely instead, through `processedPath` (§4) when a file is removed from the board. `.trash` is never pruned automatically.
  - Mark jump processed, clear publish state, save manifest.
  - **Stamp each file it copied** with the `processed` record (§4), taking the crop from the file as copied — the group ref's crop for a grouped file — and **clear its `uploaded` record**: a fresh copy is not the copy that went to the NAS. If the bytes turn out identical, the next upload's dedup pass restores it without sending anything.
- Writes status file for API polling.

### 6.2 Manifest action intents

- Every mutating intent answers with the same evidence — `groups`, `looseFiles` and `outputs` (what the disk says about each processed copy) — because the board computes a file's status from all three. An answer that left `looseFiles` out left lone files showing a stale status until a reload.
- save-groups persists the working group list and, through `fileUpdates`, a lone file's `destination` and crop (named fields only, matched on `id` then `path`). Renaming a group's passenger, label or destination **drops the processed and uploaded records of its files**: the output belongs to a folder that is no longer theirs, and no source input changed, so the stamp alone would not notice.
- merge-jumps combines two jumps server-side with a date anchor for the merged files.
- process runs `executeMedia` in a single request: with `groupId` for one group (per-group `Process` button), with `groupIds` for a set of groups (the board's per-day `Process` button), with `destination` for one destination (`Process Destination` button), or with none of them for everything (`Process All` button). Passenger optional — label `yverdon` used if no passenger. Marks processed groups and clears their publish state. The client never loops over groups/files. A failure inside `executeMedia` (missing `exiftool`, failed `ffmpeg` crop) is returned as a `422` with the message in `globalErrors` so the UI can show it, never as an unhandled `500`.
- upload-jump uploads one processed jump to network storage using Synology DSM API (requires NAS session and chosen upload folder, see §12.3). Binary comparison via SHA-256 hash skips files already present. Upload streams with byte-accurate progress. Per-file progress tracked. Failed uploads retry from beginning. Share link reused if already exists; otherwise created via FileStation Sharing API.
- shift-jump-time shifts all file timestamps in a jump so the minimum-time file lands on the chosen anchor epoch. Other files keep their existing time diffs. Used by the per-jump time picker.
- regroup-loose re-clusters the files that belong to no group and carry no `destination` — the sorting area — into fresh jumps using the same `GROUP_GAP_SECONDS` rule as the scan (`regroupLooseFiles`, §5.4). Groups already filed to a destination are never touched, and a loose file deliberately assigned to a destination stays loose. Refuses with a 422 when there is nothing to regroup. Returns the saved groups and the remaining loose files.
- move-files takes `fileIds` and either an optional `destination`, a `targetGroupId`, or `newGroup`. With `newGroup` the files are gathered into a fresh group carrying that `destination` (`groupFromFiles`, §5.5) — the only way loose files become a tandem, which needs a group to hold the passenger name. A file that lands in a group never keeps a `destination` of its own: `file.destination` is what marks a lone file (§13.1), and a file carrying both would be counted twice. With `targetGroupId` the files leave their current group and join that one, sorted back into mtime order, and the target is marked unprocessed because its contents changed; an unknown id is refused with a 422. The files leave whatever group holds them, their `destination` is set (or cleared, which sends them back to the sorting area as loose files), and any group left empty is dropped. Because the files no longer belong where they were processed, each one's processed copy is deleted from disk and **both records are cleared** — a copy that cannot be deleted does not fail the move.

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

- Board at `/` (`routes/board.tsx`) — the everyday sorting view (see §14).
- Classic view at `/classic` (`routes/home.tsx`) with jump grouping, selection, drag and drop, and preview (see §9). It keeps scan, NAS connection and calibration. Compare/merge lives in both views — one `ComparisonDialog`, one `merge-groups` intent (§9.5, §14.2).
- API endpoints for file serving, library, jumps, file opening, simulation, scanning, manifest operations, status, streaming, and HLS.

### 8.2 Types

- All manifest types defined in scripts package and re-exported via web app.
- `home` reuses `ManifestFile`/`ManifestJump` from `@skydock/scripts` via `web/app/components/types.ts`.
- Shared UI lives in `web/app/components/` (flat, no `review/` subfolder) — `FileRow` for list, `FileGrid` for `grid` squares (same selection/preview/drag contract).
- Additional types for library view also exported from scripts.

### 8.3 Server Utilities

- Output directory path resolution uses environment variable or default.
- File ID computation and manifest file ID enforcement.

### 8.4 API Endpoints

- **Simulate:** Actions to add jumps or reset dev data.
- **Scan:** Runs scan and ensures file IDs.
- **File:** Serves files with range support and proper MIME types.
- **Status:** Reads status files, returns system status polled by review UI.
- **Thumb:** Single frame JPEG extraction via ffmpeg for crop bar thumbnails and `FileGrid` `160px` squares (`/api/thumb?seek=0.5&width=160`, `loading=lazy`). It serves **photos as well as videos** — a video is seeked to a keyframe, a photo is simply rescaled. The board uses it for every thumbnail: a 2 MB JPEG comes back as roughly 1 kB, which is what makes a card of several hundred photos affordable to display.
- **Stream:** Live-transcodes to fMP4 for thumbnails and crop bar fallback.
- **HLS:** Live-transcodes to HLS segments for main playback.
- **Manifest:** Full CRUD for jumps, files, calibration, execution. Intents: save-groups (answers with the saved `groups` **and** `destinations`), merge-groups (with date anchor), shift-group-time (shifts file times to anchor), process (`groupId` / `groupIds` / `destination` / all — see §6.2), move-files (§6.2), regroup-loose, upload-group (`groupId` / `groupIds` / `destination`; requires processed groups and a NAS session — see §12.3).
- **Upload progress:** `/api/upload-progress?scope=` returns the current record, or `null` when the stored one belongs to another scope (§12.8).
- **Remote files:** `/api/remote-files` lists the NAS folders named by the `uploaded` records and returns `{ ok, dirs, sizes, at }`, or `{ ok: false, reason }` when there is no session. Read-only — it never writes the manifest (§14.5).

## 9. Review UI (`/classic`)

> Behavioral spec for the Review UI: state, interactions and invariants.

Mounted at `/classic` (`routes/home.tsx`). The loader reads the manifest; jumps live in React state and persist through the `save-jumps` manifest action, while selection stays in memory. Sections under §9.7 are planned behavior, not mounted.

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
- `viewMode` — `'list' | 'grid'` display mode, toggled in `ReviewHeader`, propagated to `JumpCard`/`Unassigned`/`DayGroups`. `FileGrid` renders square `160px` thumbnails via `getThumbUrl(path,0.5,160)` with `loading=lazy`, cropped `✂️` badge and video `▶` overlay, same `onSelect`/`onPreview`/`onDragStart` contract as `FileRow`.

#### 9.2.2 Planned state (not mounted)

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

- Jumps grouped by day, days newest-first with per-day jump counts. Each `Day` header shows `+ Create Group` — creates an empty `Group` for that day with `label` (`yverdon`/`colombier` via prompt, stored in `day` field when empty) that appears under the day and is droppable like any jump (files dragged in adapt date via `shiftFiles`). Empty `Group` is kept under its `Day` via `day` fallback.
- Compare checkbox per card, max 2 jumps. Cards expand/collapse. Each card (`Jump`/`Group`) has Process and Upload buttons — `Process` is enabled when `files.length>0` (no passenger required; `label` `yverdon` used for fun, `firstname_lastname` for tandem, fallback `Jump N`), shows spinner while busy and `Reprocess` once done; `Upload` needs a processed jump (plus NAS connection and upload folder, see §12.3; passenger only for `Email` generation) with a `Processed` badge; the expanded card shows the share section (link, copy, mail) once published. The card title shows the passenger name once `firstname`/`lastname` set, otherwise the `label` (`yverdon`). The expanded card shows passenger names as labels (click to edit) or an `Add passenger` button; `Done` saves to the manifest, `Cancel` discards drafts.
- Expanded card file list respects `viewMode`: `list` renders `FileRow` (`filename`, `time`, `size`, `Cropped ✂️` badge, `multiple-jump` highlight); `grid` renders `FileGrid` (`3×` `4×` `5×` squares, `aspect-square`, `160px` thumbs via `/api/thumb` for video else `/api/file` for photo, `loading=lazy`, filename overlay, `✂️` cropped badge top-right, `▶` video overlay, `ring-blue`/`ring-purple` selection). Row click when `hasSelection` selects instead of preview; `FileGrid` drill-down `setSelected+load` for `NasFolderBrowser` is separate.
- The expanded card also shows a clickable start time (`⏰ HH:MM:SS`) derived from the minimum file mtime. Clicking opens a `<input type="time">` editor; saving shifts all file timestamps via `shift-jump-time` so the earliest file lands on the chosen time, preserving relative offsets between files.

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

The VideoCropper component lives inside the PreviewDrawer (right panel), directly below the video player for video files. It shares the same video element as the player — seek changes propagate immediately. Crop is per jump copy: moving a cropped video keeps its crop; copying creates an independent crop that can be cleared or changed without affecting the original.

#### 9.6.1 Crop bar

- Seek clamps to the valid range; seeks directly when buffered, otherwise commits an offset. Time maps from screen position via bounding rect. Crop markers drag with pointer events. Start/End here sets crop points. **Apply saves the crop and closes the drawer** — it is the end of the job, and what changed (the ✂ and the file's status) is on the card behind it. **Reset crop** goes through the same save with an empty range but **leaves the drawer open**: clearing a crop is usually the first half of setting a different one.
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

## 11. Rule Changes

> RULES.md is the single source of truth. It must never fall behind the code — but keeping it current is a duty to document, not a reason to stop and ask.

**Implement, document, report.** On a clear request, for any change that affects behavior described in §1–§10:

1. **Identify impact:** work out which sections the change touches.
2. **Implement it.** Do not pause for confirmation.
3. **Update RULES.md in the same change**, so the rules and the code are never out of step.
4. **Report** what was built, which decisions were taken on the user's behalf and why, and anything that was left out.
5. **Commit together:** code changes and RULES.md updates go in the same commit.

**Stop and ask only when:**

- The request has two readings that lead to materially different work, and guessing wrong would waste the effort.
- The change could destroy data the user cannot get back — deleting originals, overwriting processed output, anything touching `/mnt/osmo`.
- The user's own standing rules require it: no commit, push or share link without an explicit request.

Anything else — naming, layout, thresholds, which of two sound designs to use — is Claude's call. Make it, say so in the report, and move on. A decision that turns out wrong is cheaper to reverse than a question is to answer.

**Examples of rule-impacting changes** (implement and document; do not ask):

- Modifying manifest structure or file registry behavior
- Changing scan/cluster thresholds or algorithms
- Altering drag & drop operations or selection logic
- Adding/removing API endpoints or changing their behavior
- Modifying video preview, streaming, or crop interactions
- Changing deduplication or file comparison logic

**Changes that need no RULES.md update at all:**

- Bug fixes that preserve existing behavior
- Refactoring that doesn't change external behavior
- Presentation/styling changes (§9.8)
- Test additions or updates

**Commit rule:** No commit is ever made until the user explicitly requests it. All changes are staged and reviewed before committing.

## 12. Tandem passenger publishing

> How tandem jumps go from processed files to the passenger's inbox.

### 12.1 Passenger / location details

- Each jump/group can carry the tandem passenger's `firstname`/`lastname`/`email` **or** just a location `label` for fun jumps (`yverdon`, `colombier`). `label` acts as location for fun.
- Passenger/location details are optional while reviewing, and jumps without them fall back to `label` wherever a name is needed. **Processing (`Process`) no longer requires passenger** — `label` (`yverdon`) is used for fun, `firstname_lastname` for tandem, fallback `Jump N`. **Only `Email`/`Share` generation requires complete passenger (`firstname`/`lastname`/`email`).**
- They are edited on the jump/group card (`Add passenger` / location prompt on `+ Create Group`) and saved with the rest of the workspace. Empty `Group` stores `day` to stay under its `Day`.

### 12.2 Naming

- **Tandem folder:** the passenger's name as typed — `Tandems/Luc Favre/` — never dated, never sanitized. Two jumps for the same passenger share that folder.
- **Fun jumps are flat:** a group with a destination and no passenger writes its files straight into `processed/{destination}/`, with no group folder and no `videos/`/`photos/` split. The same applies to lone files with a destination.
- Folder (group without a destination, unchanged): `{base}_{YYYYMMDD}` where `base` is `firstname_lastname` (tandem) or `label` sanitized lowercased. `fun` example: `yverdon_20260802 - yverdon` label → `yverdon_20260802_113345.mp4`.
- Files: `{base}_{YYYYMMDD}_{HHMMSS}.{ext}` (`HHMMSS` from original capture time). For a flat fun jump `base` is the destination (`yverdon_20260802_113015.mp4`); inside a tandem folder it stays `firstname_lastname`.
- Sanitizing folds accents before replacing the rest: `Chloé Perret` → `chloe_perret`.
- For `Group` `label=yverdon` on `2026-08-02` with 3 jumps merged, all files share `yverdon_20260802_HHMMSS.ext` in `videos/`/`photos/` (collision `_1`). Reprocessing reuses the same folder — never `_1`/`_2` folder suffixes.
- Loose destination files (`output/processed/{destination}/` flat): `{destination}_{YYYYMMDD}_{HHMMSS}.{ext}` for videos and photos, `destination` sanitized lowercased, date/time from the file's capture time, no `videos/`/`photos/` split.
- Tandem group with `destination`: the passenger folder is nested in the destination folder (`output/processed/Tandems/Luc Favre/`). Files keep the `firstname_lastname` base, never the destination name.
- Date source: jump/group date (from scan or `+ Create Group` `day`, or manually updated). If updated, re-processing applies the new date.
- Time source: original file capture time (follows date if updated).
- Collision: counter suffix only when needed: `_1`, `_2`.
- Videos and photos keep separate subdirectories inside a tandem folder only; everything written flat has no subdirectories.
- Empty subdirectories are not created.
- EXIF metadata dates (creation + modification) match filename date-time.

Example tandem:

```
output/processed/Tandems/Luc Favre/
├── videos/
│   ├── luc_favre_20260829_113015.mp4
│   └── luc_favre_20260829_113015_1.mp4
└── photos/
    └── luc_favre_20260829_182506.jpg
```

Example fun `yverdon` (3 jumps merged same day):

```
output/processed/yverdon_20260802/
├── videos/
│   ├── yverdon_20260802_091205.mp4
│   ├── yverdon_20260802_100211.mp4
│   └── yverdon_20260802_113015.mp4
└─  photos/
    └─  yverdon_20260802_091601.jpg
```

### 12.3 Per-jump / per-group lifecycle

- Each jump/group moves through proposed, processed, uploaded, in that order.
- Process buttons: per-group `Process` (group card), `Process Destination` (destination header: its groups + loose files), `Process All` (review header). Each sends one `process` request; buttons show a processing state until the response returns.
- The `Process` button is available once a jump/group has files (no passenger required — `yverdon` `Group` processes with `label`). Processing copies and renames the files (using `passenger` if present else `label`) and marks the jump/group `processed`; re-processing clears any previous publishing state. `+ Create Group` at a `Day` creates an empty `Group` (`label` prompt, `day` stored) that becomes processable once files are dragged in.
- The `Upload` button is only enabled for processed jumps/groups. Uploading additionally requires a valid NAS session and a folder to put the files in: clicking `Upload` while disconnected opens the connection dialog, and with no resolvable folder opens the folder browser — no upload starts until both are in place. `Email` generation still requires complete passenger (`firstname`/`lastname`/`email`).
  - **Scope** (`upload-group`, one request): `groupId`/`groupIds` for one or more groups, or `destination` for a whole dropzone — every group filed there **plus its lone files**. `resolveUploadTargets` turns a scope into one target per remote folder, so two fun jumps filed to the same destination are one upload of one folder, not two.
  - **Where each target lands:** a **flat fun jump has no folder of its own** — its files live in `processed/{destination}/` shared with every other day shot there, so it uploads to `{destBase}` and never to `{destBase}/{baseName}`. A tandem goes to `{destBase}/{Passenger Name}/`, and a group with no destination to `{defaultFolder}/{baseName}/`. `destBase` is the destination's own `path`, else `{defaultFolder}/{name}` (§13.1). **A destination with its own `path` needs no default folder at all**; only path-less destinations and destination-less groups do. A folder that cannot be resolved is reported (`Choose a NAS folder for {name}, or set a default upload folder`), never guessed.
  - **Session:** the server re-checks the stored session against DSM before uploading and lets it refresh itself (§12.5), so an expired session reconnects instead of failing the upload.
  - **Binary comparison** (`planUpload`): one file listing per remote folder; a file already there under the same name **and the exact same byte size** is a candidate, and only a candidate is hashed — a size mismatch already proves the files differ. The candidate's local MD5 and DSM's own `SYNO.FileStation.MD5` of the remote file are computed in parallel and compared; equal means skip. At most 4 candidates are checked at once and a job is abandoned after 5 minutes. **A missing, failed or disabled digest means upload** — never skip on an uncertain comparison. MD5 rather than SHA-256 because DSM cannot produce a SHA-256 of a file already on the NAS, and downloading it to hash locally would cost more than re-uploading. Uploads keep `overwrite=true`, so a false negative costs a re-upload and never corruption.
  - Streamed upload: files stream with flat memory use and wire-true progress — 0–95% counts bytes flushed to the network, 100% on server confirmation; on failure, retry from beginning.
  - **Every file proved to be on the NAS gets an `uploaded` record** (§4) — the ones just sent, hashed as their bytes streamed past, and the ones the dedup pass found identical, whose md5 comparison is exactly that proof. The records are written against a **freshly loaded manifest**, because an upload runs for minutes and the copy loaded before it started would clobber anything saved meanwhile.
  - Share link: **looked up in FileStation's sharing list first and reused** when a live link for that exact folder exists (expired or disabled links are ignored), otherwise created. A re-upload therefore keeps the link already sent to the passenger instead of orphaning it. Stored on every group behind the target, and on the destination itself (`destination.shareUrl`) for a dropzone folder.

### 12.4 Freshness rules

- Re-processing moves a tandem's passenger folder to `output/.trash/` before rebuilding it. A destination folder is never moved to `.trash` — see §6.1.
- Re-processing a jump discards its share link and sent record, because the files changed and the old link is stale.
- Merged jumps start unpublished, with no link and no sent record.
- Re-uploading **keeps** the folder's share link — it is the same folder, and the passenger may already have the URL — and resets the sent record. A link is only minted when the folder has none that still works (§12.3).

### 12.5 Secrets

- NAS `sessionId`, `hostname`, `username` and an **encrypted password** (`encPasswd`) are stored in `output/.status/nas.json` (`chmod 600`). Plain `password` is never written to disk.
- `encPasswd` is **always** local `AES-256-GCM` (key derived from `host:user`). DSM's `SYNO.API.Encryption` public key encrypts a password for _one login request_, not for storage: the resulting ciphertext cannot be decrypted back here, and replaying it as `passwd` is not the envelope DSM expects — so a session encrypted that way could never refresh itself, which is the one thing storing a password is for. `dsm:` blobs written by older versions are still replayed on refresh and are replaced with a `local:` one at the next interactive connect.
- Every path to the NAS goes through **`ensureNasSession`**: the stored `sessionId` is validated (`FileStation/list_share`), reused if live, and otherwise refreshed from `encPasswd` without prompting. Only when that fails does the user see the login dialog.
- Mail credentials removed — email uses prefilled `mailto:` link, user sends manually.

### 12.6 NAS connection

- On first upload (or when no valid session exists), a connection dialog appears asking for NAS hostname, username, and password.
- On successful login, the session ID and encrypted password are saved to `output/.status/nas.json` (plain password is never saved). Reused SIDs are kept alive after uploads – only temporary SIDs are logged out.
- On app restart the stored session is re-checked and auto-refreshed by `ensureNasSession` (§12.5); the login dialog only reappears when that cannot recover it. Both the board and the classic view do this in their loader, so neither ever shows a connection that is already dead.
- The user can disconnect (logs out on DSM) or update credentials, which clears the stored session.
- No background heartbeat – local app validates and auto-refreshes on demand, so closing the app for days still reconnects without relogin.

### 12.7 NAS folder browser

- One browser serves two jobs: choosing the **default upload folder** (saved into the NAS session through `select-folder`) and choosing **one destination's own folder** (saved into the workspace as `destination.path` through `save-groups`). It takes an `initialPath`, so re-opening a destination starts at the folder it already points to rather than at `/`, and a `title` naming whose folder is being chosen.
- Flat list of the current folder's children with breadcrumbs, not a tree: click selects, double-click or `Open` descends, `+ Create Folder` makes one inline.

### 12.8 Upload progress

- One record at `output/.status/upload-progress.json`, keyed by **upload scope** (`group:{id}` or `dest:{name}`) rather than by group, because one upload can cover a whole destination; the poller only accepts a record whose scope is its own.
- Two phases: **`checking`** counts the dedup pass (`Checking what is already there — 120/571`) before a byte moves, then **`uploading`** counts files across the whole scope with the current file's byte percentage. `done` reports how many were skipped as already present.
- Upload streams each file; progress counts bytes flushed to the network (0–95%) with 100% on server confirmation. On failure, upload retries from the beginning of the failed file, and the record ends in `error` with the message.

## 13. Destinations & Montage

### 13.1 Destinations

- Destinations group jumps and individual files by location or passenger name across different days, mapping them to NAS folder paths.
- Each destination has a `name`, an optional `path` (the NAS folder it uploads into, chosen from the board's folder browser and saved with `save-groups`) and an optional `shareUrl` (the link to that folder, set by an upload). A destination naming no `path` uploads to `{defaultFolder}/{name}`; one that names a `path` needs no default folder at all (§12.3).
- Groups can be assigned to a destination via the `group.destination` field.
- Individual files can be assigned to a destination via the `file.destination` field (lone files — not in any group).
- Destinations are stored in `manifest.json` as a `destinations` array.
- The UI supports viewing groups by destination via the "By Destination" toggle.
- Default NAS path: `{defaultFolder}/{name}/`. If `path` is set, it overrides the default.
- Groups can be drag-assigned to destinations: drag the group header (≡ handle) onto a destination section header. Drop on "Unassigned" clears the destination field. Uses `application/x-group` data type to distinguish from file drag.
- Lone files can be drag-assigned to destinations: drag from the staging tray or file row onto a destination section header. Uses `text/plain` data type with JSON array of file paths.
- Every fun jump in a destination — a group without a passenger, and lone files alike — is processed flat into `processed/{destination}/` (no `videos/`/`photos/` subdirs), named `{destination}_{YYYYMMDD}_{HHMMSS}.{ext}` (see §12.2). Reprocessing a flat group overwrites its own files in place and never trashes the destination folder, because other days live there too — this holds for every scope, including `Process Destination` and `Process All` (§6.1). Tandem groups are processed into `processed/{destination}/{Passenger Name}/`. Local layout mirrors the NAS upload layout.

### 13.2 Montage workflow

- **Process:** Process a group to create the processed folder with renamed files.
- **Create Montage:** Click "Create Montage" on a processed group to:
  1. Copy a kdenlive **template** project and lay the group's processed videos on its first video track, in time order. Crops are already applied by `execute`, so the timeline entries carry no in/out. The template's own assets (music, logo, title files) are rewritten to absolute paths, the project is re-rooted at the group folder, given a fresh `documentid`/`uuid`, and an MLT `<consumer target="{base}.mp4">` so `melt` and `kdenlive_render --output` know where the film goes.
  2. Write `{base}.photos.zip` — the processed photos, for the passenger.
  3. Write `{base}.rushes.zip` — the original videos the edit came from, for the backup folder.
- **Template:** resolved in order — `SKYDOCK_MONTAGE_TEMPLATE`, `{outputDir}/montage-template.kdenlive`, then `templates/tandem.kdenlive` in the repo. Parsing must keep XML entities untouched, or the template's `kdenlivetitle` clips are destroyed.
- **Reprocess protection:** If a `.kdenlive` file exists in the processed folder, the "Create Montage" button shows "Montage Created" and is disabled.
- **Edit in kdenlive:** Open the `.kdenlive` file to edit the montage.
- **Export:** Export the final video from kdenlive.
- **Select photos:** Select photos in the app to include in the final package.
- **Upload:** Upload the processed group to NAS.

## 14. Board UI (`/`)

> Behavioral spec for the board: the everyday view for sorting a card of jumps into places and passengers.

Mounted at `/` (`routes/board.tsx`). The loader reads the manifest, the destinations and the stored NAS session (no DSM round-trip). Groups live in React state through `useGroups` and persist with the `save-groups` manifest action; every mutation is a whole-list `updateGroups`. The route answers the fetcher in an effect: a `{ groups }` payload replaces the state, anything else is read as a refusal and its first `globalErrors` entry is shown as a note. With no manifest, the board shows a single line pointing at the classic view to run a scan.

### 14.1 Layout

- **Two panes side by side** from `lg` up: what is left to sort on the left, where it goes — the location cards and Tandems — on the right. Each pane is its own scroll container of viewport height, so a jump is dragged straight across to its card and neither side can scroll away mid-drag. Below `lg` the panes stack and the page scrolls normally. The location cards go two-abreast only from `2xl`, where the right pane is wide enough for it.
- **Folding is one rule, applied everywhere files are drawn** — a to-sort card, a location's day row, a tandem row. At **`FOLD_MIN` (25) files or fewer the files are simply shown and there is no button at all**; reaching a file costs no click, and a control that does nothing useful is not drawn. Past 25 the card folds by default and carries **Hide** / **Show N files**. A folded card still shows its first four thumbnails, and they are draggable, so a file can leave it without opening it. Nothing on the board ever renders several hundred thumbnails unasked, which is what made a large tandem impossible to scroll past.
- **To sort is divided into day sections**, newest day first, matching the order the location cards already use. Each section header gives the date and what is under it (`4 jumps · 22 files`, plus `· N loose` when there are any) and **sticks to the top of the pane** while its own jumps scroll past, so a card is never read against the wrong date. Within a day, jumps run in chronological order, and that day's **loose files** sit under its jumps in a dashed box rather than in one heap at the bottom of the column — a loose file belongs to the day it was shot. A **Regroup N loose** button sits in the section header, not in a day, because `regroup-loose` re-clusters every loose file in one go (§6.2).
- **A jump row** — one per group without a destination: start time, a **videos · photos** count, and its files (videos at normal size, photos in a denser grid, in separate labelled sections). Clicking the row header folds or unfolds it **when the card is foldable at all**, which is why the checkbox stops the click from propagating; on a small card the header click does nothing, since there is no state to toggle back. Every card carries a **≡ drag handle**: an open card's body is not draggable (its thumbnails are), so without the handle a jump under 25 files could never be dragged to a destination. Folded cards are draggable by their body too, and dragging a ticked card drags the whole ticked selection. Every **loose file with no destination** is drawn under its day, so a file pulled out of a location is never invisible. The whole section is a drop target that clears a file's destination, and regrouping those loose files (`regroup-loose`, §6.2) matters because removing files from a card returns them flat and the scan's grouping would otherwise be lost for good.
- **Fun jumps** — one drop-target card per destination (except `Tandems`), with an inline input to add a location. Inside, files are listed by day, flat, without per-jump nesting, since they land flat on disk (§13.1). A day row draws **whole jumps and lone destination files together**, in mtime order, counted as `N files · M lone`: on disk they are the same flat folder, so splitting them on screen would be a distinction the output does not make. A lone file that is only in the manifest's registry is still a real member of that destination, and a card that hid it would make the file look lost.
- **Tandems** — one drop-target card per passenger, white on the section's grey: the **passenger's name is the card's title**, followed by start time, file count and the group's thumbnails. A card with no name yet shows the two name inputs instead, with `name needed before processing` beside them. Each row is **itself a drop target**, so a file joins that passenger rather than starting a new tandem. Files filed to `Tandems` that belong to no group cannot be processed — the folder is named after the passenger — so they are shown in an amber **N files with no passenger yet** row with a **Make them a tandem** button, never silently hidden.
- A selection bar at the foot of the left pane offers every location and `Tandems` as one-click targets, so a batch of fun jumps is filed in a single move, plus **Compare** once exactly two jumps are ticked (§14.2).

### 14.2 Interactions

- Drag a jump — by its **≡ handle**, or by its body when folded — or a ticked selection of jumps, onto a location card or the Tandems card to set `group.destination`. Dropping on Tandems keeps any existing passenger; dropping anywhere else clears it.
- **Dragging files, not just jumps:** every thumbnail is draggable, wherever it is drawn — inside a jump, in the sorting area's loose strip, in a location card or on a tandem row. Where the files land depends on what they are dropped on, and **a file dropped on a destination never falls back to the sorting area**:
  - **another jump card** → `move-files` with that card's `targetGroupId`; the files join that jump.
  - **a location card** → `move-files` with that `destination`; the files become lone destination files (§13.1) and are drawn in that card's day rows. This is the whole point of lone files — they are processed flat into the same folder — so nothing about it is a half-state.
  - **the Tandems card** → `move-files` with `destination: Tandems` **and `newGroup`**, which gathers them into a tandem of their own. A tandem folder is named after a passenger and a passenger lives on a group, so files filed to Tandems without one would be unprocessable; sending them as lone files is what used to make them reappear in the sorting area.
  - **a tandem row** → `targetGroupId`, joining that passenger.
  - The drag starts on the thumbnail and stops propagating, so the card underneath never starts its own drag.
- **Drop feedback:** exactly one zone is ever highlighted — the innermost one under the pointer, and only when it accepts what is being dragged. Zones are keyed (`sort`, `group:{id}`, `dest:{name}`) and compared against a single `overTarget`; nothing is styled merely because a drag is in progress, because lighting every eligible zone at once hides the one that matters. `onDragLeave` only clears when the pointer truly leaves (`currentTarget.contains(relatedTarget)`), otherwise crossing a child thumbnail makes the highlight flicker. A `dragend` handler on `<main>` clears the highlight however a drag ends, including when it is abandoned. Destination and Tandems cards accept both jumps and files; the To-sort area and jump cards accept files only.
- Adding a location saves the destinations list immediately through `save-groups`.
- **Passenger name:** typed into the two inputs and saved on blur, then **shown as the card's title with a ✎**; clicking the title turns it back into the inputs, and **Done** returns it to a title. The save is what turns the form into a title, so the change is visible — two inputs that never changed gave no sign the name had been stored, which read as nothing having happened.
- Clicking a thumbnail or a row opens the shared `PreviewDrawer` for preview and cropping (`usePreview`, same contract as §9.6) — but only while no file is selected. **A lone file can be cropped too**: it has no group ref to hold the range, so it is saved onto its registry entry through `save-groups`' `fileUpdates` (§6.2). Cropping one used to be discarded silently.
- **Comparing and merging jumps:** the selection bar **sticks to the foot of the left pane** whenever a jump is ticked — the ticked cards can be anywhere in a long column, and a bar that scrolled away with them was a bar nobody found. It always carries the **Compare** button: disabled and labelled `Compare (N/2)` until exactly two jumps are ticked, so the two-jump rule is visible rather than something to guess at. Compare opens the same `ComparisonDialog` as the classic view — two columns, independent `<` `>` navigation across every group, file lists, read-only video bar, and the merge date popup (§9.5.2, §9.5.3). It is the same component and the same `merge-groups` intent, never a second implementation. The checkboxes live on the To-sort cards, so a compare always starts from two unsorted jumps; the dialog's own navigation still reaches any group. Merging clears the tick marks and redraws from the groups the server returns, like every other board mutation. While the dialog is open it owns `Escape` (which closes it) and the board's `Delete`/`Backspace` removal is inert.
- **Selecting files:** one way only — mouse and keyboard, no mode to enter and no button to find. A plain click previews. Ctrl/Cmd-click picks a file and starts a selection; Shift-click extends a range across every file drawn under that day (or that tandem), in display order. Once anything is picked the board is implicitly in selection: every thumbnail shows its mark and a plain click toggles instead of previewing, so a selection is continued with ordinary clicks. `Escape` or **Done** clears it and previewing resumes. There is deliberately no **Select** / **All N** / **None** control — a second way to select only splits the same gesture in two.
- **Acting on a selection:** the bar offers exactly one action — **Remove — back to sorting** — which sends `move-files` with no destination (§6.2), so the files leave their card and reappear in the To-sort area. `Delete` and `Backspace` do the same thing, except while a text field has focus, so the passenger name inputs still edit normally. **Done** or `Escape` clears the selection. Moving files between destinations is done by dragging the selection onto another card, not by buttons. The client redraws a move from the server's answer — it never guesses the result.
- The board does not expose `keep`. Everything sitting in a destination is processed; to exclude a file you remove it, which sends it back to the sorting area. The `keep` field stays in the schema and `execute` still honours it (§6.1), but nothing in the board sets it — so a file's presence on a card is the whole truth about whether it will be processed. On a file the board therefore offers two actions only: **Remove**, and drag-and-drop between cards.

### 14.3 Actions

The three pipeline steps are distinct and never shown out of order:

1. **Process** — per day for fun jumps, per group for tandems (disabled until the passenger has a name). Copies, renames and crops locally (§6.1). A day row of whole jumps sends `groupIds`; a day row that also holds lone files sends `destination` instead, because a lone file belongs to no group and `groupIds` could not name it. That widens the request to the destination's other days, which is harmless: a flat fun-jump folder is overwritten in place and never trashed (§6.1), so re-processing an already-processed day changes nothing on disk.
2. **Montage** — tandems only, and only once processed. Calls `/api/create-montage` (§13.2) and reports the generated project path or the reason it refused.
3. **Upload** — on a **location card header** (that whole dropzone: its groups and its lone files) and on each **processed tandem row** (that passenger). Sends one `upload-group` request with the matching scope (§12.3). Clicking it while disconnected opens the connection dialog; clicking it with no folder resolvable for that card opens the folder browser for that card. Progress shows the dedup pass, then the file count and the current file's percentage, then how many were already on the NAS (§12.8); the share link appears beside the button once there is one.

Dates shown on the board are derived from the files' minimum mtime with local date parts (no `Intl`, no `toISOString`), so the server and client render the same string.

### 14.4 NAS on the board

- The header carries the NAS state: a status dot, the hostname, the **default upload folder** as a button that opens the folder browser, and `disconnect` — or a single `Connect the NAS` button when there is no live session. The board no longer sends anyone to the classic view to connect.
- The loader reports the session through `ensureNasSession` (§12.5), so a dead or expired one never renders as connected. Live state is then **derived** from the `/api/nas` fetcher, falling back to the loader — connecting, disconnecting and choosing a folder all take effect without a reload, and the connection dialog closes itself when a new answer says it worked.
- Each location card shows **its own NAS folder** as a button (`destination.path`, else `{defaultFolder}/{name}`, else `choose a folder`), with `clear` to fall back to the default. Choosing one saves the destinations list through `save-groups`, like every other board edit.
- After connecting, a pending upload is **not** resumed automatically: the dialog closes, the button becomes live, and the user clicks it. One less effect, and no way to start the same upload twice.

### 14.5 Per-file status

Every file shows one of three states, and each is a fact the app can check rather than a flag it has to remember to clear:

- **local** — no current processed copy. Either it was never processed, or what was made from it is out of date because the file was cropped, retimed or replaced since. There is deliberately no separate "stale" state: a file whose source moved on is simply not processed any more.
- **processed** — a copy exists in `output/processed/` that was made from the file exactly as it is now.
- **uploaded** — that copy is on the NAS, proved by a matching md5 (§12.3).

A file drops back to **local** when any stamped input differs from its current value (`id`, `size`, `mtime`, crop range), or when the copy is missing from disk or a different size. It drops back to **processed** when the copy that went up is no longer the copy on disk, or when a folder listing that **actually came back** does not hold it, or holds it at a different size.

Two rules keep this honest:

- **A listing may demote, never promote.** Only the upload path, which compares md5 on both sides, may write an `uploaded` record. A name and a size are not proof of identity.
- **Uncertainty never destroys a proven fact.** A NAS that was not asked, a folder whose listing failed, or a size DSM would not report all leave the file `uploaded`. `listNasFiles` answers `[]` both for an empty folder and for a failed call, so a folder counts as checked only when its listing came back.

**Where the evidence comes from:** the disk facts (`outputs`) ride the board loader and every mutation's answer; the NAS facts come from listing the folders named by the `uploaded` records themselves — never the destination list, since a tandem lives in `{destination}/{Passenger}/`, which listing the destination would miss. The loader takes the first look, an upload answers with the listing taken right after it, and the header's **⟳ check** button re-runs it on demand (`/api/remote-files`, read-only).

**In the UI:** files are drawn as **rows by default** — thumbnail, filename, ✂ if cropped, time, size, status chip — with a **grid** toggle remembered for the session, where the status becomes a dot on the thumbnail and the ✂ a corner badge (dots also on the four thumbnails of a folded card, the only signal it gives). A crop shows up **immediately, without a reload**: the board updates its own copy of the file as it saves, because `updateGroups` answers on its own fetcher and the board would otherwise keep redrawing — and re-previewing — the file as it was before the crop. **Upload is disabled while any file in that card is `local`**, with the reason spelled out (`N files need processing — process before uploading`) rather than hidden in a tooltip. The same `uploadGate` runs on the server, so it cannot accept what the board would refuse.

`group.processed` remains for the classic view, montage and drag-and-drop gating; the board reads per-file status instead, which is the finer truth.

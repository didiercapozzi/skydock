# TODO: Full UI Coverage — Vitest Regression Suite

> Goal: Every navigable route, every interactive feature, and every edge case testable via `vitest` + `@testing-library/react` + `jsdom` (no Playwright required). Fast gate for regression before manual UI check. Target: 250+ tests across 15+ suites.

## Coverage Principle

- No Playwright. Only `vitest` (`npm run test`), `jsdom`, `@testing-library/react` + `user-event`, `vi.mock`/`vi.spyOn`.
- Mock boundaries: `hls.js` (setup.ts), `IntersectionObserver`/`matchMedia`/`setPointerCapture`, `ffmpeg`/`exiftool` via `child_process`/`fs`, `fetch` for `/api/*`.
- Each point is a `describe/it` that renders via `createMemoryRouter` + asserts DOM + `vi.fn` spy on `fetcher.submit`/`fetch`.

---

## 1. Navigation & Routing (`app/routes.ts:3`)

- [ ] `index` `/` → `routes/home.tsx` renders dashboard, stats, empty state
- [ ] `review` `/review` → `routes/review.tsx` loader `{manifest}` via `loadManifest` + `ensureManifestFileIds`
- [ ] `jump/:date/:jumpDir` → `routes/jump.tsx` loader `getJump` with 404 fallback
- [ ] Unknown route → `root.tsx` 404 error boundary
- [ ] `Link`/`href` nav: `home → review`, `review → /` Back, `review → jump/:date/:jumpDir` (jump card click), `jump → /` back arrow
- [ ] Browser back/forward preserves `compareIds`/`selection`/`preview` (in-memory, not persisted)
- [ ] Direct URL `/review` with no manifest → empty state “No Manifest Found”
- [ ] Direct URL `/jump/2026-08-24/Jump_1` with `getJump=null` → 404 response

## 2. Home (`routes/home.tsx:1`)

- [ ] Stats header: `{totalJumps} jumps`, `{totalPhotos} photos`, `{totalVideos} videos` sums from `scanOutput().days`
- [ ] Empty state “No jumps yet” when `days.length===0`
- [ ] Days rendered reverse-chronologically, header `day.date` + `{jumps.length} jumps`
- [ ] `JumpColumn` per jump: Videos vs Photos columns, correct `jump.name||displayName` + `formatTime(startedAt)`
- [ ] `FileCard` per `FileEntry`: `file.name`, `formatBytes(size)`, `library` badge when `isTheory`
- [ ] Click `FileCard` → `FileDrawer` opens with `file.name` + video `src=/api/file?path=` or img
- [ ] `FileDrawer` “Open in player” → `fetcher.submit({path}, /api/open)` spy
- [ ] Close drawer via overlay click / X button / `onClose`
- [ ] Dev-only: “Reset dev data” + “Add Jump” forms disabled when `simulating` (`fetcher.state !== 'idle'`)
- [ ] `revalidate()` called when `simulateFetcher.data` arrives

## 3. Jump Detail (`routes/jump.tsx:1`)

- [ ] Loader `getJump(date,jumpDir)` returns `jump` + `outputDir`, 404 if null
- [ ] Header shows `jump.name||displayName`, `Jump {num} • {date}` + `Apply theory to all jumps` button
- [ ] `FileTable` per section: Jump Photos/Videos, Theory Photos/Videos — correct `icon` + `({files.length})` + hides when 0
- [ ] `TheoryToggle` optimistic: initial `isTheory` vs `formData.get('isInLibrary')` toggle, submits `action=toggle` with `filePath/jumpId/isInLibrary`
- [ ] `TheoryToggle` click twice → toggles back
- [ ] `ApplyButton` submits `action=apply` with `sourceJump`/`sourceJumpDate`, disabled when `busy`
- [ ] `formatBytes` edge: 0 B, 1023 B, 1024 B, 1.5 MB, 1 GB

## 4. Review — Data Loading & Empty States (`routes/review.tsx:20`)

- [ ] Loader calls `ensureManifestFileIds` then `loadManifest`
- [ ] `!manifest` → “No Manifest Found” + Scan button
- [ ] `manifest.status==='empty'` → “No Files to Review”
- [ ] `scanFetcher.state` vs `systemStatus.scan` distinction: `scanning` banner
- [ ] `jumpsByDay` via `groupJumpsByDay`, `filesInJumps` Set, `unassignedFiles` filter
- [ ] `multiJumpFiles` Set for `pathCounts>1` (copy-files duplicate highlight)
- [ ] `hasCalibration` when `files.some(originalMtime!==undefined)` → “Reset dates” button visible

## 5. Review — Header & System Status (`review.tsx:45-533`)

- [ ] Title “Review Proposed Jumps” + `{manifest.date} — {jumps.length} jumps, {totalFiles} files` + `• {processedCount} processed`
- [ ] `anySystemRunning` pill “Working…” + “background tasks running” when scan/execute/process running
- [ ] Poll `/api/status` every 2s via `fetchStatus` + `setInterval`, `cancelled` flag on unmount
- [ ] Banners: scan `Scanning` blue, process `Copying from cameras` sky, execute `Processing jumps` green, done summary “idle in 5s” gray — show/hide per `SystemStatus`
- [ ] Header actions: `Select All` → `setCompareIds(filtered !processed)`, `+ Add Jump` → `create-jump`, `Reset dates` → `reset-calibration`
- [ ] Scan button `disabled={scanning}` text `Scanning...` vs `Scan`

## 6. Review — File Selection (`review.tsx:114-151`)

- [ ] Click file row → `handleSelect` toggles `selection[groupId][path]`
- [ ] Checkbox always toggles (even when row click would preview)
- [ ] `Ctrl/Meta` + click → add/remove without clearing
- [ ] `Shift` + click → range select from `lastClicked` via `allFileIds` index
- [ ] `allFileIds` order: unassigned + jumps flatMap in manifest order
- [ ] `isSelectMode` when `selectedCount>0` → `FileRow` shows checkbox
- [ ] Deselect last file in group → deletes `selection[groupId]`

## 7. Review — Staging Tray (`components/review/staging-tray.tsx`)

- [ ] Visible only when `selectedCount>0`
- [ ] Lists `selectedFiles` with `filename` + remove X (calls `handleSelect` with ctrl)
- [ ] Move/Copy toggle `copyMode` → `dataTransfer.effectAllowed` `move` vs `copy`
- [ ] Clear button → `setSelection({})`
- [ ] Dragging tray → `trayDragRef.current = {filePaths, sourceGroups}` grouped by `groupId`
- [ ] Tray itself `draggable` + `onDragStart` with `text/x-staging-tray`

## 8. Review — File Display (`components/review/file-row.tsx`)

- [ ] Shows `filename` (editable via `onRenameFile` double-click), `formatTime(mtime)`, `formatBytes(size)`, preview button, delete button
- [ ] Selected row highlighted (amber/blue)
- [ ] `isInMultipleJumps` → distinct bg (blue/yellow)
- [ ] `isSelectMode` → checkbox visible
- [ ] `draggable` + `onDragStart(filePaths, sourceJumpId)` + `dataTransfer.effectAllowed`
- [ ] Drop indicator line above/below when dragging within same jump

## 9. Review — Drag & Drop (`review.tsx:168-253`)

- [ ] Reorder within same jump: `handleReorder(jumpId, filePaths)` → `reorder-files`
- [ ] Move between jumps: `handleDrop` with `dragDataRef` → `move-files` from `sourceJumpId` to `targetJumpId`
- [ ] Copy between jumps: with `copyMode` true → `copy-files` to `targetJumpId`, selection persists
- [ ] Tray drop: iterates `sourceGroups` entries, `move-files` per group or `copy-files`, clears selection after move
- [ ] Processed jump cannot receive drops (card disabled)
- [ ] Dragging entire selection when multiple selected → `filePaths` = selection
- [ ] `dragDataRef`/`trayDragRef` nulled in `finally` after drop

## 10. Review — Jump Card & Day Groups (`components/review/jump-card.tsx`, `jump-day-section.tsx`, `components/review/jump-day-section.tsx`)

- [ ] Card shows checkbox for `compareIds`, expand/collapse toggle, editable `label` (`onLabelSave` → `update-label`), date/time (`onShiftJump` → `shift-sequences`), `Videos ▶ 12` / `▣ 11` filter pills (disabled when 0, gray when active)
- [ ] `List/Grid` toggle visible only when expanded, applies globally via `viewMode`
- [ ] Grid uses `content-visibility: auto` for 500+ files (snapshot test)
- [ ] Border: amber if selected for compare, blue if `processed`, gray otherwise, blue highlight on drag hover
- [ ] Day group header: `{day.date}` + total files + jumps + time range, transparent container
- [ ] `TimelineJumps` bar per jump on 00:00–24:00 scale, one lane per day, click toggles compare, drag → `handleShiftOffset` snaps 15min / full-day with Shift, tooltip shows new date

## 11. Review — Timeline (`components/review/timeline-jumps.tsx`)

- [ ] Bars colored by day, gray if `processed`, amber ring if `compareIds` includes
- [ ] Click bar toggles compare selection
- [ ] Drag bar left/right shifts time, snaps 15min or 24h with Shift, commits only if ≥60s
- [ ] Dragging tiny (<60s) snaps back, no `shift-sequences` submitted
- [ ] Dragging snaps correctly across day boundaries
- [ ] Processed jump not draggable (gray, no handler)

## 12. Review — Selected Jumps Panel (`components/review/selected-jumps-panel.tsx`)

- [ ] Appears when `compareIds.length>0`, lists `jumps` with file count + time range via `getJumpBounds`
- [ ] Clear → `setCompareIds([])`
- [ ] Compare → `setShowCompare(true)` enabled only when exactly 2
- [ ] Process selected → `manifestSubmit({action:'execute-jumps', jumpIds: filtered !processed})`
- [ ] Change Day → calculates `newNoon - oldNoon` offset via `getJumpBounds` + `manifestSubmit shift-sequences` per jump

## 13. Review — Compare Drawer (`components/review/compare-drawer.tsx`)

- [ ] Opens as panel with 2 columns when `showCompare && compareJumps`
- [ ] Each column lists `jump.files` with previews
- [ ] `Merge into` button per column → `handleMerge(targetId, sourceId)` → `merge-jumps` with `sourceJumpIds: [targetId, sourceId]`
- [ ] Merge closes drawer and clears `compareIds`
- [ ] Compare toggle via `onCompareIdsChange`

## 14. Review — Preview Drawer & Media (`components/review/preview-drawer.tsx`, `media-preview.tsx`, `types.ts`)

- [ ] Opens as right-side panel on `handlePreview(files,index,label)` — shows `label`, `file.filename • {index+1}/{total} • formatTime(mtime)`, `formatSize`
- [ ] `MediaPreview` → `useHlsPlayer` with `src=/api/hls?path=&seek=`; fallback to `/api/file?path=` on error
- [ ] Loading spinner 20s `LOADING_TIMEOUT_MS`, retry resets, “Fallback to original” button
- [ ] Error panel: “Video failed to load” + codec hint + `Open / Download` + `Retry` (resets `useFallback` if 429) + `Fallback`
- [ ] Image path: `<img src=/api/file?path=>` with `maxHeight`
- [ ] `PreviewDrawer` Prev/Next via `handlePreviewPrev/Next` (wrap around), arrow keys, `Escape` close
- [ ] `videoRef` shared between `MediaPreview` and `VideoCropper` for `baseSeek` hybrid seeking

## 15. Review — Video Cropper (`components/review/video-cropper.tsx`)

- [ ] Timeline `data-testid="timeline"` + `data-testid="playhead"`, `currentTime` via `useSyncExternalStore` + `requestAnimationFrame` when not dragging
- [ ] Derived `visibleDuration = safeDuration/zoomLevel`, `viewStart/viewEnd` via `viewOffset`
- [ ] `seekTo(time)` clamps 0..`safeDuration`, checks `video.buffered` ranges → direct `currentTime=relative` if buffered else `onSeekCommit(clamped)`
- [ ] `timeFromX(clientX)` via `getBoundingClientRect`
- [ ] Wheel zoom centered on cursor: `zoomFactor 1.2`, `MAX_ZOOM 50`, `newViewOffset` calc, `Reset zoom` button when `zoomLevel>1`
- [ ] `formatTimeCode(t)` `h:m:s.f` with `FPS=30`
- [ ] Pointer down: pauses video if playing, `setPointerCapture`, sets `dragging` start/end/playhead/timeline
- [ ] Pointer move: `start` clamped `Math.min(time, cropEnd-0.1)`, `end` clamped `Math.max(time, cropStart+0.1)`, `playhead` → `seekTo`
- [ ] Pointer up: clears `dragging` + `scrubTime` + `onScrub(null)` (optional)
- [ ] Handles `div.absolute.top-1/2` at `startPct`/`endPct` draggable, timeline click → seek
- [ ] Buttons: `Start here`/`End here` → `setCrop({start/end: currentTime})` + `seekTo`, `Apply` → `fetcher.submit({action:'set-crop', filePath,cropStart,cropEnd}, /api/manifest)`
- [ ] Props `initialCropStart/End`, `baseSeek`, `duration`, `filePath`, `onApplied`, `onScrub?`, `onSeekCommit?`; `onScrub` optional

## 16. Video Preview & Streaming (`routes/api.stream.ts`, `api.hls.ts`, `use-hls-player.ts`, `ffmpeg.server.ts`)

- [ ] `api/stream` fMP4: `?path=&w=&seek=` → `buildBaseArgs` + `scale=W:-2` + `FFMPEG_VIDEO/AUDIO_FLAGS` + `frag_keyframe+empty_moov` chunked `video/mp4`, `MAX_LIVE` 429
- [ ] `api/stream` thumb: `?thumb=1&w=320&t=0.5` → `-vframes 1 -q:v 3 -f image2` `image/jpeg`
- [ ] `api/hls` HLS: `?path=&seek=` → `buildHlsArgs` + `hls_time 4` + `playlist.m3u8` rewriting `seg%03d.ts` → `&segment=`, session `path:seek` 30s TTL
- [ ] `useHlsPlayer` lazy `import('hls.js')`, `isSupported` → MSE else native, `maxBufferLength:30`/`maxMaxBufferLength:60`, `stopLoad` before `destroy` on unmount/src change, fatal `NETWORK_ERROR→startLoad`, `MEDIA_ERROR→recoverMediaError`
- [ ] `path.server.ts` `resolvePath`/`resolveAndValidateFile` with `jsonError` + `getOutputDir` prefix check
- [ ] `ffmpeg.server.ts` constants `CRF/KEYFRAME_INTERVAL/AUDIO_BITRATE`

## 17. APIs — Library/Jump/Open/Scan/Manifest/Status/Duration (`routes/api.*`)

- [ ] `api/file` Range `bytes= start-end` 206 + `Content-Range`, 416 on invalid, `streamResponse` cleanup on `cancel`
- [ ] `api/library` `action=toggle` `isInLibrary` optimistic + `action=apply` copy theory to all jumps
- [ ] `api/jump` rename label, delete jump dir `.jump_number`
- [ ] `api/open` → `xdg-open`/`open` spawn (mocked)
- [ ] `api/simulate` `add-jump` vs `reset dev data` (`clean: true, devData: true`)
- [ ] `api/scan` runs `scanMedia` + `ensureManifestFileIds`, returns `{ok, manifest}`
- [ ] `api/manifest` handlers: `update-label`, `confirm-jump/all`, `delete-jump`, `create-jump`, `move-files`/`remove-files`/`copy-files`, `reorder-files`, `merge-jumps` (offset>12h shift), `calibrate-sequences`/`shift-sequences`/`reset-calibration`, `execute-jumps`/`unprocess-jump`, `rename-file`/`set-crop`; `requireJump`/`requireUnprocessed`/`requireProcessedIds` guards
- [ ] `api/status` polls `output/.status/*.json` via `status.server.ts` `STALE_THRESHOLD_MS 120_000`
- [ ] `api/duration` `?path=&id=` → `ffprobe` `format=duration` else `stream=duration` JSON `{ok, duration}`

## 18. Home & Jump Edge Cases

- [ ] Home empty → “No jumps yet” + `simulate` hint
- [ ] Home `scanLibrary` `TheoryVideoWithSource` sorting
- [ ] Jump `jump.files.length===0` → skip `executeMedia`, `photosDir/videosDir` not created
- [ ] `sanitizeLabel` replaces `[^a-zA-Z0-9._-]` with `_` for `processed/sanitizedLabel`

## 19. Scripts & Utils (`packages/skydock-scripts`)

- [ ] `processMedia` deduplication via `cmp -s` + `checkExiftool`/`findMediaFiles`/`getExtension`/`parseExiftoolCsv` + `isCliModule`
- [ ] `scanMedia` merge vs fresh, `reclusterJumps` gap 1800s, `sortFilesByMtime`, `computeFileId` SHA-256
- [ ] `executeMedia` `needsCrop` check + `cropVideo` `ffmpeg -ss -t -c copy` fallback to `copyFileSync` + `updateMetadata` exiftool
- [ ] `watcher` `hasMediaFiles`/`findCameraRoot`/`resolveCameras` + `POLL_INTERVAL_MS 8000` + `isCliModule`
- [ ] `utils` `isVideoFile` 7 ext, `isPhotoFile`, `isMediaFile`, `getOutputDir`/`getManifestPath`/`getStatusDir`, `hasCommand`/`isCliModule`, `parseExiftoolCsv`

## 20. Error & Accessibility

- [ ] Network failure on `fetch('/api/status')` swallowed, no crash
- [ ] `manifestFetcher.submit` JSON `encType` correct for all actions
- [ ] Keyboard: `Escape` closes preview/compare, `ArrowLeft/Right` navigates preview, tab order on `Select All`/`+ Add Jump`
- [ ] ARIA: `aria-label` on close buttons (if present) snapshot
- [ ] Dark mode classes `dark:` present in snapshots

---

## Implementation Checklist (vitest only)

- [ ] Create `web/tests/ui-home.test.tsx` (home + jump detail)
- [ ] Create `web/tests/ui-review.test.tsx` (review data/select/drag/drop/jump/day/timeline/panel/compare)
- [ ] Create `web/tests/ui-preview.test.tsx` (preview/media/cropper + duration)
- [ ] Create `web/tests/ui-api.test.ts` (api.file/library/jump/open/simulate/scan/manifest/status/duration + stream/hls already done)
- [ ] Create `web/tests/ui-scripts.test.ts` (process/scan/execute/watcher/simulate utils) or keep `packages/skydock-scripts/tests/scan.test.ts`
- [ ] Extend `web/tests/setup.ts` already has `hls.js`, `IntersectionObserver`, `matchMedia`, `setPointerCapture` — add `ResizeObserver` + `scrollTo` if needed
- [ ] Mock `fetch` for `/api/status`/`/api/duration` + `child_process`/`fs` for ffmpeg/exiftool
- [ ] Add `vi.useFakeTimers({shouldAdvanceTime:true})` + `requestAnimationFrame` mock per `video-cropper`
- [ ] Snapshot `container` for each route to catch visual regressions

## Test Count Target

- Before: 96 (8) → After P10: 145 (10) → With full UI coverage: 250+ (15+)
- Current new suites to add: `ui-home` (~25), `ui-review` (~60), `ui-preview` (~30), `ui-api` (~30), `ui-scripts` (keep 27) = ~172 new → total ~317

## Status

- [x] Test infra extended (`setup.ts`, `use-hls-player` stopLoad, `response.server` jsonError)
- [ ] TODO-UI-COVERAGE file created
- [ ] ui-* suites implemented
- [ ] 250+ tests passing + `npm run check` clean

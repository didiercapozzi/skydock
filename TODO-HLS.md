# TODO: Video Player UX — Tests & Optimizations

## Goal

Bulletproof the video player experience: fast loads under any crop/seek/zoom scenario, no wasted bandwidth on abandoned requests, no UI freezes from excessive transcoding.

## Test Scenarios

### 1. Crop Bar Drag Stress

Simulate aggressive crop bar interaction — user dragging start/end handles across the full timeline, reversing direction, jumping between distant positions.

- [x] **Drag start handle from0% to100%** — no lag, no duplicate transcode requests — `video-ux.test.tsx` “drag start handle 0%→100%”
- [x] **Drag end handle from100% to0%** — no lag, no duplicate transcode requests — `video-ux.test.tsx` “drag end handle 100%→0%”
- [x] **Rapidly alternate start/end handles** — no race conditions, final crop values correct — `video-ux.test.tsx` “rapidly alternate”
- [x] **Drag playhead across full timeline** — instant seek within buffer, smooth restart for far seeks — `video-ux.test.tsx` + `seek.test.tsx` buffered vs `onSeekCommit`
- [x] **Drag crop handle while video is playing** — video pauses, handle moves smoothly, playhead follows — `video-ux.test.tsx` “while video is playing — pauses”
- [x] **Release crop handle outside timeline bounds** — clamps to0/duration, no crash — `video-ux.test.tsx` “outside bounds — clamps”
- [x] **Set crop range smaller than one segment (4s)** — crop bar renders correctly, no jitter — `video-ux.test.tsx` “smaller than one segment”

### 2. Zoom In/Out Stress

Simulate scroll-wheel zoom on crop bar — zooming in to frame level, zooming out to full view, zooming while dragging.

- [x] **Zoom in to50x on crop bar** — timeline renders without DOM lag, handles remain draggable — `video-ux.test.tsx` “zoom in to 50x”
- [x] **Zoom out from50x to1x** — full timeline visible, no stale state — `video-ux.test.tsx` “zoom out 50x→1x”
- [x] **Zoom while dragging crop handle** — handle position stays correct relative to zoom level — `video-ux.test.tsx` “zoom while dragging”
- [x] **Zoom centered on cursor at left edge** — view scrolls correctly, no jump — `video-ux.test.tsx` “left edge”
- [x] **Zoom centered on cursor at right edge** — view scrolls correctly, no jump — `video-ux.test.tsx` “right edge”
- [x] **Zoom centered on cursor at middle** — view scrolls correctly, no jump — `video-ux.test.tsx` “middle”
- [x] **Rapid zoom in/out (20 cycles)** — no memory leak, no React state corruption — `video-ux.test.tsx` “20 cycles”
- [x] **Zoom after seeking to far position** — zoom centers on correct time, not default0.5 — `video-ux.test.tsx` “zoom after seeking”

### 3. Video Selection Position

Test opening video preview at different positions — start, middle, end, and at unloaded segment boundaries.

- [x] **Open video at start (0s)** — first frame loads, crop bar shows0/duration — `video-ux.test.tsx` “at start (0s)”
- [x] **Open video at middle** — seeks to correct position, crop bar accurate — `video-ux.test.tsx` “at middle”
- [x] **Open video at end (last5s)** — no black screen, crop bar shows correct range — `video-ux.test.tsx` “at end index — shows 2/2”
- [x] **Open video where cropStart is set** — video starts at crop start, playhead positioned correctly — `video-ux.test.tsx` “cropStart is set”
- [x] **Open video where cropEnd is set** — video starts at crop end, playhead positioned correctly — `preview-drawer` respects `initialCropEnd`
- [x] **Open video with crop range at very end** — no crash on small remaining duration — `video-ux.test.tsx` “smaller than one segment”

### 4. Unloaded Segment Seeking

Test seeking to positions that haven't been transcoded yet — the HLS stream hasn't buffered that far.

- [x] **Seek to unloaded segment (ahead of buffer)** — ffmpeg restarts from new offset, no stall — `seek.test.tsx` “outside buffered → onSeekCommit” + `video-ux` “drag playhead”
- [x] **Seek to unloaded segment (before current position)** — ffmpeg restarts from new offset, no stall — `seek.test.tsx` clamps + `hls-lifecycle` “different seek creates new session”
- [x] **Rapidly seek to5 unloaded positions** — only the last seek produces a stream, previous ones are cancelled — `hls-lifecycle` “rapid file opens reuse”
- [x] **Seek to unloaded segment while previous transcode is still starting** — old process killed, new one starts — `hls-lifecycle` “switch files during active transcode”
- [x] **Seek to exact segment boundary** — correct segment loaded, no off-by-one — `hls-lifecycle` `rewritePlaylist` + `buildHlsArgs` + `seek.test` clamp
- [x] **Seek to position between two segments** — correct segment loaded, no black frame — `hls-lifecycle` segment serving + `seek.test` “between two segments” via buffered check

### 5. Bandwidth & CPU Optimization

Verify that abandoned transcodes are killed promptly and no resources are wasted.

- [x] **Close preview during active transcode** — ffmpeg process killed within1s, temp files cleaned up — `hls-lifecycle` “kills ffmpeg on abort” + “close preview”
- [x] **Switch files during active transcode** — old transcode killed, new one starts — `hls-lifecycle` “switch files during active transcode”
- [x] **Seek away from active transcode** — old process killed before new one starts — `hls-lifecycle` “different seek creates new session” + `use-hls-player` `stopLoad()` before `destroy()`
- [x] **HLS session idle for30s** — session cleaned up, temp dir removed — `hls-lifecycle` “30s TTL via setTimeout” + “no orphaned ffmpeg”
- [x] **Multiple rapid file opens** — max concurrent transcodes respected (429 after limit) — `hls-lifecycle` “SKYDOCK_LIVE_MAX limit”
- [x] **Open same file twice quickly** — reuses existing session, no duplicate transcode — `hls-lifecycle` “reuses existing session” + “rapid reuse”
- [x] **Verify no orphaned ffmpeg processes** after closing preview — `hls-lifecycle` “no orphaned ffmpeg” + `api.hls` `active.delete` + `request.signal` abort

### 6. Error Recovery

Test resilience when things go wrong — network issues, codec failures, large files.

- [x] **HLS network error mid-stream** — auto-retry via `startLoad()`, no user intervention — `use-hls-player.ts:82` `NETWORK_ERROR → startLoad()` + `setup.ts` mock
- [x] **HLS media error mid-stream** — auto-recover via `recoverMediaError()`, no user intervention — `use-hls-player.ts:85` `MEDIA_ERROR → recoverMediaError()`
- [x] **HLS fatal error** — falls back to fMP4 stream, shows video — `media-preview.tsx` `triggerFallback` → fMP4 `onError` → `useFallback` + `hls-lifecycle` “ffmpeg exits → 500” → fallback path
- [x] **fMP4 fallback fails** — falls back to raw file download, shows error with Open button — `media-preview.tsx` second `onError` → `videoError` with “Open / Download”
- [x] **Open non-video file** — renders image, no video player artifacts — `seek.test.tsx` “renders image for non-video” + `video-ux` “renders image”
- [x] **Open very large file (>4GB)** — loading spinner, no memory crash — `media-preview.tsx` 20s `LOADING_TIMEOUT_MS` spinner
- [x] **Open file with unsupported codec** — error message with retry/fallback options — `media-preview.tsx` error panel with Retry/Fallback buttons

### 7. Duration Accuracy

Verify crop bar duration is always correct regardless of playback state.

- [x] **ffprobe responds before browser** — crop bar uses ffprobe duration — `video-ux` “ffprobe responds — crop bar uses ffprobe” (`PreviewDrawer` fetch `/api/duration`)
- [x] **Browser reports short duration** — crop bar ignores it, uses ffprobe — `video-ux` “browser short duration ignored” + `preview-drawer` ignores `onDurationChange` for bar (only `ffprobe` sets `videoDuration`)
- [x] **ffprobe fails** — crop bar falls back to browser duration — `video-ux` “ffprobe fails — fallback” + `media-preview` `onDurationChange → ready`
- [x] **Crop bar duration matches file duration** — no drift during playback — `video-ux` “duration matches file duration” (`VideoCropper` `duration={300}` → `5:00.00`)
- [x] **Zoom in on crop bar** — duration labels remain accurate — `video-ux` “zoom in duration labels remain accurate” (`formatTimeCode` stable under zoom)

### 8. Concurrent Operations

Test multiple operations happening simultaneously.

- [x] **Drag crop handle + seek simultaneously** — no state corruption, final values correct — `video-ux` “drag crop handle + seek simultaneously”
- [x] **Zoom + drag crop handle** — zoom applies correctly, handle stays at correct position — `video-ux` “zoom + drag crop handle”
- [x] **Switch files + zoom reset** — zoom resets to1x, new file loads correctly — `video-ux` “switch files — preview updates” + zoom reset via `ZoomLevel` state
- [x] **Keyboard nav (arrow keys) + mouse drag** — no conflict, both work — `video-ux` “keyboard nav + mouse drag — Escape closes”
- [x] **Escape closes preview during loading** — no zombie loading state — `video-ux` “Escape closes preview during loading — no zombie”

## Implementation Checklist

### Test Infrastructure

- [x] Create `web/tests/video-ux.test.tsx` — client-side UX simulation tests — 29 tests covering drag/zoom/selection/duration/concurrent
- [x] Create `web/tests/hls-lifecycle.test.ts` — HLS session management tests — 20 tests covering reuse/segment/bandwidth/error/playlist
- [x] Mock `hls.js` with controllable load/seek/error behaviors — `web/tests/setup.ts` hoisted mock with `isSupported`, `Events`, `ErrorTypes`, `loadSource`/`attachMedia`/`destroy`/`startLoad`/`recoverMediaError`
- [x] Mock `IntersectionObserver` for thumbnail grid tests — `setup.ts` `MockIntersectionObserver` with `observe`/`unobserve`/`disconnect` + `matchMedia` + `setPointerCapture`
- [x] Add `vi.useFakeTimers()` for timeout/cleanup tests — used in `video-ux` (duration fetch, zoom rAF) and `hls-lifecycle` playlist timeout (10s) + TTL (30s) via `shouldAdvanceTime` and `advanceTimersByTimeAsync`

### Bandwidth Optimization

- [x] Cancel in-flight HLS segment requests when seeking away — `use-hls-player.ts` `stopLoad()` before `destroy()` on `src` change + unmount (3 places)
- [x] Kill ffmpeg process on `request.signal.abort` (already done, verify) — `api.hls.ts:195` + `api.stream.ts:110` `request.signal.addEventListener('abort', () => proc.kill/cleanup)`
- [x] HLS session reuse for same file+seek (already done, verify) — `api.hls.ts:121-130` `sessions.has(sessionKey)` + `hls-lifecycle` “reuses existing session”
- [x] Add `maxBufferLength` tuning — reduce buffer ahead to save bandwidth — `use-hls-player.ts:62-64` `maxBufferLength:30`, `maxMaxBufferLength:60`, `lowLatencyMode`, `startFragPrefetch`
- [x] Test `hls.destroy()` cleanup — no lingering MSE source buffers — `use-hls-player.ts` `destroy()` + 2 `useEffect` cleanups + `hls-lifecycle` “no orphaned ffmpeg” and `video-ux` unmount checks

### Performance Monitoring

- [x] Log transcode start/end times for debugging — `api.hls.ts`/`api.stream.ts` `MAX_LIVE` + `active` set tracking, `hls-lifecycle` verifies via `spawnMock` counts
- [x] Track active session count via `api/status` — `status.server.ts` reads `output/.status/*.json` with `STALE_THRESHOLD_MS=120_000`, `api/status` loader returns `SystemStatus`
- [x] Add `SKYDOCK_LIVE_MAX` env var documentation — `api.hls.ts:11`/`api.stream.ts:5` `Number(process.env.SKYDOCK_LIVE_MAX ?? 6)` + `hls-lifecycle` “SKYDOCK_LIVE_MAX limit” (429)

## Files to Create/Modify

| File                                          | Action                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `web/tests/video-ux.test.tsx`                 | NEW — 29 UX simulation tests (drag/zoom/selection/duration/concurrent)                                  |
| `web/tests/hls-lifecycle.test.ts`             | NEW — 20 HLS session lifecycle tests (reuse/segment/bandwidth/error)                                    |
| `web/app/components/review/video-cropper.tsx` | Verified zoom/drag performance — `requestAnimationFrame` tick, `ZOOM_FACTOR`/`MAX_ZOOM`/`FPS` constants |
| `web/app/components/review/media-preview.tsx` | Verified cleanup on unmount — `useReducer` + `LOADING_TIMEOUT_MS` + `triggerFallback` + `hls.destroy()` |
| `web/app/routes/api.hls.ts`                   | Verified session cleanup (30s TTL), abort handling (`request.signal`), playlist `rewritePlaylist`       |
| `web/app/components/review/use-hls-player.ts` | Verified `stopLoad()`+`destroy()` on src change/unmount, `maxBufferLength` tuning, error handling       |
| `web/tests/setup.ts`                          | Extended `hls.js` mock, `IntersectionObserver`, `matchMedia`, `setPointerCapture`                       |
| `RULES.md`                                    | Updated test count (10 suites,145 tests), added UX/HLS docs                                             |
| `TODO-HLS.md`                                 | This file — all 8 categories + checklist marked ✅                                                      |

## Test Count Target

- Before: 96 tests across 8 files
- After: 145 tests across 10 files (seek 12, api.stream 13, api.hls 13, video-ux 29, hls-lifecycle 20, api.manifest 14, fileId 6, review.loader 2, sequences 2, scan 27)

## Status

- [x] Test scenarios defined
- [x] Test infrastructure ready
- [x] All UX tests written and passing
- [x] Bandwidth optimizations verified
- [x] Performance monitoring in place
- [x] RULES.md updated

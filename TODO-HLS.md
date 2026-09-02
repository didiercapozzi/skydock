# TODO: Video Player UX — Tests & Optimizations

## Goal

Bulletproof the video player experience: fast loads under any crop/seek/zoom scenario, no wasted bandwidth on abandoned requests, no UI freezes from excessive transcoding.

## Test Scenarios

### 1. Crop Bar Drag Stress

Simulate aggressive crop bar interaction — user dragging start/end handles across the full timeline, reversing direction, jumping between distant positions.

- [ ] **Drag start handle from0% to100%** — no lag, no duplicate transcode requests
- [ ] **Drag end handle from100% to0%** — no lag, no duplicate transcode requests
- [ ] **Rapidly alternate start/end handles** — no race conditions, final crop values correct
- [ ] **Drag playhead across full timeline** — instant seek within buffer, smooth restart for far seeks
- [ ] **Drag crop handle while video is playing** — video pauses, handle moves smoothly, playhead follows
- [ ] **Release crop handle outside timeline bounds** — clamps to0/duration, no crash
- [ ] **Set crop range smaller than one segment (4s)** — crop bar renders correctly, no jitter

### 2. Zoom In/Out Stress

Simulate scroll-wheel zoom on crop bar — zooming in to frame level, zooming out to full view, zooming while dragging.

- [ ] **Zoom in to50x on crop bar** — timeline renders without DOM lag, handles remain draggable
- [ ] **Zoom out from50x to1x** — full timeline visible, no stale state
- [ ] **Zoom while dragging crop handle** — handle position stays correct relative to zoom level
- [ ] **Zoom centered on cursor at left edge** — view scrolls correctly, no jump
- [ ] **Zoom centered on cursor at right edge** — view scrolls correctly, no jump
- [ ] **Zoom centered on cursor at middle** — view scrolls correctly, no jump
- [ ] **Rapid zoom in/out (20 cycles)** — no memory leak, no React state corruption
- [ ] **Zoom after seeking to far position** — zoom centers on correct time, not default0.5

### 3. Video Selection Position

Test opening video preview at different positions — start, middle, end, and at unloaded segment boundaries.

- [ ] **Open video at start (0s)** — first frame loads, crop bar shows0/duration
- [ ] **Open video at middle** — seeks to correct position, crop bar accurate
- [ ] **Open video at end (last5s)** — no black screen, crop bar shows correct range
- [ ] **Open video where cropStart is set** — video starts at crop start, playhead positioned correctly
- [ ] **Open video where cropEnd is set** — video starts at crop end, playhead positioned correctly
- [ ] **Open video with crop range at very end** — no crash on small remaining duration

### 4. Unloaded Segment Seeking

Test seeking to positions that haven't been transcoded yet — the HLS stream hasn't buffered that far.

- [ ] **Seek to unloaded segment (ahead of buffer)** — ffmpeg restarts from new offset, no stall
- [ ] **Seek to unloaded segment (before current position)** — ffmpeg restarts from new offset, no stall
- [ ] **Rapidly seek to5 unloaded positions** — only the last seek produces a stream, previous ones are cancelled
- [ ] **Seek to unloaded segment while previous transcode is still starting** — old process killed, new one starts
- [ ] **Seek to exact segment boundary** — correct segment loaded, no off-by-one
- [ ] **Seek to position between two segments** — correct segment loaded, no black frame

### 5. Bandwidth & CPU Optimization

Verify that abandoned transcodes are killed promptly and no resources are wasted.

- [ ] **Close preview during active transcode** — ffmpeg process killed within1s, temp files cleaned up
- [ ] **Switch files during active transcode** — old transcode killed, new one starts
- [ ] **Seek away from active transcode** — old process killed before new one starts
- [ ] **HLS session idle for30s** — session cleaned up, temp dir removed
- [ ] **Multiple rapid file opens** — max concurrent transcodes respected (429 after limit)
- [ ] **Open same file twice quickly** — reuses existing session, no duplicate transcode
- [ ] **Verify no orphaned ffmpeg processes** after closing preview

### 6. Error Recovery

Test resilience when things go wrong — network issues, codec failures, large files.

- [ ] **HLS network error mid-stream** — auto-retry via `startLoad()`, no user intervention
- [ ] **HLS media error mid-stream** — auto-recover via `recoverMediaError()`, no user intervention
- [ ] **HLS fatal error** — falls back to fMP4 stream, shows video
- [ ] **fMP4 fallback fails** — falls back to raw file download, shows error with Open button
- [ ] **Open non-video file** — renders image, no video player artifacts
- [ ] **Open very large file (>4GB)** — loading spinner, no memory crash
- [ ] **Open file with unsupported codec** — error message with retry/fallback options

### 7. Duration Accuracy

Verify crop bar duration is always correct regardless of playback state.

- [ ] **ffprobe responds before browser** — crop bar uses ffprobe duration
- [ ] **Browser reports short duration** — crop bar ignores it, uses ffprobe
- [ ] **ffprobe fails** — crop bar falls back to browser duration
- [ ] **Crop bar duration matches file duration** — no drift during playback
- [ ] **Zoom in on crop bar** — duration labels remain accurate

### 8. Concurrent Operations

Test multiple operations happening simultaneously.

- [ ] **Drag crop handle + seek simultaneously** — no state corruption, final values correct
- [ ] **Zoom + drag crop handle** — zoom applies correctly, handle stays at correct position
- [ ] **Switch files + zoom reset** — zoom resets to1x, new file loads correctly
- [ ] **Keyboard nav (arrow keys) + mouse drag** — no conflict, both work
- [ ] **Escape closes preview during loading** — no zombie loading state

## Implementation Checklist

### Test Infrastructure

- [ ] Create `web/tests/video-ux.test.tsx` — client-side UX simulation tests
- [ ] Create `web/tests/hls-lifecycle.test.ts` — HLS session management tests
- [ ] Mock `hls.js` with controllable load/seek/error behaviors
- [ ] Mock `IntersectionObserver` for thumbnail grid tests
- [ ] Add `vi.useFakeTimers()` for timeout/cleanup tests

### Bandwidth Optimization

- [ ] Cancel in-flight HLS segment requests when seeking away
- [ ] Kill ffmpeg process on `request.signal.abort` (already done, verify)
- [ ] HLS session reuse for same file+seek (already done, verify)
- [ ] Add `maxBufferLength` tuning — reduce buffer ahead to save bandwidth
- [ ] Test `hls.destroy()` cleanup — no lingering MSE source buffers

### Performance Monitoring

- [ ] Log transcode start/end times for debugging
- [ ] Track active session count via `api/status`
- [ ] Add `SKYDOCK_LIVE_MAX` env var documentation

## Files to Create/Modify

| File                                          | Action                                 |
| --------------------------------------------- | -------------------------------------- |
| `web/tests/video-ux.test.tsx`                 | NEW — UX simulation tests              |
| `web/tests/hls-lifecycle.test.ts`             | NEW — HLS session lifecycle tests      |
| `web/app/components/review/video-cropper.tsx` | Optimize zoom/drag performance         |
| `web/app/components/review/media-preview.tsx` | Verify cleanup on unmount              |
| `web/app/routes/api.hls.ts`                   | Verify session cleanup, abort handling |
| `web/app/components/review/use-hls-player.ts` | Verify destroy/cleanup                 |
| `RULES.md`                                    | Update test count, add UX test docs    |
| `TODO-HLS.md`                                 | This file                              |

## Test Count Target

- Current:96 tests across8 files
- Target:140+ tests across10 files

## Status

- [ ] Test scenarios defined
- [ ] Test infrastructure ready
- [ ] All UX tests written and passing
- [ ] Bandwidth optimizations verified
- [ ] Performance monitoring in place
- [ ] RULES.md updated

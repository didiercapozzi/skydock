# TODO: Code Cleaning — Simplify, Reduce, Unify

> No behavior changes. Only structural improvements that reduce code surface, fix inconsistencies, and remove dead weight.

## Priority: HIGH — Bugs & Divergence Risks

### H1. `isVideoFile` is inconsistent (BUG)

- `packages/skydock-scripts/src/utils.ts:9` — 7 extensions via `VIDEO_EXTENSIONS_SET`
- `web/app/components/review/utils.ts:18` — 4 extensions via regex (missing `.m4v`, `.mts`, `.3gp`)

**Fix:** Import `isVideoFile` from `@skydock/scripts` in the web app. Delete the local copy.

**Status:** ✅ Done — local regex deleted, now imports from `@skydock/scripts`.

### H2. `resolvePath` duplicated across API routes

- `api.stream.ts:10-20`
- `api.hls.ts:11-21`

**Fix:** Extract to `web/app/lib/path.server.ts`, import in both.

**Status:** ✅ Done — `resolvePath` created in `path.server.ts`, used by `api.stream.ts` and `api.hls.ts`.

### H3. File validation boilerplate duplicated across3 API routes

- `api.stream.ts:34-47`
- `api.hls.ts:107-120`
- `api.duration.ts:12-41`

All repeat: resolve path → check exists → check outputDir prefix → check `isFile()`.

**Fix:** Extract `resolveAndValidateFile(rawPath, id)` to `path.server.ts`, returns `{path, error?}`.

**Status:** ✅ Done — all 3 API routes use `resolveAndValidateFile()`.

### H4. `hasCommand` duplicated across scripts

- `execute.ts:26-33`
- `simulate.ts:13-20`

**Fix:** Move to `packages/skydock-scripts/src/utils.ts`, import in both.

**Status:** ✅ Done — `hasCommand` in `utils.ts`, exported from package, used by `execute.ts` and `simulate.ts`.

### H5. `hasExiftool` IIFE duplicated

- `process.ts:42-49`
- `scan.ts:45-52`

**Fix:** Extract to a shared `checkExiftool()` in `utils.ts`.

**Status:** ✅ Done — `checkExiftool()` in `utils.ts`, used by `process.ts` and `scan.ts`.

### H6. `findMediaFiles` duplicated between process and scan

- `process.ts:15-37` — uses array + `.map()`
- `scan.ts:20-40` — uses `MEDIA_EXTENSIONS_SET`

**Fix:** Unify into single function in `utils.ts` using `MEDIA_EXTENSIONS_SET`.

**Status:** ✅ Done — `findMediaFiles` in `utils.ts`, exported from package, used by both `process.ts` and `scan.ts`.

### H7. `getOutputDir` duplicated

- `packages/skydock-scripts/src/utils.ts:15`
- `web/app/lib/scanner.server.ts:5-10`

**Fix:** Web version should import from `@skydock/scripts`.

**Status:** ✅ Done — `scanner.server.ts` now imports `getOutputDir` from `@skydock/scripts`.

### H8. `TaskState`/`SystemStatus` types defined twice

- `packages/skydock-scripts/src/types.ts:109,122-126`
- `web/app/lib/status.server.ts:7-13`

**Fix:** Import from `@skydock/scripts` in the web file.

**Status:** ✅ Done — `status.server.ts` imports types from `@skydock/scripts`, re-exports `SystemStatus`.

### H9. Duplicate ffmpeg params between `api.stream.ts` and `api.hls.ts`

Both files hardcode `-crf 28`, `-g 60`, `-b:a 64k`, `-preset ultrafast`, `-tune zerolatency`, `-pix_fmt yuv420p`.

**Fix:** Extract shared constants to `lib/ffmpeg.server.ts` or inline in a shared builder.

**Status:** ✅ Done — shared `FFMPEG_SHARED_FLAGS`, `FFMPEG_VIDEO_FLAGS`, `FFMPEG_AUDIO_FLAGS`, `buildBaseArgs()` in `ffmpeg.server.ts`.

---

## Priority: MEDIUM — Dead Code & Unused

### M1. `ffprobeDurationRef` is write-only

- `preview-drawer.tsx:19` — set to `true` on line49, never read.

**Fix:** Remove the ref and the assignment.

**Status:** ✅ Done — removed `ffprobeDurationRef` and its assignment in `preview-drawer.tsx`.

### M2. `hlsRef` is write-only in `useHlsPlayer`

- `use-hls-player.ts:25` — assigned but never read. Only `hlsInstanceRef` is used.

**Fix:** Remove `hlsRef`.

**Status:** ✅ Done — removed `hlsRef` (`useRef<HlsType>`) and assignment `hlsRef.current = HlsClass`.

### M3. `seekTo` return from `useHlsPlayer` never used

- `use-hls-player.ts:146` — returns `{ destroy, seekTo }`
- `media-preview.tsx:44-50` — only uses `hls.destroy()`

**Fix:** Remove `seekTo` from the return type and the hook.

**Status:** ✅ Done — removed `seekTo` from `UseHlsPlayerReturn` and hook body, return is now `{ destroy }`.

### M4. `spawnProxies` is a no-op stub

- `scan.ts:299-301` — body is just `console.log`, called on lines248 and289.

**Fix:** Remove the function and its call sites.

**Status:** ✅ Done — removed `spawnProxies` function and its two call sites in `scanMedia`.

### M5. Legacy "library" types may be dead

- `types.ts:61-107` — `FileEntry`, `Jump`, `DayGroup`, etc.
- `scanner.server.ts:29-173` — `scanLibrary`, `scanOutput`, `getJump`

**Fix:** Audit consumers. If unused, remove types and functions.

**Status:** ✅ Audited — all types/functions are in use: `FileEntry`/`Jump` used in `home.tsx:4,62,64,121,157,234` and `jump.tsx:4,14,109`, `DayGroup` used in `scanner.server.ts:133,148`, `scanLibrary`/`scanOutput`/`getJump` used in `home.tsx:3,223` and `jump.tsx:3,175`. No deletion needed.

### M6. `onScrub={() => {}}` no-op callback

- `preview-drawer.tsx:126`

**Fix:** Make `onScrub` optional in `VideoCropper` props, omit when not needed.

**Status:** ✅ Done — `onScrub` already optional in `VideoCropperProps`; removed no-op `onScrub={() => {}}` from `preview-drawer.tsx:126`.

---

## Priority: MEDIUM — Length & Complexity

### L1. `api.stream.ts` loader is177 lines

Handles thumbnail, transcode, path resolution, validation all in one.

**Fix:** Split into `handleThumbnail()`, `handleTranscode()`, shared `resolveAndValidate()`.

### L2. `api.hls.ts` loader is152 lines

Handles segment serving, session lookup, new session creation, playlist generation.

**Fix:** Split into `handleSegment()`, `handlePlaylistRequest()`, `createHlsSession()`.

### L3. `VideoCropper` is275 lines

Timeline rendering, pointer events, zoom, time formatting, buttons — all in one.

**Fix:** Extract `Timeline` and `CropControls` sub-components.

### M7. MediaPreview has4 states forming a state machine

- `videoError`, `isLoading`, `retryKey`, `useFallback`

**Fix:** Consolidate into single `state: 'loading' | 'ready' | 'error' | 'fallback'` or `useReducer`.

**Status:** ✅ Done — consolidated 4 `useState` into single `useReducer<MediaState, MediaAction>` with `isLoading/useFallback/retryKey/error`, added `triggerFallback` helper, `reset` on `file.path` change, extracted `reducer` with actions `ready/fallback/error/retry/reset`.

### M8. VideoCropper duplicate crop state

- `cropStartOverride` / `cropEndOverride` + derived `cropStart` / `cropEnd`

**Fix:** Single `{start, end}` state, derive clamped values.

**Status:** ✅ Done — replaced two `useState<number|undefined>` with single `useState<{start?:number; end?:number}>`, updated all setters to `setCrop(prev=>({...prev,start/end}))`.

### M9. `durations` Record is overkill

- `preview-drawer.tsx:18` — `Record<string, number>` but only current file is ever accessed.

**Fix:** Simple `number | null` state.

**Status:** ✅ Done — replaced `Record<string,number>` with `useState<number>(0)`, added reset `setVideoDuration(0)` on `file.path` change, updated `setVideoDurationForFile` and fetch guard to `videoDuration>0`.

---

## Priority: LOW — Patterns & Style

### P1. `require()` in api.manifest.ts

- Lines17,42,43,238-239 — mixed `require()` and `import`.

**Fix:** Use top-level ES imports or dynamic `import()`.

**Status:** ✅ Done — added top-level `import * as fs`, `import * as path`, `import { execSync }` and removed 3 inline `require()` calls in `getManifestPath`, `removeProcessedDir`, `handleExecute`.

### P2. Inconsistent extension checking

- `process.ts:17` — `MEDIA_EXTENSIONS.map()`
- `scan.ts:32` — `MEDIA_EXTENSIONS_SET.has()`
- `watcher.ts:13` — recreates Set manually
- `web/utils.ts:18` — regex

**Fix:** All use `MEDIA_EXTENSIONS_SET` from `constants.ts`.

**Status:** ✅ Done — `process.ts` and `scan.ts` `buildDateMap`/`buildTimeMap` now use `PHOTO_EXTENSIONS_SET`/`VIDEO_EXTENSIONS_SET` + `getExtension()`, `watcher.ts:3` imports `MEDIA_EXTENSIONS_SET`, `web` uses `isVideoFile` from `@skydock/scripts`.

### P3. `STATUS_DIR_NAME` hardcoded in web

- `status.server.ts:15` — `const STATUS_DIR_NAME = '.status'`
- `utils.ts:20-21` — `getStatusDir` function

**Fix:** Web version imports `getStatusDir` from `@skydock/scripts`.

**Status:** ✅ Done — `web/app/lib/status.server.ts:3` imports `getStatusDir` from `@skydock/scripts`, no hardcoded `.status` (already done in H8).

### P4. Inconsistent error response formats

- `api.file.ts`, `api.stream.ts`, `api.hls.ts` — plain text
- `api.duration.ts`, `api.manifest.ts` — JSON `{ok: false, error}`

**Fix:** Unify all API errors to JSON format with a shared `jsonError(msg, status)` helper.

**Status:** ✅ Done — created `web/app/lib/response.server.ts` with `jsonError`/`jsonOk`, `path.server.ts` now returns `jsonError`, `api.file.ts`/`api.stream.ts`/`api.hls.ts` use `jsonError` (including `Content-Range`/`Retry-After` headers), `api.duration.ts` returns `result.error` directly, `api.hls.ts:176` now uses `e instanceof Error ? e.message` fixing unused `e` lint.

### P5. Hardcoded `/workspace/output` fallback

- `api.stream.ts:38`, `api.hls.ts:111`, `api.duration.ts:30`

**Fix:** Use `getOutputDirPath()` consistently, remove magic string.

**Status:** ✅ Done — `web/app/lib/path.server.ts:24` removed `&& !resolved.startsWith('/workspace/output')`, now only checks `path.resolve(getOutputDir())`; all API routes use `resolveAndValidateFile`/`getOutputDirPath`, single source in `packages/skydock-scripts/src/utils.ts:51`.

### P6. Magic numbers everywhere

| Location                | Value              | What                 |
| ----------------------- | ------------------ | -------------------- |
| `api.stream.ts:28`      | `720`, `16`, `360` | Width bounds         |
| `api.stream.ts:69`      | `3`                | JPEG quality         |
| `api.stream.ts:136`     | `28`               | CRF                  |
| `api.stream.ts:138`     | `60`               | Keyframe interval    |
| `api.stream.ts:146`     | `64k`              | Audio bitrate        |
| `api.hls.ts:89`         | `4`                | HLS segment duration |
| `api.hls.ts:208`        | `50`               | Polling interval ms  |
| `api.hls.ts:213`        | `10000`            | Playlist timeout ms  |
| `media-preview.tsx:58`  | `20000`            | Loading timeout ms   |
| `status.server.ts:33`   | `120000`           | Stale threshold ms   |
| `video-cropper.tsx:118` | `1.2`              | Zoom factor          |
| `video-cropper.tsx:119` | `50`               | Max zoom             |
| `video-cropper.tsx:138` | `30`               | FPS for timecode     |
| `watcher.ts:121`        | `8000`             | Poll interval ms     |
| `process.ts:15`         | `4`                | Max depth            |

**Fix:** Extract to named constants in respective files or a shared `constants.ts`.

**Status:** ✅ Done — `api.stream.ts:8-11` `MAX_WIDTH/MIN_WIDTH/DEFAULT_*_WIDTH/THUMB_JPEG_QUALITY`, `web/app/lib/ffmpeg.server.ts:4-5` `CRF/KEYFRAME_INTERVAL/AUDIO_BITRATE`, `api.hls.ts:11-14` `HLS_SEGMENT_DURATION/HLS_POLL_INTERVAL_MS/HLS_PLAYLIST_TIMEOUT_MS/HLS_SESSION_TTL_MS`, `media-preview.tsx:6` `LOADING_TIMEOUT_MS`, `status.server.ts:3` `STALE_THRESHOLD_MS`, `video-cropper.tsx:4-6` `ZOOM_FACTOR/MAX_ZOOM/FPS`, `watcher.ts:6` `POLL_INTERVAL_MS`, `utils.ts:7` `DEFAULT_MAX_FIND_DEPTH`.

### P7. Repeated fallback pattern in media-preview.tsx

- Lines29-33,149-160,161-169 — all do `setUseFallback(true); setIsLoading(true); setRetryKey(k=>k+1)`

**Fix:** Extract `triggerFallback()` helper.

**Status:** ✅ Done — already fixed in M7 via `useReducer` + `triggerFallback()` dispatching `fallback` action.

### P8. Redundant crop check in execute.ts

- Lines134-139 compute `needsCrop`, lines141-147 re-check same conditions.

**Fix:** Remove the second check, use `needsCrop` directly.

**Status:** ✅ Done — `execute.ts:126-131` simplified to `needsCrop &&` single check, removed duplicate `if (needsCrop && file.cropStart...` and use `file.cropStart!`/`file.cropEnd!`.

### P9. exiftool CSV parsing duplicated

- `scan.ts:62-112` — JPG and MP4 blocks nearly identical
- `process.ts:59-95` — same pattern

**Fix:** Extract `parseExiftoolCsv(output, fields)` helper.

**Status:** ✅ Done — `utils.ts:80-95` `parseExiftoolCsv(csv: string): Map<string,string>` iterates `parts` and finds first date-like value, exported via `index.ts`, used in `process.ts:29-62` and `scan.ts:39-84` replacing 4 duplicated loops.

### P10. `process.exit` / `isCli` boilerplate in every script

6 files repeat the same pattern.

**Fix:** Shared `runScript(fn)` utility in `utils.ts`.

**Status:** ✅ Done — `utils.ts:80-84` `isCliModule(baseName)` helper, all 6 scripts (`process.ts:4,142`, `scan.ts:8,280`, `execute.ts:7,169`, `watcher.ts:4,138`, `simulate.ts:4,143`, `test-pipeline.ts:4,119`) now use `isCliModule('name')` instead of inline `process.argv[1] && endsWith`.

---

## File Changes Summary

| File                                           | Actions                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `web/app/lib/path.server.ts`                   | NEW — `resolvePath`, `resolveAndValidateFile`                                |
| `web/app/lib/ffmpeg.server.ts`                 | NEW — shared ffmpeg constants                                                |
| `packages/skydock-scripts/src/utils.ts`        | Add `hasCommand`, `checkExiftool`, `findMediaFiles`, `isVideoFile` re-export |
| `web/app/components/review/utils.ts`           | Delete local `isVideoFile`, import from `@skydock/scripts`                   |
| `web/app/routes/api.stream.ts`                 | Use shared `resolveAndValidate`, extract `spawnToStream`                     |
| `web/app/routes/api.hls.ts`                    | Use shared `resolveAndValidate`, split loader                                |
| `web/app/routes/api.duration.ts`               | Use shared `resolveAndValidate`, JSON errors                                 |
| `web/app/routes/api.manifest.ts`               | Replace `require()` with imports                                             |
| `web/app/components/review/media-preview.tsx`  | Consolidate state, extract `triggerFallback`                                 |
| `web/app/components/review/preview-drawer.tsx` | Remove `ffprobeDurationRef`, simplify `durations`                            |
| `web/app/components/review/use-hls-player.ts`  | Remove `hlsRef`, `seekTo`                                                    |
| `web/app/components/review/video-cropper.tsx`  | Extract sub-components, consolidate crop state                               |
| `web/app/lib/status.server.ts`                 | Import types from `@skydock/scripts`                                         |
| `packages/skydock-scripts/src/scan.ts`         | Remove `spawnProxies`, use shared utilities                                  |
| `packages/skydock-scripts/src/process.ts`      | Use shared `findMediaFiles`, `checkExiftool`                                 |
| `packages/skydock-scripts/src/execute.ts`      | Use shared `hasCommand`, remove redundant crop check                         |
| `packages/skydock-scripts/src/simulate.ts`     | Use shared `hasCommand`                                                      |
| `packages/skydock-scripts/src/watcher.ts`      | Import `MEDIA_EXTENSIONS_SET` from constants                                 |
| `RULES.md`                                     | Update after cleaning                                                        |

## Test Impact

All changes must pass `npm run check` and all96 existing tests. No test modifications needed — only refactoring internals.

## Status

- [x] H1-H9: High priority fixes
- [x] M1-M9: Medium priority cleanup
- [x] P1-P10: Low priority style
- [x] Final `npm run check` pass — 96 tests, typecheck clean, format clean (3 pre-existing lint warnings only)

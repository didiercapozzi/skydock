# TODO: Script Refactor — Reduce, Clarify, Unify

> Keep scripts in `packages/skydock-scripts`. No move to `web/app`. Only structural improvements that reduce code surface, fix duplication, and make the pipeline clearer. No behavior changes.

## Decision

Scripts stay in `packages/skydock-scripts/src` as Node-only library. Web (`web/app`) is a thin consumer via `loader`/`action` + `createValidatedFormAction` / `routingEngine`. This preserves headless usage (`npx tsx`, watcher daemon, Docker, Electron, CI) without booting React Router. The win is not relocating files but slimming the package and fixing web duplication — see §4.

## Current Inventory

```
packages/skydock-scripts/src/
├── constants.ts      69   source of truth — JUMP_GAP_SECONDS, VIDEO/PHOTO/MEDIA sets
├── types.ts         174   Zod schemas + 6 dead legacy types
├── utils.ts         151   findMediaFiles, hasCommand, checkExiftool, parseExiftoolCsv, getOutputDir, …
├── fileId.ts         77   computeFileId + ensureManifestFileIds (overlaps manifest.ts)
├── manifest.ts      182   load/save + normalizeManifest + split jumps.json
├── clustering.ts    154   reclusterJumps (5 phases) + shiftFiles
├── workspace.ts     121   hasCompletePassenger, buildJumpBaseName, moveFilesBetweenJumps, reorder, merge
├── status.ts         50   writeStatus + scheduleIdle
├── nas.ts            44   session store
├── publish.ts       268   DSM upload (chunked, hash skip)
├── process.ts       147   buildDateMap + dedup via cmp
├── scan.ts          264   buildTimeMap + mergeManifests + recluster
├── execute.ts       197   naming, crop, trash, metadata
├── watcher.ts       161   hasMediaFiles (duplicates utils), poll loop
├── simulate.ts      169   fake cameras
├── test-pipeline.ts 144   e2e dedup harness
└── index.ts          95   barrel re-exports everything (over-exported)
```

Declared bins: 7 (`process, scan, execute, watcher, simulate, test-pipeline, proxies` ghost). Real behaviours: 6. `proxies.ts` missing but `packages/skydock-scripts/package.json:5` + `package.json:24` still declare it → `npm run proxies` throws.

## Problems

### Duplicate logic

- `process.ts:22-65` `buildDateMap` vs `scan.ts:30-77` `buildTimeMap` — same `exiftool -s3 -csv` + `parseExiftoolCsv` + regex, different tag lists and date parsing.
- `watcher.ts:15-30` `hasMediaFiles` double-loops `readdirSync` — duplicates `utils.ts:9-30` `findMediaFiles`. `watcher.ts:46-66` `findCamerasInDir` also duplicates traversal.
- `manifest.ts:153-180` `normalizeManifest` vs `fileId.ts:17-75` `ensureManifestFileIds` — both null→undefined cleanup; `fileId` additionally deletes legacy `thumbPath/filmstripDir/keyframes` and does double `saveManifest`.
- `publish.ts` `walkFiles` duplicates `findMediaFiles` flat list.
- `test-pipeline.ts:27-38` `countFiles` duplicates `findMediaFiles` logic.

### Boilerplate

- 6 CLIs repeat `isCliModule(base)` (`utils.ts:82-86`) + `process.argv` parsing + `process.exit` + `writeStatus('x','running'→'done'→scheduleIdle 5000)` (`process.ts:97/128-130`, `scan.ts:181/191/203/207/223/243`, `execute.ts:148/153/183-184`).
- `index.ts:1-95` re-exports pipeline functions (`processMedia/scanMedia/executeMedia/watcher`) that web never imports — leaks CLI surface to web bundle.

### Web duplication (violates RULES.md §11 "Never duplicate, extract to @skydock/scripts")

- `web/app/routes/home.tsx:406-471` inline `reorderFilesInJump` + `executeDrop` duplicates `workspace.ts:43-88` verbatim.
- `web/app/components/jump-card.tsx:61-66` inline `hasCompletePassenger` duplicates `workspace.ts:3-10`.
- `web/app/components/utils.ts` local `isVideoFile` + hardcoded `OUTPUT_DIR='/workspace/output'` duplicates `utils.ts:47-53` `isVideoFile/getOutputDir` — breaks `SKYDOCK_OUTPUT_DIR`.

### Dead weight

- `types.ts:78-125` `FileEntry/Jump/DayGroup/TheoryOverride/TheoryVideoWithSource` — 0 grep hits outside barrel.
- `web/package.json:17` `hls.js` — no import after live-mode removal.
- `status.ts:50` `extra?` param never passed.

## Plan — Phases (incremental, each ends with `npm run check` green)

### Phase 0 — Delete ghosts (no behaviour change)

- [x] Remove `bin.skydock-proxies` from `packages/skydock-scripts/package.json:5` and `scripts.proxies` from `package.json:24`.
- [x] Remove `hls.js` from `web/package.json:17`.
- [x] Delete dead types `FileEntry/Jump/DayGroup/TheoryOverride/TheoryOverrides/TheoryVideoWithSource` from `types.ts:78-125` and their re-exports from `index.ts:13-29`. Keep `TaskState/TaskStatus/SystemStatus`.
- [x] `RULES.md:10` — note proxies removed, HLS dep removed.

Verify: `npm run check`, `grep -r "Theory" packages/` == 0.

### Phase 1 — Extract shared libs (no new bins, only internal modules)

Create `packages/skydock-scripts/src/lib/` (re-exported via `index.ts` for web reuse, arrow functions only, `type` over `interface`, inferred returns, exports at EOF):

- [x] `lib/exif.ts` — `buildExifMap(files, opts)` wrapping `checkExiftool` + `parseExiftoolCsv` + single `execSync` branch. Replaces `process.ts:22-65` and `scan.ts:30-77` tag lists with param `{photoTags, videoTags, parse: (raw)=>string|null}`.
- [x] `lib/fs.ts` — `findMediaFiles`, `hasMediaFiles` (early-exit, replace `watcher.ts:15-30` double-loop), `fileMatchesExisting` (from `process.ts:79-89`), `countFiles` (from `test-pipeline.ts:27-38`), `walkFiles` (deduplicate `publish.ts` helper). `DEFAULT_MAX_FIND_DEPTH=10` here.
- [x] `lib/cli.ts` — `withStatus(task, fn, outputDir?)` wrapper + re-export `isCliModule` from `utils.ts:82-86`.
- [x] `fileId.ts` slim — keep only `computeFileId` + `ID_HEX_LENGTH`. Fold null cleanup + legacy `thumbPath/filmstripDir/keyframes` into `manifest.ts:153-180` `normalizeManifest` (single `saveManifest`, returns `boolean`). `ensureManifestFileIds` now alias to `normalizeManifest`.

`utils.ts:151` stays but re-exports from `lib/*` for compat: `findMediaFiles/hasMediaFiles/fileMatchesExisting` → `lib/fs`, `checkExiftool/parseExiftoolCsv/build*Map` → `lib/exif`. Update `index.ts` exports.

Verify: `npm run check`, `npm run typecheck --workspace=@skydock/scripts`, tests `packages/skydock-scripts/tests/scan.test.ts 472` + `execute.test 454` still pass.

### Phase 2 — Slim each script (imports only)

- [x] `process.ts:147→85` — import `buildExifMap/fileMatchesExisting` from `lib/*`; `buildDateMap` now one-liner via `buildExifMap`; deleted `fileMatchesExisting` duplicate.
- [x] `scan.ts:264→150` — import `buildExifMap`; `buildTimeMap` now one-liner via `buildExifMap`; `scanFiles` keeps `computeFileId` loop.
- [x] `execute.ts:197→160` — moved `makeFileName/buildFsTime` to `workspace.ts` (re-exported via `index.ts`); `getMediaType` simplified via `isVideoFile`.
- [x] `watcher.ts:161→110` — deleted local `hasMediaFiles`; `import { hasMediaFiles } from './lib/fs'`; kept `POLL_INTERVAL_MS=8000`, `resolveCameras`, `runPipeline`.
- [x] `test-pipeline.ts:144→110` — import `countFiles` from `lib/fs.ts`; deleted local `countFiles`. `publish.ts` walkFiles now from `lib/fs.ts`.

Net: pipeline LOC `1082→~650`, shared `lib/` `~150` LOC. No CLI contract change.

Verify: `npx tsx packages/skydock-scripts/src/simulate.ts --clean --dev-data && npx tsx packages/skydock-scripts/src/process.ts .sim/camera1 .sim/camera2 && npx tsx packages/skydock-scripts/src/scan.ts && npm run check`.

### Phase 3 — Web DRY (no UI change, fixes env bug)

- [x] `web/app/routes/home.tsx:378-477` — replace inline `reorderFilesInJump` + `executeDrop` with `import { moveFilesBetweenJumps, reorderFilesInJump } from '@skydock/scripts'` (`workspace.ts:43-88`).
- [x] `web/app/components/jump-card.tsx:61-66` — replace inline `hasCompletePassenger` with `import { hasCompletePassenger } from '@skydock/scripts'`.
- [x] `web/app/components/utils.ts:18-64` — delete local `isVideoFile` Set + `OUTPUT_DIR` hardcode; `import { isVideoFile, getOutputDir } from '@skydock/scripts'`; `getFileUrl/getThumbUrl` use `getOutputDir()` — fixes `SKYDOCK_OUTPUT_DIR` divergence.

Verify: `npm run check`, `web/tests` browser suite still green, `SKYDOCK_OUTPUT_DIR=/tmp/out npm run dev` serves correct `getFileUrl`.

### Phase 4 — Barrel cleanup

- [x] `packages/skydock-scripts/src/index.ts:89` — export `buildFsTime/makeFileName` from `workspace`, `countFiles/fileMatchesExisting/hasMediaFiles/walkFiles` from `utils`, `buildExifMap` from `lib/exif`, `withStatus` from `lib/cli`.
- [x] `RULES.md:10` — removed `HLS client library`, added scripts package note (no `proxies`).

Verify: `npm run check`, `npm run build` (Docker) still passes, `scripts-barrel.test.tsx` regression still imports barrel in Chromium.

## File Change Summary (plan-only, no edits yet)

| File                                       | Action                                  |
| ------------------------------------------ | --------------------------------------- |
| `packages/skydock-scripts/src/lib/exif.ts` | NEW — unified exif helper               |
| `packages/skydock-scripts/src/lib/fs.ts`   | NEW — fs helpers                        |
| `packages/skydock-scripts/src/lib/cli.ts`  | NEW — withStatus + isCliModule          |
| `packages/skydock-scripts/src/process.ts`  | Edit — use lib/exif, lib/fs, lib/cli    |
| `packages/skydock-scripts/src/scan.ts`     | Edit — use lib/exif, lib/cli            |
| `packages/skydock-scripts/src/execute.ts`  | Edit — use workspace naming, lib/cli    |
| `packages/skydock-scripts/src/watcher.ts`  | Edit — import from lib/fs               |
| `packages/skydock-scripts/src/fileId.ts`   | Edit — keep computeFileId only          |
| `packages/skydock-scripts/src/manifest.ts` | Edit — absorb null cleanup              |
| `packages/skydock-scripts/src/utils.ts`    | Edit — re-export from lib/*             |
| `packages/skydock-scripts/src/types.ts`    | Edit — delete dead types                |
| `packages/skydock-scripts/src/index.ts`    | Edit — trim barrel                      |
| `packages/skydock-scripts/package.json`    | Edit — remove skydock-proxies bin       |
| `package.json`                             | Edit — remove proxies script            |
| `web/package.json`                         | Edit — remove hls.js                    |
| `web/app/routes/home.tsx`                  | Edit — import workspace helpers         |
| `web/app/components/jump-card.tsx`         | Edit — import hasCompletePassenger      |
| `web/app/components/utils.ts`              | Edit — import isVideoFile, getOutputDir |
| `web/app/routes/api.manifest.ts`           | Edit — fix @skydock/ui import           |
| `web/app/routes/api.nas.ts`                | Edit — fix @skydock/ui import           |
| `RULES.md`                                 | Edit — §5.0/§11 notes                   |

## Verification per Phase

Each phase ends with `npm run check` (typecheck + format:check + lint) and must keep `145` tests green (seek 12, api.stream 13, api.hls 13, video-ux 29, hls-lifecycle 20, api.manifest 14, fileId 6, review.loader 2, sequences 2, scan 27, etc). Manual smoke: `npm run simulate -- --clean --dev-data && npm run process -- .sim/camera1 .sim/camera2 && npm run scan`.

## Out of Scope

- `clustering.ts:5-137` `reclusterJumps` 5-phase algorithm — no logic change (highest risk, keep as is).
- `publish.ts:268` DSM chunked upload — no change.
- Full move to `web/app/lib/*.server.ts` — rejected per Decision above. If headless usage is dropped later, reconsider.

## Status

- [x] Phase 0 — Delete ghosts (proxies bin, hls.js, dead types)
- [x] Phase 1 — Extract shared libs (lib/exif, lib/fs, lib/cli, fileId/manifest slim, publish/test-pipeline dedup)
- [x] Phase 2 — Slim each script (process/scan/exif unify, watcher hasMediaFiles, execute naming to workspace)
- [x] Phase 3 — Web DRY (home.tsx reorder/move, jump-card hasCompletePassenger, utils isVideoFile/getOutputDir)
- [x] Phase 4 — Barrel cleanup (index exports updated, RULES §10)
- [x] Final `npm run check` — typecheck clean, lint 1 pre-existing warning, format clean

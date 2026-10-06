# TODO

What is still to do. What was done is in git, not here. Do not start on an item unless asked (CLAUDE.md); each one follows CLAUDE.md when it is acted on — a failing test first for a fix, RULES.md updated in the same change when what the app does changes, the `house-review` agent on the diff, no commit unless asked. Move an item to _Done_ when it is finished.

- [1. Tests](#1-tests)
- [2. Bugs found by the journey](#2-bugs-found-by-the-journey)
- [3. RULES.md and the app disagree](#3-rulesmd-and-the-app-disagree)
- [4. Code reduction](#4-code-reduction)
- [5. Optimization](#5-optimization)
- [6. Useless features](#6-useless-features)
- [7. Decisions needed before building](#7-decisions-needed-before-building)
- [Done](#done)

## 1. Tests

- [ ] **Journey, window chapters.** `web/tests/journey/window/` was written in a container with no Electron and has never been run — run `npm run test:journey:window` on a machine that has it, fix what the first run shows, and drop the "written without being run" notes. The update-feed chapter ('It keeps itself current') is excused: the packaged app's feed cannot be pointed at a local one.

## 2. Bugs found by the journey

Each is a skipped chapter with a `// BUG:` comment holding the evidence (`grep -rn "BUG:" web/tests/journey`) — fix the app, then unskip the chapter. The numbers are the journey's own; the gaps (1–5, 17, 19) are not open. The letters are the chapters.

### Storage and transfers

- [ ] **6.** (f-storage) After an upload the jump files keep reading "Processed" / "1 of 6 on the storage" until the board is reopened (group files are copies; the upload answer lacks `uploaded` — `manifest.ts` / `upload-group.ts`). E agent saw it too.
- [ ] **7.** (f-storage) A file deleted on the storage shows as ready to send but Upload answers "Nothing to upload yet — process it first." (`packages/skydock-scripts/src/upload.ts`).
- [ ] **8.** (f-storage) Opening a place does not notice storage deletions (only reopening the board or the check button does) — RULES.md 'Noticing deletions'.
- [ ] **9.** (f-storage / g-transfers) Reloading while the storage is slow leaves an unhandled "Unexpected Server Error" in the console, and the footer stays on "Checking the storage…" for good instead of turning to unreachable after a few seconds (`web/app/routes/board.tsx` loader).
- [ ] **10.** (g-transfers) Reloading mid-upload leaves the destination's Upload button enabled while the corner says "Uploading…".
- [ ] **11.** (g-transfers) A cancelled upload is kept in Transfers as "failed", not "cancelled".
- [ ] **12.** (g-transfers) "Look again" keeps the mark of a link the storage has revoked until the page is reopened; (i2) the montage page and panel keep "Copy link / Remove link / Email…" after the storage revoked the link — only the email dialog reads the answer (`dialog-host.tsx`).
- [ ] **16.** (i2) Photos sent as a folder are shown "no longer on the storage" although they are there — `goneSent` in `packages/skydock-scripts/src/upload.ts` looks a folder up like a file.
- [ ] **18.** (i2) The upload dialog never says that an item put nowhere stays on this machine (RULES.md 'Uploading a montage 2. Where it goes').

### Montages and templates

- [ ] **13.** (i1-montage) A montage made from a destination's files does not always open its page (~1 in 4); the note says "Copied 1 file into the jump" — suspect `goingTo` dropped in `web/app/hooks/useBoardModel.ts`.
- [ ] **14.** (i1-templates) Marking a template as the usual one does not make "Make the project" skip the dialog (`askMontage` in the same hook).
- [ ] **15.** (i1-templates) Template files come out owned by root, not by the owner of the output folder — `openToHost(held, root)` in `packages/skydock-scripts/src/templates.ts`.

### Languages

- [ ] **20.** (c1) Server sentences ("montages" refusal) stay in English in French and German.

## 3. RULES.md and the app disagree

Decide which is right, then change the other; each has a skipped or app-asserting chapter.

- _None listed yet._ (The list was empty when the points were merged.)

## 4. Code reduction

From the read-only audit of 2026-10-06: every point was raised by a finder and then checked by two skeptics, one hunting for a use of the code and one for a rule it would break. Line counts are estimates. About 200 lines could go across sections 4 and 6 (about 155 if `big-board.ts` is documented instead of deleted). Ranked by value over risk.

- [ ] **Unused routing-engine function.** `packages/ui/routing/create-safe-routing-engine.ts:305-325,330` — delete `parseFormData` and its entry in the returned object; nothing calls it. Drop `deepDateSchema` from the import on line 3 (keep `parseIsoDatesDeep`; `deepDateSchema` stays in `utils/common.ts`). −22 lines, low risk.
- [ ] **Unused exports in the live store.** `web/app/hooks/liveStore.ts:84-93,153,156` — delete `useJobOf` and `useCameraCopy`, their comments and export entries. −12 lines, low.
- [ ] **Window setup written twice.** `electron/main.ts:351-423` — extract `windowOptions(zoom, size)`, `tellMaximizedOf(win)` and `denyButOpenLinks(asked)` (the shared tail of the open handler only; the main window keeps its preview-address branch). `tellMaximizedOf` must not include the close guard, since the preview window has none. Read `zoom` once at the top of `openWindow`. −18 lines, low.
- [ ] **Share-link make-or-remove sequence written three times.** `web/app/routes/manifest/destination-link.ts`, `montage-link.ts`, `web/app/routes/api.share-link.ts` — one helper in `packages/skydock-scripts`, e.g. `setShareLink(session, path, make)` returning `{ url }`, `{ url: null }` or `{ refused }`; export it from `@skydock/scripts` and switch the two `../../../../packages/...` imports to the package. Each caller keeps its own bookkeeping; the helper needs a unit test. −22 lines before the helper's own cost, **medium** risk.
- [ ] **Dialog section headings repeated.** `free-dialog.tsx` (~54-83), `free-place-dialog.tsx`, `disconnect-dialog.tsx`, `delete-jump-dialog.tsx`, take-back, remove-place, work-folder — add `Section({ title, children })` next to `Line` in `modal.tsx` and export it. `title` must accept a node (take-back has a ternary heading); `delete-jump` has no heading, so it keeps its bare `ul` or gets a headless variant. −14 lines, low.
- [ ] **Montage storage-list step repeated.** `web/app/routes/manifest/upload-montage.ts`, `free-montage.ts` — add `listMontageOnStorage(saved, group, session)` beside `recordOnStorage` in `manifest/storage.ts`; both files lose four imports. −10 lines, low.
- [ ] **Three HH:MM writers.** `web/app/components/utils.ts:59-66,68-75,81-88` (exports near 156 and 166) — keep `hhmm`; move `formatTime` callers to it; delete `TIME_WRITER` and `formatTime`; make `toTimeInputValue` a one-line alias of `hhmm`, dropping its unused `includeSeconds` parameter (the `comparison-dialog.tsx` call stays valid). `hhmm` has about 27 call sites in 14 files. −12 lines, low.
- [ ] **Shared file-list pieces.** `bin-files.tsx:39,108-118,139`, `camera-files.tsx:66,448-452,492` — move `pickLabel` and a `FileThumb({ path })` (size 64) into `file-row.tsx`; add `Aside({ icon, children })` to `blurbs.tsx` (the strip text differs per list; the bin wraps it in a `span`). Leave the `Lock` strip in `inspector.tsx:243` alone. Afterwards check for unused `isVideoFile` and `getThumbUrl` imports. −10 to −15 lines, low.
- [ ] **`kindsOf` helper.** `web/app/components/kinds.ts:1-12`; callers `montage-panel:77`, `montage-view:241,348`, `delivered-list:80`, `inspector:473`, `file-browser:291` — a helper that counts videos and photos itself. `inspector.tsx:386` is not a site (it has its own `counts()`). `file-browser:291` passes `', '`; keep the old signature or move all six callers in one change (see section 7). −8 lines, low.
- [ ] **Repeated "not connected" branch.** `web/app/routes/api.nas.ts` — one local session-or-401 helper for `list-folder` and `create-folder`. Keep the "Session expired" and "Not connected" messages (tests assert "Session expired"). Drop the unreachable "Unknown intent" tail or make the chain an exhaustive `switch`. −8 lines, low.
- [ ] **`minFileMtime` alias.** `web/app/components/utils.ts:96-97` (exported at 164), plus `groupMinMtime` in `comparison-dialog` — use `startOfFiles` from `@skydock/scripts` in all 7 importers: `sections.ts`, `jumps.ts`, `comparison-dialog`, `montage-panel`, `file-browser` (15, 92, 231), `delivered-list` (12, 86), `inspector` (27, 442, 988). Move the "a copy brought in from another jump has no say in" comment to `startOfFiles` in `clustering.ts`. −5 lines, low.
- [ ] **`types.ts` forwarding module.** `web/app/components/types.ts:1-3` — delete it and import from `@skydock/scripts` directly (about 48 importers, all `import type`: 36 under `web/app`, 12 tests in `web/tests/e2e` and `web/tests/server`). Leave `routes/manifest/change.ts` and `web/tests/journey/invariants.ts` (they use a different types module). One pass, then `npm run format` and `npm run check`. −3 lines; low risk but wide for little gain.
- [ ] **`toldWhere` wrapper.** `electron/main.ts:495-498` — collapse to `const toldWhere = () => process.env.SKYDOCK_DEV_URL?.trim() || null` (used at 515, 568, 616). −3 lines, low.
- [ ] **`useDetails` repeated conversion.** `web/app/hooks/useDetails.ts:11-12,18-19` — hoist the shared `from`/`to` pair into two module constants (a helper would add indirection for two call sites). −2 lines, low.
- [ ] **Exports used only in their own file.** Remove `hasOwnWindows` from the export list in `web/app/helpers/previewWindow.ts:30`, and `sayCameras` from the export block in `packages/skydock-scripts/src/cameraWatch.ts:737`. −2 lines, low.
- [ ] **History comments in tests.** Rewrite in the present tense: `web/tests/e2e/media-urls.test.tsx:68` → "a photo is asked for at its drawn size: the original costs a megabyte and a full decode for eighty pixels"; `web/tests/e2e/drop-from-computer.test.tsx:439` → delete the "It used to empty itself here..." sentence, keep "the bar stays full while the file is read, so it does not read as a copy starting again". 0 lines, low.

## 5. Optimization

None of these was measured. Ranked by value over risk.

- [ ] **Camera list scans.** `web/app/components/camera-files.tsx:203-215,479-533` — build one Set of `lookable` paths and one of `chosen` paths per render and count the four states in a single pass. The main quadratic scan is `lookable.includes` at line 514 (drive-read cameras only); `chosen.includes` at 503 runs only while a delete is running; the `missing.every`/`missing.some` calls are minor. Paging the rows is a separate, larger change (about 30-50 lines plus catalog entries; it must keep `lookable`, `CameraPreview` stepping, the counts, a file being deleted whose row is not drawn yet, and RULES.md's "show all the rest"; `content-visibility` alone does not meet "not drawn"; journey tests that count rows may need a "show more" step). Low risk for the Sets, medium for paging.
- [ ] **Camera listing rebuilds the board per file.** `packages/skydock-scripts/src/cameraFiles.ts:88-93,174-188,200-212,243` — the cost is roughly card files × loose files × grouped files. Build the entries once in `listCamera` and `listCameraThroughKde` with a Set of grouped ids, and index them by path (`standingOf` still filters per file). `freedAlready` (`copy.ts:110-115`, exported at 328, also called at 226) needs a per-directory helper, or both callers updated. `alreadyThere` still does a stat and byte reads per file, so I/O may dominate on some cards. Low to medium.
- [ ] **Thumbnail route blocks on disk.** `web/app/routes/api.thumb.$.tsx:85-94,118-137` — move to `fs.promises`, with each async write on its own temp name (the `.${process.pid}.part` name is shared by concurrent requests for one frame, and a half-written file could be renamed into place), and a failed stat turned into the 404 (today it gives a 500). `isOnCamera` (`cameraWatch.ts:515`) still uses `realpathSync` on the slow USB path, so the camera case stays blocking. Low to medium.
- [ ] **Exiftool on every camera-page load.** `packages/skydock-scripts/src/cameraFiles.ts:194-197` — cache shot times in a module-level Map keyed by path, size and `mtimeMs`, asking exiftool only about unknown files. Put the cache in `shotTimes` or `dayFoldersOf` in `scan.ts` so the other callers share it (`copy.ts:198,261`, `bin.ts`, `resetFresh.ts`, `moveFiles.ts`, `kioCamera.ts`); those read the originals folder, whose time can be corrected, which the key must handle. Helps drive-mounted cards only, not MTP/KDE. Medium.
- [ ] **Zoomed timeline re-requests thumbnails.** `web/app/components/video-cropper.tsx:267-274` — while a zoomed clip plays for the first time about 8 new frame requests are made per 0.5 s; afterwards they come from `.thumbs` and the browser's immutable cache. Cut the thumbnail times from a fixed grid that depends only on the zoom, with a step of 0.5 s or more (the 0.5 s rounding and `getThumbUrl`'s `toFixed(1)` collapse finer steps). Visible side effect: thumbs are no longer centred in their slots (up to about vd/16 off) and the strip updates in slot-sized steps. Low risk, but it changes what is seen.
- [ ] **Parallel macOS tool downloads.** `scripts/fetch-tools.ts:94-111` — run the loop with `Promise.all`; only the two macOS targets have two archives. Saves about one 80 MB download on a release build. 0 to +2 lines, low.

## 6. Useless features

- [ ] **`scripts/big-board.ts:1-45`.** Builds a 2000-file synthetic board for timing, but nothing links to it: no npm script, and no mention in `docs/developing.md`, RULES.md, this file or the README. Its hard-coded `/workspace/output` is a deliberate guard that refuses the live work folder and `/mnt/*`, so that is not a reason to delete it. Decide: delete it (−45 lines), or add an npm script and one line in `docs/developing.md` (lower risk if the timing work is still wanted).
- [ ] **`parseFormData`** — the same item as the first one in section 4.
- [ ] **Orphan comment.** `electron/main.ts:248` — "the same, asked for from the board's own control" follows the `zoomHotkeys` comment (lines 234-237) and fits the `zoom:get`/`zoom:set` handlers at 261-266. Delete it, or move it above line 261. −1 line, low.

## 7. Decisions needed before building

The audit found no feature that the code has and RULES.md never mentions, or the reverse. These need a maintainer's call:

- [ ] **`kindsSaid` separator.** `file-browser:291` writes "2 videos, 1 photo"; the other callers use " · ". RULES.md is silent. Decide whether `file-browser` keeps `', '` on purpose or takes " · ".
- [ ] **Camera rows "not drawn".** RULES.md already promises a press-away "show all the rest". Paging the camera list must keep that control.
- [ ] **Freshness of the board.** RULES.md line 355 rules out the cached-answer half of the synchronous-stats item.
- [ ] **Timeline thumbnail strip.** The zoomed-timeline item changes what is seen. RULES.md was not cited for it; check whether it says anything about thumbnails.
- [ ] **`big-board.ts`.** Appears in no doc; a developer-script question: delete or document.

## Done

- Board answer stats synchronously (Optimization): measured, not done. On the real record (1,435 files, warm cache, local disk) a board answer takes about 16 ms and loading the record about 26 ms, so making the stat passes async would change 41 call sites for nothing visible. Reopen it if a much bigger record or a slower disk (the host's mount, a cold cache) shows otherwise.
- Journey tests cleaned up as the house review asked: one shared module each for the page steps and waits (`steps.ts`), the record readers (`record.ts`) and the tools, footage and montage names (`media.ts`) instead of copies in the chapter helper files; fixed waits replaced by the app's own signal where it has one (the events stream, the answer to the check, "Checking the storage…" going away, animations ended) and the few "nothing happens" waits shortened to what the app's own period needs, each with its reason; saved states measured — footage costs 0.1 to 1.3 s a file and a prepared montage 2.5 s in four files, so a state would save about 4 s of a 10-minute run and none was added.
- RULES.md brought up to date with the redrawn pages (jump card, calm pages' heads, day header, thumbnail tick, menu count, a montage's files and ways back); their journey chapters now assert the new sentences.
- Journey tests: every chapter of [docs/journey-tests.md](./docs/journey-tests.md) written, with saved states, a fake storage, the coverage guard against RULES.md, the record and listing invariants and the light/dark screenshots (`npm run test:journey`).

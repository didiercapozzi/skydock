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

- [ ] **Window setup written twice.** `electron/main.ts:351-423` — extract `windowOptions(zoom, size)`, `tellMaximizedOf(win)` and `denyButOpenLinks(asked)` (the shared tail of the open handler only; the main window keeps its preview-address branch). `tellMaximizedOf` must not include the close guard, since the preview window has none. Read `zoom` once at the top of `openWindow`. −18 lines, low.
- [ ] **Share-link make-or-remove sequence written three times.** `web/app/routes/manifest/destination-link.ts`, `montage-link.ts`, `web/app/routes/api.share-link.ts` — one helper in `packages/skydock-scripts`, e.g. `setShareLink(session, path, make)` returning `{ url }`, `{ url: null }` or `{ refused }`; export it from `@skydock/scripts` and switch the two `../../../../packages/...` imports to the package. Each caller keeps its own bookkeeping; the helper needs a unit test. −22 lines before the helper's own cost, **medium** risk.
- [ ] **Montage storage-list step repeated.** `web/app/routes/manifest/upload-montage.ts`, `free-montage.ts` — add `listMontageOnStorage(saved, group, session)` beside `recordOnStorage` in `manifest/storage.ts`; both files lose four imports. −10 lines, low.
- [ ] **Shared file-list pieces.** `bin-files.tsx:39,108-118,139`, `camera-files.tsx:66,448-452,492` — move `pickLabel` and a `FileThumb({ path })` (size 64) into `file-row.tsx`; add `Aside({ icon, children })` to `blurbs.tsx` (the strip text differs per list; the bin wraps it in a `span`). Leave the `Lock` strip in `inspector.tsx:243` alone. Afterwards check for unused `isVideoFile` and `getThumbUrl` imports. −10 to −15 lines, low.
- [ ] **`types.ts` forwarding module.** `web/app/components/types.ts:1-3` — delete it and import from `@skydock/scripts` directly (about 48 importers, all `import type`: 36 under `web/app`, 12 tests in `web/tests/e2e` and `web/tests/server`). Leave `routes/manifest/change.ts` and `web/tests/journey/invariants.ts` (they use a different types module). One pass, then `npm run format` and `npm run check`. −3 lines; low risk but wide for little gain.

## 5. Optimization

None of these was measured. Ranked by value over risk.

- [ ] **First read of a big card is exiftool-bound.** Measured 2026-10-06: exiftool is 98% of listing a card, about 10 ms a file — 1.4 s for 100 real clips, 3.9 s for 400, 15.9 s for 1,600 — and the shot times are now kept, so only the first read pays it. Whether exiftool can read the time tags faster (fewer tags, `-fast`, a bigger batch) is unmeasured; worth a try only if a first read of 15 s on a big card bothers.

## 6. Useless features

## 7. Decisions needed before building

The audit found no feature that the code has and RULES.md never mentions, or the reverse. These need a maintainer's call:

- [ ] **Freshness of the board.** RULES.md line 355 rules out the cached-answer half of the synchronous-stats item.

## Done

- Journey, window chapters: all seven files of `web/tests/journey/window/` pass in this container (real-input, toolbar, welcome, work-folder, zoom, folder-drop, preview-window). The update-feed chapter ('It keeps itself current') stays excused: the packaged app's feed cannot be pointed at a local one.
- `scripts/big-board.ts` documented, not deleted: `npm run big-board` and a paragraph in `docs/developing.md` (it builds a synthetic work folder for timing and refuses the live work folder and `/mnt`); not run.
- `kindsSaid` separator decided: `file-browser` keeps `', '` on purpose.

- Parallel macOS tool downloads: the two archives of a macOS target are now fetched together (`Promise.all` in `fetchInto`, `scripts/fetch-tools.ts`); not run, no network used.

- Code reduction: unused `parseFormData`; dialog `Section`; one HH:MM writer, `minFileMtime` alias and `kindsOf` gone from `utils.ts`; one not-connected check in `api.nas.ts`; window setup written once in `electron/main.ts` (with `toldWhere` and the orphan comment); `useDetails` constants; exports used only in their own file; history comments in two tests.

- Unused exports in the live store: `useJobOf` and `useCameraCopy` deleted (nothing used them).
- Exiftool on every camera-page load: `shotTimes` (`scan.ts`) now keeps the time it found for a file while the file is as it was (its size and moment last written), so exiftool is asked about a file once and not on every read of the camera's page, every copy and every listing after a copy. A card of 1,600 real clips: 15.9 s the first time, then 90 ms (it was 15.9 s every time). The time kept is the one inside the file, not the corrected one in the record, so correcting a time by hand cannot make it stale.
- Camera list scans (Optimization): measured, not done. The scan the item names, `lookable.includes` for each row, costs 1.0 ms per render at 1,600 clips and 11.7 ms at 6,400 (a Set: 0.2 ms), while the page itself takes about 0.37 s to draw 1,600 rows (0.42 s on a drive-read camera, which draws a preview button on every row; 0.23 s for 400). So the scan is a quarter of a percent of the draw, and paging the rows — the larger change the item weighed — would save a fraction of a second on a card that size. Browser, warm; reopen it for cards far beyond a few thousand clips.
- Camera listing rebuilding the board per file: listing a card against the real record (1,435 files) took 2.2 s for 100 clips, 7.9 s for 400 and 54 s for 1,600 — and the cost per file grew. The board's entries, its files by path and its files by folder are now read once per listing (and once per copy for the folder index), so it is 0.9 s, 2.2 s and 8.8 s, 5.5 ms a file, flat. What is left per file is the shot time (exiftool), the stat and the bytes check: the exiftool item below is next if that matters.
- Thumbnail route blocking on disk (Optimization): measured, not done. A cached thumbnail holds the server's thread for about 0.09 ms (95% under 0.15 ms, worst 0.56 ms), and 300 at once take 27 ms in all — and a page's requests arrive one by one, not at once. A cold frame is cut by ffmpeg, which is asynchronous (60 frames in 3.2 s of wall time with the thread free). Warm cache, local disk, 1280×720 test clip: reopen it if a slower disk (the host's mount, a cold cache) shows otherwise.
- Zoomed timeline re-requests thumbnails: the strip's pictures are now cut at the middles of the cells of a grid the zoom alone sets (a slot wide, or half a second if that is more), so a zoomed clip played on asks for the one picture that comes into view instead of all eight again each half second — 83 distinct frames over twenty seconds of following before, 12 or so after. RULES.md now says it (it said nothing of the timeline's pictures); the side effect is that a slot's picture is the nearest of the grid, up to half a cell off its middle at high zoom, and the strip changes in whole cells.
- Bug 18 of the journey's list, the upload dialog not saying that an item put nowhere stays on this machine: it does ("2 items stay on this machine" in the dialog's foot); the chapter that was skipped for it opened the dialog a second time over the one still open from the chapters before, and now looks at that one.
- Board answer stats synchronously (Optimization): measured, not done. On the real record (1,435 files, warm cache, local disk) a board answer takes about 16 ms and loading the record about 26 ms, so making the stat passes async would change 41 call sites for nothing visible. Reopen it if a much bigger record or a slower disk (the host's mount, a cold cache) shows otherwise.
- Journey tests cleaned up as the house review asked: one shared module each for the page steps and waits (`steps.ts`), the record readers (`record.ts`) and the tools, footage and montage names (`media.ts`) instead of copies in the chapter helper files; fixed waits replaced by the app's own signal where it has one (the events stream, the answer to the check, "Checking the storage…" going away, animations ended) and the few "nothing happens" waits shortened to what the app's own period needs, each with its reason; saved states measured — footage costs 0.1 to 1.3 s a file and a prepared montage 2.5 s in four files, so a state would save about 4 s of a 10-minute run and none was added.
- RULES.md brought up to date with the redrawn pages (jump card, calm pages' heads, day header, thumbnail tick, menu count, a montage's files and ways back); their journey chapters now assert the new sentences.
- Journey tests: every chapter of [docs/journey-tests.md](./docs/journey-tests.md) written, with saved states, a fake storage, the coverage guard against RULES.md, the record and listing invariants and the light/dark screenshots (`npm run test:journey`).

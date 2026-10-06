# TODO

What is still to do. What was done is in git, not here.

## Open

- Journey, window chapters: `web/tests/journey/window/` was written in a container with no Electron and has never been run — run `npm run test:journey:window` on a machine that has it, fix what the first run shows, and drop the "written without being run" notes. The update-feed chapter ('It keeps itself current') is excused: the packaged app's feed cannot be pointed at a local one.
- Found by the journey, each a skipped chapter with a `// BUG:` comment holding the evidence (`grep -rn "BUG:" web/tests/journey`) — fix the app, then unskip the chapter:
  1. (b-footage) `GET /api/thumb/<path on a card>` answers 404 for every file listed on a camera page: web/app/routes/api.thumb.$.tsx joins the splat onto the work folder. Fix idea: if the file is not in the work folder, serve it only when `isOnCamera('/' + splat)` (as web/app/routes/api.camera-file.ts does).
  2. (b-footage, cosmetic) dropping onto "Jump 2" says "… has been added to group_3" (an internal id). Same internal ids ("group_2", "group_3") name the jumps in the compare dialog (c2-merging).
  3. (d-jump) a mark dragged slowly along the timeline ends with two uncaught `page: BodyStreamBuffer was aborted` — suspect overlapping requests in onMomentChange (web/app/routes/place.file.tsx).
  4. (d-jump) RULES says a jump's panel trims every clip at once ("Trim every clip to the jump"); the panel of a jump in Fresh files (the `fileTo` branch of JumpPanel in web/app/components/inspector.tsx) has no such button.
  5. (c2-merging) in the compare dialog choosing Jump 1's start as the merge date changes nothing (a custom date works) — web/app/components/comparison-dialog.tsx.
  6. (f-storage) after an upload the jump files keep reading "Processed" / "1 of 6 on the storage" until the board is reopened (group files are copies; the upload answer lacks `uploaded` — manifest.ts / upload-group.ts). E agent saw it too.
  7. (f-storage) a file deleted on the storage shows as ready to send but Upload answers "Nothing to upload yet — process it first." (packages/skydock-scripts/src/upload.ts).
  8. (f-storage) opening a place does not notice storage deletions (only reopening the board or the check button does) — RULES 'Noticing deletions'.
  9. (f-storage/g-transfers) reloading while the storage is slow leaves an unhandled "Unexpected Server Error" in the console and the footer stays on "Checking the storage…" for good instead of turning to unreachable after a few seconds (web/app/routes/board.tsx loader).
  10. (g-transfers) reloading mid-upload leaves the destination's Upload button enabled while the corner says "Uploading…".
  11. (g-transfers) a cancelled upload is kept in Transfers as "failed", not "cancelled".
  12. (g-transfers) "Look again" keeps the mark of a link the storage has revoked until the page is reopened; (i2) the montage page and panel keep "Copy link / Remove link / Email…" after the storage revoked the link — only the email dialog reads the answer (dialog-host.tsx).
  13. (i1-montage) a montage made from a destination's files does not always open its page (~1 in 4); note says "Copied 1 file into the jump" — suspect `goingTo` dropped in web/app/hooks/useBoardModel.ts.
  14. (i1-templates) marking a template as the usual one does not make "Make the project" skip the dialog (askMontage in the same hook).
  15. (i1-templates) template files come out owned by root, not by the owner of the output folder — `openToHost(held, root)` in packages/skydock-scripts/src/templates.ts.
  16. (i2) Photos sent as a folder are shown "no longer on the storage" although they are there — `goneSent` in packages/skydock-scripts/src/upload.ts looks a folder up like a file.
  17. (i2) a cut-off manifest.json is recovered from `.bak` but nothing on the page says so (only a server console.warn).
  18. (i2) the upload dialog never says that an item put nowhere stays on this machine (RULES 'Uploading a montage 2. Where it goes').
  19. (c1) with the record half written the board shows the older `.bak` copy — RULES says it must never show an older one (lookAtBoard in packages/skydock-scripts/src/manifestWatch.ts).
  20. (c1) server sentences ("montages" refusal) stay in English in French and German.
- RULES.md and the app disagree (decide which is right, then change the other; each has a skipped or app-asserting chapter):
  - (c2) merged jump keeps the date of the jump dragged onto vs "dated by its earliest file".
  - (c1) a jump card shows only its start time (RULES: span of times and size); arrangement/kind buttons absent on Fresh files and a destination page; thumbnail tick always visible (RULES: only under the pointer until something is picked); day header says "3 files" not videos and photos; menu count "Fresh files N to file" counts loose files as one item.
  - (e) destination page head: RULES says headed in three parts (name/folder/…); the app shows name, count, Search, ⋯ and puts the folder in the status card.
  - (i1) RULES 1009 says a montage's files are headed by their day; the app shows "Its files". Reset/Delete are in the right panel before delivery but only in the ⋯ menu once delivered.

## Done

- Journey tests: every chapter of [docs/journey-tests.md](./docs/journey-tests.md) written, with saved states, a fake storage, the coverage guard against RULES.md, the record and listing invariants and the light/dark screenshots (`npm run test:journey`).

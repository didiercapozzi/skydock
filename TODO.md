# TODO

What is still to do. What was done is in git, not here.

## Open

Where a user can get stuck, or lose footage, by using the app the wrong way. Found by a read-only
analysis on 2026-09-24. Items marked **[reproduced]** were run against the real code in temporary
folders; the others are traced in the code. Line numbers are as of commit `33386bc`.

### Fix order

1. **Safe state writes** — a unique temp name per write, fsync, a `.bak` of the last good
   manifest/groups pair, and never rebuild from nothing while `groups.json` exists. Fixes the
   first two losses and the dead end on a broken `groups.json`.
2. **Save only what changed** — per-jump changes instead of the whole list, bookkeeping (uploaded,
   freed, processed, share link) always from the server, and the manifest reloaded just before any
   save. Fixes the out-of-date tab, long actions saving old state, and an uploaded jump being moved.
3. **Half-written files** — zips and copies written as `.part` and renamed when complete; one upload
   at a time, tracked on the server.
4. **Check before deleting** — refuse to process when an original is missing; check each original's
   size and hash against its record before freeing it.
5. **Dead ends** — a camera copy skips a bad file and carries on; a failed process names the bad
   clip; names `.`, `..` and dots only are refused; an error explains itself instead of "Oops!".

### Can lose footage or all the sorting

- **An unreadable manifest with an unreadable `.bak` too, then a Scan, erases every jump.** The
  board now falls back to the last good pair; only when both are unreadable does this remain. [reproduced] `loadManifest` reads a
  manifest that does not parse as "no manifest" (`manifest.ts:112`). The board then offers only a
  Scan, which also starts by itself when a camera is plugged in (`cameraWatch.ts:212`). The Scan
  builds from nothing and overwrites `groups.json` (`scan.ts:249-255`). Every jump, place, montage,
  upload record and freed record is gone. Only montages on the storage's list can come back.
  Fix: refuse, set the file aside as `.bad`, and never rebuild while `groups.json` exists.
- **Two servers on one `output/` can still interleave their saves.** Writes now use a unique temp
  name and fsync, but there is no lock across processes, and the Electron single-instance lock does
  not cover the dev server. Fix: a lock file on the output folder.
- **A stale tab's save overwrites the server's jumps.** [reproduced] save-groups does
  `manifest.groups = data.groups` (`save-groups.ts:69`), and the board never reloads. An old copy
  drops freed, uploaded, processed and share-link records, and jumps made elsewhere, such as by a
  camera copy, vanish. Fix: save per jump, or refuse when the server's version has moved on.
- **Processing a montage again after an original was deleted by hand deletes its processed copy.**
  [reproduced] The missing original is skipped silently (`process.ts:420`), its copy's name is not
  reserved, and `pruneStaleMedia` deletes it (`process.ts:439`). The run reports success. Fix:
  refuse and name the missing file, or at least keep the copy.
- **An original replaced in place is never noticed, and freeing deletes a clip never uploaded.**
  [reproduced for the scan] `mergeManifests` returns early and keeps the old id (`scan.ts:198`).
  `proveOnStorage` checks only the processed copy (`freeDropzone.ts:48-60`), then the original is
  removed (`freeDropzone.ts:94`). Realistic when a second card is copied by hand into the same day
  folder. Fix: a changed size or mtime means a new id; check the original before freeing.

### Stuck for good, with no way out in the app

- **One file missing on the NAS blocks freeing its whole dropzone.** `freeableIn` uses only the
  records, never the listing (`freeDropzone.ts:42`), and the proof is all or nothing. Fix: pass
  the listing in, or free what is proved and name the rest.
- **A file taken off the NAS looks editable but every change is refused.** The board demotes it
  (`fileStatus.ts:80-101`), but the server locks on the upload record (`move-files.ts:23`,
  `save-groups.ts:45`, `delete-jump.ts:22`, `remove-destination.ts:26-30`). Only processing again
  clears it. Fix: have the server lock on the same live status as the board.
- **A freed montage whose NAS copy is deleted stays forever.** Reset and delete refuse it
  (`resetMontage.ts:47`, `delete-jump.ts:20`). `forgetLost` needs per-file upload records, which
  montage files never get (`forgetLost.ts:26-27`). Bring-back answers "was not sent from this
  machine" (`bringBack.ts:89-90`), against RULES' "comes back whole". Fix: per-file records for
  montage files, or match on the montage's own record.
- **No way to write the storage's list of montages again from this board.** A list lost or
  emptied on the NAS stays so until each montage is uploaded, freed or emailed again. Fix: a way to
  rewrite the list from the manifest.
- **A zero-byte or corrupt clip makes processing fail every time.** [reproduced for exiftool]
  exiftool exits 1 for the whole batch (`process.ts:233-255`), and the message says to install
  exiftool. All zero-byte files also share one id. Fix: write metadata per file, or accept exit 1
  when the tags were written, and name the clip.
- **A corrupt `groups.json` is a dead end with no explanation.** The board loader swallows
  `UnreadableGroups` (`board.tsx:51-55`) and shows "Nothing here yet". Scan and every action land on
  "Oops!" (`api.scan.ts`, `api.manifest.ts:80`, `root.tsx:61`). Fix: say which file is unreadable,
  and offer to set it aside.
- **A deleted `groups.json` silently turns every jump into fresh files** (`manifest.ts:59`), and the
  next save makes that permanent. Fix: warn when the manifest has groups but `groups.json` is gone.
- **Deleting a montage's originals by hand drops the jump at the next scan, and its `.kdenlive`
  then blocks any new montage for that name.** `hasEdit` looks for any project in the name's folder
  (`montageArtifacts.ts:51`). Fix: keep a montage with an edit or an upload as a record with missing files,
  and tie the project check to the jump's own base name.

### Wrong or confusing, but recoverable

- **The same card copied twice can duplicate clips.** [reproduced] `alreadyThere` looks only in the
  day folder it computes this time (`copy.ts:55-69`). When exiftool fails for the batch, the day
  falls back to mtime (`tools.ts:52-56`, `lib/exif.ts:115-118`), so a second copy can file the same
  clip under another day. `resolveGroups` then puts it twice in one jump (`manifest.ts:60-71`). Fix:
  search every day folder by name and size, as `hereAlready` does (`kioCamera.ts:82`).
- **A file dragged in while the watcher copies the same card is duplicated.** [reproduced]
  `importFile` checks only the registry (`importFile.ts:240`). Fix: also check the day folder.
- **Starting a second action discards the answer to the first.** Edits share one fetcher
  (`useBoardState.ts`), and drag and add-place do not check `busy`, so a running process looks
  stopped. Uploads now have a fetcher of their own; processing still does not. Fix: the same for
  processing, or block sends while busy.
- **An uploaded jump can be moved to another place, and its upload record is erased.** [reproduced]
  The lock only covers file-level changes (`save-groups.ts:38-52`), and lines 55-67 then delete
  `uploaded`. This breaks RULES' "uploaded is the end of editing". Fix: refuse jump-level changes to
  a jump with uploaded or freed files, and do not let them be dragged.
- **Montage names `..` and `.` escape their folder** (destination names are now refused). [reproduced] Only `/` and `\` are removed
  (`workspace.ts:50-53`, `process.ts:283`). A montage named `..` works in `output/processed`, and
  freeing it removes everything there except `.kdenlive` files (`freeMontage.ts:245-249`), once the
  proof passes. Fix: refuse such names on the page and the server.
- **Server errors are silent or take over the page.** save-groups refusals are never read
  (`useJumps.ts:7`), so a refused edit stays on screen. Uncaught errors show the bare "Oops!".
- **A dropzone upload sends everything in its folder** (`publish.ts:267`): stray files, orphaned
  copies, and a copy half-written on a full disk (`process.ts:385-389`). Fix: send the recorded
  processed files only, and write copies as `.part`.
- **Moving the work folder makes every file read as changed.** [reproduced] `processed.path` and
  freed paths are absolute. Fix: store paths relative to the work folder, or rebase them on a move.
- **Deleting the film or a zip after upload blocks freeing** ("changed here since it was uploaded",
  `freeMontage.ts:106`). Fix: allow freeing when the storage copy is proved and the local one is
  simply gone.
- **`saveManifest` writes two files one after the other** (`manifest.ts:163-173`). A crash between
  them drops new files from jumps without a word. There is no handling of a full disk or a denied
  write. Fix: write both temp files, then rename both, and turn a full disk or denied write into a
  refusal that names the path.
- **A `.kdenlive` cut off mid-write freezes its montage** (`montage.ts:379`), and "already has a
  project" blocks making it again. Fix: write through a temp file.
- **A write-protected card leaves another full copy in the bin on each delete retry.** [reproduced]
  `moveFile` copies first, then the unlink fails with EROFS (`lib/fs.ts:144-154`). Fix: check the
  card is writable first, and remove the bin copy on failure.
- **`output/.trash` is never emptied** (`cameraFiles.ts:321-324`), so freeing a card costs the same
  space on the machine. Fix: show its size and offer to empty it.
- **Every scan re-reads exif for the whole library** (ids are now reused for unchanged files) (`scan.ts:64-86,244`, using
  `execFileSync`). The header sits at "copying" and deleting from the camera is refused until it
  ends. Fix: reuse the id when size and mtime are unchanged, and add a "scanning" phase.
- **On KDE, a full local disk reads "The camera stopped answering"** (`kioCamera.ts:190-192`). Fix: a
  true message.
- **A camera clock reset to 2000 or 2016 merges shoots from different days**, and joins old
  unfiled jumps (`clustering.ts:160-176`). Fix: warn on impossible dates, and offer to split by file
  number.
- **Stale camera page.** A KDE camera's list keeps deleted files, and a card file removed by
  another tool fails the load (`cameraFiles.ts:199,289-293`). A freed clip on a KDE camera cannot be
  copied back from the page.
- **Replacing a template deletes its old folder** (`templates.ts:177-186`), so existing montage
  projects open with missing music and logos. Fix: copy the template's files into the montage
  folder, or keep the replaced version.
- **A folder dropped from inside `output/` is imported as new originals** (`droppedMedia.ts`), and
  a drop on a place removed in another tab brings the place back (`importFile.ts:208-220`).
- **A freed montage whose link was revoked cannot get a new one**: it cannot be uploaded again, and
  the board now only says its link is gone.
- **Two machines writing the storage's lists**: the last writer wins, and delivered names can
  collide, putting the other machine's file in the bin.
- **Leftovers after a crash:** `.part` files in the day folders and `.incoming` stay forever.
- **A scan that changed nothing still rewrites both JSON files**: the early return in
  `mergeManifests` leaves `returned` undefined (`scan.ts:175` against `:257`).

- **"Group loose files into jumps" can say there is nothing to group** while the board shows a loose
  file (seen for a file that arrived through a rescan, 2026-09-28).

### Open question

- What does `SYNO.FileStation.Download` return for a missing path? If DSM answers 200 with a JSON
  error, `fetchNasFile` saves that as the file, since it checks neither size nor md5
  (`bringBack.ts:38-47`). Ask the storage.

### Already safe

A card pulled out mid-copy; two cameras with the same file names; deleted proxies, `.thumbs`, cut
proxies, `.kdenlive` or `processed/`; deleting from a camera, which proves every file by md5 on
the NAS; an interrupted upload retried; processing, which runs one at a time, can be cancelled, and
reloads before saving; template paths pointing outside their folder; corrupt settings or NAS session.

## Done

- **Safe state writes, and bookkeeping from the server.** Unique temp names with fsync, the last good
  manifest/groups pair kept as `.bak` and read when the main pair cannot be, a history of the last 30
  boards to go back to, and save-groups keeping uploaded, freed, link, project and paid as the server
  has them. Long actions (bring-back, restore, bin, montage project, the board loader) save on the
  board as it is after their wait.

- **Dead ends and running work.** A card file that cannot be copied is passed over and named; a
  destination named `montages`, `.` or `..` is refused; closing, updating or switching folder asks
  while work runs; processing and uploading refuse to overlap on the same jump; a camera copy can be
  stopped.

- **Audit follow-up (2026-09-28).** Settings menu, one word per thing, unsaved-change guard in the
  preview, rename by Enter/Save only, red dangerous buttons, app dialogs instead of `confirm()`,
  Escape and focus trap in every dialog, notes told apart, drawer for the details panel, Move to…,
  compact/folded jump cards, next step from the trail, "Sent it?", overview with batch process and
  upload queue, paid mark, booking list import, trim to the jump, landscape with blurred sides,
  find anything, email in three languages, QR code of the link, faster rescans.

- **A camera is copied again without unplugging it.** Its page offers "Copy N files here" for what is
  not here yet, and Rescan cameras copies every camera plugged in before it scans; what is here is
  passed over.

- **One upload at a time, shown and cancellable.** The server knows the upload going and refuses a
  second; the board takes it up after leaving the page, another edit, a reload or the window
  reopening, and shows it in the corner panel (the import panel's component) with every item. It can
  be cancelled at any moment: the send is cut off, nothing is recorded, and a zip being made is
  thrown away. Zips are built as `.part` and renamed only when whole, so a cut-off rebuild never
  passes for a finished zip.

- **The storage's lists: reality wins.** A listing the NAS did not answer is an error, never an
  empty folder, so nothing is forgotten, pruned or sent on it. A file counts as already up only when
  the listing just taken holds it, entries for files gone from a listed folder are dropped, and a
  list that cannot be written no longer fails an upload. The lists' place is fixed once and kept with
  the connection; the montages list is now `skydock-montages.json`, moved over from
  `skydock-tandems.json`. A montage whose folder or link is gone is shown so, and its link is not
  offered for emailing.

- **A whole folder dragged in.** Several files at once already works and is worth keeping. A folder
  dropped on the board should be taken the same way: every video and photo inside it, and inside the
  folders inside it, however deep they go.

- **Say what is about to be copied, and how far it has got.** A drop from the computer currently
  happens with nothing shown. It should first list the files it is about to copy into
  `original_files`, and then show that copy running — a live bar, the way making the proxies already
  has one.

- **Removing a destination.** There is no way to take one back. Removing it should disconnect it from
  the folder on the storage if the two are linked, remove the destination itself from this machine,
  and put whatever was filed in it back into Fresh files as loose files rather than losing it.

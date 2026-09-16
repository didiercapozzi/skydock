# RULES — what SkyDock does

> The single source of truth for how SkyDock behaves. It describes the app, not the code: how media
> gets from a camera to a passenger, and what the app promises along the way. The code and its tests
> are the authority on _how_ that is done.

## What SkyDock is

SkyDock is the media workflow of a skydiving dropzone. Cameras come back full of videos and photos
from a day of jumping; SkyDock copies them off, works out which files belong to which jump, and lets
the instructor file each jump under the dropzone it was shot at or the passenger it belongs to. It
then renames and crops the files into a tidy folder per jump and sends them to the club's network
storage, ready to hand to the passenger.

Cameras are treated as plain storage. SkyDock does not care which camera a file came from, only when
it was shot.

## Principles

These hold everywhere, and most of the rules further down are consequences of them.

- **The originals are never touched.** Processing copies; it never moves, renames or deletes what the
  cameras produced. Correcting a jump's time changes what SkyDock has recorded about a file, not the
  file. The camera's own storage is only ever read.
- **A folder is only rebuilt by whoever owns it.** A jump's own folder can be emptied and rewritten,
  because only that jump is in it. A dropzone folder is shared by every day ever shot there, so it is
  never wiped — files in it are replaced one by one.
- **Nothing is deleted without being replaced.** A folder that is rebuilt goes to a bin folder first,
  and the bin is never emptied automatically.
- **A file's state is a fact that can be checked, not a flag someone has to remember to clear.** Every
  claim SkyDock makes about a file — it has been processed, it is on the network storage — is backed
  by evidence it can re-examine.
- **Uncertainty never destroys a fact.** When SkyDock cannot tell — the storage did not answer, a
  check failed — it keeps what it last proved rather than guessing the worse case.

## The workflow

**1. Copy off the cameras.** Every file is copied into a folder named after the day it was shot.
Re-inserting the same camera costs nothing: a file already there with the same contents is skipped,
and one whose contents differ is copied again, because the camera has overwritten it.

**2. Find the jumps.** SkyDock reads each file's capture time and groups files shot close together
into jumps. This is a guess, and the next step exists to correct it.

**3. Sort.** On the board, each jump is filed under the dropzone it was shot at, or under Tandems with
the passenger's name. This is the only step that needs a person.

**4. Process.** The files of a filed jump are copied into their delivery folder, renamed after the
passenger or the dropzone and the time they were shot, cropped if a crop was set, and stamped so that
the file's date matches its name.

**5. Upload.** The delivery folder is sent to the club's network storage, and a share link comes back
to give to the passenger.

Steps 4 and 5 need two tools present on the machine: one to write dates into the files, without which
processing stops and says so, and one to cut video, without which a cropped file cannot be written.

## Jumps

A jump is a set of files shot within about half an hour of each other. Anything longer than that gap
starts a new jump. This runs when files are first scanned, and again when new files appear.

- A file with no neighbours does not become a jump of one. It stays **loose**: visible, sortable, and
  processable on its own, but not pretending to be a jump.
- The guess can be corrected by hand: two jumps can be **merged**, files can be **dragged from one
  jump to another**, and loose files can be **regrouped** — re-run the same half-hour rule over
  everything sitting unsorted, without disturbing jumps already filed.
- Re-scanning keeps the work already done. Where a file is filed, its crop, and what has been made
  from it all survive; only what the disk actually measures — the file's size, time and contents — is
  taken fresh. A file that genuinely changed therefore invalidates what was made from it, while a file
  that merely sat there keeps everything.

## Times and dates

- A file's capture time is read from the camera's own metadata when it is scanned, falling back to the
  file's timestamp when there is none. From then on that recorded time is what SkyDock uses — for
  grouping, for ordering, and for naming.
- A jump's time can be corrected: pick the time its first file should have, and every file in the jump
  shifts by the same amount, keeping the gaps between them. The original is remembered, so the
  correction can be undone.
- **A jump's date names a tandem's files; a file's own date names a fun jump's.** A tandem is one
  event delivered to one person, so all of it carries the jump's date. A dropzone folder holds every
  day ever shot there, so each file carries the day it was actually shot.

## Dropzones and tandems

Filing a jump answers one question: who is this for?

- **A dropzone** (Yverdon, Colombier, …) is a place. Its jumps are fun jumps, they belong to no
  particular person, and their files all live directly in that dropzone's folder — no folder per jump,
  no splitting videos from photos. Several days of jumping share the folder, which is exactly why it
  is never wiped and rebuilt.
- **Tandems** is for jumps that belong to a passenger. Each passenger gets a folder of their own,
  named as typed, with videos and photos kept apart inside it. Two jumps for the same passenger share
  that folder. A tandem cannot be processed until it has a name, since the name _is_ the folder.
- **A loose file can be filed to a dropzone too**, without belonging to any jump. It is delivered
  exactly like a fun jump's files, because on disk they end up side by side.
- A jump can also be processed without being filed at all, in which case it gets a folder of its own
  named after the jump and its date.

## What lands on disk

```
output/
├── original_files/             every file as it came off the camera, in a folder per day
├── processed/                  what gets delivered
│   ├── Yverdon/                a dropzone: flat, shared by every day shot there
│   │   └── yverdon_20260829_113015.mp4
│   └── Tandems/
│       └── Luc Favre/          a passenger: their name, as typed
│           ├── videos/
│           └── photos/
└── .trash/                     folders replaced by a re-process, never emptied automatically
```

Names are built from who the files are for, the relevant date, and the time each file was shot:
`luc_favre_20260829_113015.mp4`, `yverdon_20260829_113015.mp4`. Accents and spaces are folded away
(`Chloé Perret` becomes `chloe_perret`), and two files shot in the same second get a counter.
Re-processing writes to the same folder as before — never a second folder with a number after it.

Removing a file from a jump deletes the copy that was made from it, so nothing stale is left behind
to be delivered.

## The board

The board is the everyday screen: everything still to sort on the left, everywhere it can go on the
right. Each side scrolls on its own, so a jump can be dragged straight across without the page moving
under the pointer.

**What is on the left.** Jumps that have not been filed yet, in sections by day, newest first, with
the day sticking to the top of the pane as its jumps scroll past. Within a day, jumps run in the order
they were shot, and that day's loose files sit under them.

**What is on the right.** One card per dropzone, and one card for Tandems holding a card per
passenger. A dropzone card lists its files by day, mixing whole jumps and loose files in one run,
because that is how they land on disk.

**Showing files.** A card of 25 files or fewer simply shows them — reaching a file costs no click. A
bigger one is folded behind a button, still showing its first few thumbnails so a file can be dragged
out without opening it. Files are listed as rows — thumbnail, name, whether it is cropped, time, size
and state — or as a grid of thumbnails, whichever was chosen last.

**Filing.** Drag a jump onto a dropzone or onto Tandems. Drag a single file, or a selection, onto
another jump to re-file it, onto a dropzone to deliver it there on its own, or onto Tandems to make it
a tandem of its own. Only the place under the pointer lights up, and only if it accepts what is being
carried. Dropping files filed to Tandems that have no passenger yet leaves them visible, with a button
to turn them into one, rather than quietly hiding them.

**Selecting.** One gesture: click to preview, ctrl- or cmd-click to pick a file, shift-click to take a
range. Once anything is picked, plain clicks add and remove, and Escape clears. A selection can be
removed back to the sorting area, by button or by pressing Delete.

**Comparing.** Tick two jumps and compare them side by side, stepping through every jump independently
on either side, then merge them if they are the same jump. Merging asks which date the result should
keep.

**Cropping.** Clicking a file opens it for preview, with a bar under the video to set the start and end
of the part worth keeping. Applying saves the crop and closes the preview; clearing one leaves it open,
since clearing is usually the first half of setting a different crop. A file that belongs to no jump
can be cropped just like one that does.

**Acting.** The three steps are always offered in order and never out of it: **Process** a day of fun
jumps or a tandem, then **Montage** a processed tandem, then **Upload**. A jump cannot be uploaded
until everything in it has been processed; the card says how many files are waiting and the button
stays out of reach until they are.

## File status

Every file is in one of three states, each of which SkyDock can verify:

- **local** — nothing current has been made from it. Either it has never been processed, or it has been
  cropped, re-timed or replaced since, which leaves what was made from it out of date. There is no
  separate "stale" state on purpose: a file whose source has moved on is simply not processed.
- **processed** — a copy exists that was made from the file exactly as it is now.
- **uploaded** — that copy is on the network storage, proved by comparing checksums on both sides.

A file falls back to **local** when anything it was made from has changed, or when the copy is missing
or a different size. It falls back to **processed** when the copy that was uploaded is no longer the
copy on disk, or when the storage was asked and does not have it.

Two rules keep this honest:

- **Being listed can take a claim away, never grant one.** Only an upload, which compares checksums on
  both sides, can mark a file as uploaded. A matching name and size is not proof that two files are the
  same file.
- **Not knowing is not evidence.** Storage that was never asked, a folder whose listing failed, a size
  the storage would not report — none of these demote a file.

## Network storage

**Connecting.** The dropzone's storage is reached with a hostname, username and password, entered once.
The session is kept, and when it expires it renews itself from the stored password rather than asking
again. The password is kept encrypted, and the plain one is never written down. Asking to upload while
disconnected opens the login rather than failing.

**Choosing folders.** There is a default folder for anything without a home of its own, and each
dropzone can name its own folder, browsed and picked from the app. A dropzone that names its own folder
needs no default at all. Asking to upload with no folder to put the files in opens the browser for that
card.

**Uploading.** One upload covers one tandem, or an entire dropzone — every jump filed there and its
loose files, in a single job. Files already on the storage are not sent again: a file with the same name
and the exact same size is checksummed on both sides, and only skipped if they match. Anything uncertain
is uploaded, since sending a file twice costs time while skipping the wrong one costs the delivery. The
app reports what it is doing throughout — first how many files it is checking, then how many it is
sending and how far through the current one it is, and finally how many were already there.

**Share links.** A folder's link is reused if it already has a working one, so re-uploading does not
invalidate the link a passenger already has. Only a folder with no usable link gets a new one.

**Noticing deletions.** A file deleted directly on the storage stops counting as uploaded. SkyDock looks
when the board opens, again right after an upload, and whenever the check button in the header is
pressed.

## Montage

A processed tandem can be turned into a video project ready to edit: the jump's videos are laid on the
timeline of a template project in the order they were shot, and two archives are written alongside — the
photos, for the passenger, and the original videos the edit came from, for the backup. Crops are already
applied, so the timeline carries the cut footage.

The montage is made once. Asking again for a tandem that already has a project is refused rather than
overwriting an edit someone may have been working on.

## The classic view

The original screen is still there, and still the only place to do a few things: run a scan to pick up
newly copied files, import a file into an existing jump, create or rename a dropzone, copy one file into
two jumps, delete a jump, and change a jump's date. It also processes everything at once, and shows
whether a montage has already been made.

Everything else — sorting, passenger names, per-file state, per-dropzone folders, and uploading — is on
the board, which is the screen to use.

## Not built

Worth knowing, so nobody goes looking:

- **Nothing is emailed.** A share link is produced and copied by hand; there is no message to the
  passenger and no address is kept.
- **The montage takes every photo.** Choosing which photos go to the passenger is not possible.
- **Video is played as-is.** There is no streaming or transcoding for preview, so a very large file is
  as heavy to open as it is on disk.
- **One known collision.** A loose file and a jump's file filed to the same dropzone and shot in the
  same second can be given the same name, and the second one written wins.

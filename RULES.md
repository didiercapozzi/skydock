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
  never wiped — files in it are replaced one by one. A folder holding an edit keeps it: only the
  media is rebuilt beside the work, because an edit is the one thing here that cannot be made again.
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

**2. Find the jumps.** Scanning reads each file's capture time and groups files shot close together
into jumps. It is asked for from the board, and it can be asked for again at any point: a scan after
more cameras have been copied off picks up the new files without disturbing the work already done.
The grouping is a guess, and the next step exists to correct it.

**3. Sort.** On the board, each jump is filed under the dropzone it was shot at, or under Tandems with
the passenger's name.

**4. Process.** The files of a filed jump are copied into their delivery folder, renamed after the
passenger or the dropzone and the time they were shot, cropped if a crop was set, and stamped so that
the file's date matches its name.

**5a. A dropzone is uploaded.** Its folder is sent to the club's network storage, and a share link
comes back.

**5b. A tandem is edited, then delivered.** A video project is written with the jump's clips already
on the timeline and the render destination filled in; someone opens it, makes the edit and renders
the film; then delivering sends the film and the photos to the passenger and the original videos to
the backup.

Sorting and the edit are the steps that need a person. Everything else is asked for with one press,
always in the same place.

Steps 4 and 5 need two tools present on the machine: one to write dates into the files, without which
processing stops and says so, and one to cut video, without which a cropped file cannot be written.
Rendering the film needs a video editor, which SkyDock never runs itself.

## Jumps

A jump is a set of files shot within about half an hour of each other. Anything longer than that gap
starts a new jump. This runs when files are first scanned, and again when new files appear.

- A file with no neighbours does not become a jump of one. It stays **loose**: visible, sortable, and
  processable on its own, but not pretending to be a jump.
- The guess can be corrected by hand: two jumps can be **merged**, files can be **dragged from one
  jump to another**, and loose files can be **regrouped** — re-run the same half-hour rule over
  everything sitting unsorted, without disturbing jumps already filed. A jump that should not exist is
  undone by sending its files back to the sorting area; a jump with nothing left in it is gone.
- Re-scanning keeps the work already done. Where a file is filed, its crop, and what has been made
  from it all survive; only what the disk actually measures — the file's size, time and contents — is
  taken fresh. A file that genuinely changed therefore invalidates what was made from it, while a file
  that merely sat there keeps everything.

## Times and dates

- A file's capture time is read from the camera's own metadata when it is scanned, falling back to the
  file's timestamp when there is none. From then on that recorded time is what SkyDock uses — for
  grouping, for ordering, and for naming.
- A jump's time can be corrected, which is what a camera whose clock was never set needs: click the
  jump's time on the board and say when it really started. Every file in the jump shifts by the same
  amount, so the gaps between them — and therefore their order — are untouched. The date can be
  corrected the same way, and correcting either only changes what SkyDock has recorded, never the file.
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
│           ├── photos/
│           ├── luc_favre_20260829.kdenlive    the editing project
│           ├── luc_favre_20260829.mp4         the film, once someone has rendered it
│           ├── luc_favre_20260829.photos.zip  for the passenger
│           └── luc_favre_20260829.rushes.zip  the originals, for the backup
├── templates/                  an editing template per folder, with the music and logos it uses
└── .trash/                     folders replaced by a re-process, never emptied automatically
```

Of what a passenger's folder holds, only the film and the photos archive are ever handed over. The
project, the working folders and the archive of originals stay on the machine or go to the backup.

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
and state — or as a grid of thumbnails, whichever was chosen last. A thumbnail says only that it is
cropped; its state appears, as a coloured dot, once a selection is under way — which is when it
matters and when the marks are expected. The rows always say it, so the state is never more than a
view away.

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

**Acting.** A dropzone is **processed**, then **uploaded**. A tandem is **processed**, then given a
**montage**, then **delivered** once someone has rendered the film. The steps are offered in order and
never out of it, and a tandem row offers exactly one of them at a time, in the same place — so there is
never a choice to make about what to press next. Once there is a project the row shows where it is and
copies that path when clicked; until the film exists it says to edit and render it, and once it exists
it shows the film's size. Nothing can be sent until
everything in the jump has been processed; the card says how many files are waiting.

**The header** holds what applies to the whole day's work: scanning for newly copied files, the state
of the network storage and its default folder, the rows-or-grid choice, and what the three file states
mean. With nothing scanned yet, the board is a single Scan button and the instruction to copy the
cameras first.

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
needs no default at all. There is also a backup folder, chosen the same way, which is where the
original videos of a tandem go. It is never guessed and never falls back to the default: putting
gigabytes of unedited footage where a passenger can reach it is exactly what keeping them apart is
for. Asking to send something with no folder to put it in opens the browser for whichever one is
missing.

**Uploading.** One upload covers an entire dropzone — every jump filed there and its loose files, in a
single job. A tandem is not uploaded but delivered, which sends only what is meant for the passenger. Files already on the storage are not sent again: a file with the same name
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

A processed tandem can be turned into a video project ready to edit. The jump's videos are laid on the
first video track of a template, in the order they were shot — which track that is differs from one
template to the next and is read from the template rather than assumed, because dropping the footage
on the wrong track produces a film with nothing in it and no complaint. Crops are already applied, so
the timeline carries the cut footage.

The destination and format of the film are filled in, so the only work left in the editor is the edit
itself and pressing render: nothing to type, no folder to find, and no film landing somewhere it then
has to be moved from. The board names the project by its full path, spelled the way the machine
running the editor knows it, and copies that path when clicked — SkyDock cannot open the editor
itself, so the least it does is save the hunt for the folder.

The project is checked to be a readable document before it is written. A montage that would not open
is refused, with the reason, rather than produced and discovered later by someone expecting to start
editing.

**Templates.** A template is a folder holding its project and the music, logos and title images it
uses. Its assets are referenced where they are, never copied for each passenger. Templates are picked
up from wherever they are kept, and one that has travelled from another machine still finds its own
assets, including the images inside title clips, which no other part of the project points at. When
there is more than one template and none has been chosen, SkyDock asks rather than picking someone's
branding for them.

A template that arrives without some of the files it uses still produces a project — the edit can
begin without the music — but the montage says which files are missing straight away, rather than
leaving a silent film with holes in it to be discovered at the render.

SkyDock can also be running somewhere other than the editor — on a machine that reaches the same files
by a different path. The project is written with the paths the editor will understand.

The montage is made once. Asking again for a tandem that already has a project is refused rather than
overwriting an edit someone may have been working on.

## Delivery

Once the film is rendered, delivering a tandem archives its photos and its original videos, then sends
the film and the photos archive to the passenger's folder and the archive of originals to the backup
folder. The project and the working folders stay on the machine. The passenger's folder is the one that
gets a share link; the backup folder never does.

Delivering reports what it is doing throughout: first the archives being built, then what is already
on the storage, then what is being sent.

It refuses, each time saying which: a jump with no passenger; one whose files still need processing;
one where no film has been rendered yet, naming the film it looked for; a film still being written,
which it can tell because the size is still changing; no folder chosen for the passenger or for the
backup; and a backup folder that is the passenger's own folder. A tandem whose camera produced no
video at all is delivered without a film rather than being stuck. A film rendered under a different
name, when it is the only one there, is taken as the film and renamed.

Delivering again after a re-render sends what changed and leaves the rest; an archive still newer than
everything in it is not built a second time.

The film is taken on trust. Nothing checks that it was rendered from this project, or that it covers
the whole jump.

## Not built

Worth knowing, so nobody goes looking:

- **Nothing is emailed.** A share link is produced and copied by hand; there is no message to the
  passenger and no address is kept.
- **The montage takes every photo.** Choosing which photos go to the passenger is not possible.
- **Nothing renders the film.** A person opens the project, makes the edit and renders it. SkyDock
  writes the project and takes over again afterwards, but it never runs the editor.
- **Nothing notices a render finishing.** The board looks at the folder each time it is asked to do
  something; there is no watching in the background.
- **Video is played as-is.** There is no streaming or transcoding for preview, so a very large file is
  as heavy to open as it is on disk.
- **Nothing comes in from outside the cameras.** A file can only reach SkyDock by being copied off a
  camera and scanned; there is no way to drop an arbitrary file into a jump.
- **A file is in one place at a time.** It can be moved between jumps, but not put in two at once.
- **A dropzone can be created, not renamed or removed.** Its name is what its folder is called.
- **One known collision.** A loose file and a jump's file filed to the same dropzone and shot in the
  same second can be given the same name, and the second one written wins.

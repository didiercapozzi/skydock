# RULES — what SkyDock does

> The single source of truth for how SkyDock behaves. It describes the app in plain words — what a
> person sees and what the app promises — never how the code does it. The code and its tests are the
> authority on _how_.

## What SkyDock is

SkyDock is the media workflow of a skydiving dropzone. Cameras come back full of videos and photos
from a day of jumping. SkyDock copies them off, works out which files belong to which jump, and lets
the instructor file each jump under the dropzone it was shot at or the passenger it belongs to. It
then renames and crops the files into a tidy folder per jump, puts them on the club's network
storage, and helps hand them to the passenger.

Cameras are plain storage. SkyDock does not care which camera a file came from, only when it was shot.

## Principles

Everything below follows from these.

- **The originals are never touched.** Processing makes copies. It never moves, renames or deletes a
  file that came off a camera. Correcting a jump's time changes what SkyDock has recorded, not the file.
  The one exception is a person's own choice: an unsorted file can be put in the bin, which moves it
  and erases nothing.
  The camera's own storage is only ever read.
- **A folder is rebuilt only by whoever owns it.** A passenger's folder can be rewritten, because only
  that passenger is in it. A dropzone folder is shared by every day ever shot there, so it is never
  wiped: files in it are replaced one by one, and a day SkyDock no longer knows about is left alone.
- **An edit is the one thing that cannot be made again.** Footage can be copied again, archives rebuilt,
  a film re-rendered. The hours spent editing exist once. Every rule about a tandem with an edit
  protects that.
- **Processing again is the normal way of working.** Process, look, correct a time or a name, process
  again. The second pass writes over the first and leaves nothing aside, and removes any copy whose
  name is no longer produced, so nothing stale is left to be handed over.
- **A file's state is a fact that can be checked, not a flag to remember.** Every claim SkyDock makes
  about a file — processed, on the storage — is backed by evidence it can look at again.
- **Nothing on the network storage is ever deleted by SkyDock.** It uploads and creates folders; a
  re-upload replaces a file of the same name. Taking something off the storage is done by a person, in
  the storage's own interface. SkyDock's part is to notice.
- **Not knowing is not evidence.** When the storage did not answer or a check failed, SkyDock keeps what
  it last proved rather than assuming the worst.
- **Uncertainty costs time, never a delivery.** When SkyDock cannot tell whether two files are the same,
  it sends the file again. When it cannot prove a copy is on the storage, it will not delete the local one.

## The workflow

**1. Copy off the cameras.** Every file is copied into a folder named after the day it was shot.
Inserting the same camera again costs nothing: a file already there with the same contents is skipped.

**2. Scan.** SkyDock reads each file's capture time and groups files shot close together into jumps.
A scan can be asked for at any time; one run after more cameras were copied off picks up the new files
without disturbing the work already done. The grouping is a guess, and the board exists to correct it.

A scan also makes a **proxy** of every clip: a small copy, the same length at the same speed, which the
board plays instead of the full clip and which the editor later opens on. Proxies are made in the
background; everything works without them, and a clip without one simply plays as it is. Each clip
says whether it has one. Proxies are working files: never listed, never sorted, never uploaded.

Proxies are made on the graphics card when the machine has one that works, and on the processor
otherwise. A clip whose proxy cannot be made is named, with the reason, and can still be sorted,
processed and uploaded.

**3. Sort.** On the board, each jump is filed under a dropzone or under Tandems with a passenger's name.

**4. Process.** The files of a filed jump are copied into their delivery folder, renamed after the
passenger or the dropzone and the time they were shot, cropped and turned as asked, and stamped so that
each file's date matches its name.

**5. Hand over.** A dropzone folder is **uploaded** to the storage whole, and gets a share link. A
tandem is given a **montage** — an editing project with its clips already on the timeline — someone
edits and renders the film, and the tandem is then **uploaded**: the film and the photos to the
passenger's folder, the original videos to the backup folder. Finally the passenger is **emailed**
their link.

Sorting and editing are the steps that need a person. Everything else is one press, always in the
same place.

Processing needs two tools on the machine: one that writes dates into files, and one that cuts and
encodes video. Rendering the film needs the video editor, which SkyDock opens but never runs itself.

## Jumps

A jump is a run of files with no long pause in it. The pause is measured from each file to the next,
so a jump can last hours as long as filming never stops for longer than the gap. The first gap longer
than that ends the jump. The gap is **fifteen minutes**; it is a setting, and every scan applies the
current setting to everything, including jumps that were split or merged by hand.

- A file with no neighbours is not a jump of one. It stays **loose**: visible, sortable and processable
  on its own.
- The guess can be corrected by hand. Two jumps can be **merged**; files can be **dragged** from one
  jump to another, or back to the sorting area; loose files can be **regrouped** by running the gap
  rule again over everything still unsorted. A jump with nothing left in it disappears.
- A scan keeps the work already done: where a file is filed, its crop and turn, and what has been made
  from it. Only what the disk measures — size, time, contents — is read fresh. A file whose contents
  changed invalidates what was made from it; a file that merely sat there keeps everything.

## Times and dates

- A file's capture time comes from the camera's own metadata, or from the file's timestamp when there
  is none. That recorded time is what SkyDock uses for grouping, ordering and naming.
- A jump's time can be corrected, for a camera whose clock was never set: say when the jump really
  started, and every file in it shifts by the same amount. The gaps between files, and therefore their
  order, do not change. The date is corrected the same way.
- **One file can be re-timed on its own**, for the file that is the exception — a clip from a second
  camera on another clock, a photo off a phone. Its date and time are set from the inspector, and
  nothing else moves: the file stays in its jump, the jump keeps the day it is filed under, as it does
  when a file from another day is dropped into it, and only the order inside the jump changes. A loose
  file goes to whichever day its new time falls on. A wrong clock is usually wrong for everything it
  shot, which is what re-timing the whole jump is for.
- **A tandem's files carry the jump's date; a dropzone's files carry their own.** A tandem is one event
  for one person. A dropzone folder holds many days, so each file says which day it was shot.

## Places: dropzones and tandems

Filing a jump answers one question: who is this for?

- **A dropzone** (Yverdon, Colombier, …) is a place. Its jumps belong to nobody in particular, and their
  files all sit directly in the dropzone's folder: no folder per jump, videos and photos together. Many
  days share the folder, which is why it is never wiped.
- **Tandems** is for jumps that belong to a passenger. Each passenger gets a folder of their own, named
  as typed, with videos and photos kept apart inside it. Two jumps for the same passenger share the
  folder. A tandem cannot be processed until it has a first and last name, because the name is the
  folder; half a name is refused and the board says which half is missing.
- **A name can be changed afterwards**, because a name read off a form can be read wrong. Changing one
  says what it costs: what was processed belongs to the old folder and must be processed again, and what
  was already uploaded stays on the storage under the old name.
- **A loose file can be filed to a dropzone** without belonging to any jump; it is handled exactly like
  a dropzone jump's files.
- A jump can be processed without being filed at all; it then gets a folder named after the jump and
  its date.

## What lands on disk

```
output/
├── original_files/           every file as it came off the camera, one folder per day
├── processed/                what gets handed over
│   ├── Yverdon/              a dropzone: flat, shared by every day shot there
│   │   └── yverdon_20260829_113015.mp4
│   └── Tandems/
│       └── Luc Favre/        a passenger, named as typed
│           ├── videos/  photos/
│           ├── luc_favre_20260829.kdenlive    the editing project
│           ├── luc_favre_20260829.mp4         the film, once rendered
│           ├── luc_favre_20260829.photos.zip  for the passenger
│           └── luc_favre_20260829.rushes.zip  the originals, for the backup
├── proxies/                  the small copies, and one per jump cut to match its processed clips
└── templates/                one editing template per folder, with the music and logos it uses
```

Of a passenger's folder, only the film and the photos archive are handed over. The project and the
working copies stay on the machine; the originals go to the backup.

Names are built from who the files are for, the date, and the time shot: `luc_favre_20260829_113015.mp4`,
`yverdon_20260829_113015.mp4`. Accents and spaces are folded away in file names (`Chloé Perret` becomes
`chloe_perret`) but not in folder names, and two files shot in the same second get a counter.
Processing again writes to the same folder, never a numbered second one.

Taking a file out of a jump deletes the copy made from it, so nothing stale is left to hand over.

## The board

The board is the everyday screen. A menu of **places** — everywhere a file can be — is pinned down the
left, and the place picked there fills the pane beside it. Only the pane scrolls, so a file can always
be dragged to any place. On a narrow screen the menu becomes a strip across the top.

**The places.** _Unsorted jumps_, one entry per dropzone, and _Tandems_ with one entry per named
passenger. Each says how many files it holds and shows how much of it is still local, processed or
uploaded. Every place takes files dropped on it. A passenger is listed once, however many jumps they
have.

**Days.** Unsorted jumps and a dropzone show days, newest first. Each day opens and closes on its own,
and which days are open is remembered per place. Clicking anywhere on a day's bar that is not a button
opens or closes it. On arrival, the newest day with work left in it is open. An open day's header stays
pinned while its files scroll, and inside it each jump's line pins beneath the header, so what is on
screen always says which day and which jump it belongs to.

**Jumps in a day.** Unsorted jumps keep their jumps, named by position in the day ("Jump 1", "Jump 2")
with the time each started. Jumps start folded, so a day opens as a list of its jumps; _Expand jumps_
and _Collapse jumps_ open or fold them all, and that choice holds for days opened afterwards. A single
jump opens or folds by clicking anywhere on its line that is not a button, leaving the others as they
are. A dropzone has no jumps: its files are flat, and a jump stops meaning anything once filed there.
A day's loose files sit below its jumps, marked as belonging to none.

**Jump chips.** A day's header carries one chip per jump, with its file count, and one for the day's
loose files. Clicking a chip opens the day and that jump alone, folding the others, and lands on it.
A chip also takes dropped files, which is how a file moves to a jump in another day.

**Which day a jump belongs to.** A jump is filed under the day it started and keeps that day. Dropping a
file from another day into it does not move the jump. Re-timing a jump or merging two does, because the
jump itself changed. A jump that runs past midnight says that it spans days.

**Showing files.** Every file is shown the same way: as rows — tick, thumbnail, name, crop, time, size,
state — or as a grid of thumbnails, whichever was chosen last, for the whole board. Once a copy exists,
the name shown is the copy's name, the one the passenger sees, with the camera's name kept beside it.
Long lists are drawn a page at a time. Every day and every tandem carries badges saying how many videos
and photos it holds; they show one kind, the other, or all — all being both side by side, videos in one
column and photos in the other, stacked on a narrow screen. A badge for a kind with nothing in it is
shown but cannot be chosen.

**Arranging.** The pane's heading has one button per way of arranging the place — by jump, by day, or
as one list, whichever that place offers — so every choice is in sight and a single press away. Each
kind of place remembers its own choice while the board is open. Files are always in the order they
were shot.

**Finding.** A box in the pane's heading narrows what is drawn, matching either name a file has. It
changes only what is shown; a jump with nothing matching drops out of view, and the menu's counts still
count everything.

**Selecting.** Looking at a file and picking it are different things, so nothing is picked by accident
on the way to looking. A click only previews: the file shows in the inspector and is marked as the one
being looked at, and nothing is picked — however many files are picked already. A file is picked by
its tick or by ctrl- or cmd-click, each of which also takes it back off; shift-click
takes a range, and with no range started it picks that file and starts one. The arrow keys move the
preview, and with shift add to the picks. Escape clears. A row's tick is always there; a thumbnail's
appears under the pointer until something is picked, then on every thumbnail. Picked thumbnails get a
green ring with a tick; picked rows a green tick and background. The picks — or, with none, the file
being looked at — can be sent back to the sorting area by button or Delete. Files already in the sorting
area have nowhere further back to go, so there the same button and key offer the bin instead.

**Filing.** Drag a jump or a selection onto a place in the menu to file it there, or onto another jump to
move it. While something is carried, every place that would take it is outlined and the one under the
pointer is filled in. Dropping onto a passenger joins that passenger's tandem, never a new one.

**Making a tandem from a jump.** An unsorted jump can become a tandem from its own line: ask for it,
type the passenger's name beside a few frames of the jump, and it is filed under Tandems with that name
in one step. Only a complete name saves, and only when confirmed; Escape or Cancel changes nothing. A
name that is already a passenger's, however capitalised, says it will join their tandem and saves the
name exactly as already written. The place the jump went lights up briefly in the menu.

**Tandems without a name** stay visible and say how many are waiting for one.

**Adding files from the computer.** A video or a photo from anywhere on the computer can be dropped
onto the board: onto a passenger to join their tandem, onto a dropzone to be filed there loose, onto
Unsorted jumps to wait there, or anywhere on a place's page to go to that place. It is copied into the
originals under the day it was taken, keeping its name unless a different file already has it that
day. From then on it is a file like any other. A file already on the board, whatever it is now called,
is recognised by its contents and moved to where it was dropped, exactly as a drag would move it; one
already there is left alone. What is not a video or a photo is refused, and so is a drop on a tandem that
has an edit or lives on the storage only. The board says what came of the drop.

**Putting files in the bin.** A test shot or footage of the ground can be got rid of, but only from
Unsorted: a file filed somewhere is somebody's, and sending it back to Unsorted is the step that says it
no longer is. Nothing goes without a warning first, saying how many files, how many videos and photos
and how much space, and that these are originals nobody has been given yet — if the camera card has
been wiped, the bin holds the only copy. Once confirmed, the files leave the board and the originals
folder, so a scan does not bring them back; the copies and proxies made from them are deleted, since
they have nothing left to come from. The files themselves are moved, not erased, into a folder of the
bin named for that moment, keeping the day folder each came from. SkyDock never empties the bin, so
nothing is lost for good and no space comes back until someone empties it by hand. There is no way back
from the board: a file is recovered by moving it out of the bin into the originals and scanning again.
Nothing is put in the bin while something is being processed.

**Comparing.** Pick two jumps to compare them side by side, stepping through the files of each, then
merge them if they are the same jump. Merging asks which date the result keeps.

**The header** holds what applies to the whole board: scanning, the storage with its folders and a way
to check what it holds now, rows or grid, and light or dark. With nothing scanned yet, the board is a
single Scan button and the instruction to copy the cameras first.

**Light and dark.** The board follows the machine by default and can be pinned light or dark. The
choice is remembered on that machine and applied before the first thing is drawn.

## Cropping and turning

A file is opened by double-clicking it, from the inspector, or with Enter on the file being looked at,
playing its proxy when there is one. The picture fills the left of the dialog
with the timeline under it; the right side says what is being decided: the trim, the turn, the frame,
and what is already on the file. The top names the file and lets you step to the next; the bottom holds
Save, offered only once something changed, and Reset, which clears everything at once. A loose file is
cropped the same way as one in a jump.

**Trimming.** Drag the ends of the timeline, or set the start and end at the playhead. Trimming moves no
pixels: the clip is copied with its ends cut off, losing nothing.

**Framing.** A mount, a strut or a finger in a corner is cut away by dragging a rectangle over the
picture: what is dimmed goes. The rectangle keeps the shape the clip already has unless another is
chosen, so a 16:9 jump is still 16:9 when handed over, and what is left is put back to the size the clip
came at, so a 4K clip stays 4K. Set on one clip, the rectangle can be given to every clip in the jump in
one press. Photos have no frame.

**Turning.** A camera mounted sideways or upside down is put right a quarter turn at a time, clockwise,
by button or by pressing R, or back to as shot. The picture on screen turns with it and takes the shape
it will come out in — a quarter turn makes a clip portrait — and a rectangle on it is fitted again. The
turn can be given to every file of the same kind in the jump in one press: clips to clips, photos to
photos, since the two can come off different cameras.

**What it costs.** A trim alone copies the file. A frame or a turn changes the picture, so a clip is
encoded again — for quality rather than speed, on the graphics card when there is one and on the
processor otherwise, so it works on every machine — and the proxy the editor opens on is cut and turned
to match. A photo is turned without touching its pixels, by the orientation it carries, which every
viewer follows.

Rows show the trim, the frame and the turn beside the name, dashed until applied and solid after.
Thumbnails show the picture turned. Any of these set after a file was processed makes its copy out of
date.

## Acting

Each day and each tandem offers exactly one next step, always in the same place, and never out of
order. A dropzone day is **processed**, then **uploaded**. A tandem is **processed**, then given a
**montage**, then **uploaded** once the film is rendered.

**Processing** runs on the machine, not in the page: closing or refreshing the page does not stop it,
and the board stays usable meanwhile. A page opened while processing runs says so and updates itself
when it is done. One processing runs at a time; asking for another is refused. Edits made meanwhile are
kept, and a jump changed while its copies were being written is not marked processed.

**Nothing is uploaded until everything in it is processed**, and what is waiting is said plainly.

**The film.** Once rendered, the film shows above its tandem: its name, how long it runs, its size, and
when it was rendered. It can be watched there or opened on its own, so the render is checked before it
goes to anyone. A film rendered again is the one that plays.

## File status

Every file is in one of three states, each of which SkyDock can verify:

- **local** — nothing current has been made from it. Either it was never processed, or it was cropped,
  turned, re-timed or replaced since. The board shows the second case as **changed**, because "never
  processed" and "processed, then altered" are different situations to be in.
- **processed** — a copy exists that was made from the file exactly as it is now.
- **uploaded** — that copy is on the storage, proved by matching checksums on both sides.

A file falls back to local when anything it was made from changed, or its copy is missing or a different
size. It falls back to processed when the storage was asked and does not have it. A file that went to
the storage inside an archive counts as uploaded while the archive is there.

**Uploaded is the end of editing.** SkyDock cannot take an old copy back from the storage, so a file
that has gone up cannot be cropped, turned, re-timed, moved or renamed here. It shows a lock and says
why; the way back is to remove it from the storage, over there.

Two rules keep this honest. **Being listed can take a claim away, never grant one**: only an upload,
which compares checksums, marks a file uploaded. **Not knowing is not evidence**: a folder that was
never listed, a listing that failed or a size the storage would not report demote nothing.

## Network storage

**Connecting.** The storage is reached with a hostname, username and password, entered once. The
session is kept and renews itself from the stored password when it expires. The password is kept
encrypted and the plain one is never written down. Asking to upload while disconnected opens the login.

**Folders.** There is a default folder for anything without a home of its own, and each dropzone can
name a folder of its own, browsed and picked from the app. There is also a backup folder for tandems'
original videos; it is never guessed and never falls back to the default, because putting unedited
footage where a passenger can reach it is exactly what keeping the two apart prevents. Asking to upload
with a folder missing opens the picker for that folder.

**Uploading a dropzone.** One upload covers the whole dropzone — every jump filed there and its loose
files — sending the folder whole. A tandem cannot be uploaded this way, because its files go to two
places; asking is refused and says why.

**Skipping what is there.** A file with the same name and size on the storage is checksummed on both
sides and skipped only if they match. Anything uncertain is sent. The board reports what is happening
throughout: how many files are being checked, which one is being sent and how far it is, and how many
were already there.

**Share links.** A folder's link is reused while it works, so uploading again does not change the link a
passenger already has.

**Noticing deletions.** SkyDock looks at the storage when the board opens, right after an upload, and
when the check button is pressed. A file it can no longer find stops counting as uploaded and is ready to
be sent again; the local file is untouched. Between those moments the board says what it last proved.

## Montage

A processed tandem can be turned into an editing project. Its videos are laid on the template's first
video track in the order shot, crops and turns already applied, each clip playing from its proxy with
the real clip recorded as what the edit is of, so the editor opens ready to work and renders from the
footage. The film's destination and format are filled in, so what is left is the edit and pressing
render.

**Making the montage opens it.** Writing the project and opening the editor are one press, and a tandem
with a project offers a way back into it. Which command opens the editor is a setting. When the editor
cannot be reached from where SkyDock runs, the board says so and still names the project's path, which
copies when clicked. A project that would not open is refused with the reason.

**Templates.** A template is a folder holding its project and the music, logos and title images it
uses, referenced where they are. A template that travelled from another machine still finds its files.
With more than one template and none chosen, SkyDock asks. A template missing some of its files still
gives a project, and the montage names what is missing straight away.

**The montage is made once.** Asking again for a tandem that has a project is refused.

**An edit freezes the tandem.** The project points at the tandem's copies by name and at moments inside
them, and lives in the folder the passenger's name makes; any change would break it silently. So once
a tandem has a project, nothing about it changes here: no trim, frame or turn, no file in or out, no
re-timing, no new name, no other jump joining the passenger, no processing again. Its files show a lock
and say why. Previewing, opening the project and uploading go on. Changes are made in the editor.
Resetting the tandem, or deleting the project, lifts the lock.

## Taking a tandem back

A tandem can be **reset** or **deleted** from its page. Either applies to the whole passenger, because
one passenger is one folder, and each asks first, saying what goes and what stays, naming the edit on
its own when there is one.

- **Reset** returns the tandem to before processing: the copies, the working copies, the project, the
  film and the archives are deleted, and with them the record of what was uploaded. The name, every
  crop, frame and turn, and every corrected time are kept. This is how an edit is started over.
- **Delete** undoes the tandem: the same is deleted, and the jumps go back to Unsorted with no name and
  nothing decided about them, each file on the time its camera gave it.

Neither touches the originals or the storage, and neither can run while the tandem is being processed.

## Uploading a tandem

Once the film is rendered, uploading a tandem archives its photos and its original videos, then sends
the film and the photos archive to the passenger's folder and the originals to the backup folder. The
passenger's folder gets a share link; the backup never does.

**The dialog first.** Asking to upload shows the two parcels side by side — the backup and the
passenger's — each with its folder, what it holds and how big it is. Either folder can be chosen from
there. Nothing is sent until the dialog's own button is pressed, and until the film is rendered that
button stays shut and says why.

**How the backup is kept** is chosen once for the whole club and remembered: the originals as one zip,
or as plain files in a folder named after the tandem. Either way a copy of the film can go with them.
The passenger's parcel is always the film and the photos, nothing else.

**Refusals**, each named: no passenger; files still to process; no film yet, naming the film looked
for; a film still being written; no passenger folder or no backup folder; a backup folder that is the
passenger's own. A tandem with no video at all is uploaded without a film. A film rendered under a
different name, when it is the only one there, is taken as the film.

Uploading again after a re-render sends what changed and leaves the rest. An archive holding exactly
what it should, newer than everything in it, is not built again. The film is taken on trust: nothing
checks that it was rendered from this project.

## Freeing space

Once a tandem is uploaded, everything of it on this machine can be deleted — originals, copies, working
copies, film and archives — leaving only the project and the record of what went where. It asks first,
and deletes nothing until all of this is proved:

- every file that went up has the same checksum here and on the storage as when it was sent;
- the originals are exactly what the backup holds;
- the photos are exactly what the passenger's archive holds;
- nothing about the tandem changed since it was uploaded.

If any check fails, nothing is deleted and each failing file is named. The storage must be reachable.
Only a passenger with a single jump can be freed.

A freed tandem lives on the storage only. The board says so once, with how much room came back. It
reads as uploaded, shows what the storage holds instead of its files, and cannot be processed, edited,
reset, deleted or uploaded again from here. A scan keeps it as it is. If something of it later
disappears from the storage, the board says so, as for any uploaded tandem.

## The storage's list of tandems

The Tandems folder on the storage holds a list of every tandem uploaded into it: who it was for, the
day, how many videos and photos, when it went up, its share link, where its film, photos and backup
are, whether it was freed, and whether the passenger was emailed and to which address. The Tandems page
shows this list under the passengers on the board, so every tandem the storage holds is there, including
ones this machine no longer has and ones uploaded from another machine. Each can be emailed from there,
and one still on this board can be opened.

The list follows the work and never replaces it. It is updated after every upload, every freeing, and
when the email is marked as sent. Each change reads the latest list first and alters only its own
tandem, so several machines keep each other's entries. If the list cannot be written, the upload still
stands and the board says the list did not follow. A list that cannot be read is never written over.

## Telling the passenger

Once a tandem has a share link, its page offers to email the passenger, and freeing a tandem opens
the email straight away. The email is written already, in French: it greets the passenger by name,
says what is ready and from which day, and has one button to their folder with the link repeated as
text. It is shown exactly as it will arrive, every word can be changed, and the signature is the club's,
remembered for every email.

SkyDock sends nothing itself and needs nothing set up. One press copies the email, laid out, and opens a
new message — in Gmail or in the computer's own mail program, whichever was used last — with the address
and subject filled in; the email is pasted in and sent from there. The email, the subject and the link
can also be copied on their own. The link always comes from what the upload recorded. Marking the
email as sent records it on the storage's list, and can be undone.

## Not built

Worth knowing, so nobody goes looking:

- **SkyDock never sends email.** A person sends it from their own mail.
- **The montage takes every photo.** There is no choosing which photos the passenger gets.
- **Nothing renders the film, and nothing notices a render finishing.** The board looks at the folder
  each time it is asked to do something.
- **Nothing shows a proxy being made.** Proxies appear on the next thing the board is asked to do.
- **A file is in one place at a time.** It cannot be in two jumps at once.
- **A dropzone can be created, not renamed or removed.**
- **Nothing comes back down from the storage** except its list of tandems.
- **Archives are made only by uploading a tandem.** The originals cannot be backed up ahead of the film.
- **One known collision.** A loose file and a jump's file filed to the same dropzone and shot in the
  same second get the same name, and the second one written wins.

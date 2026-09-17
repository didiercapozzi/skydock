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
- **A folder is only rebuilt by whoever owns it.** A jump's own folder can be rewritten, because only
  that jump is in it. A dropzone folder is shared by every day ever shot there, so it is never
  tidied — files in it are replaced one by one, and a day SkyDock no longer knows about is left
  alone. A folder holding an edit keeps it: the media is rebuilt beside the work, because an edit is
  the one thing here that cannot be made again.
- **Preparing again is the ordinary way of working.** Prepare a jump, look at it, correct a time or a
  name, prepare it again. The second pass writes over the first and leaves nothing aside: a copy is
  made from an original that has not moved, so what it replaces is a copy of the same file. What no
  longer belongs is removed — a clip whose time was corrected, or that was taken out of the jump,
  leaves a copy behind under a name nobody expects, and a file nobody expects is one that would be
  delivered anyway. The edit, the film and the archives are not media and are never touched.
- **A file's state is a fact that can be checked, not a flag someone has to remember to clear.** Every
  claim SkyDock makes about a file — it has been processed, it is on the network storage — is backed
  by evidence it can re-examine.
- **Nothing on the network storage is ever deleted by SkyDock.** It uploads files and creates folders,
  and re-uploading replaces a file of the same name — but taking something off the storage is done by a
  person, in the storage's own interface. There is no button for it here and no way to reach one.
  SkyDock's part is to notice that it happened.
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

Scanning also makes a **proxy** of every clip: a small copy, the same length and running at the same
speed, which the crop bar plays instead of dragging a 4K file through the browser a frame at a time,
and which the editor later opens on instead of making its own. They are built behind the scan rather
than inside it, because a card of clips takes minutes, and everything works without them meanwhile —
a clip with no proxy yet simply plays as it always did. A clip already smaller than a proxy would be
is its own.

Every clip says whether it has one, beside its name: **proxy** when it is there, **no proxy** while it
is not, and nothing at all for a photo, which never has one. A clip already small enough to be its own
reads as having one, because it has — there is nothing left to make. The header counts how many are
still without, and says nothing once they all have one. All of it is read off the disk rather than off
what the last pass recorded, so emptying the folder shows up as what it is instead of every clip going
on claiming a copy that is gone.

**The graphics card does it when there is one.** Unpacking a card of 4K clips is the expensive half,
so what matters is that the card decodes as well as encodes — measured on two clips, eleven seconds
against three minutes. Which card is used is worked out by trying one, with the settings it will
really be given, rather than by asking what it supports: an encoder a machine lists is not one it can
necessarily run, and one that accepts a trial of nothing can still refuse every clip. With no card
that answers, the processor does it, slower and no differently otherwise.

A proxy a card made is larger than one the processor made — two to three times, for the same picture,
because making every frame a keyframe is what costs and hardware spends more bits doing it. That is
the trade: minutes of waiting against gigabytes of working files that never leave the machine.

Each proxy is recorded the moment it is made, not when the run finishes. A card of clips is twenty
minutes of work, and whoever started it may never see it end — a copy nobody wrote down is a copy
nobody uses, which is how the crop bar came to drag 4K originals through the browser with twenty
finished proxies sitting unused.

A clip whose proxy cannot be made is named, **and so is the reason it could not** — once, since when
this fails it usually fails the same way on every clip on the card. A card that cannot be proxied is
still a card that can be sorted, processed and delivered.

Proxies are never shown. They are not footage, so nothing lists them, counts them or offers them to
be sorted, and they never leave this machine: they are kept away from the folders that go to the
storage, so what reaches a passenger or the backup is the same as it was before they existed.

**3. Sort.** On the board, each jump is filed under the dropzone it was shot at, or under Tandems with
the passenger's name.

**4. Process.** The files of a filed jump are copied into their delivery folder, renamed after the
passenger or the dropzone and the time they were shot, cropped if a crop was set, and stamped so that
the file's date matches its name.

A passenger's name half entered stops this, saying which name is unfinished. Half a name is neither a
person nor a place: it has no folder to go to, and the rule that picks the folder would read the jump
as a place and deliver it flat under the dropzone's name. What makes a jump a tandem is that somebody
is in it, so a name begun and not finished is the thing to refuse.

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

A jump is a run of files with no long pause in it. The pause is measured **from each file to the
next one**, not from the file the jump started with: as long as each file follows the one before it
within the set gap, the jump goes on, so a jump can cover hours in total. The first gap longer than
that ends the jump, however short the filming had been. This runs when files are first scanned, and
again when new files appear.

That gap is **fifteen minutes**. It is a setting rather than a fact about the sport. Changing it
changes the rule everywhere it is applied, and since every scan re-applies the rule to everything,
the next scan re-cuts the jumps by the new gap — including jumps that had been split or merged by
hand. What survives that is where each file is filed, its crop, and what has been made from it: a
re-cut jump inherits the filing of whichever jump most of its files came from.

- A file with no neighbours does not become a jump of one. It stays **loose**: visible, sortable, and
  processable on its own, but not pretending to be a jump.
- The guess can be corrected by hand: two jumps can be **merged**, files can be **dragged from one
  jump to another**, and loose files can be **regrouped** — re-run the same gap rule over everything
  sitting unsorted, without disturbing jumps already filed. A jump that should not exist is
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
- **A whole jump is re-timed, never one file of it.** The correction exists for a camera whose clock
  was wrong, which is wrong for everything it shot; moving one file on its own would change its order
  within the jump, which is the one thing the shift is careful not to do.
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
  A tandem waiting for one shows a few frames off its own clips beside the two fields, because a name
  is read off a face or a form and nobody should have to remember what they saw on another screen.
  **A name can always be changed afterwards**, for the same reason: it can be read wrong. Changing one
  says what it costs — what was already prepared belongs to the old folder and has to be prepared
  again, and what has already been delivered stays on the storage under the old name, since SkyDock
  never deletes from there.
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
├── proxies/                    a small copy of every clip, named after what the clip is
│   └── cut/                    and one per jump cut to match the copies it was processed into
└── templates/                  an editing template per folder, with the music and logos it uses
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

The board is the everyday screen. A menu of **places** is pinned down the left — everywhere a file can
be — and the place picked there fills the pane beside it. Only that pane scrolls, so the menu is never
scrolled away from and a file can always be dragged to anywhere it might go. On a narrow screen the
menu becomes a single strip of places across the top rather than a column eating half the width.

**The places.** _Unsorted jumps_, one entry per dropzone, and _Tandems_ with an entry per named
passenger under it. Each says how many files are in it and carries a bar showing how much of it is
still only local, how much is prepared and how much has been sent — because a count alone never
answers "what is left". Every place is also somewhere files can be dropped.

**Days.** Unsorted jumps and a dropzone both show days, newest first, one open at a time, and which
one is open is remembered per place. Clicking anywhere on a day bar that is not a button opens or
closes it; all days closed is a valid state. The open day's header stays pinned while its files
scroll, and inside it each jump's line pins directly beneath that header, so what is being looked at
always says which day and which jump it belongs to. The day opened by default is the newest with work
still left in it.

**The days toolbar.** Above the days: how many jumps or days are here and which day is open, and
with it _Collapse jumps_ and _Expand jumps_, and _Close all days_. Folding jumps is a standing
choice rather than something done to one day: collapse them and every day opened afterwards opens
folded too, until they are expanded again. A jump can still be folded or opened on its own from its
line, and doing so is an exception to that choice rather than an end to it. Folding changes only
what is on screen; nothing about the files moves.

**Getting to a jump.** A day's header carries one chip per jump in it, with how many files that jump
holds, and a chip for the day's loose files when it has any. The chips are there whether the day is
open or closed: clicking one opens the day and lands on that jump, so reaching any jump of any day is
a single click. A jump's chip is also somewhere files can be dropped, which is how a file moves to a
jump in a day that is not the one on screen. A dropzone has no chips, because it has no jumps.

**Which day a jump belongs to.** A jump is filed under the day it started, and it keeps that day.
Dropping a file from another day into a jump puts the file in that jump — it does not move the jump,
and everything already in it stays where it was. Re-timing a whole jump, or merging two, does move
it, because then the jump itself has changed when it happened.

A jump shows one time: when it started. Anything else beside its name reads as a second answer to
the same question, and the files under it already say where the jump gets to — the span it covers is
there to be asked for rather than always on show. That start is the one thing that can be corrected.
A jump whose files fall on more than one day dates it and says that it spans days. A jump can do that honestly by running past midnight; it
can also mean a camera's clock is wrong. Either way the times shown are the times on the files, and
setting the start moves every file in the jump by the same difference — so the editor opening on
the date of the earliest file is the jump's own start, not a mistake.

**Jumps, or not.** Unsorted keeps its jumps, because the half-hour rule made them and they can still
be corrected — a jump is named by its position in the day, with the times it spans beside it, and
setting that start time moves the whole jump. A dropzone has no jumps: its files are written flat, and
a jump stops meaning anything once they are filed there. A day's loose files sit below its jumps,
marked as being in none.

**Showing files.** One shape for every file, so nothing shifts position from one line to the next: as
rows — tick, thumbnail, name, crop, time, size, state — or as a grid of thumbnails, whichever was
chosen last, for the whole board. Once a copy exists the name shown is the one that copy carries, the
name that goes to the storage and that the passenger sees, with the camera's own name kept quietly
beside it so a file can still be traced to the card it came off. A long list is drawn a page at a time
with a button for more, because a tandem of five hundred photos must not put five hundred things on
screen before they have been asked for. Where a place holds both videos and photos, badges say how
many of each and show one kind or the other — fifteen clips and five hundred stills are two different
jobs. A thumbnail shows its state as a coloured dot once a selection is under way, which is when it
matters; a row always says it in words.

**Finding.** A box in the pane's heading narrows what is drawn in the place being looked at, matching
either name a file has. It only changes what is shown: a jump left with nothing matching drops out of
view rather than appearing empty, and the counts in the menu go on counting everything, because what
is there has not changed.

**Filing.** Drag a jump or a selection onto a place in the menu to file it there, or onto another jump
to move it. While something is being carried, everywhere that would take it is outlined, and the one thing under
the pointer is filled in — the first says where it could go, the second says where it is going. A
place that would not take what is being carried shows neither.
Tandems with no passenger yet stay visible and say how many are waiting for a name, rather than
quietly hiding.

**Selecting.** One gesture: click to preview, ctrl- or cmd-click to pick a file, shift-click to take a
range. Once anything is picked, plain clicks add and remove, and Escape clears. A selection can be
removed back to the sorting area, by button or by pressing Delete.

**Comparing.** Tick two jumps and compare them side by side, stepping through every jump independently
on either side, then merge them if they are the same jump. Merging asks which date the result should
keep.

**Cropping.** Clicking a file opens it, playing its proxy when there is one — same length, same
speed, so a trim set here is the same instant of the clip itself. The picture fills the left of the
dialog with the timeline under it; the right side says what is being decided — where the trim starts and ends and how much of
the file that keeps, how the picture would be turned, how it would be framed, and what is on the file
already. The file's name, when it was shot, its size and its state are along the top with the way to
step to the next file; along the bottom are the ways out, and saving is offered only once something
has actually changed, which the dialog says out loud. A file that belongs to no jump can be cropped
just like one that does, and a row shows the crop it is carrying and whether it has been applied yet.

**Cropping the frame.** A mount, a strut or a finger in the corner of the picture is cut away by
dragging a rectangle over the video: what is dimmed goes, what is inside it stays. The rectangle holds
the shape the clip already has unless another is chosen, so a 16:9 jump is still 16:9 when the
passenger gets it — that is the point of it. What is left is put back to the size the clip came at, so
a 4K clip stays 4K and a timeline is not a mix of sizes.

Set on one clip it can be given to every other clip in the same jump in one press, because a badly
mounted camera is badly mounted for the whole jump. It is for clips only — a photo has no frame crop.

This is the one thing in preparing a file that cannot be done by copying. Trimming the ends moves no
pixels, so the file is copied and nothing is lost; cutting the frame changes the picture, so the clip
is encoded again — for quality rather than for speed, on the graphics card where there is one — and a
card of clips takes minutes rather than seconds. The small copy the editor opens on is cut to match,
or somebody would be editing a picture that is not the one about to be rendered.

> **Drawn, not built.** Turning a picture is shown in that dialog and cannot be used, because it
> cannot be done without re-encoding and nothing yet asks for it. It is drawn because it is part of
> the decision, and held shut rather than left out so that what is missing is visible.

**Acting.** Each day and each tandem offers exactly one next step, in the same place, and never offers
them out of order. A dropzone day is **prepared**, then **sent**. A tandem is **processed**, then given
a **montage**, then **delivered** once someone has rendered the film. Once there is a project the
tandem shows where it is and copies that path when clicked; until the film exists it says to edit and
render it, and once it exists it shows the film's size. Nothing can be sent until everything in it has
been prepared, and what is waiting is said plainly. A delivered tandem shows the folders on the
storage instead of the files it was made from.

**The header** holds what applies to the whole day's work: scanning for newly copied files, the state
of the network storage with its folders and a way to ask it what it holds now, the rows-or-grid
choice, and whether the board is light or dark. With nothing scanned yet, the board is a single Scan
button and the instruction to copy the cameras first.

**Light and dark.** The board follows the machine by default, and can be told to be light or dark
instead. The choice is remembered on that machine and applied before the first thing is drawn, so
the board is never briefly the wrong one. It is a choice worth offering because what the machine
reports is invisible and is not always the machine it appears to be — a browser preview inside an
editor follows the editor, not the desktop — and because being able to pin it is what makes two
windows comparable.

## File status

Every file is in one of three states, each of which SkyDock can verify:

- **local** — nothing current has been made from it. Either it has never been processed, or it has been
  cropped, re-timed or replaced since, which leaves what was made from it out of date.

  The board tells these two apart: a file that was prepared and then changed reads as **changed**
  rather than plain _local_, because "never prepared" and "prepared, then altered" are not the same
  situation to be in. It stays a derived fact, not a stored flag — preparing it again makes the copy
  current and the distinction disappears on its own.

- **processed** — a copy exists that was made from the file exactly as it is now.
- **uploaded** — that copy is on the network storage, proved by comparing checksums on both sides.

A file falls back to **local** when anything it was made from has changed, or when the copy is missing
or a different size. It falls back to **processed** when the copy that was uploaded is no longer the
copy on disk, or when the storage was asked and does not have it.

**Uploaded is the end of editing.** SkyDock never deletes from the network storage, so it cannot take an
old copy back; changing a file after it has gone up would leave the two disagreeing for good. Cropping,
re-timing, moving and renaming therefore belong before processing, and are closed once a file is uploaded.

The board marks an uploaded file with a padlock and will not let it be dragged. **Partly built:** the
crop dialog still opens on one and still saves, so the rule is announced there without yet being
enforced. What is left is to make the crop read-only and to say plainly that the way back is to take
the file off the storage, over there.

Two rules keep this honest:

- **Being listed can take a claim away, never grant one.** Only an upload, which compares checksums on
  both sides, can mark a file as uploaded. A matching name and size is not proof that two files are the
  same file.
- **Not knowing is not evidence.** Storage that was never asked, a folder whose listing failed, a size
  the storage would not report — none of these demote a file.

  > **Decided, not yet built.** A file that went to the storage _inside an archive_ is covered by the
  > same rule. Nothing can look inside a zip, so a listing that does not find it has learned nothing —
  > it must never be read as the file being gone. A tandem's photos and original videos travel this way,
  > which is what makes them count as uploaded at all: the archive was built from exactly those bytes.

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
single job, sending the folder whole.

A tandem's files reach the storage too, but by delivering rather than by that upload, because they do
not all go to the same place: the film and the photos to the passenger's folder, the original videos
to the backup. Sending a passenger's folder whole would put the project, the working copies and the
originals in with them, so asking to upload a tandem is refused and says why.

Files already on the storage are not sent again: a file with the same name
and the exact same size is checksummed on both sides, and only skipped if they match. Anything uncertain
is uploaded, since sending a file twice costs time while skipping the wrong one costs the delivery. The
app reports what it is doing throughout — first how many files it is checking, then how many it is
sending and how far through the current one it is, and finally how many were already there.

**Share links.** A folder's link is reused if it already has a working one, so re-uploading does not
invalidate the link a passenger already has. Only a folder with no usable link gets a new one.

**Removing things.** SkyDock never deletes anything on the storage. A file that should not be there is
removed by hand, in the storage's own interface — which is also the only place a mistake can be undone,
since nothing here can put it back except sending it again.

**Noticing deletions.** What SkyDock does instead is notice. A file it can no longer find stops counting
as uploaded and goes back to being merely processed, ready to be sent again; the file on this machine is
untouched either way. It looks when the board opens, again right after an upload, and whenever the check
button in the header is pressed. Between those moments it says what it last proved, not what is true
this second.

## Montage

A processed tandem can be turned into a video project ready to edit. The jump's videos are laid on the
first video track of a template, in the order they were shot — which track that is differs from one
template to the next and is read from the template rather than assumed, because dropping the footage
on the wrong track produces a film with nothing in it and no complaint. Crops are already applied, so
the timeline carries the cut footage.

**It opens on the proxies.** Each clip on the timeline points at the small copy made when the card
was scanned, cut to the same length as the clip beside it, with the clip itself recorded as what the
edit is really of. So the editor opens ready to work instead of transcoding every clip first, which
is the longest wait between asking for a montage and being able to touch it — and it swaps back to
the clips on its own to render, so the film is made from the footage and not from the proxies. A clip
whose proxy could not be made is laid on the timeline as it is, and the editor makes its own the way
it always did.

The destination and format of the film are filled in, so the only work left in the editor is the edit
itself and pressing render: nothing to type, no folder to find, and no film landing somewhere it then
has to be moved from.

**Making the montage opens it.** Writing the project and opening the editor on it are one press, and a
tandem that already has a project offers a way straight back into it. Which command opens it is a
setting, because it depends on where SkyDock is running: installed on the machine someone edits on,
the editor is simply there; running somewhere that cannot reach it, there is nothing to open and the
board says so instead of failing the montage. It says which command it used, and if that command
started and gave up, what it said on its way out — a montage whose editor never appears is otherwise
a silence nobody can act on. The project's full path is still named and still copies
when clicked, which is what is left when the editor cannot be reached from here.

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
- **Nothing renders the film.** A person makes the edit and renders it. SkyDock opens the editor on
  the project and takes over again afterwards, but it never drives the edit or the render.
- **Nothing notices a render finishing.** The board looks at the folder each time it is asked to do
  something; there is no watching in the background.
- **Nothing watches a proxy being made.** The board says which clips have one and how many are still
  without, but only as of the last time it was drawn: they appear on the next thing it is asked to do,
  and there is no live progress and no way to ask for one on its own.
- **Nothing comes in from outside the cameras.** A file can only reach SkyDock by being copied off a
  camera and scanned; there is no way to drop an arbitrary file into a jump.
- **A file is in one place at a time.** It can be moved between jumps, but not put in two at once.
- **A dropzone can be created, not renamed or removed.** Its name is what its folder is called.
- **One known collision.** A loose file and a jump's file filed to the same dropzone and shot in the
  same second can be given the same name, and the second one written wins.
- **A single file's time cannot be corrected.** Only a whole jump's, which moves everything in it.
- **Ungrouping a jump undoes what was made from it.** Taking files out of a jump deletes their
  processed copies and clears what was recorded about them, so the work has to be done again.
- **Asking the storage what it holds can only take a claim away.** It cannot notice that a file
  already up there is the right one and mark it uploaded; only an upload proves that.
- **Nothing comes back down from the storage.** SkyDock uploads and lists; it never downloads.
- **Archiving is part of delivering.** The zips are written as a tandem is delivered and cannot be
  made on their own, nor backed up as plain files instead of a zip.
- **A picture cannot be turned.** See the note under Cropping. Reframing it can.

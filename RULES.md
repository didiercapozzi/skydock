# RULES — what SkyDock does

> The single source of truth for how SkyDock behaves. It describes the app in plain words — what a
> person sees and what the app promises — never how the code does it. The code and its tests are the
> authority on _how_.

## What SkyDock is

SkyDock is the media workflow of a skydiving dropzone. Cameras come back full of videos and photos
from a day of jumping. SkyDock copies them off, works out which files belong to which jump, and lets
the instructor file each jump under the dropzone it was shot at or make it a montage — a film for a
passenger, for a boogie, for whoever it is for. It then renames and crops the files into a tidy
folder, puts them on the club's network storage, and helps hand them over.

Cameras are plain storage. SkyDock does not care which camera a file came from, only when it was shot.
Every time is on the local clock, whoever wrote it: a photo keeps its time that way, and so does a
GoPro's video, but a DJI keeps a video's time in UTC, as the format says it should, so it is turned
into local time — otherwise a DJI's clips would sit hours away from its own photos.

## Where SkyDock runs

SkyDock is installed on the machine the footage is edited on — a Mac, a Windows machine or a Linux
one — and opens as a window of its own. It carries everything it works with: the tools that read and
write video, and the one that reads and writes the dates inside files. A machine with nothing on it
copies a card, finds the jumps, prepares the files and sends them on. One thing is somebody else's
editing program and is not carried: a montage is prepared whether or not it is installed, and
opening one needs it.

**It keeps itself current.** On opening, SkyDock asks whether a newer one has been released, and
says so once if there is. On Windows and on Linux it fetches it quietly first and then asks: install
it now, or next time — saying yes is a restart, not a wait, since it is already down. On a Mac it
says which version is out and opens the page it comes from, because only an app signed for it can
replace itself there. Saying no leaves everything as it was and asks again next time. Nothing is ever
installed without being asked — a machine in the middle of somebody's day is no place for a version
that changed by itself. A machine with no way out to the internet, or one that finds nothing, opens
its board exactly as it always does.

The first time it is opened it asks where to keep its work, offering a folder of its own in the
machine's videos. That answer is remembered, and everything below — the originals, the copies, the
proxies, the record of it all — is under it. The bin is kept with the work, so a file put aside from
this machine is moved, never copied from one disk to another; the app's own settings, the storage
connection among them, are kept apart from the work.

**Another work folder** can be chosen afterwards, from _Work folder_ at the top of the board, which says
where the work is now. Nothing is copied or moved: SkyDock starts again in the folder chosen and the
board opens on what it holds — empty, or the work already kept there — and that folder is remembered
from then on. The folder left behind stays exactly as it is and can be chosen again; to take the work
along, the folder is moved by hand first. It is chosen in SkyDock's own window only, and not while
something is being written into the folder: an upload, a camera being copied, files coming in, a
scan, or processing.

A camera is anything with a `DCIM` folder at its top, wherever this machine puts such things: a
drive letter of its own on Windows, a volume on a Mac, a mount under the usual places on Linux — and,
where a camera has no drive to offer at all, the folder the desktop makes for it when it hands its
files over instead.

## Principles

Everything below follows from these.

- **The originals are never touched.** Processing makes copies. It never moves, renames or deletes a
  file that came off a camera. Correcting a jump's time changes what SkyDock has recorded, not the file.
  The one exception is a person's own choice: an unsorted file can be put in the bin, which moves it
  and erases nothing.
  A camera's own storage is only read, with one exception, also a person's choice: a file on a camera
  plugged in can be taken off it once the network storage is proved to hold it, or once its copy here
  has been put in the bin, and it goes to the bin too.
- **A folder is rebuilt only by whoever owns it.** A montage's folder can be rewritten, because only
  that montage is in it. A dropzone folder is shared by every day ever shot there, so it is never
  wiped: files in it are replaced one by one, and a day SkyDock no longer knows about is left alone.
- **An edit is the one thing that cannot be made again.** Footage can be copied again, archives rebuilt,
  a film re-rendered. The hours spent editing exist once. Every rule about a montage with an edit
  protects that.
- **Processing again is the normal way of working.** Process, look, correct a time or a name, process
  again. The second pass writes over the first and leaves nothing aside. In a montage's folder it
  removes any copy none of the montage's jumps produces any more — processing one of its jumps
  never touches another's copies; in a dropzone's folder, shared by every day, a copy
  under a name no longer produced stays on the disk but is never handed over.
- **A file's state is a fact that can be checked, not a flag to remember.** Every claim SkyDock makes
  about a file — processed, on the storage — is backed by evidence it can look at again.
- **Nothing on the network storage is ever deleted by SkyDock.** It uploads and creates folders; a file
  asked to be sent again over one already there is moved into a bin first, never written over. Taking
  something off the storage is done by a person, in the storage's own interface. SkyDock's part is to
  notice. A link is not a file: taking a link away leaves what it pointed at exactly where it was.
- **Not knowing is not evidence.** When the storage did not answer or a check failed, SkyDock keeps what
  it last proved rather than assuming the worst.
- **Uncertainty costs time, never a delivery.** When SkyDock cannot tell whether two files are the same,
  it sends the file again. When it cannot prove a copy is on the storage, it will not delete the local one.

## The workflow

```
  camera ──copy──▶ originals ──scan──▶ jumps ──sort──▶ a dropzone ──process──▶ copies ──upload──▶ storage
                                                   └─▶ a montage ──process──▶ copies ─project─▶ edit
                                                                                       render ─▶ film
                                                                                       upload ─▶ storage
                                                                                        email ─▶ whoever it is for
```

**1. Copy off the cameras.** Every photo and video is copied into a folder named after the day it was
shot; a camera's other files, such as its small preview copies, are left on it.
Inserting the same camera again costs nothing: a file already there with the same contents is skipped,
recognised by its size and time without being read again. A file this machine has already given back is
passed over the same way, since freeing is a choice and plugging the camera in again does not undo it.
That one is recognised without being read either — by the day it belongs to, the name it would be filed
under, its own or its own with a number, and its size; not by its time, which is the time it was shot
and may have been put right by hand since, while the card still holds the time it was written. An
original is never written over: a second camera's clip that has the same name as one already there —
two cameras of one make both start at the same number — is kept beside it under its name with a number.
Each file is only given its name once it is whole, so a card pulled out half way leaves nothing behind
that could be taken for an original.

**Plugging a camera in is enough.** Once a board has been opened, and from then on for as long as
SkyDock runs, anything that turns up with a DCIM folder at its top — where every camera keeps its
pictures — is copied off by itself, then scanned if anything new came off it, so its jumps are on the
board with nobody pressing anything.

**A camera that hands its files over is a camera too.** Many cameras — a GoPro among them — never
show their card as a drive: they answer for it one request at a time, and only one program at a time
may ask. Such a camera keeps its pictures inside one of its stores rather than at its own top, so both
are looked at and the DCIM decides. Where the desktop makes a folder for it, it is found in that
folder. Where the desktop is KDE, which keeps the camera to itself and makes no folder, SkyDock asks
KDE — the same way the file manager does, at the same speed — and it is named by the camera's own
name. KDE is only asked for a while after something is plugged in or taken out, never every few
seconds for as long as SkyDock runs. A clip is fetched whole into a holding place, dated from the copy
here and filed like any other; one already here is known by its name, its size and its time before
anything is fetched, so plugging the camera in again reads almost nothing. A camera read this way is
slower than the same card in a reader, since nothing can be read ahead, and that is said where it is
plugged in and on its page, because a camera that is merely slow and a camera that is stuck look alike.
A desktop that neither makes a folder nor is KDE leaves such a camera unseen, and its card has to go in
a reader. The copy is shown in the corner of the board, whatever page is open, in the same panel as
files being copied in and an upload going out: every file on the card, listed before the first is
copied, each marked waiting, being copied, copied, or here already, and as it goes how many are new
and how many were here already — a camera plugged in again is looked over file by file, and a file already here
costs a look and not a copy, so the looking must not be mistaken for copying it all again. The board
says what came off once it is done: how many new files and how many already there. A camera is copied
each time it is plugged in, and again whenever asked while it stays plugged in — from its page, which
offers to copy what is not here yet, or with Rescan cameras, which copies every camera plugged in and
then scans — so what went missing here comes back across without unplugging anything; a camera asked
for while it is already being copied is left to that copy. One unplugged half way keeps what was
copied whole, and plugging it in again copies the rest. Only one camera is copied at a time, in the order they came. A drive
without a DCIM folder is not a camera and is never looked into, and copying never writes to a camera. The
`._` files a Mac leaves beside each clip on a card it has touched are not media, and are neither copied
nor listed.
Where cameras are mounted is told to SkyDock when it starts, and telling it nothing turns this off.

**Seeing what is on a camera.** A camera plugged in is listed at the foot of the menu for as long as it
stays plugged in, and its page lists every photo and video on its card, each saying how far it has got:
not copied yet, copied here but not uploaded, copied here and then put in the bin, or on the storage —
copied read by the same rule the copy uses to pass a file over, and in the bin read by the file's bytes,
never its name, which the copy may have changed: only a file of the bin of the very same size is read
through to be compared, so the rest of the card is not read at all, and what was read is remembered
while it stays the same. Only a file on the storage, or one whose
copy here was put in the bin, can be picked and deleted from the camera, to make room on the card; the
others have no tick, since until a file is uploaded or thrown away the card is its other copy. The picks
on the storage are also what can be **copied back here**, which is the one thing that undoes a freeing
and is never done by plugging the card in. Deleting asks first, saying how many files and how much, and
that they go to the bin. Then each file is read through and held by its bytes, never by its name:
one in the bin against the files put in the bin from Fresh files, which has to hold that very content;
one on the storage against what the storage holds, since every name changes on the way — it has to be a
file the board knows by its content, and the storage has to hold what that file became. The storage has
to be reachable only for those.
A camera read through KDE is listed the same way, but from what its copy found rather than by asking
it again: it answers one question at a time, and a card of sixteen hundred clips is minutes of them.
It is copied the moment it is plugged in, so its page opens at once; while the copy is still going
over it, what has been reached is listed and the page says the rest are coming, filling in on its own.
Nothing is deleted from it here: the proof reads each file through, byte for byte, which needs the
camera readable as files — and for the same reason its page does not say which files are in the bin.
Its page says to delete on the camera itself.

| What the camera file is | What it is held against on the storage                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| a montage's original    | the very file where it went up as it is, or its entry in the zip          |
| a montage's photo       | its entry in the zip that holds the photos, or the copy sent as it is     |
| a dropzone's file       | the copy made from it, which is what went up — it never goes up as itself |

If any file is not proved, or is not on a camera plugged in now, nothing at all is deleted and the files
at fault are named — first any not on a camera plugged in, then any neither in the bin nor shown to be on
the storage. What passes is moved off the card into a folder of the bin named after the camera and the moment,
kept as it sat on the card. A montage's file is proved through the archive kept here, so once the
montage has been freed its files can no longer be proved and stay on the card. Nothing is deleted from
a camera while one is being copied or anything is being processed.

**2. Scan.** SkyDock reads each file's capture time and groups files shot close together into jumps.
A scan can be asked for at any time; one run after more cameras were copied off picks up the new files,
groups them among themselves — joining a jump still in Fresh files when they fall within its gap — and
leaves every filed jump as it is. The grouping is a guess, and the board exists to correct it.

A scan of a work folder nothing has been copied into yet finds nothing, and says so — but it settles
the folder: the originals folder is made, and an empty record is written. A folder SkyDock has been
pointed at is therefore a folder SkyDock is working in after one scan, whether or not anything has
come off a camera, and a file can be dropped straight onto the board of a fresh install.

A scan also makes a **proxy** of every clip: a small copy, the same length at the same speed, which the
board plays instead of the full clip and which the editor later opens on. Proxies are made in the
background; everything works without them, and a clip without one simply plays as it is. Each clip
says whether it has one. Proxies are working files: never listed, never sorted, never uploaded. The small square the board
draws a file by is cut from the proxy once there is one — the same frame, at a third of the cost —
and kept, so a jump opened again is drawn from what was already cut rather than from the footage. A
file that changes is drawn again; the kept frames are a few kilobytes each and nothing is lost by
deleting them.
A server stopped half way through making them — restarted, or the machine put to sleep — finishes
them once it runs again and a board connects, rather than waiting for the next scan; what was left
half written is cleared first.

Proxies are made on the graphics card when the machine has one that works, and on the processor
otherwise. A clip whose proxy cannot be made says so where it is shown, with the reason, and is tried
again on the next pass; it is not counted among the clips still waiting for one. It can still be sorted,
processed and uploaded.

**3. Sort.** On the board, each jump is filed under a dropzone or made a montage, named once — a
person, an event. A jump is processed once it is filed.

**4. Process.** The files of a filed jump are copied into their delivery folder, renamed after the
montage or the dropzone and the time they were shot, cropped and turned as asked, and stamped so that
each file's date matches its name.

**5. Hand over.** A dropzone folder is **uploaded** whole and gets a share link. A montage is given an
**editing project** — its clips waiting in the bin — someone edits and renders the film, and the
montage is then **uploaded**: the film and the photos to its folder, the original videos to the backup
folder. Finally whoever it is for is **emailed** the link.

Sorting and editing are the steps that need a person. Everything else is one press, always in the
same place. Rendering the film needs the video editor, which SkyDock opens but never runs itself.

## Jumps

A jump is a run of files with no long pause in it. The pause is measured from each file to the next,
so a jump can last hours as long as filming never stops for that long. The first pause of the gap or
more ends the jump. The gap is **fifteen minutes**. The first scan groups everything by it; after that,
a scan groups only the files it had not seen, among themselves. A run of new files within the gap of a
jump still in Fresh files joins that jump, so a card copied off in two goes ends up one jump; a jump
already filed never grows by itself. Every jump already there keeps its files, however it was made.

- A file with no neighbours is not a jump of one. It stays **loose**: visible, sortable and processable
  on its own.
- The guess can be corrected by hand. Two jumps can be **merged**, choosing when the merged jump
  started — one or the other's start, or a time given — with every file moving by the same amount;
  files can be **dragged** from one
  jump to another, or back to the sorting area; loose files can be **regrouped** by running the gap
  rule again over everything still unsorted. A jump with nothing left in it disappears.
- **A jump starts when its own run starts** — its longest unbroken run of files. A file brought in from
  elsewhere, by a drag, from the computer or as a copy, was often shot well before or after and does not
  say when this jump was, so it changes nothing about the jump: its date and time, its number among the
  jumps, the day it is filed under and the start that gets corrected all keep following the run. The
  file is still listed, and placed among a montage's clips where its own time puts it. One brought in from
  within the gap is part of the same filming, and then the jump does start with it; a copy never counts.
- A file a jump holds against the gap rule — dragged in, or re-timed away from the rest — carries a
  **gap** flag wherever it is drawn, and its jump's card says how many of its files do. The flag only
  says so: nothing is moved, since whoever put it there may be right.
- **A file can be copied into another jump** as well as moved there, for what two jumps share — the
  plane, the exit, the group photo, two passengers out of the same door. Dropped on the other jump, or
  on a montage in the menu, with alt or ctrl held, it stays where it was and the other jump gets a copy
  of its own: trimmed, framed and turned as it was where it came from, then changed there without
  touching the other; on its own time, so re-timing one jump leaves the other alone; and processed and
  uploaded for that jump, under that montage's name. The file says on its row that it is a copy. A jump
  holds a clip once, so one it already has is passed over. A file that can no longer move — uploaded, or
  in a montage with an edit — can still be copied, since nothing about it changes; only one freed from
  this machine cannot, having no file here.
- A copy exists for the jump that holds it. Taken out of its jump it simply ends, the original being
  wherever it already is, and it goes with its montage when the montage is deleted. A scan leaves it in
  its jump rather than pulling it back beside its original; it follows that original if the file is
  moved and goes if the file is gone. The original cannot be put in the bin while a jump holds a copy of
  it, and freeing a montage leaves on the disk any original another jump still holds — such a file is not
  said to live on the storage only, because it does not: it is here, and can be copied, moved or dropped
  in again like any other.
- **A file back in Fresh files is on its camera's time again.** A time is only ever corrected for the
  jump a file is in — the whole jump moved to when it really happened, a clip fitted among the others —
  and means nothing once the file is on its own; left on it, the file would sit under a day it was never
  shot on. So a file taken out of its jump, sent back from a place, or left by a jump that was deleted
  goes back to the time its camera gave it. Its trim, frame and turn are kept: those are about the clip.
  A file that moves to another jump, or is filed to a place, keeps the time it was given.
- **Fresh files can be reset**, by as much as is wanted, from _Reset Fresh files…_ at the far end of
  their line, which offers both and says what each forgets and keeps — choosing is the asking first.
  It is set apart from _Group loose files into jumps_, beside the count of loose files, which only
  gathers those files by the gap rule, forgets nothing, and asks nothing. _Times only_ is for when a correction was the
  mistake; _Everything, as just scanned_ is for when the sorting has gone wrong and starting over beats
  undoing it. Either way nothing filed to a dropzone or a montage is touched, and no original is.

  | Reset                         | Corrected times | Jumps and their names                    | Trims, frames, turns |
  | ----------------------------- | --------------- | ---------------------------------------- | -------------------- |
  | _Times only_                  | forgotten       | kept                                     | kept                 |
  | _Everything, as just scanned_ | forgotten       | forgotten, the gap rule makes them again | forgotten            |

- Gathering the loose files of Fresh files into jumps is a different thing and forgets nothing: it is
  offered on the count of loose files, and only ever groups what is in no jump.
- A jump that should not exist can be **deleted** from its panel, wherever it is filed. The jump goes
  and its files stay: back in Fresh files, loose, each on the day it was shot and at the time its camera
  gave it, keeping the trim, frame and turn set on it in the jump. What was made from them no longer matches and is deleted, so when there
  are processed copies it asks first, saying how many. A dropzone's jump already uploaded cannot be
  deleted, nor one on the storage only. A named montage is deleted as a montage instead — at any step,
  and forgetting what was decided about it (Taking a montage back). Regrouping puts loose files back
  into jumps.
- A scan keeps the work already done: which jump a file is in, where it is filed, its crop and turn,
  the time it was given, corrected or not, and what has been made from it and sent — a jump's copies,
  project, upload and freeing. Only what the disk measures — size and contents — is read fresh. A file
  whose contents changed is another file: it takes the time its camera gave it and invalidates what was
  made from it; a file that merely sat there keeps everything.

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
- **A montage's files carry the jump's date; a dropzone's files carry their own.** A montage is one event
  for one name. A dropzone folder holds many days, so each file says which day it was shot.

## Places: destinations and montages

Filing a jump answers one question: where does it go?

- **A destination** (Yverdon, Colombier, …) is a place. Its jumps belong to nobody in
  particular, and their files all sit directly in its folder: no folder per jump, videos and photos
  together. Many days share the folder, which is why it is never wiped. No destination is special,
  whatever it is called.
- **A montage** is a film made for someone: a tandem passenger, a boogie, a day at a dropzone. It
  belongs to no destination. It has **one name**, typed once — "Luc Favre", "Boogie 2026" — and a
  single word is a whole name. The name is its working folder on this machine, named as typed, with
  videos and photos kept apart inside it. Two jumps given the same name are one montage and share it.
  A montage cannot be processed until it has a name, because the name is the folder. **Where its film
  and its backups go is chosen when it is uploaded**, among the destinations (Uploading a montage).
- **A backup folder chosen before backups went into destinations** becomes a destination called
  Backup, so a backup can go where it always went.
- **A name can be changed afterwards**, because a name read off a form can be read wrong. Changing one
  says what it costs: what was processed belongs to the old folder and must be processed again, and what
  was already uploaded stays on the storage under the old name and no longer counts as uploaded here.
- **A loose file can be filed to a dropzone** without belonging to any jump; it is handled exactly like
  a dropzone jump's files.
- **A dropzone can be taken off the board**, for one made by mistake or one nobody shoots at any more.
  It is asked for first, and nothing is deleted: every jump filed there comes back to Fresh files
  whole — its files, its name, its trims, its marks — and every loose file filed there is loose in
  Fresh files again, to be filed somewhere else. What was processed belonged to that dropzone's folder,
  so it must be processed again wherever those jumps go next, exactly as when a name is changed. The
  folder on the storage is left as it is, with everything in it and any link handed out of it: what is
  up there is not this machine's to throw away. A dropzone holding anything already uploaded cannot be
  removed — uploaded is the end of editing. The montages are not a place, and are never taken off as
  one.

## What lands on disk

```
output/
├── original_files/           every file as it came off the camera, one folder per day
├── processed/                what gets handed over
│   ├── Yverdon/              a dropzone: flat, shared by every day shot there
│   │   └── yverdon_20260829_113015.mp4
│   └── Montages/             the montages' working folders
│       └── Luc Favre/        a montage, named as typed: the name kept so its edit still opens
│           ├── videos/  photos/
│           ├── luc_favre_20260829.kdenlive    the editing project
│           ├── luc_favre_20260829.mp4         the film, once rendered
│           ├── luc_favre_20260829.photos.zip  for whoever it is for
│           └── luc_favre_20260829.rushes.zip  the originals, for the backup, when kept as one archive
├── proxies/                  the small copies, and for each montage a set cut to match its processed clips
├── templates/                one editing template per folder, with the music and logos it uses
├── .thumbs/                  the frames the board draws, cut once and kept
└── .projects/                every version of each montage's editing project, kept and never deleted
```

The board's own record of the work sits at the top of the output folder.

Of a montage's folder, only the film and the photos archive are handed over. The project and the
working copies stay on the machine; the originals go to the backup.

Names are built from who the files are for, the date, and the time shot: `luc_favre_20260829_113015.mp4`,
`yverdon_20260829_113015.mp4`. Accents and spaces are folded away in file names (`Chloé Perret` becomes
`chloe_perret`) but not in folder names, and two files shot in the same second get a counter — whether
they are processed together or one long after the other, since a name a copy already carries is taken
and a file is never delivered over another. A file takes its own name back when it is processed again,
which is how processing again writes over itself, in the same folder and never a numbered second one.

Taking a file out of a jump deletes the copy made from it, so nothing stale is left to hand over.

## Languages

SkyDock speaks **English, French and German**. It speaks the one chosen in the header — EN, FR or DE,
each named in its own language — and, until one is chosen, the first language the machine asks for
that it speaks, else English; the desktop window asks in the system's language by itself. The choice
is kept on this machine, and the page is drawn again in it at once, from the server as well, so what
the server says comes back in it too. What SkyDock writes to the disk or the storage is never
translated — file and folder names, zip names, the storage's lists — nor is the passenger email,
which is the club's own words and written in its own template. Every sentence the app shows is there
in each language; one missing is a fault.

## The board

The board is the everyday screen. A menu of **places** — everywhere a file can be — is pinned down the
left, and the place picked there fills the pane beside it. Only the pane scrolls, so a file can always
be dragged to any place. On a narrow screen the menu becomes a strip across the top, and on one
narrower than a laptop's the panel on the right is not shown.

**Every folder has its own address**, and so has a file opened in it: the front page is the fresh
files, `/dropzone/yverdon` is that dropzone, `/montage/Lily DONZALLAZ` is hers, and
`/dropzone/yverdon/file/<the file>` is that clip open in it. A folder in the menu is a link, so picking
one is going there: the back button walks the folders and clips looked at, a page reloaded comes back
where it was, and an address can be kept or sent to somebody — a montage's opens its page even on a
board that no longer holds it, showing what the storage has of it. One nobody recognises opens the fresh files rather than
nothing. How a folder is being looked at travels with its address:
what is typed in the box, how the files are grouped, which jump card is open. Which kind of file is
shown belongs to the whole board instead, so it follows from one folder to the next. What is being
decided and not yet saved — a trim, a rectangle, a turn — is in none of it: an address is somewhere to
come back to, and a trim nobody saved is not.

**The places.** Three places of work: _Fresh files_, a single entry holding everything off the
cameras that is not filed yet; _Destinations_, one entry per destination, and a field to add one; and
_Montages_, one entry per named montage and one for the montages still waiting for a name. Below them, once the storage is
connected, is _On the storage_, its list of montages; at the foot, each camera plugged in, for as long
as it stays plugged in. Each place of work says how many files it holds, how much of it is still local,
processed or uploaded — a montage shows its steps instead — and what is left: the jumps still to file
in Fresh files, the files still to do at a dropzone. Every place of work takes files dropped on it,
and every one but Fresh files a whole jump; the storage's list and the cameras take nothing. A montage
is listed once, however many jumps it has.

There is no page of every montage: a montage is worked on one at a time, so the way in is always its
own entry. The _Montages_ heading says how many montages are not uploaded yet, and takes a jump or
files dropped on it: the montage's name is asked for first, and nothing moves until it is saved —
cancelled, what was dropped stays where it was. Clicking it goes nowhere. A montage that
has been freed and has walked every step, its link emailed, has nothing left to do here: it leaves the
Montages, its entry with it, and is found in the storage's own list. Whether it was emailed is read off
that list, so while the storage cannot be reached, nothing leaves.

**Where every montage has got to.** A montage walks the same six steps every time — _Named_,
_Processed_, _Edited_, _Rendered_, _Uploaded_, _Emailed_ — and the board shows every montage where it
is on them, so nobody has to remember what comes after a render. Each montage's entry in the menu says
the step that is next ("to render", "to email") with a segment per step beneath it, done ones in green
and the one it is at in the same colour as those words; its card says the same. Its panel, and its
page, show the whole way one step under the other: what is done ticked and joined up, the step it is
at ringed with what to do next written under it, and what is still to come greyed. Each step is read
off what is there — the name, the copies, the project, the film, the upload, the storage's list. A
freed montage went through every step up to the upload, with nothing left here to show for it. A
montage with several jumps is where the one furthest behind is, since one name is one folder.

The menu lists no days: a date is only what a camera's clock said, and a clock that was wrong only adds
a day that means nothing. Days are still there to be seen: each card carries its date, and a place can
be arranged by day, each day's header pinned while its files scroll.

**Jumps as cards.** Fresh files keeps its jumps, named by position among them ("Jump 1", "Jump 2"),
counted oldest first straight through the days, so four jumps are Jump 1 to Jump 4 whichever days they
fell on and no two share a name; a montage's jump is named after the montage. In Fresh files, naming
a jump is making it a montage (Making a montage), so that is the one way a jump there is named. A jump
at a dropzone can be given a name of its own by clicking its name in its panel, the way its start is set
by clicking the start; emptying the name puts back its place among the jumps. That name is only what
the board calls the jump — no file is named after it, so renaming never makes anything stale — and it
is kept through a scan. A jump that already had one keeps it, and making it a montage starts from it.

Arranged by jump, every jump is a card, side by side, newest first, so the numbers count down to Jump 1,
the first of all. A card carries its name, its date in full and its start time to the minute, how many
videos and photos it holds, how far it has got, and a few frames off it, so jumps are told apart at a
glance. The loose files get one card of their own, always first: drawn dashed and flat so it never
passes for a jump, and carrying no date, since loose files share no one moment.

One card is open at a time — the one last chosen, or else the first — and its files are listed under the
cards, drawn exactly as files are everywhere else. Nothing sits between the cards and the files but, for
a montage, its next step and what it has produced. What the jump is and what can be done to it —
correcting when it started, making it a montage, deleting it — is in the panel on the right, which
describes the open card before anything is clicked as much as after; choosing the loose card lets go
of the jump. A montage of a single jump is that jump: opening the montage shows its panel at once,
with no card above its files to say what the panel already says.

Every jump's card takes dropped files, which moves them into that jump, whichever day it is on; a card
dragged onto a place files the whole jump — dragging is how anything is filed. The loose card takes
nothing, its files being in no jump. A dropzone has no jumps at all: its files are flat, and a jump
stops meaning anything once filed there. A jump is filed under the day it started and keeps that day:
dropping a file from another day into it does not move it, while re-timing it or merging two does,
because the jump itself changed.

**Showing files.** Every file is shown the same way: as rows — tick, thumbnail, name, crop, time, size,
state — or as a grid of thumbnails, whichever was chosen last, for the whole board, until the window
is closed. Once a copy exists, the name shown is the copy's name, the one that is handed over, with the
camera's name kept beside it. A clip shorter than the moment its thumbnail is taken at shows its first
frame. Long lists are drawn a page at a time — forty rows or a hundred and twenty thumbnails — with the
next page, or all the rest at once, a press away. Thumbnails can be drawn smaller or bigger, from a
wall of small ones to see a whole card at once to large ones to tell two near-identical shots apart:
with a slider in the header while thumbnails are shown, or with Ctrl or ⌘ and the mouse wheel over
them; the size is remembered on this machine, and a bigger thumbnail asks for a sharper picture. Every day and every jump says how many videos and photos
it holds. The pane's heading carries badges for the place — how many videos and photos — that show one
kind, the other, or all, the choice holding across the board; all is both side by side, videos in one
column and photos in the other, stacked on a narrow screen. A badge for a kind with nothing in it is
shown but cannot be chosen.

**Arranging and finding.** The pane's heading has one button per way of arranging the place — by jump,
by day, or as one list, whichever that place offers — so every choice is in sight and a single press
away. Each kind of place opens arranged its own way — Fresh files and a montage by jump, a dropzone
by day — and a choice made there is part of the folder's address, so it holds until another folder is
opened. Every list of files runs
newest first, the latest shot at the top — on the board, in what a place's folder on the storage holds,
and on a camera's page. A box in the same heading narrows what is drawn, matching either name a file
has; it changes only what is shown, so a jump with nothing matching drops out of view, the jumps left
keep their numbers, and the menu's counts still count everything.

**Selecting.** Looking at a file and picking it are different things, so nothing is picked by accident
on the way to looking. A click only previews: the file shows in the inspector and is marked as the one
being looked at, and nothing is picked — however many files are picked already. A file is picked by
its tick or by ctrl- or cmd-click, each of which also takes it back off; shift-click
takes a range, and with no range started it picks that file and starts one. ⌘- or ctrl-A picks every
file on screen that can move. Up and down move the preview, and with shift add to the picks. Escape
clears. A row's tick is always there; a thumbnail's
appears under the pointer until something is picked, then on every thumbnail. Picked thumbnails get a
green ring with a tick; picked rows a green tick and background. Picking is choosing what to move, so a
file that cannot move — on the storage, freed, or in a montage with an edit — has no tick and is never
picked, whichever way picking is asked for; one that stops being movable while picked, as when its
montage's editing project is made, simply stops being one of the picks. The picks — or, with none, the file
being looked at — are removed by button or Delete, and removing asks the same question every time,
wherever they are: **loose in Fresh files**, out of any jump and any place, or **into the bin**. Files
already loose in Fresh files have nowhere further back to go, so only the bin is offered. Nothing
moves until one is chosen, and Cancel leaves them where they were. A copy can only be taken out, its
original staying where it is, so it cannot be sent to the bin, and copies alone are removed without
asking.

**Filing.** Drag a jump or a selection onto a place in the menu to file it there, or onto another jump to
move it. Dragging is the way: there is no list of places to pick from. While something is carried, the
place or jump under the pointer lights up when it would take it. Something dropped on a destination is
followed there: that destination's page opens, with what was just filed in it. Dropping onto a montage
joins that montage, never a new one. A montage whose last files are taken back to Fresh files is left
with nothing, so the board goes to Fresh files with them.

**Making a montage.** A montage is named once, and naming is making. It is made from what is on
screen, beside its name: a jump from its panel, several picked files, or a single file from its own
panel — or from what is dropped on the _Montages_ heading, which asks for the name in a dialog of its
own. Asking comes first — the name only appears once asked for, starting from the jump's own name
when it has one — and the name is saved by Enter or the button; Escape or Cancel changes nothing. A
name that is already a montage's, however capitalised, says it will join that montage and saves the
name exactly as already written: the new jump is a jump of that montage, keeping its own times. Once
made, the montage's page opens and its entry lights up briefly in the menu. A montage whose name was
taken away stays visible under _No name yet_, which says how many are waiting for one.

Whether the files move or are copied is SkyDock's to decide, never a key held. **Files in Fresh files
move** into the montage: they belong nowhere yet, and a copy would leave them there still to sort.
**Files that already belong somewhere — a dropzone, another montage — are copied**, so that place
keeps its own, processed and uploaded as it was. The panel says so before anything is made ("copied,
Yverdon keeps its own"). A copy is a copy as in _Jumps_: it starts with the file's adjustments — its
trim, frame and turn — as they are, and from then on each side changes without the other, so
trimming the dropzone's file again leaves the montage's copy as it was. It is named after the montage
and costs no room on the disk. A file freed from this machine has nothing here to copy, and a montage
with an edit takes nothing in.

**Adding files from the computer.** A video or a photo from anywhere on the computer can be dropped
onto the board: onto a montage to join it, onto a dropzone to be filed there loose, onto
Fresh files to wait there, or anywhere on a place's page to go to that place. It is copied into the
originals under the day it was taken, keeping its name unless a different file already has it that
day. From then on it is a file like any other. Several at once go together, to the same place.

**A whole folder can be dropped** as readily as a file, and is not itself copied: every video and
photo inside it is, and inside the folders inside it, however deep they go. A card copied to the
computer, or a day's rushes in folders by camera, is therefore one drop. Whatever else is in there —
notes, projects, a camera's own bookkeeping — is passed over and left where it is.

**What is coming is said before it is copied.** A drop is worked out first, folders and all, and the
board then lists what is about to go into the originals, marks each one as it lands and shows how far
through it is — following the file being copied as its bytes arrive, not only the count of files, so
a single long clip is a bar that moves rather than one that waits. The file being copied has a bar
of its own beside the one for the whole drop, because a card of fifty clips moves the whole by a
fiftieth at a time and that reads as nothing happening. Once a file's bytes are in it is read, which
is quick beside the copy and is said as well, so a bar that has filled is never a bar with nothing
behind it. Nothing is asked and nothing waits on an answer: the list is there to be watched, the
way making the proxies and copying a camera off are. A drop holding nothing SkyDock can show says so
and copies nothing.

Footage already on the board is recognised by its contents, whatever the file is now called, and what
the drop means depends on where it lands. **Dropped on a jump while it is already in another one, it
joins this jump as well and stays in that one** — a briefing filmed once belongs to every passenger of
the day — and each jump holds it as its own, with its own trim, off the one original on the disk. An
edit on the jump it is already in is no obstacle, since nothing about that jump changes. Dropped
anywhere else it is a file on its own, so it moves there as a drag would have moved it, and one the
jump it is in will not let go of stays where it is with the reason said. Footage a jump already holds
is left alone. What is not a video or a photo is refused, and so is a drop on a montage that has an edit
or lives on the storage only. The board says what came of the drop, and a file nothing happened to is
not called a failure.

A file let go where nothing takes it — the header, the panel, the space around the work — is left
where it was, and the board says where it could have gone. It is never opened over the board: a
dropped video shown in the board's place is the board gone, and in SkyDock's own window there is no
way back to it. In that window a dropped file is taken where it already lies rather than copied in,
since the app and the machine it came off are the same one.

**Putting files in the bin.** Wherever it is offered, putting files in the bin is a red button with a
bin on it, so it is never taken for anything else. A test shot or footage of the ground can be got rid
of from wherever it is — Fresh files, a jump, a dropzone, a montage — when the bin is the way out
chosen for it on removing it. A file already on the storage is not the board's to throw away and never
goes. A file copied into a jump cannot go while the copy is there. Nothing goes without a warning first, saying how many files, how many videos and photos
and how much space, and that these are originals nobody has been given yet — if the camera card has
been wiped, the bin holds the only copy. Once confirmed, the files leave the board and the originals
folder, so a scan does not bring them back; the copies and proxies made from them are deleted, since
they have nothing left to come from. The files themselves are moved, not erased, into a folder of the
bin named for that moment — and for the montage or dropzone they came out of, when they came out of
one — keeping
the day folder each came from. A file put in the bin this way is
one nobody wants, so while its camera is plugged in it can also be deleted from the camera's card
(Seeing what is on a camera). SkyDock never empties the bin, so
nothing is lost for good and no space comes back until someone empties it by hand. The bin is a folder
of its own beside the work, apart from the originals and the delivered copies. Nothing is put in the
bin while something is being processed.

**Looking into the bin.** _Bin_, in the menu, shows everything in it — each time something was put
aside, the latest first, saying whether it came from Fresh files, out of a montage or a dropzone, or off a camera, and
when — with each
file's picture, name, time and size. Nothing can be deleted from there: the bin is emptied by hand,
from the machine's own folders, and the page says which folder that is. Picked files can be **brought
back to Fresh files**: each leaves the bin for the originals, under the day it was shot and never over
a file already there, and is scanned in as any new file is. One whose footage is on the board already
stays in the bin, and is named — bringing it back would make two of it.

**Merging and making jumps by hand.** Two jumps that are really one are merged by picking the files of
one — its panel selects them all in one press — and dropping them on the other's card; the jump left
empty disappears. The files keep their own times, so the merged jump is dated by its earliest file.
Two jumps can also be put side by side first: with one jump open, ⌘- or ctrl-clicking a second
opens the two next to each other, each playing its own clips, and from there they can be merged onto
the start of either, or onto a time typed in — for two cameras on one jump, one of them on the wrong
clock. Each side is worked through from the keyboard as any list on the board is: up and down move
along its files, Enter takes the one they are on, and left and right go to another jump on that
side — never to the one the other side is already showing. Moving and taking are two things here,
since taking a file plays it. Every time in there is said in full and to the minute, the day
included: the clocks being compared are the whole point, and the seconds between them were never
what anybody was reading. The other way round, several files picked in Fresh files — loose, or
taken out of a jump — can be made a jump of their own, or a montage, each by a button of its own that
does only that. Making a jump asks only when it started, since files the gap rule missed are often
files off a camera on the wrong clock: the start is filled in as shot, and setting it moves every file
by the same amount, as correcting any jump's time does. It has no name — a name in Fresh files is a
montage's — and the start can be left as it is. Making a montage asks for its name, as it does
anywhere else (Making a montage). The new jump is selected as soon as it is made, its
panel open, so whatever is done with it next is a single press away.

**Work shown as it happens.** A file being processed, a clip whose proxy is being made, and a clip
whose jump is being found, shows how far through it is on the file itself — a bar and a percentage where its status stands, on a row and on
a thumbnail alike — moving as the work goes, with nothing reloaded and nothing asked: the board keeps
one line open to the machine and hears it. A clip is flagged as having its proxy the moment it lands.
A board opened, or reconnected, in the middle of a run starts with what is already under way. The
figure is a percentage of what is being written, so a trimmed clip counts against its trim — or, while
a jump is being found, of the clip being read through. Finding it never holds up the rest of the
board: the clips are read one after another in the background, and the board goes on answering. This is
only ever for the eyes: what a file _is_ still comes from what the board is told when the work ends,
so a figure that never arrives costs a bar that lags and never a wrong status. Work started from the
command line is not heard, only work the board started.

**A finished render is noticed.** The film is rendered in the editor, and nothing tells SkyDock when
it is done, so while a board is open the montages' folders are looked at every couple of seconds. A film
that has stopped growing and can be read is told to the board over the same line: the Rendered step
ticks by itself and the board says the film is ready to upload, with nothing pressed. A film still being
written, or one that sits still but cannot yet be read, is not a film yet. It is the film under the
name SkyDock gave the montage that is watched; one rendered under another name is taken as the film
when the montage is uploaded. A project saved or removed by hand is noticed the same way. Freed
montages are not looked at; nothing of them is here.

**The header** holds what applies to the whole board: scanning, the editing templates, how many clips still wait for their proxy, the storage — whether it is connected, as whom
and to what, a way to check what it holds now, and a way to disconnect — rows or grid, and light or
dark. The storage is named the way somebody would say it, who and where: the account the session was
opened with, and the machine's name without the scheme or the port it is reached on, which are how a
machine reaches it and not something to read across the top of a screen. The settings that are chosen
once and then only glanced at — rows or grid, light or dark, checking and disconnecting — are marks
rather than words, each still answering to its own name. Disconnecting asks first: it changes nothing
on the storage and nothing on this machine, but connecting again wants the password and, where the
account has two-step verification, a code — a poor thing to have to find because a mark was clicked
by mistake. It also warns
when the disk the work is on runs out of room — almost full under five gigabytes left, saying how much,
and full under one, saying that copying a camera, making proxies and saving will fail — and follows the
disk while the board is open, whatever else on the machine is filling it. With nothing scanned yet, the board is a
single Scan button and the instruction to copy the cameras first.

**Light and dark.** The board follows the machine by default and can be pinned light or dark. The
choice is remembered on that machine and applied before the first thing is drawn.

**How big it is drawn.** SkyDock's own window zooms the way a browser does — ⌘ or ctrl with + or −,
or the wheel — so a board read from across a packing hall is read at the size it needs. It scales
the whole of it, so the layout answers to the size it is drawn at rather than being stretched. A
size that should hold from one day to the next is written in SkyDock's settings file instead, as a
factor or as the percentage anybody would say out loud, and the window opens at it.

## Cropping and turning

A file is opened by double-clicking it, from the inspector, or with Enter on the file being looked at,
playing its proxy when there is one. A clip the window cannot draw — 4K HEVC, as a DJI or a recent GoPro
shoots — says so in place of its picture until its proxy is made, and then plays the proxy without being
opened again. A window that cannot play H.264 — the format proxies are made in — can show no clip at
all, and says so. Space plays a clip and pauses it, whichever button was pressed last.

**Full screen.** The picture takes the whole screen on its own — the button, F, or a double-click on
it — with the window's own player under a clip so it can be watched rather than dragged, and the
photo at its own size. There it shows the file itself rather than the small copy the timeline
scrubs, since judging a picture by a copy 640 across is judging the copy; a clip this window has no
decoder for falls back to that copy and says so.

**In the machine's own player.** A clip can also be handed to whatever plays videos on this machine,
which opens it as it was shot whatever the window can decode — one button, the file itself, nothing
copied or converted first. A file this machine no longer holds is not offered: it is on the storage,
and plays from the storage's own list. Escape comes back to the dialog, at the same moment
of the clip. Nothing is decided there: the rectangle and the marks are for the dialog.

The picture fills the left of the dialog
with the timeline under it; the right side says what is being decided: the trim, the turn, the frame,
and what is already on the file. The top names the file and lets you step to the next; the bottom holds
Save, offered only once something changed, and Reset, which clears everything at once. A loose file is
cropped the same way as one in a jump, with no jump to give its frame or turn to.

**Trimming.** A clip already trimmed opens where its trim starts, which is the moment the copy made
from it begins, and stepping to another clip opens that clip on its own trim, frame and turn — never
those of the one just left. Dragging along the timeline moves the picture with the pointer, the frame following as
fast as it can be drawn and never left stuck when the pointer stops. Drag the ends of the timeline, or
set the start and end at the playhead. Either end on its own is a trim: an end with no start runs
from the clip's beginning, a start with no end runs to the clip's end. Trimming moves no
pixels: the clip is copied with its ends cut off, losing nothing.

**Framing.** A mount, a strut or a finger in a corner is cut away by dragging a rectangle over the
picture: what is dimmed goes. The rectangle keeps the shape the clip already has unless another is
chosen, so a 16:9 jump is still 16:9 when handed over, and what is left is put back to the size the clip
came at, so a 4K clip stays 4K. Set on one clip, the rectangle can be given to every clip in the jump in
one press. How much the rectangle keeps is said as it is dragged, in percent — across and down on the
rectangle itself, and with the share of the picture beside it — and the trim says the share of the clip
it keeps the same way. Opened again, a clip shows its rectangle where it was saved, with its shape marked as the one
chosen; each clip opens on its own shape, never on the last one's. Photos have no frame.

**Turning.** A camera mounted sideways or upside down is put right a quarter or a half turn at a time,
clockwise, by button — R turns a quarter — or back to as shot. The picture on screen turns with it and takes the shape
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

Each dropzone and each montage offers its next step, always in the same place, and never out of order.
A dropzone is **processed**, then **uploaded**, as a whole. A montage is **processed**, then given an
**editing project**, then **uploaded**: the upload opens once there is a project, and sends nothing until the
film is rendered. Freeing space is offered beside the upload once there is something to free.

**A dropzone's step stands beside what it deals with**: in the row that says what the folder still
owes — so many to process, so many to upload, so many on the storage — and not among the ways of
looking at the folder. It says how many it will take, and it means every file in the folder that
needs it: never the ones a search or a filter happens to be showing, and never a selection. A folder
holding a day nobody is looking at is a folder whose day is processed all the same.

**Processing** runs on the machine, not in the page: closing or refreshing the page does not stop it,
and the board stays usable meanwhile. A page opened while processing runs says so and updates itself
when it is done. One processing runs at a time; asking for another is refused. What is being processed
can be cancelled from where it was started: the file under way is dropped rather than left half written,
nothing more is started, the copies already finished stay on the disk, and nothing of the run counts as
processed, so processing again takes it up. Edits made meanwhile are
kept, and a jump changed while its copies were being written is not marked processed.

**Nothing is uploaded until everything in it is processed**, and what is waiting is said plainly.

**The film.** Once rendered, the film shows above its montage: its name, how long it runs, its size, and
when it was rendered. It can be watched there or opened on its own, so the render is checked before it
goes to anyone. A film rendered again is the one that plays. Once the montage is uploaded, what went up
is shown in its place.

## File status

Every file is in one of three states, each of which SkyDock can verify:

```
                  process                     upload
   local ───────────────────────▶ processed ───────────▶ uploaded
     ▲                                  ▲                    │
     │   its copy is gone, or what      │   the storage was  │
     └── it was made from changed ──────┴── asked and has ───┘
         (the board says "changed")         it no longer
```

- **local** — nothing current has been made from it. Either it was never processed, or it was cropped,
  turned, re-timed or replaced since. The board shows the second case as **changed**, because "never
  processed" and "processed, then altered" are different situations to be in.
- **processed** — a copy exists that was made from the file exactly as it is now.
- **uploaded** — that copy is on the storage, proved by matching checksums on both sides. A file that
  went up inside an archive counts as uploaded while the archive is there.

A file freed from this machine reads as uploaded, since the storage is where it now is — and only for as
long as it is gone. Being freed is the file not being here, never a mark it carries about: one back on
this machine, however it came back, is read like any other. A jump that was freed stays freed, since
what was made from it and delivered is gone all the same.

**Footage that is nowhere is not listed.** A file freed from this machine has no original and no copy
left here. If the storage is then asked about it and answers that it is not there, nothing of that file
exists anywhere: SkyDock forgets it rather than offering a row that cannot be opened, prepared,
uploaded or freed. The jump it was the last file of goes with it, unless the storage still holds what
was delivered of that jump — a montage's film outlives the rushes it was cut from. This takes away a
record, never a file, and only ever with the storage's own answer in hand: a folder that was not
listed, a call that failed, a file of another size, or an original still on this machine all leave
everything as it was. It happens when the board is opened, silently.

**Uploaded is the end of editing.** SkyDock cannot take an old copy back from the storage, so a file
that has gone up cannot be cropped, turned, re-timed, moved or renamed here — the page hides the
controls, and the app refuses the change. It shows a lock and says why; the way back is to remove it
from the storage, over there.

**Being listed can take a claim away, never grant one**: only an upload, which compares checksums,
marks a file uploaded; and a folder that was never listed, a listing that failed or a size the storage
would not report demote nothing (Principles).

## Network storage

**Connecting.** The storage is reached with a hostname, username and password, entered once. The
session is kept and renews itself from the stored password when it expires. The password is kept
encrypted and the plain one is never written down. Asking to upload while disconnected opens the login.
An account with 2-step verification is asked for its code when the storage wants it, in the same
login, with what was already typed kept. Logging in with the code has the storage trust this machine,
so the session goes on renewing itself without a code, as for any account. Logging in again after the
session lapsed keeps this machine's trust; disconnecting forgets it, so a 2-step account is asked for
its code again. Each place keeps its own folder either way.

**Folders.** Every destination is connected to a folder of its own on the storage, browsed and picked
from the app, on the place itself — or from a montage's upload, for a destination something is put
in. There is no folder for everything else, because there is nothing else: whatever is uploaded goes
into a destination. A montage's originals go where its upload puts them, never shared, so keeping
unedited footage out of a passenger's reach is a matter of which destination it is put in. Nothing is guessed: a place without a folder has nowhere to upload into until one is
picked for it, and the header carries only what is about the storage as a whole.

**A place is connected to its folder.** A dropzone's page and a montage's page each end with what
their folder on the storage holds — the very folder their uploads go to, and for a montage already
uploaded the one it actually went to — so what is up there is listed, and watched, from the board
whether or not any of it is still on this machine: a freed montage, last month's days at a dropzone.
Each file says what it is, how big, when it was shot — read off its name, which SkyDock gives every
file it delivers, since the storage's own date for anything sent before files kept theirs is the day it
was sent — and whether it is here too or only on the storage. A file SkyDock did not name shows when it
was put there instead, and says so.
A video or a photo is played by clicking it, streamed from the storage through the board, so a film is
scrubbed without being downloaded first; an archive is listed and not opened. The storage's list of
montages lists and plays each montage's folder the same way, including ones this machine never held,
without saying which files are also here. All of it only reads what a folder holds: nothing is
fetched, and only files inside the folders SkyDock uploads into are ever opened.

**Files keep their date.** Every file is sent with its own date — the one processing stamped on it,
which is when it was shot — so the storage lists and sorts it by that, not by the day it went up.

**Uploading a dropzone.** One upload covers the whole dropzone — every jump filed there and its loose
files — sending the folder whole. A montage cannot be uploaded this way, because its files go to two
places; asking is refused and says why.

**Sending what changed.** A file with the same name and size on the storage is checksummed on both
sides and skipped only if they match. Anything uncertain is sent. A file whose name is already taken
up there by different bytes — a clip prepared again after its trim was put right, a film rendered
again — is not written over: what is there is moved into a bin on the storage first, beside the
folder it was delivered into, under the moment it was replaced, and SkyDock never empties that bin.
If the storage will not move it aside, the upload stops there and says which file; what was already
sent stands. The board reports what is happening throughout: how many files are being checked, which
one is being sent and how far it is, and how many were already there.

**One upload at a time, shown wherever you are.** Only one upload goes at a time — a dropzone or a
montage — and while it goes no Upload is offered anywhere, each saying what is being uploaded. It is
shown in the corner of the board, whatever page is open, in the same panel as files being copied in
and a camera being copied off:
every zip as it is made, then every file going to every folder up there, each marked waiting, being
sent with how far it has got, sent, or already there. The upload belongs to the machine, not to the
page: leaving the page, making another change meanwhile, reloading or reopening the window neither
stops it nor offers it again — the board shows it still going and updates itself when it ends. Each
panel in the corner can be folded down to its title and how far it has got, and opened again.

**Cancelling an upload.** It can be cancelled at any moment from that panel, with nothing to confirm,
since nothing is lost: the file being sent is cut off, nothing more is sent, and nothing of the upload
is recorded — no file reads as uploaded, no link is kept. What had already gone up stays on the
storage and is found there by the next upload, which does not send it again. A zip that was being made
is thrown away, never left where it could pass for a finished one.

**And the same footage under another name.** Every name changes on the way out, and the same footage
is delivered under a second name often enough: a clip whose time was put right, a montage renamed,
a jump filed to another dropzone. The storage keeps a list of what it holds and, for what SkyDock sent, where it came from, so
that footage is recognised whatever it is called and whoever put it there — and what happens then depends on where its twin
is. Already in the folder this one is going to, there is nothing to do: it is delivered, and counts
as uploaded under the name it has there — but only when that folder, listed for this upload, shows it
there at that weight. The list remembers what was put up once; the listing says what is there now, and
a file somebody deleted up there by hand is sent again. In another folder, that is another delivery and this folder
has to hold it too — a renamed montage must not be handed a link to an empty folder — so the
storage copies it to itself, and nothing travels from here. A copy the storage will not make is sent
the ordinary way. The same original cut differently is other footage, and goes up as such. Nothing is
read for any of this unless the list says the storage holds something from that original, and a list
that cannot be read sends the file rather than skipping it.

**Where each file came from.** The list is one small file, kept in the folder that holds the places'
own folders — never inside one of them, which a montage's link opens, and not at the top of a share
beside everything else kept there. Where that is is worked out once, from those folders, the first
time the storage is used, and kept with the connection: a place added later, whose folder sits
somewhere else, does not move it, since a list that moved would start again empty. A list found where
it was kept before is read from there, and moved to where it now lives the first time it changes. It
is read before an upload and written after it, keeping every entry it did not make — another
machine's included — and a list that cannot be read is never written over. If it cannot be written,
the upload still stands and the board says the list did not follow.

**The storage's own listing is the truth; the list only remembers.** It saves reading a file again
and reaches folders this machine did not list, but it never says a file is up there that the storage
does not show. Whenever a folder has just been listed — before an upload, or when the board opens —
whatever the list says of a file that folder no longer holds is forgotten. A folder that was not
listed is left as the list has it, and a folder the storage would not list is never taken for an
empty one: nothing is forgotten, demoted or sent on the strength of a listing that failed.

It also holds what SkyDock did not put there. A place can be pointed at a folder that was full of
footage long before SkyDock saw it, and the board asks the storage what is in those folders every
time it opens, so what is found is written down: the file, and what it weighs. Nothing is fetched and
nothing is hashed for that, and a list that would say what it already says is not written again. A
digest is asked of the storage only when it would decide something — a file about to be sent weighs
exactly what one of them weighs — and the storage hashes it on its own side, so nothing travels; the
answer is kept, and the same question is never asked twice. A folder becomes known that way, a file
at a time, as knowing it becomes worth anything. Each delivered file also carries its origin inside
itself, written where the file keeps its own notes, so a copy that leaves SkyDock can still say what
it was made from. Originals never carry it: what proves a file against a camera is its bytes, and a
note would change them.

**Share links.** A folder's link is reused while it works, so uploading again does not change the link
somebody already has.

Any one file on the storage can be handed out by a link of its own, from the row it is listed on: one
jump somebody asks for, a single photo, the film alone, without giving away the folder around it. A
live link the storage already has for that file is handed back rather than a second one made, and an
expired one is no link at all. The link can be copied from the row, and taken away again from the
same place — which takes nothing off the storage. Only a file in a folder SkyDock delivers into can
be given one: a link is a way in, and anybody holding it fetches that file without a password.

**Noticing deletions.** SkyDock looks at the storage when the board opens, when a place is opened,
right after an upload, and when the check button is pressed — never on a timer. A file it can no
longer find stops counting as uploaded and is ready to be sent again; the local file is untouched.
Between those moments the board says what it last proved.

## Where the jump is in a clip

```
  in the plane │  freefall  │ opening │   under the canopy   │ ground
  ─────────────┼────────────┼─────────┼──────────────────────┼────────
             door        opening   canopy                 ground
         weightless   the first  flying              the last second
         for seconds     tug     overhead            heavier than a ride
```

A clip off a camera that records what it felt — and the cameras here do, a GoPro two hundred times a
second and a DJI once a frame — has its jump found in it: the door, the opening, the canopy and the
ground. Leaving an aeroplane is a few seconds of weightlessness and nothing else is, so the exit is
never in doubt, though a camera held out on an arm feels the arm as well as the flight and what is
asked of them allows for that. An opening is a deceleration that lasts and has a gravity held steady
after it, which is what tells it from a jumper tracking or head-down; it is marked twice because a film
wants both ends of it.

Every clip is asked once, in the background, off the original — a copy keeps the picture and the
sound, not what the camera felt. Most clips have no jump in them: a clip shot on the ground, one
that never left the plane, one off a camera that measures nothing. Saying so is the answer, kept so
that nothing is asked twice, and it is never made up.

A jump is cut around those moments, and what SkyDock finds is a starting point, shown where it can be
seen and corrected, never a decision taken silently. A jump runs door, opening, canopy, ground, and a
mark moved out of that order is refused — one of the two is wrong, and only the person moving them
knows which. A mark says when the camera's own wearer left the plane, and a cut does not always start
there: a montage is the subject of its own film, so its cut starts at the instant itself, while a fun
jump is filmed by somebody who goes out after the group, so its cut starts a second earlier. Moving a
mark moves the measurement; the second's lead follows it.

## The jump on a graph

A clip being looked at is drawn as well as marked: the force its camera felt, from the first frame
to the last, with the parts of the jump shaded behind it — the plane, freefall, the opening, the
canopy ride, the ground — and the marks in their places. The measurement is drawn as it stands and
the jump's shape over it, since freefall buffets a camera hard enough to hide the shape of anything.
It is tied to the frame on screen and dragged like the timeline: a point dragged along the graph
moves the footage to that instant, and the graph reads out what that instant weighed and which part
of the jump it belongs to.

How high and how fast are drawn beside it whenever a camera wrote them down, in metres and kilometres
an hour. Only satellites know either, so a camera with its receiver off, or without one, says nothing
and the graph says so rather than drawing a line from nothing; a stretch where the receiver lost the
sky is a gap in the line, never a line ruled across it. Neither is ever estimated: an invented line is
worse than an absent one. The drawing is read off the original when the clip is opened, and nothing
about it is stored.

## The editing project

A processed montage can be turned into an editing project, made from a copy of the chosen template
and named after it. The template is taken exactly as its owner made it: every track, title,
photo and piece of music stays where it is, and nothing in it is moved, cut or faded — and nothing is
added to its timeline either, so the tracks the editor finds are the template's own. The montage's
videos wait in the project's bin, in the order shot, and the person editing drags them onto the
template's tracks: where each clip goes in the film, on which track, and how it opens and closes, is
their decision. A montage with no video at all — a camera that died, or only stills taken — is still a
film to make, of its photos: they wait in the bin instead, in the order shot, each a five-second still
as kdenlive makes one, to be stretched or cut on the timeline. Crops and turns are already applied, each clip playing
from its proxy with the real clip recorded as what the edit is of, so the editor opens ready to work and
renders from the footage. The film's destination and format are filled in, so what is left is the edit
and pressing render — and the format asks for the graphics card's own encoder, since a delivery film is
encoded once and watched, never encoded again. A machine whose editor has no such encoder is shown its
own list instead.

**The project waits for the proxies.** The editor opens on them, and a project made before they exist
opens on the full clips — the slowest way there is to edit. So it cannot be made while any clip in the
montage is still getting its proxy: the button says how many it is waiting for, and the machine refuses
it too. A clip whose proxy was tried and could not be made does not hold it up — it is settled, and
opens as it is — and the board hears of that the moment it happens. A montage processed before its
proxies existed has them cut when the project is made, the same way processing would have.

**The jump is marked on the clip, never cut into it.** Every clip in the bin is whole, and one with a
jump in it carries the jump's moments as markers of its own — the exit, the opening, the canopy and the
ground, named as the board names them. A marker only says where the door was left, and saves the
scrubbing that finding it costs. They are the clip's own, so they come with it when it is dragged onto
the timeline and travel with it however often it is moved, trimmed or cut; they are never laid along the
timeline, where a mark stays behind the moment the clip it was about moves.

**Making the project opens it.** Writing the project and opening the editor are one press, and a montage
with a project offers a way back into it. Which command opens the editor is told to SkyDock when it
starts. When the editor
cannot be reached from where SkyDock runs, the board says so and still names the project's path, which
copies when clicked. A project that would not open is refused with the reason.

**Templates.** A template is a folder holding its project and the music, logos and title images it
uses, referenced where they are. Bringing those files along is the template owner's part: a project
that names them by paths relative to itself finds them wherever the folder goes. A template that travelled from another machine still finds its files.
A template missing some of its files still gives a project, and the board names what is missing
straight away. **SkyDock ships with none**: a template is somebody's branding and somebody's music,
and neither is ours to hand out. Until one is brought in there is nothing to make a project from, and
pressing Make the project says so and names where to put one.

**Choosing one.** A template is somebody's branding, so which one a project is made from is never
decided for the person — but it can be settled once. Any template can be marked **the usual one**,
and from then on a project is made from it without anybody being asked, however many there are; the
mark is taken off the same way, and a project made from the command line follows it too. Until one is
marked: with a single template that is whole, pressing Make the project simply uses it; with several, the
templates are shown to be chosen between, and nothing is made until one is, with the one picked last
time already ticked and still to be confirmed. A template with a file missing is shown
first even when it is the only one. Each template says which kdenlive wrote it, which is shown beside
its name and left at that: nothing is graded against the editor's own version.

**Bringing one in.** The header's Templates lists them and takes a new one from the computer, in
whichever shape the editor left it: **the whole folder**, which is what Archive project writes when
it copies — the project with its sounds and images in folders beside it — or the one archive, when it
was packed as .zip or .tar.gz, or the project and its files picked one by one. A folder is taken as
it stands, each file keeping its place inside it, and the folder itself is what the template is named
after. Either way it is laid out aside and only given its place once a project is found in it, so
nothing half-arrived is ever left behind; anything naming its way out of the folder is refused.

**Its files are then its own.** A template is made on somebody's machine and names its music and its
logos where they sat on that machine, so on the way in every file the project names is looked for
among the files that came with it and written back as the way from the project to that file. The
template then says where its files are in its own terms, and goes on saying it wherever the folder is
copied afterwards. What nobody brought in is left exactly as the project wrote it and named as
missing: the template is kept either way, since an edit can start without the music.

It is named after the project unless given a name. **Brought in again under a name already there it
replaces what was there, files and all** — an import is a whole template, and half of an old one
mixed with half of a new one is nobody's.

**The project is made once.** Asking again for a montage that has a project is refused.

**An edit freezes the montage.** The project points at the montage's copies by name and at moments inside
them, and lives in the folder the montage's name makes; a change to any of that would break it
silently. So once a montage has a project, what decides those names and which files there are is fixed:
no trim, frame or turn, no file in or out, no re-timing, no new name, no other jump joining the
montage. Its files show a lock and say why. Previewing, opening the project and uploading go on.
Changes are made in the editor. Resetting the montage, or deleting the project, lifts the lock.

**The edit is kept aside, every version of it.** Before SkyDock does anything to a montage that could
stand between the person and those hours — preparing it again, resetting it, deleting it — the project
as it stands is copied into a folder of kept edits, under the montage's folder name and the moment
it was kept. What is kept is what changed, so pressing the same button twice leaves one version rather
than two, and nothing there is ever deleted, not even when the montage is: a project is a few hundred
kilobytes beside the gigabytes it describes. It also travels with every backup, whatever else was
chosen to go — the edit exists nowhere else, and a tick nobody remembers is no protection at all.

**Preparing it again is allowed.** Preparing writes the copies and nothing else: the project, the film
and the archives are left exactly where they are, and each copy keeps the name the montage and the
clip's own time give it — the name the project calls it by. So a montage with an edit can be prepared
again from its originals whenever what is on the disk is not what it should be. What changes is what
those copies hold, so a clip whose trim was corrected comes out a different length and its place on the
timeline may want a look; that is the editor's to judge, and an afternoon lost to a correction nobody
can apply is worse.

## Taking a montage back

A montage can be **reset** or **deleted** from its page. Either applies to the whole montage, because
one name is one folder, and each asks first, saying what goes and what stays, naming the edit on
its own when there is one.

Both delete the same things here — the copies, the working copies, the project, the film, the archives,
and the record of what was uploaded. They differ in what they leave behind.

|                                 | The montage's name | Crops, turns, corrected times | Its jumps                                     |
| ------------------------------- | ------------------ | ----------------------------- | --------------------------------------------- |
| **Reset**, to before processing | kept               | kept                          | kept, still a montage                         |
| **Delete**, undoing the montage | forgotten          | forgotten                     | loose in Fresh files, on their cameras' times |

Reset is how an edit is started over. Delete works at whatever step the montage has reached — named,
processed, edited, rendered, uploaded or emailed — and is offered on the montage's own panel as well as
on its page; regrouping puts its files back into jumps. Only a freed montage cannot be
deleted: nothing of it is left on this machine to put back.

Neither touches the originals or the storage, and neither can run while the montage is being processed.

## Uploading a montage

A montage belongs to no destination, so uploading it says where each thing goes. It has four parts to
send, each taken whole and never file by file: its **original videos**, its **original photos** as
prepared, **the montage** itself (the rendered film), and **the kdenlive project**. A part the montage
does not have — no photos, say — is simply not offered. Uploading is two steps, in one dialog, and
nothing is sent until its own button is pressed.

**1. Make the zips.** Each part is dragged onto a zip, and a part
dropped on the empty space makes a new zip. **The same part can go into several zips**, and each part
says how many it is in. Every zip shows exactly what is inside it, as it will be laid out: the
videos under `videos/` and the photos under `photos/`, each with its first files named, and the
project and the montage at its top. A part can be taken out of a zip, a zip left empty goes, and a zip
can be removed. Making no zip at all is fine.

A zip is named `<name>_<date>_<time>.<ending>.zip`: the ending is chosen for each zip, made of
lowercase letters, digits and dashes, and no two zips end the same way. One zip can be given no ending
at all, and is then `<name>_<date>_<time>.zip`. A new zip ends with the part
it was started with. The date and the time are when the montage's first jump started. The project
names the clips where they sat when the edit was made, so from a backup it reopens only with them put
back there.

**2. Where it goes.** Every zip, and every part as it is, is listed with its whole name, never cut
short. Beside them are the destinations something is already in; any other is added with **+ Add a
destination**, and one can be left out of the upload again, taking out whatever was in it. As they
are, the videos go as the files of a `videos/` folder, the photos of a `photos/` folder, the montage as
`<name>_<date>_<time>.mp4` and the project as `<name>_<date>_<time>.kdenlive`. Each is dragged onto one
destination or more — several at once when they are ticked. **The
same item can go to several**; it is built once and sent to each. Each destination shows exactly what
will land in it, as a tree from its folder on the storage, and anything can be taken out again before
sending.

In each destination the items land either **straight in its folder** or **in the project folder**
inside it. The project folder is one name for the whole upload, made of lowercase letters, digits and
dashes — what is typed is made into one, so "Boogie 2026" is `boogie-2026` — and starts as the
montage's name made that way. A destination holding the montage as it is gets a share link on where it
landed, which is what is emailed; the others are never shared. An item put nowhere stays on this
machine, and the dialog says so, except a part that goes up inside a zip. A destination without a
folder on the storage has its folder chosen from there.

What was made is **remembered on this machine**: the next montage opens with the same zips, each item
where it went last time, and each destination straight in its folder or not. A destination remembered
that has since been removed or renamed is simply left out. The very first time,
the zips go to a destination called Backup when there is one, and nothing else is put anywhere:
where the film and the photos go is the club's to choose. The project folder is
this montage's own.

**Refusals**, each named: no name; files still to process; no film yet, naming the film looked for; a
film still being written; nothing put anywhere; a destination with no folder on the storage; another
upload going, naming it. A montage
with no video at all is uploaded without a film. A film rendered under a different name, when it is
the only one there, is taken as the film, and goes up named after the montage.

Uploading again after a re-render sends what changed and leaves the rest. A zip holding exactly what it
should, newer than everything in it, is not built again. The film is taken on trust: nothing checks
that it was rendered from this project.

## Freeing space

Once a montage is uploaded, everything of it on this machine can be deleted — originals, copies, working
copies, film and archives — leaving only the project and the record of what went where. It asks first,
and deletes nothing until all of this is proved:

- every file that went up has the same checksum here and on the storage as when it was sent — where it
  went to several destinations, the first is the one proved;
- the original videos went up, in a zip or as they are: a zip holds exactly what that zip is made of,
  laid out as it was, none of the originals changed since — a project in it may have been saved again
  since, because freeing keeps the project here anyway. A montage whose originals were never sent
  cannot be freed, since nothing then keeps them;
- the film went up, as it is or in a zip;
- the photos are exactly what their zip holds, or each went up as it is;
- nothing about the montage changed since it was uploaded.

If any check fails, nothing is deleted and each failing file is named. The storage must be reachable.
Only a montage of a single jump can be freed.

A freed montage lives on the storage only. The board says so once, with how much room came back. It
reads as uploaded, shows what the storage holds instead of its files, and cannot be processed, edited,
reset, deleted or uploaded again from here. A scan keeps it as it is. If something of it later
disappears from the storage, the board says so, as for any uploaded montage.

**A dropzone is freed the same way**, from its page, once some of it is on the storage. What goes up of
a dropzone is its copies, never its originals, so what is proved is the copies: each one hashed here
and by the storage, both matching what was sent. Then each copy, the original it was made from and its
working copies are deleted. A jump is freed whole, once every file of it is on the storage; one with a
file still to upload stays as it is, and so does a loose file not uploaded yet. The dialog says, before
anything happens, how many files went up trimmed, cropped or turned: for those only the delivered part
is left anywhere, and what was cut off goes with the original. It says how many jumps and loose files
stay, too. If any check fails, nothing is deleted and each failing file is named; the storage must be
reachable. An original another jump still holds stays until that jump is freed as well.

**Asked for, it comes back.** Freeing is deliberate, and nothing undoes it by itself: plugging the
camera in again passes the file over, and a scan leaves it as it is. It comes back only when somebody
asks for that file — off the card it is still on, from its page there, or fetched off the storage from
the list of what the folder holds. What comes back rejoins the jump it was in, by what it contains
rather than by what it is called, and stops reading as freed; its delivered copy went with the
freeing, so it is a file to prepare again. What the storage holds is not always the original: a
montage's originals go up as themselves and come back whole, while a dropzone only ever sends copies,
so what comes back from one is the delivered copy, already cut — and then the trim, the frame and the
turn are cleared rather than applied to it twice. The board says which of the two it was.

Once freed, a jump or a loose file leaves the dropzone's own list: it is named and played from the list
of what the folder holds, under the dropzone's files, and saying it twice would only add a row where
nothing can be done. The page and the menu then count what this machine holds, so what there is to work
on is read at a glance. Neither is processed or uploaded again, and the name a freed file was given
stays taken, so nothing is ever delivered over it. A montage is not narrowed this way: its card
follows it to the end, and a freed one goes on showing what the storage holds of it.

## The storage's list of montages

The storage holds a list of every montage uploaded, kept in the same place as the list of where each
file came from — a montage goes into any destination, so the list belongs to none. It says who it
was for, the day, how many videos and photos, when it went up, its share link, where its film, photos
and backup are, whether it was freed, and whether its link was emailed and to which address. A montage
is known on it by the folder its film went to. A list kept somewhere else before the lists' place was
fixed is read from there until the new one is written, and is then put in the storage's bin, so
nothing listed there is lost and there are never two lists telling different stories. _On the
storage_, in the menu once the storage is connected, shows this list, so every montage the storage holds is there, including
ones this machine no longer has and ones uploaded from another machine. Each can be emailed from there,
and one still on this board can be opened.

**What the storage says for itself is asked of the storage.** The list keeps what the storage cannot
say — who a montage was for, whether its passenger was emailed and at which address, that it was
freed, which files it was made of. Whether its folder is still there and whether its link still works
are asked of the storage each time the board opens and after every change to the list. A montage whose
folder is gone is shown as no longer on the storage, and one whose link was revoked or has expired as
having no link; neither offers what is not there — no link to copy or email, no folder to watch — and
neither is taken off the list, the only place that says it was emailed or freed. A question the
storage did not answer takes nothing away.

**Putting a forgotten montage back.** The list also writes down which files each montage is made of — each
by what it contains, which is how a file is known whatever it is called — and the times they were given.
A board scanned again from nothing gives every file that same identity, so a montage on the list whose
files are here, waiting to be sorted, is offered back where the list names it, one at a time or all at
once. It comes back named, at the times its files had, and waiting to be processed: what was made from
it is not claimed back, since uploaded is only ever said of a copy proved on both sides, and uploading
again skips what the storage already holds. Files somebody has filed since stay where they were put; a
freed montage has no files here to find; one only partly here is restored with what there is, and says
how many. A montage's two jumps share one entry, which keeps the files of both.

The list follows the work and never replaces it. It is updated after every upload, every freeing, and
when the email is marked as sent. Each change reads the latest list first and alters only its own
montage, so several machines keep each other's entries. If the list cannot be written, the upload still
stands and the board says the list did not follow. A list that cannot be read is never written over.

## Sending the link

Once a montage has a share link, its page offers to email whoever it is for, and freeing a montage
opens the email straight away. The email is written already, in French, for a tandem passenger — the
film a montage is most often made for: it greets them by the first word of the montage's name, says
what is ready and from which day, and has one button to the folder with the link repeated as text. It is shown exactly as it will arrive, and the message and the signature are written in
it, where they stand, with **bold**, _italic_, lists and links from a small toolbar. What is typed or
pasted keeps only those — paragraphs, line breaks, bold, italic, lists and links to a page or an email
address — and loses everything else, so text pasted from a document or a web page brings its words and
never its fonts, colours or anything that runs. The heading, which is the subject, the button and the
link cannot be written over. The signature is the club's, remembered on this machine for every email.

**The email template.** Every passenger's email is drafted from the club's template, written once in
the same way — its subject and its message — and remembered on this machine. The words that change
are written as variables, filled from each montage: `{prénom}`, `{nom}`, `{montage}` (the montage's
name), `{date}` (the day of the jump, in words), `{contenu}` ("Ta vidéo et tes photos", as there are),
`{prêt}` ("est prête" or "sont prêtes", agreeing with it), `{vidéos}` and `{photos}` (how many, empty
with none) and `{durée}` (how long the film runs, empty with no film). While the template is written
its variables are shown as such, and each can be put in where the caret is, from a list that also
says what it would be for this montage. A line whose variables are all empty for a montage is left
out of its email, so "Ton film dure {durée}." never reaches someone with photos alone; a name that is
no variable stays as typed, braces and all, so the slip shows. Leaving the template drafts this email
afresh from it; the first template can be put back at any time. Changing one email never changes the
template.

SkyDock sends nothing itself and needs nothing set up. One press copies the email, laid out, and opens a
new message — in Gmail or in the computer's own mail program, whichever was used last — with the address
and subject filled in; the email is pasted in and sent from there. The email, the subject and the link
can also be copied on their own. The link always comes from what the upload recorded. Marking the
email as sent records it on the storage's list, and can be undone.

## Not built

Worth knowing, so nobody goes looking:

- **SkyDock never sends email.** A person sends it from their own mail.
- **Every photo is handed over.** There is no choosing which photos go into the archive; the
  montage takes the videos only.
- **Nothing renders the film.** The editor does, by a person's hand; SkyDock only notices.
- **Nothing is ever doubled on the disk.** A clip copied into another jump is still one original; each
  jump it is in makes a processed copy of its own from it.
- **A dropzone can be created, not renamed or removed.**
- **Nothing comes back from the storage on its own.** Its list of montages is read and its videos and
  photos are streamed to be watched; a file is only saved here again when somebody asks for that one
  file back.
- **Archives are made only by uploading a montage.** The originals cannot be backed up ahead of the film.

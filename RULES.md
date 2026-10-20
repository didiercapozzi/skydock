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

**Nothing running is cut off unasked.** Whatever stops SkyDock — closing the window, quitting it from
the menu or the keyboard, installing an update, choosing another work folder — asks first while
something is under way, saying what: an upload, processing, a film being rendered, a camera being
copied, files coming in, a scan, freeing space, a file brought back. Keeping on working is the choice
offered first. Only the small copies and the finding of jumps go without asking, because they take up
again by themselves.

The first time it is opened it shows a welcome page of its own, before anything else: what SkyDock
does in three steps, what the work folder will hold — the originals, the copies and films, and the
record — that camera cards are only read and nothing is deleted unless asked, and one button, _Start_,
that opens the machine's folder picker on a folder of its own in the machine's videos. A quieter link
offers that folder as it is. Choosing a folder shows it with how much room is left and whether the work
of an earlier SkyDock is already in it, with _Change_ and _Open the board_; nothing is created or
changed in it until the board opens. Closing the picker without choosing leaves the page as it was —
the work never goes anywhere nobody said. The page speaks English, French or German, as the machine
does. That answer is remembered, and everything below — the originals, the copies, the
proxies, the record of it all — is under it. The bin is kept with the work, so a file put aside from
this machine is moved, never copied from one disk to another; the app's own settings, the storage
connection among them, are kept apart from the work.

**Another work folder** can be chosen afterwards, from _Work folder_ under Settings, which says
where the work is now. Nothing is copied or moved: SkyDock starts again in the folder chosen and the
board opens on what it holds — empty, or the work already kept there — and that folder is remembered
from then on. The folder left behind stays exactly as it is and can be chosen again; to take the work
along, the folder is moved by hand first. It is chosen in SkyDock's own window only, and while
something is under way it asks first, as closing does (above), saying what would be stopped.

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
  asked to be sent over one already there that holds other bytes is never written over, nor moved: the
  upload does not start, and says which files are in the way. One that holds the very same bytes is
  simply there, and is passed over. Taking
  something off the storage is done by a person, in the storage's own interface. SkyDock's part is to
  notice. A link is not a file: taking a link away leaves what it pointed at exactly where it was.
- **Not knowing is not evidence.** When the storage did not answer or a check failed, SkyDock keeps what
  it last proved rather than assuming the worst.
- **Nothing in the background holds the board, and all of it is seen.** Whatever SkyDock does that takes
  longer than a blink — scanning, copying in, processing, making small copies, finding a jump, uploading,
  rendering a film, freeing, bringing back, deleting off a camera, checking the storage — runs beside the board, never
  in front of it: the window answers a click, a drag or a change of page at once, whatever is under way,
  and a task that is working on the disk gives way to a copy the person is watching. Every one of them
  is shown live in the small window at the bottom right, whatever page is open: each file with its own
  bar when the task is about files, and otherwise one bar saying what it is doing and how far it has
  got. Each can be folded down, none has to be waited for, and the ones that end leave a line in the
  transfers' history. A task that fails says why there until it is put away. A task holds only what it
  works on: while a montage is processed, uploaded or rendered, what would change that montage — or that
  place — is greyed, saying which task to wait for, and everything else on the board stays as usable as
  ever; opening the film editor is never held. This is the rule every new background task answers to
  before it is built.
- **A wait that lasts is said.** Whatever the person asks for — moving files, making or deleting a jump,
  taking files back, opening a project, freeing space, a page on its way — the board answers at once, and
  if the answer has still not come after 300 milliseconds it says so: a thin line moves under the header and
  the footer says in words what is being done, with a turning ring, until the answer lands. Something that
  is answered sooner shows nothing, so a quick action never flashes. What is only waiting is never
  held: the rest of the board stays usable, and a task long enough to be a background task (see above)
  has its own window and words instead, and does not use this line.
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
recognised by its size and time without being read again, and looked for in every day's folder, so the file is not opened to read the day it was shot: only a file that is new, or that shares its name and size with one given back, is opened for that. Listing a camera's files, on its page or before a copy, therefore reads no metadata from the card. A file this machine has already given back is
passed over the same way, since freeing is a choice and plugging the camera in again does not undo it.
That one is recognised without being read either — by the day it belongs to, the name it would be filed
under, its own or its own with a number, and its size; not by its time, which is the time it was shot
and may have been put right by hand since, while the card still holds the time it was written. An
original is never written over: a second camera's clip that has the same name as one already there —
two cameras of one make both start at the same number — is kept beside it under its name with a number.
Each file is only given its name once it is whole, so a card pulled out half way leaves nothing behind
that could be taken for an original.

**SkyDock remembers the cameras it has met, and copies from them only as told.** Once a board has been
opened, and from then on for as long as SkyDock runs, anything that turns up with a DCIM folder at its
top — where every camera keeps its pictures — is looked at. A camera SkyDock has never met asks, in a
small dialog: its name, how many files on it are not here yet, and the choice to _Copy the new files_ or
_Just remember it_, with a box, **unticked**, to copy this camera's new files automatically from now on —
unticked because a camera is often somebody else's and one file is all that is wanted. Closing the
dialog remembers the camera and copies nothing. Either way the camera is remembered, on this machine and
not in any work folder, told apart by its disk's own id where the machine gives one and else by the name it
shows. A camera set to be copied automatically is copied off the moment it is plugged in, each file on the
board as it lands and gathered into jumps once the card is done, with nobody pressing anything; one that
is not is looked at, and says how many new files it holds, and nothing is copied until it is asked: from
its page, which lists them with a box each — one file, some, or all, with a button to tick every new one — or
from the dialog itself, whose _Choose which files…_ remembers the camera and opens that page.

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
copied, each marked waiting, being copied — its own bar filling as its bytes land — copied, or here
already, and as it goes how many are new and how many were here already. Each file copied is on the
board at once, loose in Fresh files, without waiting for the rest of the card; once the card is done,
what came off it and is still loose is gathered into jumps by the gap rule, as a scan would. A file
off a camera is filed under the day it was shot, read the same way as for a file scanned or dropped
in. A file that cannot be copied — the card will not give it up, or the disk will not take it — is
passed over, marked in the list, and named when the copy is done; it stays on the card, and the rest
are copied all the same. Through KDE a clip that cannot be fetched means the camera has stopped
answering, so the copy ends there, with what came before it whole. A camera plugged in again is looked over file by file, and a file already here costs a look and
not a copy, so the looking must not be mistaken for copying it all again. The board
says what came off once it is done: how many new files and how many already there. The copy can be stopped from its panel: the file under
way is finished, whole, nothing after it is begun, every camera waiting its turn is let go, and what
came across stays on the board; the rest stays on the card for the next plug-in or Rescan cameras,
which pass over what is already here. A camera set to be copied automatically is copied
each time it is plugged in, and any camera again whenever asked while it stays plugged in — from its page, which
offers to copy what is not here yet, or with Rescan cameras, which copies every camera plugged in that has been answered for and
then scans (a camera still waiting to be asked about is left out, and so is the scan that looks through a
new work folder for the first time) — so what went missing here comes back across without unplugging anything; a camera asked
for while it is already being copied is left to that copy. One unplugged half way keeps what was
copied whole, and plugging it in again copies the rest. Only one camera is copied at a time, in the order they came. A drive
without a DCIM folder is not a camera and is never looked into, and copying never writes to a camera. The
`._` files a Mac leaves beside each clip on a card it has touched are not media, and are neither copied
nor listed.
Where cameras are mounted is told to SkyDock when it starts, and telling it nothing turns this off.

**Seeing what is on a camera.** Every camera SkyDock has met is listed at the foot of the menu — a green dot
while it is plugged in, with how many new files it holds, and greyed as _not connected_ when it is not, like
a wifi network a phone remembers. A camera can be forgotten from its page, which asks first and touches
no file: it is then new again the next time it is plugged in. A camera that is plugged in can be
_ejected_ from the menu on its page, as the desktop ejects a drive: it is let go of — unmounted, and powered
down where the machine can — so it can be pulled out, and nothing on it is touched. It is refused while a
camera is being copied, and when the machine says the camera is still in use, it says so as the machine did.
Its page has the switch _Copy new files
automatically_, and lists every photo and video on its card, each saying how far it has got:
not copied yet, copied here but not uploaded, copied here and then put in the bin, or on the storage —
copied read by the same rule the copy uses to pass a file over, and in the bin read by the file's bytes,
never its name, which the copy may have changed: only a file of the bin of the very same size is read
through to be compared, so the rest of the card is not read at all, and what was read is remembered
while it stays the same. A card read as a drive lists its files newest first as they are reached, saying it
is still reading, and offers to copy the new ones, or to pick every file that can go, only once all have been
reached; coming back to its page does not read it again unless it has changed. Any file already copied here — not
uploaded yet, on the storage, or one whose copy here was put in the bin — can be picked and deleted from the
camera, to make room on the card, once it is proved by its bytes to be the one the board holds; a file not
copied yet has a tick too, to be copied alone, and only it has no way to be deleted, since until it is copied
the card is its only copy. A camera that hands its files over has to be gone over — read, never
copied — before it can say how many files are new or list them.

A file on a camera that shows as a drive can be **looked at from the card**, without copying it: a button on its
row plays the video or shows the picture where it is, with the arrows stepping through the files and, for a file
not copied yet, a button to copy just that one. Only what lies under the card's own DCIM folder can be asked
for, whatever address is typed, and the card is only read. A camera that hands its files over cannot be looked
at this way, and neither can a file the browser cannot play or show — which says so, and offers to copy it. The picks
on the storage are also what can be **copied back here**, which is the one thing that undoes a freeing
and is never done by plugging the card in. Deleting asks first, saying how many files and how much, and
that they go to the bin. Then each file is read through and known by its bytes, never by its name:
one in the bin against the files put in the bin from Fresh files, which has to hold that very content;
one on the storage has to be a file the board knows by its content and whose upload the records say was
checked. The storage is not asked, so it need not be reachable.
A camera read through KDE is listed the same way, but from what its copy found rather than by asking
it again: it answers one question at a time, and a card of sixteen hundred clips is minutes of them.
It is copied the moment it is plugged in, so its page opens at once; while the copy is still going
over it, what has been reached is listed and the page says the rest are coming, filling in on its own.
Nothing is deleted from it here: the check reads each file through, byte for byte, which needs the
camera readable as files — and for the same reason its page does not say which files are in the bin.
Its page says to delete on the camera itself.

A file not on a camera plugged in now stops the whole request, and the files at fault are named. Past
that, each file is its own: one shown to be copied here, or whose copy is in the bin, is moved off the
card as soon as it has been read through, without waiting for the others, and one that is not stays on
the card and is named — the others still go. Only when none can go is it said that nothing was deleted.
A file leaves the camera's list the moment it has gone. What passes is moved off the card into a folder of the bin named after the camera and the moment,
kept as it sat on the card. What decides is what the file is, by its contents, and what the records say of it: it is a file the board holds, by its bytes — copied here, uploaded or not, or freed once the storage held it. Nothing is asked of the storage when a file is deleted, so there is nothing to wait for. A file the board does not know, or one whose copy in the bin is a different file, stays and is named. The files are read a few at a time and moved one at a time, and each file being deleted
shows a bar on its own row, first for reading it through and then for moving it into the
bin, so a long delete is seen to be going. Nothing is deleted from a camera while one is being copied or
anything is being processed. A card mounted read-only cannot be deleted from: that is said at once,
nothing is moved and the bin is not touched.

**2. Scan.** SkyDock reads each file's capture time and groups files shot close together into jumps.
A scan can be asked for at any time; one run after more cameras were copied off picks up the new files,
groups them among themselves — joining a jump still in Fresh files when they fall within its gap — and
leaves every filed jump as it is. The grouping is a guess, and the board exists to correct it. A file is
known by what is in it, so the first scan reads every file through; after that a file that has not
been written since keeps what it was found to be, and only what is new or changed is read through.
When each was shot is asked likewise only of what is new or changed since it was last asked — by a scan, a copy off a camera or a camera's page — and kept until it changes.

A scan of a work folder nothing has been copied into yet finds nothing, and says so — but it settles
the folder: the originals folder is made, and an empty record is written. A folder SkyDock has been
pointed at is therefore a folder SkyDock is working in after one scan, whether or not anything has
come off a camera, and a file can be dropped straight onto the board of a fresh install.

That one scan is not left to be asked for: a work folder with no record yet is looked through the
moment the board opens on it, and the window shows only a loader saying so — no page of instructions, no
button. Then the board opens, empty or with what was found. When the look fails the reason is said, with
the way to ask again.

A scan also makes a **proxy** of every clip: a small copy, the same length at the same speed, which the
board plays instead of the full clip and which the editor later opens on. Proxies are made in the
background; everything works without them, and a clip without one simply plays as it is. The small copy is made 640 wide as the clip is shown, so a clip stored sideways is made small by the edge that ends up across and a portrait clip is not made bigger than a landscape one; a clip already 1000 wide or less is its own small copy. Each clip
says whether it has one — only while it has none, since a clip with one is the ordinary case. Proxies are working files: never listed, never sorted, never uploaded. The small square the board
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

**5. Hand over.** A dropzone folder is **uploaded** whole, with no share link: one is made, and taken away again, by hand from the destination's own panel, when it is wanted. A montage's film
is **edited** in SkyDock's own film editor — or, for whoever prefers it, in kdenlive from a template
— and **rendered**, and the montage is then **uploaded**: the film and the photos to its folder, the original videos to the backup
folder. Finally whoever it is for is **emailed** the link.

Sorting and editing are the steps that need a person. Everything else is one press, always in the
same place. A film edited in SkyDock is rendered by SkyDock in one press; a kdenlive project is
rendered by kdenlive, and SkyDock notices the film.

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
  in a montage with a kdenlive project — can still be copied, since nothing about it changes; only one freed from
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
  undoing it. Either way nothing filed to a dropzone or a montage is touched, and no original is — so
  it is never held by processing, an upload or a render elsewhere on the board.

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
  deleted, nor one on the storage only, nor one while it is itself being processed, uploaded or
  rendered — another jump's work does not hold it. A named montage is deleted as a montage instead — at any step,
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
  whatever it is called — but a name is a folder's, so a new one cannot be `.`, `..`, a path, or
  "Montages" in any case, which is the folder the montages are worked in; the board says why.
- **A montage** is a film made for someone: a tandem passenger, a boogie, a day at a dropzone. It
  belongs to no destination. It has **one name**, typed once — "Luc Favre", "Boogie 2026" — and a
  single word is a whole name. The name is its working folder on this machine, named as typed, with
  videos and photos kept apart inside it. Two jumps given the same name are one montage and share it.
  A montage cannot be processed until it has a name, because the name is the folder. **Where its film
  and its backups go is chosen when it is uploaded**, among the destinations (Uploading a montage).
- **A backup folder chosen before backups went into destinations** becomes a destination called
  Backup, so a backup can go where it always went. It is called Backup 2, Backup 3 ... when Backup is
  already another folder.
- **A name can be changed afterwards**, because a name read off a form can be read wrong. Changing one
  says what it costs: what was processed belongs to the old folder and must be processed again, and what
  was already uploaded stays on the storage under the old name and no longer counts as uploaded here. A
  montage whose film is edited in SkyDock is renamed whole instead, its copies, edit and film with it,
  and nothing is processed again (An edit holds the montage); one with a kdenlive project keeps its name.
- **A loose file can be filed to a dropzone** without belonging to any jump; it is handled exactly like
  a dropzone jump's files.
- **A dropzone can be taken off the board**, for one made by mistake or one nobody shoots at any more.
  It is asked for first, and nothing is deleted: every jump filed there comes back to Fresh files
  whole — its files, its name, its trims, its marks — and every loose file filed there is loose in
  Fresh files again, to be filed somewhere else. What was processed belonged to that dropzone's folder,
  so it must be processed again wherever those jumps go next, exactly as when a name is changed. The
  folder on the storage is left as it is, with everything in it and any link handed out of it: what is
  up there is not this machine's to throw away. A dropzone holding anything already uploaded cannot be
  removed — uploaded is the end of editing — nor one while it, or a jump filed there, is being processed
  or uploaded; another place's work does not hold it. The montages are not a place, and are never taken
  off as one.

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
│           ├── luc_favre_20260829.edit.json   the film's edit, when it is made in SkyDock
│           ├── luc_favre_20260829.kdenlive    the editing project, when it is made in kdenlive
│           ├── luc_favre_20260829.mp4         the film, once rendered
│           ├── luc_favre_20260829.photos.zip  for whoever it is for
│           └── luc_favre_20260829.rushes.zip  the originals, for the backup, when kept as one archive
├── proxies/                  the small copies, and for each montage a set cut to match its processed clips
├── templates/                one editing template per folder, with the music and logos it uses
├── music/                    the music the film editor offers, brought in from the computer
├── film-templates/           one film template per file, for the film editor
├── .thumbs/                  the frames the board draws, cut once and kept
└── .projects/                every version of each montage's editing project, kept and never deleted
```

A jump filed nowhere is delivered straight under `processed/`, in a folder of its own named after the
jump and its date, with its videos and photos kept apart inside it.

The board's own record of the work sits at the top of the output folder, with what each original was
found to be last time (so a Rescan reads through only what is new). It is written whole or not at all: a
temporary file is written and made the record in one step, so a crash or a power cut leaves the record as it
was. One that cannot be read anyway — mended by hand and broken — is said so in a line on the board, and a scan
or a change asked for on it is refused with the same words, since a scan would build the record again from the
files and throw away the sorting it still holds; nothing is changed until it is mended or put back.

The output folder may be reached under two names — inside the container and on the host — and the record
is the same for both: a file it names is found wherever the folder is opened from.

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

SkyDock speaks **English, French and German**. It speaks the one chosen under Settings — EN, FR or DE,
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
narrower than a laptop's the panel on the right folds away into a drawer pulled out from the right
edge — so what only it offers, naming a montage, setting a jump's start, deleting a jump, is never out
of reach because the window is small or the board is drawn big. The panel can be put away on any
screen with an icon at the right end of the toolbar, lit while the panel is there, and brought back the same way: it slides out of the way and the
files widen into its place, both in a short, smooth movement (none for whoever has asked their
machine for less motion). Beside the files the choice is remembered on this machine; as a drawer it
is shut again on the next visit. A page starts without the panel, calm: it comes by itself when a file
or a jump is picked or opened, and on a montage's page, where it is the place the montage is worked on.

**Every folder has its own address**, and so has a file opened in it: the front page is the fresh
files, `/dropzone/yverdon` is that dropzone, `/montage/Lily DONZALLAZ` is hers, and
`/dropzone/yverdon/file/<the file>` is that clip open in it. A folder in the menu is a link, so picking
one is going there: the back button walks the folders and clips looked at, a page reloaded comes back
where it was, and an address can be kept or sent to somebody — a montage's opens its page even on a
board that no longer holds it, showing what the storage has of it. One nobody recognises opens the fresh files rather than
nothing. How a folder is being looked at travels with its address:
what is typed in the box, how the files are grouped, which jump card is open. What is being
decided and not yet saved — a trim, a rectangle, a turn — is in none of it: an address is somewhere to
come back to, and a trim nobody saved is not.

**A destination's page and Fresh files are calm.** Each opens with its name, one quiet line, a search icon
(the box to narrow by name opens when it is pressed, and stays while something is typed in it) and a ⋯ menu
holding what is set once — choosing its storage folder, taking it off the board, resetting Fresh files.
Fresh files also has, beside its search, the choice of looking by jump or by day (_Arranging and finding_).
Under that sits one card saying in a sentence where things stand — how many files need processing, are
ready to upload, are all on the storage, or how many jumps
are waiting for a home — with a slim bar of how many of the files this machine holds are on the storage (a file freed from here is only on the storage and not counted) and the one button that goes next. Once
some of the files are on the storage, the offer to free space, which asks first, stands beside that button
whatever is still to process or upload; when the card is too narrow for the sentence, the bar and the
buttons, the buttons go under the sentence rather than squeeze it out.
A destination with no files yet says so, and asks where it should go. The list has no column headings and no
choice of kind: each file is a row with its picture, name, time and size, and a day whose files are all on
the storage is folded into one line, opened by a click; each row is a box of its own. Fresh files shows
its jumps as white cards, a strip of pictures of the jump's own files across the top — up to five, in the order they were shot, each slice leaning to the left and wider than the one before it, with what does not fit counted on the last — over the jump's name, its day and time, what it holds
and a "to file" tag, and the files in no jump as one more card among them, without pictures, with one
button to group the loose files into jumps, which is offered only when it would do something — at least two of them within the gap of one another — and says how many it would group. Opening Fresh files from the rail chooses the loose files' card, when there are any, since they are the first thing there is to file; with none, no card is chosen to begin with. Choosing one lights it and
lists under the cards only that card's files — a jump's own, or the loose ones — so each can be looked at.

**The panel on the right says nothing that the page already says.** With nothing selected, a destination's
panel holds only what is set once: where its files go on the storage and the link handed out of it, each a
line with the one button that changes it, and _Remove destination…_ at the foot. A jump waiting in Fresh
files, when chosen, offers each destination as a button to file it to, and under them _Make a montage…_,
with its start time kept below and _Select its files_ and _Delete jump_ at the foot. A file's panel puts
its picture across the top, its name, its state, then its facts a line each — when it was shot, its size,
how the picture was changed — then what can be done with it, one wide row each (_Trim, frame or turn…_,
_Move to…_), with putting it in the bin small at the foot; a file that is also on the storage shows where, in
a green box with a way to open it there. A montage's panel does not repeat the steps its page shows.
A group of picked files puts the same strip of their pictures across the top of the panel, edge to edge with no margin, border or rounded corner, meeting the toolbar above it and the work beside it with no line between, then how many files, their total size and the times they span. A jump, chosen, opens its panel the same way, with the strip of its own files at the top, whether it waits in Fresh files or is filed; only a montage that is already named leaves it out, since its name says what it is.

**The places.** Three places of work: _Fresh files_, a single entry holding everything off the
cameras that is not filed yet; _Destinations_, one entry per destination, and _Add a destination…_,
which opens the field to name one; and
_Montages_, one entry per named montage and one for the montages still waiting for a name. Under
_Elsewhere_ come what is not worked on here: each camera this machine has met, plugged in or not;
_Montages done_, with how many montages are in it, once there is one; and the _Bin_. There is no page of what the storage holds as a whole: each destination and each
montage shows its own folder up there, on its own _On the storage_ tab. The place you
are on is drawn as a white card. Each place is one line, its name and, at the right, what is left there in
a few words: the jumps still to file in Fresh files, counting the loose files as one more thing to file, the files still to do at a destination ("all up" when
none is, and nothing at all when it holds nothing); a montage shows a segment per step with the next one named under it. Every place of work takes files dropped on it,
and every one but Fresh files a whole jump; the cameras take nothing. A montage
is listed once, however many jumps it has.

A montage is worked on one at a time, so the way in is its own entry. The _Montages_ heading says how many montages are not uploaded yet, and takes a jump or
files dropped on it: the montage's name is asked for first, and nothing moves until it is saved —
cancelled, what was dropped stays where it was. Clicking it goes nowhere. A montage that
has been freed from this machine has nothing left here to work on: it leaves the Montages, its entry with
it, and is found under _Montages done_ in the menu — whether or not its email has gone, since that can
still be sent from its page. The page lists each such montage — its name, the day, when its link was sent,
how much it holds on the storage, whether its link still works — with a _Storage_ button that opens, under
its row, the cards of what is on the storage (each folder, what is in it, how big, with a way to watch the
film) and says that nothing of it is on this machine, and a button to open its own page. A montage freed
once and partly back — files copied back — is not freed, so it is among the montages again until it is freed
a second time.

**Where every montage has got to.** A montage walks the same six steps every time — _Named_,
_Prepared_, _Project_, _Film_, _Uploaded_, _Sent_ — and the board shows every montage where it
is on them, so nobody has to remember what comes after a render. Each montage's entry in the menu says
the step that is next ("to render", "to email") with a segment per step beneath it, done ones in green
and the one it is at in the same colour as those words; its card says the same. Its page shows the whole way in one row of six, a line joining them green as far as the step it is at,
each with a word under it — what it gave, or what it will be — and under the row one calm line saying
which step it is at and what to do next, with the one button that takes it and a "?" that says what taking it
does. Each step is read
off what is there — the name, the copies, the project, the film, the upload, the storage's list. A
freed montage went through every step up to the upload, with nothing left here to show for it. A
montage with several jumps is where the one furthest behind is, since one name is one folder.

**A montage's page changes with where the montage is.** While there is work to do, it has the way in six steps, the next-step card, and under them _Its files_: one card listing every file, clips and photos together, each marked _prepared_ once its copy is made, in the same table as a destination's (picture, name, shot, size, state). Once the montage is delivered, the steps shrink to one line of names and the files give way to two cards side by side: _On this machine_ — how much is here, a line saying everything here is also on the storage, and _Free up space…_ with what it does — and _On the storage_, the folders it was handed over into, each with what is in it and a way to watch the film. The link is not on those cards: it is in the panel at the right, with _Copy link_ and _Remove link_ (or _Create link_ where there is none), and under it where the film and the originals went. Once the montage is freed, the page says so in three cards — what is stored, the link and when it was emailed, and that this machine holds nothing — over what is only on the storage now, and the panel tells when it was emailed and to whom. What else can be done to a montage — edit the film, open it in kdenlive or make its kdenlive project, process it again, start the edit again, upload again, free up space, email again, reset, delete — is in the ⋯ menu of its page, so the page carries only the one next step. A montage's address opens its page for as long as the montage exists, finished or not.

**Montages done** lists the freed montages as a table — who it was for, the day, when its link was emailed (a dash while it has not been), how much is on the storage, whether its link still works — each with buttons for its storage cards and its page. With no montage left to do the Montages heading says so.

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

Arranged by jump, every jump is a card, in a grid of equal cells — so many jumps line up in columns
and rows, the loose files' card among them — newest first, so the numbers count down to Jump 1,
the first of all. A card carries its name, its day and the time the jump started — the jump's own start, which can be corrected, never one file's time — how many
videos and photos it holds, how far it has got, and a strip of pictures of its files, so jumps are told apart at a
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

**Showing files.** Every file is shown the same way: as rows — tick, thumbnail, name, time, size,
state, with what was done to the picture said under the name — or as a grid of thumbnails, whichever was chosen last, for the whole board, until the window
is closed. Once a copy exists, the name shown is the copy's name, the one that is handed over, with the
camera's name kept beside it. A clip shorter than the moment its thumbnail is taken at shows its first
frame. Long lists are drawn a page at a time — forty rows or a hundred and twenty thumbnails — the
next page drawn by itself as the end of the last comes near, and still a press away, as is all the
rest at once; what is scrolled out of sight is not drawn, so a whole card costs no more to look
through than a page. Thumbnails can be drawn smaller or bigger, from a
wall of small ones to see a whole card at once to large ones to tell two near-identical shots apart:
with a slider on the toolbar while thumbnails are shown, or with Ctrl or ⌘ and the mouse wheel over
them; the size is remembered on this machine, and a bigger thumbnail asks for a sharper picture. Every jump says how many videos and photos
it holds, and every day how many files. Where a page keeps the plain heading (a montage's, a camera's),
the heading carries badges for the place — how many videos and photos — that show one
kind, the other, or all, the choice holding across the board; all is both side by side, videos in one
column and photos in the other, stacked on a narrow screen; as rows, each column leaves out the size
when it is too narrow for it, and putting the details away is often
what makes the room for two. A badge for a kind with nothing in it is
shown but cannot be chosen. Fresh files and a destination's page are calm and offer no such choice of kind.

**The board follows its record.** The board's record — `manifest.json` and the groups beside it — is
written by more than the page that has it open: another tab, a script, a hand edit, work done outside
the page. While a board is open the record is looked at every couple of seconds, and when it has changed
and then stopped changing the board looks at it again by itself and shows what changed, with nothing
reloaded and no note said. Only the record's own two files count; the temporary files beside them are
not changes. What this machine's own server wrote itself is not told again:
whoever asked was answered with it. A look only reads — it writes nothing — and it waits for anything the page is saving or answering, so an edit just made is never
shown reverted. Nor does an answer to a request sent before such an edit take the jumps, the loose files or the
places back to what they were. A look that finds the board as it is changes nothing on screen. A record that cannot be
read whole is never shown as an older one.

**Arranging and finding.** Where a page keeps the plain heading (a montage's, a camera's), the pane's heading has one button per way of arranging the place — by jump,
by day, or as one list, whichever that place offers — so every choice is in sight and a single press
away. A destination's page is calm and has no such buttons. Fresh files is calm too, with one exception:
beside its search it has the choice between _By jump_ and _By day_ — the jumps as cards, each opening its
own files, or every day's files listed under the day, newest first, with the loose files of a day among
them. Each kind of place opens arranged its own way — Fresh files and a montage by jump, a dropzone
by day — and a choice made there is part of the folder's address, so it holds until another folder is
opened, and another way can be asked for by an address. Every list of files runs
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
clears. A tick is always there, on a row and on a thumbnail alike,
so what can be picked is seen at once. Picked thumbnails get a
green ring with a tick; picked rows a green tick and background. Picking is choosing what to move, so a
file that cannot move — on the storage, freed, or in a montage with a kdenlive project — has no tick and is never
picked, whichever way picking is asked for; one that stops being movable while picked, as when its
montage's kdenlive project is made, simply stops being one of the picks. The picks — or, with none, the file
being looked at — are removed by button or Delete, and removing asks the same question every time,
wherever they are: **loose in Fresh files**, out of any jump and any place, or **into the bin**. Files
already loose in Fresh files have nowhere further back to go, so only the bin is offered. Nothing
moves until one is chosen, and Cancel leaves them where they were. A copy can only be taken out, its
original staying where it is, so it cannot be sent to the bin, and copies alone are removed without
asking.

**Filing.** Drag a jump or a selection onto a place in the menu to file it there, or onto another jump to
move it. Everything a drag files can be filed from a menu as well: _Move to…_, on a jump's panel, a
file's and a selection's, lists Fresh files, every destination, every named montage and _A new
montage…_, leaving out where it already is, and does exactly what dropping it there would — a new
montage asks for its name first. A trackpad, a long list or a narrow window makes a drag hard; it is
never the only way. While something is carried, what is drawn under the pointer is a small chip with the picture and the name of what is carried, hung down and to the right of the pointer so that the place being aimed at stays in sight; the
place or jump under the pointer lights up when it would take it, and a place that already holds everything carried does not take it. Something dropped on a destination stays where it was dropped from: the page does not change, and
the destination it went to lights up briefly in the menu. Dropping onto a montage
joins that montage, never a new one. A montage whose last files are taken back to Fresh files is left
with nothing, so the board goes to Fresh files with them.

**Making a montage.** A montage is named once, and naming is making. It is made from what is on
screen, beside its name: a jump from its panel, several picked files, or a single file from its own
panel — or from what is dropped on the _Montages_ heading, which asks for the name in a dialog of its
own. Asking comes first — the name only appears once asked for, starting from the jump's own name
when it has one — and the name is saved by Enter or the button; Escape or Cancel changes nothing. A
name that is already a montage's, however capitalised, says it will join that montage and saves the
name exactly as already written: the new jump is a jump of that montage, keeping its own times. Once
made from a panel, the montage's page opens and its entry lights up briefly in the menu; made by a drop, the
page stays and only the entry lights up. Renaming a montage later is
the same: it moves its folder or joins it to another, so it is saved only by Enter or Save, never by
clicking away; Escape puts the name back, an emptied name saves nothing, and a name that is another
montage's says it will join it before anything is saved. A montage whose name was
taken away stays visible under _No name yet_, which says how many are waiting for one.

Whether the files move or are copied is SkyDock's to decide, never a key held. **Files in Fresh files
move** into the montage: they belong nowhere yet, and a copy would leave them there still to sort.
**Files that already belong somewhere — a dropzone, another montage — are copied**, so that place
keeps its own, processed and uploaded as it was. The panel says so before anything is made ("copied,
Yverdon keeps its own"). A copy is a copy as in _Jumps_: it starts with the file's adjustments — its
trim, frame and turn — as they are, and from then on each side changes without the other, so
trimming the dropzone's file again leaves the montage's copy as it was. It is named after the montage
and costs no room on the disk. A file freed from this machine has nothing here to copy, and a montage
with a kdenlive project takes nothing in; one edited in SkyDock simply has one more clip to choose from.

**Adding files from the computer.** A video or a photo from anywhere on the computer can be dropped
onto the board: onto a montage to join it, onto a dropzone to be filed there loose, onto
Fresh files to wait there, or anywhere on a place's page to go to that place. It is copied into the
originals under the day it was taken, keeping its name unless a different file already has it that
day. Only the file's name is taken from a drop, never a path. From then on it is a file like any other. Several at once go together, to the same place.

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
is left alone. What is not a video or a photo is refused, and so is a drop on a montage that has a
kdenlive project or lives on the storage only. The board says what came of the drop, and a file nothing happened to is
not called a failure.

A file let go where nothing takes it — the header, the panel, the space around the work — is left
where it was, and the board says where it could have gone. It is never opened over the board: a
dropped video shown in the board's place is the board gone, and in SkyDock's own window there is no
way back to it. In that window a dropped file is taken where it already lies rather than copied in,
since the app and the machine it came off are the same one.

**Putting files in the bin.** Wherever it is offered, putting files in the bin is a red button with a
bin on it, so it is never taken for anything else. A test shot or footage of the ground can be got rid
of from wherever it is — Fresh files, a jump, a dropzone, a montage — when the bin is the way out
chosen for it on removing it. A file the storage holds too can go as well: the bin moves only what is on this machine, and the storage
keeps what it holds, so the dialog says how many of the files are up there as well and offers only the bin for them.
Such a file is put in the bin from its own panel, one at a time — it cannot be picked with the others, since
nothing else can be done to it.
A file copied into a jump cannot go while that jump still needs it; once the jump is uploaded it can, and the jump keeps its copy as a file given back, on the storage only. Nothing goes without a warning first, saying how many files, how many videos and photos
and how much space, and that these are originals nobody has been given yet (except what the storage holds too) — if the camera card has
been wiped, the bin holds the only copy. Once confirmed, the files leave the board and the originals
folder, so a scan does not bring them back; the copies and proxies made from them are deleted, since
they have nothing left to come from. The files themselves are moved, not erased, into a folder of the
bin named for that moment — and for the montage or dropzone they came out of, when they came out of
one — keeping
the day folder each came from. A file put in the bin this way is
one nobody wants, so while its camera is plugged in it can also be deleted from the camera's card
(Seeing what is on a camera). SkyDock never empties the bin, so
nothing is lost for good and no space comes back until someone empties it by hand. The bin is a folder
of its own beside the work, apart from the originals and the delivered copies. A file is not put in the
bin while the jump or the place it is in, or a jump holding a copy of it, is being processed, uploaded
or rendered; files anywhere else go at once. Files dragged from the board onto the Bin in the menu ask the same question before anything moves; whole jumps are not taken there, and neither are files from the computer.

**Looking into the bin.** _Bin_, in the menu, shows everything in it — each time something was put
aside, the latest first, saying whether it came from Fresh files, out of a montage or a dropzone, or off a camera, and
when — with each
file's picture, name, time and size, the newest file first. Nothing can be deleted from there: the bin is emptied by hand,
from the machine's own folders, and the page says which folder that is. Picked files can be **brought
back to Fresh files**: each leaves the bin for the originals, under the day it was shot and never over
a file already there, and is scanned in as any new file is. One whose footage is on the board already
stays in the bin, and is named — bringing it back would make two of it.

**Merging and making jumps by hand.** Two jumps that are really one are merged by picking the files of
one — its panel selects them all in one press — and dropping them on the other's card; the jump left
empty disappears. The files keep their own times, so the merged jump starts when its longest run does, as any jump does; the files of the other, held against the gap, are flagged and move nothing.
Two jumps can also be put side by side first: with one jump open, ⌘- or ctrl-clicking a second
opens the two next to each other, each playing its own clips, and from there they can be merged onto
the start of either, or onto a time typed in — for two cameras on one jump, one of them on the wrong
clock. Each side is worked through from the keyboard as any list on the board is: up and down move
along its files, Enter takes the one they are on, and left and right go to another jump on that
side — never to the one the other side is already showing. Moving and taking are two things here,
since taking a file plays it. Every time on the board is said to the minute; seconds are only ever asked for in the picker that sets a time. Every time in there is said in full, the day
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
A board opened, or reconnected, in the middle of a run starts with what is already under way. A page
that goes away stops being told what happens. The
figure is a percentage of what is being written, so a trimmed clip counts against its trim — or, while
a jump is being found, of the clip being read through. A bar is never full before the file is whole, so a figure stops at 99. Finding it never holds up the rest of the
board: the clips are read one after another in the background, and the board goes on answering. Finding
the jump is a pass of its own, beside the proxies' and never waiting on them: a clip is read for its
jump while another is still being transcoded. The moment a jump is found it is on the clip — a small
green "exit" on its row, an arrow on its thumbnail, saying where the exit is — with no reload; a clip
with none is left unmarked, since most clips are not jumps. The status bar counts the clips read out of
the clips there are, with a bar, while some are still to be. This is
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

**The toolbar and the status bar.** SkyDock is drawn as the desktop tool it is. The installed app's window has no frame of the
desktop's, and the app fills it edge to edge, with no margin around the panels: there is no title bar of its own
either. The minimise, maximise and close buttons sit at the end of the toolbar, at the top of the app, and
the toolbar's empty space and the status bar's are what move the window when dragged — pressed twice on the toolbar, it maximises. The panels between them are not: a file dragged in from another program must be heard anywhere on a page. The panels
join one another with a thin light line. The places, the work (its toolbar and its list as one panel)
and what is open stand side by side, and a status bar runs along the bottom. The first look at a work folder, which has no
toolbar, carries the same three buttons on a strip of its own. A file's window, below, carries them at the
end of its own header. One
sky blue is for where you are, what is picked and the button that does the next thing. A file's
state is a small tinted badge: amber for what is still to do, blue for what is processed, green
for what is up. A colour marks each kind of place: blue for Fresh files, teal for destinations,
violet for montages, green for the storage, amber for cameras, red for the bin. Pictures lead: a
jump is a photograph of its own footage with its name on it, and a thumbnail is a photograph. Titles
are set in Sora, the rest in Plus Jakarta Sans, and file names in JetBrains Mono. Dark is
the same design on deep navy. The toolbar holds what is used every day:
scanning, rows or thumbnails, finding anything (Ctrl or ⌘ with F goes there), the keys the board
knows, and behind _Settings_ light or dark, the language, the editing templates, the film templates, the work folder and
_About SkyDock_, which says which version this is — the one the installer is named after — who made it
(Capo, with a link to donkeyfall.com that opens in the machine's own browser) and under what licence. The
status bar says what is going on: the storage — whether it is connected, as whom
and to what, a way to check what it holds now, and a way to disconnect — what is being copied or
uploaded and how far, how many clips still wait for their proxy, and how big the board is drawn. The
storage is named the way somebody would say it, who and where: the account the session was opened
with, and the machine's name without the scheme or the port it is reached on. What is chosen once and
then only glanced at — rows or thumbnails, checking and disconnecting — are marks rather than words,
each still answering to its own name. Disconnecting asks first: it changes nothing on the storage and
nothing on this machine, but connecting again wants the password and, where the account has two-step
verification, a code — a poor thing to have to find because a mark was clicked by mistake. The status
bar also warns when the disk the work is on runs out of room — almost full under five gigabytes left,
saying how much, and full under one, saying that copying a camera, making proxies and saving will
fail — and follows the disk while the board is open, whatever else on the machine is filling it. With nothing scanned yet, the board is a
single Scan button and the instruction to copy the cameras first.

**Light and dark.** The board follows the machine by default and can be pinned light or dark. The
choice is remembered on that machine and applied before the first thing is drawn.

**How big it is drawn.** SkyDock's own window zooms the whole board — from the − and + at the end of
the status bar, which say the size as a percentage and go back to as drawn when it is pressed, or with ⌘
or ctrl and + or −, and 0 for as drawn — so a board read from across a packing hall is read at the
size it needs, from half to three times, a tenth at a time. It scales the whole of it, so the layout
answers to the size it is drawn at rather than being stretched. The size chosen is kept, and the
window opens at it next time. A browser tab showing the board zooms with the browser's own keys and
offers no control of its own.

**Never held.** The board is drawn from this machine at once and never waits on the storage: what
the storage holds, whether it is connected and its list of montages come in after, the header saying
it is checking the storage until then, and a storage that does not answer within seconds is taken
to be unreachable rather than waited for. Nothing the machine does while the board is open — reading
a card's dates, measuring a film, comparing two files, making proxies — holds the board up; what it
records by itself as it goes is written a few times a second at most, and progress moves the one
row or panel that shows it, never the whole board. Frames are cut a few at a time, the rest in turn.

**What the board says.** After anything is done the board says what happened in one line above the
files. News is in the app's own colour; a refusal — nothing happened, and why — is in the colour of
something still owed and is announced at once to a screen reader, so the one is never read as the
other. Every such line can be dismissed, and the next thing done replaces it.

**Dialogs.** Every dialog closes with Escape, as a click outside it does, unless it is one that must
be answered. While one is open the keyboard stays inside it, and goes back where it was when it
closes. Its buttons are in one order everywhere: _Cancel_ — or _Close_, where nothing is decided —
then what it does, last, on the right. What deletes or lets go of something is red, the bin with its
icon and anything else without; a jump with processed copies is deleted only after a dialog of the
app's own says what goes.

**Finding anything.** One box on the toolbar finds anything on the board by a piece of its name — a
montage, a destination, a file — says where each is, and goes to it: Enter goes to the first, a click
to any.

**Taking the next step from where it is said.** Where a montage's own buttons are not on screen —
the Montages page with no montage open — the step it is at is taken from there:
_Process_, _Edit the film_, _Open the editor_ to render, _Upload…_, _Email the link…_ —
the same as each step's own button. Where its buttons are on screen, the trail only says; each thing
is offered once. Naming is typed, so it has no button.

## Cropping and turning

A file is opened by double-clicking it, from the inspector, or with Enter on the file being looked at,
playing its proxy when there is one. A clip the window cannot draw — 4K HEVC, as a DJI or a recent GoPro
shoots — says so in place of its picture until its proxy is made, and then plays the proxy without being
opened again. A window that cannot play H.264 — the format proxies are made in — can show no clip at
all, and says so. Space plays a clip and pauses it, whichever button was pressed last.

**Full screen.** The picture takes the whole screen on its own — the button, F, or a double-click on
it — with the window's own player under a clip so it can be watched rather than dragged, and the
photo at its own size. There a clip with a small copy opens on that copy, which plays at once
wherever the window can play H.264 and may be all a 4K original lets it show; _Proxy_ and _Original_,
at the corner of the screen, switch between it and the file itself at the quality it was shot in —
which is the one to judge a picture by — and it opens on the small copy again each time. Switching, or
leaving the screen, keeps the clip at the moment it was at, playing if it was playing. A clip
with no small copy is itself already and has no choice to make; a clip this window has no decoder
for stays on the small copy when asked for the original, and says so.

**In the machine's own player.** A clip can also be handed to whatever plays videos on this machine,
which opens it as it was shot whatever the window can decode — one button, the file itself, nothing
copied or converted first. A file this machine no longer holds is not offered: it is on the storage,
and plays from the storage's own list. Escape comes back to the dialog, at the same moment
of the clip. Nothing is decided there: the rectangle and the marks are for the dialog.

The picture fills the left of the dialog, taking all the height the timeline and the graph under it leave —
the taller the window, the bigger the picture, down to a least height when it is short; the right side says what is being decided, in one panel with a tab for each: _Cut_ (the jump's marks
and the trim, with what the file will weigh once trimmed), _Frame_, _Turn_ and _Info_ (what is known of
the file and what is already on it). A photo has only _Turn_ and _Info_.
The picture carries a corner tag saying where in the jump the playhead is and what frame it will come out
in, the play button over its middle, and the time along its foot; under it, step back or forward ten
seconds, _Start here_, _End here_ and _Trim to the jump_ sit beside the timeline they act on. The
timeline is drawn with pictures of the clip along it, so a zoomed clip played on brings in only the picture that
comes into view and not every picture again; none is taken from beyond the end of the clip. The
graph is joined to the timeline, directly under its bar with no gap, the phases drawn on the same scale
as the marks above them; under it, headed _What the camera felt_, come the least and the most in g. The
panel's tabs share its width; _Cut_ shows the start and the end as two tiles, what is kept with the size
it will weigh, and the jump's marks as rows, each with a _Go to_; _Turn_ offers as shot, a quarter turn
and upside down as three large buttons. The foot shows what is on the file now, solid when saved and
dashed when not, with _Reset_, _Cancel_ and _Save_.

**A window of its own.** In SkyDock's own window a file is opened in a second window, apart from the board:
double-clicking a file opens it there, filling that window with only the file and the window's title bar,
and the board goes on being worked behind it, on this screen or another. One such window is kept: opening
another file while it is open shows that file in it, and stepping to the next or previous file stays in it.
Closing the file — Escape, Close, or Save once something was decided — closes that window, never the
board's. What is decided there is saved as in any window — the window closes only once the save has landed,
since closing it first would lose it — and the windows tell one another when one has saved, so the board
shows it within a moment, without being reloaded.
One thing more: when that window is already open but under the board, asking for a file brings it back to the
front. It moves when dragged from anywhere in it that is not something to press or drag — not a button,
the picture, the timeline or the graph — and has the window's three buttons at the end of its header.
In a plain browser there is no second window to give, and the file opens over the board as before. The top names the file and lets you step to the next; the bottom holds
Save, offered only once something changed, and Reset, which clears the trim, the frame and the turn at once on screen — it is a change like any other, saved with Save, put back by Cancel, and asked about when leaving. A loose file is
cropped the same way as one in a jump, with no jump to give its frame or turn to.

**Trimming.** A clip already trimmed opens where its trim starts, which is the moment the copy made
from it begins, and stepping to another clip opens that clip on its own trim, frame and turn — never
those of the one just left. Dragging along the timeline moves the picture with the pointer, the frame following as
fast as it can be drawn and never left stuck when the pointer stops. Drag the ends of the timeline, or
set the start and end at the playhead. The timeline zooms with the wheel up to ten times, and
Reset brings it back to whole, shown only while it is zoomed; the playhead never leaves the clip. Either end on its own is a trim: an end with no start runs
from the clip's beginning, a start with no end runs to the clip's end. Trimming moves no
pixels: the clip is copied with its ends cut off, losing nothing.

**Trimming to the jump.** A clip whose exit was found (Where the jump is in a clip) is trimmed to its
jump in one press: from the exit, with the second before it a cut is made from, to eight seconds after
the landing, or its own end when it stops sooner — or to the end it had, when no landing was found. A jump's panel does it to every clip
in it at once; clips with no exit found keep their trim, and the board says how many that was.

**Framing.** A mount, a strut or a finger in a corner is cut away by dragging a rectangle over the
picture: what is dimmed goes. The rectangle keeps the shape the clip already has unless another is
chosen, so a 16:9 jump is still 16:9 when handed over, and what is left is put back to the size the clip
came at, so a 4K clip stays 4K. Set on one clip, the rectangle can be given to every clip in the jump in
one press. How much the rectangle keeps is said as it is dragged, in percent — across and down on the
rectangle itself, and with the share of the picture beside it — and the trim says the share of the clip
it keeps the same way. Opened again, a clip shows its rectangle where it was saved, with its shape marked as the one
chosen; each clip opens on its own shape, never on the last one's. Photos have no frame.

**Landscape, blurred sides.** A clip that stands upright — shot in portrait by mistake, or turned
upright — can be delivered as a landscape one: the picture whole in the middle of a 16:9 frame, as high
as the clip was wide, its sides filled with the same picture blurred rather than left black. Nothing
of the jumper is cut away, and nothing is made up: a camera records only the frame it shows, so there
is no wider picture to recover. It stays through anything done to the rectangle, is taken away by its
own switch or by Reset, and like a frame it makes a processed copy out of date. A clip already
landscape is left as it is.

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

**Leaving with changes not saved** asks first — Escape, a click outside, Close, Previous and Next all
leave — offering to keep editing, discard or save, rather than dropping a trim somebody spent a minute
on.

Rows show the trim, the frame and the turn beside the name, dashed until applied and solid after.
Thumbnails show the picture turned. Any of these set after a file was processed makes its copy out of
date.

**What it will weigh.** Where a file's size is shown and the file is to be trimmed, framed or already
processed, the size it ends up as is said beside it, after an arrow. Once the copy is made it is the
copy's own size, as long as it was made with the settings the file has now. Before, it is an estimate,
marked with a tilde: a trim copies the stream, so it weighs the share of the clip's time that is kept;
a frame is encoded again at a fixed quality, whose size depends on what is in the picture, so the share
of the picture that is kept is only a rough guide. Turning changes no size. Nothing is said when nothing
changes. The estimate is live in the preview while the ends or the frame are being moved; the lists and the
file's details give the copy's size once it exists.

## Acting

Each dropzone and each montage offers its next step, always in the same place, and never out of order.
A dropzone is **processed**, then **uploaded**, as a whole. A montage is **processed**, then given an
**editing project**, then **uploaded**: the upload opens once there is a project, and sends nothing until the
film is rendered. Once it is uploaded, the last step — emailing the link to whoever the film is for — is the
primary button, ahead of Upload again, which steps back to a quiet one. Freeing space is offered beside the upload once there is something to free.

**A dropzone's step stands beside what it deals with**: in the row that says what the folder still
owes — so many to process, so many to upload, so many on the storage — and not among the ways of
looking at the folder. It says how many it will take, and it means every file in the folder that
needs it: never the ones a search or a filter happens to be showing, and never a selection. A folder
holding a day nobody is looking at is a folder whose day is processed all the same. Only the files that
need it are prepared: a day with one file still to prepare and another already on the storage prepares
the one, and leaves the other — and its record of having gone up — as it is, so the upload that follows
is of that one file.

**A destination's page is headed as every calm page is** (see _A destination's page and Fresh files are calm_): its name and how many files it holds, a search icon, and a menu of three dots for what is set
once and left alone: changing the folder on the storage and taking the destination off the board. Under
the head, one card says where the files stand — what needs processing, what is ready to upload, what is on the storage — and which folder on the storage they go
into, with the step that moves them on, and freeing space, beside it. Its shared link is made and taken away by hand in its right panel, and only there. Like a montage's, its page has two tabs under that head, _Local_ and _On the storage_, one at a time: _Local_ lists the files kept on this machine, and _On the storage_ shows its folder up there as the same card a montage's handed-over folder is — its path and every file it holds with what kind it is and whether it is here too or only up there — with, on each row, a play button for a film and a ⋯ menu holding the file's own link and, on a file that is only up there, **Bring back**, which fetches it onto this machine again; a row whose file has a link out says so with a small link icon, which copies the link when it is pressed, and the words of every row stand in the same columns whether or not it has one. Bringing back is offered here and nowhere else, and only for a file this machine sent.

**Processing** runs on the machine, not in the page, as a background task: pressing _Process_ answers at
once, the run is shown in the panel in the corner with each file's bar, closing or refreshing the page
does not stop it, and the board stays usable meanwhile — only what is being processed is greyed. A
page opened while processing runs shows it there and updates itself when it is done. One processing
runs at a time, so one asked for meanwhile waits in the corner, saying so, and starts by itself when
the one before it ends; asking again for what is already waiting adds nothing. Each can be cancelled,
from its panel or from where it was started, and cancelling one leaves the others going: the file
under way is dropped rather than left half written, nothing more is started, the copies already
finished stay on the disk, and nothing of the run counts as processed, so processing again takes it up. Edits made meanwhile are
kept, and a jump changed while its copies were being written is not marked processed.

**Nothing is uploaded until everything in it is processed**, and what is waiting is said plainly.
An upload's progress is shown once, in its panel in the bottom-right corner of the board, whatever page is open.

**A montage's files are listed as a destination's are.** Under its steps, a montage's files are one
card headed _Its files_, listed in the same table as a destination's: picture, name, shot, size, state.

**The film.** Once rendered, the film shows above its montage: its name, how long it runs, its size, and
when it was rendered. It can be watched there, so the render is checked before it goes to anyone. A film rendered again is the one that plays. Once the montage is uploaded, what went up
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
- **processed** — a copy exists that was made from the file exactly as it is now. A copy whose size
  was never recorded is trusted while it is there; a copy of another size on disk is not current.
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
from the storage, over there. Putting it in the bin is not an edit and stays open: the storage keeps its own copy.

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
whether or not any of it is still on this machine: a freed montage, last month's days at a dropzone. A montage that has been uploaded is in two places, here and up there, so its page has two tabs, _Local_ and _On the storage_, and shows one at a time: it opens on _Local_, or on _On the storage_ for a montage freed from this machine, which has nothing left here. How it was handed over — the cards of each folder up there, with what is in them — is on _On the storage_, and not under the files on _Local_. The folder's files are not listed a second time under those cards: what could be done to a file in that list — watch a film, give it a link of its own and copy or take away that link — is done from the file's own row in the cards. The link of the folder that was handed over, shown at the foot of its card, can be copied or taken away from there, and once it is gone the same place offers to make a new one; taking it away leaves the folder and its files where they were, and the board's record and the storage's list both say it has no link any more.
On a dropzone's page a file that is on this machine and up there too says so in its right panel, under
_On the storage_, with **Open in DSM** — nothing to watch from there, since the file is here; its row says
only what its state says. Paired by the name it was delivered under. Each file says what it is, how big, when it was shot — read off its name, which SkyDock gives every
file it delivers, since the storage's own date for anything sent before files kept theirs is the day it
was sent — and whether it is here too or only on the storage. A file SkyDock did not name shows when it
was put there instead, and says so.
A video or a photo is played by clicking it (or its play button, where a click opens the storage's interface), streamed from the storage through the board, so a film is
scrubbed without being downloaded first; an archive is listed and not opened. Where the storage's address is known, pressing any file the board lists as being on the storage — in a place's folder, or among what an upload handed over — opens the storage's own web interface, File Station, on the folder that holds it, in a new browser tab; so does a folder's own name. Watching a film from here is then a play button on the row of a video — a photo has none — and every other thing a row can do is in the row's ⋯ menu. It is only a link, so nothing is sent to the storage from here, and the storage's own sign-in applies as ever. All of it only reads what a folder holds: nothing is
fetched by it (**Bring back** is the one thing that fetches, and is its own button), and only files inside the folders SkyDock uploads into are ever opened.

**Files keep their date.** Every file is sent with its own date — the one processing stamped on it,
which is when it was shot — so the storage lists and sorts it by that, not by the day it went up.

**Uploading a dropzone.** One upload covers the whole dropzone — every jump filed there and its loose
files — sending the folder whole. A montage cannot be uploaded this way, because its files go to two
places; asking is refused and says why.

**Sending what changed.** A file whose name is already taken up there by different bytes — such as a
clip prepared again after its trim was put right or a film rendered again — is not written over, and is not moved or renamed by SkyDock either. Before anything is sent, every
folder of the upload is looked at, and if any file is in the way the whole upload does not start:
nothing is sent, the board says so, and each file in the way is listed with a button that opens its
folder in the storage's own web interface, in a new tab, where a person renames or deletes it. The warning line
leads to the list of transfers, which is not opened by itself.
The upload is then started again. What the storage already holds is passed over — footage it holds under
another name, or a file of the very same name and bytes, which an upload carries on past: only what is not
up there is sent. What the board's record says went up already, with the bytes this copy still holds, is
not even looked at again. It is not sent again, and the list says it was already uploaded, with the same button to
find it. The board reports what is happening throughout: how many files are being checked, which one is
being sent and how far it is, and how many were already there.

**One upload at a time, shown wherever you are.** Only one upload goes at a time — a dropzone or a
montage — and while it goes no Upload is offered anywhere, each saying what is being uploaded. It is
shown in the corner of the board, whatever page is open, in the same panel as files being copied in
and a camera being copied off:
every zip as it is made, then every file going to every folder up there, each marked waiting, being
sent with how far it has got, sent, or already there. The upload belongs to the machine, not to the
page: leaving the page, making another change meanwhile, reloading or reopening the window neither
stops it nor offers it again — the board shows it still going and updates itself when it ends. Each
panel in the corner can be folded down to its title and how far it has got, and opened again — or
opened out to a large panel that shows every item whole, where it is going and what became of it (done,
under way, waiting, already there, or failed), and made small again. What is
being uploaded is not processed again, reset, deleted, freed or rendered until the upload is done,
and what is being processed — or waits to be — or has its film being rendered is not uploaded until
that is done: one would rewrite what the other is reading. The board greys what is held and says
which to wait for; the rest of the board is not held.

**Cancelling an upload.** It can be cancelled at any moment from that panel, with nothing to confirm,
since nothing is lost: the file being sent is cut off, nothing more is sent, and nothing of the upload
is recorded — no file reads as uploaded, no link is kept. What had already gone up stays on the
storage and is found there by the next upload, which does not send it again. A zip that was being made
is thrown away, never left where it could pass for a finished one. A zip already made is reused while
nothing in it changed, and made again when it must hold another file.

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
the upload still stands and the board says the list did not follow. What SkyDock keeps about the
storage itself is never listed among a folder's files.

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
somebody already has. Uploading into a destination never makes one. Its right panel says whether the folder has a link, shows it with
**Copy link** and **Remove link**, or offers **Create link** when there is none; taking it away leaves the folder
and its files where they were.

Any one file on the storage can be handed out by a link of its own, from the row it is listed on: one
jump somebody asks for, a single photo, the film alone, without giving away the folder around it. A
live link the storage already has for that file is handed back rather than a second one made, and an
expired one is no link at all. The link can be copied from the row, and taken away again from the
same place — which takes nothing off the storage. Only a file in a folder SkyDock delivers into can
be given one: a link is a way in, and anybody holding it fetches that file without a password.

**Noticing deletions.** SkyDock looks at the storage when the board opens, when a place is opened,
right after an upload, and when the check button is pressed — never on a timer. A file it can no
longer find stops counting as uploaded and is ready to be sent again; the local file is untouched.
Between those moments the board says what it last proved. The same look covers every folder an upload put something in, not only each part's first: an item of what was handed over that its folder no longer lists is struck through on the montage's cards with _no longer on the storage_, and has nothing to open.

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

Every clip is asked once, in the background, in a pass of its own beside the proxies', off the original — a copy keeps the picture and the
sound, not what the camera felt. Most clips have no jump in them: a clip shot on the ground, one
that never left the plane, one off a camera that measures nothing. Saying so is the answer, kept so
that nothing is asked twice, and it is never made up.

The whole clip is read before anything is marked, never the first thing that looks like a door: a
clip can hold a lull aboard the aeroplane long before the real exit, and taking the first dip would
mark the cabin as the jump and find nothing after it. Every dip that looks like a door is weighed,
and the exit is the one a canopy follows — or, when none is followed by one, as with a clip that ends
in freefall, the deepest of them. The other marks are then read from that exit.

The door is placed by which way the camera was pushed as well as by its weight. Letting go of the
aeroplane turns the wearer over, and the direction gravity comes from swings through a right angle
before the weight goes: somebody who hangs out of the door on the strut weighs a gravity and more in
the airflow for most of a second after letting go, and a mark placed where the weight went would be
that second late. So when the swing is well ahead of the weight — half a second or more, and no more
than a second and a half — the exit is where the swing is; otherwise the weight, which is read more
finely, decides. Which way the camera calls up makes no difference, so it serves every camera alike.
It was checked against the frames of seven jumps off one make of camera, the exit read from the
picture: the marks fall within about four tenths of a second of the moment somebody was seen to let
go, where the weight alone was out by nearly a second on the one that hung from the strut.

A jump is cut around those moments, and what SkyDock finds is a starting point, shown where it can be
seen and corrected, never a decision taken silently. A jump runs door, opening, canopy, ground, and a
mark moved out of that order is refused — one of the two is wrong, and only the person moving them
knows which. A mark says when the camera's own wearer left the plane, and a cut does not always start
there: a montage is the subject of its own film, so its cut starts at the instant itself, while a fun
jump is filmed by somebody who goes out after the group, so its cut starts a second earlier. Moving a
mark moves the measurement; the second's lead follows it. What the camera measured is kept from the
first move, and the clip's panel offers, for as long as a mark differs from it, to put every mark back
where it was found — for a slip of the hand, or a correction that was itself wrong. While the app runs in development, and only then, the same panel can also make a clip forget its marks altogether, moved ones and the measured copy with them, and find them again from the footage at once, its progress shown as ever — for trying the finding out on real clips.

## The jump on a graph

A clip being looked at is drawn as well as marked: the force its camera felt, from the first frame
to the last, with the parts of the jump shaded behind it — the plane, freefall, the opening, the
canopy ride, the ground — and the marks in their places. The measurement is drawn as it stands and
the jump's shape over it, since freefall buffets a camera hard enough to hide the shape of anything.
It is tied to the frame on screen and dragged like the timeline: a point dragged along the graph
moves the footage to that instant, and the graph reads out what that instant weighed and which part
of the jump it belongs to. Zooming the timeline zooms the graph to the same stretch of the clip, and
the drag along it is read against that stretch. The graph zooms too — the wheel on it zooms about the
pointer, as on the timeline, and the two always show the same stretch. With ctrl held, a drag on either
slides that stretch along the clip, the footage staying where it is; the stretch stays where it was put,
whether zoomed by the wheel or slid, until the playhead moves again. A zoom of only a little is said to the
hundredth (1.03x), so a clip cut off at its ends never reads as the whole of it. Under the graph it also says the least and the most the camera felt across
the whole clip, in g, whatever frame is on screen.

How high and how fast are drawn beside it whenever a camera wrote them down, in metres and kilometres
an hour. Only satellites know either, so a camera with its receiver off, or without one, says nothing
and the graph says so rather than drawing a line from nothing; a stretch where the receiver lost the
sky is a gap in the line, never a line ruled across it. Neither is ever estimated: an invented line is
worse than an absent one. The drawing is read off the original when the clip is opened, and nothing
about it is stored.

## The film editor

**A processed montage's film is edited in SkyDock.** _Edit the film_ opens the film editor on its own
page, at `/edit/<the montage's id>`, which takes the whole window without the board around it, and which
is read again, and stays, when the page is reloaded. Closing it, _Esc_ and _Render the film_ go back to
where it was opened from, or to the montage's page when it was the first page loaded; the browser's
Back leaves it too, and an edit not yet saved is saved on the way out. A montage that is not on the
board, and one that is not processed, are refused in the editor with the reason, and its close goes to the montages page. In the packed desktop window with its own frame the editor has the same rounded corners as the board. The page has the
montage's clips on the left, the picture in the middle with previous clip, play and next
clip under it, what is picked on the right, and under them a toolbar with Select, Cut at playhead,
Delete, Fade in, Ripple, Snap and the zoom, the timeline, and a line with the film's length, with a Shortcuts button beside Undo in the header. The timeline ends
where the last of the videos, the texts and the music ends, not where the last video does: the ruler, the
playhead, the clock under the picture (_now / end_), previous and next clip, and playing all run to that
end, and after the last video the picture is empty while the text and the music go on. The film's
length in the line below is the video's, gaps included; the rendered film runs to the end of the
timeline, so a text or a piece of music that runs past the last video is in it over black. The timeline is always as wide
as the window, with the ruler's ticks across all of it, and wider when its end needs it; a click or a
drag past the end puts the playhead at the end. Ctrl and the wheel over it, a pinch on a trackpad where it arrives as Ctrl and the wheel, or two
fingers drawn apart or together on a touch screen zoom it about the pointer or the fingers, the moment
under them staying where it is, between the same limits as the zoom slider, which follows; the slider
and the zoom buttons zoom about the playhead, and the wheel alone scrolls. On a touch screen one finger on the empty timeline scrolls it, and a second finger landing while the first drags a clip, a trim or a text cancels that drag and puts back what it had changed; a finger the screen lost, or the window losing focus, is forgotten. The timeline has
a track for the video, one for the camera sound of those clips — where each speaker is turned on —
one for the text and one for the music, each named at its left with its tag (V1, A1, T1, M1). The
header says _Montages_, the person and the day of the montage, whether the edit is saved, _Undo_ —
also Ctrl or Cmd and Z — and _Render the film_. Undo takes back the last change, a drag or a slider
counting as one, as far back as the editor has been open. On a narrow window the picture takes the
top and the two panes sit side by side below it, and on a phone they stack, the whole editor
scrolling so the timeline is always reachable. The first time, every video of the montage is laid
end to end in the order shot, whole, with no gap, with its camera sound off, and a title with the
person's name opens the film. The edit is saved beside the montage's copies as `<name>_<date>.edit.json`, by
itself, a moment after each change — the first change, or the film template the film is started from.
Opening the editor only to look writes nothing: that first film is the same each time it is laid out, so
nothing is lost, and a montage that was only looked at is not edited. Once written, that file is the
montage's edit, so the project step is done and the montage is held as that edit holds it (below), and it
is kept aside in every version the way a kdenlive project is.

Photos are clips too. The montage's photos (JPEG and PNG) are listed on the left with the videos, each marked _Photo_, and go in the same way — dropped on the video track or put at the end with _Add_ — as a clip that holds the picture for five seconds, with no sound, and that is not laid on the timeline the first time. It is shortened or lengthened by its edges or its _Length_ box, up to a minute, like a video; it can be cut at the playhead, given a gap, faded into and out of, and moved like one. There is no _Source in_ and _Source out_ for it and no part to choose, and the picture is shown in the editor and rendered fitted into the film's frame, with black around it, as a video is.

A film template is the part of a film that is the same from film to film: its titles, its music, how quiet the music goes under the camera's sound and, when the film had fades between its clips, the fade most of them had. It holds no clips. It is not the editing template of the kdenlive project, it is used only by the film editor, and SkyDock ships none.

A film template is made from a film with _Film template…_ in the editor, _Save as film template_, under a name; a name already used is replaced only after _Replace it_. The passenger's name and the day, when each has three letters or more, as whole words, become {name} and {day}; any other word typed in a text is kept as written, so a personal text stays in the film template file, which is a plain file in the film-templates folder, and a text never grows past 200 characters. What finishes with the film stays at the end of any film it is used on. The length is kept to the whole second, between 5 and 3600 seconds.

A film template is made from scratch under Settings, _Film templates…_, _New film template_, _Create and open_: the editor opens on a black timeline of a length the person sets, with a grey bar where the clips go and no _Render_, and titles and music are placed as usual, drawn on the stage with {name} and {day} as they are and, as in a film, only once the playhead is past their fade-in. A fade the film template holds is kept when it is saved there. The grey bar cannot be deleted or moved, only given another length, between 5 and 3600 seconds.

A new film asks which film template to start from, only when there is one (the last one chosen is ticked while it still exists), and _No film template_ is always the first choice; if the film templates cannot be read, the film starts without one and says so. Closing that question with the cross or Escape starts the film with _No film template_. Later, _Film template…_ then _Apply_ replaces the texts, the music and the camera-sound level of the film, says how many, keeps the clips (a template with a fade gives every clip after the first, apart from those after a gap, that fade, held to half of the shorter of the two clips; one without a fade leaves the film's fades as they are), clears the selection, and is one step of Undo. Texts and music are cut to fit the film and never stretched. Music that is not in the music folder, or that does not fit the film, is left out and named, also when the film template is chosen for a new film. A film template does not follow the jump marks or later trims.

A film template file that cannot be read is listed in the _Film templates_ dialog, where it can be deleted. Renaming, duplicating and deleting are in that dialog, and deleting asks first. A name is held to 60 characters and 200 bytes and may not be a name the file system reserves; the characters a file name cannot hold become spaces, and ".zip" and the like are kept as typed.

A video clip and a piece of music can carry markers: flags with a name, put at the playhead with _Marker_ in the toolbar or the _M_ key on the picked clip or piece of music — or, with nothing picked, on the clip under the playhead — and named _Marker 1_, _Marker 2_ and so on until they are renamed. They belong to the clip or the music, at a moment of its own time, so they move with it when it is moved, trimmed or cut, and show only while that moment is inside the part that is kept. They are listed in the Inspector of the clip or the music, each with a name box, its time and a button to take it away, and a clip whose video has jump marks (the exit, the opening, the canopy, the ground) has _Import the jump marks_, which makes a marker of each one inside the kept part that is not already there, named as the jump mark is, once. With Snap on, what is dragged — a clip, a text, a piece of music — is pulled to the markers of the other clips and pieces of music as it is to their edges and to the jump marks. A marker is for the editor only: it is in the saved edit as an optional `markers` list of `id`, `label` (forty characters at most) and `at` on a clip and a piece of music, it is not in the render, and a film template does not keep it. In the film template editor there is no _Marker_.

Over the video and under the texts the film can have layers: pictures and backgrounds, which stack as the layers of a kdenlive title do. The _Images_ tab of the library lists the pictures in the `images` folder of the output folder (PNG, JPEG or WebP), with _Bring in pictures…_ to add more from the computer, as the music is added, and _White background_ and _Black background_. _Add_ on a picture, or a background, puts a layer of five seconds at the playhead, which may be after the last clip: the picture is black there, and the timeline and the render run to the end of the last layer. A picture has a place — across and down, as a share of the frame — and a width as a share of the frame's width, dragged on the stage or set in the Inspector; a background fills the whole frame in a colour. A layer has its own start and length, set by its block on the timeline, by dragging its end, or by the boxes of the Inspector, and a _Fade in_ and a _Fade out_ like a text's, with the round handles on its block. Layers that are on at the same moment are stacked on rows, in an _Images_ track under the video and over the text, whose height grows with the rows. They are in the saved edit as an optional `layers` list, each with a `name` (the picture) or a `colour` (the background), never both; a picture that is not in the folder any more stops the render and is named. Delete takes a picked layer off, and Undo brings it back. Clips, pieces of music, texts and layers can all be picked together with Shift-click, and the Inspector then shows only the options they have in common — the fades for any mix, and for several clips the speed and _Hear these clips_, for several pieces of music the volume, for several texts the colour — changed on each of them at once; Delete takes them all off. Texts and layers can also be grouped: Shift-click adds a text or a layer to the picked one, and _Group_ in the toolbar joins them under one `group` in the saved edit. Dragging a member along the timeline or on the stage moves the whole group, Delete takes the whole group off, and _Ungroup_ in the Inspector lets them go; a look changed in the Inspector (colour, font, effect, size, fades, width) is changed on every text, or every layer, of the group or picked with Shift, but not what is each one's own — its words, picture, start, length and place; a group does not change the render, and a film template does not keep it.

**Clips go in where they are dropped.** A clip dragged from the left onto the video track goes in at
the nearest cut — between two clips, or at either end — and everything after it moves along; _Add_
puts it at the end. A clip on the timeline is removed with Delete or from the panel. Dragging either
edge of a clip shortens or lengthens it, and the clips after it follow. With Ripple on, the text
and the music placed after the clip move with the film; with it off they stay where they were put.

**A gap is black and silent.** A clip can have a gap before it, empty time between it and the clip
before, drawn on the video track as dashed empty space. It is made by dragging the clip to the right
along the video track, or by moving it from the keyboard: with a clip picked, Alt and the right or
left arrow move it a tenth of a second, a second with Shift, and the _Starts at_ box in the inspector
takes a time and does the same. A clip never overlaps its neighbours: moved left it closes its own gap
and stops against the clip before, and dragged on past the middle of the clip before it takes its place
in the order, the gaps staying with their places. With Ripple on, the clips after it and the text and the music
placed from its start on move along with it; with Ripple off they stay where they are, the gap
before the next clip getting smaller, and the clip stops when that gap is used up. With Ripple off, a
clip taken away leaves its place empty — the gap before the next clip grows by the clip and its own gap
— and a clip's start edge trimmed keeps its right edge where it was, the gap growing by what was
trimmed; with Ripple on a clip taken away closes up, and a trimmed start keeps the clip's start. Cutting
a clip keeps its gap before the first piece and none before the second, and a gap stays when the clip
next to it is trimmed at its far edge. In a gap the picture is black, the camera sound is silent, and
the text and the music go on; the clock and the playhead count it. Moving a clip is one Undo, quick
presses of the keys too. With Snap on, the dragged clip's edges are pulled to the cuts and edges of the
others, the playhead and the jump marks. A drag to the right never changes the order: a clip goes
past the next by dragging the next to the left.

**A crossfade is one click.** With a video clip picked, _Fade in_ in the toolbar — pressed while the
clip has one — makes the picked clip appear over the end of the clip before it, the two overlapping in
the film while the second fades in over the first and the camera sound crosses with it; a second click
takes it off, back to a plain cut. Its length at first is one second, held to half of the shorter of the two clips
and to three seconds at most. The same switch is in the inspector of the picked clip, as _Fade from the
previous clip_ with a _Length of the fade_ slider from 0.2 second to what the two clips allow (it stops at
0.2 second, with its length shown to a tenth; only the switch takes the fade off), and on the timeline the overlap
is drawn at the start of the clip as a zone with one diagonal edge, the clip's name starting after it and
a thin line marking it in the camera sound lane too. The zone is a slider named _Fade into_ the clip: it is dragged to the left, or
moved with the left arrow by a tenth of a second, a second with Shift, to make the fade
longer, and to the right or with the right arrow to make it shorter, never under 0.2 second, and the trim grips of the two clips at its two ends stay above it. It is off, with the reason in its title, with nothing picked, on the first clip, when a
gap separates the two clips (a crossfade and a gap exclude each other: a gap given to a clip that has a
fade — by dragging it to the right past the fade, by the keys or by _Starts at_ — takes the fade off, and
dragging it to the right short of that makes the fade shorter), and when either clip is under 0.4 second.
The saved edit has it as an optional `fade`, in seconds, on the clip that fades in; no `fade` is a plain
cut, and the edit's version and every older file stay as they were. A clip with a fade starts that long
before the clip before it ends, so the film, the timeline, the clock, the cuts, Snap's points, the
playhead and the span where the music dips under the camera sound all count the overlap: the film is
shorter by the fade. Under the playhead, inside the overlap, the picture is the newer clip and the
camera sound is the newer clip's, the older clip being the one under it for the blend. Cutting inside the overlap cuts the newer clip, the one the picture shows. Cutting a clip keeps its
fade on the first piece, and the fade into the next clip on the second. Trimming or choosing a
part of either clip holds the fade to half of the shorter; deleting a clip takes off its fade and the
next clip's, and so does putting a clip in between two, or moving a clip so that it no longer follows
the same one. With Ripple on the text and the music after the clip move with the film when a fade is
made, changed or taken off, as they do for any change in the video's length, and also when an edit shortens or takes off a fade by
itself (a trim, a part chosen, a clip deleted or put in between), so that they stay with the clip after
it; cutting a clip and moving a clip do not move them. A saved fade that does not fit (on the first clip,
beside a gap, or longer than half of the shorter clip) is read as the fade that fits. Making or taking off a fade
is one Undo. In the stage the overlap shows both clips: the older one under, the newer one over it at an
opacity that goes from 0 to 1 across the overlap, and the sound of each rising or falling the same way, in a straight line like the render's,
when playing and when the playhead is moved into it. In the rendered film a crossfade is a
dissolve between the two clips with the sound crossing as well, a clip without sound or with its
speaker off staying silent through it, and a cut, a gap and a crossfade can follow each other in one film.
The film's output has three choices, in the Inspector when _Render…_ in the header has been pressed — which takes nothing off the timeline but shows them there, with how long the film is and, last, the real _Render the film_ (or _Render again_) button, and a _Back to the film_ — and none in the film template editor, which makes no film and has no _Render…_; picking anything on the timeline takes the panel away: _Format_, the video's codec, _H.264_ (as it always was) and, where this computer's ffmpeg can make them, _H.265_ and _AV1_, all in an MP4 file (a computer that can make only H.264 is not offered the choice, and a film that asks for a format it cannot make is refused with the reason); _Frame rate_, 24, 25, 30 (as it always was), 50 or 60 images a second, which is the film's and the picture, the stills and the black of its gaps alike; and _Quality_, the constant quality number of the encoder, from 12 to 40, the lower the better and the bigger, whose usual value is shown at first and follows the format (18 for H.264, 22 for H.265, 28 for AV1) until one is chosen. The frame is 1920 by 1080, or 1080 by 1920, by the shape of the first clip. They are kept in the saved edit as an optional `output` with `format`, `fps` and `crf`, an edit without them is H.264 at 30 and the usual quality, a choice of format drops a quality chosen for another format, and the render reads them when it is made. H.265 is tagged so that Apple devices play it.

A clip, a text and a piece of music each have a _Fade in_ and a _Fade out_ in the Inspector, two boxes written like the others, from 0 up to half of the item's length, to a tenth of a second; they need no neighbour, so a clip can fade at the start or the end of the film or beside a gap. A clip's fade takes its picture from black and its camera sound from silence at its start and back to them at its end (a photo has no sound), and a clip that a crossfade already fades in has its _Fade in_ at zero, unchangeable and with the reason written under the boxes, as has the _Fade out_ of a clip that the next clip fades in over; texts and music are not affected by a crossfade. A text's fades are multiplied with the look of its effect, so the stage, the cards and the render agree, and music's fades are multiplied with the level and with the dip under the camera sound. A piece of music has no fade unless one is set: none saved is none, as 0 is, and an older film whose music had the fade in of a third of a second and the fade out of a second and a half now has neither. Each fade is drawn on the clip's and the text's block as a small dim triangle at its start or end, and on the music's track as part of its level. A round handle on the top edge of the block of a clip, a text and a piece of music, at the end of each fade (at the corner when there is none), is dragged along the timeline to set that fade with the mouse, with no box to open: it shows on the block that the pointer is over and on the picked one, takes the left and right arrows too (a tenth of a second, a second with Shift), is a slider named _Fade in of_ or _Fade out of_ the item, and is not there for a side that a crossfade already fades. Trimming or shortening an item shortens its fades to half of its new length for good, so a fade follows the size of the item and does not come back when the item is lengthened again. The saved edit has them as optional `fadeIn` and `fadeOut`, in seconds and not below zero, on a clip, a text and a piece of music; none is none for a clip and a text, and the version and every older file stay as they were. A fade longer than half of the item is held to half whenever the film changes. Cutting a clip keeps its _Fade in_ on the first piece and gives its _Fade out_ to the second; deleting a clip drops its fades. A film template holds the fades of its texts and music and none of a clip's. A change of a length is one step of Undo. The stage dims the picture and lowers the sound of a clip, and lowers the sound of the music, along the same straight lines, when playing and when the playhead is moved into a fade; the render fades the clip's picture and sound with the `fade` and `afade` filters on the cut clip, the text's opacity in its drawn alpha, and the music with `afade`.
The stage has two video layers and never goes empty at the seam between two clips that touch, whether the film plays or the playhead is moved across it. The clip (or photo) at the playhead goes to the layer that already holds its file, the one nearest to the wanted moment if both do, and otherwise to the layer that is not on screen; in a crossfade the older clip takes the other layer. A layer comes to the screen only when it has a frame to show: a video that has loaded and is not seeking, or failed to load, or a photo that has been decoded. Until then the layer on screen keeps its file and its picture. So a jump to a clip that is not loaded keeps the old picture until the new one has a frame, and a photo that finishes decoding after the film was paused changes the picture but starts nothing.

The clip (or photo) that comes next, when it starts within five seconds and the one at the playhead has its frame, is loaded and held at its first frame, silent and hidden, in the free layer, and takes the picture at the seam; when the one at the playhead has no frame yet it is loaded as soon as it has. A clip that follows the incoming clip of a crossfade closely is cued only when the crossfade is over. Turning back right after a seam loads the clip just left again from its start, since its layer was already given to the next clip, and may show one empty frame, about a sixtieth of a second, before it has its frame.

The keys of the editor are heard on the whole window while the editor is open, not while a dialog is open over it (the film template dialogs, the part of a clip, the Shortcuts list), and not when a key repeats, except the arrows, which keep moving, and Enter and Space, which do not play again or press anything while held. Enter and Space play and stop. By default _C_ is Cut at playhead, _F_ is Fade in for the picked clip (only where its button is on), _D_, Delete and Backspace delete the picked item (not from a button or a checkbox that the keyboard focused), _R_ is Ripple, _S_ is Snap, _M_ adds a marker and _T_ adds a Title text at the playhead. These single keys do nothing with Ctrl, Cmd or Alt held, nor with Shift held when the key is a letter, and the browser's own use of a key (such as quick find on /) is held back when it does an action. The keys are matched on the character the key types, so on a layout without Latin letters the letter of the same keycap also counts, and on an AZERTY layout a digit that needs Shift can be set. The title of each tool, and of Play, says its keys as they are now, and the tool carries them as its keyboard shortcut. The left and right arrows move the playhead a tenth of a second, a second with Shift, Home and End go to the start and the end, also from the ruler, Alt with the arrows moves the picked clip, Ctrl or Cmd with Z undoes, and _?_ or the Shortcuts button opens the list of these keys, which Esc closes, giving the focus back.

The six tools can have other keys. Edit shortcuts in the Shortcuts list shows each key of a tool as a chip that is clicked to be changed by pressing the new key, with a small cross to take it off and Add a key for another one, so that a tool has any number of keys up to eight, or none. While a key is waited for, nothing else hears it, Esc gives the waiting up and leaves the list open, and the state is said to a screen reader. A key that another tool has is not taken without asking: the list says which tool has it and offers Move or Cancel, and while it asks Esc cancels the question before it closes the list; Tab, Enter and Space reach Move and Cancel. Enter, Space, Esc, Tab, ?, the arrows, Home and End, the function keys and any key with Ctrl, Cmd, Alt or (for a letter) Shift are refused with the reason, and the keys of Play, the playhead, Undo and the list stay as they are. A letter of another alphabet is also refused when the Latin letter of its keycap belongs to another tool. In the film template editor the Cut row is shown with a note that Cut is off, so that its key can be freed, moved or removed, and Cut does not hold the browser back for it. In editing the list says that the other keys are fixed, each chip is named by its key first (as in C, change the key of Cut) and is at least 24 pixels square, like its cross, with a focus ring, and a refusal is shown in the error look of the dialogs. AltGr is not taken for Ctrl and Alt, in the list and in the editor, so the characters it types can be set and used. Option on a Mac is Alt, so the characters it types are refused. A dead key is refused with its reason, and a key that ends an input method composition is not taken. A digit on an AZERTY layout is typed with Shift, so it is set and used with Shift held, which the single keys other than letters allow. Reset on a tool, and Reset to defaults for all, give the keys above back, and after a key is set, removed or reset the focus goes to Add a key of that tool.

The keys are kept for the user in the browser (skydock.filmKeys, only when they differ from the defaults), and other tabs follow a change, a reset and a cleared storage, through one listener for each remembered value. A stored value that cannot be read, or holds more than eight keys for a tool, is the defaults for that tool, a key in it that is refused is left out while the others stay, and a key that two tools hold is kept by the first. If one key types two names (a letter and the Latin letter of its keycap), the first tool in the list Cut, Fade in, Ripple, Snap, Title, Delete does the action and no other.

In a text box (text, number or search, a text area, an editable text) and in a menu every key is the field's own, so Space types and Enter commits; only Esc reaches the editor, and with a dialog open Esc is the dialog's alone, wherever the focus is. On a button, a checkbox, a slider or the ruler that a click gave the focus, Enter and Space play and stop and do not press or tick it. A control that the keyboard gave the focus (the browser's focus-visible, so Tab, or a dialog that the keyboard opened giving the focus back, but not a click) keeps Enter and Space when it is a button, a link, a field other than a slider or a summary, so that the editor can be used without a mouse; any other element, such as a clip block, lets Enter and Space play and stop. The arrows are left to a slider that has the focus, and Home and End to the zoom. The film template editor has the same keys, but Cut is off there.

**Cutting, Ripple and Snap.** _Select_ is the tool the editor is always in, shown pressed. _Cut at
playhead_ — also the C key, under the focus rules of the keys of the editor, and not with Alt or
Shift or when the key repeats — splits the video clip under the playhead into two that meet at the
cut: the first keeps the clip's id, and the second is a new clip of the same video and sound setting
from the cut to the old end; the second is the one picked afterwards, so that the next cut, fade or delete is of it, the playhead and the film's length do
not change, and Undo makes it one clip again. It is off where the playhead is not inside a clip, or
where either piece would be under half a second. _Ripple_ is on at first: whatever starts after the
point where the video gets longer or shorter — a clip trimmed, chosen a part of, removed or put in —
moves along by the same time, so it stays on the same moment of the film; a text or a piece of music
that starts before that point is never moved, and one that starts inside a clip taken away comes to
the point where the clip was. A clip put in at the very start does not push a text or a piece of music
that starts at 0; one that starts later is pushed. _Snap_ is on at first: a text or a piece of music
dragged or cut at its end is pulled to within a few pixels of the film's start, a cut between clips,
the playhead, a jump mark or the edge of another text or piece of music, whichever of its two edges
is nearer; a clip edge trimmed is pulled to the jump marks of its own video. Ripple and Snap are
kept while the editor is open, not in the saved edit; the part window keeps its own snapping to the
marks.

**Choosing the part.** A double-click on a clip, or _Choose the part…_, opens the clip in the same player and the same trimming bar as the app's file preview: the clip plays above, and under it the bar of frames has the jump marks — the exit, the opening, the canopy, the ground — drawn where they are, a handle at each end of the part that is dragged to trim it, a playhead that is dragged or clicked to look at a moment, and _Start here_, _End here_, _Reset trim_ and zoom as in the preview, so the part can also be set by playing to a moment and pressing a button; _Reset trim_ takes the part back to the whole clip and leaves the window open. The marks are only shown there: moving one is for the file in the preview, not for the film. A _Speed_ from a quarter to four times is chosen in the same window, with how long the part then lasts. As in the preview, the window has _Cut_, _Frame_ and _Turn_: _Frame_ crops the picture to a shape (_None_, _Same_, 9:16, 4:5, 1:1, 16:9 or _Free_, dragged with the corners of the frame over the picture) and _Turn_ turns it a quarter turn at a time. They are kept on the clip as an optional `frame` and `rotation` in the saved edit, the picture is turned and then cropped, the whole cropped part is always shown, scaled as large as the frame of the film allows — to the full height of the frame for a part that is taller than the frame, to the full width for one that is wider — with black on the sides that it does not reach, cut pieces of the clip keep both, and the stage, the pictures of the clip on the timeline and the render show the clip turned and cropped, fitted in the film's frame. _Use this part_ also puts the playhead at the start of the clip, so that the stage shows what was chosen at once. The clip's own crop and turn made on the board are already in the processed copy, and are not shown again. _Use this part_, or _Apply_ in the bar, puts the part and the speed on the clip in one step of Undo, as does nothing else, _Cancel_ leaves the clip as it was, _Remove the clip_ takes it off the timeline, and a part shorter than half a second cannot be used. A photo has no part to choose.

**A clip's speed.** A video clip plays at _Normal_ speed unless the inspector's _Speed_ says another, from a quarter to four times. Its picture and its camera sound go faster or slower together and the sound keeps its pitch. The clip lasts its part divided by its speed, so what follows moves by the change like after any other change of length, with the texts and music following when _Ripple_ is on. Its _Length_ and its place on the timeline are in film time, its _Source in_ and _Source out_ and a cut at the playhead are in the video's own time, and a photo has no speed.

**The music is the film's sound.** A clip is heard only when its speaker is turned on; then, for as
long as it plays, the music dips to _Music under the camera sound_ — 15% of its own volume unless
changed — over 0.8 seconds either side, and comes back up after. The music's level is drawn along its
track, and the picture says what is heard at the playhead: the music and how loud, the camera, or
both. A clip with no sound of its own cannot be turned on.

**Music** is brought in from the computer into the work folder's `music` folder — MP3, M4A, AAC, WAV,
Ogg or FLAC — and is offered to every montage from then on. A piece goes in after the last one, as
long as what is left of the film; it is moved by dragging, cut at its end, and given its own volume.
It fades in over a third of a second and out over a second and a half unless it is given its own _Fade in_ and _Fade out_, and the film's end cuts it.

**Text** comes from five ready looks — a title with the person's name, a subtitle, a lower third, a
big moment, a signature — and goes in at the playhead. Each says its words, how it comes in (_Fade_,
_Rise_, _Pop_ or a _Lower third_ on a band), its type (_Clean_, _Bold_, _Elegant_, _Hand_), its size,
its colour and how long it is shown. It is placed by dragging it in the picture, where it snaps to the
middle either way and a frame shows the edge a screen may cut. The picture draws text the way the film
will have it.

The five looks are cards in the Text tab, each with a small sky-blue picture of its sample text (the passenger's name for the title, _Your text_ for the others) where and in the type it will have, its name and how it comes in. The effects of a picked text are cards too, and the fonts and the colours are buttons that show what they give. A film template's texts have the same cards. A card is named by its look only, not by its sample text.

Hovering or focusing a card plays its effect in the small picture, and the effect of the picked text plays on its own, in a loop of a few seconds whose fade and pop last as long as the film's. The slide is shorter and the curve is not the same, so the card is an approximation of the film. A touch screen has no hover and shows the still card. Whoever asks their system for less motion sees the final frame and nothing moves.

**The picture plays the edit.** It plays from the proxies, with the music and the camera sound as they
will be heard; Enter and Space play and stop, and the jump marks of the clip at the playhead are buttons that
go to them.

**Rendering is one press.** _Render…_ in the header opens the render panel in the Inspector, and _Render the film_ in it saves the edit and makes the film from the processed
copies — never the proxies — into the montage's folder under the film's own name: MP4 with H.264 video
and AAC sound, 1920 by 1080 at 30 frames a second, or 1080 by 1920 when the first clip is upright,
each clip fitted inside the frame, each gap a black picture with silence, and running to the end of the
timeline: after the last video the picture is black, and silent unless there is music, until the end of
the last text or piece of music. It is written aside and put in place whole, so the board never
takes half a film for the film, and its progress is in the panel in the corner, with a _Cancel_ that stops
that film's render at once — another montage's render goes on: the half-made file is taken away, the
film that was already there is as it was, and the panel says the render was cancelled. One montage
renders one film at a time, several montages can render side by side; _Render again_ replaces the film
with the edit as it now is. While its film renders, a montage is not processed again, uploaded, reset,
deleted, freed or renamed — each says to wait for the render or cancel it — and a render does not start
while the montage is being processed or uploaded. The film editor opened again during the render shows
it in its header, with how far it has got and the same _Cancel_, and says when the film is rendered or
why it was not; _Render…_ still opens the render panel, whose _Render the film_ waits for the render
under way to end.

## The editing project

Instead of the film editor, a processed montage can be turned into a kdenlive editing project —
_Make a kdenlive project_, beside _Edit the film_ and offered for as long as the montage has no kdenlive
project, a film already edited in SkyDock included — made from a copy of the chosen template
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
and pressing render — and the format is the editor's ordinary MP4, H.264 video with AAC sound, which
plays wherever the film is sent and needs no particular graphics card. A name, or a file name, with an
ampersand or another markup character in it comes out of the project exactly as it was typed.

**The project waits for the proxies.** This is the kdenlive project's wait, and only its: _Edit the
film_ opens the film editor at once, which plays a clip at its full size until its proxy is made. Kdenlive
opens on the proxies, and a project made before they exist
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
starts; left untold, it is kdenlive, looked for where each system keeps it. When the editor
cannot be reached from where SkyDock runs, the board says so and still names the project's path, which
copies when clicked. A project that would not open is refused with the reason.

**Templates.** A template is a folder holding its project and the music, logos and title images it
uses, referenced where they are. Bringing those files along is the template owner's part: a project
that names them by paths relative to itself finds them wherever the folder goes. A template that travelled from another machine still finds its files.
A template missing some of its files still gives a project, and the board names what is missing
straight away. **SkyDock ships with none**: a template is somebody's branding and somebody's music,
and neither is ours to hand out. Until one is brought in there is nothing to make a project from, and
pressing Make a kdenlive project says so and names where to put one.

**Choosing one.** A template is somebody's branding, so which one a project is made from is never
decided for the person — but it can be settled once. Any template can be marked **the usual one**,
and from then on a project is made from it without anybody being asked, however many there are; the
mark is taken off the same way, and a project made from the command line follows it too. Until one is
marked: with a single template that is whole, pressing Make a kdenlive project simply uses it; with several, the
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

**Open to the editor.** The editor runs as the person on the computer, while SkyDock may run as another
user (in a container, as root). Whatever the archive brought is left owned by the owner of the output
folder and readable and writable by anyone, whatever mode it was packed with, so the editor can open
every file of the template.

**Each edit is made once.** Asking again for a kdenlive project for a montage that has one is refused,
and the film editor opens on the edit that is there. The two are not one: a montage edited in SkyDock
can still be given a kdenlive project, and one with a kdenlive project can still be edited in SkyDock —
both stay in reach in its ⋯ menu. With both, the next step opens the one changed last,
and the film is whichever was rendered last.

**An edit holds the montage**, each kind of edit as far as it needs and no further.

- **A kdenlive project freezes it.** The project points at the montage's copies by name and at moments
  inside them, lives in the folder the montage's name makes, and SkyDock cannot rewrite it; a change to
  any of that would break it silently. So once a montage has a kdenlive project, what decides those
  names and which files there are is fixed: no trim, frame or turn, no file in or out, no re-timing, no
  new name, no other jump joining the montage. Its files show a lock and say why, in the same words
  wherever the lock is met: change it in kdenlive, or start the edit again. Previewing, opening the
  project and uploading go on.
- **The film editor's edit lets the montage go on changing under it.** The editor reads the copies again
  each time it opens, so files and jumps come in and go out, and clips are trimmed, framed, turned and
  re-timed as on any montage: a new copy is one more clip to choose from, and a clip whose copy is gone,
  or is now shorter than the part the edit takes of it, is named at the top of the editor — take it out,
  or process the montage again — instead of breaking the film. A **new name renames the montage whole**:
  every name in it is SkyDock's own, so its folder, its copies and their working copies, its film and its
  edit take the new name, the edit calls its clips by their new names and a title that said the old name
  says the new one, and nothing has to be processed again. The edit is kept aside first; a name another
  montage's folder already has, or a montage being processed, uploaded or rendered, is refused before
  anything moves.
- **A freed montage** has nothing of it left on this machine to change, and says that — not that it has
  an edit. A name a freed montage had is not joined: the refusal says to give the new montage another
  name, such as "Luc Favre 2".

Resetting the montage, or starting the edit again, lifts the lock.

**Starting the edit again.** _Start the edit again…_ in the ⋯ menu of a montage that has an edit asks
first, naming the edit it takes away — the film editor's, the kdenlive project, or one of the two when
it has both — then keeps it aside as every version is kept and takes it away. Nothing else moves: the
copies, the film rendered last, the name, every trim, frame and time stay, so a montage frozen by a
kdenlive project can take a file again, or a kdenlive project made from the wrong template can be made
anew, without processing forty clips again. The film editor then starts from the clips laid end to end.
Deleting the edit by hand does the same, without the copy kept aside.

**The edit is kept aside, every version of it.** Before SkyDock does anything to a montage that could
stand between the person and those hours — preparing it again, resetting it, deleting it — the project
as it stands is copied into a folder of kept edits, under the montage's folder name and the moment
it was kept. What is kept is what changed, so pressing the same button twice leaves one version rather
than two, and nothing there is ever deleted, not even when the montage is: a project is a few hundred
kilobytes beside the gigabytes it describes. Every kdenlive project in the montage's folder is kept so, whatever kdenlive's
_Save as_ named it. It also travels with every backup, whatever else was
chosen to go — the edit exists nowhere else, and a tick nobody remembers is no protection at all.
**An edit SkyDock cannot read** — one written by a newer SkyDock, or changed by hand past what the
editor allows — **is never written over.** Opening the editor puts it whole among the kept edits under a
name of its own (`<name>_<date>-<moment>.unreadable.json`), says so and why, and starts the film again
from its first edit; the hours in it are still there for whoever can read them.

**Preparing it again is allowed.** Preparing writes the copies and nothing else: the project, the film
and the archives are left exactly where they are, and each copy keeps the name the montage and the
clip's own time give it — the name the project calls it by. So a montage with an edit can be prepared
again from its originals whenever what is on the disk is not what it should be. What changes is what
those copies hold, so a clip whose trim was corrected comes out a different length and its place on the
timeline may want a look; that is the editor's to judge, and an afternoon lost to a correction nobody
can apply is worse.

## Taking a montage back

A montage can be **reset** or **deleted** from its page — from the foot of the panel at the right while it is still being worked on, and, whatever step it has reached, from the ⋯ menu of its page. Either applies to the whole montage, because
one name is one folder, and each asks first, saying what goes and what stays, naming the edit on
its own when there is one.

Both delete the same things here — the copies, the working copies, the project, the film, the archives,
and the record of what was uploaded. They differ in what they leave behind.

|                                 | The montage's name | Crops, turns, corrected times | Its jumps                                     |
| ------------------------------- | ------------------ | ----------------------------- | --------------------------------------------- |
| **Reset**, to before processing | kept               | kept                          | kept, still a montage                         |
| **Delete**, undoing the montage | forgotten          | forgotten                     | loose in Fresh files, on their cameras' times |

Starting the edit again is how an edit alone is started over; Reset goes back to before processing. Delete works at whatever step the montage has reached — named,
processed, edited, rendered, uploaded or emailed — and is offered on the montage's own panel as well as
on its page; regrouping puts its files back into jumps. Only a freed montage cannot be
deleted: nothing of it is left on this machine to put back.

Neither touches the originals or the storage, and neither can run while any jump of the montage is
being processed, uploaded or rendered: the buttons are greyed with the reason, before anything is
asked.

## Uploading a montage

A montage belongs to no destination, so uploading it says where each thing goes. It has four parts to
send, each taken whole and never file by file: its **original videos**, its **original photos** as
prepared, **the montage** itself (the rendered film), and **its edit** — the kdenlive project, the film
editor's edit, or both when it has both, called by what it is. A part the montage does not have — no
photos, say — is simply not offered. Uploading is two steps, side by side in one
dialog — the zips on the left, where it all goes on the right — and nothing is sent until its own
button is pressed.

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
`<name>_<date>_<time>.mp4` and the edit as `<name>_<date>_<time>.kdenlive`, `<name>_<date>_<time>.edit.json`,
or the two. Each is dragged onto one
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

**Refusals**, each named: no name; files still to process; no film yet, naming the film looked for;
several films in the folder, none named after the montage; a film still being written; nothing put anywhere; a destination with no folder on the storage; another
upload going, naming it. A montage
with no video at all is uploaded without a film. A film rendered under a different name, when it is
the only one there, is taken as the film, and goes up named after the montage.

Uploading again after a re-render is turned away while the earlier film, zips or folders are still up
there under the same names: they are renamed or deleted on the storage first. A zip holding exactly what it
should, newer than everything in it, is not built again. The film is taken on trust: nothing checks
that it was rendered from this project.

**What was handed over, shown afterwards.** Once a montage is uploaded, its page shows it as it went up, on the _On the storage_ tab:
one card per destination it is linked to — each named for the destination its folder is (or, where it
is none the board knows, for the folder), with the folder's path, how many things it holds, and the
folder's own link at its foot, made, copied or taken away — each listing what is in it, how big, and what
it is for. A **zip, or a folder sent as it is, is closed until its row is pressed**, and pressing it
again closes it: inside it, the videos under `videos/` and the photos under `photos/`, each with how
many and the first names, the rest a press away, and the film and the project at its top. The card the
film went into is listed first; nothing else tells one folder from another by what it is for. The
upload writes down each item, its size and the name of every entry in each zip, so this is what was
sent, not a guess. It stays the same once the montage is freed from this machine, since it is read
from the record and not from the files. A zip of a montage says how many clips and photos it holds,
since their names are only in the zip. A montage uploaded before every item was kept shows what its record
says: its film, its photos' zip and its backup, and what they hold.

**A file brought back is shown going.** While **Bring back** fetches a file from the storage, a panel in the
corner, with the other transfers', names it, says how big it is and shows how far through it is as the
bytes land. When it ends it is kept with the transfers, as _Brought back_; one that failed stays in the
corner saying why, until it is put away.

**Transfers, looked at afterwards.** The panels that show an upload, a drop from the computer, a camera
copy or a file brought back going are gone when it is done. The status bar's **Transfers** button is always there, even when
everything is done, and opens the history in the same small window at the bottom right, with the same
button to open it out: each transfer the machine kept, the latest first, says what it was of (an upload of
a montage, a drop, a camera, a file brought back), when it ended and how — done, failed or cancelled — counted as how many were
done, how many were there already and how many were not done. The latest is open; a press on another opens
it, listing every item with its size, where it went and what became of it — each with an **Open in DSM** button that shows its folder in the storage's own web interface, in a new tab — and why it stopped when
something did. It is kept on this machine, so it is there after a reload or a restart: the last 30
transfers, and of each at most 400 items — what was done comes before what was passed over, and what is not
listed is counted and said, never dropped silently. A camera plugged in again with nothing new to copy
records nothing. **Clear** forgets the list, and a small cross on a transfer forgets that one and keeps the others: in both, nothing that was sent or copied is touched.

**The small copies, made in view.** While clips are being given their small copy, a small window in the
bottom-right corner lists them, how many are made out of how many are to be, with a bar for the whole and
one of its own for the clip being made, named. It is there for as long as any is being made and goes
when every one has its copy. A board that connects makes the missing ones again, whatever took them — a
folder emptied under a running server included — and joins a pass already under way instead of starting
another. Finding where the jump is in each clip, and preparing the files of a jump, are shown the same way.

**Everything with a bar is in Transfers too.** What is going right now — an upload, files being copied in,
a camera being copied off, a file brought back from the storage, files being deleted off a camera, the small
copies of the clips being made, a montage or a dropzone being freed, a scan, files put in or taken out of
the bin, a template being added —
is listed at the head of the Transfers window, each with how far it has got, and each has its own small window
in the bottom-right corner besides, all of them alike, so the page can be left while it runs: the work runs
on the server, and what is shown follows it from whatever page is open. When it ends it is kept in the
list below. A delete off a camera is kept like the others: every file that went, or every file left alone
and why.

## Sending picked files

Files picked on the board — a jump's, loose ones, a camera's — can be sent to the storage the way a
montage is, without being one. The dialog is the same two steps: the files are offered as **videos**
and **photos**, as they are on this machine, with no film and no project; the zips are made and the
destinations chosen exactly as for a montage, and **the same item can go to several**, built once. As
they are, the videos go as the files of a `videos/` folder and the photos of a `photos/` folder. A zip
is named `<name>_<date>_<time>.<ending>.zip`, where the name is the project folder's — it starts as
"files", and typing another renames the zips with it — and the date and the time are when the first
of the files was shot. Nothing is ever shared: no link is asked for.

What was sent is not written onto the files, nor onto a jump: it is in the transfers panel, with what
went where, and sending the same files again is just sending them again — turned away, as for a
montage, while the same names are still up there. A picked file that is no longer on this machine is
left out and the rest goes. **Refusals**: nothing put anywhere; a destination with no folder on the
storage; another upload going.

## Freeing space

Once a montage is uploaded, everything of it on this machine can be deleted — originals, copies, working
copies, film and archives — and the montage's whole folder with them. The editing project is not erased: it
goes into the bin, and the record of what went where stays. It asks first, and deletes nothing until all of
this is proved:

- every file that went up has the same checksum here and on the storage as when it was sent — where it
  went to several destinations, the first is the one proved;
- the original videos went up, in a zip or as they are: a zip holds exactly what that zip is made of,
  laid out as it was, none of the originals changed since — a project in it may have been saved again
  since, because freeing puts the project in the bin anyway. A montage whose originals were never sent
  cannot be freed, since nothing then keeps them;
- the film went up, as it is or in a zip;
- the photos are exactly what their zip holds, or each went up as it is;
- nothing about the montage changed since it was uploaded.

If any check fails, nothing is deleted and each failing file is named. The storage must be reachable.
Only a montage of a single jump can be freed. A montage, or a dropzone, is not freed while it is being
processed, uploaded or rendered — _Free up space…_ is greyed with the reason — and the rest of the
board is free meanwhile.

While it goes, the small window at the bottom right shows it live: first the storage being proved to hold
each file that went up, then what is here being deleted, file by file, with the file it is on and how far
through it is. If it is refused, the window says why and stays until it is put away.

**Freed once, partly back, freed again.** A montage stops reading as freed the moment one of its files is
brought back to this machine — copied off a camera, or fetched from the storage — since something of it is
here. What freeing proved then still stands, so it can be freed again without being prepared and uploaded a
second time: what is proved is that the storage still holds each thing that went up, exactly as it was
sent, and that each file that is here is, by what it contains, a file the upload held. The prepared copies
and archives that freeing deleted are not asked for. Anything else — a file that is not the one that was
uploaded, a storage that no longer holds what was sent — refuses it, and nothing is deleted. A montage freed
before the board remembered this is recognised by having none of its prepared copies and none of what it
uploaded left on this machine.

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
asks for that file: off the card it is still on, from its page there, or — for a dropzone's file — from
**Bring back** on its row in the destination's _On the storage_ tab, which fetches it from where its upload
says it went. What comes back rejoins the jump it was in, by what it contains rather than by what it is
called, and stops reading as freed. A dropzone only ever sends the delivered copy, already trimmed,
cropped and turned, so that is what returns, with its trim, frame and turn cleared rather than applied
twice; its delivered copy went with the freeing, so it is a file to prepare again.

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
and backup are, every item that went up with its folder and its size, whether it was freed, and whether its link was emailed and to which address. A montage
is known on it by the folder its film went to. A list kept somewhere else before the lists' place was
fixed is read from there until the new one is written, and is then put in the storage's bin, so
nothing listed there is lost and there are never two lists telling different stories. There is no
page that shows it whole: each montage on this board reads its own entry — whether it was emailed, its
link, what became of its folder — and a montage this board has forgotten is not shown.

**What the storage says for itself is asked of the storage.** The list keeps what the storage cannot
say — who a montage was for, whether its passenger was emailed and at which address, that it was
freed, which files it was made of. Whether its folder is still there and whether its link still works
are asked of the storage each time the board opens and after every change to the list. A montage whose
folder is gone is shown on its page as no longer on the storage, and is not counted. One whose link was revoked or has expired is shown as having no
link; neither offers what is not there — no link to copy or email, no folder to watch — and
neither is taken off the list, the only place that says it was emailed or freed. A question the
storage did not answer takes nothing away.

The list follows the work and never replaces it. It is updated after every upload, every freeing, and
when the email is marked as sent. Each change reads the latest list first and alters only its own
montage, so several machines keep each other's entries. If the list cannot be written, the upload still
stands and the board says the list did not follow. A list that cannot be read is never written over.

## Sending the link

Once a montage has a share link, its page offers to email whoever it is for, and freeing a montage
opens the email straight away. The email is written already, in French, for a tandem passenger — the
film a montage is most often made for: it greets them by the first word of the montage's name — unless "Greet by first name" is
switched off, for a montage that is a boogie or a day and not a person, which drafts it again with no
greeting — says
what is ready and from which day, and has one button to the folder with the link repeated as text. It is shown exactly as it will arrive, and the message and the signature are written in
it, where they stand — and so is the heading, which is the subject: typing in the heading is typing in
the Subject field, and the other way round; and so is the small line above it, which starts as "Saut
en montage" ("Your jump", "Dein Sprung"). Both are plain words on one line, without the toolbar's styles.
The message and the signature take **bold**, _italic_, lists and links from a small toolbar. What is typed or
pasted keeps only those — paragraphs, line breaks, bold, italic, lists and links to a page or an email
address — and loses everything else, so text pasted from a document or a web page brings its words and
never its fonts, colours or anything that runs. The button and the link cannot be written over. The signature is the club's, remembered on this machine for every email.

**In the language of whoever it is for.** The email is written in French until another is picked for it —
English or German — and is then drafted again from that language's own template, with the day, what is
ready and the button said in that language; the variables keep their French names in every language,
since they are what the person writing the template types. The language the board is in says nothing
of theirs, so it does not decide.

**A QR code of the link** is shown on request, for whoever it is for, standing at the counter, to take it with
their phone before the email has even gone.

**The email template.** Every montage's email is drafted from the club's template, once per language, written once in
the same way — the small line above the heading, its subject and its message — and remembered on this
machine; a template written before that line could be changed says none, and gets its language's own. The words that change
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
new message — in Gmail or in the computer's own mail program, whichever is chosen beside the button,
remembered from last time — with the address
and subject filled in; the email is pasted in and sent from there. The email, the subject and the link
can also be copied on their own. The link always comes from what the upload recorded. Marking the
email as sent is kept on the board, and on the storage's list too where the montage has a row there, so
it stands whether or not the list is reachable; it can be undone. Only when Copy & open is pressed, and
the montage is not marked already, a dialog of its own asks _Was the email sent?_ and cannot be put away — not by Escape, not by a
click beside it — until one of the two answers is given: _Yes_ records it, _Not
sent_ leaves the montage to email. So a montage does not stay "to email" long after its email went.

## Not built

Worth knowing, so nobody goes looking:

- **SkyDock never sends email.** A person sends it from their own mail.
- **Every photo is handed over.** There is no choosing which photos go into the archive; the
  montage takes the videos only.
- **The film editor cuts and crossfades; it does nothing else between clips.** Clips follow each other cut to cut, with a gap of
  black between them, or with a crossfade: no other transitions, no colour work, no speed ramps (a clip has one speed), no zones laid out by a template. A film that needs
  more is made in kdenlive, which SkyDock opens but never runs itself.
- **Nothing is ever doubled on the disk.** A clip copied into another jump is still one original; each
  jump it is in makes a processed copy of its own from it.
- **A dropzone can be created, not renamed.**
- **No logo is burnt into the copies.** A club's branding is in its editing templates, on the film;
  putting it on every clip would mean encoding every clip again, and the originals handed over are
  meant untouched.
- **Two machines do not share one work folder.** One machine works in a folder at a time; nothing
  stops a second from opening the same folder over a network share, and nothing makes that safe.
- **A scan, proxies being made, and freeing are not stopped half way.** A scan reads only what is
  new; proxies are made behind everything and cost nothing to leave running; freeing deletes only
  what it has proved, one file at a time, and is quick once proved.
- **Nothing comes back from the storage on its own.** Its list of montages is read and its videos and
  photos are streamed to be watched; a file is only saved here again when somebody asks for that one
  file back.
- **Archives are made only by uploading a montage.** The originals cannot be backed up ahead of the film.

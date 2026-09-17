# SkyDock Explorer — handoff for implementation

The approved UI is `skydock-mockup.html` (one self-contained file, vanilla JS, fake data).
Open it in a browser to see it. This file lists the **decisions behind it**, so they are
implemented as rules, not guessed from the mockup code.

> Mockup ≠ production code. Re-implement in the project's own stack, components and styling.
> Start with a plan (data model, components, routes) and wait for approval before editing.

**Status — 2026-09-17.** The layout below is now the real board, down to the palette: the mockup's
tokens, IBM Plex, the 13.5px base and the dark theme are the app's own stylesheet, so a colour or a
size changed in one is changed in the other by hand in one place. Built: the places menu, the
accordion days, the one file shape with rows and thumbnails, the badges, paging, the delivered name
beside the camera name, the `changed` state, Find a file, and the NAS cards on a delivered tandem.
Both the app and this mockup carry an Auto/Light/Dark switch writing the same `data-theme`
attribute, so the two can be pinned to one theme and held side by side. The dialogs are in the
palette too: one modal shell carries the connect, folder-browser and comparison dialogs, the preview
is the mockup's centred stage with its facts column beside it, and the cropper is lit for the dark
stage it sits on. No stock Tailwind colour remains anywhere in the app.

Still only in the mockup, each because it needs server work: per-file and multi-file re-timing,
ungrouping without losing the prepared copies, a NAS check that promotes a file by checksum, rotating
and aspect-cropping a photo, downloading back from the NAS, and archiving without uploading. Two
more are front-end: `Next to sort →`, and a Regroup that re-runs the rule over unlocked jumps rather
than only over loose files. The day header's jump chips, the days toolbar with collapse/expand, and
the preview's full side panel are built — rotate and frame are drawn there but held shut. A clip's badge shows `▶` without its length, because no duration is
stored yet. The crop dialog also still opens on an uploaded file.

The mockup stays ahead of the app wherever we are still deciding — it is not frozen.

## Places (left menu, always pinned)

- **Unsorted jumps** · **Dropzones** (e.g. Yverdon, Gruyère) · **Tandems** (All passengers + one entry per passenger).
- Only the file pane scrolls; the menu never scrolls away. On phones it becomes a pinned horizontal strip.

## Days — the shape of Unsorted jumps and Dropzones

- Days listed newest first, **one day open at a time** (accordion). Default open: newest day with work left.
- **Every day can be closed** ("all closed" is a valid state that persists when switching places).
- Clicking **anywhere on a day bar** that isn't a button opens/closes it.
- Day bar: date · file count · videos/photos badges · actions at the right end.
- The open day's header is **sticky** while scrolling.
- **A re-render never moves you.** Keeping `scrollTop` is not enough — anything appearing above
  what you are reading slides it down by its own height. The position is held against a _file_:
  the first few on screen are noted, and afterwards the first of them still drawn is put back
  where it was. Raw `scrollTop` is only the fallback.
- Toolbar above days: `N days · <day> open` + `Close all days`.

**The two places diverge below the day bar** — see the next two sections. What they share is the
accordion, the sticky header, the badges and `Select day`.

### UI consistency rule

An action on a group is always a **small discreet button at the right end of that group's line**
(`Select day`, `Select jump`, `Set time`, `Regroup`, `Split`, `Merge up`, `Ungroup`…). Toggles read `Select …` / `Unselect …`.

### Videos / photos badges

- In every file list header: **`All N` · `Videos N` · `Photos N`** in Unsorted and Dropzones,
  **`Videos N` · `Photos N`** (no "All") in a tandem — 15 clips and 500 stills are two different jobs.
- **One filter for the whole board**: the badge pressed in a dropzone is still pressed in a tandem.
  Entering a tandem while "All" is active shows Videos.
- Counts are always of everything there, **never of what the filter left**.
- Shown only where there is a choice: a day of nothing but photos gets no badges.

## Unsorted jumps — the same place as a dropzone, plus grouping

Everything a dropzone day has, Unsorted has too: the badges, `Select day`, `Set time · N files`, the
accordion, the sticky header. The one difference is that its files **arrive grouped**, and the
grouping can be undone.

- Files sorted by time; when **two consecutive files are ≥ 30 min apart**, a new jump starts
  (gap measured file-to-file, not from jump start). A run of one file is still a jump.
- **A group is named, not timed.** The line reads **`Jump 2` · `09:08:20`–`09:13:16` · `10 files`** —
  the name says _why_ these files are together (almost certainly one jump), the range keeps the guess
  checkable. A bare time heading only ever said _when_.
- **Numbers are positions within the day, not identities.** Ungroup Jump 1 and the old Jump 2 becomes
  Jump 1. The range is the stable way to recognise a group.
- Day bar carries a chip per jump (`Jump 2 10`) and a dashed **`◌ loose N`** button.
- Clicking a jump chip opens that day and lands the jump just under the pinned day header
  (measure positions; sticky elements break `scrollIntoView`). The last jump must still reach the top.
- Jump lines fold/unfold; clicking anywhere on one that isn't a button toggles it. The current jump
  line is **sticky** while scrolling. **No scroll inside a scroll** here.
- Toolbar adds `Collapse jumps` · `Expand jumps` · `Regroup`.
- Jump lines carry: the name, the editable start, the range, `◆ locked`, and — at the right end —
  `Split` (needs some of that jump's files selected), `Merge up` (same day only), **`Ungroup`**,
  `Re-apply rule`, `Select jump`. Drag the line onto a dropzone or Tandems to file the whole jump.
- **`Ungroup`** breaks a jump up: its files stay in the day, in no group, and the rule leaves them
  there. This is the answer to "the rule guessed wrong and these were never one jump".

### What the rule may and may not touch

- A jump edited by hand (split, merge, retime, files moved in or out) is **locked**: rescans and
  Regroup never touch it. `Re-apply rule` unlocks it.
- **Loose files are a decision too** — someone put them outside any jump on purpose, so the rule never
  gathers them back up. Treated exactly like a locked jump by Regroup and by a rescan.
- **Regroup** (Unsorted only): pools unsorted jumps that are neither locked nor loose and re-applies
  the rule. Filed jumps untouched. The toast reports what was left alone, loose files included.

## Dropzones — flat, because that is how they land on disk

- A dropzone's files are written flat (`Yverdon/yverdon_20260801_083000.mp4`), naming comes from each
  file's own time, and Prepare/Send act on the whole day. **A jump therefore means nothing once a file
  is filed here**: filing one dissolves it, and one day is one group of files.
- No jump lines, no jump chips, no `Collapse/Expand jumps`, no loose-file concept — there is no
  group to be outside of. The day bar is: date · file count · badges · `Select day` · `Set time` · stage button.
- The place header reads **`N days · N files`**, not jumps.
- Realistic volume is 5–6 fun jumps a day, so a day is a short list, not something to navigate.

## Editing time

- **Any file's time is editable.** Click it in a row → inline **date + time (with seconds)** editor.
  Enter applies, Esc cancels. Rows only — a thumbnail shows no time to click.
- **If that file is part of the selection, the whole selection shifts with it**; otherwise just that file moves.
- **Multiple files shift by one difference**: the earliest selected file lands on the time you typed and
  the rest keep their spacing. One camera's clock was wrong, so the files move together.
- Day bars in **both** Unsorted and Dropzones offer **`Set time · N files`** as soon as anything is
  picked — same editor, prefilled with the earliest selected file's time. It acts on the whole
  selection, not just the part in that day, because a wrong clock can push files across midnight.
- In Unsorted, clicking a **jump's** start on its own line shifts every file of that jump together.
- Changing the date moves the file (or jump) to that day; a dropzone re-flattens around it.
- No `window.prompt` anywhere (blocked in embedded contexts).

## Moving files

- Selection: click = preview; Ctrl/⌘-click = toggle; Shift-click = range;
  `Select day` / `Select jump` / `Select loose` / `Select videos` / `Select photos`.
- Bottom bar shows **only** `N files selected` + `Clear (Esc)`.
- While a drag is under way, **every jump chip of every day (even closed days) and every jump line**
  is highlighted as a target. Day bars, dropzone cards and the places in the menu light up one at a
  time, under the pointer.
- Dropping files onto a jump from another day/far time: files keep their spacing and are **re-dated to follow that jump**.
- **Files moved by hand never create a time section on their own.**
  - Dropped on an **Unsorted day**, or on **Unsorted jumps** in the menu, they become **Loose files** at
    the top of that day — outside any jump, keeping their own day. Day bar shows a dashed `◌ loose N`.
  - Dropped on a **dropzone** (day or menu) they simply join that day's flat run, taking that day's date
    when dropped on a day.
- Loose files: drag onto a jump, or `Make a jump of all N` / `of N picked files` (one click, no naming).
- **Nobody types a jump name.** The name is automatic and positional (`Jump 1`, `Jump 2` within the
  day); a field to name one was explicitly removed and is not coming back.
- **Delete / Backspace** on a selection means "this isn't filed right". Nothing is ever erased:
  | Where the file is                               | What happens                                                                            |
  | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
  | In a jump in Unsorted                           | Leaves the jump, lands **loose**; the jump it left locks                                |
  | Filed in a dropzone, not yet sent               | Back to Unsorted as **loose**, status back to `local`, prepared copy dropped, crop kept |
  | Already sent to the club                        | Stays put, **stays selected**                                                           |
  | Already loose                                   | Nothing, and it says so                                                                 |
  | A mixed selection reports each part separately. |
- **Delete is quiet.** You are looking at the list the files just left, not at where they went,
  so nothing opens, nothing unfolds and nothing scrolls. A loose group created this way arrives
  **folded**, saying how much is in it. Dropping files somewhere still reveals where they landed —
  and `Ungroup` still leaves its files on screen, since that is the point of it.

## Long lists

- A list draws **40 rows / 120 thumbnails** at a time and adds more as you reach the bottom of its card,
  with `N of M shown` + `Select all M` underneath. Select-all takes every file whether drawn or not.
- Exception: inside the day accordion the whole run is drawn, to honour **no scroll inside a scroll**.
  The **tandem card does scroll internally** — it is not in the accordion, and 500 stills cannot all go
  on screen.

## Network storage

- **Connecting.** Hostname, user and password, entered once in a dialog. The password is kept
  encrypted and the session renews itself; the plain password is never written down. Asking to send
  or check while disconnected opens the login rather than failing.
- **Folders outlive the session.** A default folder, a backup folder for a tandem's original videos,
  and a folder per dropzone — browsed and picked, never guessed. Disconnecting forgets the session,
  not the folders. A dropzone with no folder is asked for one; nothing is filed somewhere
  sensible-looking.
- **A dropzone says what is already on the NAS.** Its own line carries the folder it goes to, how many
  of its files are on the NAS, how many are prepared and not sent, and **`⟳ Check the NAS`**.

### What counts as proof

A name and a size are a guess; a checksum is an answer. The check compares in the order that costs
least, and **anything uncertain is never called a match** — sending a file twice costs time, skipping
the wrong one costs the delivery.

| Found                                  | Verdict                                               |
| -------------------------------------- | ----------------------------------------------------- |
| No file of that name                   | not on the NAS                                        |
| Same name, different size              | **`≠ on NAS`** on the row — sending will overwrite it |
| Same name and size, different checksum | same marker; it is not the same file                  |
| Same name, size and checksum           | **on the NAS**, whoever put it there                  |

- **A check can promote as well as demote**, because it compares checksums on both sides. That is the
  same proof an upload has. A _listing_ still only demotes — it says a file is gone, never that it is
  the right file.
- **SkyDock never removes anything from the NAS.** No button, no code path. A file taken off is taken
  off in the NAS's own interface; the check is how the app finds out. A file it no longer finds drops
  back to **prepared**, ready to send again — the copy on this machine is untouched either way.
- **Sending re-uses the same comparison**: a file already proved to be there is not sent again, and the
  toast says how many were skipped.

## Stages and what may still be changed

Three stored states, **four shown**. The fourth is derived, not a flag anyone has to clear.

| Shown       | Means                                            | Crop / re-time / move / rename                                    |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `local`     | nothing has been made from it yet                | **yes** — this is where editing belongs                           |
| `processed` | a copy exists, made from it exactly as it is now | yes, and it becomes `changed`                                     |
| `changed`   | a copy exists and the source has moved on since  | yes — but it must be **prepared again** before it can go anywhere |
| `uploaded`  | that copy is on the NAS, proved by checksum      | **no. Locked.**                                                   |

- **Editing belongs before processing.** That is the intended moment, and nothing stops you there.
- **Editing a processed file is allowed and visible.** It turns `changed` — an amber dashed chip — rather
  than silently reverting to `local`, because "never prepared" and "prepared, then altered" are not the
  same situation. Prepare clears it by making the copy current again.
- **Editing an uploaded file is closed.** SkyDock never deletes from the NAS, so it could not take the old
  copy back; changing this one would leave the two disagreeing for good. The affordances are not offered
  rather than refused: the time is not clickable, the row is not draggable, `Save crop` is disabled with the
  reason, and a row carries a small 🔒. Where a refusal is unavoidable — a selection that happens to include
  an uploaded file — it is worded the same everywhere: _"1 file is on the NAS, so it cannot be re-timed.
  Take it off the NAS first, in the NAS's own interface."_
- A mixed selection moves what it can and names what it could not.

**A tandem's own files count as uploaded once it is delivered.** They are on the NAS — inside the
archives SkyDock built from exactly those bytes, which is the same proof an upload has. `luc_favre.mp4`
and `luc_favre.photos.zip` went to the passenger; the originals went to the backup. So they read
`uploaded` and lock like anything else, and the tooltip names the archive: _"On the NAS, inside
luc_favre_20260801.zip — changing it now would leave the archive holding something else."_ Originals
kept as **plain files** rather than a zip are individually findable up there, so they carry no archive.

**A listing can never demote an archived file.** Nothing can look inside a zip, so `Check the NAS` skips
those files rather than reading "not found" as "gone" — the same rule as everywhere else: not knowing is
not evidence.

- File status: `local` → `processed` (Prepare: copy, rename, crop, date into `<Dropzone>/`) → `uploaded` (Send to the club).
- Day action button follows the stage: `Prepare` → `Send to the club` → `✓ sent`. Unsorted days have no stage button.
- Naming line per dropzone: `Saved into Yverdon/ as yverdon_YYYYMMDD_HHMMSS.mp4`, or keep camera names (checkbox).
  **This is the only place in the app that talks about naming** — a sample, never a pattern editor.

## Preview, trim, rotate, frame

- Click a file → preview dialog with Prev/Next (← →), Esc to close.
- **Photos get Rotate and Frame too**, and the same `Save crop`. A camera mounted sideways produces
  sideways stills, not just sideways clips. Only **Trim** is video-only — a still has no duration, so
  the section and the whole timeline are absent rather than disabled.
- **Head and foot are pinned; only the body scrolls**, so `Save crop` is never below the fold.
- Video only: play/pause (Space), timeline with **trim handles** (+ "Start/End at playhead").
- **Rotate**: `↻ +90°`, `↻ +180°`, `0°` reset, R key. Quarter turn → portrait output, frame re-fitted, source dims swap.
- **The stage sits in a fixed box**: turning the footage changes the picture's shape, never the dialog's
  size. Nothing under the pointer moves.
- **The side panel keeps its controls between updates** — only values change. Rebuilding it destroyed
  the button being pressed and dropped keyboard focus.
- Trim / Rotate / Frame are **not numbered**: they are independent, not steps.
- **Frame**: None · **Same** · 9:16 · 4:5 · 1:1 · 16:9 · Free; draggable/resizable rectangle with a
  thirds grid, showing the output in pixels.
- **A chosen ratio is held while you resize.** Drag any corner and the frame keeps its shape; drag the
  middle to move it. **`Same`** keeps the footage's own proportions and follows a rotation (16:9
  becomes 9:16 after a quarter turn) — this is the one for cutting a strap, a thumb or a smudge out of
  the edge of a shot without the film ending up a different shape from every other one.
- Only **Free** lets the shape float.
- `Save crop` stores `{rot, ratio, rect, in, out}` on the file. Saving on an already-prepared file sends it back to Prepare.
- **Crop flag** on the file row/tile, e.g. `✂ ↻90° · 9:16 · 0:08–0:52`:
  **dashed amber** = saved, waiting for Prepare · **solid ✓** = applied.

## Tandems

- One passenger = one folder; everything dropped on a passenger joins that tandem (rule doesn't apply).
- Unnamed tandems wait under Tandems until named.
- **One card per passenger.** Its header carries the time range, the `Videos` / `Photos` badges, a
  select-all for the kind on screen, and the stage button. Only one kind is on screen at a time.
- **The film sits above the card, not below it.** Once it exists it is the most important thing on the
  page — the one thing here that cannot be made again — so it is not at the bottom of 500 photos.
- **Once delivered, the page stops being about the source files and becomes about the NAS.** It shows
  **one card per folder up there**, each listing exactly what is in it, with **Download** on every line:

  | Card                                     | Holds                                                                                                 | Tag                   |
  | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------- |
  | **For Luc Favre** → `/volume1/Luc Favre` | `luc_favre.mp4` · `luc_favre.photos.zip` · the share link                                             | shared with Luc Favre |
  | **Backup** → `/volume1/backup`           | `luc_favre_20260801.zip` — or the originals listed one by one, when the backup is kept as plain files | never shared          |

  Download fetches a copy back; the one on the NAS stays where it is. This is what makes a delivered
  tandem useful months later: the two folders, and a way to get either of them again.

- **The explainer goes.** "One passenger is one folder…" is about _filing_ files into a tandem — once it
  is delivered there is nothing left to file, so the page stops teaching and starts reporting.
- **The film strip goes too**, since the passenger's card already lists the film.
- **The 515 source files become a footnote**, not a card: `🔒 Made from 515 files on this machine —
15 videos, 500 photos. All on the NAS, so none of them can be changed.` with **Show them**. Nothing is
  hidden; it stops being the main event. The header's action reads `Upload again…`.
- **Dropzone days lock but do not fold.** Their files close to changes exactly as a tandem's do, but a
  dropzone folder is the running record of every day ever shot there — it is where you go to _find_ old
  footage, so collapsing sent days would hurt the thing it is for. A tandem is one finished job; a
  dropzone is an archive you browse.

## Upload (delivery comes later)

Clicking **Open in kdenlive** simulates the edit: the button reads _Editing…_, then a film appears on
the card. Nothing watches for a render in the background; the board notices when asked.

**Two parcels, and what separates them is not zipping versus sending — it is what each one waits for.**

|                       | Holds                                                            | Ready                                  | Folder                      | Link               |
| --------------------- | ---------------------------------------------------------------- | -------------------------------------- | --------------------------- | ------------------ |
| **Backup**            | `luc_favre_20260801.zip` — the originals, and the film if ticked | **as soon as the tandem is processed** | one folder for every tandem | never shared       |
| **For the passenger** | `luc_favre.mp4` + `luc_favre.photos.zip`, and nothing else       | once the film is rendered              | one per passenger           | ready to hand over |

That split is what answers "can I zip while I'm still editing": the originals never needed the film, so
**Back up originals…** sits on the tandem card from the moment it is prepared, beside _Open in kdenlive_.

**One button, whose label says what it can do right now.** The panel has a single action — `Back up
originals` before there is a film, `Upload` once there is one — and **Upload does both parcels**. Nobody
presses two buttons to put one tandem away. The early card button exists only because at that point the
backup is the only thing that _can_ happen.

**One Upload on a card, not two.** The film strip reports the film and copies the share link; acting is
the header's job.

**Settled**

- **One backup folder for every tandem.** The archive carries who and when in its name, so they can share it.
- **Photos always travel as a zip.**
- **A backup is one object.** Nothing is left loose beside the archive it belongs to; if the film is
  backed up too, it goes _inside_ that same archive.
- **The passenger's folder holds exactly two things.** The originals never go to them.

**Selecting files in a tandem does not choose what gets delivered.** Everything prepared goes: all the
photos into the zip, all the clips onto the timeline. The selection is for _fixing_ — move a stray file out,
correct its time, crop it — and any of those drops the file back to `local`, so the tandem needs preparing
again. Which clips end up in the film is decided **in kdenlive**. The button therefore reads `Select all`,
not `Select videos`, which read like picking a subset.

**The one switch:** `Keep the backup as` — **One zip** (one object to move, cannot arrive half-copied) or
**Plain files** (browsable on the NAS, one clip pulled out without unpacking 19 GB). That covers wanting a
backup without a zip, without adding a workflow.

**One upload strip, everywhere an upload happens.** Pressing Upload closes the dialog and the progress
appears **inside the header that owns the action** — a dropzone's day bar, a tandem's card header. It must
be in the header and not under it: those bars are sticky, so anything in normal flow beneath them is painted
over the moment you scroll.

It shows the phases worth watching: `Checking what is already there… 12 / 49`, then
`Uploading 9 / 20 · 55% · yverdon_20260801_111234.jpg` with a bar, then `✓ uploaded · 20 files sent ·
29 already there`, which clears itself after a few seconds. Only the strip repaints while bytes move —
a full board re-render per frame is far too expensive with thousands of rows.

**One upload at a time.** Starting a second while one is running is refused and says so.

**Built once.** Pressing again reuses what is there unless something in it changed, so a re-render does not
rebuild 19 GB. Neither folder is ever guessed; uploading without one is refused and says which.

**This step only puts things on the storage.** It is called **Upload**, not Deliver: the passenger's folder
exists and is ready, but nothing has reached them. Handing it over — the link, the message — is a later
step with its own name.

**Set once, reused after that.** Both folders and the zip-or-files choice are remembered across tandems, so
the next one opens already filled in, with a small `kept` badge on each folder. Changing anything changes it
for every tandem after it. It is one config for the club, not a decision per passenger — whether that should
ever be per tandem is still open.

## Not decided yet

- Real implementation of: camera scan, file copy/rename, ffmpeg trim/rotate/crop, upload, real video playback.

## Settled since the first draft

- _"Dropping files on an unsorted day sends them through the rule"_ — no longer true; they stay loose.
- _"One layout for Unsorted jumps and Dropzones"_ — the chrome is shared again, but a dropzone day
  is flat where an unsorted day is grouped.
- _"Hour buttons" / "hour lines"_ — they are **jumps** now, named `Jump 1`, `Jump 2` per day,
  with their range beside the name.
- _"When a day with loose files is prepared, export as-is or block?"_ — moot: loose files exist only in
  Unsorted, which has no Prepare.

# SkyDock

> A dropzone's footage, from the cameras to whoever it is for.

Plug the cameras in at the end of the day. SkyDock copies the cards, works out which files belong to
which jump, and takes each jump through to whoever it is for — renamed, cropped, uploaded to the
club's storage and sent on with a link.

## Getting it

Download the one for your machine from [Releases](https://github.com/didiercapozzi/skydock/releases):

| Machine | Download                                                       |
| ------- | -------------------------------------------------------------- |
| Mac     | `.dmg` — `aarch64` for Apple silicon, `x64` for an Intel Mac   |
| Windows | the setup `.exe`, or the `.msi`                                |
| Linux   | the `.deb`, or the AppImage if you would rather not install it |

Nobody has signed them yet, so each system says so once and then never again:

- **Mac** — it is refused the first time. Open System Settings → Privacy & Security, and choose
  **Open Anyway**.
- **Windows** — SmartScreen: **More info**, then **Run anyway**.

**The first time it opens it asks where to keep its work** — everything below lives under the folder
you pick, and it offers one in your videos. It is asked once and remembered. Pick a disk with room:
a day of footage is tens of gigabytes before anything is uploaded.

Nothing else has to be installed. SkyDock carries the tools it works with. The one exception is the
video editor, kdenlive, which you need only to render a montage's film — see step 5.

It keeps itself current: when a new version is out it says so once and asks. On Windows and Linux it
fetches the new one first, so saying yes is a restart rather than a wait; on a Mac it opens the
downloads page, since only an app signed for it can replace itself. Nothing is ever installed without
being asked.

## A day at the dropzone

**1. Plug a camera in.** A card with a `DCIM` folder on it is copied off by itself, into a folder for
the day it was shot, and the header shows it file by file. The same card plugged in again costs
nothing — what is already here is passed over. Nothing is ever written to a camera.

**2. The jumps appear.** SkyDock reads each file's capture time and groups files shot close together
into jumps, then makes a small playable copy of every clip in the background. The grouping is a
guess, and the board is there to correct it: two jumps can be merged, a file dragged from one jump to
another, loose files regrouped, and a jump's time put right when a camera's clock was wrong. **Scan**
in the header does it again at any time.

**3. File each jump.** Drag a jump onto a **destination** — Yverdon, Colombier, any place, a day's
ordinary work, everyone's together — or make it a **montage**, a film for someone: give the jump a name in its panel ("Luc Favre", "Boogie
2026") and it is one. Picked files, or a single clip, become a montage the same way. Files that already
belong to a dropzone are copied into the montage, trims and all, and the dropzone keeps its own. That
is the one decision the day actually needs, and nothing further happens to a jump until it is filed.

**4. Process.** One press per place. The files are copied into their delivery folder, renamed after
the montage or the dropzone and the time they were shot, cropped and turned the way you asked on
the board, and stamped so each file's date matches its name. The originals are never touched.

**5. The film, for a montage.** **Make the project** builds an editing project from whichever template
you chose, with the clips waiting in its bin, and opens it in kdenlive. You edit and render it there —
SkyDock prepares the project and opens the editor, and never renders anything itself. A dropzone
needs none of this.

**6. Upload.** A destination's folder goes up whole and comes back with a share link. A montage is
uploaded in two steps: first drag its parts — the original videos, the original photos, the project,
the montage — onto zips of your own, the same part into several if you like, each zip showing what is
inside; then drag the zips and the parts onto one destination or more, straight into its folder or
into the project folder. The one holding the montage gets the share link. The zips and where things
went are remembered for the next montage. A file counts as uploaded only when both sides agree on its checksum.

**7. Tell them, and get the room back.** A montage's page offers the email — written already, in
French, with the link, ready to look over before it is sent from Gmail or your own mail program.
**Free** then deletes everything of that montage from this machine, but only after proving the storage
holds every byte of it; if one file fails, nothing is deleted and it says which. A dropzone frees the
same way.

There is also a page per camera, listing what is on the card and how far each file has got. Files the
storage is proved to hold can be deleted from there to make room — and the same picks can be copied
back, which is the one way to undo a freeing.

## Where your files are

Under the folder you chose on the first run:

```
original_files/   every file exactly as it came off the camera, one folder per day
processed/        what gets handed over — one folder per destination; each montage in one of its own,
                  under Montages/
.trash/           anything put aside, and a card's files once deleted from it
```

The bin is never emptied by SkyDock. Nothing leaves your machine except what you upload.

## When something looks wrong

- **A jump is split in two, or holds a clip from another** — merge them, or drag the file out. The
  grouping is a guess by design.
- **A clip will not play** — it is waiting for its small copy, made in the background; it says so.
- **A time is an hour out** — a camera's clock. Correct the jump's time and every file in it shifts
  together.
- **Upload or Free says it cannot** — it is telling you which file failed and why. Nothing was
  deleted. That is the point of the check.

## Reading further

- **[RULES.md](./RULES.md)** — exactly what the app does and guarantees, in full. The last word on
  any question of behaviour.
- **[docs/developing.md](./docs/developing.md)** — running from source, building the installers,
  making a release.

# TODO

What is still to do. What was done is in git, not here.

## Open

Nothing is open.

## Carried over

Still wanted, not cleaning:

- Importing an editing template from a kdenlive archive, checking every file it references.
- Choosing a template per tandem, and warning when a template's kdenlive version is far from the
  editor's.
- Restoring tandems from the storage's list after a rescan from scratch, by recording each tandem's file
  identities in the list.

## Wanted

Asked for, not started. Each changes what the app does, so each comes with its RULES.md change.

- **A tandem can be deleted at any step.** Whatever it has reached — processed, edited, rendered,
  uploaded — deleting it sends its files back to Fresh files, loose. Today Delete is on the
  passenger's page and puts the jumps back as jumps, and a jump with an edit, uploaded or freed cannot
  be deleted from its panel at all (RULES, Jumps and Taking a tandem back). To settle when building
  it: what happens to the edit and the film on this machine, and what is said about what stays on the
  storage, which SkyDock never deletes.
- **The board refreshes by itself when kdenlive finishes rendering the film.** Today a film is only
  noticed the next time the board is asked to do something (RULES, Not built: "nothing notices a
  render finishing"). The stream the board already keeps open for live progress is the way to say it:
  watch the tandem's folder for the film, wait for it to stop growing, publish it, and the Rendered
  step ticks on its own.
- **A destination and a tandem are connected to their folder on the storage.** What is up there can
  be listed and watched from the board even when none of it is on this machine any more — for a
  dropzone as much as for a freed tandem. Today the storage's list names each tandem and where its
  film is, but nothing plays from the storage and a dropzone's folder is not listed at all.
- **"In progress" is not a view.** There is no overall page of every tandem: the user picks one
  tandem. (Read from "the user must select one tandem and no overall views" — to confirm whether the
  entry stays as a heading that cannot be clicked, or goes.)
- **An open tandem does not repeat itself.** With one tandem selected, its card above the files says
  what the panel on the right already says — name, date, counts, step. The card goes there; the panel
  is where a tandem is described.

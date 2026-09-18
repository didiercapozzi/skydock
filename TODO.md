# TODO — cleaning the code

RULES.md was rewritten to describe only what the app does. The code grew feature by feature and needs
the same treatment. Each item below is one change that can be done and reviewed on its own; none of
them changes behaviour, so none of them touches RULES.md.

## 1. Comments say what the logic is, not what it was

The new rule in CODING.md: a comment describes the logic beside it and why, never a state or a change.
Sweep every comment and rewrite or delete the ones that:

- tell history ("used to", "no longer", "which is how … came to", "the bug was")
- describe a state of the work ("partly built", "not yet", "for now")
- explain a fix by contrast with the old code

Known places: `web/app/hooks/usePreview.ts`, `web/app/routes/board.tsx` (the drop-on-passenger and
delivery comments), `web/app/components/file-list.tsx`, `packages/skydock-scripts/src/proxy.ts`
(encoder detection), `packages/skydock-scripts/src/process.ts`, `packages/skydock-scripts/src/upload.ts`.
Test files too: several `describe` blocks open with the story of a regression.

## 2. One helper, one place

The same small helpers are written again in several files. Move each to `@skydock/scripts` (or
`web/app/components/utils.ts` for display-only ones) and import it:

- `nameOf` / `baseName` / `dirOf` / `parentOf` — the last segment or the parent of a path, in four files
- `pad` / `pad2` / `hhmm` / `date` — time and date formatting, in five files
- `plural` — in two dialogs
- `sizeOf` — a file's size or 0, in three modules
- `passengerOf` — in `places-tree.tsx` and again in `api.manifest.ts`
- `quote`, `shell`, `runFfmpeg` — running ffmpeg and reading its complaint, once in `process.ts` and
  once in `proxy.ts`; one module for "run a tool and keep what it said"
- `formatFilmSize` lives in `tandem-card.tsx` and is imported by three dialogs; it belongs in `utils.ts`

## 3. `board.tsx` is 1,950 lines

It holds the loader, every dialog's wiring, drag and drop, the storage check, the file import, folding
state and the whole layout. Split it along the lines RULES.md already draws, each piece a hook or a
component with its own file:

- `useBoardState` — groups, loose files, places, outputs, proxies, tandem facts, and the one effect
  that reads every server answer
- `useDragAndDrop` — `dragged`, `draggedFiles`, `overTarget`, `groupDropTarget`, `dropTarget`,
  `placeDrop`, and the drop from the computer
- `useDaysAndJumps` — open days, folded jumps, `openAt`, `toggleDay`, `toggleJump`
- `useSelection` — picked files and jumps, `clickFile`, `selectAll`, Escape and Delete
- `BoardHeader`, `PlacePane`, `TandemPage`, `DialogHost` — the layout, each in its own file
- the `importDropped` loop and `importNote` — with the import route, not the page

The answer schema the board parses (`groups`, `looseFiles`, `freed`, `imported`, `storage`, …) is
declared once in `board.tsx` and mirrored by hand in `api.manifest.ts`'s returns. Declare it once in
`@skydock/scripts` and have both sides use it.

## 4. `api.manifest.ts` is one 800-line handler

One `intent` switch holds fourteen actions. Each intent becomes its own function in its own file under
`web/app/routes/manifest/`, with the shared preamble (load the manifest, work out the frozen tandems,
the refusal helper) in one place. The `deliver` and `upload-group` intents share their progress
reporting nearly line for line; extract it.

## 5. Two names for one thing

The board says **Upload**; the code still says **deliver** (`deliverTandem`, `delivered`, `deliver`
intent, `DeliverDialog`, `deliver-dialog.tsx`, `deliverScopeKey`). Rename the code to the word the rules
use — `uploadTandem`, `uploaded` record — with a migration for the record's key in saved manifests.
Likewise `groups` (code) against **jumps** (rules) is old and everywhere; leave it, but stop adding to it.

## 6. Casts and lint bypasses

18 `as` casts and 2 lint bypasses remain. Each cast is either a schema that should be parsed with Zod
(`as Parameters<typeof action>[0]` in tests, `as HTMLElement` on event targets) or a type the compiler
can be led to without it. Remove them one by one; CODING.md forbids both.

## 7. Tests that test the code, not the rules

Reworked in the same change as the rules; what is left:

- `web/tests/e2e/video-cropper.test.tsx` drives the cropper with its own synthetic events in places;
  redo the drag tests with `userEvent` as CODING.md asks
- `packages/skydock-scripts/tests/publish.test.ts` and `nas.test.ts` still check details of the
  storage's protocol (retries, session ids, header lengths). Keep one test per rule ("a file already
  there is not sent again", "the session renews itself") and drop the rest
- `web/tests/server/api.nas.test.ts` names are the protocol's; rename to the rules' words
- there is no test that a **dropzone day** is processed and uploaded end to end from the board, nor that
  the board refuses to upload while files need processing; both are rules

## 8. Smaller things

- `skydock-mockup.html` is the design the board was built from. It has drifted from the app in places
  (delivery dialog wording, email, storage list). Either bring it back in step or note in its header
  that the app is now the reference.
- `packages/ui/routing/generated/central-auth.ts` — is it used?
- `web/app/components/comparison-dialog.tsx` (576 lines) builds its own modal shell instead of `Modal`.
- The scripts package's `index.ts` barrel re-exports in three styles; one list, sorted.
- `output/.incoming/` is left behind after an import; remove it when empty.

## Carried over

Still wanted, not cleaning:

- Importing an editing template from a kdenlive archive, checking every file it references.
- Choosing a template per tandem, and warning when a template's kdenlive version is far from the
  editor's.
- Restoring tandems from the storage's list after a rescan from scratch, by recording each tandem's file
  identities in the list.

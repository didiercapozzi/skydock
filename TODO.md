# TODO — cleaning the code

RULES.md was rewritten to describe only what the app does. The code grew feature by feature and needs
the same treatment. Each item below is one change that can be done and reviewed on its own; none of
them changes behaviour, so none of them touches RULES.md.

## 1. Comments say what the logic is, not what it was — done

Every comment that told history, described a state of the work or explained a fix by contrast with
the old code was rewritten or deleted, in the code and in the tests. The rule is in CODING.md; keep
to it.

## 2. One helper, one place — done

Paths live in `packages/skydock-scripts/src/paths.ts`, running a tool and reading its complaint in
`tools.ts`, `sizeOf` and the passenger's name beside their neighbours in `utils.ts` and
`workspace.ts`, and the display helpers (`pad`, `hhmm`, `localeDate`, `plural`, `formatFilmSize`)
in `web/app/components/utils.ts`. `importFile.ts` keeps its own `pad`; it is the one place on that
side that needs it.

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

## 6. Casts and lint bypasses — mostly done

No lint bypass is left, and every cast on an event target, a state default or an empty array is
gone. What remains: the four in `packages/skydock-scripts/src/montage.ts`, where the XML parser
hands back untyped nodes — a Zod schema for the node shape would replace them — and the
`as Parameters<typeof action>[0]` in the route tests.

## 7. Tests that test the code, not the rules

Reworked in the same change as the rules; what is left:

- `web/tests/e2e/video-cropper.test.tsx` drives the cropper with its own synthetic events in places;
  redo the drag tests with `userEvent` as CODING.md asks
- `packages/skydock-scripts/tests/publish.test.ts` and `nas.test.ts` still check details of the
  storage's protocol (retries, session ids, header lengths). Keep one test per rule ("a file already
  there is not sent again", "the session renews itself") and drop the rest
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

## 9. Effects — done for now

CODING.md now says when an effect is allowed, following the React documentation. The board adopts
the server's answer during render; the preview and the comparison hand the way to seek a video up
through a callback ref. The seven effects left each talk to something outside React: two window key
listeners, a `ResizeObserver`, a non-passive wheel listener, the progress poll, and two single
requests on arrival — the board's wait on processing already running, and the folder browser's
first listing — each with a guard.

## Carried over

Still wanted, not cleaning:

- Importing an editing template from a kdenlive archive, checking every file it references.
- Choosing a template per tandem, and warning when a template's kdenlive version is far from the
  editor's.
- Restoring tandems from the storage's list after a rescan from scratch, by recording each tandem's file
  identities in the list.

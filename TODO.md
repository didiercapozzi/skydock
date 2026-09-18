# TODO — cleaning the code

RULES.md was rewritten to describe only what the app does. The code grew feature by feature and needs
the same treatment. Each item below is one change that can be done and reviewed on its own; none of
them changes behaviour, so none of them touches RULES.md.

## Open

Nothing from the cleaning plan is open. What the cleaning turned up, and did not do because it is
not cleaning:

- **Comparing two jumps has no way in.** RULES (The board, Comparing) says two jumps can be picked and
  compared side by side, then merged. The comparison dialog and the merge exist and are wired, but
  nothing on the board picks two jumps any more, so the dialog never opens. Either put the picking
  back or take the rule and the dialog out.
- `packages/ui/routing/generate-public-routes.test.ts` points at `apps/central-auth`, a folder from
  another project, and the ui package has no test script, so it never runs. Its generated fixture
  was removed; the test itself and `generate-public-routes.ts` are only there for each other.

## Carried over

Still wanted, not cleaning:

- Importing an editing template from a kdenlive archive, checking every file it references.
- Choosing a template per tandem, and warning when a template's kdenlive version is far from the
  editor's.
- Restoring tandems from the storage's list after a rescan from scratch, by recording each tandem's file
  identities in the list.

## Done

### 1. Comments say what the logic is, not what it was

Every comment that told history, described a state of the work or explained a fix by contrast with
the old code was rewritten or deleted, in the code and in the tests. The rule is in CODING.md.

### 2. One helper, one place

Paths live in `packages/skydock-scripts/src/paths.ts`, running a tool and reading its complaint in
`tools.ts`, `sizeOf` and the passenger's name beside their neighbours in `utils.ts` and
`workspace.ts`, and the display helpers (`pad`, `hhmm`, `localeDate`, `plural`, `formatFilmSize`)
in `web/app/components/utils.ts`.

### 3. `board.tsx` split

From 1,950 lines to 780. The route keeps its loader and the composition; the rest is:

- hooks — `useBoardState` (the manifest as the board knows it, adopting every server answer),
  `useNas` (the session and what the storage holds), `useSelection` (picked files, Escape and
  Delete), `useDragAndDrop` (what is in the air and where it may land), `useDaysAndJumps` (open days,
  folded jumps, `openAt`)
- components — `BoardHeader`, `PlacePane`, `DaysPane`, `TandemsGrid`, `TandemPage`, `SelectionBar`,
  `DialogHost`, `PreviewHost`
- helpers — `helpers/jumps.ts` (the Tandems place, a jump's day, its folder on the storage),
  `helpers/notes.ts` (the one line the board says after a change), `helpers/status.ts` (a file's
  status from what is known), `helpers/import.ts` (the copy loop for files from the computer)

The answer every change is met with is declared once, `boardAnswerSchema` in `@skydock/scripts`:
the board parses it and every server intent is typed to return it. Declaring it once caught a real
slip — the rename in item 5 had made a tandem's upload record and the count of uploaded files the
same word on the server's answer.

### 4. `api.manifest.ts` split

One handler dispatches by intent to `web/app/routes/manifest/`: one file per intent, `args.ts` for
what the board may send, `change.ts` for what every intent is handed (the manifest, where it is, the
frozen tandems, one way to refuse), `storage.ts` for recording on the storage's list, and
`progress.ts` for the progress both kinds of upload report, written once.

### 5. One word for one thing

The code says **upload** where the board does: `uploadTandem`, the `upload-tandem` intent,
`UploadDialog`, `UploadedCards`, `tandemUploadKey`, and a tandem's `uploaded` record. A jumps file
written under the old name is still read, and written back under the new one. `groups` stays.

### 6. Casts and lint bypasses

None left in the app or the scripts. The XML nodes the montage reads are described by a schema, the
route tests hand the action the arguments the framework would, and the video cropper is driven with
the real mouse.

### 7. Tests that test the rules

`publish.test.ts` and `nas.test.ts` keep one test per rule of the storage; the cropper's drags use
`userEvent`; a dropzone day is processed and uploaded end to end from the board, and the board is
seen refusing to upload while a file still needs processing.

### 8. Smaller things

The mockup says in its header that the app is the reference. The unused generated route contract is
gone. The comparison dialog is built on `Modal`. The scripts barrel is one sorted list. The import's
holding folder is removed once the file has arrived.

### 9. Effects

CODING.md says when an effect is allowed, following the React documentation. The seven effects left
each talk to something outside React — window key listeners, a `ResizeObserver`, a non-passive wheel
listener, the progress poll, and two single requests on arrival — each with a guard.

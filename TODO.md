# TODO

## Done

- Thumbnail filmstrip on crop bar (`api/thumb` + 8 lazy thumbs in VideoCropper, 1x–10x zoom, Reset button).
- Jump merge via `merge-jumps` manifest intent with date-choice popup (left/right/custom anchor, rigid shift via `shiftFiles`).
- Browser-safe `@skydock/scripts` barrel: namespace-only `node:` imports, `isCliModule` guards missing `process`; `scripts-barrel.test.tsx` regression test imports the real barrel in Chromium.

## Jump merge — semantics (implemented)

- Survivor is the left jump: keeps its `id`, `label`, and position in the array.
- Files are the union of both jumps by `path`, sorted by `mtime` ascending.
- `confirmed` is true only if both jumps were confirmed.
- `processed` is always false on the merged jump.
- Unknown or identical ids → jumps unchanged.
- Merge is disabled in the dialog when either displayed jump is processed.
- Date popup offers left date, right date, or custom date+time; merged files shift rigidly so the earliest lands on the anchor; the chosen side keeps its exact times.

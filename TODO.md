# TODO

## Done

- Thumbnail filmstrip on crop bar (`api/thumb` + 8 lazy thumbs in VideoCropper, 1x–10x zoom, Reset button).
- Jump merge via `merge-jumps` manifest intent with date-choice popup (left/right/custom anchor, rigid shift via `shiftFiles`).
- Browser-safe `@skydock/scripts` barrel: namespace-only `node:` imports, `isCliModule` guards missing `process`; `scripts-barrel.test.tsx` regression test imports the real barrel in Chromium.
- RULES.md §9 restructured into grouped subsections (9.1–9.9).
- RULES.md updated: process naming with HHMMSS, upload with chunked progress, NAS session storage.
- Phase 1 — Execute naming update: HHMMSS pattern, collision handling, skip empty dirs, .trash on re-process, filesystem timestamps, refactored execute.ts.
- Phase 2 — NAS session storage: nas.ts module, loginWithSession, dsmValidateSession, Zod schemas.
- Phase 3 — Upload chunking + progress: 10 MB chunks, per-file progress callback, retry on failure.
- Phase 5 — Process + Upload UI wiring: ConnectionDialog, NAS session validation, animated upload button.
- Phase 6 — Tests + docs: NAS connection e2e tests, RULES.md updated with inferred returns and no-commit rules.
- Jump → Group rename: All types, exports, and internal references renamed from `jump` to `group`.
- Montage: Added "Create Montage" button, `.kdenlive` project creation, zip archive creation, reprocess protection.
- Destinations: Renamed collection → destination, added `path` field, `DestinationCreationDialog` with `NasFolderBrowser`, `Destinations` component, "By Destination" toggle, `groupGroupsByDestination` utility, destination dropdown on GroupCard.
- Fixed unassigned groups duplication in By Destination view.

## Destinations & Upload

### Drag-to-assign destination

- Add drag handle on group header (chevron/label row) to drag entire groups.
- Use `application/x-group` data type to distinguish group drag from file drag.
- Make destination section headers in `Destinations` component act as drop targets.
- On drop: update group's `destination` field to the target destination name.
- Drop on "Unassigned" section clears the `destination` field.
- Visual feedback: highlight section header on drag over.
- Props: `onGroupDragStart` on GroupCard, `onAssignDestination` on Destinations.

### Destination-aware upload paths

- Upload path determined by destination: `{destination.path}/{baseName}/...` if path set, else default `{defaultFolder}/{destination.name}/...`.
- Update `upload-group` intent in `api.manifest.ts` to resolve destination path from the group's `destination` field.
- Flatten videos/photos subdirectories during upload to match NAS structure (flat folder per destination).

### Upload path helpers

- Add `resolveDestinationPath(group, destinations, defaultFolder)` helper to `@skydock/scripts`.
- Uses destination's `path` override if set, otherwise computes from destination name.

### Still needed

- DSM host URL + dedicated user credentials for live dry run.

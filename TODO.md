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
- Collections: Added `Collection` type, `collection` field on groups, `CollectionGroups` component, collection creation dialog.
- Montage: Added "Create Montage" button, `.kdenlive` project creation, zip archive creation, reprocess protection.
- Collection view: Added "By Collection" toggle in ReviewHeader, `CollectionGroups` component for viewing groups by collection.

## Process + Upload pipeline (RULES.md §6 + §13)

### Phase 1 — Execute naming update (done)

### Phase 2 — NAS session storage (done)

### Phase 3 — Upload chunking + progress (done)

### Phase 4 — NAS folder browser UI

- Custom file-tree component: expand/collapse, create folder button.
- Store selected default folder in `output/.status/nas.json`.
- Upload goes directly to default folder (no dialog).

### Phase 5 — Process + Upload UI wiring (done)

### Phase 6 — Tests + docs (done)

- E2e tests for NAS connection: connect, disconnect, dialog, error handling, upload flow.
- RULES.md §11 updated: inferred return types, never commit without user approval.

### Still needed

- DSM host URL + dedicated user credentials for live dry run.
- Upload reorganization: collection-aware upload paths (passenger → `{NAS}/tandems/{label}/`, location → `{NAS}/{collectionName}/`).

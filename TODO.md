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

## Process + Upload pipeline (RULES.md §6 + §13)

### Phase 1 — Execute naming update (done)

- Update `buildJumpBaseName` and file naming in `execute.ts` to use `{baseName}_{HHMMSS}.{ext}` pattern.
- Add collision handling: counter suffix `_1`, `_2` only when files share the same capture time.
- Skip creating empty `videos/` or `photos/` subdirectories.
- Set filesystem timestamps (creation + modification) to jump date + original capture time.
- Set EXIF metadata dates to match filename date-time.
- On re-process: move existing processed folder to `output/.trash/` before creating new one.
- Refactored execute.ts: extracted `getMediaType`, `makeFileName`, `buildFsTime`, `processJump` helpers.

### Phase 2 — NAS session storage (done)

- Create `output/.status/nas.json` schema: `{ hostname, username, sessionId, defaultFolder }`.
- Update `publish.ts` to store session ID after login.
- On app restart, validate stored session before showing login dialog.
- Password never written to disk.
- Zod schemas for DSM responses, no `as` type assertions.

### Phase 3 — Upload chunking + progress (done)

- Update `uploadFile` in `publish.ts` to use 10 MB chunks.
- Add per-file progress tracking (bytes uploaded / total).
- On failure, retry from beginning of failed file.
- Reuse share link if already exists on jump.

### Phase 4 — NAS folder browser UI

- Custom file-tree component: expand/collapse, create folder button.
- Store selected default folder in `output/.status/nas.json`.
- Upload goes directly to default folder (no dialog).

### Phase 5 — Process + Upload UI wiring (done)

- ConnectionDialog component: hostname, username, password fields.
- `/api/nas` endpoint: status, connect, disconnect intents.
- Upload handler uses stored NAS session instead of env vars.
- Session validated on mount; connect dialog shown if expired.
- JumpCard upload button shows animated spinner during upload.
- NAS status indicator in header (green dot = connected).
- Disconnect button when connected, Connect link when disconnected.

### Phase 6 — Tests + docs

- Update existing tests for new naming pattern.
- Add tests for chunked upload, progress tracking, session persistence.
- Update RULES.md if any behavior changes during implementation.

### Still needed

- DSM host URL + dedicated user credentials for live dry run.

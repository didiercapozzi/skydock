# TODO

## Done

- Thumbnail filmstrip on crop bar (`api/thumb` + 8 lazy thumbs in VideoCropper, 1x–10x zoom, Reset button).
- Jump merge via `merge-jumps` manifest intent with date-choice popup (left/right/custom anchor, rigid shift via `shiftFiles`).
- Browser-safe `@skydock/scripts` barrel: namespace-only `node:` imports, `isCliModule` guards missing `process`; `scripts-barrel.test.tsx` regression test imports the real barrel in Chromium.
- RULES.md §9 restructured into grouped subsections (9.1–9.9).

## Tandem passenger → publish pipeline

### Goal

Per jump, record the tandem passenger (firstname, lastname, email) before
processing. Use it to name the processed folder and files
(`firstname_lastname_YYYYMMDD`, all lowercase), upload the result to Synology
via the DSM API, create a share link, and open a prefilled Gmail compose
window so the user just hits Send.

### Decisions (confirmed)

- Synology access via DSM API user (`SYNOLOGY_HOST/USER/PASSWORD` env).
- No SMTP: email goes through a Gmail compose link (`to`/`su`/`body`
  prefilled) plus a `mailto:` fallback. The browser cannot report back, so
  sending is confirmed manually ("Mark as sent" → `emailedAt`, mail icon
  disabled with "Sent on {date}" tooltip).
- Per-jump button flow with explicit gating: Process → Upload (only when
  processed) → Mail (only when `shareUrl` exists). Upload starts immediately
  on click; progress via fetcher pending state (no status endpoint needed).
- Naming: `firstname_lastname_YYYYMMDD` folder, same base for files (with
  `_02`, `_03`… suffixes past the first, since the pattern has no timestamp);
  `videos/`/`photos/` subdirs kept. Date is the jump day (min mtime).
- Passenger optional: fall back to the sanitized jump label when missing.
- Freshness invariants: re-processing clears `publish`; merges start with no
  `publish` field (`mergeJumps` must drop it — it spreads the survivor);
  a new `shareUrl` clears `emailedAt`.

### Phase 0 — Config

- `SYNOLOGY_HOST/USER/PASSWORD` env vars, documented in README. Secrets never
  touch the manifest or git. Optional `dotenv` dep for a local `.env` file.

### Phase 1 — Data model (`passenger?` on jumps)

- `types.ts`: `passengerSchema` (`firstname`, `lastname`, `email`), added to
  `manifestJumpSchema` and the `jumpsFileSchema` inline object.
- `manifest.ts`: thread `passenger` through `saveManifest`, `resolveJumps`,
  the first-load migration block, `normalizeManifest`.
- `clustering.ts`: preserve `passenger` in both `reclusterJumps` branches
  (preserved jump + dominant vote) or rescans wipe it.
- Web types re-export; round-trip test (save → load keeps passenger).

### Phase 2 — Passenger editor UI (done)

- `JumpCard` shows passenger names as labels (click to edit) or an Add
  passenger button; Done saves, Cancel discards. Card title is the passenger
  name once firstname+lastname are set, else the jump label.
- Persists via `save-jumps`. `hasCompletePassenger` helper in scripts encodes
  the processing requirement (all three fields); enforced by the Phase 4
  process gate.

### Phase 3 — Naming + execute (done)

- `buildJumpBaseName` in scripts (browser-tested): lowercase base name from
  passenger or sanitized label fallback, plus jump day.
- `executeMedia` uses it for folder + file names (`_02`, `_03`… past the
  first per folder); marks jumps `processed`, clears `publish`, saves.

### Phase 4 — Process trigger

- New `process-jump` manifest intent (processing is CLI-only today): runs
  `executeMedia` for one jump, marks it processed, clears any `publish`
  state (output changed → old link invalid), returns the result.
  Requires complete passenger (`hasCompletePassenger`); otherwise 422.
- Per-jump Process button in the card header (disabled with a hint until
  passenger complete, spinner while busy, Reprocess + Processed badge after).
  Response `{jumps}` flows through the same fetcher effect as merge.

### Phase 5 — Publish module (done)

- DSM client with native `fetch`/`FormData` (Node 26, no new deps):
  `SYNO.API.Auth` login → recursive `FileStation.Upload` with
  `create_parents` + `overwrite=true` → `FileStation.Sharing.create` →
  public link → logout.
- `publish.ts`: DSM login (v6 with v3 fallback), recursive upload,
  share-link creation, logout always. Unit-tested with stubbed fetch.
- New `upload-jump` manifest intent: runs the publish module for one
  processed jump, stores `publish: { shareUrl }` (clearing any `emailedAt`),
  saves, returns `{ jumps }`.
- Email templates live in `web/public/templates/` and render client-side
  (popup blockers forbid opening windows from async responses); the upload
  response carries no rendered content.
- New optional `publish: { shareUrl, emailedAt? }` on jumps (thread through
  `types.ts`, `manifest.ts`, `clustering.ts` like `passenger`).

### Phase 6 — UI wiring (done)

- `JumpCard` header: Process button (files present, not processed), Upload
  button (only when processed, spinner while the fetcher is busy), Mail
  button (disabled with "Upload first" tooltip until `shareUrl` exists).
- Expanded share section: link, copy action, Mail button (disabled until
  `shareUrl`) with a `mailto:` fallback link, "Did you send it?" confirm
  with Mark as sent / Not yet.
- Mark as sent persists `emailedAt` via `save-jumps` and disables the icon
  with a sent-on tooltip. Fixed a real bug found by tests: header button
  clicks bubbled into the card expand toggle (stopPropagation).

### Phase 7 — Verify (tests and docs done, NAS dry run pending)

- Browser tests (editor, persist, process/upload/mail gating, mark-as-sent
  flow), pure-helper tests in `scripts-barrel.test.tsx`, template-render
  test, DSM unit tests with stubbed fetch in `packages/skydock-scripts/tests/`.
- RULES updates (§4 schema, §6 execute, §8.4 endpoints, §9 UI, §13 flow).
- README env docs.

### Still needed from you

- DSM host URL + dedicated user credentials for the live dry run.
- Email template text approval (defaults shipped in `web/public/templates/`).

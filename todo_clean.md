# CLEAN — File-by-file RULES.md / CODING.md verification

> Checklist to bring every file into compliance. Baseline: `npm run check`
> (typecheck + format + lint) **passes** — items below are behavior and style
> gaps the automated checks don't catch.
>
> Legend: `[x]` verified clean · `[ ]` needs fix · **(C)** confirmed by direct
> read · **(A)** reported by parallel review pass, confirm while fixing.
> Rule refs: `R§x` = RULES.md section, `C:x` = CODING.md bullet.

## 0. Systemic patterns (decide once, apply everywhere)

- [ ] **Explicit return types everywhere.** Dozens of files use `: string`, `: void`,
  `: Promise<…>` etc. (C3 says inferred returns). Either strip them in one pass
  or amend C3 to allow them. Files affected: most of `scripts/src`, hooks,
  `forms/schema.ts`, `forms/server.ts`, `forms/guards.ts`, `comparison-dialog`,
  `components/utils.ts`.
- [ ] **SCREAMING_SNAKE constants vs C camelCase.** `constants.ts` (C),
  `JUMP_GAP_SECONDS`, `ID_HEX_LENGTH` (C), `PROGRESS_REPORT_INTERVAL` (C),
  `POLL_INTERVAL_MS`, `DEFAULT_MAX_FIND_DEPTH`, `MIME_TYPES`, `DEFAULT_WIDTH`,
  `THUMB_COUNT`, `MAX_ZOOM`, `ISO_DATE_PATTERN` (A). Decide: rename to camelCase
  or amend CODING to allow UPPER_SNAKE for module constants.
- [ ] **`as` casts / manual checks in generic plumbing** (`packages/ui` routing +
  forms). C27 demands Zod `safeParse` everywhere; some casts are generic
  type-plumbing where Zod adds no value. Decide per site: refactor or document
  as accepted exceptions.
- [ ] **Framework-required exports** (`web/app/routes.ts` default export,
  `root.tsx` Layout/links/App/ErrorBoundary). React Router expects these shapes;
  decide arrow-const + bottom-export equivalents or record as exceptions.

## 1. packages/skydock-scripts/src (R§3-§7, §12)

- [ ] `process.ts` — mid-file `export type` (:13) (C), explicit returns (:15,20,27,38) (C)
- [ ] `types.ts` — `passengerSchema` lacks `email`, no sent-record schema, but R§12.1/§12.3/§12.4 require passenger email + sent record (C) · manual `TaskState`/`TaskStatus`/`SystemStatus` without Zod (A)
- [ ] `status.ts` — explicit `: void` returns (:24,47) (A)
- [ ] `manifest.ts` — explicit returns incl. `(f): f is ManifestFile` predicate (:6,9,18,41,45,116,161) (C)
- [ ] `uploadProgress.ts` — explicit returns (:18,21,32,41) (A)
- [ ] `scan.ts` — explicit returns (several) (A) · `mergeManifests` keys add/remove on `path`, but R§5.1 mandates content-based file ID as identity key (:104-115) (C)
- [ ] `publish.ts` — `PROGRESS_REPORT_INTERVAL` casing (C, systemic) · `publishJump` uploads everything with no SHA-256 skip and always creates a share link instead of reusing an existing one, vs R§12.3 (:128,132,134) (C)
- [ ] `test-pipeline.ts` — explicit returns (:18,28) (A) · dynamic `await import()` inside code (:44,59) (A, C17)
- [ ] `nas.ts` — explicit returns (many) (C) · manual `NasFolderEntry` next to `dsmFileEntrySchema` (:283) (C) · `saveNasSession` never `chmod 600`, vs R§12.5 (:387-394) (C)
- [ ] `execute.ts` — explicit returns (several) (A) · same base+date overwrites via `moveToTrash` with no `_1`/`_2` folder suffix, vs R§6.1/R§12.2 (:90,98) (C)
- [ ] `fileId.ts` — `ID_HEX_LENGTH` casing + explicit returns (C) · `ensureManifestFileIds` only normalizes, never computes IDs, vs R§5.0/R§8.4 (:17-22) (C)
- [ ] `workspace.ts` — explicit returns (A) · `mergeJumps` union-only is OK: rigid date-anchor shift lives in `api.manifest.ts` route, no action (C)
- [x] `index.ts` — PASS
- [ ] `utils.ts` — explicit returns (many) (A)
- [ ] `simulate.ts` — explicit `: Promise<void>` (:97) (C)
- [ ] `watcher.ts` — `POLL_INTERVAL_MS` casing, explicit returns, dynamic `await import()` (:75,76,94) (A)
- [ ] `lib/fs.ts` — `DEFAULT_MAX_FIND_DEPTH` casing, explicit returns (A)
- [ ] `lib/cli.ts` — explicit return (A)
- [ ] `lib/exif.ts` — explicit return (A)
- [ ] `clustering.ts` — explicit returns (A) · gap `== 1800` treated as same jump (`>` at :39, `<=` at :62) but R§5.2 says `≥1800` → new jump (C)
- [ ] `constants.ts` — SCREAMING_SNAKE names (systemic decision) (C)

## 2. packages/ui (CODING forms/routing/memo rules)

- [ ] `utils/common.ts` — UPPER_SNAKE, explicit return, `typeof` checks, `as unknown as` (A)
- [x] `routing/generate-public-routes.ts` — PASS
- [x] `routing/generate-public-routes.test.ts` — PASS
- [x] `routing/index.ts` — PASS
- [ ] `routing/create-safe-routing-engine.ts` — `as unknown as` / `as Record` / `in` checks / `.parse` instead of `safeParse` (:152,180,185,201,204,261,264,267,289) (A)
- [x] `routing/generate-portable-route-contract.ts` — PASS
- [ ] `routing/create-safe-routing-hooks.ts` — `useCallback`/`useMemo` import + use (C24 violation) (:1,72,91) (A) · `as FetcherSubmitTarget` / `as SubmitTarget` / `as z.infer` (:36,61,124) (A) · `_page` naming (:134) (A)
- [x] `forms/types.ts` — PASS
- [x] `forms/global-errors.tsx` — PASS
- [x] `forms/field.tsx` — PASS
- [ ] `forms/safe-form.tsx` — `useMemo` import + use (C24) (:1,29) (A) · `as never` (:36) (A)
- [ ] `forms/server.ts` — explicit return types (:31,32) (A) · `as unknown as` / `as` casts (:72,78,82) (A)
- [ ] `forms/schema.ts` — explicit return types (several) (A) · `typeof current === 'object'` checks (:30,47,58,65,97) (A)
- [x] `forms/index.ts` — PASS
- [ ] `forms/context.tsx` — `as unknown`, `as SubmitTarget` (:49,121) (A)
- [ ] `forms/guards.ts` — explicit predicate returns + `typeof` checks (:4,5,7,10) (A)

## 3. web/app routes, hooks, helpers (R§9, §12; CODING actions/forms)

- [ ] `routes/api.file.$.tsx` — `MIME_TYPES` casing (A) · `chunk as unknown as ArrayBuffer` (:48) (A) · manual range-header parse without `safeParse` (:104-111) (A)
- [ ] `routes/api.thumb.$.tsx` — `DEFAULT_WIDTH` casing (A) · manual `Number.isFinite` clamp without `safeParse` (:10,16) (A)
- [ ] `routes/api.manifest.ts` — explicit return on `parseDay` (:106) (C, mine)
- [ ] `routes/home.tsx` — `initialNas as {…}` (:98-100) (C) · `import(…).ManifestPassenger` / `as import(…).ManifestJump` (:219,250) (C) · `handleMerge = () => {}` noop wired to comparison dialog, merge never executes vs R§9.5.3 (:198) (C) · no-manifest branch has no Scan button vs R§9.4.1 (C)
- [ ] `routes/api.upload-progress.ts` — `async start()` / `cancel()` method shorthand, not arrows (:21,60) (A)
- [ ] `routes/api.nas.ts` — `toResponse(401)` vs C21 422 rule (:105,108,129,133,153) (A — likely justified for auth, record decision) · `select-folder` skips `ensureValidSession`/auto-refresh vs R§12.6 (:145-158) (A)
- [ ] `routes.ts` — inline `export default` (systemic framework decision) (A)
- [ ] `root.tsx` — `function` declarations + inline exports (systemic framework decision) (A)
- [x] `helpers/routing.ts` — PASS
- [ ] `hooks/useJumps.ts` — explicit return (:14) (A)
- [ ] `hooks/useSelection.ts` — explicit return (:16) (A)
- [ ] `hooks/useDragDrop.ts` — explicit return (:46) (A) · `handleDrop`/`executeDrop` never reject processed-jump targets vs R§9.3.3 (:75-102) (C)
- [ ] `hooks/usePreview.ts` — explicit return (:30) (A) · `next as never` (:82) (A)
- [ ] `hooks/useCompare.ts` — explicit return (:11) (A)
- [ ] `hooks/selection.logic.ts` — explicit return (:15) (A) · Meta-key claim refuted: callers OR `e.metaKey` into ctrl (C) — no action on §9.3.1
- [x] `hooks/useUploadProgress.ts` — PASS

## 4. web/app/components (R§9 UI contract; CODING forms/memo)

- [x] `components/icons.tsx` — PASS
- [ ] `components/nas-folder-browser.tsx` — string `/api/nas` URLs (C20) (A) · `eslint-disable` (:55) (A) · manual create-folder `<input>` instead of ui/forms (A)
- [x] `components/types.ts` — PASS
- [x] `components/preview-drawer.tsx` — PASS
- [x] `components/file-row.tsx` — PASS
- [ ] `components/comparison-dialog.tsx` — explicit return (:98) (A) · manual merge-date radio/date/time inputs instead of ui/forms (A)
- [x] `components/file-grid.tsx` — PASS
- [ ] `components/connection-dialog.tsx` — `target as unknown as z.infer` (:25) (C — ironic: this is the canonical forms example)
- [x] `components/drop-action-dialog.tsx` — PASS
- [ ] `components/group-creation-dialog.tsx` — `as unknown as z.infer` (:38) (A) · deep import `scripts/src/utils` instead of `@skydock/scripts` (:3) (A)
- [ ] `components/utils.ts` — explicit return (:4) (A) · hand-built `/api/file`, `/api/thumb` URLs (C20) (A)
- [x] `components/staging-tray.tsx` — PASS
- [ ] `components/jump-card.tsx` — deep import `scripts/src/utils` (:2) (C) · manual passenger/label/date editors instead of ui/forms (C) · drop onto processed jumps not blocked (`locked` covers uploading only) vs R§9.3.3 (:86,161-174) (C)
- [ ] `components/video-cropper.tsx` — `THUMB_COUNT`, `MAX_ZOOM` casing (A)
- [x] `components/home/ReviewHeader.tsx` — PASS
- [x] `components/home/Unassigned.tsx` — PASS
- [ ] `components/home/Header.tsx` — Scan button hard `disabled` always; R§9.4.1 says disabled *while scanning* (:79-84) (C)
- [ ] `components/home/EmptyManifest.tsx` — no Scan button vs R§9.4.1 (A)
- [ ] `components/home/DayGroups.tsx` — inline `import('../types')` in prop types (C17) (C)

## 5. RULES.md itself (stale vs code — needs your approval to edit)

- [ ] §6.2 + §8.4 say `process-jump` "requires complete passenger" — code (R§6.1/R§12.1) made passenger optional for Process. Update both lines.
- [ ] §6.2 `upload-jump` line still says "requires processed jump and configured storage" — incomplete since the §12.3 gating (session + folder). Align wording.

## 6. Tests & config (inventoried)

- [x] `packages/skydock-scripts/tests/` (execute, nas, publish, scan) — 60/60 pass via `npx vitest run`
- [x] `web/tests/server/` (api.file, api.nas) — 12/12 pass via `npm run test:node`
- [ ] `web/tests/e2e/` (home, nas-connection, video-cropper, scripts-barrel) — cannot run here (no Playwright chromium); run on host before closing items in §3-§4
- [x] Config/baseline — `npm run check` passes; `packages/*`, `web/*` configs untouched by this pass

## How to work this list

1. Settle §0 decisions first (they reclassify dozens of lines at once).
2. Fix top functional gaps first: merge noop (§3 home), processed-drop (§3/§4),
   clustering boundary (§1), nas chmod (§1), scan identity key (§1), passenger
   email schema (§1), Header/EmptyManifest Scan buttons (§4).
3. Re-run `npm run check` + node suites after each batch; tick boxes here.
4. Do NOT execute TODO.md items as part of this; do NOT commit without explicit request.

# CLEAN — File-by-file RULES.md / CODING.md verification

> Checklist to bring every file into compliance. Baseline: `npm run check`
> (typecheck + format + lint) **passes** — items below are behavior and style
> gaps the automated checks don't catch.
>
> Legend: `[x]` verified clean · `[ ]` needs fix · **(C)** confirmed by direct
> read · **(A)** reported by parallel review pass, confirm while fixing.
> Rule refs: `R§x` = RULES.md section, `C:x` = CODING.md bullet.

## 0. Systemic patterns (decide once, apply everywhere)

- [x] **Explicit return types — DONE:** stripped everywhere except type
      predicates (`x is Y`, required for narrowing) and recursive functions
      (`walkFiles`, `update`, `parseIsoDatesDeep`, `toResponse`) where inference
      fails. Verified by `tsc --noEmit`.
- [x] **SCREAMING_SNAKE constants — DECIDED:** CODING.md now allows
      UPPER_SNAKE_CASE for module-level constants. Existing names
      (`JUMP_GAP_SECONDS`, `ID_HEX_LENGTH`, `PROGRESS_REPORT_INTERVAL`,
      `constants.ts`, `MIME_TYPES`, `DEFAULT_WIDTH`, `THUMB_COUNT`, `MAX_ZOOM`,
      `ISO_DATE_PATTERN`, `POLL_INTERVAL_MS`, `DEFAULT_MAX_FIND_DEPTH`) are compliant
      — no renames needed.
- [x] **`as` casts / manual checks — TRIAGED:** fixed everywhere Zod applies
      (dialog submits, home loader/initialNas, range/thumb params, processedMap).
      Recorded as accepted plumbing exceptions (generic type-level code where
      runtime validation is meaningless): `packages/ui` routing/forms internals,
      `api.file` stream chunk, `usePreview as never`, `api.nas as` on session.
- [x] **Framework-required exports — ACCEPTED:** React Router idiom
      (`routes.ts` default export, `root.tsx` Layout/links/App/ErrorBoundary)
      kept; new `api.scan` route registered under the same shape.

## 1. packages/skydock-scripts/src (R§3-§7, §12)

- [x] `process.ts` — export moved to bottom, returns inferred
- [x] `types.ts` — `email` added to `passengerSchema`; `TaskState/TaskStatus/SystemStatus` now Zod schemas + `z.infer` (exported from barrel). Note: no sent-record schema exists anywhere in code — R§12.4's "sent record" has no code counterpart (follow-up: implement or amend RULES).
- [x] `status.ts` — returns inferred
- [x] `manifest.ts` — returns inferred (predicate kept)
- [x] `uploadProgress.ts` — returns inferred
- [x] `scan.ts` — returns inferred · merge is now hybrid: paths primary, content IDs detect moves (single fresh same-ID path + unique siblings) and resolve jump refs; duplicate-content paths both register (pure ID-keying would drop them — verified against rescan tests)
- [ ] `publish.ts` — casing decided · REMAINS: per-file SHA-256 skip and share-link reuse vs R§12.3 need live NAS verification (unverifiable here) — deferred
- [x] `test-pipeline.ts` — returns inferred · dynamic `await import()` kept as intentional lazy ESM (avoids circular module init), accepted exception
- [x] `nas.ts` — returns inferred · `NasFolderEntry` now `z.infer` · `saveNasSession` applies `chmod 600` (R§12.5)
- [x] `execute.ts` — returns inferred · same base+date collisions get `_1`/`_2` suffixes (R§6.1/R§12.2) · `readProcessedMap` uses Zod `safeParse` (no `as` cast)
- [x] `fileId.ts` — returns inferred · `ensureManifestFileIds` now backfills missing IDs from disk before normalizing (R§5.0/R§8.4)
- [x] `workspace.ts` — returns inferred · merge shift confirmed living in `api.manifest.ts` route, no action
- [x] `index.ts` — PASS
- [x] `utils.ts` — returns inferred
- [x] `simulate.ts` — returns inferred
- [x] `watcher.ts` — returns inferred · dynamic `await import()` kept as intentional lazy ESM, accepted exception
- [x] `lib/fs.ts` — returns inferred (recursive `walkFiles` keeps annotation, inference impossible)
- [x] `lib/cli.ts` — returns inferred
- [x] `lib/exif.ts` — returns inferred
- [x] `clustering.ts` — returns inferred · gap `≥1800` now splits (`>=` / `<`, R§5.2)
- [x] `constants.ts` — casing decided (systemic)

## 2. packages/ui (CODING forms/routing/memo rules)

- [x] `utils/common.ts` — casing decided; recursive return + `typeof`/`as` kept as generic-plumbing exceptions (Zod inapplicable to erased generics)
- [x] `routing/generate-public-routes.ts` — PASS
- [x] `routing/generate-public-routes.test.ts` — PASS
- [x] `routing/index.ts` — PASS
- [x] `routing/create-safe-routing-engine.ts` — casts/`in`/`.parse` kept as generic-plumbing exceptions (accepted, systemic)
- [x] `routing/generate-portable-route-contract.ts` — PASS
- [ ] `routing/create-safe-routing-hooks.ts` — returns stripped · REMAINS: `useCallback`/`useMemo` removal needs browser e2e (unverifiable here) — deferred; casts + `_page` kept as plumbing exceptions
- [x] `forms/types.ts` — PASS
- [x] `forms/global-errors.tsx` — PASS
- [x] `forms/field.tsx` — PASS
- [ ] `forms/safe-form.tsx` — returns stripped · REMAINS: `useMemo` removal needs browser e2e — deferred; `as never` plumbing exception
- [x] `forms/server.ts` — returns stripped (recursive/toResponse kept); casts plumbing exceptions
- [x] `forms/schema.ts` — returns stripped (recursive/predicate kept); `typeof` plumbing exceptions
- [x] `forms/index.ts` — PASS
- [x] `forms/context.tsx` — returns stripped; casts plumbing exceptions
- [x] `forms/guards.ts` — predicates kept (required); `typeof` plumbing exceptions

## 3. web/app routes, hooks, helpers (R§9, §12; CODING actions/forms)

- [x] `routes/api.file.$.tsx` — range header now Zod `safeParse` (fallback: no range); stream chunk cast kept (typed alternative breaks `on('data')` overloads — accepted exception)
- [x] `routes/api.thumb.$.tsx` — `seek`/`width` now Zod schemas with safeParse fallbacks
- [x] `routes/api.manifest.ts` — `parseDay` return inferred
- [x] `routes/api.scan.ts` — NEW: `scan` intent route calling `scanMedia`, registered in `routes.ts`, covered by `api.scan.test.ts`
- [x] `routes/home.tsx` — `initialNas` via `safeParse` (no cast); top-level `ManifestJump`/`ManifestPassenger` type imports; `handleMerge` submits `merge-jumps` + closes dialog + clears compare (R§9.5.3); Scan wired via `scanFetcher` + revalidation (R§9.4.1)
- [x] `routes/api.upload-progress.ts` — arrow-function stream handlers
- [x] `routes/api.nas.ts` — `select-folder` now validates/auto-refreshes session (R§12.6); `toResponse(401)` kept for auth failures (422 is for validation errors — recorded decision)
- [x] `routes.ts` — framework shape kept (accepted, systemic); `api.scan` registered
- [x] `root.tsx` — framework shape kept (accepted, systemic)
- [x] `helpers/routing.ts` — PASS
- [x] `hooks/useJumps.ts` — return inferred
- [x] `hooks/useSelection.ts` — return inferred
- [x] `hooks/useDragDrop.ts` — return inferred · `handleDrop` rejects processed-jump targets (R§9.3.3)
- [x] `hooks/usePreview.ts` — return inferred; `as never` plumbing exception
- [x] `hooks/useCompare.ts` — return inferred
- [x] `hooks/selection.logic.ts` — return inferred · Meta-key claim refuted (callers OR `e.metaKey`), no action
- [x] `hooks/useUploadProgress.ts` — PASS

## 4. web/app/components (R§9 UI contract; CODING forms/memo)

- [x] `components/icons.tsx` — PASS
- [ ] `components/nas-folder-browser.tsx` — REMAINS: string `/api/nas` URLs (same fetcher idiom as `home.tsx` — likely accepted pattern, confirm), `eslint-disable`, manual create-folder form (needs browser e2e) — deferred
- [x] `components/types.ts` — PASS
- [x] `components/preview-drawer.tsx` — PASS
- [x] `components/file-row.tsx` — PASS
- [ ] `components/comparison-dialog.tsx` — return inferred · REMAINS: manual merge-date form migration (needs browser e2e) — deferred
- [x] `components/file-grid.tsx` — PASS
- [x] `components/connection-dialog.tsx` — submit now `safeParse` (no cast)
- [x] `components/drop-action-dialog.tsx` — PASS
- [x] `components/group-creation-dialog.tsx` — submit now `safeParse`; barrel import
- [x] `components/utils.ts` — return inferred; hand-built media-src URLs kept (fetcher can't serve `<img>`/`<video>` src — accepted pattern)
- [x] `components/staging-tray.tsx` — PASS
- [ ] `components/jump-card.tsx` — barrel import done; drop rejection enforced in `useDragDrop` · REMAINS: passenger/label/date editor migration to ui/forms (needs browser e2e) — deferred
- [x] `components/video-cropper.tsx` — casing decided (systemic)
- [x] `components/home/ReviewHeader.tsx` — PASS
- [x] `components/home/Unassigned.tsx` — PASS
- [x] `components/home/Header.tsx` — Scan button enabled + `scanning` state (R§9.4.1)
- [x] `components/home/EmptyManifest.tsx` — Scan button added; now rendered by `home.tsx` no-manifest branch (deduped)
- [x] `components/home/DayGroups.tsx` — top-level type imports

## 5. RULES.md itself (stale vs code — needs your approval to edit)

- [x] §6.2 + §8.4 aligned (passenger optional for Process; upload needs session + folder). Note: §6.2's process line was already correct — only §8.4 + the upload lines changed.
- [x] §6.2 `upload-jump` line aligned with §12.3 gating + streamed upload.

## 6. Tests & config (inventoried)

- [x] `packages/skydock-scripts/tests/` (execute, nas, publish, scan) — 60/60 pass via `npx vitest run`
- [x] `web/tests/server/` (api.file, api.nas, api.scan) — 14/14 pass via `npm run test:node`
- [ ] `web/tests/e2e/` (home, nas-connection, video-cropper, scripts-barrel) — cannot run here (no Playwright chromium); run on host before closing deferred items (memo removal, forms migrations, merge/drop/scan UI flows)
- [x] Config/baseline — `npm run check` passes; `packages/*`, `web/*` configs untouched by this pass

## How to work this list

1. Settle §0 decisions first (they reclassify dozens of lines at once).
2. Fix top functional gaps first: merge noop (§3 home), processed-drop (§3/§4),
   clustering boundary (§1), nas chmod (§1), scan identity key (§1), passenger
   email schema (§1), Header/EmptyManifest Scan buttons (§4).
3. Re-run `npm run check` + node suites after each batch; tick boxes here.
4. Do NOT execute TODO.md items as part of this; do NOT commit without explicit request.

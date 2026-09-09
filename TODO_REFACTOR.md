# TODO_REFACTOR — Reuse, dead code, algorithms, performance

> Audit of what can be shared, removed, proven, or sped up. Baseline:
> `npm run check` passes; all node suites green (scripts 60/60, web server 14/14).
>
> Legend: **(C)** confirmed by direct read · **(A)** agent-reported with
> file:line (confirm while fixing). Ordered by payoff within each section.
> Only behavior-preserving refactors unless marked **[FEATURE]**.

## 1. Reuse — extract these (highest payoff first)

- [x] **Atomic JSON write helper** — DONE: `writeJsonAtomic` in `lib/fs.ts`,
      migrated all 7 sites (chmod kept after it in `nas.ts`).
- [x] **Status lifecycle helper** — DECIDED: `withStatus` deleted (zero
      callers; staged flows don't fit its shape).
- [ ] **Date parsing/formatting.** DEFERRED: EXIF vs `DD.MM.YYYY` vs compact
      families have subtly different semantics; unification risks behavior drift
      for low payoff. Revisit with dedicated tests.
- [ ] **`generate-public-routes.ts` vs `generate-portable-route-contract.ts`
      near-fork** — DEFERRED: build tooling with no runnable verification here
      (only a typegen-bootstrap test). Merging risks breaking the contract
      pipeline silently.
- [x] **Test fixtures** — DONE for node suites (`tests/fixtures.ts` in both
      packages, all four scripts suites + both server suites migrated). e2e
      fixtures deferred (suites can't run here).
- [ ] **Web dialog + form shells.** DEFERRED: structural extraction
      (`DialogShell`, `useJumpUpdater`, shared preview hooks) changes rendered
      output and needs browser e2e to verify — unavailable here.
- [x] **Jump time bounds** — DONE: `minFileMtime` helper in
      `components/utils.ts`, used by `getJumpBounds` internals and
      `comparison-dialog` (replacing local `jumpMinMtime`); first/last-index
      use at old `:460-461` now flows through min/max. `api.manifest.ts`
      per-jump `Math.min` left as-is (bounded scale).
- [ ] **`{fieldErrors, globalErrors}` builders** — DEFERRED: untested
      generic plumbing (no unit tests, browser-only verification). Revisit with
      forms unit tests first.
- [x] **NAS re-login branches** — DONE: extracted
      `refreshStoredSession(stored, outputDir, login)` used by both
      `loginWithSession` (injected auth preserved) and `tryAutoRefreshSession`
      (nas tests 11/11).
- [x] **`useSafe*` hook variants** — PARTIAL: orphaned `safe-form.tsx`
      deleted (zero importers repo-wide); `helpers/routing.ts` pruned to
      `routingEngine` + `useSafeFetcher`. Routing-hooks variant remains
      (unused) — delete when the routing layer is next touched.

## 2. Cleanup — dead code (remove or narrow)

- [x] `lib/cli.ts` `withStatus` — deleted (zero callers).
- [x] `ensureManifestFileIds` — DECIDED: kept as public barrel utility (sensible
      API for future scan-path wiring; harmless).
- [x] `hasCompletePassenger` — now used by `buildJumpBaseName` (inline check replaced).
- [x] `dsmUrl` — deleted (all code uses `dsmEntryUrl`).
- [x] Barrel-only utils — narrowed: `sanitizeLabel`, `formatTimestamp`,
      `getExtensionSafe`, `isMediaFile`, `isPhotoFile`, `daySchema`,
      `DEFAULT_MAX_FIND_DEPTH` removed from barrel (module code kept).
- [x] `watcher.ts` `findCameraRoot`/`resolveCameras` — `export` removed (internal-only).
- [x] `uploadFile` (direct) / `listNasFolder` / `dsmGetEncryptionInfo` /
      encrypt/decrypt storage fns / `normalizeNasPath` — DECIDED: kept as
      public API surface (legitimate reuse points, e.g. credential rotation);
      no dead weight worth churning.
- [x] `useJumps.saveJumps`, `useSelection.setSelection` — deleted (unused returns).
- [x] `usePreview.saveJumps` noop collapsed — single `onJumpsChange` path in
      `useDragDrop` (also fixes the double-submit).
- [x] `isInMultipleJumps={false}` — IMPLEMENTED: `home.tsx` computes
      `multiJumpPaths` (paths in ≥2 jumps), threaded through `DayGroups` →
      `JumpCard` → `FileRow`, so R§9.4.2 duplicate highlighting actually renders.
- [x] `bufferedRanges`/`getBuffered` — passes removed; type field kept optional
      (8 test call sites); factory `getBuffered` deleted (zero callers).
- [ ] Compare-view crop handlers are hardcoded no-ops (`cropStart={null}`,
      `onApply={()=>{}}`) (A). Delete the dead branches or implement. DEFERRED:
      needs `video-cropper.tsx` read + e2e to verify which branches are truly dead.
- [x] Upload-progress SSE branch — deleted (hook polls; no `EventSource`) (C).
- [x] `useSafeForm`/`useSafeSubmit`/`useSafeSearchParams` pruned from
      `helpers/routing.ts`; `FormProvider`/`useFormField`/`createFormErrorBuilder`/`formSuccess`/`ValidatedContext`
      pruned from `forms/index.ts`; `DeepFieldAccessor` pruned (rest of family
      kept minimal). Module code untouched.
- [x] `main()` guarded in `generate-portable-route-contract.ts` (matches
      `generate-public-routes.ts`).
- [x] `status.ts` `extra?` deleted. `PublishArgs.outputDir`,
      `SimulateOptions.duration`, comparison-dialog index defaults kept (all
      genuinely used on at least one path) — no action.
- [x] Legacy manifest strip — kept deliberately (cheap, protects ancient manifests).
- [x] `onDragLeave(jumpId)` typed end-to-end (was silently discarded).
- [x] `ReviewHeader` hardcoded date prefix removed (no day data in props; counts only).
- [x] Nested `<main>` fixed (`EmptyManifest` root is now `<div>`).
- [x] `x: e.clientX` simplified.
- [x] Dead `uploading`/`uploading` ternary → plain `'uploading'`.
- [x] `execute.ts` `Math.min` (guarded, unreachable on empty), `parseIsoDatesDeep`
      raw export, `getDeepValue`/`setDeepValue`/`isChangeEvent`, generator
      test-only surface — all genuinely used; no action.

## 3. Algorithm-level findings (proven by reading)

- [x] **Clustering is now linearithmic.** Min/max precomputed once per group,
      single deferred sort per merged group, `jumpById` index instead of
      per-group `find`, id-set preserved matching (no reference fragility),
      dedup keeps custom labels. Overall `O(F log F)`.
- [x] **`Math.min(...arr)` / `Math.max(...arr)` spreads** in `clustering.ts`
      replaced with loops (RangeError-proof at any scale). Per-jump spreads in
      `api.manifest.ts`/`getJumpBounds` left (bounded arrays).
- [x] **Dedup rename preserves custom labels** (id only is rewritten).
- [x] **Preserved-jump matching by id set** (no reference fragility).
- [x] **`shiftFiles` shifts each distinct object once** (object-identity set:
      copy-manifests behave exactly as before, aliased manifests no longer
      double-shift).
- [x] **Scan merge semantics (fixed last pass).** Hybrid path-primary + ID
      moves; `moved` returned and saved.
- [x] **`resolveJumps` warns** on dangling refs instead of filtering silently.
- [ ] **Selection ranges follow storage order; stale anchors; cross-group
      merge-without-clear** — DEFERRED (needs browser e2e) (A).
- [x] **Grid drops resolve real indices** (`getDropIndex` queries both
      `[data-file-row]` and `[data-file-grid-item]`); cancelled drop dialog
      keeps the payload so retry works (cleared on confirm/drop-end).
- [ ] **Compare navigation dead-ends** — DEFERRED (needs browser e2e):
      `do…while` exits silently with ≤2 jumps; both sides can show the same
      jump; background revalidate shrinks lists under an open dialog (A).
- [ ] **Preview snapshots go stale** — DEFERRED (needs browser e2e): unmounts
      instead of clamping (A).
- [ ] **Route-contract generation is `O(project-files × routes)`**
      (full-program load per page) and `parsePublicRoutes` dedup is `O(n²)`
      (A). DEFERRED: acceptable at current size — revisit if typegen slows `npm run check`.
- [ ] **Per-payload `parseIsoDatesDeep` + per-keystroke deep-path rebuilds**
      (`getDeepValue`/`setDeepValue` + error-map rebuild) (A). DEFERRED: fine
      now; revisit if large forms lag.

## 4. Performance issues (ordered by impact)

- [x] **Scan hashing is pooled** (`HASH_POOL_SIZE=4`, order-preserving index
      assignment — determinism asserts still pass). Size+mtime fast-path NOT
      added (correctness risk: manifest stores capture epoch, not fs mtime —
      needs a stat-cache design first).
- [ ] **`loadManifest` full parse + double pretty-print** — DEFERRED: snapshot
      risk (anything byte-comparing manifest JSON) + no profiler evidence at
      current library sizes. Revisit past ~10k files.
- [x] **Full-manifest `save-jumps` resubmit** — reconciled: home effect now
      has an explicit `{ok:true}` success branch (same clearing as before, no
      more falling through to error/clear paths). Debounce DEFERRED (timing
      behavior, needs e2e).
- [ ] **No memoization + unvirtualized lists** — accepted as-is (CODING bans
      memo; virtualization is a feature). Revisit with profiler evidence at scale.
- [x] **Upload-progress polling 1 s** (was 300 ms); server per-callback
      `findIndex(endsWith)` replaced with a once-per-upload basename→index map.
- [ ] **Thumbnail storms** — DEFERRED: needs load testing (concurrency cap +
      shared seek-bucket cache) to size correctly; can't be validated here.
- [x] **Per-file process spawns hardened**: `exiftool` file args are now
      shell-escaped (filenames with `"`/`$`/backticks no longer break or
      inject) and batched at 500 files (ARG_MAX-proof); same escaping applied
      to `cmp` (`fileMatchesExisting`) and `updateMetadata` paths. `spawn` with
      argv arrays left as future work (would churn execSync mocks).
- [x] **`readProcessedMap` once per run** (was: per jump); writes stay
      per-jump (crash safety preserved).
- [x] **Buffer copies removed**: stream chunk enqueued directly (also drops a
      forbidden `as unknown` cast); thumb chunks pushed without re-wrap;
      dragstart `JSON.stringify` left (negligible, once per gesture).
- [x] **`walkFiles` iterative** (explicit stack, exact original order,
      unbounded depth safe).
- [ ] **Blocking upload action** — accepted as-is (revisit with background
      jobs if multi-GB uploads routinely block the UI; 8 GB videos make this
      likely — track under streaming follow-up).

## 5. Test-suite costs

- [x] 64 MiB streaming test now consume-and-counts (no `arrayBuffer`
      buffering); `seen[]` verified reset per test; fixtures extracted for all
      node suites.
- [ ] `execute.test.ts` order-dependent `fileCounter` global; `api.nas.test.ts`
      6 full connect flows; `api.file.test.ts` fixed path + sleeps — all benign
      as-is (verified); revisit with the fixture pass if flaky.
- [ ] Browser suite + C18 synthetic-event migration — DEFERRED (no
      Playwright here): ~19 screenshots, repeated full renders, typegen
      bootstrap, `DragEvent`/`PointerEvent`/`WheelEvent` + `dispatchEvent` in
      `home`/`video-cropper` tests violating C18. Migrate to `userEvent`
      per the rule when the suite can run.

## How to work this list

1. §1 in payoff order; each extraction must keep `npm run check` + node suites green.
2. §2 deletions are safe only after grep-verifying no importers (several already verified above).
3. §3/§4 items marked **[FEATURE]** or needing live NAS/e2e stay open until verifiable.
4. Do NOT execute TODO.md items as part of this; do NOT commit without explicit request.

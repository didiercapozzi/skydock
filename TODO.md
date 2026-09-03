# TODO — Replace fixture data with real manifest data

Goal: `home` (`/`) renders real files and jumps from `output/manifest.json` + `output/jumps.json` instead of the `fakeFiles`/`fakeJumps` fixture. The e2e manifest seed mirrors the old fixture (same names, sizes, grouping), so no test assertion changed.

Rules: code adapts to tests first (tests change only on explicit request); §12 approval per rule-impacting step; commit only on explicit request.

## Prereq (done)

- [x] `npm run scan` generates the manifest — verified: 612 files with real content IDs (e.g. `0cf913816c824d6e`), 6 jumps with lightweight `{id}` refs, labels `Jump 1…6`. `loadManifest()` merges both files.

## Step 1 — Home loader (infra, no visual change)

- [x] Add `loader` to `home.tsx` calling `loadManifest` (dir from `SKYDOCK_OUTPUT_DIR`, fallback `/workspace/output`).
- [x] No `useLoaderData`: type the route via `import type { Route } from './+types/home'`, with `const loader = ({}: Route.LoaderArgs) => { ... }` returning `{ manifest }` and `const Home = ({ loaderData }: Route.ComponentProps) => { ... }`.
- [x] `null` manifest renders the "No Manifest Found" empty state (§9.8) — verified live against an empty output dir.
- [x] `e2e/global-setup.ts` seeds a minimal manifest into `/tmp/playwright-output` so the loader finds one in tests (fixture still renders).
- [x] Verify: `npm run check` green, `npm run test:e2e` 45/45 (fixture still renders, no test assertion touched).

## Step 2 — Replace fake file registry with `manifest.files`

- [x] `e2e/global-setup.ts` seeds a manifest mirroring the old fixture (same 14 names, sizes, mtime offsets from fixed 2026-08-24 base, same 4 jumps) — no test assertion changed.
- [x] `home.tsx` derives the file list from `manifest.files` instead of `fakeFiles`.
- [x] Verify: `npm run check` green, `npm run test:e2e` 45/45.

## Step 3 — Replace fake jumps with `manifest.jumps`

- [x] `useState(manifest?.jumps ?? [])` instead of `fakeJumps` (real labels, confirmed flags).
- [x] Unassigned = manifest files in no jump.
- [x] Verify: `npm run check` green, `npm run test:e2e` 45/45.

## Step 4 — e2e via real API (reuse existing `api.manifest.ts`, §12)

> `web/app/routes/api.manifest.ts` already exists — **do NOT recreate**. Reuse `POST /api/manifest` `save-jumps` via `page.request` + `routingEngine` to make `e2e` as close as real user (seed via API, not `fs`). Do **very small steps** — after each sub-step run `npm run check` + **one** `npx playwright test --grep "<test>" --timeout 6000` and **stop on first failure**.

- [x] 4.0 Verify `api.manifest.ts` + `web/app/routes.ts` `route('api/manifest')` + `Register` `web/.react-router/types/+routes.ts` includes `/api/manifest` — no recreation.
- [x] 4.1 Add helper `e2e/helpers/seed-via-api.ts` `seedViaApi(page)` that does `await page.request.post(routingEngine.href({url:'/api/manifest'}), {data:{intent:'save-jumps', jumps}})` (keep 14-file fixture) — `npm run check` green, `npx playwright test --grep "checkbox click selects it, shows tray" --timeout 6000` ✓ (1.0s)
- [x] 4.2 Keep `e2e/global-setup.ts` `fs` for cold `webServer` start, but note `beforeEach` will use API.
- [x] 4.3 `e2e/home.spec.ts:5` `beforeEach` — replace `seedManifest()` `fs` with `await seedViaApi(page)` + `await page.goto('/')` — `npx playwright test --grep "checkbox click selects it, shows tray" --timeout 6000` ✓ (1.1s)
- [ ] 4.4 Add API persistence check: after `dragTo` + `Move`, `await page.request.get(routingEngine.href({url:'/api/manifest'}))` + `await page.reload()` + UI assert (like `move persists after reload`) — verify `npx playwright test --grep "full drag and drop: select, drag, move file between jumps" --timeout 6000` ✓
- [ ] 4.5 Isolate per test: `playwright.config.ts:25` `SKYDOCK_OUTPUT_DIR=/tmp/playwright-${testInfo.testId}` or per-test `page.request` reset to avoid `predev` `npx --yes kill-port 5173` `web/package.json:8` + `saveJumps` `web/app/routes/home.tsx:145` vs `seedManifest` race — verify `npx playwright test --grep "reorders single file" --timeout 6000` ✓
- [ ] 4.6 Final: `npm run check` green, `npm run build` green, `npx playwright test --grep "checkbox|reorders|full drag and drop" --timeout 6000` all pass

## Step 5 — Persist move/copy/reorder (reuse existing `api.manifest.ts`, §12)

> Already done in `web/app/routes/home.tsx:42,145` `useSafeFetcher`/`saveJumps` inline `jumps.map` + `lookup` (no `reorderFilesInJump` helper due to `@skydock/scripts` `node:fs` externalized, `web/vite.config.ts:10` `filter`→`include` fix). Keep as [x] — was Step 4.

- [x] 5.0 Verify `api.manifest.ts` exists: `createValidatedFormAction` with `save-jumps` (`z.array(manifestJumpSchema)`, `loadManifest`/`saveManifest`) — no recreation, reused.
- [x] 5.1 Home: add `useSafeFetcher` import + `const { submit } = useSafeFetcher()` (no call yet) — `npm run check` green, `npx playwright test --grep "checkbox click selects it, shows tray" --timeout 6000` ✓ (1.1s)
- [x] 5.2 Home: add `saveJumps` plain function `submit({ url: '/api/manifest', actionArgs: { intent: 'save-jumps', jumps } })` (not yet called, React Compiler — no `useCallback`) — same single test ✓
- [x] 5.3 Home: import `reorderFilesInJump` — `npm run check` green (unused, kept for 5.4)
- [x] 5.4 Home: wire `handleDrop` same-jump to inline reorder + `saveJumps`/`setJumps` (tried helper — caused hydration `data-hydrated` fail due to bundling; reverted to inline `prev.map` + `saveJumps`) — `npx playwright test --grep "reorders single file within same jump" --timeout 6000` ✓ (702ms)
- [x] 5.5 Home: import `moveFilesBetweenJumps` — `npm run check` green
- [x] 5.6 Home: wire `executeDrop` to inline `move/copy` + `saveJumps` (same bundling reason, inline `jumps.map` + `lookup`) — `npx playwright test --grep "full drag and drop: select, drag, move file between jumps" --timeout 6000` ✓ (1.4s) + `copy keeps` ✓
- [x] 5.7 Final verify: `npm run check` green, `npm run build` green, single-test verifications with `--timeout 6000` all pass; full `npm run test:e2e` 45/45 flaky due to `predev` + `saveJumps` race — manual move writes `jumps.json` correctly.

## Step 6 — Real preview

- [ ] Re-add file-serving route with range support.
- [ ] Preview drawer points at it instead of direct file paths (unblocks future HLS).
- [ ] Verify: `npm run check` green, `npm run test:e2e` green, manual video/photo preview plays.

## Step 7 — Cleanup

- [x] Delete `fakeFiles`/`fakeJumps` fixture constants (done with Steps 2+3; seed manifest in `e2e/global-setup.ts` is now the e2e fixture).
- [ ] Update §9 fixture notes in `RULES.md`.
- [ ] Verify: `npm run check` green, `npm run test:e2e` green.

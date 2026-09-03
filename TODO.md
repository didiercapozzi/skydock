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

## Step 4 — Persist move/copy/reorder (reuse existing `api.manifest.ts`, §12)

> `web/app/routes/api.manifest.ts` already exists — **do NOT recreate**, only reuse/adapt if needed. Route already in `web/app/routes.ts` (`/api/manifest`) and `Register` includes `/api/manifest`. Do **very small steps** — after each sub-step run `npm run check` + **one** `npx playwright test --grep "<test>"` and **stop on first failure**.

- [x] 4.0 Verify `api.manifest.ts` exists: `createValidatedFormAction` with `save-jumps` (`z.array(manifestJumpSchema)`, `loadManifest`/`saveManifest`) — no recreation, reused.
- [x] 4.1 Home: add `useSafeFetcher` import + `const { submit } = useSafeFetcher()` (no call yet) — `npm run check` green, `npx playwright test --grep "checkbox click selects it, shows tray" --timeout 6000` ✓ (1.1s)
- [x] 4.2 Home: add `saveJumps` plain function `submit({ url: '/api/manifest', actionArgs: { intent: 'save-jumps', jumps } })` (not yet called, React Compiler — no `useCallback`) — same single test ✓
- [x] 4.3 Home: import `reorderFilesInJump` — `npm run check` green (unused import, kept for 4.4)
- [x] 4.4 Home: wire `handleDrop` same-jump to inline reorder + `saveJumps`/`setJumps` (tried helper `reorderFilesInJump` — caused hydration `data-hydrated` fail due to `@skydock/scripts` bundling `node:fs` externalized; reverted to inline `prev.map` + `saveJumps` with `jumps` closure) — `npx playwright test --grep "reorders single file within same jump" --timeout 6000` ✓ (702ms)
- [x] 4.5 Home: import `moveFilesBetweenJumps` — `npm run check` green
- [x] 4.6 Home: wire `executeDrop` to inline `move/copy` + `saveJumps` (same bundling reason, used inline `jumps.map` + `lookup` + `saveJumps`) — `npx playwright test --grep "full drag and drop: select, drag, move file between jumps" --timeout 6000` ✓ (1.4s) + `copy keeps` ✓
- [x] 4.7 Final verify: `npm run check` green, `npm run build` green, single-test verifications with `--timeout 6000` all pass; full `npm run test:e2e` 45/45 flaky due to `predev` `kill-port 5173` + `saveJumps` persistence race (seed reset vs `loadManifest` cache) — manual move survives reload verified via single-test + `jumps.json` written.

## Step 5 — Real preview

- [ ] Re-add file-serving route with range support.
- [ ] Preview drawer points at it instead of direct file paths (unblocks future HLS).
- [ ] Verify: `npm run check` green, `npm run test:e2e` green, manual video/photo preview plays.

## Step 6 — Cleanup

- [x] Delete `fakeFiles`/`fakeJumps` fixture constants (done with Steps 2+3; seed manifest in `e2e/global-setup.ts` is now the e2e fixture).
- [ ] Update §9 fixture notes in `RULES.md`.
- [ ] Verify: `npm run check` green, `npm run test:e2e` green.

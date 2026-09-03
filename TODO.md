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

- [ ] 4.0 Verify `api.manifest.ts` exists: `createValidatedFormAction` with `save-jumps` (`z.array(manifestJumpSchema)`, `loadManifest`/`saveManifest`) — no recreation needed.
- [ ] 4.1 Home: add `useSafeFetcher` import + `const { submit } = useSafeFetcher()` (no call yet) — verify `npm run check` + `npx playwright test --grep "checkbox click selects it, shows tray"`
- [ ] 4.2 Home: add `saveJumps` plain function `submit({ url: '/api/manifest', actionArgs: { intent: 'save-jumps', jumps } })` (not yet called, React Compiler — no `useCallback`) — verify same single test
- [ ] 4.3 Home: import `reorderFilesInJump` from `@skydock/scripts` — verify `npm run check`
- [ ] 4.4 Home: wire `handleDrop` same-jump branch to `reorderFilesInJump` + `saveJumps`/`setJumps` — verify `npx playwright test --grep "reorders single file within same jump"`
- [ ] 4.5 Home: import `moveFilesBetweenJumps` from `@skydock/scripts` — verify `npm run check`
- [ ] 4.6 Home: wire `executeDrop` to `moveFilesBetweenJumps` + `saveJumps` — verify `npx playwright test --grep "full drag and drop: select, drag, move file between jumps"` + `copy keeps file in both jumps`
- [ ] 4.7 Final verify: `npm run check` green, `npm run build` green, `npm run test:e2e` 45/45, manual move survives reload

## Step 5 — Real preview

- [ ] Re-add file-serving route with range support.
- [ ] Preview drawer points at it instead of direct file paths (unblocks future HLS).
- [ ] Verify: `npm run check` green, `npm run test:e2e` green, manual video/photo preview plays.

## Step 6 — Cleanup

- [x] Delete `fakeFiles`/`fakeJumps` fixture constants (done with Steps 2+3; seed manifest in `e2e/global-setup.ts` is now the e2e fixture).
- [ ] Update §9 fixture notes in `RULES.md`.
- [ ] Verify: `npm run check` green, `npm run test:e2e` green.

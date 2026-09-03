# TODO — Replace fixture data with real manifest data

Goal: `home` (`/`) renders real files and jumps from `output/manifest.json` + `output/jumps.json` instead of the `fakeFiles`/`fakeJumps` fixture. No loader and no API routes exist yet (`routes.ts` = home only).

Rules: code adapts to tests first (tests change only on explicit request); §12 approval per rule-impacting step; commit only on explicit request.

## Prereq (done)

- [x] `npm run scan` generates the manifest — verified: 612 files with real content IDs (e.g. `0cf913816c824d6e`), 6 jumps with lightweight `{id}` refs, labels `Jump 1…6`. `loadManifest()` merges both files.

## Step 1 — Home loader (infra, no visual change)

- [ ] Add `loader` to `home.tsx` calling `loadManifest` (dir from `SKYDOCK_OUTPUT_DIR`, fallback `/workspace/output`).
- [ ] No `useLoaderData`: type the route via `import type { Route } from './+types/home'`, with `const loader = ({}: Route.LoaderArgs) => { ... }` returning `{ manifest }` and `const Home = ({ loaderData }: Route.ComponentProps) => { ... }`.
- [ ] `null` manifest renders the "No Manifest Found" empty state (§9.8).
- [ ] Verify: `npm run check` green, `npm run test:e2e` 45/45 (fixture still renders, e2e untouched).

## Step 2 — Replace fake file registry with `manifest.files` ⏳ DECISION NEEDED

- [ ] Decide e2e seeding first (all 45 tests assert fixture names like `DJI_0001.MP4`):
  - (a) e2e seeds an isolated output dir via `simulateCameras` + scan, asserting generated names, or
  - (b) keep fixture behind a test-only flag.
- [ ] Derive the file list from `manifest.files` (real paths, sizes, mtimes, IDs) instead of `fakeFiles`.
- [ ] Verify: `npm run check` green, `npm run test:e2e` green on the chosen seeding.

## Step 3 — Replace fake jumps with `manifest.jumps`

- [ ] `useState(manifest.jumps)` instead of `fakeJumps` (real labels, confirmed flags).
- [ ] Unassigned = manifest files in no jump.
- [ ] Depends on the Step 2 decision.
- [ ] Verify: `npm run check` green, `npm run test:e2e` green.

## Step 4 — Persist move/copy/reorder (§12 approval required per step)

- [ ] Re-add `api.manifest` route with move/copy/reorder actions backed by `saveManifest`.
- [ ] Home submits mutations via fetcher instead of local-only state.
- [ ] Verify: `npm run check` green, `npm run test:e2e` green, manual move survives reload.

## Step 5 — Real preview

- [ ] Re-add file-serving route with range support.
- [ ] Preview drawer points at it instead of direct file paths (unblocks future HLS).
- [ ] Verify: `npm run check` green, `npm run test:e2e` green, manual video/photo preview plays.

## Step 6 — Cleanup

- [ ] Delete `fakeFiles`/`fakeJumps` fixture constants.
- [ ] Update §9 fixture notes in `RULES.md`.
- [ ] Verify: `npm run check` green, `npm run test:e2e` green.

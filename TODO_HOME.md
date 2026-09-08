# TODO: Home Route Refactor — Shorten, Clarify, Reuse

> Refactor `web/app/routes/home.tsx` (732 LOC) into a thin route shell plus reusable hooks and presentational slices. No behavior or selector changes. All `data-*` attributes, `loader` contract, and `vi.mock('@skydock/scripts')` shape preserved so `web/tests/home.test.tsx` and `web/tests/nas-connection.test.tsx` stay green.

## Decision

Keep `web/app/routes/home.tsx` as React Router 8 Framework Mode route (`loader` + default `Home`). Extract stateful logic to `web/app/hooks/*` and presentational UI to `web/app/components/home/*`. Respect `RULES.md:11`: arrow functions only, `type` over `interface`, inferred returns, exports at EOF, `useSafeFetcher`/`routingEngine`, React Compiler (no `useCallback`/`useMemo`), `createValidatedFormAction` for server actions.

## Current Inventory

```
web/app/routes/home.tsx    732  loader + 14 useState + 5 useRef + 8 useEffect + ~200 LOC handlers + ~280 LOC JSX
web/app/components/utils.ts 102  isVideoFile (via @skydock/scripts), formatSize/Time, getJumpBounds/Date, groupJumpsByDay, getFileUrl/ThumbUrl, email templates
web/app/components/jump-card.tsx 397  collapsed/expanded card, passenger editor, share/mail, drop indicator
```

`home.tsx` blocks:

| Block             | Lines   | Concern                                                                                                                                                     |
| ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| loader            | 35-42   | `process.env.SKYDOCK_OUTPUT_DIR` -> `loadManifest`                                                                                                          |
| state/refs        | 44-77   | selection, compareIds, showComparison, dropDialog/Hint, preview, jumps, videoCrop/Zoom/Time/Duration, nasConnected/dialog/error, emailTemplates, pendingRef |
| fetcher sync      | 205-295 | `submit/data` + `nasSubmit` + 4 `useEffect` (manifest response, NAS response, fetch /api/nas intent=status, email templates)                                |
| jump mutators     | 79-203  | saveJumps, handleVideoSeek/Apply/Ref, handlePassengerChange, handleMerge/Process/Upload/Connect/Disconnect, getMailUrls/handleMail/MarkSent                 |
| selection/compare | 306-376 | handleSelect (shift-range across unassignedFiles + jumps), handleCompareToggle, handlePreview                                                               |
| drag&drop         | 378-447 | handleDragStart/TrayDragStart/Drop/DragOver/DragEnd/executeDrop -> reorderFilesInJump/moveFilesBetweenJumps + getDropIndex                                  |
| derived + render  | 297-727 | manifestFiles/filesInJumps/unassignedFiles/jumpsByDay/selectedCount + header/day loop/JumpCard/StagingTray/PreviewDrawer/dialogs                            |

Tests assert `data-file-row`, `data-jump-card`, `data-staging-tray`, `data-preview-drawer`, `data-comparison-dialog`, `No Manifest Found`, reorder via `userEvent.dragAndDrop` + `getOrder()` on file rows.

## Problems

- God component mixes data fetching, selection, drag-drop, preview video, NAS, email, and layout.
- Repeated `setJumps+saveJumps` pattern in 4 handlers.
- Selection shift-range and drag-drop logic not reusable/testable in isolation.
- NAS/email/compare each add 2-3 `useState` + `useEffect` + handlers interleaved with render.
- Render JSX (~280 LOC) cannot be reused or storybooked.

## Plan — Phases (incremental, each ends with `npm run check` green)

### Phase 0 — Scaffolding (no logic moves)

- [ ] Create `web/app/hooks/` directory.
- [ ] Create `web/app/components/home/` directory.
- [ ] Add `web/app/hooks/selection.logic.ts` pure helpers (extracted from `handleSelect:306-356` without React) for isolated unit testing.

Verify: `npm run check`, no imports yet.

### Phase 1 — Extract hooks (logic only)

Create `web/app/hooks/*` (arrow functions, `type` props, inferred returns, exports at EOF):

- [ ] `hooks/useSelection.ts` (~80 LOC) — owns `selection:SelectionMap`, `lastClickedRef`, `selectedCount` derived, `handleSelect`, `clearSelection`. Inputs: `jumps`, `unassignedFiles`. Moves `handleSelect:306-356` and `selectedCount:301-304`. Extracts shift-range calc to `selection.logic.ts`.

- [ ] `hooks/useJumps.ts` (~50 LOC) — owns `jumps:ManifestJump[]`, `jumpsByDay` (via `groupJumpsByDay`), `saveJumps` (wraps `useSafeFetcher` submit to `/api/manifest`). Exposes `setJumps`, `updateJumpFiles` helper to consolidate `jumps.map` + `saveJumps` pattern used in `handleVideoApply:91-104`, `handlePassengerChange:110-114`, `handleMarkSent:190-199`.

- [ ] `hooks/useDragDrop.ts` (~90 LOC) — owns `dragDataRef`, `dropDialog:DropDialog|null`, `dropHint:DropHint|null` and handlers `handleDragStart`, `handleTrayDragStart`, `handleDrop`, `handleDragOver/Leave/End`, `executeDrop`. Internally calls `reorderFilesInJump`/`moveFilesBetweenJumps` (`@skydock/scripts:43-88`) and `getDropIndex` (`utils:82`). Inputs: `jumps`, `manifestFiles`, `saveJumps`, `setSelection`. Keeps `data-drop-indicator` contract via `dropHint`.

- [ ] `hooks/usePreview.ts` (~45 LOC) — owns `preview:PreviewState`, `videoCrop/Zoom/CurrentTime/Duration`, `videoRefRef:VideoRef` and `handlePreview:366-376`, `handleVideoSeek:86-89`, `handleVideoApply:91-104`, `handleVideoRef:106-108`, `closePreview`. Inputs: `jumps`, `unassignedFiles`, `setJumps`, `saveJumps`.

- [ ] `hooks/useCompare.ts` (~25 LOC) — owns `compareIds:string[]`, `showComparison:boolean`, `handleCompareToggle:358-364` and merge close side-effect (from `useEffect:205-228` `kind==='merge'` branch).

- [ ] `hooks/useNas.ts` (~70 LOC) — owns `nasConnected`, `showConnectionDialog`, `nasError`, `processingId`, `uploadingId`, `mailPendingId`, `nasSubmit:useSafeFetcher()`, `pendingRef` coordination. Encapsulates `useEffect:230-268` (NAS response sync + `fetch /api/nas intent=status` poll) and handlers `handleConnect:146-153`, `handleDisconnect:155-161`, `handleProcess:124-131`, `handleUpload:133-144`, `handleMerge:116-122`. Props: `jumps`, `setJumps`.

- [ ] `hooks/useEmail.ts` (~45 LOC) — owns `emailTemplates:{subject,body}|null`, `getMailUrls:163-180`, `handleMail:182-188`, `handleMarkSent:190-199`, `handleCancelMail:201-203` and `useEffect:270-295` template fetch (`fetch /templates/tandem-email.*`).

Verify per hook: `npm run check`, `npx vitest run --config=vitest.browser.config.ts tests/nas-connection.test.tsx tests/home.test.tsx` spot check (hooks not yet wired, just typecheck).

### Phase 2 — Wire hooks into route

- [ ] Update `web/app/routes/home.tsx` to compose hooks: `const {jumps, jumpsByDay, saveJumps} = useJumps(manifest)` etc. Keep `loader:35-42` unchanged, `manifestFiles/filesInJumps/unassignedFiles:297-299` as derived (or move to `useJumps`). Keep `pendingRef` for manifest `submit/data` sync (`useEffect:205-228`) either in route or inside `useJumps`.
- [ ] Remove inline `handleSelect/handlePreview/handleDrag*` bodies, delegate to hooks. Keep handler names stable for JSX props.
- [ ] Ensure `vi.mock(import('@skydock/scripts'), async (c)=>({ ...await c(), loadManifest: vi.fn()}))` preserved in tests (already fixed for `moveFilesBetweenJumps`/`hasCompletePassenger`).

Verify: `npm run check`, full `web/tests` (6 suites, ~90 tests) green, `data-*` selectors unchanged via `page.screenshot` sanity.

### Phase 3 — Extract presentational components

Create `web/app/components/home/*` (arrow functions, `type Props`, exports at EOF):

- [ ] `components/home/Header.tsx` (~55 LOC) — extracts `header:465-520` (logo `Link`, NAS dot `nasConnected ? bg-green-500 : bg-gray-400`, `Connect`/`Disconnect` buttons, disabled `Scan`). Props: `nasConnected`, `onConnectClick`, `onDisconnect`.

- [ ] `components/home/ReviewHeader.tsx` (~25 LOC) — extracts `522-567` title + `compareIds` panel + workspace hint (`Review workspace — jumps grouped by day`).

- [ ] `components/home/Unassigned.tsx` (~30 LOC) — extracts `569-595` amber box + `FileRow` list for `unassignedFiles`. Props: `files`, `selection`, `preview`, handlers.

- [ ] `components/home/DayGroups.tsx` (~40 LOC) — extracts `597-655` `jumpsByDay.map` -> `section` + checkbox + `JumpCard` with `compareIds`, `selection`, `previewedPath`, `dropHint`, handlers. Keeps `data-jump-card`, `ring-2` selection style.

- [ ] `components/home/EmptyManifest.tsx` (~10 LOC) — extracts `449-458` `No Manifest Found` fallback.

Verify: `npm run check`, `npx vitest run --config=vitest.browser.config.ts tests/home.test.tsx` — `No Manifest Found`, reorder, staging tray, compare still pass.

### Phase 4 — Final shell and cleanup

- [ ] Reduce `web/app/routes/home.tsx` to ~220 LOC thin orchestrator: `loader` + `Home = ({loaderData}) => { hooks }` + `if (!manifest) return <EmptyManifest/>` + `<main><Header/><ReviewHeader/><Unassigned/><DayGroups/><StagingTray/><PreviewDrawer/><DropActionDialog/><ComparisonDialog/><ConnectionDialog/></main>`.
- [ ] Ensure no `useCallback`/`useMemo`/`memo` added (React Compiler). All imports at top, `export { loader }` + `export default Home` at EOF.
- [ ] Run `oxfmt`, update `RULES.md:8.1` route map if needed (no behavior change, so optional).
- [ ] Delete dead inline code, verify `oxlint` only pre-existing `home.tsx:35` `no-empty-pattern` warning remains.

Verify: `npm run check` (typecheck + format:check + lint), `web/tests` full suite, `scripts-barrel.test.tsx` still green, `npm run build` (React Router) passes.

## File Change Summary

| File                                        | Action                                            |
| ------------------------------------------- | ------------------------------------------------- |
| `web/app/hooks/useSelection.ts`             | NEW — selection state + shift-range logic         |
| `web/app/hooks/selection.logic.ts`          | NEW — pure helpers for selection                  |
| `web/app/hooks/useJumps.ts`                 | NEW — jumps state + saveJumps                     |
| `web/app/hooks/useDragDrop.ts`              | NEW — drag refs + drop handlers                   |
| `web/app/hooks/usePreview.ts`               | NEW — preview + video crop state                  |
| `web/app/hooks/useCompare.ts`               | NEW — compareIds + showComparison                 |
| `web/app/hooks/useNas.ts`                   | NEW — NAS + process/upload state                  |
| `web/app/hooks/useEmail.ts`                 | NEW — email templates + mail handlers             |
| `web/app/components/home/Header.tsx`        | NEW — header bar                                  |
| `web/app/components/home/ReviewHeader.tsx`  | NEW — title + compare panel                       |
| `web/app/components/home/Unassigned.tsx`    | NEW — unassigned files box                        |
| `web/app/components/home/DayGroups.tsx`     | NEW — day sections + JumpCard loop                |
| `web/app/components/home/EmptyManifest.tsx` | NEW — empty fallback                              |
| `web/app/routes/home.tsx`                   | Edit — compose hooks + components, ~732->~220 LOC |
| `web/app/components/utils.ts`               | No change (already DRY via @skydock/scripts)      |
| `web/app/components/jump-card.tsx`          | No change                                         |
| `RULES.md`                                  | Edit — §8.1 if route map changes                  |

## Verification per Phase

Each phase ends with `npm run check` and must keep `~90` browser tests green (home 30+, nas-connection 9, video-cropper 9, scripts-barrel 6, api.file 6, etc). Manual spot-check: `npx vitest run --config=vitest.browser.config.ts tests/home.test.tsx tests/nas-connection.test.tsx`.

## Out of Scope

- `web/app/components/jump-card.tsx:397`, `preview-drawer.tsx`, `comparison-dialog.tsx`, `video-cropper.tsx` — no changes.
- `packages/skydock-scripts` — no changes (already refactored).
- `RULES.md` §9 Review UI behavior — no changes.
- Server `loader`/`action` contracts — no changes.

## Status

- [ ] Phase 0 — Scaffolding
- [ ] Phase 1 — Extract hooks
- [ ] Phase 2 — Wire hooks into route
- [ ] Phase 3 — Extract presentational components
- [ ] Phase 4 — Final shell and cleanup
- [ ] Final `npm run check` + `RULES.md` update

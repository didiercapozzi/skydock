# TODO — Tests for 9.6 Drag & Drop

> Covers RULES.md §9.6 Transitions — Drag & drop. All tests live in `web/tests/home.test.tsx` (React Router `createRoutesStub`, `vitest-browser-react` + `vitest/browser` `page`/`userEvent`). Mock `@skydock/scripts` (`loadManifest`) — never import Node builtins in browser.

## 9.6.1 Drag sources

- [ ] **File row carries single file** — drag `DJI_0003.MP4` from `jump_01` (`dropTo` on same jump) and assert it reorders; verify payload is `[file.path]` via DOM reorder.
- [ ] **File row carries multi-selection** — select 3 files via `Ctrl` click, drag one of them; assert all 3 move together to drop position (grouped `DragData`).
- [ ] **Staging tray as source** — select files from `unassigned` + `jump_01`, drag from tray (`[data-staging-tray]`) onto `jump_02`; assert tray payload groups by `sourceJump` and files appear in target.

## 9.6.2 Drop targets

- [ ] **Jump card shows Move/Copy/Cancel dialog** — drag file from `jump_01` to `jump_02`; assert dialog at mouse position, `Move`/`Copy`/`Cancel` buttons visible, selection cleared after `Move`/`Copy`.
- [ ] **Cross-jump Move vs Copy** — `Move` removes from source, `Copy` keeps in source; test both via dialog buttons.
- [ ] **Same jump reorders directly — no dialog** — drag `DJI_0008` to second position within same jump (`targetPosition: {x:10,y:2}` + `expect.poll(getOrder)`); assert no dialog appears.

## 9.6.3 Constraints

- [ ] **Processed jump rejects drop** — manifest `jumps[0].processed=true`; drag onto it and assert no reorder, no dialog, files unchanged.
- [ ] **Drag references cleared after drop** — after successful drop, second immediate drop without new `dragStart` does nothing (payload cleared).
- [ ] **Drop indicator visible during dragOver** — hover over `[data-file-row]` inside `JumpCard`; assert `[data-drop-indicator]` appears at correct `dropIndex` and disappears on `dragLeave`/`dragEnd`.

## 9.6.4 Staging tray

- [ ] **Visible when files selected, hidden otherwise** — assert tray not in DOM initially, appears after selection, disappears after `Clear`.
- [ ] **Holding area — not a drop target** — drag a file onto tray and assert no state change.
- [ ] **Drag source only** — drag from tray onto jump works (see 9.6.1); drag from file row onto tray does nothing.
- [ ] **Clear resets selection** — `Clear` button removes all `selection` highlights and hides tray.

## 9.6.5 User interactions

- [ ] **Within-jump reorder (existing)** — 10-file jump, `userEvent.dragAndDrop(DJI_0008 → DJI_0002, targetPosition: {x:10,y:2})` → order `[0001,0008,0002,0003,0004,0005,0006,0007,0009,0010]`.
- [ ] **Between-jump Move/Copy dialog** — cover both options for 9.6.5 (reuse 9.6.2).
- [ ] **Tray as intermediate for far target** — scroll not needed in test; simulate: select → tray visible → `userEvent.dragAndDrop(tray → far jump)` → verify files moved.

## Shared helpers

- [ ] `makeFiles(n)` + `makeManifest({files, jumps})` — 10 files for intra-jump, 2 jumps + unassigned for cross-jump.
- [ ] `getOrder()` — `Array.from(document.querySelectorAll('[data-file-row]')).map(el => el.querySelector('span.font-mono')?.textContent)` polled.
- [ ] `renderHome(manifest, extraRoutes)` — `createRoutesStub([{path:'/', Component:Home, loader:()=>({manifest})}, {path:'/api/manifest', action: async()=>({ok:true})}])` + `createElement(Stub)`.

## Execution

- [ ] Each test uses `page`/`userEvent` (most visually e2e realistic, Playwright provider) — no manual `new DragEvent` — to avoid false positives from synthetic-only drops.
- [ ] Screenshots per test: `page.screenshot({path:'./playwright-screenshots/home-*.png'})` — gitignored (`web/.gitignore` + `.gitignore` `playwright-screenshots/`).
- [ ] Run `npm run test:b -- --run` (3+ tests) + `npm run check` before commit.

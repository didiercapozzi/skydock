# TODO

## Done — 9.6 Drag & Drop (RULES §9.6) — `web/tests/home.test.tsx` (12 tests, `page`/`userEvent`)

> Mock `@skydock/scripts` (`vi.mock(import('@skydock/scripts'))`), `createRoutesStub` + `createElement(Stub)`, `mergeConfig(viteConfig)` for Tailwind in `vitest.browser.config.ts`.

- [x] **9.8** `No Manifest Found` + `Review Proposed Jumps` + `SkyDock` header — 2 tests, screenshots `home-no-manifest.png` / `home-with-manifest.png`
- [x] **9.6.5** Within-jump reorder — 10 files `DJI_0008 → 2nd` via `userEvent.dragAndDrop(source, target, {targetPosition})` + `expect.poll(getOrder)` + `home-drag-reorder.png`
- [x] **9.6.1** File row `draggable` + carries single file; Staging tray as source (`[data-staging-tray]` `draggable`)
- [x] **9.6.2** Jump card cross-jump shows `Move`/`Copy`/`Cancel` dialog (`[data-drop-dialog]`); same-jump reorders without dialog
- [x] **9.6.3** Drop indicator `[data-drop-indicator]` during `dragover`, cleared after `drop`/`dragLeave`; drag refs cleared
- [x] **9.6.4** Staging tray visible when selected / hidden after `Clear`, `draggable`, not a drop target (implicit via no state change), `Clear` resets
- [x] **9.6.5** `Move` removes from source / `Copy` keeps (dialog asserts)
- [x] Helpers `makeFiles`/`makeManifest`/`getOrder`/`renderHome`, `userEvent` realistic (Playwright `dragAndDrop`/`click`/`hover` + `targetPosition` for above/below), `expect.poll` + `page.screenshot`, gitignored `playwright-screenshots/`

## Next — Video Cropper (RULES §9.11, §9.14)

> New component `web/app/components/video-cropper.tsx` — own file per RULES — with tests `web/tests/video-cropper.test.tsx`. All browser tests use `page`/`userEvent` (most visually realistic, no `new DragEvent` synthesis) to avoid false positives.

### Component spec (RULES 9.11)

- Seek clamps `0..duration`; if buffered → seek directly, else commit offset (HLS restart)
- Time from screen position via `boundingRect` (`clientX - rect.left / width * duration`)
- Wheel zoom centered on cursor (`zoom` state, pointer position preserved)
- Pointer events for dragging crop markers (`[data-crop-start-handle]` / `[data-crop-end-handle]`)
- `Start here` / `End here` sets `cropStart`/`cropEnd` to `currentTime`
- `Apply` saves crop to manifest (`onApply`)

### Tests to write (`web/tests/video-cropper.test.tsx`) — DONE (10 tests)

- [x] **Seek clamps** — click beyond bar → `onSeek(0)` / `onSeek(duration)`; click middle → `onSeek(duration/2)` — `video-cropper-seek-clamp.png`
- [x] **Buffered vs unbuffered** — with `buffered=[0,5]` seek inside → `onSeek` directly; seek outside → `onCommitOffset` called
- [x] **Time from bounding rect** — mock `getBoundingClientRect` (`left:100,width:1000`), click at `clientX:600` → `onSeek(5)` for `duration=10`
- [x] **Wheel zoom centered on cursor** — `wheel` with `deltaY` at `clientX` → `onZoomChange` and playhead stays at cursor time; clamp `1..5` — `video-cropper-wheel.png`
- [x] **Pointer drag crop markers** — `pointerDown` on start handle → `pointerMove` → `pointerUp` updates `cropStart`; same for end; clamps `start < end`
- [x] **Start/End here** — `currentTime=3.5`, click `Start here` → `cropStart=3.5`; `End here` → `cropEnd=3.5`
- [x] **Apply saves crop** — set range then `Apply` → `onApply({cropStart, cropEnd})` called; screenshot `video-cropper-apply.png`
- [x] Screenshots per test + `expect.poll` for async, `userEvent`/`page` only, `npm run test:b -- --run` (22 passed) + `npm run check` pass

### Infra — DONE

- [x] `web/app/components/video-cropper.tsx` exports `VideoCropper`, no Node imports, `data-*` attributes for locators (`data-crop-bar`, `data-crop-start-handle`, `data-crop-end-handle`, `data-zoom-display`, `data-playhead`, `data-action`)
- [x] `web/tests/video-cropper.test.tsx` mocks any Node, uses `render` from `vitest-browser-react`, `page`/`userEvent` realistic
- [x] Screenshots gitignored, `vite.browser` `mergeConfig` already provides Tailwind

### Execution — DONE

- [x] `npm run test:b -- --run` (home 12 + cropper 10 = 22) + `npm run check` before commit

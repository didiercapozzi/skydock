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

## Done — Video Preview & Crop Rewrite (RULES §9.11, §9.14) — 29 tests total

### Rewrite spec

- VideoCropper rewritten from scratch: zoom cursor-pinned via visible window, smooth pointer drag, proper position calculations.
- PreviewDrawer rewritten from scratch: video ref for programmatic seek, API file URLs (`/api/file/...`), HLS-ready architecture.
- New API endpoint `api/file/*` serves files with range support and proper MIME types.
- Home.tsx wires video ref, proper seek callback (`video.currentTime`), no hardcoded buffered ranges.
- Removed `onCommitOffset` prop — single `onSeek` handles all seek operations.

### Tasks — DONE

- [x] API file serving endpoint (`routes/api.file.$.tsx`) — range support, MIME types, streaming
- [x] Route registration in `routes.ts` (`api/file/*`)
- [x] VideoCropper: zoom via visible window, cursor-pinned wheel zoom, pointer capture drag
- [x] PreviewDrawer: video ref, `onVideoRef` callback, API file URLs, removed `bufferedRanges` prop
- [x] Home: `handleVideoSeek` sets `video.currentTime` via ref, `handleVideoRef` captures ref
- [x] Updated `video-cropper.test.tsx` — removed `onCommitOffset` (10 tests pass)
- [x] Updated `home.test.tsx` — 8 video crop tests (full flow, seek, drag handles, zoom, nav, escape)
- [x] `npm run check` passes (typecheck + format + lint)
- [x] `npm run test:browser -- --run` — 29 tests pass

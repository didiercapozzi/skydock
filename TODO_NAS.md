# TODO — Wire NAS Login Dialog

> Connect the `ConnectionDialog` UI (now on `@skydock/ui/forms`) to `/api/nas` so login, disconnect and folder selection actually work.

## Current State (2026-09-09 — post `a025f8c`)

- `ConnectionDialog` (`web/app/components/connection-dialog.tsx:1`) — **migrated to `@skydock/ui/forms`**: Zod `connectionSchema` (host url, user, password), `useForm({ schema, defaultValues, submit })` with `SubmitFunction` forwarding to `onConnect`, `Form` + `FormField` + `GlobalErrors`, `isSubmitting` handling. Exported as canonical example per `RULES.md:421`.
- `NasFolderBrowser` (`web/app/components/nas-folder-browser.tsx:1`) — fully implemented: `useSafeFetcher` + `zod.safeParse` for `foldersResponseSchema` / `folderErrorSchema`, expand/collapse, selection, `onSelect` callback, error display. Mounted via `open` prop.
- `Header` (`web/app/components/home/Header.tsx:1`) — shows `nasConnected` dot, `defaultFolder` path, `Connect` / `Change` / `Disconnect` buttons wired to props.
- `/api/nas` (`web/app/routes/api.nas.ts:1`) — fully implemented with `createValidatedFormAction` + Zod `actionArgs` (intents `status`/`connect`/`disconnect`/`list-folder`/`select-folder`), `loginWithSession`/`dsmValidateSession`/`dsmListFolder`, correct `errors.toResponse` status codes.
- `loadNasSession()` in `home.tsx:19` loader reads `nas.json` and passes `initialNas` (`connected`, `defaultFolder`, `hostname`, `username`) — SSR persistence works.
- **`web/app/routes/home.tsx:88` still has empty stubs** — `handleConnect`/`handleDisconnect`/`handleMerge`/`handleProcess`/`handleUpload` are no-ops. `nasConnected`/`defaultFolder`/`nasError` are `const` state without setters (`useState` missing setters), `showConnectionDialog` toggles but never submits, `onChangeFolder` is `() => {}` and `NasFolderBrowser` is never rendered. No fetcher wired, no response parsing.

## Remaining Work

### Step 1: Wire `home.tsx` to `/api/nas` via `useSafeFetcher`

In `web/app/routes/home.tsx`:

1. `import { useSafeFetcher } from '../helpers/routing'` + zod schemas for responses (`{connected, hostname, username, defaultFolder}` vs `{globalErrors}`).
2. Create `const nasFetcher = useSafeFetcher()` and add effect to `safeParse` `nasFetcher.data`:
   - on `connected:true` → `setNasConnected(true)`, `setDefaultFolder(data.defaultFolder ?? null)`, `setNasError(null)`, `setShowConnectionDialog(false)`, `setShowFolderBrowser(false)`
   - on `connected:false` → `setNasConnected(false)`, `setDefaultFolder(null)`
   - on `fieldErrors`/`globalErrors` → `setNasError(globalErrors?.[0] ?? 'Failed')` and keep dialog open
3. Fix state declarations to `const [nasConnected, setNasConnected] = useState(...)` etc. for `nasConnected`, `defaultFolder`, `nasError`.
4. Implement:
   - `handleConnect = (host, user, password) => nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'connect', host, user, password } })`
   - `handleDisconnect = () => nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'disconnect' } })`
   - `handleSelectFolder = (path) => nasFetcher.submit({ url: '/api/nas', actionArgs: { intent: 'select-folder', path } })`
5. Add `const [showFolderBrowser, setShowFolderBrowser] = useState(false)`, wire `Header onChangeFolder={() => setShowFolderBrowser(true)}` and render `<NasFolderBrowser open={showFolderBrowser} onSelect={handleSelectFolder} onClose={() => setShowFolderBrowser(false)} />`.
6. Pass `fetcher.state !== 'idle'` to disable buttons where needed; keep `ConnectionDialog error={nasError ?? undefined}` (now merged into `GlobalErrors`).

Reuse `routingEngine.href` types — never hardcode string URLs. Validate all fetcher data with `safeParse`, never `as unknown`.

### Step 2: Verify spec

- `RULES.md:421` (forms must use `@skydock/ui/forms`) — done via `connection-dialog.tsx`.
- `RULES.md:513` §13.6 §13.7 — connection + folder browser spec already matches implementation; no new rules needed.

### Step 3: Tests

- `web/tests/e2e/nas-connection.test.tsx:1` currently covers disconnected state, open and cancel — keep them (note: password field is now accessible via `getByLabelText('Password')` rather than textbox due to `type=password`).
- Add: successful connect (stub `POST /api/nas` → `{connected:true, defaultFolder:'/video'}` → dialog closes, header shows `NAS Connected` + `NAS Folder: /video`), failed connect (→ `{globalErrors:['Invalid']}` → dialog stays, `GlobalErrors` shows message), disconnect (→ `{connected:false}` → header back to `NAS Disconnected`), select-folder flow (open browser, pick `/SkyDock`, submit `select-folder` → header updates).
- Server suite `web/tests/server/api.nas.test.ts:1` already covers `connect`/`select-folder`/`list-folder`/`status` persistence — no change.
- Must pass `npm run check` (typecheck + oxfmt + oxlint) and respect `RULES.md:417` browser-test rules (`userEvent`/`locator`).

## Files to Modify

| File                                    | Change                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/app/routes/home.tsx`               | Add `useSafeFetcher`, fix state setters, implement `handleConnect`/`handleDisconnect`/`handleSelectFolder`, render `NasFolderBrowser`, parse responses with `safeParse` |
| `web/tests/e2e/nas-connection.test.tsx` | Add connect/disconnect/select-folder state tests using `userEvent.fill`/`click` and stubbed `/api/nas` actions                                                          |
| `RULES.md`                              | No change (already updated `a025f8c`)                                                                                                                                   |

## Coding Rules

- Arrow functions only, `type` over `interface`, never `any`, `z.infer` from Zod, inferred returns, exports at end (`RULES.md:402`)
- All forms via `@skydock/ui/forms` (`useForm`, `Form`, `FormField`, `GlobalErrors`, `createValidatedFormAction`) with Zod schema — `connection-dialog.tsx` is canonical (`RULES.md:421`)
- Routing via `@skydock/ui` (`routingEngine`, `useSafeFetcher`/`useSafeSubmit`/`useSafeForm`) — no string URLs (`RULES.md:418`)
- Server actions via `createValidatedFormAction` + `errors.addFieldError`/`addGlobalError` (`RULES.md:419`)
- Zod `safeParse` for all loader/fetcher/API data, never manual `as`/`in` checks (`RULES.md:425`)
- No `useCallback`/`useMemo`/`memo` — React Compiler handles it (`RULES.md:422`)
- `npm run check` must pass before commit; never commit without explicit user approval (`RULES.md:455`)

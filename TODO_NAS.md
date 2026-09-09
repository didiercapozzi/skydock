# TODO — Wire NAS Login Dialog

> Connect the existing ConnectionDialog UI to the `/api/nas` endpoint so users can actually log in.

## Current State

- `ConnectionDialog` component exists and renders correctly (hostname, username, password fields)
- `NasFolderBrowser` component exists for folder selection
- `Header` component shows NAS status (connected/disconnected dot, folder path)
- `/api/nas` endpoint is fully implemented (connect, disconnect, status, list-folder, select-folder)
- `loadNasSession()` in the home loader reads `nas.json` on server and passes `initialNas` to the component
- **All client-side handlers in `home.tsx` are empty stubs** — `handleConnect`, `handleDisconnect`, `onChangeFolder` do nothing

## Plan

### Step 1: Wire ConnectionDialog to API

In `web/app/routes/home.tsx`:

1. Import `useFetcher` from React Router
2. Create a fetcher for `/api/nas`
3. Replace `handleConnect` stub to call fetcher with `intent: 'connect'`, `host`, `user`, `password`
4. On successful connect response, update `nasConnected` state and close dialog
5. On error, pass error message to `ConnectionDialog`
6. Replace `handleDisconnect` stub to call fetcher with `intent: 'disconnect'`
7. On success, update `nasConnected` and `defaultFolder` state

### Step 2: Wire folder change to API

1. Replace `onChangeFolder` stub to toggle `showFolderDialog` state
2. When `NasFolderBrowser` selects a folder, call fetcher with `intent: 'select-folder'`, `path`
3. On success, update `defaultFolder` state

### Step 3: Update RULES.md

- §13.6 already describes the connection dialog behavior — verify it matches implementation
- No new rules needed if behavior matches existing spec

### Step 4: Tests

- `nas-connection.test.tsx` already tests the basic UI flow (show/hide dialog)
- Add tests for: successful connect updates state, failed connect shows error, disconnect clears state
- All tests must pass `npm run check`

## Files to Modify

| File                                    | Change                                    |
| --------------------------------------- | ----------------------------------------- |
| `web/app/routes/home.tsx`               | Replace no-op handlers with fetcher calls |
| `web/tests/e2e/nas-connection.test.tsx` | Add connect/disconnect state tests        |
| `RULES.md`                              | Update if behavior differs from spec      |

## Coding Rules

- Arrow functions only, no `interface`, no `any`
- Use `useFetcher` with typed routes from `./+types/home`
- Zod validation on API responses via `safeParse`
- No `useCallback`/`useMemo` — React Compiler handles it
- Run `npm run check` before commit
- Never commit without explicit user approval

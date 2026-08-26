# SkyDock

> Virtual-First Tandem Skydiving Media Pipeline for DJI Osmo Nano

SkyDock is a fully containerized, background automation engine for tandem skydiving videographers and dropzones. All media operations are **virtual by default** — files are never moved or modified until the user explicitly confirms and applies changes.

## Virtual-First Workflow

All actions are virtual and saved in `proposed_jumps.json` before being applied to real files. This ensures:

1. **Scan** — Camera files are discovered and clustered into jumps. No files are moved.
2. **Review** — User reviews the proposed jumps in the web UI. All state is virtual.
3. **Apply** — Only when the user explicitly confirms are files extracted, copied, and organized.

### Jump Clustering Rules

- Files are regrouped by jump if their time interval is **≤ 30 minutes** (default).
- Files alone in a sequence are visible **outside of any jump** as "lone files".
- The user can set a **start datetime** for each session. If changed, all files and future files are recalculated from the start time + their offset from the original start.

### Manifest Structure (`proposed_jumps.json`)

```json
{
  "version": 1,
  "status": "proposed",
  "date": "2026-08-22",
  "startDatetime": "2026-08-22T09:00:00Z",
  "createdAt": "...",
  "camera1": { "path": "...", "fileCount": 0 },
  "camera2": { "path": "...", "fileCount": 0 },
  "theory": [],
  "jumps": [],
  "loneFiles": []
}
```

- `status`: `empty` | `proposed` | `confirmed` | `executed`
- `loneFiles`: Files not belonging to any jump cluster
- `startDatetime`: User-settable reference time for virtual recalculation

## Code Quality: shellcheck

All shell scripts in `scripts/` **must** pass `shellcheck` before committing.

```bash
shellcheck scripts/*.sh
shellcheck -f gcc scripts/*.sh
shellcheck scripts/process_media.sh
```

### Shellcheck Rules

- `set -eo pipefail` is required in all scripts.
- Unused variables must use `_` (underscore) as the variable name in `read` statements.
- All functions must be invoked somewhere in the script.
- Quote all variables in double quotes to prevent word splitting.
- Use `[[ ]]` instead of `[ ]` for test commands when possible.
- Use `$(( ))` for arithmetic instead of `expr` or `let`.

## Agent Task Completion Checklist

Before finishing any task, the agent **must** run:

```bash
npm run lint
npm run format:check
```

Both commands must pass without errors before considering the task complete.

## Feature Development Policy

When adding new features to SkyDock:

1. **Update `process_media.sh`** — Implement the core feature logic
2. **Update `simulate_cameras.sh`** — Add simulation support for the new feature
3. **Update `test_pipeline.sh`** — Add assertions to verify the feature works correctly
4. **Run shellcheck** — Ensure all modified scripts pass `shellcheck` before committing

This ensures every feature is testable without real cameras and verified in CI.

## Key Features

- **Virtual-First**: All operations are virtual until explicitly applied.
- **Zero-Touch Automation**: Dock your cameras and walk away.
- **Background Execution**: Works while your Ubuntu workstation is locked.
- **Automated 0.5s Photo Extraction**: `ffmpeg` at 2 fps on Camera 1 footage.
- **30-Minute Jump Clustering**: Groups media into jumps with 30-minute idle gap detection.
- **Lone File Visibility**: Files outside any jump cluster are shown separately.
- **Start Datetime Control**: User can reset all virtual times from a chosen start.
- **Simulation Harness**: Test without real cameras using `simulate_cameras.sh`.

## Scripts

| Script                | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `entrypoint.sh`       | Docker ENTRYPOINT, hands off to watcher      |
| `watcher.sh`          | Background daemon, polls for camera SD cards |
| `process_media.sh`    | Core engine: scan, cluster, extract, copy    |
| `scan_media.sh`       | Phase 1: scan cameras, generate manifest     |
| `execute_media.sh`    | Phase 3: execute confirmed manifest          |
| `simulate_cameras.sh` | Generate fake camera footage for testing     |
| `test_pipeline.sh`    | End-to-end test runner with assertions       |

## Testing Without Real Cameras

```bash
# Full weekend simulation (Sat Aug 22 + Sun Aug 23, 2026)
./scripts/simulate_cameras.sh --weekend --clean

# Full end-to-end test
./scripts/test_pipeline.sh --clean

# Run watcher in test mode (single pass)
./scripts/watcher.sh --test --once
```

Simulation files are created under `.sim/` at the project root (gitignored).

### React Router 8 (Framework Mode)

Both apps use React Router 8 in **Framework Mode** with SSR enabled:

- `@react-router/dev/vite` plugin
- `app/routes.ts` for route definitions
- `app/routes/` for route modules
- Imports from `./+types/...` for type safety
- Arrow functions only (no function declarations)
- Types over interfaces
- Never use `any` - always 100% type safe
- All exports at the end of files
- always use `types` instead of `interface`
- No comments in generated scripts
- the script but be written in bash only and no python

# SkyDock

> Zero-Touch Tandem Skydiving Media Ingestion & Extraction Pipeline for DJI Osmo Nano

SkyDock is a fully containerized, background automation engine for tandem skydiving videographers and dropzones. Between skydiving loads, unclip your DJI Osmo Nano cameras and dock them into their USB Vision Docks. SkyDock automatically ingests your footage, splits loads into sequential jumps, extracts 0.5-second photo bursts from Camera 1, and organizes 4K customer video from Camera 2.

## Code Quality: shellcheck

All shell scripts in `scripts/` **must** pass `shellcheck` before committing.

```bash
# Run shellcheck on all scripts
shellcheck scripts/*.sh

# Run with gcc-style output (for CI)
shellcheck -f gcc scripts/*.sh

# Run on a single script
shellcheck scripts/process_media.sh
```

### Shellcheck Rules

- `set -eo pipefail` is required in all scripts.
- Unused variables must use `_` (underscore) as the variable name in `read` statements.
- All functions must be invoked somewhere in the script.
- Quote all variables in double quotes to prevent word splitting.
- Use `[[ ]]` instead of `[ ]` for test commands when possible.
- Use `$(( ))` for arithmetic instead of `expr` or `let`.

## Feature Development Policy

When adding new features to SkyDock:

1. **Update `process_media.sh`** — Implement the core feature logic
2. **Update `simulate_cameras.sh`** — Add simulation support for the new feature (e.g., generate test data, add CLI options)
3. **Update `test_pipeline.sh`** — Add assertions to verify the feature works correctly
4. **Run shellcheck** — Ensure all modified scripts pass `shellcheck` before committing

This ensures every feature is testable without real cameras and verified in CI.

## Key Features

- **Zero-Touch Automation**: Dock your cameras and walk away.
- **Background Execution**: Works while your Ubuntu workstation is locked.
- **Automated 0.5s Photo Extraction**: `ffmpeg` at 2 fps on Camera 1 footage.
- **Intelligent Jump Grouping**: Clusters media using 15-minute idle gap detection.
- **Idempotent Ingestion**: Registry guarantees clips are never duplicated.
- **Simulation Harness**: Test without real cameras using `simulate_cameras.sh`.

## Scripts

| Script | Purpose |
|--------|---------|
| `entrypoint.sh` | Docker ENTRYPOINT, hands off to watcher |
| `watcher.sh` | Background daemon, polls for camera SD cards |
| `process_media.sh` | Core engine: scan, cluster, extract, copy |
| `simulate_cameras.sh` | Generate fake camera footage for testing |
| `test_pipeline.sh` | End-to-end test runner with assertions |

## Testing Without Real Cameras

```bash
# Full end-to-end test (16 assertions)
./scripts/test_pipeline.sh --clean

# Generate simulated cameras only
./scripts/simulate_cameras.sh --jumps 5 --clean

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

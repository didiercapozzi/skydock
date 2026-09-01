# SkyDock

> Simple camera file copy tool for DJI Osmo Nano

SkyDock copies media files from your DJI cameras to a local folder structure, then groups them into skydive jumps.

## How It Works

1. **Connect cameras** → `processMedia()` copies files to `output/original_files/YYYY-MM-DD/`
2. **Scan** → `scanMedia()` generates `manifest.json` grouping files by time gaps
3. **Review** → User reviews jumps in web UI
4. **Execute** → Confirmed jumps are copied to `output/processed/{label}/`

## Output Structure

```
output/
├── original_files/           # Raw files organized by date
│   └── 2026-08-27/
│       ├── DJI_0001.MP4
│       └── DJI_0002.MP4
├── manifest.json             # Jump grouping manifest
└── processed/                # After confirmation
    ├── jump_01/
    │   ├── DJI_0001.MP4
    │   └── DJI_0003.MP4
    └── jump_02/
        └── DJI_0002.MP4
```

## Deduplication

Files are deduplicated using `cmp`:

- If filename exists in `original_files/date/` and content matches → skip
- If filename exists but content differs → copy (file was overwritten)
- If filename doesn't exist → copy

## Scripts

All scripts are TypeScript modules in `packages/skydock-scripts/src/`, runnable via `tsx`.

| Script             | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `process.ts`       | Copy camera files to original_files/     |
| `scan.ts`          | Generate manifest.json                   |
| `execute.ts`       | Copy confirmed jumps to processed/       |
| `watcher.ts`       | Background daemon, polls for cameras     |
| `simulate.ts`      | Generate fake camera footage for testing |
| `test-pipeline.ts` | End-to-end test runner                   |

## Usage

### Copy files from cameras

```bash
npm run process -- /path/to/camera1 /path/to/camera2
```

### Generate jump manifest

```bash
npm run scan
```

### Watcher daemon

```bash
# Watch specific directories
npm run watcher -- --cam-dir /path/to/camera1 --cam-dir /path/to/camera2

# Auto-scan common mount points
npm run watcher
```

### Test mode

```bash
npm run watcher -- --test --once
```

## Testing

```bash
# Full end-to-end test
npm run test-pipeline -- --clean
```

## Dependencies

- `tsx` - TypeScript execution (zero-config)
- `cmp` - File comparison (built-in)
- `exiftool` - Optional, for camera metadata extraction
- `ffmpeg` - Required, for live 360p transcoding via api/stream

### Coding rules

Both apps use React Router 8 in **Framework Mode** with SSR enabled:

- `app/routes.ts` for route definitions
- `app/routes/` for route modules
- Imports from `./+types/...` for type safety
- Arrow functions only (no function declarations)
- Types over interfaces
- Never use `any` - always 100% type safe
- All exports at the end of files
- always use `types` instead of `interface`
- don't force a function returned type. All returned types must be infered
- No comments in generated scripts
- Scripts are TypeScript only, no Python
- All shared logic lives in `@skydock/scripts` package
- Never duplicate: if logic is needed in multiple places, extract to `@skydock/scripts`
- before being done with a job make sure `npm run check` command doesn't trigger any error
- always update the RULES.md files in case of logic change

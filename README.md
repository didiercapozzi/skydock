# SkyDock

> Simple camera file copy tool for DJI Osmo Nano

SkyDock copies media files from your DJI cameras to a local folder structure, then groups them into skydive jumps.

## How It Works

1. **Connect cameras** → `process_media.sh` copies files to `output/original_files/YYYY-MM-DD/`
2. **Scan** → `scan_media.sh` generates `manifest.json` grouping files by time gaps
3. **Review** → User reviews jumps in web UI
4. **Execute** → Confirmed jumps are copied to `output/processed/jump_XX/`

## Output Structure

```
output/
├── original_files/           # Raw files organized by date
│   └── 2026-08-27/
│       ├── DJI_0001.MP4
│       └── DJI_0002.MP4
├── manifest.json       # Jump grouping manifest
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

| Script                | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `process_media.sh`    | Copy camera files to original_files/     |
| `scan_media.sh`       | Generate manifest.json                   |
| `execute_media.sh`    | Copy confirmed jumps to processed/       |
| `watcher.sh`          | Background daemon, polls for cameras     |
| `simulate_cameras.sh` | Generate fake camera footage for testing |
| `test_pipeline.sh`    | End-to-end test runner                   |

## Usage

### Copy files from cameras

```bash
./scripts/process_media.sh /path/to/camera1 /path/to/camera2
```

### Generate jump manifest

```bash
./scripts/scan_media.sh
```

### Watcher daemon

```bash
# Watch specific directories
./scripts/watcher.sh --cam-dir /path/to/camera1 --cam-dir /path/to/camera2

# Auto-scan common mount points
./scripts/watcher.sh
```

### Test mode

```bash
./scripts/watcher.sh --test --once
```

## Testing

```bash
# Full end-to-end test
./scripts/test_pipeline.sh --clean
```

## Dependencies

- `jq` - JSON processing
- `cmp` - File comparison (built-in)
- `exiftool` - Optional, for camera metadata extraction

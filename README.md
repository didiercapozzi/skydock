# SkyDock

> Simple camera file copy tool for DJI Osmo Nano

SkyDock copies media files from your DJI cameras to a local folder structure.

---

## Key Features

- **Simple Copy**: Just copies files from cameras to `camera_files/`
- **Multi-Camera**: Supports any number of cameras simultaneously
- **Auto-Detection**: Watches for camera connections and copies automatically

---

## Output Structure

```text
camera_files/
├── camera1/
│   ├── DJI_0001.MP4
│   └── DJI_0002.MP4
├── camera2/
│   ├── DJI_0003.MP4
│   └── DJI_0004.MP4
```

---

## Usage

### Copy files from specific cameras

```bash
./scripts/process_media.sh /path/to/camera1 /path/to/camera2
```

### Watcher daemon (auto-detects cameras)

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

---

## Testing

```bash
# Full end-to-end test
./scripts/test_pipeline.sh --clean
```

---

## Scripts

| Script                | Purpose                                |
| --------------------- | -------------------------------------- |
| `watcher.sh`          | Background daemon, polls for cameras   |
| `process_media.sh`    | Copies media files to camera_files/    |
| `simulate_cameras.sh` | Generate fake camera footage for tests |
| `test_pipeline.sh`    | End-to-end test runner                 |

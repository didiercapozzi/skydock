# SkyDock 🪂

> **Zero-Touch Tandem Skydiving Media Ingestion & Extraction Pipeline for DJI Osmo Nano**

SkyDock is a fully containerized, background automation engine for tandem skydiving videographers and dropzones. Between skydiving loads, unclip your DJI Osmo Nano cameras and dock them into their USB Vision Docks. SkyDock automatically ingests your footage, splits loads into sequential jumps, extracts 0.5-second photo bursts from Camera 1, and organizes 4K customer video from Camera 2—even while your computer is locked.

---

## ⚡ Key Features

- **Zero-Touch Automation**: Dock your cameras and walk away. No mouse clicks, no manifest entering between loads.
- **Background Execution**: Works seamlessly in the background while your Ubuntu workstation is locked.
- **Automated 0.5s Photo Extraction**: Runs `ffmpeg` at 2 fps (`-vf "fps=2" -q:v 2`) on Camera 1's video footage to deliver high-res photo bursts.
- **Intelligent Jump Grouping**: Chronologically sorts and clusters media into `Jump_01`, `Jump_02`, etc., using a 15-minute (`900s`) idle gap detection algorithm.
- **Idempotent Ingestion**: Built-in state registry guarantees clips are never duplicated or re-extracted.
- **Isolated Dev Environment**: Includes a dedicated VS Code Dev Container setup with an interactive simulation harness.

---

## 📁 Output Directory Structure

Footage is automatically sorted into a dated directory on your host Desktop:

```text
~/Desktop/tandem_jumps/YYYY-MM-DD/
├── Jump_01/
│   ├── photos/       # Extracted 0.5s JPEG frames (Camera 1)
│   └── videos/       # Raw 4K MP4 jump clips (Camera 2)
├── Jump_02/
│   ├── photos/
│   └── videos/
└── Jump_03/
    ├── photos/
    └── videos/
```

---

## 👥 Passenger Names

SkyDock can automatically rename jump directories with passenger names. Create a simple text file with one name per line, in the order they jumped:

```bash
# Create a names file
cat > passengers.txt << 'EOF'
Alice Johnson
Bob Smith
Carol Davis
EOF

# Run pipeline with names
./scripts/process_media.sh /path/to/photo /path/to/video passengers.txt
```

Jump directories will be renamed: `Jump_01` → `Jump_01_Alice_Johnson`

---

## 🎓 Theory Videos

For tandem skydiving, you often film passenger briefings (theory sessions) before the jumps. SkyDock automatically handles these by detecting videos with `THEORY` in the filename.

### How It Works

1. Name your theory videos with `THEORY` in the filename (case-insensitive)
2. SkyDock groups theory videos into sessions based on time gaps
3. Theory files (photos/videos) are copied to each jump folder

### Example

```
DJI_0001_THEORY.MP4   # Morning theory session
DJI_0002.MP4          # Jump footage
DJI_0003.MP4          # Jump footage
DJI_0010_THEORY.MP4   # Afternoon theory session
DJI_0011.MP4          # Jump footage
```

### Output Structure

```
2026-08-24/
├── Jump_01_Alice_Johnson/
│   ├── photos/
│   │   ├── DJI_0001_THEORY_frame_*.jpg  # Theory photos
│   │   └── DJI_0003_frame_*.jpg         # Jump photos
│   └── videos/
│       ├── DJI_0001_THEORY.MP4          # Theory video
│       └── DJI_0004.MP4                 # Jump video
├── Jump_02_Bob_Smith/
│   ├── photos/
│   │   ├── DJI_0001_THEORY_frame_*.jpg  # Same theory photos
│   │   └── DJI_0005_frame_*.jpg
│   └── videos/
│       ├── DJI_0001_THEORY.MP4          # Same theory video
│       └── DJI_0006.MP4
└── Jump_03_Carol_Davis/
    ├── photos/
    │   ├── DJI_0010_THEORY_frame_*.jpg  # Afternoon theory
    │   └── DJI_0007_frame_*.jpg
    └── videos/
        ├── DJI_0010_THEORY.MP4          # Afternoon theory
        └── DJI_0008.MP4
```

---

## 🧪 Testing Without Real Cameras

SkyDock includes a full simulation harness for testing the pipeline without physical DJI cameras.

### Quick Start

```bash
# Run the complete end-to-end test (generates cameras, processes, verifies)
./scripts/test_pipeline.sh --clean
```

### Simulation Scripts

#### `simulate_cameras.sh` — Generate Fake Camera Footage

Creates fake SD card directories with dummy MP4 files and realistic timestamps.

```bash
# Generate 3 jump sessions (default)
./scripts/simulate_cameras.sh --clean

# Generate 5 jumps with 4 files each
./scripts/simulate_cameras.sh --jumps 5 --cam1-files 4 --cam2-files 4 --clean

# Custom gap between jumps (e.g., 10 minutes)
./scripts/simulate_cameras.sh --gap 600 --clean
```

| Option              | Default            | Description                      |
| ------------------- | ------------------ | -------------------------------- |
| `--output DIR`      | `/tmp/skydock_sim` | Base simulation directory        |
| `--jumps N`         | `3`                | Number of jump sessions          |
| `--cam1-files N`    | `2`                | Video files per jump (Camera 1)  |
| `--cam2-files N`    | `2`                | Video files per jump (Camera 2)  |
| `--duration SECS`   | `5`                | Duration of each dummy video     |
| `--gap SECS`        | `960`              | Gap between jumps (16 min)       |
| `--date YYYY-MM-DD` | today              | Target date for timestamps       |
| `--use-ffmpeg`      | auto               | Generate real MP4 test patterns  |
| `--no-ffmpeg`       | —                  | Force dummy files (no ffmpeg)    |
| `--clean`           | —                  | Remove previous simulation first |

#### `test_pipeline.sh` — End-to-End Test Runner

Generates simulated cameras, runs the ingestion pipeline, and validates output structure.

```bash
# Full test with auto-generated cameras
./scripts/test_pipeline.sh --clean

# Test with pre-existing camera directories
./scripts/test_pipeline.sh --photo-dir /path/to/photo --video-dir /path/to/video

# Custom output location
./scripts/test_pipeline.sh --output /tmp/my_test --clean
```

The test validates:

- Date directory creation
- Jump directory structure (`Jump_01/`, `Jump_02/`, etc.)
- Photo subdirectory with extracted JPEGs
- Video subdirectory with copied MP4s
- Registry file creation
- Idempotency (re-running doesn't duplicate entries)

#### `watcher.sh --test` — Daemon Mode with Simulated Cameras

Run the watcher daemon against simulated cameras instead of real hardware.

```bash
# Single run (process once then exit)
./scripts/watcher.sh --test --once

# Continuous daemon mode with simulated cameras
./scripts/watcher.sh --test

# Use specific camera directories
./scripts/watcher.sh --test --photo-dir /tmp/sim/photo --video-dir /tmp/sim/video
```

### Example Output

```
/tmp/skydock_sim/
├── photo_cam/          # Simulated Camera 1 SD card
│   ├── DJI_0001.MP4
│   ├── DJI_0002.MP4
│   └── ...
└── video_cam/          # Simulated Camera 2 SD card
    ├── DJI_0003.MP4
    ├── DJI_0004.MP4
    └── ...

/tmp/skydock_test_output/
└── 2026-08-24/
    ├── Jump_01/
    │   ├── photos/     # 20 JPEGs (2 files × 10 frames @ 2fps)
    │   └── videos/     # 2 MP4s (copied from Camera 2)
    ├── Jump_02/
    │   ├── photos/
    │   └── videos/
    └── Jump_03/
        ├── photos/
        └── videos/
```

---

## 📦 Creating Releases

SkyDock uses GitHub Actions to automatically build cross-platform installers (macOS, Windows, Linux) when you push a version tag.

### One-Command Release

```bash
# Bump patch version (1.0.0 → 1.0.1)
./scripts/release.sh patch

# Bump minor version (1.0.0 → 1.1.0)
./scripts/release.sh minor

# Bump major version (1.0.0 → 2.0.0)
./scripts/release.sh major
```

This automatically:

1. Updates the version in `package.json`
2. Commits the change
3. Creates a git tag (`v1.0.1`)
4. Pushes to GitHub
5. Triggers GitHub Actions to build installers for all platforms

### Manual Release

```bash
git tag v1.0.0
git push origin main --tags
```

### Downloading Releases

Users can download the latest release from:

```
https://github.com/YOUR_USERNAME/skydock/releases/latest
```

| Platform | File        | Description             |
| -------- | ----------- | ----------------------- |
| macOS    | `.dmg`      | Drag to Applications    |
| Windows  | `.exe`      | Run installer           |
| Linux    | `.AppImage` | Double-click to run     |
| Linux    | `.deb`      | Debian/Ubuntu installer |

### Linux Installation

**AppImage (any distro):**

```bash
chmod +x SkyDock-*.AppImage
./SkyDock-*.AppImage
```

**Debian/Ubuntu (.deb):**

```bash
sudo dpkg -i skydock_*.deb
sudo apt-get install -f  # fix any missing dependencies
```

Then launch from your application menu or run `skydock` from the terminal.

### Auto-Update

Existing installations check for updates on launch and prompt to install automatically.

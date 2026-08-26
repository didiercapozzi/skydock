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

Footage is automatically sorted into a dated directory:

```text
output/YYYY-MM-DD/
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
cat > passengers.txt << 'EOF'
Alice Johnson
Bob Smith
Carol Davis
EOF

./scripts/process_media.sh /path/to/photo /path/to/video passengers.txt
```

Jump directories will be renamed: `Jump_01` → `Alice_Johnson`

---

## 🎓 Theory Videos

For tandem skydiving, you often film passenger briefings (theory sessions) before the jumps. SkyDock automatically handles these by detecting videos with `THEORY` in the filename.

1. Name your theory videos with `THEORY` in the filename (case-insensitive)
2. SkyDock groups theory videos into sessions based on time gaps
3. Theory files are copied to each jump folder

```
DJI_0001_THEORY.MP4   # Morning theory session
DJI_0002.MP4          # Jump footage
DJI_0003.MP4          # Jump footage
```

---

## 🖥️ Web UI

SkyDock includes a React-based web interface for reviewing and managing jumps.

```bash
cd web && npm run dev
```

### Pages

- **Dashboard** (`/`) — Overview of all ingested jumps with photo/video counts
- **Review** (`/review`) — Inspect and confirm proposed jumps before execution

### Dev Tools

In development mode, the dashboard includes:

- **Reset dev data** — Generates simulated camera data and runs a fresh scan
- **Add Jump** — Appends a new jump to the current simulation

---

## 🧪 Testing Without Real Cameras

### Quick Start

```bash
# Full end-to-end test
./scripts/test_pipeline.sh --clean
```

### Simulation

Generate fake camera footage with flexible day/jump/file configuration:

```bash
# 3 days ago: 5 jumps, 4 files each
# 2 days ago: 4 jumps, 3 files each
./scripts/simulate_cameras.sh --clean --day 3:5:4 --day 2:4:3
```

**Format:** `--day DAYS_AGO:NUM_JUMPS:FILES_PER_JUMP`

### Scan Only

```bash
./scripts/scan_media.sh /path/to/photo /path/to/video
```

### Process Media

```bash
./scripts/process_media.sh /path/to/photo /path/to/video [passengers.txt]
```

---

## 🐳 Docker

```bash
docker compose up -d
```

SkyDock runs as a background container, polling for camera SD cards and processing footage automatically.

---

## 📦 Scripts

| Script                | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `entrypoint.sh`       | Docker entrypoint, hands off to watcher      |
| `watcher.sh`          | Background daemon, polls for camera SD cards |
| `process_media.sh`    | Core engine: scan, cluster, extract, copy    |
| `scan_media.sh`       | Phase 1: scan cameras, generate manifest     |
| `execute_media.sh`    | Phase 3: execute confirmed manifest          |
| `simulate_cameras.sh` | Generate fake camera footage for testing     |
| `test_pipeline.sh`    | End-to-end test runner with assertions       |

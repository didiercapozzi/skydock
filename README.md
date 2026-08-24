---

### 2. `README.md`

```markdown
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
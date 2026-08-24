#!/usr/bin/env bash
set -eo pipefail

echo "============================================================"
echo "    DJI OSMO NANO AUTO-INGESTION & EXTRACTION PIPELINE      "
echo "============================================================"
echo "Config:"
echo " - Photo Camera SD Label : ${CAM_PHOTO_LABEL}"
echo " - Video Camera SD Label : ${CAM_VIDEO_LABEL}"
echo " - Jump Break Threshold  : ${JUMP_GAP_SECONDS}s"
echo " - Extraction Rate       : ${PHOTO_FPS} fps (every 0.5s)"
echo " - Output Directory      : /output"
echo "============================================================"

# Ensure output directory exists
mkdir -p /output

# Hand off to the watcher daemon
exec /app/scripts/watcher.sh

#!/usr/bin/env bash
set -eo pipefail

echo "============================================================"
echo "    DJI OSMO NANO AUTO-INGESTION & EXTRACTION PIPELINE      "
echo "============================================================"
export SKYDOCK_OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"

echo "Config:"
echo " - Photo Camera SD Label : ${CAM_PHOTO_LABEL}"
echo " - Video Camera SD Label : ${CAM_VIDEO_LABEL}"
echo " - Jump Break Threshold  : ${JUMP_GAP_SECONDS}s"
echo " - Extraction Rate       : ${PHOTO_FPS} fps (every 0.5s)"
echo " - Output Directory      : ${SKYDOCK_OUTPUT_DIR}"
echo "============================================================"

# Ensure output directory exists
mkdir -p "${SKYDOCK_OUTPUT_DIR}"

# Hand off to the watcher daemon
exec /app/scripts/watcher.sh

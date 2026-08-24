#!/usr/bin/env bash
set -eo pipefail

# simulate_cameras.sh — Creates fake camera SD card directories with dummy footage
# for testing the SkyDock pipeline without real DJI cameras.
#
# Usage:
#   ./simulate_cameras.sh [OPTIONS]
#
# Options:
#   --output DIR       Base simulation directory (default: <project_root>/.sim)
#   --jumps N          Number of jump sessions to simulate (default: 3)
#   --cam1-files N     Video files per jump on Camera 1 (default: 2)
#   --cam2-files N     Video files per jump on Camera 2 (default: 2)
#   --duration SECS    Duration of each dummy video in seconds (default: 5)
#   --gap SECS         Gap in seconds between jumps (default: 960)
#   --date YYYY-MM-DD  Target date for timestamps (default: today)
#   --use-ffmpeg       Generate real MP4 test patterns (requires ffmpeg)
#   --clean            Remove simulation directory before creating
#   -h, --help         Show this help message
#
# Output directories (simulated mount points):
#   <output>/photo_cam/  — simulates Camera 1 SD card (photos)
#   <output>/video_cam/  — simulates Camera 2 SD card (videos)

SIM_BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.sim"
NUM_JUMPS=3
CAM1_FILES=2
CAM2_FILES=2
VIDEO_DURATION=5
JUMP_GAP=960
TARGET_DATE=$(date +"%Y-%m-%d")
# Auto-detect ffmpeg: use it if available, unless --no-ffmpeg is specified
USE_FFMPEG=false
NO_FFMPEG=false
CLEAN=false

usage() {
    sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output)   SIM_BASE="$2"; shift 2 ;;
        --jumps)    NUM_JUMPS="$2"; shift 2 ;;
        --cam1-files) CAM1_FILES="$2"; shift 2 ;;
        --cam2-files) CAM2_FILES="$2"; shift 2 ;;
        --duration) VIDEO_DURATION="$2"; shift 2 ;;
        --gap)      JUMP_GAP="$2"; shift 2 ;;
        --date)     TARGET_DATE="$2"; shift 2 ;;
        --use-ffmpeg) USE_FFMPEG=true; shift ;;
        --no-ffmpeg) NO_FFMPEG=true; shift ;;
        --clean)    CLEAN=true; shift ;;
        -h|--help)  usage ;;
        *)          echo "Unknown option: $1"; usage ;;
    esac
done

# Auto-detect ffmpeg unless explicitly disabled
if ! $NO_FFMPEG && command -v ffmpeg &>/dev/null; then
    USE_FFMPEG=true
fi

if $CLEAN && [ -d "${SIM_BASE}" ]; then
    echo "[Sim] Cleaning previous simulation directory: ${SIM_BASE}"
    rm -rf "${SIM_BASE}"
fi

PHOTO_DIR="${SIM_BASE}/photo_cam"
VIDEO_DIR="${SIM_BASE}/video_cam"
mkdir -p "${PHOTO_DIR}" "${VIDEO_DIR}"

echo "============================================================"
echo "    SkyDock Camera Simulation Harness"
echo "============================================================"
echo "Config:"
echo " - Simulation Dir   : ${SIM_BASE}"
echo " - Jumps            : ${NUM_JUMPS}"
echo " - Cam1 files/jump  : ${CAM1_FILES}"
echo " - Cam2 files/jump  : ${CAM2_FILES}"
echo " - Video duration   : ${VIDEO_DURATION}s"
echo " - Jump gap         : ${JUMP_GAP}s"
echo " - Target date      : ${TARGET_DATE}"
echo " - Use ffmpeg       : ${USE_FFMPEG}"
echo "============================================================"

# Calculate base epoch from target date at 09:00 local time
BASE_EPOCH=$(date -d "${TARGET_DATE} 09:00:00" +%s 2>/dev/null || date -j -f "%Y-%m-%d %H:%M:%S" "${TARGET_DATE} 09:00:00" +%s 2>/dev/null || echo "0")

if [ "${BASE_EPOCH}" = "0" ]; then
    echo "[Sim] Warning: Could not parse date '${TARGET_DATE}', using epoch-based offset"
    BASE_EPOCH=$(date +%s)
fi

FILE_COUNTER=0
MANIFEST_FILE=$(mktemp)
trap 'rm -f "${MANIFEST_FILE}"' EXIT

generate_dummy_mp4() {
    local output_path="$1"
    local duration="$2"

    if $USE_FFMPEG && command -v ffmpeg &>/dev/null; then
        ffmpeg -y -loglevel error \
            -f lavfi -i "testsrc=duration=${duration}:size=1920x1080:rate=30" \
            -f lavfi -i "sine=frequency=440:duration=${duration}" \
            -c:v libx264 -preset ultrafast -tune zerolatency \
            -c:a aac -shortest \
            "${output_path}" 2>/dev/null
    else
        # Create a minimal valid MP4 file (ftyp + moov + mdat atoms)
        # This is a bare-minimum MP4 that ffmpeg can parse for frame extraction
        python3 -c "
import struct, sys

# Minimal MP4: ftyp box + moov box with video track + mdat box
ftyp = b'\\x00\\x00\\x00\\x1cftypisom\\x00\\x00\\x02\\x00isomiso2mp41'

# Minimal moov with a video sample entry
moov = (
    b'\\x00\\x00\\x00\\x08moov'
    b'\\x00\\x00\\x00\\x08mvhd'
    b'\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00'
    b'\\x00\\x00\\x00\\x00\\x00\\x00\\x00\\x00'
    b'\\x00\\x00\\x03\\xe8'  # timescale 1000
    b'\\x00\\x00\\x00\\x01'  # duration 1
)

# Pad mdat with enough data to simulate a real video file
mdat_size = ${duration} * 100000  # ~100KB per second
mdat = struct.pack('>I', mdat_size + 8) + b'mdat' + b'\\x00' * min(mdat_size, 500000)

with open('${output_path}', 'wb') as f:
    f.write(ftyp + moov + mdat)
" 2>/dev/null || {
            # Fallback: create a tiny placeholder file
            dd if=/dev/urandom bs=1024 count=50 of="${output_path}" 2>/dev/null
        }
    fi
}

echo "[Sim] Generating ${NUM_JUMPS} jump sessions..."

for (( jump=1; jump<=NUM_JUMPS; jump++ )); do
    JUMP_LABEL=$(printf "Jump_%02d" "${jump}")
    JUMP_OFFSET=$(( (jump - 1) * JUMP_GAP ))

    echo "[Sim]   Creating ${JUMP_LABEL} (offset: ${JUMP_OFFSET}s)..."

    # Camera 1 files (photos)
    for (( i=1; i<=CAM1_FILES; i++ )); do
        FILE_COUNTER=$((FILE_COUNTER + 1))
        FILE_EPOCH=$((BASE_EPOCH + JUMP_OFFSET + (i - 1) * 30))
        FILENAME=$(printf "DJI_%04d.MP4" "${FILE_COUNTER}")
        FILEPATH="${PHOTO_DIR}/${FILENAME}"

        generate_dummy_mp4 "${FILEPATH}" "${VIDEO_DURATION}"

        # Set modification time to simulate recording timestamp
        touch -d "@${FILE_EPOCH}" "${FILEPATH}"

        echo "${FILE_EPOCH}|PHOTO|${FILEPATH}|PHOTO:${FILENAME}:$(stat -c %s "${FILEPATH}"):${FILE_EPOCH}" >> "${MANIFEST_FILE}"
    done

    # Camera 2 files (videos)
    for (( i=1; i<=CAM2_FILES; i++ )); do
        FILE_COUNTER=$((FILE_COUNTER + 1))
        FILE_EPOCH=$((BASE_EPOCH + JUMP_OFFSET + (i - 1) * 30 + 5))
        FILENAME=$(printf "DJI_%04d.MP4" "${FILE_COUNTER}")
        FILEPATH="${VIDEO_DIR}/${FILENAME}"

        generate_dummy_mp4 "${FILEPATH}" "${VIDEO_DURATION}"

        touch -d "@${FILE_EPOCH}" "${FILEPATH}"

        echo "${FILE_EPOCH}|VIDEO|${FILEPATH}|VIDEO:${FILENAME}:$(stat -c %s "${FILEPATH}"):${FILE_EPOCH}" >> "${MANIFEST_FILE}"
    done
done

echo ""
echo "[Sim] Simulation files created:"
echo "------------------------------------------------------------"
echo "Photo camera (${PHOTO_DIR}):"
ls -lh "${PHOTO_DIR}"/*.MP4 2>/dev/null || echo "  (none)"
echo ""
echo "Video camera (${VIDEO_DIR}):"
ls -lh "${VIDEO_DIR}"/*.MP4 2>/dev/null || echo "  (none)"
echo "------------------------------------------------------------"
echo ""
echo "[Sim] File manifest (sorted by timestamp):"
sort -t'|' -k1,1n "${MANIFEST_FILE}" | while IFS='|' read -r epoch cam filepath _; do
    ts=$(date -d "@${epoch}" +"%H:%M:%S" 2>/dev/null || echo "N/A")
    echo "  [${cam}] ${ts} $(basename "${filepath}")"
done
echo ""
echo "============================================================"
echo "Simulation ready. To test the pipeline, run:"
echo ""
echo "  ./scripts/test_pipeline.sh --photo-dir '${PHOTO_DIR}' --video-dir '${VIDEO_DIR}'"
echo ""
echo "Or manually:"
echo "  PHOTO_PATH='${PHOTO_DIR}' VIDEO_PATH='${VIDEO_DIR}'"
echo "  ./scripts/process_media.sh \"\${PHOTO_PATH}\" \"\${VIDEO_PATH}\""
echo "============================================================"

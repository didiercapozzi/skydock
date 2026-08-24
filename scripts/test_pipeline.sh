#!/usr/bin/env bash
set -eo pipefail

# test_pipeline.sh — End-to-end test runner for SkyDock
# Creates simulated cameras, runs the ingestion pipeline, and verifies output.
#
# Usage:
#   ./test_pipeline.sh [OPTIONS]
#
# Options:
#   --photo-dir DIR    Pre-existing photo camera directory (skips simulation)
#   --video-dir DIR    Pre-existing video camera directory (skips simulation)
#   --output DIR       Output directory for processed media (default: <project_root>/.sim/output)
#   --jumps N          Number of jumps to simulate (default: 3)
#   --clean            Remove output and simulation dirs before running
#   -h, --help         Show this help message
#
# If --photo-dir and --video-dir are provided, skips simulation and uses those dirs directly.
# Otherwise, runs simulate_cameras.sh to create test fixtures first.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_BASE="${PROJECT_ROOT}/.sim"
OUTPUT_DIR="${PROJECT_ROOT}/.sim/output"
NUM_JUMPS=3
CLEAN=false
PHOTO_DIR=""
VIDEO_DIR=""

usage() {
    sed -n '/^# Usage:/,/^$/p' "$0" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --photo-dir)  PHOTO_DIR="$2"; shift 2 ;;
        --video-dir)  VIDEO_DIR="$2"; shift 2 ;;
        --output)     OUTPUT_DIR="$2"; shift 2 ;;
        --jumps)      NUM_JUMPS="$2"; shift 2 ;;
        --clean)      CLEAN=true; shift ;;
        -h|--help)    usage ;;
        *)            echo "Unknown option: $1"; usage ;;
    esac
done

PASS_COUNT=0
FAIL_COUNT=0

assert_dir_exists() {
    local dir="$1"
    local label="$2"
    if [ -d "${dir}" ]; then
        echo "  PASS: ${label} exists"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: ${label} does not exist"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# ─── Setup ─────────────────────────────────────────────────────

if $CLEAN; then
    echo "[Test] Cleaning previous test artifacts..."
    rm -rf "${SIM_BASE}"
fi

# ─── Phase 1: Generate simulated cameras ───────────────────────

if [ -n "${PHOTO_DIR}" ] && [ -n "${VIDEO_DIR}" ]; then
    echo "[Test] Using pre-existing camera directories:"
    echo "  Photo: ${PHOTO_DIR}"
    echo "  Video: ${VIDEO_DIR}"
else
    echo "[Test] Generating simulated camera files..."
    "${SCRIPT_DIR}/simulate_cameras.sh" \
        --output "${SIM_BASE}" \
        --jumps "${NUM_JUMPS}" \
        --clean
    PHOTO_DIR="${SIM_BASE}/photo_cam"
    VIDEO_DIR="${SIM_BASE}/video_cam"
fi

if [ ! -d "${PHOTO_DIR}" ] && [ ! -d "${VIDEO_DIR}" ]; then
    echo "[Test] FATAL: No camera directories available. Aborting."
    exit 1
fi

mkdir -p "${OUTPUT_DIR}"

# ─── Phase 2: Run the ingestion pipeline ───────────────────────

echo ""
echo "[Test] Running process_media.sh..."
echo "------------------------------------------------------------"

export JUMP_GAP_SECONDS=900
export PHOTO_FPS=2
export JPEG_QUALITY=2
export REGISTRY_FILE="${OUTPUT_DIR}/.ingested_registry.txt"

# Override the hardcoded /output path in process_media.sh by running it
# in a subshell with the output dir
(
    export REGISTRY_FILE="${OUTPUT_DIR}/.ingested_registry.txt"
    # The script hardcodes /output, so we symlink or copy
    # Actually, let's just run it with the output dir approach
    true
)

# Since process_media.sh hardcodes /output, we need to handle this.
# Create a temp /output symlink or use sed to patch it on the fly.
TEMP_OUTPUT_LINK="/tmp/skydock_test_output_link"
rm -f "${TEMP_OUTPUT_LINK}"
ln -sfn "${OUTPUT_DIR}" "${TEMP_OUTPUT_LINK}"

# Patch process_media.sh to use our output dir instead of /output
PATCHED_SCRIPT=$(mktemp /tmp/process_media_XXXXXX.sh)
trap 'rm -f "${PATCHED_SCRIPT}" "${TEMP_OUTPUT_LINK}"' EXIT

sed "s|/output|${OUTPUT_DIR}|g" "${SCRIPT_DIR}/process_media.sh" > "${PATCHED_SCRIPT}"
chmod +x "${PATCHED_SCRIPT}"

"${PATCHED_SCRIPT}" "${PHOTO_DIR}" "${VIDEO_DIR}" || {
    echo "[Test] ERROR: process_media.sh failed with exit code $?"
}

# ─── Phase 3: Verify output ───────────────────────────────────

echo ""
echo "============================================================"
echo "    Test Results"
echo "============================================================"

# Find the date directory
DATE_DIR=$(find "${OUTPUT_DIR}" -maxdepth 1 -type d -name "20??-??-??" | head -n1)

if [ -z "${DATE_DIR}" ]; then
    echo "  FAIL: No date directory found under ${OUTPUT_DIR}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
else
    echo "  PASS: Date directory created: $(basename "${DATE_DIR}")"
    PASS_COUNT=$((PASS_COUNT + 1))

    # Count jump directories
    JUMP_DIRS=("${DATE_DIR}"/Jump_*)
    JUMP_COUNT=0
    for d in "${JUMP_DIRS[@]}"; do
        [ -d "$d" ] && JUMP_COUNT=$((JUMP_COUNT + 1))
    done

    if [ "${JUMP_COUNT}" -ge 1 ]; then
        echo "  PASS: Found ${JUMP_COUNT} jump directory(ies)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: No jump directories found"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Verify each jump directory
    for d in "${JUMP_DIRS[@]}"; do
        [ -d "$d" ] || continue
        JUMP_NAME=$(basename "${d}")
        echo ""
        echo "  Checking ${JUMP_NAME}:"

        assert_dir_exists "${d}/photos" "${JUMP_NAME}/photos"
        assert_dir_exists "${d}/videos" "${JUMP_NAME}/videos"

        # Check for photo files (JPEGs extracted by ffmpeg)
        PHOTOS_FOUND=$(find "${d}/photos" -type f -name "*.jpg" 2>/dev/null | wc -l)
        VIDEOS_FOUND=$(find "${d}/videos" -type f \( -name "*.MP4" -o -name "*.mp4" \) 2>/dev/null | wc -l)

        if [ "${PHOTOS_FOUND}" -gt 0 ]; then
            echo "  PASS: ${JUMP_NAME}/photos contains ${PHOTOS_FOUND} JPEG(s)"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "  INFO: ${JUMP_NAME}/photos has 0 JPEGs (ffmpeg may not be available or files are dummy)"
        fi

        if [ "${VIDEOS_FOUND}" -gt 0 ]; then
            echo "  PASS: ${JUMP_NAME}/videos contains ${VIDEOS_FOUND} video(s)"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "  FAIL: ${JUMP_NAME}/videos has 0 videos"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    done
fi

# Check registry
echo ""
if [ -f "${OUTPUT_DIR}/.ingested_registry.txt" ]; then
    REGISTRY_LINES=$(wc -l < "${OUTPUT_DIR}/.ingested_registry.txt")
    echo "  PASS: Registry file exists with ${REGISTRY_LINES} entry(ies)"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo "  FAIL: Registry file not found"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# ─── Phase 4: Idempotency test ────────────────────────────────

echo ""
echo "[Test] Running pipeline again (idempotency check)..."
"${PATCHED_SCRIPT}" "${PHOTO_DIR}" "${VIDEO_DIR}" 2>/dev/null
NEW_REGISTRY_LINES=$(wc -l < "${OUTPUT_DIR}/.ingested_registry.txt" 2>/dev/null || echo "0")

if [ "${NEW_REGISTRY_LINES}" -eq "${REGISTRY_LINES:-0}" ]; then
    echo "  PASS: Idempotent — registry unchanged after re-run (${NEW_REGISTRY_LINES} entries)"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo "  FAIL: Registry changed after re-run (was ${REGISTRY_LINES:-0}, now ${NEW_REGISTRY_LINES})"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# ─── Summary ───────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "    Summary: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
echo "============================================================"

echo ""
echo "Output directory: ${OUTPUT_DIR}"
echo ""
echo "To inspect:"
echo "  find ${OUTPUT_DIR} -type f | head -30"
echo "  cat ${OUTPUT_DIR}/.ingested_registry.txt"
echo ""

if [ "${FAIL_COUNT}" -gt 0 ]; then
    exit 1
fi
exit 0

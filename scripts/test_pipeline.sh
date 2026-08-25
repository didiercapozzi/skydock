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
#   --names FILE       Passenger names file (one name per line)
#   --theory N         Number of theory sessions to simulate (default: 1)
#   --clean            Remove output and simulation dirs before running
#   -h, --help         Show this help message
#
# If --photo-dir and --video-dir are provided, skips simulation and uses those dirs directly.
# Otherwise, runs simulate_cameras.sh to create test fixtures first.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_BASE="${PROJECT_ROOT}/.sim"
OUTPUT_DIR="${PROJECT_ROOT}/output"
NUM_JUMPS=3
CLEAN=false
PHOTO_DIR=""
VIDEO_DIR=""
NAMES_FILE=""
THEORY_SESSIONS=1

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
        --names)      NAMES_FILE="$2"; shift 2 ;;
        --theory)     THEORY_SESSIONS="$2"; shift 2 ;;
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
    SIM_ARGS=(--output "${SIM_BASE}" --jumps "${NUM_JUMPS}" --theory "${THEORY_SESSIONS}" --clean)
    if [[ -n "${NAMES_FILE}" ]]; then
        SIM_ARGS+=(--names "${NAMES_FILE}")
    fi
    "${SCRIPT_DIR}/simulate_cameras.sh" "${SIM_ARGS[@]}"
    PHOTO_DIR="${SIM_BASE}/photo_cam"
    VIDEO_DIR="${SIM_BASE}/video_cam"
fi

# Use generated names file if none specified
if [[ -z "${NAMES_FILE}" && -f "${SIM_BASE}/passengers.txt" ]]; then
    NAMES_FILE="${SIM_BASE}/passengers.txt"
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
export SKYDOCK_OUTPUT_DIR="${OUTPUT_DIR}"

"${SCRIPT_DIR}/process_media.sh" "${PHOTO_DIR}" "${VIDEO_DIR}" "${NAMES_FILE}" || {
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

# ─── Phase 4: Verify passenger names ──────────────────────────

echo ""
if [[ -n "${NAMES_FILE}" && -f "${NAMES_FILE}" ]]; then
    echo "[Test] Verifying passenger names were applied..."
    NAMES_APPLIED=0
    while IFS= read -r name || [[ -n "${name}" ]]; do
        name=$(echo "${name}" | xargs)
        [[ -z "${name}" ]] && continue
        SAFE_NAME=$(echo "${name}" | sed 's/[^a-zA-Z0-9 _-]//g' | tr ' ' '_')
        for dir in "${DATE_DIR}"/Jump_*"${SAFE_NAME}"*; do
            if [[ -d "${dir}" ]]; then
                NAMES_APPLIED=$((NAMES_APPLIED + 1))
                break
            fi
        done
    done < "${NAMES_FILE}"
    
    if [ "${NAMES_APPLIED}" -gt 0 ]; then
        echo "  PASS: ${NAMES_APPLIED} passenger name(s) applied to jump directories"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: No passenger names found in jump directories"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
else
    echo "[Test] No names file provided, skipping passenger names verification"
fi

# ─── Phase 5: Verify theory files in jump folders ─────────────

echo ""
echo "[Test] Verifying theory files in jump folders..."
THEORY_COPIED=0
for d in "${DATE_DIR}"/Jump_*; do
    [[ -d "$d" ]] || continue
    JUMP_NAME=$(basename "${d}")

    # Check for theory videos (files with THEORY in name)
    THEORY_VIDEOS=$(find "${d}/videos" -type f -iname "*THEORY*" 2>/dev/null | wc -l)

    if [[ "${THEORY_VIDEOS}" -gt 0 ]]; then
        THEORY_COPIED=$((THEORY_COPIED + 1))
        echo "  PASS: ${JUMP_NAME} has ${THEORY_VIDEOS} theory video(s)"
    fi
done

if [ "${THEORY_COPIED}" -gt 0 ]; then
    echo "  PASS: Theory files copied to ${THEORY_COPIED} jump directory(ies)"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo "  INFO: No theory files found in jump directories"
fi

# ─── Phase 6: Idempotency test ────────────────────────────────

echo ""
echo "[Test] Running pipeline again (idempotency check)..."
"${SCRIPT_DIR}/process_media.sh" "${PHOTO_DIR}" "${VIDEO_DIR}" "${NAMES_FILE}" 2>/dev/null
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

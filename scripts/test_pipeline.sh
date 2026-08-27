#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SIM_BASE="${PROJECT_ROOT}/.sim"
OUTPUT_DIR="${PROJECT_ROOT}/output"
NUM_FILES=8
CLEAN=false
declare -a CAMERA_DIRS=()

usage() {
    echo "Usage: $0 [--cam-dir DIR] [--num-files N] [--clean]"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --cam-dir)   CAMERA_DIRS+=("$2"); shift 2 ;;
        --num-files) NUM_FILES="$2"; shift 2 ;;
        --output)    OUTPUT_DIR="$2"; shift 2 ;;
        --clean)     CLEAN=true; shift ;;
        -h|--help)   usage ;;
        *)           echo "Unknown option: $1"; usage ;;
    esac
done

PASS=0
FAIL=0

assert_dir_exists() {
    if [[ -d "$1" ]]; then
        echo "  PASS: $2"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $2"
        FAIL=$((FAIL + 1))
    fi
}

assert_file_count() {
    local dir="$1"
    local expected="$2"
    local label="$3"
    local actual
    actual=$(find "${dir}" -type f 2>/dev/null | wc -l)
    if [[ "${actual}" -ge "${expected}" ]]; then
        echo "  PASS: ${label} (${actual} files)"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: ${label} (expected >=${expected}, got ${actual})"
        FAIL=$((FAIL + 1))
    fi
}

assert_file_exists() {
    if [[ -f "$1" ]]; then
        echo "  PASS: $2"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $2"
        FAIL=$((FAIL + 1))
    fi
}

if $CLEAN; then
    rm -rf "${SIM_BASE}" "${OUTPUT_DIR}"
fi

if [[ ${#CAMERA_DIRS[@]} -eq 0 ]]; then
    echo "[Test] Generating simulated cameras..."
    "${SCRIPT_DIR}/simulate_cameras.sh" --output "${SIM_BASE}" --clean --num-files "${NUM_FILES}"
    CAMERA_DIRS=("${SIM_BASE}/camera1" "${SIM_BASE}/camera2")
fi

mkdir -p "${OUTPUT_DIR}"
export SKYDOCK_OUTPUT_DIR="${OUTPUT_DIR}"

echo ""
echo "============================================================"
echo "    SkyDock Test"
echo "============================================================"
echo ""

echo "[Test] Processing cameras..."
"${SCRIPT_DIR}/process_media.sh" "${CAMERA_DIRS[@]}"

echo ""
echo "------------------------------------------------------------"
echo "Verifying output..."
echo ""

TODAY=$(date +%Y-%m-%d)
assert_dir_exists "${OUTPUT_DIR}/original_files" "Output directory exists"
assert_dir_exists "${OUTPUT_DIR}/original_files/${TODAY}" "Today's date folder exists"

ORIGINAL_COUNT=$(find "${OUTPUT_DIR}/original_files" -type f 2>/dev/null | wc -l)
if [[ "${ORIGINAL_COUNT}" -gt 0 ]]; then
    echo "  PASS: Original files copied (${ORIGINAL_COUNT} files)"
    PASS=$((PASS + 1))
else
    echo "  FAIL: No original files found"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "------------------------------------------------------------"
echo "Testing deduplication (run again)..."
echo ""

"${SCRIPT_DIR}/process_media.sh" "${CAMERA_DIRS[@]}" 2>&1 | tail -1

NEW_ORIGINAL_COUNT=$(find "${OUTPUT_DIR}/original_files" -type f 2>/dev/null | wc -l)
if [[ "${NEW_ORIGINAL_COUNT}" -eq "${ORIGINAL_COUNT}" ]]; then
    echo "  PASS: Deduplication works (no new files copied)"
    PASS=$((PASS + 1))
else
    echo "  FAIL: Deduplication failed (files were copied again)"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "============================================================"
echo "    ${PASS} passed, ${FAIL} failed"
echo "============================================================"

if [[ "${FAIL}" -gt 0 ]]; then
    exit 1
fi
exit 0

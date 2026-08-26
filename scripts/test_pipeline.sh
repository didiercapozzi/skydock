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
#   --video-offset-days N  Shift simulated video camera clock by N days
#   --3phase           Test the 3-phase scan/confirm/execute workflow
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
VIDEO_OFFSET_DAYS=0
THREE_PHASE=false

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
        --video-offset-days) VIDEO_OFFSET_DAYS="$2"; shift 2 ;;
        --3phase)     THREE_PHASE=true; shift ;;
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
    if [[ -d "${dir}" ]]; then
        echo "  PASS: ${label} exists"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: ${label} does not exist"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

assert_file_exists() {
    local file="$1"
    local label="$2"
    if [[ -f "${file}" ]]; then
        echo "  PASS: ${label} exists"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: ${label} does not exist"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

json_str_field() {
    local file="$1"
    local field="$2"
    tr -d '\r\n\t' < "${file}" \
        | sed -n 's/.*"'"${field}"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
        | head -n 1
}

assert_json_field() {
    local file="$1"
    local field="$2"
    local expected="$3"
    local label="$4"
    local actual
    actual=$(json_str_field "${file}" "${field}")
    if [ "${actual}" = "${expected}" ]; then
        echo "  PASS: ${label} = ${actual}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: ${label} expected '${expected}', got '${actual}'"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# ─── Setup ─────────────────────────────────────────────────────

if $CLEAN; then
    echo "[Test] Cleaning previous test artifacts..."
    rm -rf "${SIM_BASE}"
    rm -rf "${OUTPUT_DIR}"
fi

# ─── Phase 1: Generate simulated cameras ───────────────────────

if [[ -n "${PHOTO_DIR}" ]] && [[ -n "${VIDEO_DIR}" ]]; then
    echo "[Test] Using pre-existing camera directories:"
    echo "  Photo: ${PHOTO_DIR}"
    echo "  Video: ${VIDEO_DIR}"
else
    echo "[Test] Generating simulated camera files..."
    SIM_ARGS=(--output "${SIM_BASE}" --clean --day "0:${NUM_JUMPS}:4")
    if [[ "${VIDEO_OFFSET_DAYS}" != "0" ]]; then
        SIM_ARGS+=(--video-offset-days "${VIDEO_OFFSET_DAYS}")
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

export JUMP_GAP_SECONDS=900
export PHOTO_FPS=2
export JPEG_QUALITY=2
export SKYDOCK_OUTPUT_DIR="${OUTPUT_DIR}"

# ─── Test 3-phase workflow ─────────────────────────────────────

if $THREE_PHASE; then
    echo ""
    echo "============================================================"
    echo "    Testing 3-Phase Workflow (scan -> confirm -> execute)"
    echo "============================================================"

    # Phase 1: Scan
    echo ""
    echo "[Test] Phase 1: Scanning cameras..."
    "${SCRIPT_DIR}/scan_media.sh" "${PHOTO_DIR}" "${VIDEO_DIR}" || {
        echo "[Test] ERROR: scan_media.sh failed"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    }

    MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"
    assert_file_exists "${MANIFEST}" "Manifest file"

    # Verify manifest structure
    assert_json_field "${MANIFEST}" "status" "proposed" "Manifest status is proposed"
    if [[ "${VIDEO_OFFSET_DAYS}" != "0" ]]; then
        EXPECTED_DATE=$(date -d "${VIDEO_OFFSET_DAYS} days" +%Y-%m-%d)
    else
        EXPECTED_DATE=$(date +%Y-%m-%d)
    fi
    assert_json_field "${MANIFEST}" "date" "${EXPECTED_DATE}" "Manifest date is ${EXPECTED_DATE}"
    JUMP_COUNT=$(tr -d '\r\n\t' < "${MANIFEST}" | grep -o '"confirmed"' | wc -l)
    if [ "${JUMP_COUNT}" -ge 1 ]; then
        echo "  PASS: Manifest has ${JUMP_COUNT} jump(s)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: Manifest has 0 jumps"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Verify video camera clock drift is preserved in the manifest
    if [[ "${VIDEO_OFFSET_DAYS}" != "0" ]]; then
        EXPECTED_GAP=$(( VIDEO_OFFSET_DAYS * 86400 ))
        PHOTO_SUM=0
        PHOTO_N=0
        VIDEO_SUM=0
        VIDEO_N=0
        FILES_SECTION=$(tr -d '\r\n\t' < "${MANIFEST}" \
            | sed 's/"jumps"[[:space:]]*:[[:space:]]*\[.*//' \
            | sed -n 's/.*"files"[[:space:]]*:[[:space:]]*\[//p' \
            | sed 's/\][^]]*$//' \
            | sed 's/},{/},\n{/g')
        while IFS= read -r chunk; do
            [[ -n "${chunk}" ]] || continue
            MTIME=$(printf '%s' "${chunk}" | sed -n 's/.*"mtime"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
            [[ -n "${MTIME}" ]] || continue
            case "${chunk}" in
                *'"camera": "PHOTO"'*|*'"camera":"PHOTO"'*)
                    PHOTO_SUM=$(( PHOTO_SUM + MTIME ))
                    PHOTO_N=$(( PHOTO_N + 1 ))
                    ;;
                *'"camera": "VIDEO"'*|*'"camera":"VIDEO"'*)
                    VIDEO_SUM=$(( VIDEO_SUM + MTIME ))
                    VIDEO_N=$(( VIDEO_N + 1 ))
                    ;;
            esac
        done <<< "${FILES_SECTION}"
        if [[ "${PHOTO_N}" -gt 0 && "${VIDEO_N}" -gt 0 ]]; then
            DRIFT_DIFF=$(( PHOTO_N * VIDEO_SUM - VIDEO_N * PHOTO_SUM - EXPECTED_GAP * PHOTO_N * VIDEO_N ))
            DRIFT_DIFF=${DRIFT_DIFF#-}
            DRIFT_TOL=$(( 3600 * PHOTO_N * VIDEO_N ))
            if [[ "${DRIFT_DIFF}" -lt "${DRIFT_TOL}" ]]; then
                DRIFT_OK="yes"
            else
                DRIFT_OK="no"
            fi
        else
            DRIFT_OK="no"
        fi
        if [ "${DRIFT_OK}" = "yes" ]; then
            echo "  PASS: Video timestamps offset by ${VIDEO_OFFSET_DAYS} day(s) vs photo"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "  FAIL: Video clock drift (${VIDEO_OFFSET_DAYS} day(s)) not reflected in manifest"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    fi

    # Verify every manifest file carries a unique content fingerprint id
    FILES_ARRAY=$(sed -n 's/^[[:space:]]*"files":[[:space:]]*//p' "${MANIFEST}" | tr -d '\n')
    FILE_ENTRY_COUNT=$(printf '%s\n' "${FILES_ARRAY}" | grep -o '"path":' | wc -l)
    FILE_ID_COUNT=$(printf '%s\n' "${FILES_ARRAY}" | grep -o '"id":"' | wc -l)
    FILE_UNIQUE_IDS=$(printf '%s\n' "${FILES_ARRAY}" | grep -o '"id":"[^"]*"' | sort -u | wc -l)
    if [[ "${FILE_ID_COUNT}" -eq "${FILE_ENTRY_COUNT}" && "${FILE_ID_COUNT}" -gt 0 ]]; then
        echo "  PASS: All ${FILE_ID_COUNT} manifest file(s) have a fingerprint id"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: Fingerprint ids missing (${FILE_ID_COUNT} ids for ${FILE_ENTRY_COUNT} files)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    if [[ "${FILE_UNIQUE_IDS}" -eq "${FILE_ID_COUNT}" ]]; then
        echo "  PASS: All fingerprint ids are unique"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: Only ${FILE_UNIQUE_IDS} unique id(s) for ${FILE_ID_COUNT} files"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Phase 2: Confirm all jumps via manifest edit
    echo ""
    echo "[Test] Phase 2: Confirming all jumps..."
    sed -i 's/"confirmed"[[:space:]]*:[[:space:]]*false/"confirmed":true/g' "${MANIFEST}"
    sed -i 's/"status"[[:space:]]*:[[:space:]]*"proposed"/"status":"confirmed"/' "${MANIFEST}"
    assert_json_field "${MANIFEST}" "status" "confirmed" "Manifest status after confirm"

    # Phase 3: Execute
    echo ""
    echo "[Test] Phase 3: Executing confirmed manifest..."
    "${SCRIPT_DIR}/execute_media.sh" "${MANIFEST}" || {
        echo "[Test] ERROR: execute_media.sh failed"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    }

    # Verify execution results
    DATE_DIR=$(find "${OUTPUT_DIR}" -maxdepth 1 -type d -name "20??-??-??" | head -n1)
    if [[ -z "${DATE_DIR}" ]]; then
        echo "  FAIL: No date directory found after execution"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    else
        echo "  PASS: Date directory created: $(basename "${DATE_DIR}")"
        PASS_COUNT=$((PASS_COUNT + 1))

        JUMP_DIRS=("${DATE_DIR}"/*)
        EXEC_JUMP_COUNT=0
        for d in "${JUMP_DIRS[@]}"; do
            [[ -d "$d" ]] && EXEC_JUMP_COUNT=$((EXEC_JUMP_COUNT + 1))
        done

        if [ "${EXEC_JUMP_COUNT}" -ge 1 ]; then
            echo "  PASS: Found ${EXEC_JUMP_COUNT} jump directory(ies) after execution"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "  FAIL: No jump directories found after execution"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi

        for d in "${JUMP_DIRS[@]}"; do
            [[ -d "$d" ]] || continue
            JUMP_NAME=$(basename "${d}")
            echo ""
            echo "  Checking ${JUMP_NAME}:"
            assert_dir_exists "${d}/photos" "${JUMP_NAME}/photos"
            assert_dir_exists "${d}/videos" "${JUMP_NAME}/videos"

            VIDEOS_FOUND=$(find "${d}/videos" -type f \( -name "*.MP4" -o -name "*.mp4" \) 2>/dev/null | wc -l)
            if [ "${VIDEOS_FOUND}" -gt 0 ]; then
                echo "  PASS: ${JUMP_NAME}/videos contains ${VIDEOS_FOUND} video(s)"
                PASS_COUNT=$((PASS_COUNT + 1))
            elif [[ "${VIDEO_OFFSET_DAYS}" != "0" ]]; then
                echo "  INFO: ${JUMP_NAME}/videos has 0 videos (clock drift splits cameras into separate jumps)"
            else
                echo "  FAIL: ${JUMP_NAME}/videos has 0 videos"
                FAIL_COUNT=$((FAIL_COUNT + 1))
            fi
        done
    fi

    # With clock drift, videos land in their own jumps — assert they were executed at all
    if [[ "${VIDEO_OFFSET_DAYS}" != "0" ]] && [ -n "${DATE_DIR:-}" ]; then
        TOTAL_VIDEOS=$(find "${DATE_DIR}" -type f \( -name "*.MP4" -o -name "*.mp4" \) 2>/dev/null | wc -l)
        if [ "${TOTAL_VIDEOS}" -gt 0 ]; then
            echo "  PASS: ${TOTAL_VIDEOS} video(s) executed across drifted video-only jumps"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "  FAIL: 0 videos executed despite clock-drift simulation"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    fi

    # Verify manifest was marked as executed
    assert_json_field "${MANIFEST}" "status" "executed" "Manifest status after execution"

    # Verify registry
    if [[ -f "${OUTPUT_DIR}/.ingested_registry.txt" ]]; then
        REGISTRY_LINES=$(wc -l < "${OUTPUT_DIR}/.ingested_registry.txt")
        echo "  PASS: Registry has ${REGISTRY_LINES} entry(ies)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: Registry not found"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Verify a regenerated file with the same name gets a new fingerprint id
    REGEN_FILE=$(find "${SIM_BASE}/photo_cam" -type f \( -name '*.MP4' -o -name '*.mp4' \) 2>/dev/null | head -n1)
    if [[ -n "${REGEN_FILE}" && -f "${MANIFEST}" ]]; then
        OLD_ID=$(tr -d '\n' < "${MANIFEST}" | sed 's/},[[:space:]]*/},\n/g' \
            | grep -E "\"path\":[[:space:]]*\"${REGEN_FILE}\"" \
            | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)
        dd if=/dev/urandom of="${REGEN_FILE}" bs=1024 count=32 conv=notrunc status=none
        JUMP_GAP_SECONDS=900 SKYDOCK_OUTPUT_DIR="${OUTPUT_DIR}" \
            "${SCRIPT_DIR}/scan_media.sh" "${SIM_BASE}/photo_cam" "${SIM_BASE}/video_cam" >/dev/null 2>&1
        NEW_ID=$(tr -d '\n' < "${MANIFEST}" | sed 's/},[[:space:]]*/},\n/g' \
            | grep -E "\"path\":[[:space:]]*\"${REGEN_FILE}\"" \
            | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1 || true)
        if [[ -n "${OLD_ID}" && -n "${NEW_ID}" && "${OLD_ID}" != "${NEW_ID}" ]]; then
            echo "  PASS: Same-name regenerated file recognized as new (${OLD_ID} -> ${NEW_ID})"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "  FAIL: Regenerated same-name file kept old id (old='${OLD_ID}' new='${NEW_ID}')"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    fi

    echo ""
    echo "============================================================"
    echo "    3-Phase Test Summary"
    echo "============================================================"

# ─── Test legacy direct workflow ───────────────────────────────

else
    echo ""
    echo "============================================================"
    echo "    Testing Direct Workflow (process_media.sh)"
    echo "============================================================"

    echo ""
    echo "[Test] Running process_media.sh..."
    echo "------------------------------------------------------------"

    "${SCRIPT_DIR}/process_media.sh" "${PHOTO_DIR}" "${VIDEO_DIR}" "${NAMES_FILE}" || {
        echo "[Test] ERROR: process_media.sh failed with exit code $?"
    }

    # Verify output
    echo ""
    echo "------------------------------------------------------------"

    DATE_DIR=$(find "${OUTPUT_DIR}" -maxdepth 1 -type d -name "20??-??-??" | head -n1)

    if [[ -z "${DATE_DIR}" ]]; then
        echo "  FAIL: No date directory found under ${OUTPUT_DIR}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    else
        echo "  PASS: Date directory created: $(basename "${DATE_DIR}")"
        PASS_COUNT=$((PASS_COUNT + 1))

        JUMP_DIRS=("${DATE_DIR}"/Jump_*)
        JUMP_COUNT=0
        for d in "${JUMP_DIRS[@]}"; do
            [[ -d "$d" ]] && JUMP_COUNT=$((JUMP_COUNT + 1))
        done

        if [ "${JUMP_COUNT}" -ge 1 ]; then
            echo "  PASS: Found ${JUMP_COUNT} jump directory(ies)"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "  FAIL: No jump directories found"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi

        for d in "${JUMP_DIRS[@]}"; do
            [[ -d "$d" ]] || continue
            JUMP_NAME=$(basename "${d}")
            echo ""
            echo "  Checking ${JUMP_NAME}:"

            assert_dir_exists "${d}/photos" "${JUMP_NAME}/photos"
            assert_dir_exists "${d}/videos" "${JUMP_NAME}/videos"

            PHOTOS_FOUND=$(find "${d}/photos" -type f -name "*.jpg" 2>/dev/null | wc -l)
            VIDEOS_FOUND=$(find "${d}/videos" -type f \( -name "*.MP4" -o -name "*.mp4" \) 2>/dev/null | wc -l)

            if [ "${PHOTOS_FOUND}" -gt 0 ]; then
                echo "  PASS: ${JUMP_NAME}/photos contains ${PHOTOS_FOUND} JPEG(s)"
                PASS_COUNT=$((PASS_COUNT + 1))
            else
                echo "  INFO: ${JUMP_NAME}/photos has 0 JPEGs"
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
    if [[ -f "${OUTPUT_DIR}/.ingested_registry.txt" ]]; then
        REGISTRY_LINES=$(wc -l < "${OUTPUT_DIR}/.ingested_registry.txt")
        echo "  PASS: Registry file exists with ${REGISTRY_LINES} entry(ies)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: Registry file not found"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Verify passenger names
    echo ""
    if [[ -n "${NAMES_FILE}" && -f "${NAMES_FILE}" ]]; then
        echo "[Test] Verifying passenger names were applied..."
        NAMES_APPLIED=0
        while IFS= read -r name || [[ -n "${name}" ]]; do
            name=$(echo "${name}" | xargs)
            [[ -z "${name}" ]] && continue
            SAFE_NAME=$(echo "${name}" | sed 's/[^a-zA-Z0-9 _-]//g' | tr ' ' '_')
            for dir in "${DATE_DIR}/${SAFE_NAME}" "${DATE_DIR}"/Jump_*"${SAFE_NAME}"*; do
                if [[ -d "${dir}" ]]; then
                    NAMES_APPLIED=$((NAMES_APPLIED + 1))
                    break
                fi
            done
        done < "${NAMES_FILE}"

        if [ "${NAMES_APPLIED}" -gt 0 ]; then
            echo "  PASS: ${NAMES_APPLIED} passenger name(s) applied"
            PASS_COUNT=$((PASS_COUNT + 1))
        else
            echo "  FAIL: No passenger names found"
            FAIL_COUNT=$((FAIL_COUNT + 1))
        fi
    fi

    # Verify theory files
    echo ""
    THEORY_COPIED=0
    for d in "${DATE_DIR}"/Jump_*; do
        [[ -d "$d" ]] || continue
        JUMP_NAME=$(basename "${d}")
        THEORY_VIDEOS=$(find "${d}/videos" -type f -iname "*THEORY*" 2>/dev/null | wc -l)
        if [[ "${THEORY_VIDEOS}" -gt 0 ]]; then
            THEORY_COPIED=$((THEORY_COPIED + 1))
            echo "  PASS: ${JUMP_NAME} has ${THEORY_VIDEOS} theory video(s)"
        fi
    done
    if [ "${THEORY_COPIED}" -gt 0 ]; then
        echo "  PASS: Theory files copied to ${THEORY_COPIED} jump directory(ies)"
        PASS_COUNT=$((PASS_COUNT + 1))
    fi

    # Idempotency test
    echo ""
    echo "[Test] Running pipeline again (idempotency check)..."
    "${SCRIPT_DIR}/process_media.sh" "${PHOTO_DIR}" "${VIDEO_DIR}" "${NAMES_FILE}" 2>/dev/null
    NEW_REGISTRY_LINES=$(wc -l < "${OUTPUT_DIR}/.ingested_registry.txt" 2>/dev/null || echo "0")

    if [ "${NEW_REGISTRY_LINES}" -eq "${REGISTRY_LINES:-0}" ]; then
        echo "  PASS: Idempotent — registry unchanged (${NEW_REGISTRY_LINES} entries)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  FAIL: Registry changed (was ${REGISTRY_LINES:-0}, now ${NEW_REGISTRY_LINES})"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    echo ""
    echo "============================================================"
    echo "    Direct Workflow Test Summary"
    echo "============================================================"
fi

# ─── Summary ───────────────────────────────────────────────────

echo ""
echo "    ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
echo "============================================================"

echo ""
echo "Output directory: ${OUTPUT_DIR}"
echo ""

if [ "${FAIL_COUNT}" -gt 0 ]; then
    exit 1
fi
exit 0

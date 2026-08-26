#!/usr/bin/env bash
set -eo pipefail

# execute_media.sh — Phase 3: Execute confirmed jump manifest
#
# Reads a confirmed proposed_jumps.json and performs the actual file operations:
# folder creation, photo extraction, video copying, registry updates.
#
# Usage:
#   ./execute_media.sh [manifest_path]
#
# If no manifest path is given, reads from $SKYDOCK_OUTPUT_DIR/proposed_jumps.json

MANIFEST="${1:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
REGISTRY_FILE="${OUTPUT_DIR}/.ingested_registry.txt"
PROCESSING_FILE="${OUTPUT_DIR}/.processing"
PHOTO_FPS=${PHOTO_FPS:-2}
JPEG_QUALITY=${JPEG_QUALITY:-2}

if [[ -z "${MANIFEST}" ]]; then
    MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"
fi

if [[ ! -f "${MANIFEST}" ]]; then
    echo "[Execute] ERROR: Manifest not found: ${MANIFEST}" >&2
    echo "[Execute] Run scan_media.sh first to generate a manifest." >&2
    exit 1
fi

STATUS=$(jq -r '.status' "${MANIFEST}")

if [[ "${STATUS}" != "confirmed" ]]; then
    echo "[Execute] ERROR: Manifest status is '${STATUS}', expected 'confirmed'." >&2
    echo "[Execute] Use the web UI to review and confirm the manifest before executing." >&2
    exit 1
fi

touch "${REGISTRY_FILE}"
echo "processing" > "${PROCESSING_FILE}"
trap 'rm -f "${PROCESSING_FILE}"' EXIT

DATE=$(jq -r '.date // empty' "${MANIFEST}")

[[ -n "${DATE}" ]] || DATE=$(date +%Y-%m-%d)
DATE_DIR="${OUTPUT_DIR}/${DATE}"
mkdir -p "${DATE_DIR}"

TMP_FILE_LIST=$(mktemp)
trap 'rm -rf "${TMP_FILE_LIST}" "${PROCESSING_FILE}"' EXIT

jq -r '
    (.theory // []) | .[] |
    (.id // "" | if . == "" then ("VIDEO:" + .filename) else . end) as $file_id |
    "THEORY|\(.path // "")|\(.filename // "")|\($file_id)"
' "${MANIFEST}" > "${TMP_FILE_LIST}"

jq -r '
    .jumps // [] | to_entries[] |
    (.key + 1) as $jump_idx |
    .value as $jump |
    ($jump.label // "") as $label |
    ($jump.confirmed // false) as $confirmed |
    ($jump.files // []) | .[] |
    (.id // "" | if . == "" then (.camera + ":" + .filename) else . end) as $file_id |
    "\($jump_idx)|\($label)|\($confirmed)|\(.path // "")|\(.camera // "")|\(.filename // "")|\($file_id)"
' "${MANIFEST}" >> "${TMP_FILE_LIST}"

THEORY_COUNT=$(grep -c '^THEORY|' "${TMP_FILE_LIST}" || true)

echo "[Execute] Processing jumps for ${DATE}..."

THEORY_DIR=""
if [[ "${THEORY_COUNT}" -gt 0 ]]; then
    THEORY_DIR=$(mktemp -d)
    trap 'rm -rf "${THEORY_DIR}" "${TMP_FILE_LIST}" "${PROCESSING_FILE}"' EXIT

    while IFS='|' read -r _type filepath filename file_id; do
        [[ -f "${filepath}" ]] || continue
        [[ "${filename}" =~ [Tt][Hh][Ee][Oo][Rr][Yy] ]] || continue
        cp -an "${filepath}" "${THEORY_DIR}/${filename}" 2>/dev/null || true
        printf '%s\n' "${file_id}" >> "${REGISTRY_FILE}"
    done < <(grep '^THEORY|' "${TMP_FILE_LIST}")
fi

CURRENT_JUMP_IDX=""
CURRENT_SAFE_NAME=""
CURRENT_PHOTOS_DIR=""
CURRENT_VIDEOS_DIR=""

process_line() {
    local jump_idx="$1" jump_label="$2" confirmed="$3" filepath="$4" camera="$5" filename="$6" file_id="$7"

    [[ "${confirmed}" == "true" ]] || return 0

    if [[ "${jump_idx}" != "${CURRENT_JUMP_IDX}" ]]; then
        CURRENT_JUMP_IDX="${jump_idx}"
        CURRENT_SAFE_NAME=$(printf '%s' "${jump_label}" | sed 's/[^a-zA-Z0-9 _-]//g' | tr ' ' '_')
        CURRENT_PHOTOS_DIR="${DATE_DIR}/${CURRENT_SAFE_NAME}/photos"
        CURRENT_VIDEOS_DIR="${DATE_DIR}/${CURRENT_SAFE_NAME}/videos"
        mkdir -p "${CURRENT_PHOTOS_DIR}" "${CURRENT_VIDEOS_DIR}"
        echo "[Execute] Processing '${jump_label}'..."
    fi

    [[ -f "${filepath}" ]] || return 0

    if grep -Fqx "${file_id}" "${REGISTRY_FILE}" 2>/dev/null; then
        return 0
    fi

    if [[ "${camera}" == "PHOTO" ]]; then
        local basename_noext="${filename%.*}"
        echo "  [Extract] ${filename} -> ${CURRENT_SAFE_NAME}/photos/..."
        ffmpeg -nostdin -loglevel error -stats -i "${filepath}" \
            -vf "fps=${PHOTO_FPS}" \
            -q:v "${JPEG_QUALITY}" \
            "${CURRENT_PHOTOS_DIR}/${basename_noext}_frame_%04d.jpg"
    else
        echo "  [Copy] ${filename} -> ${CURRENT_SAFE_NAME}/videos/..."
        cp -an "${filepath}" "${CURRENT_VIDEOS_DIR}/${filename}"
    fi

    printf '%s\n' "${file_id}" >> "${REGISTRY_FILE}"

    if [[ "${THEORY_COUNT}" -gt 0 && -d "${THEORY_DIR}" ]]; then
        cp -an "${THEORY_DIR}"/* "${CURRENT_VIDEOS_DIR}/" 2>/dev/null || true
    fi
}

while IFS='|' read -r jump_idx jump_label confirmed filepath camera filename file_id; do
    process_line "${jump_idx}" "${jump_label}" "${confirmed}" "${filepath}" "${camera}" "${filename}" "${file_id}"
done < <(grep -v '^THEORY|' "${TMP_FILE_LIST}")

TMP_MANIFEST=$(mktemp)
jq '.status = "executed"' "${MANIFEST}" > "${TMP_MANIFEST}"
mv "${TMP_MANIFEST}" "${MANIFEST}"

sync
echo "[Done] Execution complete for ${DATE}."

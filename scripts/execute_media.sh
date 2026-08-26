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

flatten_manifest() {
    tr -d '\r\n\t' < "${MANIFEST}" | sed 's/[[:space:]][[:space:]]*/ /g'
}

split_objects() {
    sed -e 's/},{/},\n{/g' -e 's/\[{/[\
{/g'
}

extract_str() {
    local key="$1"
    sed -n 's/.*"'"${key}"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

extract_num() {
    local key="$1"
    sed -n 's/.*"'"${key}"'"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' | head -n 1
}

MANIFEST_FLAT=$(flatten_manifest)

STATUS=$(printf '%s' "${MANIFEST_FLAT}" | extract_str status)
if [[ "${STATUS}" != "confirmed" ]]; then
    echo "[Execute] ERROR: Manifest status is '${STATUS}', expected 'confirmed'." >&2
    echo "[Execute] Use the web UI to review and confirm the manifest before executing." >&2
    exit 1
fi

touch "${REGISTRY_FILE}"
echo "processing" > "${PROCESSING_FILE}"
trap 'rm -f "${PROCESSING_FILE}"' EXIT

DATE=$(printf '%s' "${MANIFEST_FLAT}" | extract_str date)
[[ -n "${DATE}" ]] || DATE=$(date +%Y-%m-%d)
DATE_DIR="${OUTPUT_DIR}/${DATE}"
mkdir -p "${DATE_DIR}"

JUMP_COUNT=$(printf '%s' "${MANIFEST_FLAT}" | grep -oE '"confirmed"[[:space:]]*:[[:space:]]*(true|false)' | wc -l || true)

echo "[Execute] Processing ${JUMP_COUNT} confirmed jump(s) for ${DATE}..."

THEORY_SECTION=$(printf '%s' "${MANIFEST_FLAT}" | sed -n 's/.*"theory"[[:space:]]*:[[:space:]]*\[\([^]]*\).*/\1/p')
THEORY_COUNT=$(printf '%s' "${THEORY_SECTION}" | grep -o '"path"' | wc -l || true)

THEORY_DIR=""
register_theory_files() {
    local filepath filename file_id
    while IFS= read -r filepath || [[ -n "${filepath}" ]]; do
        [[ -f "${filepath}" ]] || continue
        filename=$(basename "${filepath}")
        [[ "${filename}" =~ [Tt][Hh][Ee][Oo][Rr][Yy] ]] || continue
        cp -an "${filepath}" "${THEORY_DIR}/${filename}" 2>/dev/null || true
        file_id=$(printf '%s' "${THEORY_SECTION}" | tr ',' '\n' \
            | grep -E "\"path\":[[:space:]]*\"${filepath}\"" \
            | extract_str id || true)
        [[ -n "${file_id}" ]] || file_id="VIDEO:${filename}:$(stat -c %s "${filepath}"):$(stat -c %Y "${filepath}")"
        printf '%s\n' "${file_id}" >> "${REGISTRY_FILE}"
    done
}

if [[ "${THEORY_COUNT}" -gt 0 ]]; then
    echo "[Execute] Processing ${THEORY_COUNT} theory file(s)..."
    THEORY_DIR=$(mktemp -d)
    trap 'rm -rf "${THEORY_DIR}" "${PROCESSING_FILE}" 2>/dev/null' EXIT
    printf '%s' "${THEORY_SECTION}" | split_objects | extract_str path | register_theory_files
fi

TMP_JUMP_FILES=$(mktemp)
trap 'rm -rf "${THEORY_DIR}" "${TMP_JUMP_FILES}" "${PROCESSING_FILE}" 2>/dev/null' EXIT

parse_jump_entries() {
    local jump_idx=0
    local chunk
    while IFS= read -r chunk || [[ -n "${chunk}" ]]; do
        [[ -n "${chunk}" ]] || continue
        if printf '%s' "${chunk}" | grep -q '"label"'; then
            jump_idx=$(( jump_idx + 1 ))
            continue
        fi
        printf '%s' "${chunk}" | grep -q '"path"' || continue
        printf '%s|%s\n' "${jump_idx}" "${chunk}" >> "${TMP_JUMP_FILES}"
    done
}

printf '%s' "${MANIFEST_FLAT}" \
    | sed -n 's/.*"jumps"[[:space:]]*:[[:space:]]*\[//p' \
    | sed 's/\][^]]*$//' \
    | split_objects \
    | parse_jump_entries

process_file_chunk() {
    local chunk="$1" safe_name="$2" photos_dir="$3" videos_dir="$4"
    local file_path file_camera file_size file_mtime file_name file_id basename_noext
    file_path=$(printf '%s' "${chunk}" | extract_str path)
    file_camera=$(printf '%s' "${chunk}" | extract_str camera)
    file_size=$(printf '%s' "${chunk}" | extract_num size)
    file_mtime=$(printf '%s' "${chunk}" | extract_num mtime)
    file_name=$(printf '%s' "${chunk}" | extract_str filename)
    file_id=$(printf '%s' "${chunk}" | extract_str id || true)

    [[ -f "${file_path}" ]] || return 0

    if [[ -z "${file_id}" ]]; then
        file_id="${file_camera}:${file_name}:${file_size}:${file_mtime}"
    fi

    if grep -Fqx "${file_id}" "${REGISTRY_FILE}" 2>/dev/null; then
        return 0
    fi

    basename_noext="${file_name%.*}"

    if [[ "${file_camera}" == "PHOTO" ]]; then
        echo "  [Extract] ${file_name} -> ${safe_name}/photos/..."
        ffmpeg -nostdin -loglevel error -stats -i "${file_path}" \
            -vf "fps=${PHOTO_FPS}" \
            -q:v "${JPEG_QUALITY}" \
            "${photos_dir}/${basename_noext}_frame_%04d.jpg"
    else
        echo "  [Copy] ${file_name} -> ${safe_name}/videos/..."
        cp -an "${file_path}" "${videos_dir}/${file_name}"
    fi

    printf '%s\n' "${file_id}" >> "${REGISTRY_FILE}"
}

for (( j=1; j<=JUMP_COUNT; j++ )); do
    JUMP_CHUNK=$(printf '%s' "${MANIFEST_FLAT}" \
        | sed -n 's/.*"jumps"[[:space:]]*:[[:space:]]*\[//p' \
        | sed 's/\][^]]*$//' \
        | split_objects \
        | grep '"label"' | sed -n "${j}p" || true)
    JUMP_LABEL=$(printf '%s' "${JUMP_CHUNK}" | extract_str label)
    if ! printf '%s' "${JUMP_CHUNK}" | grep -q '"confirmed"[[:space:]]*:[[:space:]]*true'; then
        echo "[Execute] Skipping '${JUMP_LABEL}' (not confirmed)."
        continue
    fi

    SAFE_NAME=$(printf '%s' "${JUMP_LABEL}" | sed 's/[^a-zA-Z0-9 _-]//g' | tr ' ' '_')
    PHOTOS_DIR="${DATE_DIR}/${SAFE_NAME}/photos"
    VIDEOS_DIR="${DATE_DIR}/${SAFE_NAME}/videos"
    mkdir -p "${PHOTOS_DIR}" "${VIDEOS_DIR}"

    echo "[Execute] Processing '${JUMP_LABEL}'..."

    while IFS= read -r chunk || [[ -n "${chunk}" ]]; do
        process_file_chunk "${chunk}" "${SAFE_NAME}" "${PHOTOS_DIR}" "${VIDEOS_DIR}"
    done < <(grep -E "^${j}\|" "${TMP_JUMP_FILES}" | cut -d'|' -f2-)

    if [[ "${THEORY_COUNT}" -gt 0 && -d "${THEORY_DIR}" ]]; then
        cp -an "${THEORY_DIR}"/* "${DATE_DIR}/${SAFE_NAME}/videos/" 2>/dev/null || true
    fi
done

sed -i 's/"status"[[:space:]]*:[[:space:]]*"confirmed"/"status":"executed"/' "${MANIFEST}"

sync
echo "[Done] Execution complete for ${DATE}."

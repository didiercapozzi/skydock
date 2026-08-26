#!/usr/bin/env bash
set -eo pipefail

PHOTO_ROOT="$1"
VIDEO_ROOT="$2"
OUTPUT_MANIFEST="${3:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
JUMP_GAP=${JUMP_GAP_SECONDS:-1800}

if [[ -z "${PHOTO_ROOT}" || -z "${VIDEO_ROOT}" ]]; then
    echo "Usage: $0 <photo_dir> <video_dir> [output_manifest]" >&2
    exit 1
fi

if [[ -z "${OUTPUT_MANIFEST}" ]]; then
    OUTPUT_MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"
fi

mkdir -p "$(dirname "${OUTPUT_MANIFEST}")"

TMP_ALL_FILES=$(mktemp)
TMP_THEORY_LIST=$(mktemp)
trap 'rm -f "${TMP_ALL_FILES}" "${TMP_THEORY_LIST}"' EXIT

scan_camera_files() {
    local src_dir="$1"
    local cam_type="$2"

    if [[ -z "${src_dir}" || ! -d "${src_dir}" ]]; then
        return
    fi

    while IFS= read -r filepath; do
        local filename filesize file_mtime
        filename=$(basename "${filepath}")
        filesize=$(stat -c %s "${filepath}")
        file_mtime=$(stat -c %Y "${filepath}")

        if [[ "${filename}" =~ [Tt][Hh][Ee][Oo][Rr][Yy] ]]; then
            echo "${file_mtime}|${filepath}|${filesize}|${cam_type}" >> "${TMP_THEORY_LIST}"
        else
            echo "${file_mtime}|${filepath}|${filesize}|${cam_type}" >> "${TMP_ALL_FILES}"
        fi
    done < <(find "${src_dir}" -type f \( -iname "*.mp4" -o -iname "*.mov" \) 2>/dev/null)
}

scan_camera_files "${PHOTO_ROOT}" "PHOTO"
scan_camera_files "${VIDEO_ROOT}" "VIDEO"

PHOTO_COUNT=$(awk -F'|' '$4=="PHOTO"' "${TMP_ALL_FILES}" 2>/dev/null | wc -l)
VIDEO_COUNT=$(awk -F'|' '$4=="VIDEO"' "${TMP_ALL_FILES}" 2>/dev/null | wc -l)
TOTAL_COUNT=$(( PHOTO_COUNT + VIDEO_COUNT ))

if [[ "${TOTAL_COUNT}" -eq 0 ]]; then
    echo "[Scan] No new files found."
    cat > "${OUTPUT_MANIFEST}" <<EOF
{
  "version": 1,
  "status": "empty",
  "date": "$(date +%Y-%m-%d)",
  "startDatetime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "camera1": {"path": "${PHOTO_ROOT}", "fileCount": 0},
  "camera2": {"path": "${VIDEO_ROOT}", "fileCount": 0},
  "theory": [],
  "jumps": [],
  "loneFiles": []
}
EOF
    exit 0
fi

ALL_EPOCHS=$(cat "${TMP_ALL_FILES}" "${TMP_THEORY_LIST}" 2>/dev/null | cut -d'|' -f1 | sort -n | head -n1)
if [[ -n "${ALL_EPOCHS}" ]]; then
    TARGET_DATE=$(date -d "@${ALL_EPOCHS}" +"%Y-%m-%d")
    START_DATETIME=$(date -d "@${ALL_EPOCHS}" -u +"%Y-%m-%dT%H:%M:%SZ")
else
    TARGET_DATE=$(date +"%Y-%m-%d")
    START_DATETIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
fi

SORTED_ALL=$(mktemp)
trap 'rm -f "${TMP_ALL_FILES}" "${TMP_THEORY_LIST}" "${SORTED_ALL}"' EXIT
sort -t'|' -k1,1n "${TMP_ALL_FILES}" > "${SORTED_ALL}"

JUMPS_JSON=""
LONE_FILES_JSON=""
JUMP_NUM=0
LAST_EPOCH=0
CURRENT_JUMP_FILES=""

flush_jump() {
    if [[ -n "${CURRENT_JUMP_FILES}" ]]; then
        JUMP_NUM=$(( JUMP_NUM + 1 ))
        JUMP_ID="jump_${JUMP_NUM}"
        if [[ -n "${JUMPS_JSON}" ]]; then
            JUMPS_JSON="${JUMPS_JSON},"
        fi
        JUMPS_JSON="${JUMPS_JSON}$(printf '{"id":"%s","label":"Jump %d","confirmed":false,"files":[%s]}' \
            "${JUMP_ID}" "${JUMP_NUM}" "${CURRENT_JUMP_FILES}")"
        CURRENT_JUMP_FILES=""
    fi
}

while IFS='|' read -r epoch filepath filesize cam_type; do
    if (( LAST_EPOCH > 0 )) && (( epoch - LAST_EPOCH > JUMP_GAP )); then
        flush_jump
    fi
    LAST_EPOCH="${epoch}"

    if [[ -n "${CURRENT_JUMP_FILES}" ]]; then
        CURRENT_JUMP_FILES="${CURRENT_JUMP_FILES},"
    fi
    CURRENT_JUMP_FILES="${CURRENT_JUMP_FILES}$(printf '{"path":"%s","camera":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
        "${filepath}" "${cam_type}" "${filesize}" "$(( epoch * 1000 ))" "$(basename "${filepath}")")"
done < "${SORTED_ALL}"

flush_jump

if [[ "${JUMP_NUM}" -eq 1 ]]; then
    JUMPS_JSON="${JUMPS_JSON%,}"
fi

THEORY_FILES=""
if [[ -s "${TMP_THEORY_LIST}" ]]; then
    while IFS='|' read -r epoch filepath filesize cam_type; do
        [[ -n "${THEORY_FILES}" ]] && THEORY_FILES="${THEORY_FILES},"
        THEORY_FILES="${THEORY_FILES}$(printf '{"path":"%s","camera":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
            "${filepath}" "${cam_type}" "${filesize}" "$(( epoch * 1000 ))" "$(basename "${filepath}")")"
    done < <(sort -t'|' -k1,1n "${TMP_THEORY_LIST}")
fi

CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${OUTPUT_MANIFEST}" <<EOF
{
  "version": 1,
  "status": "proposed",
  "date": "${TARGET_DATE}",
  "startDatetime": "${START_DATETIME}",
  "createdAt": "${CREATED_AT}",
  "camera1": {"path": "${PHOTO_ROOT}", "fileCount": ${PHOTO_COUNT}},
  "camera2": {"path": "${VIDEO_ROOT}", "fileCount": ${VIDEO_COUNT}},
  "theory": [${THEORY_FILES}],
  "jumps": [${JUMPS_JSON}],
  "loneFiles": []
}
EOF

echo "[Scan] Manifest written to ${OUTPUT_MANIFEST}"
echo "[Scan] ${JUMP_NUM} jump(s) proposed for review."

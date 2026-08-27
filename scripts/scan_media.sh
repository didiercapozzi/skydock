#!/usr/bin/env bash
set -eo pipefail

OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
ORIGINAL_DIR="${OUTPUT_DIR}/original_files"
MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"

if [[ ! -d "${ORIGINAL_DIR}" ]]; then
    echo "[Scan] No original_files directory found. Run process_media.sh first."
    exit 1
fi

mkdir -p "${OUTPUT_DIR}"

ALL_FILES=""
FILE_NUM=0
JUMP_NUM=0
LAST_EPOCH=0
CURRENT_JUMP_FILES=""

while IFS= read -r filepath; do
    filename=$(basename "${filepath}")
    file_mtime=$(stat -c %Y "${filepath}")
    file_size=$(stat -c %s "${filepath}")

    FILE_NUM=$((FILE_NUM + 1))

    file_json=$(printf '{"path":"%s","camera":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
        "${filepath}" "camera1" "${file_size}" "${file_mtime}" "${filename}")

    [[ -n "${ALL_FILES}" ]] && ALL_FILES="${ALL_FILES},"
    ALL_FILES="${ALL_FILES}${file_json}"

    if (( LAST_EPOCH > 0 )) && (( file_mtime - LAST_EPOCH > 1800 )); then
        if [[ -n "${CURRENT_JUMP_FILES}" ]]; then
            JUMP_NUM=$((JUMP_NUM + 1))
            [[ -n "${JUMPS_JSON}" ]] && JUMPS_JSON="${JUMPS_JSON},"
            JUMPS_JSON="${JUMPS_JSON}$(printf '{"id":"jump_%d","label":"Jump %d","confirmed":false,"files":[%s]}' \
                "${JUMP_NUM}" "${JUMP_NUM}" "${CURRENT_JUMP_FILES}")"
            CURRENT_JUMP_FILES=""
        fi
    fi
    LAST_EPOCH="${file_mtime}"

    [[ -n "${CURRENT_JUMP_FILES}" ]] && CURRENT_JUMP_FILES="${CURRENT_JUMP_FILES},"
    CURRENT_JUMP_FILES="${CURRENT_JUMP_FILES}${file_json}"

done < <(find "${ORIGINAL_DIR}" -type f \( \
    -iname "*.mp4" -o -iname "*.mov" -o \
    -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
\) -printf '%T@\t%p\n' 2>/dev/null | sort -n | cut -f2-)

if [[ -n "${CURRENT_JUMP_FILES}" ]]; then
    JUMP_NUM=$((JUMP_NUM + 1))
    [[ -n "${JUMPS_JSON}" ]] && JUMPS_JSON="${JUMPS_JSON},"
    JUMPS_JSON="${JUMPS_JSON}$(printf '{"id":"jump_%d","label":"Jump %d","confirmed":false,"files":[%s]}' \
        "${JUMP_NUM}" "${JUMP_NUM}" "${CURRENT_JUMP_FILES}")"
fi

TARGET_DATE=$(date +%Y-%m-%d)
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${MANIFEST}" <<EOF
{
  "version": 1,
  "status": "proposed",
  "date": "${TARGET_DATE}",
  "startDatetime": "${CREATED_AT}",
  "createdAt": "${CREATED_AT}",
  "files": [${ALL_FILES}],
  "jumps": [${JUMPS_JSON}]
}
EOF

echo "[Scan] Found ${FILE_NUM} file(s) in ${JUMP_NUM} jump(s)."
echo "[Scan] Manifest: ${MANIFEST}"

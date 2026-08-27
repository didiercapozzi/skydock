#!/usr/bin/env bash
set -eo pipefail

OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/camera_files}"
OUTPUT_MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"

CAMERA_DIRS=()
while [[ $# -gt 0 ]]; do
    [[ -d "$1" ]] && CAMERA_DIRS+=("$1")
    shift
done

if [[ ${#CAMERA_DIRS[@]} -eq 0 ]]; then
    echo "Usage: $0 <camera_dir> [camera_dir ...]"
    exit 1
fi

mkdir -p "${OUTPUT_DIR}"

ALL_FILES=""
JUMPS_JSON=""
FILE_NUM=0
JUMP_NUM=0
LAST_EPOCH=0
CURRENT_JUMP_FILES=""

for cam_dir in "${CAMERA_DIRS[@]}"; do
    cam_num=0
    for d in "${CAMERA_DIRS[@]}"; do
        cam_num=$((cam_num + 1))
        [[ "${d}" == "${cam_dir}" ]] && break
    done
    cam_name="camera${cam_num}"

    while IFS= read -r filepath; do
        filename=$(basename "${filepath}")
        file_mtime=$(stat -c %Y "${filepath}")
        file_size=$(stat -c %s "${filepath}")

        FILE_NUM=$((FILE_NUM + 1))
        file_id="cam${cam_num}_${FILE_NUM}"

        file_json=$(printf '{"path":"%s","camera":"%s","size":%d,"mtime":%d,"filename":"%s","id":"%s"}' \
            "${filepath}" "${cam_name}" "${file_size}" "${file_mtime}" "${filename}" "${file_id}")

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

    done < <(find "${cam_dir}" -maxdepth 4 -type f \( \
        -iname "*.mp4" -o -iname "*.mov" -o \
        -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
    \) 2>/dev/null)
done

if [[ -n "${CURRENT_JUMP_FILES}" ]]; then
    JUMP_NUM=$((JUMP_NUM + 1))
    [[ -n "${JUMPS_JSON}" ]] && JUMPS_JSON="${JUMPS_JSON},"
    JUMPS_JSON="${JUMPS_JSON}$(printf '{"id":"jump_%d","label":"Jump %d","confirmed":false,"files":[%s]}' \
        "${JUMP_NUM}" "${JUMP_NUM}" "${CURRENT_JUMP_FILES}")"
fi

CAMERAS_JSON=""
cam_num=0
for cam_dir in "${CAMERA_DIRS[@]}"; do
    cam_num=$((cam_num + 1))
    [[ -n "${CAMERAS_JSON}" ]] && CAMERAS_JSON="${CAMERAS_JSON},"
    CAMERAS_JSON="${CAMERAS_JSON}$(printf '{"id":"camera%d","path":"%s"}' "${cam_num}" "${cam_dir}")"
done

TARGET_DATE=$(date +%Y-%m-%d)
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${OUTPUT_MANIFEST}" <<EOF
{
  "version": 1,
  "status": "proposed",
  "date": "${TARGET_DATE}",
  "startDatetime": "${CREATED_AT}",
  "createdAt": "${CREATED_AT}",
  "cameras": [${CAMERAS_JSON}],
  "files": [${ALL_FILES}],
  "jumps": [${JUMPS_JSON}]
}
EOF

echo "[Scan] Found ${FILE_NUM} file(s) in ${JUMP_NUM} jump(s)."
echo "[Scan] Manifest: ${OUTPUT_MANIFEST}"

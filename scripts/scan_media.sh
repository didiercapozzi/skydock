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

HAS_EXIFTOOL=false
if command -v exiftool &>/dev/null; then
    HAS_EXIFTOOL=true
fi

build_time_map() {
    local -n map_ref=$1
    shift
    local files=("$@")

    if [[ "${HAS_EXIFTOOL}" != "true" ]] || [[ ${#files[@]} -eq 0 ]]; then
        return
    fi

    local jpg_files=()
    local mp4_files=()
    for f in "${files[@]}"; do
        local ext="${f##*.}"
        ext=$(echo "${ext}" | tr '[:upper:]' '[:lower:]')
        case "${ext}" in
            jpg|jpeg|dng) jpg_files+=("${f}") ;;
            mp4|mov) mp4_files+=("${f}") ;;
        esac
    done

    if [[ ${#jpg_files[@]} -gt 0 ]]; then
        while IFS=, read -r srcfile dateval; do
            [[ "${srcfile}" == "SourceFile" ]] && continue
            [[ -z "${dateval}" ]] && continue
            map_ref["${srcfile}"]="${dateval}"
        done < <(exiftool -s3 -DateTimeOriginal -csv "${jpg_files[@]}" 2>/dev/null)
    fi

    if [[ ${#mp4_files[@]} -gt 0 ]]; then
        while IFS=, read -r srcfile dateval; do
            [[ "${srcfile}" == "SourceFile" ]] && continue
            [[ -z "${dateval}" ]] && continue
            map_ref["${srcfile}"]="${dateval}"
        done < <(exiftool -s3 -CreateDate -csv "${mp4_files[@]}" 2>/dev/null)
    fi
}

get_capture_epoch() {
    local filepath="$1"
    local -n map_ref=$2

    if [[ -n "${map_ref[${filepath}]+_}" ]]; then
        local tag="${map_ref[${filepath}]}"
        local date_part="${tag%% *}"
        local time_part="${tag#* }"
        date_part="${date_part//:/-}"
        date -d "${date_part} ${time_part}" +%s 2>/dev/null || echo "0"
        return
    fi

    stat -c %Y "${filepath}"
}

get_capture_date() {
    local filepath="$1"
    local -n map_ref=$2

    if [[ -n "${map_ref[${filepath}]+_}" ]]; then
        local tag="${map_ref[${filepath}]}"
        echo "${tag%% *}" | sed 's/^\([0-9]\{4\}\):\([0-9]\{2\}\):\([0-9]\{2\}\)/\1-\2-\3/'
        return
    fi

    local mtime
    mtime=$(stat -c %Y "${filepath}")
    date -d "@${mtime}" +%Y-%m-%d
}

ALL_FILES=()
while IFS= read -r filepath; do
    ALL_FILES+=("${filepath}")
done < <(find "${ORIGINAL_DIR}" -type f \( \
    -iname "*.mp4" -o -iname "*.mov" -o \
    -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
\) 2>/dev/null)

declare -A TIME_MAP
build_time_map TIME_MAP "${ALL_FILES[@]}"

declare -A FILE_EPOCH
declare -A FILE_SIZE

for filepath in "${ALL_FILES[@]}"; do
    FILE_EPOCH["${filepath}"]=$(get_capture_epoch "${filepath}" TIME_MAP)
    FILE_SIZE["${filepath}"]=$(stat -c %s "${filepath}")
done

SORTED_FILES=()
while IFS= read -r filepath; do
    SORTED_FILES+=("${filepath}")
done < <(for f in "${ALL_FILES[@]}"; do
    echo "${FILE_EPOCH[$f]} $f"
done | sort -n | cut -d' ' -f2-)

ALL_JSON=""
FILE_NUM=0
JUMP_NUM=0
LAST_EPOCH=0
CURRENT_JUMP_FILES=""

for filepath in "${SORTED_FILES[@]}"; do
    filename=$(basename "${filepath}")
    file_epoch="${FILE_EPOCH[${filepath}]}"
    file_size="${FILE_SIZE[${filepath}]}"

    FILE_NUM=$((FILE_NUM + 1))

    file_json=$(printf '{"path":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
        "${filepath}" "${file_size}" "${file_epoch}" "${filename}")

    [[ -n "${ALL_JSON}" ]] && ALL_JSON="${ALL_JSON},"
    ALL_JSON="${ALL_JSON}${file_json}"

    if (( LAST_EPOCH > 0 )) && (( file_epoch - LAST_EPOCH > 1800 )); then
        if [[ -n "${CURRENT_JUMP_FILES}" ]]; then
            JUMP_NUM=$((JUMP_NUM + 1))
            [[ -n "${JUMPS_JSON}" ]] && JUMPS_JSON="${JUMPS_JSON},"
            JUMPS_JSON="${JUMPS_JSON}$(printf '{"id":"jump_%d","label":"Jump %d","confirmed":false,"files":[%s]}' \
                "${JUMP_NUM}" "${JUMP_NUM}" "${CURRENT_JUMP_FILES}")"
            CURRENT_JUMP_FILES=""
        fi
    fi
    LAST_EPOCH="${file_epoch}"

    [[ -n "${CURRENT_JUMP_FILES}" ]] && CURRENT_JUMP_FILES="${CURRENT_JUMP_FILES},"
    CURRENT_JUMP_FILES="${CURRENT_JUMP_FILES}${file_json}"
done

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
  "files": [${ALL_JSON}],
  "theory": [],
  "jumps": [${JUMPS_JSON}]
}
EOF

echo "[Scan] Found ${FILE_NUM} file(s) in ${JUMP_NUM} jump(s)."
echo "[Scan] Manifest: ${MANIFEST}"

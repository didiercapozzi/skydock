#!/usr/bin/env bash
set -eo pipefail

OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
ORIGINAL_DIR="${OUTPUT_DIR}/original_files"

CAMERA_DIRS=()
while [[ $# -gt 0 ]]; do
    if [[ -d "$1" ]]; then
        CAMERA_DIRS+=("$1")
    fi
    shift
done

if [[ ${#CAMERA_DIRS[@]} -eq 0 ]]; then
    echo "Usage: $0 <camera_dir> [camera_dir ...]"
    exit 1
fi

HAS_EXIFTOOL=false
if command -v exiftool &>/dev/null; then
    HAS_EXIFTOOL=true
fi

build_date_map() {
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
            local date_part
            date_part=$(echo "${dateval}" | sed 's/^\([0-9]\{4\}\):\([0-9]\{2\}\):\([0-9]\{2\}\).*/\1-\2-\3/')
            map_ref["${srcfile}"]="${date_part}"
        done < <(exiftool -s3 -DateTimeOriginal -csv "${jpg_files[@]}" 2>/dev/null)
    fi

    if [[ ${#mp4_files[@]} -gt 0 ]]; then
        while IFS=, read -r srcfile dateval; do
            [[ "${srcfile}" == "SourceFile" ]] && continue
            [[ -z "${dateval}" ]] && continue
            local date_part
            date_part=$(echo "${dateval}" | sed 's/^\([0-9]\{4\}\):\([0-9]\{2\}\):\([0-9]\{2\}\).*/\1-\2-\3/')
            map_ref["${srcfile}"]="${date_part}"
        done < <(exiftool -s3 -CreateDate -csv "${mp4_files[@]}" 2>/dev/null)
    fi
}

get_capture_date() {
    local filepath="$1"
    local -n map_ref=$2

    if [[ -n "${map_ref[${filepath}]+_}" ]]; then
        echo "${map_ref[${filepath}]}"
        return
    fi

    local mtime
    mtime=$(stat -c %Y "${filepath}")
    date -d "@${mtime}" +%Y-%m-%d
}

mkdir -p "${ORIGINAL_DIR}"

file_matches_existing() {
    local src="$1"
    local dest_dir="$2"
    local filename
    filename=$(basename "${src}")
    local existing="${dest_dir}/${filename}"
    if [[ -f "${existing}" ]] && cmp -s "${src}" "${existing}"; then
        return 0
    fi
    return 1
}

total_copied=0
total_skipped=0

declare -A DATE_MAP

for cam_dir in "${CAMERA_DIRS[@]}"; do
    all_files=()
    while IFS= read -r filepath; do
        all_files+=("${filepath}")
    done < <(find "${cam_dir}" -maxdepth 4 -type f \( \
        -iname "*.mp4" -o -iname "*.mov" -o \
        -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
    \) 2>/dev/null)

    build_date_map DATE_MAP "${all_files[@]}"

    for filepath in "${all_files[@]}"; do
        filename=$(basename "${filepath}")
        target_date=$(get_capture_date "${filepath}" DATE_MAP)
        dest_dir="${ORIGINAL_DIR}/${target_date}"
        mkdir -p "${dest_dir}"

        if file_matches_existing "${filepath}" "${dest_dir}"; then
            total_skipped=$((total_skipped + 1))
            continue
        fi

        cp -p --update=none "${filepath}" "${dest_dir}/${filename}"
        total_copied=$((total_copied + 1))
    done
done

echo "[Done] Copied: ${total_copied}, Skipped (existing): ${total_skipped}"

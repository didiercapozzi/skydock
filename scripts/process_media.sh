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

for cam_dir in "${CAMERA_DIRS[@]}"; do
    while IFS= read -r filepath; do
        filename=$(basename "${filepath}")
        file_mtime=$(stat -c %Y "${filepath}")
        target_date=$(date -d "@${file_mtime}" +%Y-%m-%d)
        dest_dir="${ORIGINAL_DIR}/${target_date}"
        mkdir -p "${dest_dir}"

        if file_matches_existing "${filepath}" "${dest_dir}"; then
            total_skipped=$((total_skipped + 1))
            continue
        fi

        cp -p --update=none "${filepath}" "${dest_dir}/${filename}"
        total_copied=$((total_copied + 1))
    done < <(find "${cam_dir}" -maxdepth 4 -type f \( \
        -iname "*.mp4" -o -iname "*.mov" -o \
        -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
    \) 2>/dev/null)
done

echo "[Done] Copied: ${total_copied}, Skipped (existing): ${total_skipped}"

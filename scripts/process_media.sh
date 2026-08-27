#!/usr/bin/env bash
set -eo pipefail

OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/camera_files}"

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

mkdir -p "${OUTPUT_DIR}"

cam_num=0
for cam_dir in "${CAMERA_DIRS[@]}"; do
    cam_num=$((cam_num + 1))
    cam_name="camera${cam_num}"
    dest_dir="${OUTPUT_DIR}/${cam_name}"
    mkdir -p "${dest_dir}"

    file_count=$(find "${cam_dir}" -maxdepth 4 -type f \( \
        -iname "*.mp4" -o -iname "*.mov" -o \
        -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
    \) 2>/dev/null | wc -l)

    if [[ "${file_count}" -eq 0 ]]; then
        echo "[${cam_name}] No media files found, skipping."
        continue
    fi

    echo "[${cam_name}] Copying ${file_count} file(s)..."
    find "${cam_dir}" -maxdepth 4 -type f \( \
        -iname "*.mp4" -o -iname "*.mov" -o \
        -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
    \) -exec cp --update=none {} "${dest_dir}/" \;

    copied=$(find "${dest_dir}" -maxdepth 1 -type f | wc -l)
    echo "[${cam_name}] Done. ${copied} file(s) in ${dest_dir}"
done

echo "[Done] All cameras processed."

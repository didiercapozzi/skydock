#!/usr/bin/env bash
set -eo pipefail

MANIFEST="${1:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
PROCESSED_DIR="${OUTPUT_DIR}/processed"

if [[ -z "${MANIFEST}" ]]; then
    MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"
fi

if [[ ! -f "${MANIFEST}" ]]; then
    echo "[Execute] ERROR: Manifest not found: ${MANIFEST}" >&2
    exit 1
fi

mkdir -p "${PROCESSED_DIR}"

JUMP_IDS=()
if [[ $# -gt 1 ]]; then
    for arg in "${@:2}"; do
        JUMP_IDS+=("${arg}")
    done
else
    while IFS= read -r line; do
        [[ -n "${line}" ]] && JUMP_IDS+=("${line}")
    done < <(jq -r '.jumps[] | select(.confirmed == true and .processed != true) | .id' "${MANIFEST}" 2>/dev/null)
fi

if [[ ${#JUMP_IDS[@]} -eq 0 ]]; then
    echo "[Execute] No confirmed unprocessed jumps found."
    exit 0
fi

is_video_ext() {
    case "${1,,}" in
        mp4|mov|avi|mkv|mts|m4v|3gp) return 0 ;;
        *) return 1 ;;
    esac
}

is_photo_ext() {
    case "${1,,}" in
        jpg|jpeg|png|dng|raw|tif|tiff|heic|heif|arw|cr2|cr3|nef|orf|rw2|raf) return 0 ;;
        *) return 1 ;;
    esac
}

copied=0
for jump_id in "${JUMP_IDS[@]}"; do
    jump_dir="${PROCESSED_DIR}/${jump_id}"
    videos_dir="${jump_dir}/videos"
    photos_dir="${jump_dir}/photos"

    file_count=$(jq -r --arg id "${jump_id}" '.jumps[] | select(.id == $id) | .files | length' "${MANIFEST}" 2>/dev/null)
    if [[ "${file_count}" -eq 0 ]]; then
        echo "[Execute] ${jump_id}: no files, skipping"
        continue
    fi

    first_mtime=$(jq -r --arg id "${jump_id}" '.jumps[] | select(.id == $id) | .files[0].mtime' "${MANIFEST}" 2>/dev/null)

    mkdir -p "${videos_dir}" "${photos_dir}"

    video_idx=0
    photo_idx=0
    count=0

    while IFS='|' read -r filepath file_mtime; do
        if [[ ! -f "${filepath}" ]]; then
            continue
        fi

        ext="${filepath##*.}"
        ext_lower="${ext,,}"
        offset=$((file_mtime - first_mtime))
        new_mtime=$((first_mtime + offset))

        if is_video_ext "${ext}"; then
            video_idx=$((video_idx + 1))
            seq=$(printf "%02d" "${video_idx}")
            new_name=$(printf "%s_%s.%s" "${jump_id}" "${seq}" "${ext_lower}")
            dest="${videos_dir}/${new_name}"
        elif is_photo_ext "${ext}"; then
            photo_idx=$((photo_idx + 1))
            seq=$(printf "%02d" "${photo_idx}")
            new_name=$(printf "%s_%s.%s" "${jump_id}" "${seq}" "${ext_lower}")
            dest="${photos_dir}/${new_name}"
        else
            photo_idx=$((photo_idx + 1))
            seq=$(printf "%02d" "${photo_idx}")
            new_name=$(printf "%s_%s.%s" "${jump_id}" "${seq}" "${ext_lower}")
            dest="${photos_dir}/${new_name}"
        fi

        cp -p --update=none "${filepath}" "${dest}"
        touch -d "@${new_mtime}" "${dest}"
        copied=$((copied + 1))
        count=$((count + 1))
    done < <(jq -r --arg id "${jump_id}" '.jumps[] | select(.id == $id) | .files[] | "\(.path)|\(.mtime)"' "${MANIFEST}" 2>/dev/null)

    echo "[Execute] ${jump_id}: copied ${count} file(s) (${video_idx} videos, ${photo_idx} photos) to ${jump_dir}"
done

echo "[Execute] Done. Copied ${copied} file(s)."

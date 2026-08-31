#!/usr/bin/env bash
set -eo pipefail

MANIFEST="${1:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
PROCESSED_DIR="${OUTPUT_DIR}/processed"

if [[ -z "${MANIFEST}" ]]; then
    MANIFEST="${OUTPUT_DIR}/manifest.json"
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
    jump_label=$(jq -r --arg id "${jump_id}" '.jumps[] | select(.id == $id) | .label' "${MANIFEST}" 2>/dev/null)
    if [[ -z "${jump_label}" ]]; then
        jump_label="${jump_id}"
    fi
    safe_label=$(echo "${jump_label}" | sed 's/[^a-zA-Z0-9._-]/_/g')
    jump_dir="${PROCESSED_DIR}/${safe_label}"
    videos_dir="${jump_dir}/videos"
    photos_dir="${jump_dir}/photos"

    file_count=$(jq -r --arg id "${jump_id}" '.jumps[] | select(.id == $id) | .files | length' "${MANIFEST}" 2>/dev/null)
    if [[ "${file_count}" -eq 0 ]]; then
        echo "[Execute] ${jump_id}: no files, skipping"
        continue
    fi

    mkdir -p "${videos_dir}" "${photos_dir}"

    video_idx=0
    photo_idx=0
    count=0

    while IFS='|' read -r filepath file_mtime crop_start crop_end; do
        if [[ ! -f "${filepath}" ]]; then
            continue
        fi

        ext="${filepath##*.}"
        ext_lower="${ext,,}"
        timestamp=$(date -d "@${file_mtime}" +"%Y%m%d_%H%M%S")
        needs_crop=false

        if is_video_ext "${ext}" && [[ -n "${crop_start}" && -n "${crop_end}" ]] && command -v ffmpeg &>/dev/null; then
            needs_crop=true
        fi

        if is_video_ext "${ext}"; then
            video_idx=$((video_idx + 1))
            new_name=$(printf "%s_%s.%s" "${safe_label}" "${timestamp}" "${ext_lower}")
            dest="${videos_dir}/${new_name}"
        elif is_photo_ext "${ext}"; then
            photo_idx=$((photo_idx + 1))
            new_name=$(printf "%s_%s.%s" "${safe_label}" "${timestamp}" "${ext_lower}")
            dest="${photos_dir}/${new_name}"
        else
            photo_idx=$((photo_idx + 1))
            new_name=$(printf "%s_%s.%s" "${safe_label}" "${timestamp}" "${ext_lower}")
            dest="${photos_dir}/${new_name}"
        fi

        if [[ "${needs_crop}" == "true" ]]; then
            crop_duration=$(awk "BEGIN {printf \"%.6f\", ${crop_end} - ${crop_start}}")
            ffmpeg -y -ss "${crop_start}" -i "${filepath}" -t "${crop_duration}" \
                -c copy -avoid_negative_ts make_zero "${dest}" 2>/dev/null || \
                cp -p --update=none "${filepath}" "${dest}"
        else
            cp -p --update=none "${filepath}" "${dest}"
        fi
        touch -d "@${file_mtime}" "${dest}"
        copied=$((copied + 1))
        count=$((count + 1))
    done < <(jq -r --arg id "${jump_id}" '.jumps[] | select(.id == $id) | .files[] | "\(.path)|\(.mtime)|\(.cropStart // "")|\(.cropEnd // "")"' "${MANIFEST}" 2>/dev/null)

    if command -v exiftool &>/dev/null && [[ ${count} -gt 0 ]]; then
        if compgen -G "${videos_dir}/*" > /dev/null || compgen -G "${photos_dir}/*" > /dev/null; then
            exiftool -P -overwrite_original -m -q \
                "-CreateDate<FileModifyDate" "-MediaCreateDate<FileModifyDate" "-TrackCreateDate<FileModifyDate" \
                "-MediaModifyDate<FileModifyDate" "-TrackModifyDate<FileModifyDate" "-ModifyDate<FileModifyDate" \
                "-DateTimeOriginal<FileModifyDate" "-CreationDate<FileModifyDate" \
                "${videos_dir}"/* "${photos_dir}"/* 2>/dev/null || true
        fi
    fi

    echo "[Execute] ${jump_id}: copied ${count} file(s) (${video_idx} videos, ${photo_idx} photos) to ${jump_dir}"
done

echo "[Execute] Done. Copied ${copied} file(s)."

#!/usr/bin/env bash
set -eo pipefail

PHOTO_ROOT="$1"
VIDEO_ROOT="$2"
NAMES_FILE="${3:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
REGISTRY_FILE="${OUTPUT_DIR}/.ingested_registry.txt"
PROCESSING_FILE="${OUTPUT_DIR}/.processing"
JUMP_GAP=${JUMP_GAP_SECONDS:-900}
PHOTO_FPS=${PHOTO_FPS:-2}
JPEG_QUALITY=${JPEG_QUALITY:-2}

touch "${REGISTRY_FILE}"
echo "processing" > "${PROCESSING_FILE}"

TMP_MANIFEST=$(mktemp)
TMP_THEORY=$(mktemp)
trap 'rm -f "${TMP_MANIFEST}" "${TMP_THEORY}" "${PROCESSING_FILE}"' EXIT

scan_camera_files() {
    local src_dir="$1"
    local cam_type="$2" # "PHOTO" or "VIDEO"

    if [[ -z "${src_dir}" || ! -d "${src_dir}" ]]; then
        return
    fi

    find "${src_dir}" -type f \( -iname "*.mp4" -o -iname "*.mov" \) 2>/dev/null | while IFS= read -r filepath; do
        local filename filesize file_mtime file_id
        filename=$(basename "${filepath}")
        filesize=$(stat -c %s "${filepath}")
        file_mtime=$(stat -c %Y "${filepath}")
        file_id="${cam_type}:${filename}:${filesize}:${file_mtime}"

        # Skip if already processed
        if grep -Fqx "${file_id}" "${REGISTRY_FILE}"; then
            continue
        fi

        # Route THEORY files to separate manifest
        if [[ "${filename}" =~ [Tt][Hh][Ee][Oo][Rr][Yy] ]]; then
            echo "${file_mtime}|${cam_type}|${filepath}|${file_id}" >> "${TMP_THEORY}"
        else
            echo "${file_mtime}|${cam_type}|${filepath}|${file_id}" >> "${TMP_MANIFEST}"
        fi
    done
}

# Scan available sources
scan_camera_files "${PHOTO_ROOT}" "PHOTO"
scan_camera_files "${VIDEO_ROOT}" "VIDEO"

# Determine target date folder from all files (theory + jump)
ALL_EPOCHS=$(cat "${TMP_MANIFEST}" "${TMP_THEORY}" 2>/dev/null | cut -d'|' -f1 | sort -n | head -n1)
if [[ -n "${ALL_EPOCHS}" ]]; then
    TARGET_DATE=$(date -d "@${ALL_EPOCHS}" +"%Y-%m-%d")
else
    TARGET_DATE=$(date +"%Y-%m-%d")
fi
DATE_DIR="${OUTPUT_DIR}/${TARGET_DATE}"
mkdir -p "${DATE_DIR}"

# ─── Process theory sessions (store in temp dirs per session) ──
THEORY_COUNT=$(wc -l < "${TMP_THEORY}")
declare -a THEORY_SESSION_DIRS=()
declare -a THEORY_SESSION_EPOCHS=()

if [[ "${THEORY_COUNT}" -gt 0 ]]; then
    echo "[Theory] Found ${THEORY_COUNT} theory recording(s). Grouping into sessions..."

    SORTED_THEORY=$(mktemp)
    sort -t'|' -k1,1n "${TMP_THEORY}" > "${SORTED_THEORY}"
    trap 'rm -f "${SORTED_THEORY}"' EXIT

    SESSION_NUM=0
    LAST_THEORY_EPOCH=0

    while IFS='|' read -r epoch cam_type filepath file_id; do
        # Start new session if gap > 600s (10 min)
        if (( LAST_THEORY_EPOCH > 0 )) && (( epoch - LAST_THEORY_EPOCH > 600 )); then
            SESSION_NUM=$(( SESSION_NUM + 1 ))
        fi
        LAST_THEORY_EPOCH="${epoch}"

        # Create temp dir for new session
        if [[ "${SESSION_NUM}" -ge ${#THEORY_SESSION_DIRS[@]} ]]; then
            SESSION_DIR=$(mktemp -d)
            THEORY_SESSION_DIRS+=("${SESSION_DIR}")
            THEORY_SESSION_EPOCHS+=("${epoch}")
        fi

        SESSION_DIR="${THEORY_SESSION_DIRS[${SESSION_NUM}]}"
        FILENAME=$(basename "${filepath}")

        if [[ "${cam_type}" == "PHOTO" ]]; then
            BASENAME="${FILENAME%.*}"
            echo "[Theory] Extracting stills from ${FILENAME}..."
            ffmpeg -nostdin -loglevel error -stats -i "${filepath}" \
                -vf "fps=${PHOTO_FPS}" \
                -q:v "${JPEG_QUALITY}" \
                "${SESSION_DIR}/${BASENAME}_frame_%04d.jpg"
        else
            echo "[Theory] Copying video ${FILENAME}..."
            cp -an "${filepath}" "${SESSION_DIR}/${FILENAME}"
        fi

        echo "${file_id}" >> "${REGISTRY_FILE}"
    done < "${SORTED_THEORY}"
fi

# ─── Process jump footage ──────────────────────────────────────
NEW_COUNT=$(wc -l < "${TMP_MANIFEST}")
if [[ "${NEW_COUNT}" -eq 0 ]]; then
    # If we had theory but no jumps, copy theory to a default jump
    if [[ "${THEORY_COUNT}" -gt 0 ]]; then
        JUMP_DIR="${DATE_DIR}/Jump_01"
        PHOTOS_DIR="${JUMP_DIR}/photos"
        VIDEOS_DIR="${JUMP_DIR}/videos"
        mkdir -p "${PHOTOS_DIR}" "${VIDEOS_DIR}"

        for session_dir in "${THEORY_SESSION_DIRS[@]}"; do
            [[ -d "${session_dir}" ]] || continue
            cp -an "${session_dir}"/* "${PHOTOS_DIR}/" 2>/dev/null || true
            cp -an "${session_dir}"/*.MP4 "${VIDEOS_DIR}/" 2>/dev/null || true
            cp -an "${session_dir}"/*.mp4 "${VIDEOS_DIR}/" 2>/dev/null || true
        done
        rm -rf "${THEORY_SESSION_DIRS[@]}"
        sync
        echo "[Done] Theory ingestion complete for date: ${TARGET_DATE}."
    fi
    exit 0
fi

echo "[Ingest] Found ${NEW_COUNT} new recording(s). Calculating jump clusters..."

# Sort all new clips chronologically
SORTED_MANIFEST=$(mktemp)
sort -t'|' -k1,1n "${TMP_MANIFEST}" > "${SORTED_MANIFEST}"
rm -f "${TMP_MANIFEST}"
trap 'rm -f "${SORTED_MANIFEST}" "${TMP_THEORY}"' EXIT

# Determine next sequential Jump index for today
get_next_jump_num() {
    local max_num=0
    for dir in "${DATE_DIR}"/Jump_*; do
        if [[ -d "$dir" ]]; then
            local num
            num=$(basename "$dir" | sed -E 's/Jump_0*([0-9]+)/\1/')
            if [[ "$num" =~ ^[0-9]+$ ]] && (( num > max_num )); then
                max_num=$num
            fi
        fi
    done
    echo $(( max_num + 1 ))
}

CURRENT_JUMP_NUM=$(get_next_jump_num)
LAST_EPOCH=0

# Iterate and cluster files
while IFS='|' read -r epoch cam_type filepath file_id; do
    if (( LAST_EPOCH > 0 )) && (( epoch - LAST_EPOCH > JUMP_GAP )); then
        CURRENT_JUMP_NUM=$(( CURRENT_JUMP_NUM + 1 ))
        echo "[Cluster] Time gap of $(( epoch - LAST_EPOCH ))s detected (> ${JUMP_GAP}s). Incremented to Jump_$(printf "%02d" "${CURRENT_JUMP_NUM}")."
    fi
    LAST_EPOCH="${epoch}"

    JUMP_DIR="${DATE_DIR}/Jump_$(printf "%02d" "${CURRENT_JUMP_NUM}")"
    PHOTOS_DIR="${JUMP_DIR}/photos"
    VIDEOS_DIR="${JUMP_DIR}/videos"
    mkdir -p "${PHOTOS_DIR}" "${VIDEOS_DIR}"

    FILENAME=$(basename "${filepath}")
    BASENAME="${FILENAME%.*}"

    if [[ "${cam_type}" == "PHOTO" ]]; then
        echo "[Extract] Camera 1 (Photos): Extracting ${PHOTO_FPS} fps stills from ${FILENAME} -> Jump_$(printf "%02d" "${CURRENT_JUMP_NUM}")..."
        ffmpeg -nostdin -loglevel error -stats -i "${filepath}" \
            -vf "fps=${PHOTO_FPS}" \
            -q:v "${JPEG_QUALITY}" \
            "${PHOTOS_DIR}/${BASENAME}_frame_%04d.jpg"
    else
        echo "[Copy] Camera 2 (Video): Ingesting 4K video ${FILENAME} -> Jump_$(printf "%02d" "${CURRENT_JUMP_NUM}")..."
            cp -an "${filepath}" "${VIDEOS_DIR}/${FILENAME}"
    fi

    # Mark as completed in registry
    echo "${file_id}" >> "${REGISTRY_FILE}"
done < "${SORTED_MANIFEST}"

# ─── Copy theory files to each jump directory ──────────────────
if [[ ${#THEORY_SESSION_DIRS[@]} -gt 0 ]]; then
    echo "[Theory] Copying theory files to jump directories..."

    for jump_dir in "${DATE_DIR}"/Jump_*; do
        [[ -d "${jump_dir}" ]] || continue

        # Get earliest epoch from this jump's videos
        JUMP_FIRST_EPOCH=0
        for f in "${jump_dir}/videos"/*.[Mm][Pp]4 "${jump_dir}/videos"/*.[Mm][Oo][Vv]; do
            [[ -f "$f" ]] || continue
            F_EPOCH=$(stat -c %Y "$f")
            if [[ "${JUMP_FIRST_EPOCH}" -eq 0 ]] || (( F_EPOCH < JUMP_FIRST_EPOCH )); then
                JUMP_FIRST_EPOCH="${F_EPOCH}"
            fi
        done

        # Find nearest preceding theory session
        BEST_IDX=0
        BEST_EPOCH=0
        for i in "${!THEORY_SESSION_EPOCHS[@]}"; do
            T_EPOCH="${THEORY_SESSION_EPOCHS[$i]}"
            if (( T_EPOCH <= JUMP_FIRST_EPOCH )) && (( T_EPOCH > BEST_EPOCH )); then
                BEST_EPOCH="${T_EPOCH}"
                BEST_IDX="${i}"
            fi
        done

        if [[ "${BEST_EPOCH}" -gt 0 ]]; then
            SESSION_DIR="${THEORY_SESSION_DIRS[$BEST_IDX]}"
            VIDEOS_DIR="${jump_dir}/videos"

            # Copy theory videos (MP4s)
            cp -an "${SESSION_DIR}"/*.MP4 "${VIDEOS_DIR}/" 2>/dev/null || true
            cp -an "${SESSION_DIR}"/*.mp4 "${VIDEOS_DIR}/" 2>/dev/null || true

            echo "[Theory] Copied theory files to $(basename "${jump_dir}")"
        fi
    done

    # Cleanup temp dirs
    rm -rf "${THEORY_SESSION_DIRS[@]}"
fi

sync
echo "[Done] Batch ingestion complete for date: ${TARGET_DATE}."

# ─── Apply passenger names to jump directories ────────────────
if [[ -n "${NAMES_FILE}" && -f "${NAMES_FILE}" ]]; then
    echo "[Names] Applying passenger names from ${NAMES_FILE}..."
    JUMP_INDEX=0
    while IFS= read -r name || [[ -n "${name}" ]]; do
        name=$(echo "${name}" | xargs)  # trim whitespace
        [[ -z "${name}" ]] && continue
        JUMP_INDEX=$((JUMP_INDEX + 1))
        OLD_DIR="${DATE_DIR}/Jump_$(printf "%02d" "${JUMP_INDEX}")"
        # Sanitize name for filesystem: replace spaces with underscores, remove special chars
        SAFE_NAME=$(echo "${name}" | sed 's/[^a-zA-Z0-9 _-]//g' | tr ' ' '_')
        NEW_DIR="${DATE_DIR}/${SAFE_NAME}"
        if [[ -d "${OLD_DIR}" ]]; then
            printf "%02d" "${JUMP_INDEX}" > "${OLD_DIR}/.jump_number"
            mv "${OLD_DIR}" "${NEW_DIR}"
            echo "[Names] Renamed Jump_$(printf "%02d" "${JUMP_INDEX}") -> $(basename "${NEW_DIR}")"
        fi
    done < "${NAMES_FILE}"
    echo "[Names] Applied ${JUMP_INDEX} passenger name(s)."
fi

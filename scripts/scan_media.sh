#!/usr/bin/env bash
set -eo pipefail

# scan_media.sh — Phase 1: Scan cameras and generate proposed_jumps.json
#
# This script scans both camera directories, clusters files into jumps,
# and writes a manifest for user review. No files are moved or modified.
#
# Usage:
#   ./scan_media.sh <photo_dir> <video_dir> [output_manifest]
#
# Output: JSON manifest with proposed jump groupings

PHOTO_ROOT="$1"
VIDEO_ROOT="$2"
OUTPUT_MANIFEST="${3:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
JUMP_GAP=${JUMP_GAP_SECONDS:-900}

if [[ -z "${PHOTO_ROOT}" || -z "${VIDEO_ROOT}" ]]; then
    echo "Usage: $0 <photo_dir> <video_dir> [output_manifest]" >&2
    exit 1
fi

# Determine output manifest path
if [[ -z "${OUTPUT_MANIFEST}" ]]; then
    OUTPUT_MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"
fi

mkdir -p "$(dirname "${OUTPUT_MANIFEST}")"

# ─── Scan camera files ────────────────────────────────────────
TMP_PHOTO_LIST=$(mktemp)
TMP_VIDEO_LIST=$(mktemp)
TMP_THEORY_LIST=$(mktemp)
trap 'rm -f "${TMP_PHOTO_LIST}" "${TMP_VIDEO_LIST}" "${TMP_THEORY_LIST}"' EXIT

scan_camera_files() {
    local src_dir="$1"
    local cam_type="$2"

    if [[ -z "${src_dir}" || ! -d "${src_dir}" ]]; then
        return
    fi

    find "${src_dir}" -type f \( -iname "*.mp4" -o -iname "*.mov" \) 2>/dev/null | while IFS= read -r filepath; do
        local filename filesize file_mtime
        filename=$(basename "${filepath}")
        filesize=$(stat -c %s "${filepath}")
        file_mtime=$(stat -c %Y "${filepath}")

        if [[ "${filename}" =~ [Tt][Hh][Ee][Oo][Rr][Yy] ]]; then
            echo "${file_mtime}|${filepath}|${filesize}|${cam_type}" >> "${TMP_THEORY_LIST}"
        elif [[ "${cam_type}" == "PHOTO" ]]; then
            echo "${file_mtime}|${filepath}|${filesize}|${cam_type}" >> "${TMP_PHOTO_LIST}"
        else
            echo "${file_mtime}|${filepath}|${filesize}|${cam_type}" >> "${TMP_VIDEO_LIST}"
        fi
    done
}

scan_camera_files "${PHOTO_ROOT}" "PHOTO"
scan_camera_files "${VIDEO_ROOT}" "VIDEO"

PHOTO_COUNT=$(wc -l < "${TMP_PHOTO_LIST}" 2>/dev/null || echo "0")
VIDEO_COUNT=$(wc -l < "${TMP_VIDEO_LIST}" 2>/dev/null || echo "0")
TOTAL_COUNT=$(( PHOTO_COUNT + VIDEO_COUNT ))

if [[ "${TOTAL_COUNT}" -eq 0 ]]; then
    echo "[Scan] No new files found."
    echo '{"version":1,"status":"empty","date":"'"$(date +%Y-%m-%d)"'","camera1":{"path":"'"${PHOTO_ROOT}"'","fileCount":0},"camera2":{"path":"'"${VIDEO_ROOT}"'","fileCount":0},"jumps":[]}' > "${OUTPUT_MANIFEST}"
    exit 0
fi

# ─── Determine target date ────────────────────────────────────
ALL_EPOCHS=$(cat "${TMP_PHOTO_LIST}" "${TMP_VIDEO_LIST}" "${TMP_THEORY_LIST}" 2>/dev/null | cut -d'|' -f1 | sort -n | head -n1)
if [[ -n "${ALL_EPOCHS}" ]]; then
    TARGET_DATE=$(date -d "@${ALL_EPOCHS}" +"%Y-%m-%d")
else
    TARGET_DATE=$(date +"%Y-%m-%d")
fi

# ─── Per-camera clustering ────────────────────────────────────
cluster_camera() {
    local sorted_file="$1"
    local count
    count=$(wc -l < "${sorted_file}" 2>/dev/null || echo "0")

    if [[ "${count}" -eq 0 ]]; then
        return
    fi

    local cluster_num=0
    local last_epoch=0

    while IFS='|' read -r epoch filepath filesize cam_type; do
        if (( last_epoch > 0 )) && (( epoch - last_epoch > JUMP_GAP )); then
            cluster_num=$(( cluster_num + 1 ))
        fi
        last_epoch="${epoch}"
        echo "${cluster_num}|${epoch}|${filepath}|${filesize}|${cam_type}"
    done < "${sorted_file}"
}

SORTED_PHOTOS=$(mktemp)
SORTED_VIDEOS=$(mktemp)
trap 'rm -f "${TMP_PHOTO_LIST}" "${TMP_VIDEO_LIST}" "${TMP_THEORY_LIST}" "${SORTED_PHOTOS}" "${SORTED_VIDEOS}"' EXIT

sort -t'|' -k1,1n "${TMP_PHOTO_LIST}" > "${SORTED_PHOTOS}" 2>/dev/null || true
sort -t'|' -k1,1n "${TMP_VIDEO_LIST}" > "${SORTED_VIDEOS}" 2>/dev/null || true

PHOTO_CLUSTERED=$(mktemp)
VIDEO_CLUSTERED=$(mktemp)
cluster_camera "${SORTED_PHOTOS}" > "${PHOTO_CLUSTERED}" 2>/dev/null || true
cluster_camera "${SORTED_VIDEOS}" > "${VIDEO_CLUSTERED}" 2>/dev/null || true

# Compute cluster summaries: cluster_num|first_epoch|last_epoch
PHOTO_SUMMARY=$(mktemp)
VIDEO_SUMMARY=$(mktemp)
trap 'rm -f "${TMP_PHOTO_LIST}" "${TMP_VIDEO_LIST}" "${TMP_THEORY_LIST}" "${SORTED_PHOTOS}" "${SORTED_VIDEOS}" "${PHOTO_SUMMARY}" "${VIDEO_SUMMARY}"' EXIT

awk -F'|' '{ if (!($1 in first) || $2 < first[$1]) first[$1] = $2; if ($2 > last[$1]) last[$1] = $2; count[$1]++ }
  END { for (c in first) print c "|" first[c] "|" last[c] "|" count[c] }' "${PHOTO_CLUSTERED}" | sort -t'|' -k1,1n > "${PHOTO_SUMMARY}"
awk -F'|' '{ if (!($1 in first) || $2 < first[$1]) first[$1] = $2; if ($2 > last[$1]) last[$1] = $2; count[$1]++ }
  END { for (c in first) print c "|" first[c] "|" last[c] "|" count[c] }' "${VIDEO_CLUSTERED}" | sort -t'|' -k1,1n > "${VIDEO_SUMMARY}"

PHOTO_CLUSTERS=$(wc -l < "${PHOTO_SUMMARY}")
VIDEO_CLUSTERS=$(wc -l < "${VIDEO_SUMMARY}")

echo "[Scan] Found ${PHOTO_COUNT} photo(s) in ${PHOTO_CLUSTERS} cluster(s), ${VIDEO_COUNT} video(s) in ${VIDEO_CLUSTERS} cluster(s)."

# ─── Match photo clusters to video clusters ────────────────────
# For each photo cluster, find the video cluster with closest midpoint
build_jump_files() {
    local cluster_file="$1"
    local cluster_num="$2"

    while IFS='|' read -r cn epoch filepath filesize cam_type; do
        if [[ "${cn}" == "${cluster_num}" ]]; then
            local epoch_ms=$(( epoch * 1000 ))
            printf ',"{"'"'"'path'"'"':'"'"'%s'"'"',"'"'"'camera'"'"':"%s","'"'"'size'"'"':%d,"'"'"'mtime'"'"':%d,"'"'"'filename'"'"':"%s"}\n"' \
                "${filepath}" "${cam_type}" "${filesize}" "${epoch_ms}" "$(basename "${filepath}")"
        fi
    done < "${cluster_file}"
}

# Build JSON jumps array
JUMPS_JSON=""
JUMP_NUM=0
declare -a MATCHED_VIDEO_CLUSTERS=()

while IFS='|' read -r p_num p_first p_last _p_count; do
    # Find closest video cluster by midpoint
    p_mid=$(( (p_first + p_last) / 2 ))
    best_dist=999999999
    best_vnum=-1

    while IFS='|' read -r v_num v_first v_last _v_count; do
        v_mid=$(( (v_first + v_last) / 2 ))
        dist=$(( p_mid - v_mid ))
        [[ "${dist}" -lt 0 ]] && dist=$(( -dist ))
        if (( dist < best_dist )); then
            best_dist="${dist}"
            best_vnum="${v_num}"
        fi
    done < "${VIDEO_SUMMARY}"

    JUMP_NUM=$(( JUMP_NUM + 1 ))
    JUMP_ID="jump_${JUMP_NUM}"

    # Collect photo files
    JUMP_FILES=""
    while IFS='|' read -r cn epoch filepath filesize cam_type; do
        if [[ "${cn}" == "${p_num}" ]]; then
            [[ -n "${JUMP_FILES}" ]] && JUMP_FILES="${JUMP_FILES},"
            JUMP_FILES="${JUMP_FILES}$(printf '{"path":"%s","camera":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
                "${filepath}" "${cam_type}" "${filesize}" "$(( epoch * 1000 ))" "$(basename "${filepath}")")"
        fi
    done < "${PHOTO_CLUSTERED}"

    # Collect matched video files
    if [[ "${best_vnum}" != "-1" ]]; then
        while IFS='|' read -r cn epoch filepath filesize cam_type; do
            if [[ "${cn}" == "${best_vnum}" ]]; then
                [[ -n "${JUMP_FILES}" ]] && JUMP_FILES="${JUMP_FILES},"
                JUMP_FILES="${JUMP_FILES}$(printf '{"path":"%s","camera":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
                    "${filepath}" "${cam_type}" "${filesize}" "$(( epoch * 1000 ))" "$(basename "${filepath}")")"
            fi
        done < "${VIDEO_CLUSTERED}"
        MATCHED_VIDEO_CLUSTERS+=("${best_vnum}")
    fi

    JUMPS_JSON="${JUMPS_JSON}$(printf '{"id":"%s","label":"Jump %d","confirmed":false,"files":[%s]}' \
        "${JUMP_ID}" "${JUMP_NUM}" "${JUMP_FILES}")"
    JUMPS_JSON="${JUMPS_JSON},"
done < "${PHOTO_SUMMARY}"

# Handle unmatched video clusters
while IFS='|' read -r v_num v_first v_last _v_count; do
    already_matched=false
    for matched in "${MATCHED_VIDEO_CLUSTERS[@]}"; do
        if [[ "${matched}" == "${v_num}" ]]; then
            already_matched=true
            break
        fi
    done

    if ! ${already_matched}; then
        JUMP_NUM=$(( JUMP_NUM + 1 ))
        JUMP_ID="jump_${JUMP_NUM}"

        JUMP_FILES=""
        while IFS='|' read -r cn epoch filepath filesize cam_type; do
            if [[ "${cn}" == "${v_num}" ]]; then
                [[ -n "${JUMP_FILES}" ]] && JUMP_FILES="${JUMP_FILES},"
                JUMP_FILES="${JUMP_FILES}$(printf '{"path":"%s","camera":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
                    "${filepath}" "${cam_type}" "${filesize}" "$(( epoch * 1000 ))" "$(basename "${filepath}")")"
            fi
        done < "${VIDEO_CLUSTERED}"

        JUMPS_JSON="${JUMPS_JSON}$(printf '{"id":"%s","label":"Jump %d","confirmed":false,"files":[%s]}' \
            "${JUMP_ID}" "${JUMP_NUM}" "${JUMP_FILES}")"
        JUMPS_JSON="${JUMPS_JSON},"
    fi
done < "${VIDEO_SUMMARY}"

# Remove trailing comma
JUMPS_JSON="${JUMPS_JSON%,}"

# ─── Scan theory files ────────────────────────────────────────
THEORY_FILES=""
if [[ -s "${TMP_THEORY_LIST}" ]]; then
    while IFS='|' read -r epoch filepath filesize cam_type; do
        [[ -n "${THEORY_FILES}" ]] && THEORY_FILES="${THEORY_FILES},"
        THEORY_FILES="${THEORY_FILES}$(printf '{"path":"%s","camera":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
            "${filepath}" "${cam_type}" "${filesize}" "$(( epoch * 1000 ))" "$(basename "${filepath}")")"
    done < <(sort -t'|' -k1,1n "${TMP_THEORY_LIST}")
fi

# ─── Write manifest ───────────────────────────────────────────
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${OUTPUT_MANIFEST}" <<EOF
{
  "version": 1,
  "status": "proposed",
  "date": "${TARGET_DATE}",
  "createdAt": "${CREATED_AT}",
  "camera1": {"path": "${PHOTO_ROOT}", "fileCount": ${PHOTO_COUNT}},
  "camera2": {"path": "${VIDEO_ROOT}", "fileCount": ${VIDEO_COUNT}},
  "theory": [${THEORY_FILES}],
  "jumps": [${JUMPS_JSON}]
}
EOF

echo "[Scan] Manifest written to ${OUTPUT_MANIFEST}"
echo "[Scan] ${JUMP_NUM} jump(s) proposed for review."

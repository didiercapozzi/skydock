#!/usr/bin/env bash
set -eo pipefail

OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
ORIGINAL_DIR="${OUTPUT_DIR}/original_files"
MANIFEST="${OUTPUT_DIR}/manifest.json"
TMPDIR_SCAN="${OUTPUT_DIR}/.scan_tmp"

if [[ ! -d "${ORIGINAL_DIR}" ]]; then
    echo "[Scan] No original_files directory found. Run process_media.sh first."
    exit 1
fi

mkdir -p "${OUTPUT_DIR}" "${TMPDIR_SCAN}"

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
        while IFS=, read -r srcfile dt1 dt2 dt3; do
            [[ "${srcfile}" == "SourceFile" ]] && continue
            srcfile=$(echo "${srcfile}" | sed 's/^"//;s/"$//')
            dt1=$(echo "${dt1}" | sed 's/^"//;s/"$//')
            dt2=$(echo "${dt2}" | sed 's/^"//;s/"$//')
            dt3=$(echo "${dt3}" | sed 's/^"//;s/"$//')
            local chosen=""
            for cand in "${dt1}" "${dt2}" "${dt3}"; do
                [[ -n "${cand}" ]] && { chosen="${cand}"; break; }
            done
            [[ -z "${chosen}" ]] && continue
            map_ref["${srcfile}"]="${chosen}"
        done < <(exiftool -s3 -DateTimeOriginal -CreateDate -MediaCreateDate -csv "${jpg_files[@]}" 2>/dev/null)
    fi

    if [[ ${#mp4_files[@]} -gt 0 ]]; then
        while IFS=, read -r srcfile dt1 dt2 dt3 dt4 dt5; do
            [[ "${srcfile}" == "SourceFile" ]] && continue
            srcfile=$(echo "${srcfile}" | sed 's/^"//;s/"$//')
            dt1=$(echo "${dt1}" | sed 's/^"//;s/"$//')
            dt2=$(echo "${dt2}" | sed 's/^"//;s/"$//')
            dt3=$(echo "${dt3}" | sed 's/^"//;s/"$//')
            dt4=$(echo "${dt4}" | sed 's/^"//;s/"$//')
            dt5=$(echo "${dt5}" | sed 's/^"//;s/"$//')
            local chosen=""
            for cand in "${dt1}" "${dt2}" "${dt3}" "${dt4}" "${dt5}"; do
                [[ -n "${cand}" ]] && { chosen="${cand}"; break; }
            done
            [[ -z "${chosen}" ]] && continue
            map_ref["${srcfile}"]="${chosen}"
        done < <(exiftool -s3 -CreateDate -MediaCreateDate -TrackCreateDate -DateTimeOriginal -ModifyDate -csv "${mp4_files[@]}" 2>/dev/null)
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

compute_file_id() {
    local filepath="$1"
    local size
    size=$(stat -c %s "${filepath}")
    local tmpfile="${TMPDIR_SCAN}/hash_$$"
    local head_len=${size}
    [[ ${head_len} -gt 1048576 ]] && head_len=1048576

    head -c "${head_len}" "${filepath}" 2>/dev/null > "${tmpfile}"
    if [[ ${size} -gt 1048576 ]]; then
        tail -c 65536 "${filepath}" 2>/dev/null >> "${tmpfile}"
    fi
    printf '%s\n' "${size}" >> "${tmpfile}"
    sha256sum "${tmpfile}" | cut -d' ' -f1 | head -c 16
    rm -f "${tmpfile}"
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

DISK_COUNT=${#SORTED_FILES[@]}

if [[ "${DISK_COUNT}" -eq 0 ]]; then
    echo "[Scan] No files found in original_files."
    rm -rf "${TMPDIR_SCAN}"
    exit 0
fi

ALL_FILES_JSON=""
for filepath in "${SORTED_FILES[@]}"; do
    filename=$(basename "${filepath}")
    file_epoch="${FILE_EPOCH[${filepath}]}"
    file_size="${FILE_SIZE[${filepath}]}"

    file_json=$(printf '{"path":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
        "${filepath}" "${file_size}" "${file_epoch}" "${filename}")

    [[ -n "${ALL_FILES_JSON}" ]] && ALL_FILES_JSON="${ALL_FILES_JSON},"
    ALL_FILES_JSON="${ALL_FILES_JSON}${file_json}"
done

if [[ ! -f "${MANIFEST}" ]]; then
    echo "[Scan] Creating new manifest with ${DISK_COUNT} file(s)."

    JUMP_GAP_SECONDS=1800
    CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    TARGET_DATE=$(date +%Y-%m-%d)

    echo "[${ALL_FILES_JSON}]" > "${TMPDIR_SCAN}/files.json"

    jq -n \
        --slurpfile files "${TMPDIR_SCAN}/files.json" \
        --argjson gap "${JUMP_GAP_SECONDS}" \
        --arg date "${TARGET_DATE}" \
        --arg createdAt "${CREATED_AT}" '
        ($files[0]) as $files |
        ([$files[] | {path: .path, mtime: .mtime}] | sort_by(.mtime) | reduce .[] as $f (
            {clusters: [], current: []};
            if (.current | length) > 0 and (($f.mtime - (.current[-1].mtime)) > $gap) then
                .clusters += [.current] | .current = [$f]
            else
                .current += [$f]
            end
        ) | .clusters += [.current] | [.clusters[] | select(length > 0)]) as $clusters |

        ($clusters | to_entries | map({
            id: "jump_\(.key + 1)",
            label: "Jump \(.key + 1)",
            confirmed: false,
            files: [.value[] | . as $f | ($files[] | select(.path == $f.path))]
        })) as $jumps |

        {
            version: 1,
            status: "proposed",
            date: $date,
            startDatetime: $createdAt,
            createdAt: $createdAt,
            files: $files,
            theory: [],
            jumps: $jumps
        }
    ' > "${MANIFEST}"

    FINAL_JUMPS=$(jq '.jumps | length' "${MANIFEST}" 2>/dev/null)
    echo "[Scan] Found ${DISK_COUNT} file(s) in ${FINAL_JUMPS} jump(s)."
    echo "[Scan] Manifest: ${MANIFEST}"
    rm -rf "${TMPDIR_SCAN}"
    exit 0
fi

EXISTING_COUNT=$(jq '.files | length' "${MANIFEST}" 2>/dev/null || echo 0)
EXISTING_PATHS_FILE="${TMPDIR_SCAN}/existing_paths"
DISK_PATHS_FILE="${TMPDIR_SCAN}/disk_paths"

jq -r '.files[].path' "${MANIFEST}" 2>/dev/null | sort > "${EXISTING_PATHS_FILE}"
printf '%s\n' "${SORTED_FILES[@]}" | sort > "${DISK_PATHS_FILE}"

REMOVED_PATHS_FILE="${TMPDIR_SCAN}/removed_paths"
ADDED_PATHS_FILE="${TMPDIR_SCAN}/added_paths"

comm -23 "${EXISTING_PATHS_FILE}" "${DISK_PATHS_FILE}" > "${REMOVED_PATHS_FILE}"
comm -13 "${EXISTING_PATHS_FILE}" "${DISK_PATHS_FILE}" > "${ADDED_PATHS_FILE}"

REMOVED_COUNT=$(wc -l < "${REMOVED_PATHS_FILE}")
ADDED_COUNT=$(wc -l < "${ADDED_PATHS_FILE}")

if [[ "${REMOVED_COUNT}" -eq 0 ]] && [[ "${ADDED_COUNT}" -eq 0 ]]; then
    echo "[Scan] No changes. ${EXISTING_COUNT} file(s) in manifest."
    rm -rf "${TMPDIR_SCAN}"
    exit 0
fi

echo "[Scan] Merging: +${ADDED_COUNT} new, -${REMOVED_COUNT} removed, ${EXISTING_COUNT} existing."

REMOVED_JSON=""
while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    [[ -n "${REMOVED_JSON}" ]] && REMOVED_JSON="${REMOVED_JSON},"
    REMOVED_JSON="${REMOVED_JSON}\"${path}\""
done < "${REMOVED_PATHS_FILE}"
REMOVED_SET="[]"
[[ "${REMOVED_COUNT}" -gt 0 ]] && REMOVED_SET="[${REMOVED_JSON}]"

ADDED_JSON=""
while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    filename=$(basename "${path}")
    file_epoch="${FILE_EPOCH[${path}]}"
    file_size="${FILE_SIZE[${path}]}"
    file_json=$(printf '{"path":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
        "${path}" "${file_size}" "${file_epoch}" "${filename}")
    [[ -n "${ADDED_JSON}" ]] && ADDED_JSON="${ADDED_JSON},"
    ADDED_JSON="${ADDED_JSON}${file_json}"
done < "${ADDED_PATHS_FILE}"
ADDED_SET="[]"
[[ "${ADDED_COUNT}" -gt 0 ]] && ADDED_SET="[${ADDED_JSON}]"

JUMP_GAP_SECONDS=1800

echo "${REMOVED_SET}" > "${TMPDIR_SCAN}/removed.json"
echo "${ADDED_SET}" > "${TMPDIR_SCAN}/added.json"

jq --slurpfile removed "${TMPDIR_SCAN}/removed.json" --slurpfile added "${TMPDIR_SCAN}/added.json" --argjson gap "${JUMP_GAP_SECONDS}" '
    ($removed[0]) as $removed |
    ($added[0]) as $added |
    . as $manifest |

    # Updated files list: remove deleted, add new
    ($manifest.files | map(select(.path as $p | ($removed | index($p)) | not)) + $added) as $updatedFiles |

    # Filter jumps: remove deleted files from each jump, drop empty jumps
    ([$manifest.jumps[] | {
        id: .id,
        label: .label,
        confirmed: .confirmed,
        processed: .processed,
        files: [.files[] | select(.path as $fp | ($removed | index($fp)) | not)]
    }] | map(select(.files | length > 0))) as $kept |

    # Build lookup: path -> jump metadata from kept jumps
    ([$kept[].files[]] | map({(.path): {jid: null, jlabel: null, jconfirmed: null, jprocessed: null}}) | add // {}) as $emptyLookup |
    ($kept | reduce .[] as $j ($emptyLookup;
        . + ([$j.files[] | {(.path): {jid: $j.id, jlabel: $j.label, jconfirmed: $j.confirmed, jprocessed: $j.processed}}] | add)
    )) as $prev |

    # Extend lookup with new files (no previous jump)
    ([$added[] | . as $f | {(.path): {jid: null, jlabel: null, jconfirmed: null, jprocessed: null}}] | add // {}) as $prevExt |
    ($prev + $prevExt) as $prevAll |

    # Cluster new files by time gaps
    ([$added[] | {path: .path, mtime: .mtime}] | sort_by(.mtime) | reduce .[] as $f (
        {clusters: [], current: []};
        if (.current | length) > 0 and (($f.mtime - (.current[-1].mtime)) > $gap) then
            .clusters += [.current] | .current = [$f]
        else
            .current += [$f]
        end
    ) | .clusters += [.current] | [.clusters[] | select(length > 0)]) as $newClusters |

    ($kept | length) as $numKept |

    # Build new jumps from clusters with majority-vote metadata
    ($newClusters | to_entries | map(
        .key as $idx |
        .value as $cluster |
        $cluster | map(. as $f | {path: .path, mtime: .mtime, prev: ($prevAll[$f.path] // {jid: null})}) |
        reduce .[] as $item (
            {domId: null, domLabel: null, domConfirmed: null, domProcessed: null, count: 0, total: 0};
            .total += 1 |
            if $item.prev.jid != null then
                if (.domId == null) or ($item.prev.jid == .domId) then
                    {domId: ($item.prev.jid // .domId), domLabel: ($item.prev.jlabel // .domLabel), domConfirmed: ($item.prev.jconfirmed // .domConfirmed), domProcessed: ($item.prev.jprocessed // .domProcessed), count: ((if $item.prev.jid == .domId then 1 else 0 end) + .count), total: .total}
                elif (.total - .count) < .count then
                    .
                else
                    {domId: $item.prev.jid, domLabel: $item.prev.jlabel, domConfirmed: $item.prev.jconfirmed, domProcessed: $item.prev.jprocessed, count: 1, total: .total}
                end
            else
                .
            end
        ) |
        . as $meta |
        (if .domId != null then .domId else "jump_\($numKept + $idx + 1)" end) as $id |
        (if .domLabel != null then .domLabel else "Jump \($numKept + $idx + 1)" end) as $label |
        {id: $id, label: $label, confirmed: (.domConfirmed // false), processed: .domProcessed, files: [$cluster[] | {path: .path, size: 0, mtime: .mtime, filename: (.path | split("/")[-1])}]}
    )) as $newJumps |

    # Construct final manifest
    {
        version: $manifest.version,
        status: $manifest.status,
        date: $manifest.date,
        startDatetime: $manifest.startDatetime,
        createdAt: $manifest.createdAt,
        files: $updatedFiles,
        theory: ($manifest.theory // []),
        jumps: ($kept + $newJumps),
        cameraClockOffsetSeconds: $manifest.cameraClockOffsetSeconds
    }
' "${MANIFEST}" > "${MANIFEST}.tmp" && mv "${MANIFEST}.tmp" "${MANIFEST}"

FINAL_COUNT=$(jq '.files | length' "${MANIFEST}" 2>/dev/null)
FINAL_JUMPS=$(jq '.jumps | length' "${MANIFEST}" 2>/dev/null)
echo "[Scan] Manifest: ${FINAL_COUNT} file(s) in ${FINAL_JUMPS} jump(s)."
echo "[Scan] Manifest: ${MANIFEST}"

rm -rf "${TMPDIR_SCAN}"

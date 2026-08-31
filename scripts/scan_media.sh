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
STATUS_DIR="${OUTPUT_DIR}/.status"
mkdir -p "${STATUS_DIR}"
write_scan_status() {
    local state="$1"
    local msg="$2"
    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
    printf '{"state":"%s","message":"%s","updatedAt":"%s","startedAt":"%s"}' "${state}" "${msg}" "${ts}" "${ts}" > "${STATUS_DIR}/scan.json.tmp" 2>/dev/null && mv -f "${STATUS_DIR}/scan.json.tmp" "${STATUS_DIR}/scan.json" 2>/dev/null || true
}
trap 'write_scan_status "idle" "Scan interrupted" 2>/dev/null || true' INT TERM
write_scan_status "running" "Scanning original_files" || true

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

# Collect all media files
ALL_FILES=()
while IFS= read -r filepath; do
    ALL_FILES+=("${filepath}")
done < <(find "${ORIGINAL_DIR}" -type f \( \
    -iname "*.mp4" -o -iname "*.mov" -o \
    -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
\) 2>/dev/null)

declare -A TIME_MAP
build_time_map TIME_MAP "${ALL_FILES[@]}"

# Build sorted file list as JSON array in a single streaming pass
FILES_JSON="${TMPDIR_SCAN}/files.json"
printf '[' > "${FILES_JSON}"
FIRST=true
for filepath in "${ALL_FILES[@]}"; do
    file_epoch=$(get_capture_epoch "${filepath}" TIME_MAP)
    file_size=$(stat -c %s "${filepath}")
    filename=$(basename "${filepath}")
    if [[ "${FIRST}" == "true" ]]; then
        FIRST=false
    else
        printf ',' >> "${FILES_JSON}"
    fi
    printf '{"path":"%s","size":%d,"mtime":%d,"filename":"%s"}' \
        "${filepath}" "${file_size}" "${file_epoch}" "${filename}" >> "${FILES_JSON}"
done
printf ']' >> "${FILES_JSON}"

DISK_COUNT=$(jq 'length' "${FILES_JSON}" 2>/dev/null)

if [[ "${DISK_COUNT}" -eq 0 ]]; then
    echo "[Scan] No files found in original_files."
    write_scan_status "done" "No files found" || true
    ( sleep 5; printf '{"state":"idle","message":"Idle","updatedAt":"%s"}' "$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")" > "${STATUS_DIR}/scan.json.tmp" 2>/dev/null && mv -f "${STATUS_DIR}/scan.json.tmp" "${STATUS_DIR}/scan.json" 2>/dev/null || true ) > /dev/null 2>&1 & disown 2>/dev/null || true
    rm -rf "${TMPDIR_SCAN}"
    exit 0
fi

if [[ ! -f "${MANIFEST}" ]]; then
    echo "[Scan] Creating new manifest with ${DISK_COUNT} file(s)."

    JUMP_GAP_SECONDS=1800
    CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    TARGET_DATE=$(date +%Y-%m-%d)

    jq -n \
        --slurpfile files "${FILES_JSON}" \
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
    write_scan_status "done" "Found ${DISK_COUNT} files in ${FINAL_JUMPS} jumps" || true
    ( sleep 5; printf '{"state":"idle","message":"Idle","updatedAt":"%s"}' "$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")" > "${STATUS_DIR}/scan.json.tmp" 2>/dev/null && mv -f "${STATUS_DIR}/scan.json.tmp" "${STATUS_DIR}/scan.json" 2>/dev/null || true ) > /dev/null 2>&1 & disown 2>/dev/null || true
    rm -rf "${TMPDIR_SCAN}"
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -x "${SCRIPT_DIR}/generate_proxies.sh" ]]; then
        SKYDOCK_OUTPUT_DIR="${OUTPUT_DIR}" "${SCRIPT_DIR}/generate_proxies.sh" > /dev/null 2>&1 &
        echo "[Scan] Proxy generation queued in background"
    fi
    exit 0
fi

EXISTING_COUNT=$(jq '.files | length' "${MANIFEST}" 2>/dev/null || echo 0)

# Merge: diff and recluster in a single jq pass
JUMP_GAP_SECONDS=1800

jq -n \
    --slurpfile manifest "${MANIFEST}" \
    --slurpfile disk "${FILES_JSON}" \
    --argjson gap "${JUMP_GAP_SECONDS}" '
    ($manifest[0]) as $m |
    ($disk[0]) as $diskFiles |

    # Compute removed and added paths
    ([$m.files[].path] | sort) as $existingPaths |
    ([$diskFiles[].path] | sort) as $diskPaths |
    ($existingPaths - ($existingPaths - $diskPaths)) as $removedPaths |
    ($diskPaths - ($diskPaths - $existingPaths)) as $addedPaths |

    ($removedPaths | length) as $remCount |
    ($addedPaths | length) as $addCount |

    if $remCount == 0 and $addCount == 0 then
        {changed: false, existingCount: ($m.files | length)}
    else
        # Build lookup sets for fast membership test
        ($removedPaths | map({(.): true}) | add // {}) as $removedSet |
        ($addedPaths | map({(.): true}) | add // {}) as $addedSet |

        # Updated files: filter removed, add new from disk
        ([$m.files[] | select(.path as $p | $removedSet[$p] | not)] +
         [$diskFiles[] | select(.path as $p | $addedSet[$p])]) as $updatedFiles |

        # Filter jumps: remove deleted files, drop empty jumps
        ([$m.jumps[] | {
            id: .id, label: .label, confirmed: .confirmed, processed: .processed,
            files: [.files[] | select(.path as $fp | $removedSet[$fp] | not)]
        }] | map(select(.files | length > 0))) as $kept |

        # Build path -> jump metadata lookup
        ([$kept[].files[]] | map({(.path): {jid: null, jlabel: null, jconfirmed: null, jprocessed: null}}) | add // {}) as $emptyLookup |
        ($kept | reduce .[] as $j ($emptyLookup;
            . + ([$j.files[] | {(.path): {jid: $j.id, jlabel: $j.label, jconfirmed: $j.confirmed, jprocessed: $j.processed}}] | add)
        )) as $prev |

        # Add new files to lookup
        ([$diskFiles[] | select(.path as $p | $addedSet[$p]) | {(.path): {jid: null, jlabel: null, jconfirmed: null, jprocessed: null}}] | add // {}) as $prevExt |
        ($prev + $prevExt) as $prevAll |

        # Cluster new files by time gaps
        ([$diskFiles[] | select(.path as $p | $addedSet[$p]) | {path: .path, mtime: .mtime}] |
         sort_by(.mtime) | reduce .[] as $f (
            {clusters: [], current: []};
            if (.current | length) > 0 and (($f.mtime - (.current[-1].mtime)) > $gap) then
                .clusters += [.current] | .current = [$f]
            else
                .current += [$f]
            end
        ) | .clusters += [.current] | [.clusters[] | select(length > 0)]) as $newClusters |

        ($kept | length) as $numKept |

        # Build new jumps with majority-vote metadata
        ($newClusters | to_entries | map(
            .key as $idx | .value as $cluster |
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

        {
            changed: true,
            existingCount: ($m.files | length),
            addedCount: $addCount,
            removedCount: $remCount,
            manifest: {
                version: $m.version,
                status: $m.status,
                date: $m.date,
                startDatetime: $m.startDatetime,
                createdAt: $m.createdAt,
                files: $updatedFiles,
                theory: ($m.theory // []),
                jumps: ($kept + $newJumps),
                cameraClockOffsetSeconds: $m.cameraClockOffsetSeconds
            }
        }
    end
' > "${TMPDIR_SCAN}/result.json"

CHANGED=$(jq -r '.changed' "${TMPDIR_SCAN}/result.json")

if [[ "${CHANGED}" == "false" ]]; then
    EXISTING=$(jq -r '.existingCount' "${TMPDIR_SCAN}/result.json")
    echo "[Scan] No changes. ${EXISTING} file(s) in manifest."
    write_scan_status "done" "No changes, ${EXISTING} files" || true
    ( sleep 5; printf '{"state":"idle","message":"Idle","updatedAt":"%s"}' "$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")" > "${STATUS_DIR}/scan.json.tmp" 2>/dev/null && mv -f "${STATUS_DIR}/scan.json.tmp" "${STATUS_DIR}/scan.json" 2>/dev/null || true ) > /dev/null 2>&1 & disown 2>/dev/null || true
    rm -rf "${TMPDIR_SCAN}"
    exit 0
fi

ADDED=$(jq -r '.addedCount' "${TMPDIR_SCAN}/result.json")
REMOVED=$(jq -r '.removedCount' "${TMPDIR_SCAN}/result.json")
EXISTING=$(jq -r '.existingCount' "${TMPDIR_SCAN}/result.json")

echo "[Scan] Merging: +${ADDED} new, -${REMOVED} removed, ${EXISTING} existing."

jq '.manifest' "${TMPDIR_SCAN}/result.json" > "${MANIFEST}.tmp" && mv "${MANIFEST}.tmp" "${MANIFEST}"

FINAL_COUNT=$(jq '.files | length' "${MANIFEST}" 2>/dev/null)
FINAL_JUMPS=$(jq '.jumps | length' "${MANIFEST}" 2>/dev/null)
echo "[Scan] Manifest: ${FINAL_COUNT} file(s) in ${FINAL_JUMPS} jump(s)."
echo "[Scan] Manifest: ${MANIFEST}"
write_scan_status "done" "Merged ${FINAL_COUNT} files in ${FINAL_JUMPS} jumps" || true
( sleep 5; printf '{"state":"idle","message":"Idle","updatedAt":"%s"}' "$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")" > "${STATUS_DIR}/scan.json.tmp" 2>/dev/null && mv -f "${STATUS_DIR}/scan.json.tmp" "${STATUS_DIR}/scan.json" 2>/dev/null || true ) > /dev/null 2>&1 & disown 2>/dev/null || true

rm -rf "${TMPDIR_SCAN}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -x "${SCRIPT_DIR}/generate_proxies.sh" ]]; then
    SKYDOCK_OUTPUT_DIR="${OUTPUT_DIR}" "${SCRIPT_DIR}/generate_proxies.sh" > /dev/null 2>&1 &
    echo "[Scan] Proxy generation queued in background"
fi

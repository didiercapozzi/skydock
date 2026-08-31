#!/usr/bin/env bash
set -eo pipefail
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
MANIFEST="${OUTPUT_DIR}/manifest.json"
CACHE_DIR="${OUTPUT_DIR}/.cache"
THUMB_DIR="${CACHE_DIR}/thumbs"
PROXY_DIR="${CACHE_DIR}/proxies"
JOBS="${SKYDOCK_PROXY_JOBS:-}"
NICE_LEVEL="${SKYDOCK_PROXY_NICE:-10}"
IONICE_CLASS="${SKYDOCK_PROXY_IONICE_CLASS:-2}"
IONICE_LEVEL="${SKYDOCK_PROXY_IONICE_LEVEL:-6}"
if [[ ! -f "${MANIFEST}" ]]; then
    exit 0
fi
if ! command -v ffmpeg &>/dev/null; then
    echo "[Proxies] ffmpeg not found, skipping"
    exit 0
fi
if [[ ! -f "${MANIFEST}" ]]; then
    exit 0
fi
mkdir -p "${THUMB_DIR}" "${PROXY_DIR}"
STATUS_DIR="${OUTPUT_DIR}/.status"
mkdir -p "${STATUS_DIR}"
write_proxy_status() {
    local state="$1"
    local msg="$2"
    local total="$3"
    local done="$4"
    local ts
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
    local tmp="${STATUS_DIR}/proxies.json.tmp"
    if [[ -n "${total}" && -n "${done}" ]]; then
        printf '{"state":"%s","message":"%s","total":%s,"done":%s,"updatedAt":"%s","startedAt":"%s"}' "${state}" "${msg}" "${total}" "${done}" "${ts}" "${ts}" > "${tmp}" 2>/dev/null && mv -f "${tmp}" "${STATUS_DIR}/proxies.json" 2>/dev/null || true
    else
        printf '{"state":"%s","message":"%s","updatedAt":"%s","startedAt":"%s"}' "${state}" "${msg}" "${ts}" "${ts}" > "${tmp}" 2>/dev/null && mv -f "${tmp}" "${STATUS_DIR}/proxies.json" 2>/dev/null || true
    fi
}
trap 'write_proxy_status "idle" "Proxy generation interrupted" 2>/dev/null || true' INT TERM
TOTAL_CPUS=$(nproc 2>/dev/null || echo 4)
if [[ -z "${JOBS}" ]]; then
    JOBS=$((TOTAL_CPUS - 1))
    if [[ "${JOBS}" -lt 1 ]]; then
        JOBS=1
    fi
fi
if [[ "${JOBS}" -gt 8 ]]; then
    JOBS=8
fi
NICE_CMD=""
IONICE_CMD=""
if command -v nice &>/dev/null; then
    NICE_CMD="nice -n ${NICE_LEVEL}"
fi
if command -v ionice &>/dev/null; then
    IONICE_CMD="ionice -c ${IONICE_CLASS} -n ${IONICE_LEVEL}"
fi
RUN_PREFIX=""
if [[ -n "${NICE_CMD}" ]]; then
    RUN_PREFIX="${NICE_CMD}"
fi
if [[ -n "${IONICE_CMD}" ]]; then
    if [[ -n "${RUN_PREFIX}" ]]; then
        RUN_PREFIX="${RUN_PREFIX} ${IONICE_CMD}"
    else
        RUN_PREFIX="${IONICE_CMD}"
    fi
fi
 TMP_LIST=$(mktemp)
TMP_JOBS=$(mktemp)
trap 'rm -f "${TMP_LIST}" "${TMP_JOBS}"' EXIT
jq -r '.files[] | select(.path | test("\\.(mp4|mov|avi|mkv)$"; "i")) | "\(.path)\t\(.id // "")\t\(.mtime)"' "${MANIFEST}" 2>/dev/null > "${TMP_LIST}" || true
if [[ ! -s "${TMP_LIST}" ]]; then
    echo "[Proxies] No videos in manifest"
    write_proxy_status "idle" "No videos" 0 0 || true
    exit 0
fi
TOTAL_VIDEOS=$(wc -l < "${TMP_LIST}" 2>/dev/null | tr -d ' ')
write_proxy_status "running" "Generating thumbnails and 480p proxies" "${TOTAL_VIDEOS}" 0 || true
(
    while true; do
        sleep 5
        cur_state=$(jq -r '.state' "${STATUS_DIR}/proxies.json" 2>/dev/null || echo "")
        if [[ "${cur_state}" != "running" ]]; then break; fi
        cur_done=$(ls "${PROXY_DIR}"/*.mp4 2>/dev/null | wc -l | tr -d ' ')
        ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")
        printf '{"state":"running","message":"Generating thumbnails and 480p proxies","total":%s,"done":%s,"updatedAt":"%s","startedAt":"%s"}' "${TOTAL_VIDEOS}" "${cur_done}" "${ts}" "${ts}" > "${STATUS_DIR}/proxies.json.tmp" 2>/dev/null && mv -f "${STATUS_DIR}/proxies.json.tmp" "${STATUS_DIR}/proxies.json" 2>/dev/null || true
    done
) > /dev/null 2>&1 & disown 2>/dev/null || true
prune_stale() {
    local valid_ids
    valid_ids=$(jq -r '.files[] | .id // empty' "${MANIFEST}" 2>/dev/null | sort -u)
    if [[ -z "${valid_ids}" ]]; then
        return
    fi
    for f in "${THUMB_DIR}"/*.jpg; do
        [[ -f "${f}" ]] || continue
        local base
        base=$(basename "${f}")
        base="${base%.*}"
        if ! echo "${valid_ids}" | grep -qx "${base}"; then
            rm -f "${f}" 2>/dev/null || true
        fi
    done
    for f in "${PROXY_DIR}"/*.mp4; do
        [[ -f "${f}" ]] || continue
        local base
        base=$(basename "${f}")
        base="${base%.*}"
        if ! echo "${valid_ids}" | grep -qx "${base}"; then
            rm -f "${f}" 2>/dev/null || true
        fi
    done
}
generate_one() {
    local src="$1"
    local fid="$2"
    local fmtime="$3"
    if [[ ! -f "${src}" ]]; then
        return
    fi
    if [[ -z "${fid}" ]]; then
        fid=$(echo -n "${src}" | sha256sum | cut -c1-16)
    fi
    local thumb="${THUMB_DIR}/${fid}.jpg"
    local proxy="${PROXY_DIR}/${fid}.mp4"
    local need_thumb=false
    local need_proxy=false
    if [[ ! -f "${thumb}" ]]; then
        need_thumb=true
    else
        local src_mtime
        src_mtime=$(stat -c %Y "${src}" 2>/dev/null || echo 0)
        local thumb_mtime
        thumb_mtime=$(stat -c %Y "${thumb}" 2>/dev/null || echo 0)
        if [[ "${src_mtime}" -gt "${thumb_mtime}" ]]; then
            need_thumb=true
        fi
    fi
    if [[ ! -f "${proxy}" ]]; then
        need_proxy=true
    else
        local src_mtime2
        src_mtime2=$(stat -c %Y "${src}" 2>/dev/null || echo 0)
        local proxy_mtime
        proxy_mtime=$(stat -c %Y "${proxy}" 2>/dev/null || echo 0)
        if [[ "${src_mtime2}" -gt "${proxy_mtime}" ]]; then
            need_proxy=true
        fi
    fi
    if [[ "${need_thumb}" == "true" ]]; then
        local thumb_tmp="${thumb}.tmp.jpg"
        ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -ss 0.5 -i "${src}" -vframes 1 -vf "scale=320:-2" -q:v 3 "${thumb_tmp}" 2>/dev/null && mv -f "${thumb_tmp}" "${thumb}" || rm -f "${thumb_tmp}" 2>/dev/null || true
    fi
    if [[ "${need_proxy}" == "true" ]]; then
        local proxy_tmp="${proxy}.tmp.mp4"
        ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -i "${src}" -vf "scale=-2:480" -c:v libx264 -crf 28 -preset veryfast -c:a aac -b:a 64k -movflags +faststart "${proxy_tmp}" 2>/dev/null && mv -f "${proxy_tmp}" "${proxy}" || rm -f "${proxy_tmp}" 2>/dev/null || true
    fi
}
export -f generate_one
export THUMB_DIR PROXY_DIR RUN_PREFIX
thumb_count=0
proxy_count=0
existing_thumbs=0
existing_proxies=0
while IFS=$'\t' read -r vpath vid vmtime; do
    if [[ -z "${vid}" ]]; then
        vid=$(echo -n "${vpath}" | sha256sum | cut -c1-16)
    fi
    thumb_file="${THUMB_DIR}/${vid}.jpg"
    proxy_file="${PROXY_DIR}/${vid}.mp4"
    if [[ -f "${thumb_file}" ]]; then
        existing_thumbs=$((existing_thumbs + 1))
    fi
    if [[ -f "${proxy_file}" ]]; then
        existing_proxies=$((existing_proxies + 1))
    fi
done < "${TMP_LIST}"
if command -v parallel &>/dev/null && [[ "${JOBS}" -gt 1 ]]; then
    cat "${TMP_LIST}" | parallel --colsep '\t' -j "${JOBS}" generate_one {1} {2} {3} 2>/dev/null || true
else
    if [[ "${JOBS}" -gt 1 ]]; then
        active=0
        while IFS=$'\t' read -r vpath vid vmtime; do
            generate_one "${vpath}" "${vid}" "${vmtime}" &
            active=$((active + 1))
            if [[ "${active}" -ge "${JOBS}" ]]; then
                wait -n 2>/dev/null || wait
                active=$((active - 1))
            fi
        done < "${TMP_LIST}"
        wait 2>/dev/null || true
    else
        while IFS=$'\t' read -r vpath vid vmtime; do
            generate_one "${vpath}" "${vid}" "${vmtime}"
        done < "${TMP_LIST}"
    fi
fi
generated_thumbs=0
generated_proxies=0
while IFS=$'\t' read -r vpath vid vmtime; do
    if [[ -z "${vid}" ]]; then
        vid=$(echo -n "${vpath}" | sha256sum | cut -c1-16)
    fi
    thumb_file="${THUMB_DIR}/${vid}.jpg"
    proxy_file="${PROXY_DIR}/${vid}.mp4"
    if [[ -f "${thumb_file}" ]]; then
        generated_thumbs=$((generated_thumbs + 1))
    fi
    if [[ -f "${proxy_file}" ]]; then
        generated_proxies=$((generated_proxies + 1))
    fi
done < "${TMP_LIST}"
new_thumbs=$((generated_thumbs - existing_thumbs))
new_proxies=$((generated_proxies - existing_proxies))
if [[ "${new_thumbs}" -lt 0 ]]; then new_thumbs=0; fi
if [[ "${new_proxies}" -lt 0 ]]; then new_proxies=0; fi
prune_stale || true
TMP_MANIFEST=$(mktemp)
jq --arg thumbDir "${THUMB_DIR}" --arg proxyDir "${PROXY_DIR}" '
  def cachePath(dir; id; ext): dir + "/" + id + ext;
  (.files | map(.id // "")) as $ids |
  .files |= map(
    .id as $fid |
    if $fid != "" and $fid != null then
      .thumbPath = (cachePath($thumbDir; $fid; ".jpg")) |
      .proxyPath = (cachePath($proxyDir; $fid; ".mp4"))
    else . end
  ) |
  .jumps |= map(.files |= map(
    .id as $fid |
    if $fid != "" and $fid != null then
      .thumbPath = (cachePath($thumbDir; $fid; ".jpg")) |
      .proxyPath = (cachePath($proxyDir; $fid; ".mp4"))
    else . end
  ))
' "${MANIFEST}" > "${TMP_MANIFEST}" 2>/dev/null && mv -f "${TMP_MANIFEST}" "${MANIFEST}" || rm -f "${TMP_MANIFEST}" 2>/dev/null || true
if [[ "${generated_proxies}" -eq "${TOTAL_VIDEOS}" && "${generated_thumbs}" -eq "${TOTAL_VIDEOS}" ]]; then
    write_proxy_status "done" "Thumbnails and proxies ready (${generated_proxies}/${TOTAL_VIDEOS})" "${TOTAL_VIDEOS}" "${generated_proxies}" || true
    (
        sleep 8
        cur=$(cat "${STATUS_DIR}/proxies.json" 2>/dev/null | jq -r '.state' 2>/dev/null || echo "")
        if [[ "${cur}" == "done" ]]; then
            printf '{"state":"idle","message":"Idle","updatedAt":"%s"}' "$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")" > "${STATUS_DIR}/proxies.json.tmp" 2>/dev/null && mv -f "${STATUS_DIR}/proxies.json.tmp" "${STATUS_DIR}/proxies.json" 2>/dev/null || true
        fi
    ) > /dev/null 2>&1 & disown 2>/dev/null || true
else
    write_proxy_status "done" "Generated ${generated_thumbs} thumbs, ${generated_proxies} proxies — ${new_thumbs} new thumbs, ${new_proxies} new proxies (${generated_proxies}/${TOTAL_VIDEOS} ready)" "${TOTAL_VIDEOS}" "${generated_proxies}" || true
fi
echo "[Proxies] Done: ${generated_thumbs} thumbs (${new_thumbs} new), ${generated_proxies} proxies (${new_proxies} new), jobs=${JOBS} nice=${NICE_LEVEL} ionice=${IONICE_CLASS}:${IONICE_LEVEL}"

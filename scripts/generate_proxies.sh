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
PRESET="${SKYDOCK_PROXY_PRESET:-ultrafast}"
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
LOG_DIR="${CACHE_DIR}/logs"
mkdir -p "${LOG_DIR}"
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
if [[ "${JOBS}" -gt 2 ]]; then
    FFMPEG_THREADS=1
else
    FFMPEG_THREADS=2
fi
ENCODER="libx264"
if ffmpeg -encoders 2>/dev/null | grep -q "h264_nvenc"; then
    ENCODER="h264_nvenc"
elif ffmpeg -encoders 2>/dev/null | grep -q "h264_qsv"; then
    ENCODER="h264_qsv"
elif ffmpeg -encoders 2>/dev/null | grep -q "h264_videotoolbox"; then
    ENCODER="h264_videotoolbox"
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
write_proxy_status "running" "Generating thumbnails (320px)" "${TOTAL_VIDEOS}" 0 || true
prune_stale() {
    local valid_ids
    valid_ids=$(jq -r '.files[].id // empty, .jumps[].files[].id // empty' "${MANIFEST}" 2>/dev/null | sort -u)
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
generate_thumb() {
    local src="$1"
    local fid="$2"
    if [[ ! -f "${src}" ]]; then
        return
    fi
    if [[ -z "${fid}" ]]; then
        fid=$(echo -n "${src}" | sha256sum | cut -c1-16)
    fi
    local thumb="${THUMB_DIR}/${fid}.jpg"
    if [[ -f "${thumb}" ]]; then
        local src_mtime
        src_mtime=$(stat -c %Y "${src}" 2>/dev/null || echo 0)
        local thumb_mtime
        thumb_mtime=$(stat -c %Y "${thumb}" 2>/dev/null || echo 0)
        if [[ "${src_mtime}" -le "${thumb_mtime}" ]]; then
            return
        fi
    fi
    local thumb_tmp="${thumb}.tmp.jpg"
    ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -ss 0.5 -i "${src}" -vframes 1 -vf "scale=320:-2" -q:v 3 -threads ${FFMPEG_THREADS} "${thumb_tmp}" 2>/dev/null && mv -f "${thumb_tmp}" "${thumb}" || rm -f "${thumb_tmp}" 2>/dev/null || true
}
generate_proxy() {
    local src="$1"
    local fid="$2"
    if [[ ! -f "${src}" ]]; then
        return 1
    fi
    if [[ -z "${fid}" ]]; then
        fid=$(echo -n "${src}" | sha256sum | cut -c1-16)
    fi
    local proxy="${PROXY_DIR}/${fid}.mp4"
    if [[ -f "${proxy}" ]]; then
        local src_mtime2
        src_mtime2=$(stat -c %Y "${src}" 2>/dev/null || echo 0)
        local proxy_mtime
        proxy_mtime=$(stat -c %Y "${proxy}" 2>/dev/null || echo 0)
        if [[ "${src_mtime2}" -le "${proxy_mtime}" ]]; then
            return 0
        fi
    fi
    local proxy_tmp="${proxy}.tmp.mp4"
    local log_file="${LOG_DIR}/${fid}.log"
    local audio_codec
    audio_codec=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=nw=1:nk=1 "${src}" 2>/dev/null || echo "")
    local audio_streams
    audio_streams=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${src}" 2>/dev/null | wc -l | tr -d ' ')
    local audio_args
    if [[ "${audio_streams}" -eq 0 ]]; then
        audio_args="-an"
    elif [[ "${audio_codec}" == "aac" ]]; then
        audio_args="-c:a copy"
    else
        audio_args="-c:a aac -b:a 64k"
    fi
    local v_args
    local enc_ok=false
    case "${ENCODER}" in
        h264_nvenc)
            v_args="-c:v h264_nvenc -rc vbr_hq -cq 28 -preset fast"
            if ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "scale=-2:480" ${v_args} ${audio_args} -movflags +faststart -threads ${FFMPEG_THREADS} "${proxy_tmp}" > "${log_file}" 2>&1; then
                enc_ok=true
            else
                cat "${log_file}" 2>/dev/null | head -20
                rm -f "${proxy_tmp}" 2>/dev/null || true
                v_args="-c:v libx264 -crf 28 -preset ${PRESET} -threads ${FFMPEG_THREADS}"
                if ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "scale=-2:480" ${v_args} ${audio_args} -movflags +faststart "${proxy_tmp}" > "${log_file}" 2>&1; then
                    enc_ok=true
                else
                    cat "${log_file}" 2>/dev/null | head -20
                fi
            fi
            ;;
        h264_qsv)
            v_args="-c:v h264_qsv -global_quality 28 -preset veryfast"
            if ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "scale=-2:480" ${v_args} ${audio_args} -movflags +faststart -threads ${FFMPEG_THREADS} "${proxy_tmp}" > "${log_file}" 2>&1; then
                enc_ok=true
            else
                cat "${log_file}" 2>/dev/null | head -20
                rm -f "${proxy_tmp}" 2>/dev/null || true
                v_args="-c:v libx264 -crf 28 -preset ${PRESET} -threads ${FFMPEG_THREADS}"
                if ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "scale=-2:480" ${v_args} ${audio_args} -movflags +faststart "${proxy_tmp}" > "${log_file}" 2>&1; then
                    enc_ok=true
                else
                    cat "${log_file}" 2>/dev/null | head -20
                fi
            fi
            ;;
        h264_videotoolbox)
            v_args="-c:v h264_videotoolbox -q:v 60"
            if ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "scale=-2:480" ${v_args} ${audio_args} -movflags +faststart -threads ${FFMPEG_THREADS} "${proxy_tmp}" > "${log_file}" 2>&1; then
                enc_ok=true
            else
                cat "${log_file}" 2>/dev/null | head -20
                rm -f "${proxy_tmp}" 2>/dev/null || true
                v_args="-c:v libx264 -crf 28 -preset ${PRESET} -threads ${FFMPEG_THREADS}"
                if ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "scale=-2:480" ${v_args} ${audio_args} -movflags +faststart "${proxy_tmp}" > "${log_file}" 2>&1; then
                    enc_ok=true
                else
                    cat "${log_file}" 2>/dev/null | head -20
                fi
            fi
            ;;
        *)
            v_args="-c:v libx264 -crf 28 -preset ${PRESET} -threads ${FFMPEG_THREADS}"
            if ${RUN_PREFIX} ffmpeg -y -hide_banner -loglevel error -hwaccel auto -i "${src}" -vf "scale=-2:480" ${v_args} ${audio_args} -movflags +faststart "${proxy_tmp}" > "${log_file}" 2>&1; then
                enc_ok=true
            else
                cat "${log_file}" 2>/dev/null | head -20
            fi
            ;;
    esac
    if [[ "${enc_ok}" == "true" ]]; then
        mv -f "${proxy_tmp}" "${proxy}" 2>/dev/null || rm -f "${proxy_tmp}" 2>/dev/null || true
        rm -f "${log_file}" 2>/dev/null || true
        return 0
    else
        rm -f "${proxy_tmp}" 2>/dev/null || true
        echo "[Proxy] Failed ${src} -> ${proxy} (id ${fid}) audio_streams=${audio_streams} codec=${audio_codec} log=${log_file}" >&2
        return 1
    fi
}
export -f generate_thumb generate_proxy
export THUMB_DIR PROXY_DIR LOG_DIR RUN_PREFIX FFMPEG_THREADS ENCODER PRESET
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
    cat "${TMP_LIST}" | parallel --colsep '\t' -j "${JOBS}" generate_thumb {1} {2} || true
else
    if [[ "${JOBS}" -gt 1 ]]; then
        active=0
        while IFS=$'\t' read -r vpath vid vmtime; do
            generate_thumb "${vpath}" "${vid}" &
            active=$((active + 1))
            if [[ "${active}" -ge "${JOBS}" ]]; then
                wait -n || wait
                active=$((active - 1))
            fi
        done < "${TMP_LIST}"
        wait || true
    else
        while IFS=$'\t' read -r vpath vid vmtime; do
            generate_thumb "${vpath}" "${vid}"
        done < "${TMP_LIST}"
    fi
fi
thumb_done=$(ls "${THUMB_DIR}"/*.jpg 2>/dev/null | wc -l | tr -d ' ')
write_proxy_status "running" "Thumbnails ready (${thumb_done}/${TOTAL_VIDEOS}), generating 480p proxies (${ENCODER} ${PRESET})" "${TOTAL_VIDEOS}" "${thumb_done}" || true
MAX_RETRIES=2
attempt=0
while [[ "${attempt}" -le "${MAX_RETRIES}" ]]; do
    if command -v parallel &>/dev/null && [[ "${JOBS}" -gt 1 ]]; then
        cat "${TMP_LIST}" | parallel --colsep '\t' -j "${JOBS}" generate_proxy {1} {2} || true
    else
        if [[ "${JOBS}" -gt 1 ]]; then
            active=0
            while IFS=$'\t' read -r vpath vid vmtime; do
                fid_check="${vid}"
                if [[ -z "${fid_check}" ]]; then
                    fid_check=$(echo -n "${vpath}" | sha256sum | cut -c1-16)
                fi
                if [[ -f "${PROXY_DIR}/${fid_check}.mp4" ]]; then
                    src_m=$(stat -c %Y "${vpath}" 2>/dev/null || echo 0)
                    p_m=$(stat -c %Y "${PROXY_DIR}/${fid_check}.mp4" 2>/dev/null || echo 0)
                    if [[ "${src_m}" -le "${p_m}" ]]; then
                        continue
                    fi
                fi
                generate_proxy "${vpath}" "${vid}" &
                active=$((active + 1))
                if [[ "${active}" -ge "${JOBS}" ]]; then
                    wait -n || true
                    active=$((active - 1))
                fi
                cur_done=$(ls "${PROXY_DIR}"/*.mp4 2>/dev/null | wc -l | tr -d ' ')
                write_proxy_status "running" "Generating 480p proxies (${ENCODER} ${PRESET}) ${cur_done}/${TOTAL_VIDEOS} attempt $((attempt + 1))/${MAX_RETRIES}" "${TOTAL_VIDEOS}" "${cur_done}" || true
            done < "${TMP_LIST}"
            wait || true
        else
            done_count=0
            while IFS=$'\t' read -r vpath vid vmtime; do
                fid_check="${vid}"
                if [[ -z "${fid_check}" ]]; then
                    fid_check=$(echo -n "${vpath}" | sha256sum | cut -c1-16)
                fi
                if [[ -f "${PROXY_DIR}/${fid_check}.mp4" ]]; then
                    src_m=$(stat -c %Y "${vpath}" 2>/dev/null || echo 0)
                    p_m=$(stat -c %Y "${PROXY_DIR}/${fid_check}.mp4" 2>/dev/null || echo 0)
                    if [[ "${src_m}" -le "${p_m}" ]]; then
                        continue
                    fi
                fi
                generate_proxy "${vpath}" "${vid}" || true
                done_count=$((done_count + 1))
                write_proxy_status "running" "Generating 480p proxies (${ENCODER} ${PRESET}) ${done_count}/${TOTAL_VIDEOS} attempt $((attempt + 1))" "${TOTAL_VIDEOS}" "${done_count}" || true
            done < "${TMP_LIST}"
        fi
    fi
    check_proxies=$(ls "${PROXY_DIR}"/*.mp4 2>/dev/null | wc -l | tr -d ' ')
    if [[ "${check_proxies}" -ge "${TOTAL_VIDEOS}" ]]; then
        break
    fi
    attempt=$((attempt + 1))
    if [[ "${attempt}" -le "${MAX_RETRIES}" ]]; then
        missing=$((TOTAL_VIDEOS - check_proxies))
        echo "[Proxies] Retry ${attempt}/${MAX_RETRIES}: ${missing} proxies still missing" >&2
        write_proxy_status "running" "Retrying ${missing} failed proxies attempt ${attempt}/${MAX_RETRIES}" "${TOTAL_VIDEOS}" "${check_proxies}" || true
        sleep 1
    fi
done
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
  .files |= map(
    .id as $fid |
    if $fid != "" and $fid != null then
      if (.path | test("\\.(mp4|mov|avi|mkv)$"; "i")) then
        (if $fid != null and $fid != "" then cachePath($thumbDir; $fid; ".jpg") else null end) as $tp |
        (if $fid != null and $fid != "" then cachePath($proxyDir; $fid; ".mp4") else null end) as $pp |
        .thumbPath = $tp |
        .proxyPath = $pp
      else
        .thumbPath = null |
        .proxyPath = null
      end
    else . end
  ) |
  .jumps |= map(.files |= map(
    .id as $fid |
    if $fid != "" and $fid != null then
      if (.path | test("\\.(mp4|mov|avi|mkv)$"; "i")) then
        (if $fid != null and $fid != "" then cachePath($thumbDir; $fid; ".jpg") else null end) as $tp |
        (if $fid != null and $fid != "" then cachePath($proxyDir; $fid; ".mp4") else null end) as $pp |
        .thumbPath = $tp |
        .proxyPath = $pp
      else
        .thumbPath = null |
        .proxyPath = null
      end
    else . end
  )) |
  .files |= map(if .thumbPath == null then del(.thumbPath) else . end | if .proxyPath == null then del(.proxyPath) else . end) |
  .jumps |= map(.files |= map(if .thumbPath == null then del(.thumbPath) else . end | if .proxyPath == null then del(.proxyPath) else . end))
' "${MANIFEST}" > "${TMP_MANIFEST}" 2>/dev/null && mv -f "${TMP_MANIFEST}" "${MANIFEST}" || rm -f "${TMP_MANIFEST}" 2>/dev/null || true
TMP_CLEAN=$(mktemp)
jq --arg thumbDir "${THUMB_DIR}" --arg proxyDir "${PROXY_DIR}" '
  def existsThumb(id): $thumbDir + "/" + id + ".jpg";
  def existsProxy(id): $proxyDir + "/" + id + ".mp4";
  .files |= map(
    if .thumbPath != null then
      .id as $fid |
      if $fid != null and $fid != "" then
        if .thumbPath == existsThumb($fid) and (.proxyPath == null or .proxyPath == existsProxy($fid)) then . else . end
      else . end
    else . end
  )
' "${MANIFEST}" > "${TMP_CLEAN}" 2>/dev/null || true
for fid_check in $(jq -r '.files[] | select(.id != null) | .id' "${MANIFEST}" 2>/dev/null | sort -u); do
    if [[ ! -f "${THUMB_DIR}/${fid_check}.jpg" ]]; then
        jq --arg fid "${fid_check}" '(.files[] | select(.id == $fid) | .thumbPath) |= empty | (.jumps[].files[] | select(.id == $fid) | .thumbPath) |= empty | .files |= map(if .thumbPath == null then del(.thumbPath) else . end) | .jumps |= map(.files |= map(if .thumbPath == null then del(.thumbPath) else . end))' "${MANIFEST}" > "${TMP_CLEAN}" 2>/dev/null && mv -f "${TMP_CLEAN}" "${MANIFEST}" || true
    fi
    if [[ ! -f "${PROXY_DIR}/${fid_check}.mp4" ]]; then
        jq --arg fid "${fid_check}" '(.files[] | select(.id == $fid) | .proxyPath) |= empty | (.jumps[].files[] | select(.id == $fid) | .proxyPath) |= empty | .files |= map(if .proxyPath == null then del(.proxyPath) else . end) | .jumps |= map(.files |= map(if .proxyPath == null then del(.proxyPath) else . end))' "${MANIFEST}" > "${TMP_CLEAN}" 2>/dev/null && mv -f "${TMP_CLEAN}" "${MANIFEST}" || true
    fi
done
rm -f "${TMP_CLEAN}" 2>/dev/null || true
if [[ "${generated_proxies}" -eq "${TOTAL_VIDEOS}" && "${generated_thumbs}" -eq "${TOTAL_VIDEOS}" ]]; then
    write_proxy_status "done" "Thumbnails and proxies ready (${generated_proxies}/${TOTAL_VIDEOS} ${ENCODER} ${PRESET})" "${TOTAL_VIDEOS}" "${generated_proxies}" || true
    (
        sleep 8
        cur=$(cat "${STATUS_DIR}/proxies.json" 2>/dev/null | jq -r '.state' 2>/dev/null || echo "")
        if [[ "${cur}" == "done" ]]; then
            printf '{"state":"idle","message":"Idle","updatedAt":"%s"}' "$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")" > "${STATUS_DIR}/proxies.json.tmp" 2>/dev/null && mv -f "${STATUS_DIR}/proxies.json.tmp" "${STATUS_DIR}/proxies.json" 2>/dev/null || true
        fi
    ) > /dev/null 2>&1 & disown 2>/dev/null || true
    echo "[Proxies] Done: ${generated_thumbs} thumbs (${new_thumbs} new), ${generated_proxies} proxies (${new_proxies} new), jobs=${JOBS} threads=${FFMPEG_THREADS} encoder=${ENCODER} preset=${PRESET} nice=${NICE_LEVEL} ionice=${IONICE_CLASS}:${IONICE_LEVEL}"
else
    failed_thumbs=$((TOTAL_VIDEOS - generated_thumbs))
    failed_proxies=$((TOTAL_VIDEOS - generated_proxies))
    write_proxy_status "error" "Failed ${failed_thumbs} thumbs, ${failed_proxies} proxies — check ${LOG_DIR} (${generated_proxies}/${TOTAL_VIDEOS} ready ${ENCODER} ${PRESET})" "${TOTAL_VIDEOS}" "${generated_proxies}" || true
    echo "[Proxies] ERROR: ${generated_thumbs}/${TOTAL_VIDEOS} thumbs, ${generated_proxies}/${TOTAL_VIDEOS} proxies — ${failed_proxies} proxies failed after $((MAX_RETRIES + 1)) attempts, see ${LOG_DIR}/*.log" >&2
fi

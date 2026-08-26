#!/usr/bin/env bash
set -eo pipefail

SIM_BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.sim"
CLEAN=false
DURATION=5
declare -a DAYS=()

usage() {
    cat <<EOF
Usage: $0 [OPTIONS] --day DAYS_AGO:NUM_JUMPS:FILES_PER_JUMP [...]

Options:
  --clean       Remove simulation directory first
  --duration    Duration of dummy videos in seconds (default: 5)
  --output      Custom output directory (default: .sim/)

Examples:
  $0 --clean --day 3:5:4 --day 2:4:3
  $0 --clean --day 0:2:6 --day 1:3:4
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output)    SIM_BASE="$2"; shift 2 ;;
        --clean)     CLEAN=true; shift ;;
        --duration)  DURATION="$2"; shift 2 ;;
        --day)       DAYS+=("$2"); shift 2 ;;
        -h|--help)   usage ;;
        *)           echo "Unknown option: $1"; usage ;;
    esac
done

if [[ ${#DAYS[@]} -eq 0 ]]; then
    echo "Error: No --day arguments provided."
    usage
fi

if $CLEAN && [[ -d "${SIM_BASE}" ]]; then
    echo "[Sim] Cleaning previous simulation directory: ${SIM_BASE}"
    rm -rf "${SIM_BASE}"
fi

PHOTO_DIR="${SIM_BASE}/photo_cam"
VIDEO_DIR="${SIM_BASE}/video_cam"
mkdir -p "${PHOTO_DIR}" "${VIDEO_DIR}"

generate_dummy_mp4() {
    local output_path="$1"
    local dur="$2"
    if command -v ffmpeg &>/dev/null; then
        ffmpeg -y -loglevel error \
            -f lavfi -i "testsrc=duration=${dur}:size=1920x1080:rate=30" \
            -f lavfi -i "sine=frequency=440:duration=${dur}" \
            -c:v libx264 -preset ultrafast -tune zerolatency \
            -c:a aac -shortest \
            "${output_path}" 2>/dev/null
    else
        dd if=/dev/urandom bs=1024 count=50 of="${output_path}" 2>/dev/null
    fi
}

FILE_COUNTER=0

create_jump() {
    local base_epoch="$1"
    local jump_offset="$2"
    local num_files="$3"

    local jump_epoch=$(( base_epoch + jump_offset ))
    local photo_count=$(( num_files / 2 ))
    local video_count=$(( num_files - photo_count ))
    local i

    for (( i=0; i<photo_count; i++ )); do
        FILE_COUNTER=$((FILE_COUNTER + 1))
        local file_epoch=$(( jump_epoch + i * 30 ))
        local filename
        filename=$(printf "DJI_%04d.MP4" "${FILE_COUNTER}")
        generate_dummy_mp4 "${PHOTO_DIR}/${filename}" "${DURATION}"
        touch -d "@${file_epoch}" "${PHOTO_DIR}/${filename}"
    done

    for (( i=0; i<video_count; i++ )); do
        FILE_COUNTER=$((FILE_COUNTER + 1))
        local file_epoch=$(( jump_epoch + photo_count * 30 + i * 30 + 5 ))
        local filename
        filename=$(printf "DJI_%04d.MP4" "${FILE_COUNTER}")
        generate_dummy_mp4 "${VIDEO_DIR}/${filename}" "${DURATION}"
        touch -d "@${file_epoch}" "${VIDEO_DIR}/${filename}"
    done

    echo "  Jump @ $(date -d "@${jump_epoch}" +"%H:%M:%S"): ${num_files} files (${photo_count} photo + ${video_count} video)"
}

echo "============================================================"
echo "    SkyDock Simulation"
echo "============================================================"

for day_spec in "${DAYS[@]}"; do
    IFS=':' read -r days_ago num_jumps files_per_jump <<< "${day_spec}"
    base_epoch=$(date -d "${days_ago} days ago 09:00:00" +%s)
    sim_date=$(date -d "@${base_epoch}" +"%Y-%m-%d")

    echo ""
    echo "[Sim] ${sim_date} (${days_ago} days ago): ${num_jumps} jumps, ${files_per_jump} files each"

    for (( j=0; j<num_jumps; j++ )); do
        offset=$(( j * 3600 ))
        create_jump "${base_epoch}" "${offset}" "${files_per_jump}"
    done
done

echo ""
echo "============================================================"
echo "Simulation ready. To test the pipeline, run:"
echo ""
echo "  ./scripts/test_pipeline.sh --photo-dir '${PHOTO_DIR}' --video-dir '${VIDEO_DIR}'"
echo "============================================================"

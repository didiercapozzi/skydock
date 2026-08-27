#!/usr/bin/env bash
set -eo pipefail

SIM_BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.sim"
CLEAN=false
DURATION=5
NUM_FILES=8
DEV_MODE=false

usage() {
    echo "Usage: $0 [--clean] [--output DIR] [--duration SEC] [--num-files N] [--dev-data]"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output)    SIM_BASE="$2"; shift 2 ;;
        --clean)     CLEAN=true; shift ;;
        --duration)  DURATION="$2"; shift 2 ;;
        --num-files) NUM_FILES="$2"; shift 2 ;;
        --dev-data)  DEV_MODE=true; shift ;;
        -h|--help)   usage ;;
        *)           echo "Unknown option: $1"; usage ;;
    esac
done

if $CLEAN && [[ -d "${SIM_BASE}" ]]; then
    rm -rf "${SIM_BASE}"
fi

CAMERA1_DIR="${SIM_BASE}/camera1"
CAMERA2_DIR="${SIM_BASE}/camera2"
mkdir -p "${CAMERA1_DIR}" "${CAMERA2_DIR}"

create_file() {
    local dir="$1"
    local name="$2"
    local epoch="$3"
    local path="${dir}/${name}"
    if command -v ffmpeg &>/dev/null; then
        ffmpeg -y -loglevel error \
            -f lavfi -i "testsrc=duration=${DURATION}:size=1920x1080:rate=30" \
            -f lavfi -i "sine=frequency=440:duration=${DURATION}" \
            -c:v libx264 -preset ultrafast -tune zerolatency \
            -c:a aac -shortest \
            "${path}" 2>/dev/null
    else
        dd if=/dev/urandom bs=1024 count=50 of="${path}" 2>/dev/null
    fi
    touch -d "@${epoch}" "${path}"
}

if $DEV_MODE; then
    DAY1_BASE=$(date -d "3 days ago 09:00:00" +%s)
    DAY2_BASE=$(date -d "2 days ago 10:00:00" +%s)
    OFFSETS_DAY1=(0 90 180 270 360 2760 2850 2940 3030 3120)
    OFFSETS_DAY2=(0 90 180 270 2970 3060 3150 3240)
    FILE_COUNTER=0
    IDX=0
    for off in "${OFFSETS_DAY1[@]}"; do
        FILE_COUNTER=$((FILE_COUNTER + 1))
        IDX=$((IDX + 1))
        epoch=$((DAY1_BASE + off))
        filename=$(printf "DJI_%04d.MP4" "${FILE_COUNTER}")
        if (( IDX % 2 == 1 )); then
            create_file "${CAMERA1_DIR}" "${filename}" "${epoch}"
        else
            create_file "${CAMERA2_DIR}" "${filename}" "${epoch}"
        fi
    done
    for off in "${OFFSETS_DAY2[@]}"; do
        FILE_COUNTER=$((FILE_COUNTER + 1))
        IDX=$((IDX + 1))
        epoch=$((DAY2_BASE + off))
        filename=$(printf "DJI_%04d.MP4" "${FILE_COUNTER}")
        if (( IDX % 2 == 1 )); then
            create_file "${CAMERA1_DIR}" "${filename}" "${epoch}"
        else
            create_file "${CAMERA2_DIR}" "${filename}" "${epoch}"
        fi
    done
    echo "[Sim] Created 18 files (10 on $(date -d "@${DAY1_BASE}" +%Y-%m-%d) in 2 jumps, 8 on $(date -d "@${DAY2_BASE}" +%Y-%m-%d) in 2 jumps) under ${SIM_BASE}"
    echo ""
    echo "Test with:"
    echo "  ./scripts/process_media.sh '${CAMERA1_DIR}' '${CAMERA2_DIR}'"
    echo "  ./scripts/watcher.sh --cam-dir '${CAMERA1_DIR}' --cam-dir '${CAMERA2_DIR}'"
    exit 0
fi

FILE_COUNTER=0
base_epoch=$(date -d "today 09:00:00" +%s)

for (( i=0; i<NUM_FILES; i++ )); do
    FILE_COUNTER=$((FILE_COUNTER + 1))
    file_epoch=$(( base_epoch + i * 30 ))
    filename=$(printf "DJI_%04d.MP4" "${FILE_COUNTER}")

    if command -v ffmpeg &>/dev/null; then
        ffmpeg -y -loglevel error \
            -f lavfi -i "testsrc=duration=${DURATION}:size=1920x1080:rate=30" \
            -f lavfi -i "sine=frequency=$(( 440 + i * 17 )):duration=${DURATION}" \
            -c:v libx264 -preset ultrafast -tune zerolatency \
            -c:a aac -shortest \
            "${CAMERA1_DIR}/${filename}" 2>/dev/null
    else
        dd if=/dev/urandom bs=1024 count=50 of="${CAMERA1_DIR}/${filename}" 2>/dev/null
    fi
    touch -d "@${file_epoch}" "${CAMERA1_DIR}/${filename}"

    FILE_COUNTER=$((FILE_COUNTER + 1))
    file_epoch=$(( base_epoch + i * 30 + 15 ))
    filename=$(printf "DJI_%04d.MP4" "${FILE_COUNTER}")

    if command -v ffmpeg &>/dev/null; then
        ffmpeg -y -loglevel error \
            -f lavfi -i "testsrc=duration=${DURATION}:size=1920x1080:rate=30" \
            -f lavfi -i "sine=frequency=$(( 440 + i * 17 + 5 )):duration=${DURATION}" \
            -c:v libx264 -preset ultrafast -tune zerolatency \
            -c:a aac -shortest \
            "${CAMERA2_DIR}/${filename}" 2>/dev/null
    else
        dd if=/dev/urandom bs=1024 count=50 of="${CAMERA2_DIR}/${filename}" 2>/dev/null
    fi
    touch -d "@${file_epoch}" "${CAMERA2_DIR}/${filename}"
done

echo "[Sim] Created ${NUM_FILES} files in each camera under ${SIM_BASE}"
echo ""
echo "Test with:"
echo "  ./scripts/process_media.sh '${CAMERA1_DIR}' '${CAMERA2_DIR}'"
echo "  ./scripts/watcher.sh --cam-dir '${CAMERA1_DIR}' --cam-dir '${CAMERA2_DIR}'"

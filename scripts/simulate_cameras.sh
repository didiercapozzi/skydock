#!/usr/bin/env bash
set -eo pipefail

SIM_BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.sim"
CLEAN=false
DURATION=5
NUM_FILES=8

usage() {
    echo "Usage: $0 [--clean] [--output DIR] [--duration SEC] [--num-files N]"
    exit 0
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output)    SIM_BASE="$2"; shift 2 ;;
        --clean)     CLEAN=true; shift ;;
        --duration)  DURATION="$2"; shift 2 ;;
        --num-files) NUM_FILES="$2"; shift 2 ;;
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

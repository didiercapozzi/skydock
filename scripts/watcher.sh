#!/usr/bin/env bash

# watcher.sh — Background daemon that polls for camera SD cards and triggers ingestion.
#
# Usage:
#   ./watcher.sh                  Normal mode: polls for real DJI cameras
#   ./watcher.sh --test           Test mode: uses simulated camera directories
#   ./watcher.sh --test --once    Test mode: run once then exit

TEST_MODE=false
RUN_ONCE=false
SIM_PHOTO_DIR=""
SIM_VIDEO_DIR=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --test)     TEST_MODE=true; shift ;;
        --once)     RUN_ONCE=true; shift ;;
        --photo-dir) SIM_PHOTO_DIR="$2"; shift 2 ;;
        --video-dir) SIM_VIDEO_DIR="$2"; shift 2 ;;
        *)          echo "Unknown option: $1"; exit 1 ;;
    esac
done

MOUNT_BASE="/mnt/dji"
PHOTO_MOUNT="${MOUNT_BASE}/photo"
VIDEO_MOUNT="${MOUNT_BASE}/video"

mkdir -p "${PHOTO_MOUNT}" "${VIDEO_MOUNT}"

cleanup_mounts() {
    for m in "${PHOTO_MOUNT}" "${VIDEO_MOUNT}"; do
        if mountpoint -q "$m" 2>/dev/null; then
            umount -l "$m" 2>/dev/null || true
        fi
    done
}
trap cleanup_mounts EXIT

# ─── Test mode: use simulated camera directories ──────────────

if $TEST_MODE; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
    SIM_BASE="${PROJECT_ROOT}/.sim"

    # Auto-generate simulated cameras if directories not provided
    if [ -z "${SIM_PHOTO_DIR}" ] || [ -z "${SIM_VIDEO_DIR}" ]; then
        echo "[Watcher] Test mode: generating simulated cameras..."
        "${SCRIPT_DIR}/simulate_cameras.sh" --output "${SIM_BASE}" --jumps 3 --clean
        SIM_PHOTO_DIR="${SIM_BASE}/photo_cam"
        SIM_VIDEO_DIR="${SIM_BASE}/video_cam"
    fi

    echo "[Watcher] Test mode active."
    echo "  Photo camera: ${SIM_PHOTO_DIR}"
    echo "  Video camera: ${SIM_VIDEO_DIR}"

    PHOTO_PATH="${SIM_PHOTO_DIR}"
    VIDEO_PATH="${SIM_VIDEO_DIR}"

    if $RUN_ONCE; then
        echo "[Watcher] Test mode (single run): processing once..."
        /app/scripts/process_media.sh "${PHOTO_PATH}" "${VIDEO_PATH}" || true
        echo "[Watcher] Test run complete."
    else
        echo "[Watcher] Test mode daemon active. Processing simulated cameras every 8s..."
        while true; do
            /app/scripts/process_media.sh "${PHOTO_PATH}" "${VIDEO_PATH}" || true
            sleep 8
        done
    fi
    exit 0
fi

# ─── Production mode: poll for real DJI cameras ───────────────

find_and_mount() {
    local label="$1"
    local mount_target="$2"

    # Check if host already mounted it under /media
    local dev_node
    dev_node=$(blkid -L "${label}" 2>/dev/null || true)
    
    if [ -z "${dev_node}" ]; then
        return 1
    fi

    local host_mount
    host_mount=$(lsblk -no MOUNTPOINTS "${dev_node}" 2>/dev/null | grep -E '^/media' | head -n1 || true)
    
    if [ -n "${host_mount}" ] && [ -d "${host_mount}" ]; then
        echo "${host_mount}"
        return 0
    fi

    # Check if already mounted by container
    if mountpoint -q "${mount_target}" 2>/dev/null; then
        echo "${mount_target}"
        return 0
    fi

    # Fallback: Mount raw block device directly
    if [ -b "${dev_node}" ]; then
        if mount -o ro "${dev_node}" "${mount_target}" 2>/dev/null; then
            echo "${mount_target}"
            return 0
        fi
    fi

    return 1
}

echo "[Watcher] Daemon active. Waiting for camera dock connections..."

while true; do
    PHOTO_PATH=$(find_and_mount "${CAM_PHOTO_LABEL}" "${PHOTO_MOUNT}" || true)
    VIDEO_PATH=$(find_and_mount "${CAM_VIDEO_LABEL}" "${VIDEO_MOUNT}" || true)

    # Trigger processing if at least one camera is connected
    if [ -n "${PHOTO_PATH}" ] || [ -n "${VIDEO_PATH}" ]; then
        /app/scripts/process_media.sh "${PHOTO_PATH}" "${VIDEO_PATH}" || true
    fi

    sleep 8
done

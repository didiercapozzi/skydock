#!/usr/bin/env bash

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

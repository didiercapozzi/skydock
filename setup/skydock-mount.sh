#!/usr/bin/env bash
set -eo pipefail

# skydock-mount — Auto-mount USB storage to /media/skydock/<label>
# Called by udev when a block device with a filesystem appears.

DEVNAME="${DEVNAME:?}"
LABEL="${ID_FS_LABEL:}"
SERIAL="${ID_SERIAL_SHORT:-${ID_SERIAL:-unknown}}"
MOUNT_BASE="/media/skydock"

if [[ -z "${LABEL}" ]]; then
    LABEL="cam-${SERIAL}"
fi

MOUNT_POINT="${MOUNT_BASE}/${LABEL}"

mkdir -p "${MOUNT_POINT}"

# Try to mount; if device is already mounted, udev handles it
if ! mountpoint -q "${MOUNT_POINT}"; then
    mount -o "uid=$(id -u skydock 2>/dev/null || echo 1000),gid=$(id -g skydock 2>/dev/null || echo 1000),rw,noauto,nofail" \
        "${DEVNAME}" "${MOUNT_POINT}" 2>/dev/null || true
fi

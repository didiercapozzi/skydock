#!/usr/bin/env bash
set -eo pipefail

# install-skydock-udev.sh — Install udev rule for auto-mounting cameras to /media/skydock/
# Run once with sudo: sudo ./setup/install-skydock-udev.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES_FILE="${SCRIPT_DIR}/99-skydock-cameras.rules"
MOUNT_SCRIPT="/usr/local/bin/skydock-mount"

echo "SkyDock — Installing udev auto-mount rule..."

# Install mount script
install -m 755 "${SCRIPT_DIR}/skydock-mount.sh" "${MOUNT_SCRIPT}"
echo "  Installed ${MOUNT_SCRIPT}"

# Create mount base directory
mkdir -p /media/skydock
echo "  Created /media/skydock/"

# Install udev rule
cp "${RULES_FILE}" /etc/udev/rules.d/99-skydock-cameras.rules
echo "  Installed /etc/udev/rules.d/99-skydock-cameras.rules"

# Reload udev rules
udevadm control --reload-rules
udevadm trigger
echo "  Reloaded udev rules"

echo ""
echo "Done! Cameras will now auto-mount to /media/skydock/<label> when plugged in."
echo "Start SkyDock with: docker compose up -d"

#!/usr/bin/env bash
set -eo pipefail

MANIFEST="${1:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/camera_files}"

if [[ -z "${MANIFEST}" ]]; then
    MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"
fi

if [[ ! -f "${MANIFEST}" ]]; then
    echo "[Execute] ERROR: Manifest not found: ${MANIFEST}" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CAMERA_DIRS=()
while IFS= read -r path; do
    [[ -d "${path}" ]] && CAMERA_DIRS+=("${path}")
done < <(jq -r '.cameras[].path' "${MANIFEST}" 2>/dev/null)

if [[ ${#CAMERA_DIRS[@]} -eq 0 ]]; then
    echo "[Execute] No camera directories found in manifest."
    exit 1
fi

echo "[Execute] Copying files from ${#CAMERA_DIRS[@]} camera(s)..."
"${SCRIPT_DIR}/process_media.sh" "${CAMERA_DIRS[@]}"

TMP_MANIFEST=$(mktemp)
jq '.status = "executed"' "${MANIFEST}" > "${TMP_MANIFEST}"
mv "${TMP_MANIFEST}" "${MANIFEST}"

echo "[Execute] Done."

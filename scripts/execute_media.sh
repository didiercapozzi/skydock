#!/usr/bin/env bash
set -eo pipefail

MANIFEST="${1:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
PROCESSED_DIR="${OUTPUT_DIR}/processed"

if [[ -z "${MANIFEST}" ]]; then
    MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"
fi

if [[ ! -f "${MANIFEST}" ]]; then
    echo "[Execute] ERROR: Manifest not found: ${MANIFEST}" >&2
    exit 1
fi

mkdir -p "${PROCESSED_DIR}"

CONFIRMED=$(jq -r '.jumps[] | select(.confirmed == true) | .id' "${MANIFEST}" 2>/dev/null)

if [[ -z "${CONFIRMED}" ]]; then
    echo "[Execute] No confirmed jumps found."
    exit 0
fi

copied=0
for jump_id in $CONFIRMED; do
    jump_dir="${PROCESSED_DIR}/${jump_id}"
    mkdir -p "${jump_dir}"

    jq -r --arg id "${jump_id}" \
        '.jumps[] | select(.id == $id) | .files[].path' "${MANIFEST}" | while IFS= read -r filepath; do
        if [[ -f "${filepath}" ]]; then
            cp --update=none "${filepath}" "${jump_dir}/"
            copied=$((copied + 1))
        fi
    done

    echo "[Execute] ${jump_id}: copied files to ${jump_dir}"
done

TMP_MANIFEST=$(mktemp)
jq '.status = "executed"' "${MANIFEST}" > "${TMP_MANIFEST}"
mv "${TMP_MANIFEST}" "${MANIFEST}"

echo "[Execute] Done. Copied ${copied} file(s)."

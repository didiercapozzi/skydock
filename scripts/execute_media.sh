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

JUMP_IDS=()
if [[ $# -gt 1 ]]; then
    for arg in "${@:2}"; do
        JUMP_IDS+=("${arg}")
    done
else
    while IFS= read -r line; do
        [[ -n "${line}" ]] && JUMP_IDS+=("${line}")
    done < <(jq -r '.jumps[] | select(.confirmed == true and .processed != true) | .id' "${MANIFEST}" 2>/dev/null)
fi

if [[ ${#JUMP_IDS[@]} -eq 0 ]]; then
    echo "[Execute] No confirmed unprocessed jumps found."
    exit 0
fi

copied=0
for jump_id in "${JUMP_IDS[@]}"; do
    jump_dir="${PROCESSED_DIR}/${jump_id}"
    mkdir -p "${jump_dir}"
    count=0
    while IFS= read -r filepath; do
        if [[ -f "${filepath}" ]]; then
            cp -p --update=none "${filepath}" "${jump_dir}/"
            copied=$((copied + 1))
            count=$((count + 1))
        fi
    done < <(jq -r --arg id "${jump_id}" '.jumps[] | select(.id == $id) | .files[].path' "${MANIFEST}" 2>/dev/null)
    echo "[Execute] ${jump_id}: copied ${count} file(s) to ${jump_dir}"
done

echo "[Execute] Done. Copied ${copied} file(s)."

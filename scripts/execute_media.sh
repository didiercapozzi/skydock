#!/usr/bin/env bash
set -eo pipefail

# execute_media.sh — Phase 3: Execute confirmed jump manifest
#
# Reads a confirmed proposed_jumps.json and performs the actual file operations:
# folder creation, photo extraction, video copying, registry updates.
#
# Usage:
#   ./execute_media.sh [manifest_path]
#
# If no manifest path is given, reads from $SKYDOCK_OUTPUT_DIR/proposed_jumps.json

MANIFEST="${1:-}"
OUTPUT_DIR="${SKYDOCK_OUTPUT_DIR:-/workspace/output}"
REGISTRY_FILE="${OUTPUT_DIR}/.ingested_registry.txt"
PROCESSING_FILE="${OUTPUT_DIR}/.processing"
PHOTO_FPS=${PHOTO_FPS:-2}
JPEG_QUALITY=${JPEG_QUALITY:-2}

if [[ -z "${MANIFEST}" ]]; then
    MANIFEST="${OUTPUT_DIR}/proposed_jumps.json"
fi

if [[ ! -f "${MANIFEST}" ]]; then
    echo "[Execute] ERROR: Manifest not found: ${MANIFEST}" >&2
    echo "[Execute] Run scan_media.sh first to generate a manifest." >&2
    exit 1
fi

# Validate manifest status
STATUS=$(python3 -c "import json,sys; print(json.load(open('${MANIFEST}'))['status'])" 2>/dev/null || echo "")
if [[ "${STATUS}" != "confirmed" ]]; then
    echo "[Execute] ERROR: Manifest status is '${STATUS}', expected 'confirmed'." >&2
    echo "[Execute} Use the web UI to review and confirm the manifest before executing." >&2
    exit 1
fi

touch "${REGISTRY_FILE}"
echo "processing" > "${PROCESSING_FILE}"
trap 'rm -f "${PROCESSING_FILE}"' EXIT

# ─── Parse manifest and execute jumps ─────────────────────────
JUMP_COUNT=$(python3 -c "import json; print(len(json.load(open('${MANIFEST}'))['jumps']))" 2>/dev/null || echo "0")
DATE=$(python3 -c "import json; print(json.load(open('${MANIFEST}'))['date'])" 2>/dev/null || date +%Y-%m-%d)
DATE_DIR="${OUTPUT_DIR}/${DATE}"
mkdir -p "${DATE_DIR}"

echo "[Execute] Processing ${JUMP_COUNT} confirmed jump(s) for ${DATE}..."

# Extract theory files first (before jumps)
THEORY_COUNT=$(python3 -c "import json; print(len(json.load(open('${MANIFEST}'))['theory']))" 2>/dev/null || echo "0")

if [[ "${THEORY_COUNT}" -gt 0 ]]; then
    echo "[Execute] Processing ${THEORY_COUNT} theory file(s)..."
    THEORY_DIR=$(mktemp -d)
    trap 'rm -f "${PROCESSING_FILE}" "${THEORY_DIR}" 2>/dev/null' EXIT

    python3 -c "
import json, sys
manifest = json.load(open('${MANIFEST}'))
for f in manifest['theory']:
    print(f['path'])
" | while IFS= read -r filepath; do
        [[ -f "${filepath}" ]] || continue
        filename=$(basename "${filepath}")

        if [[ "${filename}" =~ [Tt][Hh][Ee][Oo][Rr][Yy] ]]; then
            # Theory video — copy to theory dir
            cp -an "${filepath}" "${THEORY_DIR}/${filename}" 2>/dev/null || true
            echo "VIDEO:${filename}:$(stat -c %s "${filepath}"):$(stat -c %Y "${filepath}")" >> "${REGISTRY_FILE}"
        fi
    done
fi

# Process each jump
for (( j=0; j<JUMP_COUNT; j++ )); do
    JUMP_LABEL=$(python3 -c "
import json
m = json.load(open('${MANIFEST}'))
print(m['jumps'][${j}]['label'])
" 2>/dev/null)

    JUMP_CONFIRMED=$(python3 -c "
import json
m = json.load(open('${MANIFEST}'))
print(str(m['jumps'][${j}]['confirmed']).lower())
" 2>/dev/null)

    if [[ "${JUMP_CONFIRMED}" != "true" ]]; then
        echo "[Execute] Skipping '${JUMP_LABEL}' (not confirmed)."
        continue
    fi

    # Sanitize label for directory name
    SAFE_NAME=$(echo "${JUMP_LABEL}" | sed 's/[^a-zA-Z0-9 _-]//g' | tr ' ' '_')
    JUMP_DIR="${DATE_DIR}/${SAFE_NAME}"
    PHOTOS_DIR="${JUMP_DIR}/photos"
    VIDEOS_DIR="${JUMP_DIR}/videos"
    mkdir -p "${PHOTOS_DIR}" "${VIDEOS_DIR}"

    echo "[Execute] Processing '${JUMP_LABEL}'..."

    # Get file count for this jump
    FILE_COUNT=$(python3 -c "
import json
m = json.load(open('${MANIFEST}'))
print(len(m['jumps'][${j}]['files']))
" 2>/dev/null)

    for (( f=0; f<FILE_COUNT; f++ )); do
        FILE_PATH=$(python3 -c "
import json
m = json.load(open('${MANIFEST}'))
print(m['jumps'][${j}]['files'][${f}]['path'])
" 2>/dev/null)

        FILE_CAMERA=$(python3 -c "
import json
m = json.load(open('${MANIFEST}'))
print(m['jumps'][${j}]['files'][${f}]['camera'])
" 2>/dev/null)

        FILE_SIZE=$(python3 -c "
import json
m = json.load(open('${MANIFEST}'))
print(m['jumps'][${j}]['files'][${f}]['size'])
" 2>/dev/null)

        FILE_MTIME=$(python3 -c "
import json
m = json.load(open('${MANIFEST}'))
print(m['jumps'][${j}]['files'][${f}]['mtime'])
" 2>/dev/null)

        FILE_NAME=$(python3 -c "
import json
m = json.load(open('${MANIFEST}'))
print(m['jumps'][${j}]['files'][${f}]['filename'])
" 2>/dev/null)

        [[ -f "${FILE_PATH}" ]] || continue

        FILE_ID="${FILE_CAMERA}:${FILE_NAME}:${FILE_SIZE}:${FILE_MTIME}"

        # Skip if already processed
        if grep -Fqx "${FILE_ID}" "${REGISTRY_FILE}" 2>/dev/null; then
            continue
        fi

        BASENAME="${FILE_NAME%.*}"

        if [[ "${FILE_CAMERA}" == "PHOTO" ]]; then
            echo "  [Extract] ${FILE_NAME} -> ${SAFE_NAME}/photos/..."
            ffmpeg -nostdin -loglevel error -stats -i "${FILE_PATH}" \
                -vf "fps=${PHOTO_FPS}" \
                -q:v "${JPEG_QUALITY}" \
                "${PHOTOS_DIR}/${BASENAME}_frame_%04d.jpg"
        else
            echo "  [Copy] ${FILE_NAME} -> ${SAFE_NAME}/videos/..."
            cp -an "${FILE_PATH}" "${VIDEOS_DIR}/${FILE_NAME}"
        fi

        echo "${FILE_ID}" >> "${REGISTRY_FILE}"
    done

    # Copy theory files to this jump if any
    if [[ "${THEORY_COUNT}" -gt 0 && -d "${THEORY_DIR}" ]]; then
        cp -an "${THEORY_DIR}"/* "${VIDEOS_DIR}/" 2>/dev/null || true
    fi
done

# Cleanup theory temp dir
[[ -d "${THEORY_DIR:-}" ]] && rm -rf "${THEORY_DIR}"

# Mark manifest as executed
python3 -c "
import json
m = json.load(open('${MANIFEST}'))
m['status'] = 'executed'
json.dump(m, open('${MANIFEST}', 'w'), indent=2)
"

sync
echo "[Done] Execution complete for ${DATE}."

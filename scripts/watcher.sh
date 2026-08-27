#!/usr/bin/env bash

TEST_MODE=false
RUN_ONCE=false
declare -a CAM_DIRS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --test)     TEST_MODE=true; shift ;;
        --once)     RUN_ONCE=true; shift ;;
        --cam-dir)  CAM_DIRS+=("$2"); shift 2 ;;
        *)          echo "Unknown option: $1"; exit 1 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if $TEST_MODE; then
    SIM_BASE="${PROJECT_ROOT}/.sim"
    SIM_OUTPUT="${PROJECT_ROOT}/camera_files"

    if [[ ${#CAM_DIRS[@]} -eq 0 ]]; then
        echo "[Watcher] Test mode: generating simulated cameras..."
        "${SCRIPT_DIR}/simulate_cameras.sh" --output "${SIM_BASE}" --clean
        CAM_DIRS=("${SIM_BASE}/camera1" "${SIM_BASE}/camera2")
    fi

    echo "[Watcher] Test mode. Cameras: ${CAM_DIRS[*]}"
    export SKYDOCK_OUTPUT_DIR="${SIM_OUTPUT}"

    if $RUN_ONCE; then
        "${SCRIPT_DIR}/process_media.sh" "${CAM_DIRS[@]}" || true
    else
        while true; do
            "${SCRIPT_DIR}/process_media.sh" "${CAM_DIRS[@]}" || true
            sleep 8
        done
    fi
    exit 0
fi

has_media_files() {
    find "$1" -maxdepth 4 -type f \( \
        -iname "*.mp4" -o -iname "*.mov" -o \
        -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.dng" \
    \) -print -quit 2>/dev/null | grep -q .
}

find_camera_root() {
    local dir="$1"
    local base="$2"
    local root="${dir}"
    while true; do
        local parent
        parent=$(dirname "${root}")
        if [[ "${parent}" == "${base}" ]] || [[ "${parent}" == "/" ]]; then
            break
        fi
        if has_media_files "${parent}"; then
            root="${parent}"
        else
            break
        fi
    done
    echo "${root}"
}

find_cameras() {
    local base="$1"
    local -a cameras=()
    while IFS= read -r dir; do
        if has_media_files "${dir}"; then
            local root
            root=$(find_camera_root "${dir}" "${base}")
            local is_duplicate=false
            for existing in "${cameras[@]}"; do
                if [[ "${existing}" == "${root}" ]]; then
                    is_duplicate=true
                    break
                fi
            done
            if ! $is_duplicate; then
                cameras+=("${root}")
            fi
        fi
    done < <(find "${base}" -mindepth 1 -maxdepth 5 -type d 2>/dev/null)
    printf '%s\n' "${cameras[@]}"
}

resolve_cameras() {
    local -a cameras=()

    if [[ ${#CAM_DIRS[@]} -gt 0 ]]; then
        for dir in "${CAM_DIRS[@]}"; do
            [[ -d "${dir}" ]] && cameras+=("${dir}")
        done
        if [[ ${#cameras[@]} -gt 0 ]]; then
            printf '%s\n' "${cameras[@]}"
            return
        fi
    fi

    for base in /media/skydock /media/"${USER:-root}" /media /mnt /run/media/"${USER:-root}"; do
        [[ -d "${base}" ]] || continue
        while IFS= read -r cam; do
            [[ -n "${cam}" ]] && cameras+=("${cam}")
        done < <(find_cameras "${base}")
        if [[ ${#cameras[@]} -gt 0 ]]; then
            printf '%s\n' "${cameras[@]}"
            return
        fi
    done
}

echo "[Watcher] Daemon active. Waiting for camera connections..."

while true; do
    IFS=$'\n' read -r -a FOUND_CAMERAS <<< "$(resolve_cameras)"

    if [[ ${#FOUND_CAMERAS[@]} -gt 0 ]]; then
        "${SCRIPT_DIR}/process_media.sh" "${FOUND_CAMERAS[@]}" || true
    fi

    sleep 8
done

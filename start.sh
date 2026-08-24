#!/bin/bash
set -eo pipefail

SKYDOCK_VERSION="1.0.0"
VERSION_FILE="$HOME/.skydock-version"
REPO_URL="https://api.github.com/repos/OWNER/skydock/releases/latest"

usage() {
  echo ""
  echo "  SkyDock - Tandem Jump Media Manager"
  echo "  ==================================="
  echo ""
  echo "  Usage: $0 [OPTIONS]"
  echo ""
  echo "  Options:"
  echo "    --update       Check for and install updates"
  echo "    --version      Print version and exit"
  echo "    --docker       Run via Docker (legacy mode)"
  echo "    --help         Show this help"
  echo ""
}

get_installed_version() {
  if [[ -f "${VERSION_FILE}" ]]; then
    cat "${VERSION_FILE}"
  else
    echo "${SKYDOCK_VERSION}"
  fi
}

set_installed_version() {
  echo "$1" > "${VERSION_FILE}"
}

check_update() {
  echo "[Update] Checking for latest version..."

  local latest_version
  latest_version=$(curl -sL "${REPO_URL}" | grep '"tag_name"' | head -1 | cut -d'"' -f4)

  if [[ -z "${latest_version}" ]]; then
    echo "[Update] Could not fetch latest version."
    return 1
  fi

  local current_version
  current_version=$(get_installed_version)

  echo "[Update] Current: ${current_version}"
  echo "[Update] Latest:  ${latest_version}"

  if [[ "${current_version}" == "${latest_version}" ]]; then
    echo "[Update] Already up to date."
    return 0
  fi

  echo "[Update] New version available! Downloading..."

  local platform
  platform=$(uname -s)
  local arch
  arch=$(uname -m)

  local download_url=""
  case "${platform}" in
    Darwin)
      if [[ "${arch}" == "arm64" ]]; then
        download_url=$(curl -sL "${REPO_URL}" | grep -o '"browser_download_url":.*arm64.dmg"' | head -1 | cut -d'"' -f4)
      else
        download_url=$(curl -sL "${REPO_URL}" | grep -o '"browser_download_url":.*x64.dmg"' | head -1 | cut -d'"' -f4)
      fi
      ;;
    Linux)
      download_url=$(curl -sL "${REPO_URL}" | grep -o '"browser_download_url":.*AppImage"' | head -1 | cut -d'"' -f4)
      ;;
    MINGW*|MSYS*|CYGWIN*)
      download_url=$(curl -sL "${REPO_URL}" | grep -o '"browser_download_url":.*x64.exe"' | head -1 | cut -d'"' -f4)
      ;;
  esac

  if [[ -z "${download_url}" ]]; then
    echo "[Update] No download available for this platform."
    return 1
  fi

  echo "[Update] Downloading from: ${download_url}"
  local tmp_file
  tmp_file=$(mktemp)

  curl -L -o "${tmp_file}" "${download_url}"

  echo "[Update] Installing update..."
  chmod +x "${tmp_file}"

  case "${platform}" in
    Darwin)
      echo "[Update] Please open the downloaded .dmg to install."
      open "${tmp_file}"
      ;;
    Linux)
      echo "[Update] Running AppImage..."
      "${tmp_file}" &
      set_installed_version "${latest_version}"
      exit 0
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "[Update] Please run the downloaded .exe installer."
      explorer "${tmp_file}"
      ;;
  esac

  set_installed_version "${latest_version}"
  return 0
}

run_electron() {
  echo "Starting SkyDock (Electron)..."

  if [[ ! -f "package.json" ]]; then
    echo "Error: Must be run from the project root directory."
    exit 1
  fi

  if [[ ! -d "node_modules" ]]; then
    echo "Installing dependencies..."
    npm install
  fi

  if [[ ! -d "build" ]]; then
    echo "Building app..."
    npm run build
  fi

  npm run electron:dev
}

run_docker() {
  echo "Starting SkyDock (Docker)..."
  mkdir -p output

  echo ""
  echo "SkyDock will be available at http://localhost:3000"
  echo ""

  if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000"
  elif command -v open &> /dev/null; then
    open "http://localhost:3000"
  fi

  docker compose up --build
}

main() {
  local mode="electron"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --update)
        check_update
        exit $?
        ;;
      --version)
        echo "SkyDock $(get_installed_version)"
        exit 0
        ;;
      --docker)
        mode="docker"
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done

  case "${mode}" in
    electron) run_electron ;;
    docker)   run_docker ;;
  esac
}

main "$@"

#!/bin/bash
# Tomo Installer
# Usage: curl -sSL https://get.tomo.dev | sh
#
# Installs Docker + Node.js if missing, then installs the tomo .deb package.
set -euo pipefail

TOMO_VERSION="${TOMO_VERSION:-latest}"
GITHUB_REPO="cbabil/tomo"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Checks ---

check_root() {
  [ "$(id -u)" -eq 0 ] || error "Run as root: sudo sh install.sh"
}

check_os() {
  if ! command -v apt-get >/dev/null 2>&1; then
    error "This installer requires a Debian-based system (Ubuntu, Debian, etc.)"
  fi
  if [ -f /etc/os-release ]; then
    success "OS: $(. /etc/os-release && echo "${PRETTY_NAME}")"
  fi
}

detect_arch() {
  case "$(uname -m)" in
    x86_64)  ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    *)       error "Unsupported architecture: $(uname -m)" ;;
  esac
  success "Architecture: ${ARCH}"
}

# --- Dependencies ---

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    success "Docker already installed"
    return
  fi
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  success "Docker installed"
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    success "Node.js $(node --version) already installed"
    return
  fi
  info "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
  success "Node.js $(node --version) installed"
}

# --- Install ---

install_tomo() {
  # Resolve "latest" to an actual version
  if [ "${TOMO_VERSION}" = "latest" ]; then
    info "Resolving latest version..."
    TOMO_VERSION=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
      | grep '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/') \
      || error "Could not resolve latest version"
    info "Latest version: ${TOMO_VERSION}"
  fi

  local deb_url="https://github.com/${GITHUB_REPO}/releases/download/v${TOMO_VERSION}/tomo_${TOMO_VERSION}_${ARCH}.deb"
  local tmp_deb
  tmp_deb="$(mktemp /tmp/tomo-XXXXXX.deb)"
  trap "rm -f '${tmp_deb}'" EXIT

  info "Downloading tomo ${TOMO_VERSION}..."
  curl -fsSL "${deb_url}" -o "${tmp_deb}" || error "Download failed. Check version and architecture."

  info "Installing tomo..."
  apt-get install -y "${tmp_deb}"
  rm -f "${tmp_deb}"
  trap - EXIT
  success "tomo package installed"
}

wait_for_health() {
  info "Waiting for Tomo to start..."
  local retries=30
  while [ "${retries}" -gt 0 ]; do
    if curl -sf http://localhost/health >/dev/null 2>&1; then
      success "Tomo is running!"
      return
    fi
    retries=$((retries - 1))
    sleep 2
  done
  warn "Health check timed out. Check: journalctl -u tomod -f"
}

print_success() {
  local ip
  ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
  echo ""
  echo -e "${GREEN}Tomo installed successfully!${NC}"
  echo -e "Open ${BLUE}http://${ip}${NC} to create your admin account."
  echo ""
}

# --- Main ---

main() {
  echo ""
  echo -e "${BLUE}Tomo Installer${NC}"
  echo ""
  check_root
  check_os
  detect_arch
  install_docker
  install_node
  install_tomo
  wait_for_health
  print_success
}

main "$@"

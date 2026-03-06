#!/bin/bash
# Build a .deb package for Tomo
# Usage: ./packaging/build-deb.sh [--arch amd64|arm64]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"

# Default architecture
ARCH="amd64"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch) ARCH="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ "${ARCH}" != "amd64" && "${ARCH}" != "arm64" ]]; then
  echo "Error: --arch must be amd64 or arm64"
  exit 1
fi

# Read version from root package.json
VERSION=$(node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('${PROJECT_ROOT}/package.json','utf8')); console.log(p.version)")
echo "Building tomo ${VERSION} for ${ARCH}"

PKG_NAME="tomo_${VERSION}_${ARCH}"
STAGE="${BUILD_DIR}/${PKG_NAME}"

# Clean previous build
rm -rf "${STAGE}"
mkdir -p "${STAGE}"

# --- Build step ---
echo "Installing workspace dependencies..."
cd "${PROJECT_ROOT}"
bun install --ignore-scripts

echo "Building tomod..."
cd "${PROJECT_ROOT}/packages/tomod"
bun run build

echo "Building UI..."
cd "${PROJECT_ROOT}/packages/ui"
bun run build

# --- Stage files ---
echo "Staging package files..."

# /opt/tomo/dist/ — compiled tomod JS
mkdir -p "${STAGE}/opt/tomo/dist"
cp -r "${PROJECT_ROOT}/packages/tomod/dist/"* "${STAGE}/opt/tomo/dist/"

# /opt/tomo/public/ — UI static files
mkdir -p "${STAGE}/opt/tomo/public"
cp -r "${PROJECT_ROOT}/packages/ui/dist/"* "${STAGE}/opt/tomo/public/"

# /opt/tomo/package.json — for production deps
cp "${PROJECT_ROOT}/packages/tomod/package.json" "${STAGE}/opt/tomo/package.json"

# /opt/tomo/node_modules/ — production dependencies only
echo "Installing production dependencies..."
cd "${STAGE}/opt/tomo"
bun install --production --ignore-scripts
cd "${PROJECT_ROOT}"

# --- Build native modules for Linux target ---
# /opt/tomo/VERSION
echo "${VERSION}" > "${STAGE}/opt/tomo/VERSION"

# /etc/systemd/system/tomod.service
mkdir -p "${STAGE}/etc/systemd/system"
cp "${SCRIPT_DIR}/debian/tomod.service" "${STAGE}/etc/systemd/system/tomod.service"

# --- DEBIAN control files ---
mkdir -p "${STAGE}/DEBIAN"

cat > "${STAGE}/DEBIAN/control" <<EOF
Package: tomo
Version: ${VERSION}
Section: admin
Priority: optional
Architecture: ${ARCH}
Maintainer: Christophe Babilotte <christophe@babilotte.dev>
Description: Tomo — self-hosted app platform
 Tomo is a self-hosted app platform with an Umbrel-inspired desktop experience.
 It runs as a systemd service, manages Docker containers for apps, and serves
 a React-based web UI for administration.
Depends: nodejs (>= 18), docker-ce | docker.io, git, openssl
Recommends: docker-compose-plugin
Homepage: https://github.com/cbabil/tomo
EOF

# Copy maintainer scripts
cp "${SCRIPT_DIR}/debian/postinst" "${STAGE}/DEBIAN/postinst"
cp "${SCRIPT_DIR}/debian/prerm"    "${STAGE}/DEBIAN/prerm"
cp "${SCRIPT_DIR}/debian/postrm"   "${STAGE}/DEBIAN/postrm"
chmod 755 "${STAGE}/DEBIAN/postinst" "${STAGE}/DEBIAN/prerm" "${STAGE}/DEBIAN/postrm"

# --- Build .deb ---
echo "Building .deb package..."
dpkg-deb --root-owner-group --build "${STAGE}" "${BUILD_DIR}/${PKG_NAME}.deb"

echo ""
echo "Package built: ${BUILD_DIR}/${PKG_NAME}.deb"
echo ""
echo "Verify with:"
echo "  dpkg-deb --info ${BUILD_DIR}/${PKG_NAME}.deb"
echo "  dpkg-deb --contents ${BUILD_DIR}/${PKG_NAME}.deb"

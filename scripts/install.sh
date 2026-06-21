#!/usr/bin/env sh
# DevLens CLI installer (macOS / Linux) — downloads a prebuilt standalone binary.
# No node, no bun required.
#
#   curl -fsSL https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.sh | sh
#
# Overridable: DEVLENS_REPO, DEVLENS_VERSION (e.g. v0.3.0), DEVLENS_INSTALL_DIR
set -eu

REPO="${DEVLENS_REPO:-devlensio/devlensOSS}"
VERSION="${DEVLENS_VERSION:-latest}"
INSTALL_DIR="${DEVLENS_INSTALL_DIR:-$HOME/.devlens/bin}"

os="$(uname -s)"
case "$os" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *) echo "devlens: unsupported OS '$os'"; exit 1 ;;
esac

arch="$(uname -m)"
case "$arch" in
  x86_64|amd64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) echo "devlens: unsupported architecture '$arch'"; exit 1 ;;
esac

ASSET="devlens-${OS}-${ARCH}"
if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
fi

echo "devlens: downloading ${ASSET} (${VERSION})"
mkdir -p "$INSTALL_DIR"
curl -fsSL "$URL" -o "$INSTALL_DIR/devlens"
chmod +x "$INSTALL_DIR/devlens"

echo "devlens: installed to $INSTALL_DIR/devlens"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) : ;;
  *) echo "devlens: add it to your PATH:  export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
esac
echo "devlens: run 'devlens doctor' to verify your environment."

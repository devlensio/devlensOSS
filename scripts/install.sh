#!/usr/bin/env sh
# DevLens CLI installer (macOS / Linux) — downloads a prebuilt standalone binary.
# No node, no bun required.
#
#   curl -fsSL https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.sh | sh
#
# Overridable:
#   DEVLENS_REPO          upstream repo (default devlensio/devlensOSS)
#   DEVLENS_VERSION       release tag, e.g. v0.5.1 (default latest)
#   DEVLENS_INSTALL_DIR   install dir (default $HOME/.devlens/bin)
#   DEVLENS_NO_PATH       set to 1 to skip automatically adding to your PATH
set -eu

# ════════════════════════════════════════════════════════════════════════════
#  ANSI helpers — degrade gracefully when not a TTY or on exotic terminals.
# ════════════════════════════════════════════════════════════════════════════
if [ -t 1 ] && [ -n "${TERM:-}" ] && [ "$TERM" != "dumb" ]; then
  RST="\033[0m"; BLD="\033[1m"; DIM="\033[2m"
  GRN="\033[32m"; RED="\033[31m"; YLW="\033[33m"; CYN="\033[36m"
else
  RST=""; BLD=""; DIM=""; GRN=""; RED=""; YLW=""; CYN=""
fi

say()  { printf '%b  %b\n' "$GRN" "  $*$RST"; }
warn() { printf '%b  %b\n' "$YLW" "  $*$RST"; }
err()  { printf '%b  %b\n' "$RED" "  $*$RST" >&2; }
dim()  { printf '%b  %b\n' "$DIM" "  $*$RST"; }
line() { printf '%b\n' "$*"; }

# ════════════════════════════════════════════════════════════════════════════
#  Config
# ════════════════════════════════════════════════════════════════════════════
REPO="${DEVLENS_REPO:-devlensio/devlensOSS}"
VERSION="${DEVLENS_VERSION:-latest}"
INSTALL_DIR="${DEVLENS_INSTALL_DIR:-$HOME/.devlens/bin}"
AUTO_PATH="${DEVLENS_NO_PATH:-0}"

# ════════════════════════════════════════════════════════════════════════════
#  Fail fast with a friendly, actionable message (cleared right before success).
# ════════════════════════════════════════════════════════════════════════════
fail() {
  # Prevent the EXIT trap from firing a second "Installation failed" on exit.
  trap - EXIT 2>/dev/null || true
  err ""
  err "  ${RED}Installation failed.${RST}"
  err "        $1"
  err ""
  err "  If this keeps happening, open an issue with the output above:"
  err "     https://github.com/devlensio/devlensOSS/issues"
  err "  Or grab a binary directly:"
  err "     https://github.com/devlensio/devlensOSS/releases"
  exit 1
}
trap 'fail "unexpected error on line $LINENO (re-run with \`sh -x\` to trace)"' EXIT

# ════════════════════════════════════════════════════════════════════════════
#  Banner
# ════════════════════════════════════════════════════════════════════════════
line ""
line "${CYN}  ╭───────────────────────────────────────────────────────────╮${RST}"
line "${CYN}  │  ${BLD}DevLens CLI${RST}${CYN} — codebase intelligence.                  ${RST}${CYN}│${RST}"
line "${CYN}  │  https://github.com/devlensio/devlensOSS                   │${RST}"
line "${CYN}  ╰───────────────────────────────────────────────────────────╯${RST}"

# ════════════════════════════════════════════════════════════════════════════
#  1. Detect platform + architecture
# ════════════════════════════════════════════════════════════════════════════
line ""
line "  ${BLD}1. Detecting your platform${RST}"

os="$(uname -s)"
case "$os" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *)      fail "unsupported OS '$os'. DevLens ships binaries for macOS and Linux only." ;;
esac

arch="$(uname -m)"
case "$arch" in
  x86_64|amd64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)             fail "unsupported architecture '$arch'. Supported: x86_64, arm64." ;;
esac

say "platform:   ${BLD}$OS / $ARCH${RST}"
say "install dir: $INSTALL_DIR"
say "binary:     devlens-$OS-$ARCH${DIM}  (${VERSION})$RST"

# ════════════════════════════════════════════════════════════════════════════
#  2. Required tooling + existing-install warning
# ════════════════════════════════════════════════════════════════════════════
command -v curl >/dev/null 2>&1 || fail "curl is required to download DevLens but was not found on your system."

if command -v devlens >/dev/null 2>&1; then
  OLD="$(command -v devlens)"
  warn "a \`devlens\` already exists at: $OLD"
  warn "this installer will NOT overwrite it; this new copy goes to $INSTALL_DIR."
fi

# ════════════════════════════════════════════════════════════════════════════
#  3. Download + install binary
# ════════════════════════════════════════════════════════════════════════════
ASSET="devlens-${OS}-${ARCH}"
if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
else
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET}"
fi

line ""
line "  ${BLD}2. Downloading${RST}"
dim "fetching $ASSET ($VERSION) from GitHub Releases ..."

mkdir -p "$INSTALL_DIR"
TMP="$INSTALL_DIR/.devlens.download.$$"
if ! curl -fL --retry 3 --progress-bar "$URL" -o "$TMP"; then
  rm -f "$TMP"
  fail "failed to download '$URL'. Check your network / proxy settings, or that release '${VERSION}' exists for ${OS}-${ARCH}."
fi
chmod +x "$TMP"
mv -f "$TMP" "$INSTALL_DIR/devlens"
chmod +x "$INSTALL_DIR/devlens"
say "installed:  $INSTALL_DIR/devlens"

# ════════════════════════════════════════════════════════════════════════════
#  4. Verify the binary runs
# ════════════════════════════════════════════════════════════════════════════
if "$INSTALL_DIR/devlens" --version >/dev/null 2>&1; then
  VER="$("$INSTALL_DIR/devlens" --version 2>/dev/null | head -n1)"
  say "version:    ${BLD}$VER${RST}"
else
  warn "the binary was installed but \`devlens --version\` did not respond."
  warn "run the next steps below and check \`devlens doctor\`."
fi

# ════════════════════════════════════════════════════════════════════════════
#  5. Add to PATH automatically (unless the user opted out)
# ════════════════════════════════════════════════════════════════════════════
line ""
line "  ${BLD}3. Adding devlens to your PATH${RST}"

# Already on PATH?
if command -v devlens >/dev/null 2>&1 && [ "$(command -v devlens)" = "$INSTALL_DIR/devlens" ]; then
  say "already on your PATH."
else
  case ":$PATH:" in
    *":$INSTALL_DIR:"*)
      say "$INSTALL_DIR is already on your PATH."
      ;;
    *)
      if [ "$AUTO_PATH" = "1" ]; then
        warn "PATH auto-config is disabled (DEVLENS_NO_PATH=1)."
        warn "to use \`devlens\` now and in future sessions, add to your shell config:"
        printf '%b\n' "${BLD}    export PATH=\"$INSTALL_DIR:\$PATH\"${RST}"
        line ""
        warn "call \`$INSTALL_DIR/devlens\` directly to verify it works without PATH setup."
      else
        # Determine the shell + rc file to append to.
        SHELL_NAME="$(basename "${SHELL:-/bin/sh}")"
        case "$SHELL_NAME" in
          bash)   RC="$HOME/.bashrc";            EXPORT_LINE="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
          zsh)    RC="$HOME/.zshrc";              EXPORT_LINE="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
          fish)   RC="$HOME/.config/fish/config.fish"; EXPORT_LINE="fish_add_path \"$INSTALL_DIR\"" ;;
          *)      RC="$HOME/.profile";            EXPORT_LINE="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
        esac
        if [ -n "$RC" ]; then
          mkdir -p "$(dirname "$RC")"
          if [ -f "$RC" ] && grep -qF "$INSTALL_DIR" "$RC" 2>/dev/null; then
            say "already present in $RC."
          else
            printf '\n# DevLens CLI\n%s\n' "$EXPORT_LINE" >> "$RC"
            say "added: ${BLD}$EXPORT_LINE${RST}  ->  $RC"
          fi
        fi
        warn "start a new terminal (or run \`source $RC\`) for \`devlens\` to be on your PATH."
      fi
      ;;
  esac
fi

# ════════════════════════════════════════════════════════════════════════════
#  All good — clear the failure trap and print next steps.
# ════════════════════════════════════════════════════════════════════════════
trap - EXIT 2>/dev/null || true

line ""
line "  ${GRN}${BLD}✓ DevLens CLI installed.${RST}"
line ""
line "  ${BLD}next steps:${RST}"
dim "  devlens doctor            # check environment + extractor runtimes"
dim "  devlens init              # configure your AI provider (only if you want summaries)"
dim "  devlens analyze <repo>    # build a codebase graph (TS/JS/Py/Go/Rust/Java)"
dim "  devlens --help            # all commands"
line ""
dim "  first run materializes go/rust/java extractors to ~/.devlens (a few seconds)."
dim "  set DEVLENS_VERBOSE=1 for verbose bootstrapping."
line ""
line "  Ready when you are. Happy visualizing! 🚀"

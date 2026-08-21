# DevLens CLI installer (Windows / PowerShell) — downloads a prebuilt standalone binary.
# No node, no bun required.
#
#   irm https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.ps1 | iex
#
# Overridable:
#   $env:DEVLENS_REPO          upstream repo (default devlensio/devlensOSS)
#   $env:DEVLENS_VERSION       release tag, e.g. v0.5.1 (default latest)
#   $env:DEVLENS_INSTALL_DIR   install dir (default $env:USERPROFILE\.devlens\bin)
#   $env:DEVLENS_NO_PATH       set to "1" to skip adding devlens to your PATH
$ErrorActionPreference = "Stop"

# ── ANSI colors (PowerShell 5.1+ virtual terminal on supported hosts) ───────
$RST = "`e[0m"; $BLD = "`e[1m"; $DIM = "`e[2m"
$GRN = "`e[32m"; $RED = "`e[31m"; $YLW = "`e[33m"; $CYN = "`e[36m"

function Say($m)  { Write-Host "$GRN  $m$RST" }
function Warn($m) { Write-Host "$YLW  $m$RST" }
function Dim($m)  { Write-Host "$DIM  $m$RST" }
function Err($m)  { Write-Host "$RED  $m$RST" }

# ── Friendly, actionable failure helper ─────────────────────────────────────
function Fail($message) {
  Err ""
  Err "  $($RED)Installation failed.$RST"
  Err "        $message"
  Err ""
  Err "  If this keeps happening, open an issue with the output above:"
  Err "     https://github.com/devlensio/devlensOSS/issues"
  Err "  Or grab a binary directly:"
  Err "     https://github.com/devlensio/devlensOSS/releases"
  throw "$message"
}

try {
  # ── Config ────────────────────────────────────────────────────────────────
  $Repo       = if ($env:DEVLENS_REPO)       { $env:DEVLENS_REPO }       else { "devlensio/devlensOSS" }
  $Version    = if ($env:DEVLENS_VERSION)    { $env:DEVLENS_VERSION }    else { "latest" }
  $InstallDir = if ($env:DEVLENS_INSTALL_DIR) { $env:DEVLENS_INSTALL_DIR } else { "$env:USERPROFILE\.devlens\bin" }
  $AutoPath   = $env:DEVLENS_NO_PATH

  # ── Banner ──────────────────────────────────────────────────────────────
  Write-Host ""
  Write-Host "$CYN  ╭───────────────────────────────────────────────────────────╮$RST"
  Write-Host "$CYN  │  ${BLD}DevLens CLI$RST$CYN — codebase intelligence.                  $RST$CYN│$RST"
  Write-Host "$CYN  │  https://github.com/devlensio/devlensOSS                   │$RST"
  Write-Host "$CYN  ╰───────────────────────────────────────────────────────────╯$RST"

  # ── 1. Platform ──────────────────────────────────────────────────────────
  Write-Host ""
  Write-Host "  $BLD 1. Detecting your platform$RST"
  $Asset = "devlens-windows-x64.exe"
  Say "platform:    $($BLD)Windows / x64$RST"
  Say "install dir: $InstallDir"
  Say "binary:      $Asset$($DIM)  ($Version)$RST"

  # ── 2. Download ──────────────────────────────────────────────────────────
  Write-Host ""
  Write-Host "  $BLD 2. Downloading$RST"
  Dim "fetching $Asset ($Version) from GitHub Releases ..."
  if ($Version -eq "latest") {
    $Url = "https://github.com/$Repo/releases/latest/download/$Asset"
  } else {
    $Url = "https://github.com/$Repo/releases/download/$Version/$Asset"
  }

  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  $Dest = Join-Path $InstallDir "devlens.exe"

  try {
    Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "n/a" }
    Fail "failed to download '$Url' (HTTP $code). Check your network / proxy, or that release '$Version' exists."
  }

  if (-not (Test-Path $Dest)) {
    Fail "the download finished but no file was found at '$Dest'."
  }
  Say "installed:   $Dest"

  # ── 3. Verify the binary runs ────────────────────────────────────────────
  try {
    $ver = (& $Dest --version 2>$null | Select-Object -First 1)
    if ($ver) { Say "version:     $($BLD)$ver$RST" }
    else      { Warn "installed OK, but 'devlens --version' returned no output." }
  } catch {
    Warn "the binary was installed but could not be executed yet (this can happen if SmartScreen is still scanning it)."
  }

  # ── 4. Add to PATH ───────────────────────────────────────────────────────
  Write-Host ""
  Write-Host "  $BLD 3. Adding devlens to your PATH$RST"
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $hasDir = ($userPath -split ';') -contains $InstallDir

  if ($hasDir) {
    Say "$InstallDir is already on your user PATH."
  } elseif ($AutoPath -eq "1") {
    Warn "PATH auto-config is disabled (DEVLENS_NO_PATH=1)."
    Warn "to use 'devlens', add '$InstallDir' to your user PATH manually"
    Warn "(Settings > System > About > Advanced system settings > Environment Variables),"
    Warn "or re-run this installer without DEVLENS_NO_PATH set."
  } else {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$InstallDir", "User")
    Say "added $InstallDir to your user PATH."
    Warn "open a NEW terminal (or restart PowerShell) for 'devlens' to be on your PATH."
  }

  # ── Success + next steps ─────────────────────────────────────────────────
  Write-Host ""
  Write-Host "  $GRN$BLD ✓ DevLens CLI installed.$RST"
  Write-Host ""
  Write-Host "  $BLD next steps:$RST"
  Dim "  devlens doctor            # check environment + extractor runtimes"
  Dim "  devlens init              # configure your AI provider (only if you want summaries)"
  Dim "  devlens analyze <repo>    # build a codebase graph (TS/JS/Py/Go/Rust/Java)"
  Dim "  devlens --help            # all commands"
  Write-Host ""
  Dim "  first run materializes go/rust/java extractors to ~\.devlens (a few seconds)."
  Dim "  set DEVLENS_VERBOSE=1 for verbose bootstrapping."
  Write-Host ""
  Write-Host "  Ready when you are. Happy visualizing! 🚀"
}
catch {
  # Already reported by Fail(); just preserve the failing exit code.
  exit 1
}

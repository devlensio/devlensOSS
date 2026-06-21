# DevLens CLI installer (Windows) — downloads a prebuilt standalone binary.
# No node, no bun required.
#
#   irm https://raw.githubusercontent.com/devlensio/devlensOSS/main/scripts/install.ps1 | iex
#
# Overridable: $env:DEVLENS_REPO, $env:DEVLENS_VERSION (e.g. v0.3.0), $env:DEVLENS_INSTALL_DIR
$ErrorActionPreference = "Stop"

$Repo = if ($env:DEVLENS_REPO) { $env:DEVLENS_REPO } else { "devlensio/devlensOSS" }
$Version = if ($env:DEVLENS_VERSION) { $env:DEVLENS_VERSION } else { "latest" }
$InstallDir = if ($env:DEVLENS_INSTALL_DIR) { $env:DEVLENS_INSTALL_DIR } else { "$env:USERPROFILE\.devlens\bin" }

$Asset = "devlens-windows-x64.exe"
if ($Version -eq "latest") {
  $Url = "https://github.com/$Repo/releases/latest/download/$Asset"
} else {
  $Url = "https://github.com/$Repo/releases/download/$Version/$Asset"
}

Write-Host "devlens: downloading $Asset ($Version)"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$Dest = Join-Path $InstallDir "devlens.exe"
Invoke-WebRequest -Uri $Url -OutFile $Dest

Write-Host "devlens: installed to $Dest"

# Add to the user PATH if it isn't already there.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$InstallDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$InstallDir", "User")
  Write-Host "devlens: added $InstallDir to your user PATH (restart your shell to use 'devlens')."
}
Write-Host "devlens: run 'devlens doctor' to verify your environment."

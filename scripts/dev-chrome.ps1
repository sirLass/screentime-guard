# Launches Chrome with an isolated dev profile for the ScreenTime Guard extension,
# so development and testing never touch your personal browsing profile.
#
# Usage (from the repo root):
#   pnpm dev:chrome                     # build the extension, then launch Chrome + isolated profile
#   pnpm dev:chrome -- -Dev             # also run `pnpm dev` for auto-reload / HMR
#
# Chrome 137+ may ignore the --load-extension flag. If the extension does not
# appear, enable Developer mode on chrome://extensions and click "Load unpacked",
# pointing at the output dir printed below.

param([switch]$Dev)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$extApp = Join-Path $root 'apps\extension'
$output = Join-Path $extApp '.output\chrome-mv3'

if ($Dev) {
    Write-Host "Starting 'pnpm dev' (keep its window open for hot reload)..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$extApp'; pnpm dev"
}
else {
    Write-Host 'Building extension...' -ForegroundColor Cyan
    Push-Location $extApp
    try { pnpm build } finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $output 'manifest.json'))) {
    throw "Build output not found at $output. Run 'pnpm build' in apps/extension first."
}

# Dedicated profile created on first run and gitignored (see .gitignore).
$profileDir = Join-Path $root '.chrome-dev-profile'
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
    throw 'Chrome not found. Install Google Chrome or pass its path explicitly.'
}

Write-Host "Launching Chrome with dev profile: $profileDir" -ForegroundColor Cyan
Start-Process $chrome -ArgumentList @(
    "--user-data-dir=$profileDir",
    "--load-extension=$output",
    '--no-first-run',
    '--no-default-browser-check',
    'chrome://extensions'
)

Write-Host @"

Next steps:
  - Check that the extension loaded on chrome://extensions (Developer mode ON).
  - If Chrome ignores --load-extension: click 'Load unpacked' and select:
    $output
  - Click the toolbar icon to open the popup, edit code, and confirm the
    auto-reload (with -Dev) or click 'Reload' on the card (without -Dev).
  - Reset this test environment by deleting $profileDir
"@

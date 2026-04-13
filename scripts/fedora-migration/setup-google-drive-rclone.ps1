# =============================================================================
# RUN:  powershell -ExecutionPolicy Bypass -File .\setup-google-drive-rclone.ps1
#
# BEFORE FIRST RUN:
#   1) Copy gdrive-oauth.local.env.example -> gdrive-oauth.local.env
#   2) Paste Desktop OAuth client ID + secret into that file.
#   3) Run this script. Browser opens for Google Allow. Then upload (use -SkipUpload to skip).
# =============================================================================

param([switch]$SkipUpload)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$envFile = Join-Path $here "gdrive-oauth.local.env"
$folderId = "1cntyEzO2tdhQwAr8kU9xy_G6DHTmHoPu"
$remote = "gwin"

if (-not (Test-Path $envFile)) {
    Write-Host "CREATE THIS FILE FIRST: $envFile"
    Write-Host "Copy from: $(Join-Path $here 'gdrive-oauth.local.env.example')"
    exit 1
}

$id = $null
$sec = $null
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*GDRIVE_CLIENT_ID\s*=\s*(.+)$') { $id = $matches[1].Trim().Trim('"') }
    if ($_ -match '^\s*GDRIVE_CLIENT_SECRET\s*=\s*(.+)$') { $sec = $matches[1].Trim().Trim('"') }
}

if (-not $id -or -not $sec) {
    Write-Host "Fill GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET in: $envFile"
    exit 1
}

if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
    Write-Host "Install rclone (winget install Rclone.Rclone) then run again."
    exit 1
}

if (rclone listremotes 2>$null | Where-Object { $_ -eq "${remote}:" }) {
    "y" | & rclone config delete $remote
}

rclone config create $remote drive client_id=$id client_secret=$sec root_folder_id=$folderId scope=drive config_is_local=false

Write-Host ""
Write-Host ">>> Browser will open - click Allow for Google Drive."
Write-Host ""
rclone config reconnect "${remote}:"

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

rclone lsd "${remote}:"
Write-Host ""
Write-Host "Remote $remote OK."

if (-not $SkipUpload) {
    Write-Host ""
    Write-Host ">>> Uploading migration folder to Drive..."
    Write-Host ""
    & (Join-Path $here "upload-to-windows11-backup.ps1") -RemoteName $remote
}

Write-Host ""
Write-Host "Done."

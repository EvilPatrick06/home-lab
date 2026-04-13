# Upload this folder to Google Drive folder Windows11BackUp (via rclone remote whose root is that folder).
# Prerequisite: run `rclone config` once and create a remote (default name: gwin) with root_folder_id set.
#
# Usage:
#   .\upload-to-windows11-backup.ps1
#   .\upload-to-windows11-backup.ps1 -RemoteName mydrive

param([string]$RemoteName = "gwin")

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path "$env:APPDATA\rclone\rclone.conf")) {
    Write-Error "No rclone config. Run: rclone config   (create remote '$RemoteName', type drive, set root_folder_id to 1cntyEzO2tdhQwAr8kU9xy_G6DHTmHoPu)"
}

$check = rclone listremotes 2>$null | Where-Object { $_ -eq "${RemoteName}:" }
if (-not $check) {
    Write-Error "No rclone remote named '${RemoteName}:'. Run rclone config or pass -RemoteName YourRemote"
}

Write-Host "Uploading $here to ${RemoteName}:patrick-migration-backup/ ..."
rclone copy "$here" "${RemoteName}:patrick-migration-backup" --progress --exclude ".git/**" --exclude "**/__pycache__/**"
Write-Host "Done. List remote: rclone ls ${RemoteName}:"

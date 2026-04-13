# Does ALL rclone+Drive setup except the Google "Allow" consent page:
#   - reads Desktop OAuth client id/secret from gdrive-oauth.local.env (or env vars)
#   - writes remote "gwin" with your Windows11BackUp root_folder_id
#   - runs `rclone config reconnect` -> opens YOUR DEFAULT BROWSER for auth only
#
# Prerequisite (one-time, only you can do it in Google): create a Desktop OAuth client and put id+secret in the .env file.
#
# Usage:
#   .\complete-gdrive-rclone-setup.ps1
#   .\complete-gdrive-rclone-setup.ps1 -RemoteName myremote

param(
    [string]$RemoteName = "gwin",
    [switch]$SkipReconnect
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $here "gdrive-oauth.local.env"
$ROOT_FOLDER_ID = "1cntyEzO2tdhQwAr8kU9xy_G6DHTmHoPu"

function Read-DriveEnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    $id = $null; $sec = $null
    Get-Content $Path -ErrorAction Stop | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^\s*#' -or $line -eq '') { return }
        if ($line -match '^\s*GDRIVE_CLIENT_ID\s*=\s*(.+)$') { $id = $matches[1].Trim().Trim('"') }
        if ($line -match '^\s*GDRIVE_CLIENT_SECRET\s*=\s*(.+)$') { $sec = $matches[1].Trim().Trim('"') }
    }
    @{ Id = $id; Secret = $sec }
}

$creds = Read-DriveEnvFile $envFile
$clientId = if ($env:GDRIVE_CLIENT_ID) { $env:GDRIVE_CLIENT_ID } else { $creds.Id }
$clientSecret = if ($env:GDRIVE_CLIENT_SECRET) { $env:GDRIVE_CLIENT_SECRET } else { $creds.Secret }

if (-not $clientId -or -not $clientSecret) {
    Write-Host @"

Missing GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET.

Google does not allow creating an OAuth "Desktop app" client without YOU logged into Cloud Console once.
That is not the same as the final "Allow rclone" screen — it is app registration.

1) Copy gdrive-oauth.local.env.example -> gdrive-oauth.local.env
2) Paste your Desktop client id and secret from:
   https://console.cloud.google.com/apis/credentials
3) Run this script again.

This script will then create the rclone remote and open your browser ONLY for the Allow/consent step.

"@
    exit 1
}

if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
    Write-Error "rclone not in PATH."
}

$existing = rclone listremotes 2>$null | Where-Object { $_ -eq "${RemoteName}:" }
if ($existing) {
    Write-Host "Removing existing remote ${RemoteName} to recreate with correct root_folder_id..."
    "y" | & rclone config delete $RemoteName
}

Write-Host "Creating remote '${RemoteName}' (Drive, root_folder_id=$ROOT_FOLDER_ID)..."
# Non-interactive create; token comes from reconnect
rclone config create "${RemoteName}" drive `
    "client_id=$clientId" `
    "client_secret=$clientSecret" `
    "root_folder_id=$ROOT_FOLDER_ID" `
    "scope=drive" `
    "config_is_local=false"

if ($LASTEXITCODE -ne 0) {
    Write-Error "rclone config create failed."
}

Write-Host @"

------------------------------------------------------------------
Next: Google consent in YOUR BROWSER (Allow rclone) — that is the only browser step this script triggers.
If nothing opens, run manually:  rclone config reconnect ${RemoteName}:
------------------------------------------------------------------

"@

if (-not $SkipReconnect) {
    rclone config reconnect "${RemoteName}:"
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nOK. Test:  rclone lsd ${RemoteName}:"
    rclone lsd "${RemoteName}:"
}

# OPTIONAL: one tab — Google Credentials page (only if you still need to create a Desktop OAuth client).
# For the normal flow use:  .\complete-gdrive-rclone-setup.ps1
#   (that script does NOT open Cloud Console; it only opens the browser for Allow/consent after you add id+secret to gdrive-oauth.local.env)

param(
    [switch]$AlsoStartRcloneConfigWizard
)

Start-Process "https://console.cloud.google.com/apis/credentials"

if ($AlsoStartRcloneConfigWizard) {
    Start-Sleep -Seconds 2
    Start-Process -FilePath "rclone" -ArgumentList "config" -WorkingDirectory $env:USERPROFILE
}

Write-Host @"
Opened: Google Cloud Credentials (create Desktop OAuth client if needed).

Main automated setup (browser = Allow only after you fill gdrive-oauth.local.env):
  .\complete-gdrive-rclone-setup.ps1
"@

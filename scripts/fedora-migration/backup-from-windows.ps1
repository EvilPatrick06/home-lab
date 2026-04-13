# Run on Windows BEFORE you wipe or shrink the disk. Requires rclone in PATH and a configured remote.
#
# Install rclone: https://rclone.org/install/  then: rclone config
#
# Usage (PowerShell):
#   $env:RCLONE_REMOTE = "gdrive"
#   $env:RCLONE_PATH  = "Patrick-backups"
#   .\backup-from-windows.ps1
#
# Optional:
#   $env:SKIP_COMPRESS = "1"   # upload folder tree instead of .tar.zst (needs tar + zstd or falls back to .zip)

param(
    [string]$RcloneRemote = $env:RCLONE_REMOTE,
    [string]$RclonePath  = $env:RCLONE_PATH
)

$ErrorActionPreference = "Stop"

if (-not $RcloneRemote) { $RcloneRemote = "gdrive" }
if (-not $RclonePath)  { $RclonePath  = "Patrick-backups" }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$base = $env:USERPROFILE
$stage = Join-Path $env:TEMP "patrick-migration-$stamp"
$destRoot = Join-Path $stage "home"
$destUser = Join-Path $destRoot $env:USERNAME

if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
    Write-Error "rclone not in PATH. Install rclone and run: rclone config"
}

$remoteLine = rclone listremotes 2>$null | Where-Object { $_ -eq "${RcloneRemote}:" }
if (-not $remoteLine) {
    Write-Error "No rclone remote named '${RcloneRemote}:'. Run: rclone config"
}

$relPaths = @(
    "Documents",
    "Desktop",
    "Pictures",
    "Videos",
    "Music",
    "Downloads",
    ".ssh",
    ".gitconfig",
    ".git-credentials",
    ".cursor",
    "Projects",
    "dev",
    "src",
    "workspace"
)

# Minecraft / launchers (Java edition under Roaming)
$roaming = Join-Path $env:APPDATA "."
$extraFromRoaming = @(
    ".minecraft",
    "PrismLauncher"
)
foreach ($x in $extraFromRoaming) {
    $p = Join-Path $env:APPDATA $x
    if (Test-Path $p) { $relPaths += "APPDATA::$x" }
}

# Hytale launcher data
$hytale = Join-Path $env:APPDATA "Hytale"
if (Test-Path $hytale) { $relPaths += "APPDATA::Hytale" }

New-Item -ItemType Directory -Path $destUser -Force | Out-Null

foreach ($rel in $relPaths) {
    if ($rel -like "APPDATA::*") {
        $leaf = $rel.Substring("APPDATA::".Length)
        $src = Join-Path $env:APPDATA $leaf
        $targetDir = Join-Path $destUser "AppData/Roaming"
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        if (Test-Path $src) {
            Write-Host "Copying $src -> $targetDir\$leaf"
            Copy-Item -Path $src -Destination (Join-Path $targetDir $leaf) -Recurse -Force
        }
        continue
    }
    $src = Join-Path $base $rel
    if (Test-Path $src) {
        $parent = Split-Path $rel -Parent
        if ($parent) {
            $targetParent = Join-Path $destUser $parent
            New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
        }
        Write-Host "Copying $src"
        Copy-Item -Path $src -Destination (Join-Path $destUser $rel) -Recurse -Force
    }
}

$remoteDest = "${RcloneRemote}:${RclonePath}"
$skip = $env:SKIP_COMPRESS

if ($skip -eq "1") {
    $folderRemote = "${RclonePath}/migration-win-$stamp"
    Write-Host "rclone copy to ${RcloneRemote}:${folderRemote} ..."
    rclone copy $stage "${RcloneRemote}:${folderRemote}" --progress --transfers 8 --checkers 16
    Write-Host "Done: ${RcloneRemote}:${folderRemote}"
} else {
    $archiveName = "patrick-migration-win-$stamp.tar.zst"
    $archivePath = Join-Path $env:TEMP $archiveName
    # Windows 10+ tar; zstd may be missing — try .tar.gz if zstd fails
    Push-Location $stage
    try {
        if (Get-Command zstd -ErrorAction SilentlyContinue) {
            tar -cf - . | zstd -T0 -19 -o $archivePath
        } else {
            $archiveName = "patrick-migration-win-$stamp.tar.gz"
            $archivePath = Join-Path $env:TEMP $archiveName
            tar -czvf $archivePath .
        }
    } finally {
        Pop-Location
    }
    Write-Host "rclone copy $archivePath -> ${remoteDest}/"
    rclone copy $archivePath $remoteDest --progress --transfers 4
    Write-Host "Done: ${remoteDest}/${archiveName}"
}

Write-Host "Staging (safe to delete): $stage"

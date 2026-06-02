@echo off
REM ===========================================================================
REM  D&D VTT — two-window local multiplayer test launcher (Windows only)
REM ===========================================================================
REM  Opens the app twice so you can run a DM window and a player window on one
REM  PC with no VM. Each instance gets its OWN profile (--user-data-dir), which
REM  gives it a distinct multiplayer identity (separate client_id), and a TEST
REM  role tag in its title bar so you can tell them apart.
REM
REM  AUTO-UPDATE: before launching, this self-updates the installed app to the
REM  newest PUBLISHED GitHub release (reads the release's latest.yml, compares it
REM  to the installed exe version, and silently installs the newer setup.exe).
REM  So you never have to "Check for Updates" in-app — just re-run this and you
REM  get the freshest build. (A release stays a DRAFT until its CI build finishes
REM  ~8-10 min after a tag, and drafts are ignored here — you always get a fully
REM  built, asset-complete release, never a half-built one.)
REM
REM  Gated: this is the ONLY way to get two windows. Normal use stays single-
REM  window — the app only bypasses the single-instance lock when this script
REM  sets DNDVTT_TEST_MULTI=1.
REM
REM  Usage: download + double-click this file (or run it from a terminal).
REM  Then: in the DM window create a campaign and Host; in the player window
REM  Join by the invite code.
REM ===========================================================================

setlocal

set "APP=%LOCALAPPDATA%\Programs\dnd-vtt\dnd-vtt.exe"

REM --- Self-update to the latest published release (best-effort) -------------
REM  All PowerShell strings below are SINGLE-quoted so the outer double quotes
REM  cmd sees stay balanced (no escaping headaches). Failure is non-fatal: we
REM  fall through to whatever build is already installed.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $ErrorActionPreference='SilentlyContinue'; $repo='EvilPatrick06/home-lab'; $app=Join-Path $env:LOCALAPPDATA 'Programs\dnd-vtt\dnd-vtt.exe'; $base='https://github.com/'+$repo+'/releases/latest/download'; $dl=Join-Path $env:TEMP 'dnd-vtt-latest-setup.exe'; Write-Host 'Checking for the latest D&D VTT build...'; try { $yml=(Invoke-WebRequest -UseBasicParsing -Uri ($base+'/latest.yml')).Content; $ver=([regex]::Match($yml,'(?m)^version:\s*(.+?)\s*$')).Groups[1].Value; $path=([regex]::Match($yml,'(?m)^path:\s*(.+?)\s*$')).Groups[1].Value; $installed= if (Test-Path $app) { (Get-Item $app).VersionInfo.ProductVersion } else { '(none)' }; if ($ver -and (($installed -eq $ver) -or ($installed -like ($ver+'.*')))) { Write-Host ('  Already on the latest build ('+$ver+').') } elseif ($ver -and $path) { Write-Host ('  Updating '+$installed+' -> '+$ver+' (downloading '+$path+')...'); Invoke-WebRequest -UseBasicParsing -Uri ($base+'/'+$path) -OutFile $dl; Get-Process dnd-vtt -ErrorAction SilentlyContinue | Stop-Process -Force; Start-Sleep -Milliseconds 500; Start-Process -FilePath $dl -ArgumentList '/S' -Wait; Start-Sleep -Milliseconds 1500; Get-Process dnd-vtt -ErrorAction SilentlyContinue | Stop-Process -Force; Write-Host ('  Installed '+$ver+'.') } else { Write-Host '  Could not read the latest release info; using the installed build.' } } catch { Write-Host ('  Update check failed; using the installed build. ('+$_.Exception.Message+')') }"

REM --- Locate the installed app (one-click NSIS install location) ------------
if not exist "%APP%" (
  echo.
  echo   Could not find dnd-vtt.exe at:
  echo     "%APP%"
  echo   The auto-update step could not install it either. Install it once from
  echo   the latest GitHub release, then re-run this script.
  echo.
  pause
  exit /b 1
)

REM --- Enable the multi-window test gate for the child processes --------------
set "DNDVTT_TEST_MULTI=1"
set "PROFILES=%TEMP%\dnd-vtt-test"

echo Launching DM window...
set "DNDVTT_TEST_ROLE=DM"
start "" "%APP%" --user-data-dir="%PROFILES%-dm"

REM small stagger so the two instances don't race on first-run profile setup
timeout /t 2 /nobreak >nul

echo Launching Player window...
set "DNDVTT_TEST_ROLE=Player"
start "" "%APP%" --user-data-dir="%PROFILES%-player"

echo.
echo   Two windows launching with separate test profiles:
echo     DM     -^> %PROFILES%-dm
echo     Player -^> %PROFILES%-player
echo   In the DM window: create a campaign and Host. In the Player window: Join by invite code.
echo   (Delete those two folders any time to reset the test profiles.)
echo.

endlocal

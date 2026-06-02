@echo off
REM ===========================================================================
REM  D&D VTT — two-window local multiplayer test launcher (Windows only)
REM ===========================================================================
REM  Opens the app twice so you can run a DM window and a player window on one
REM  PC with no VM. Each instance gets its OWN profile (--user-data-dir), which
REM  gives it a distinct multiplayer identity (separate client_id), and a TEST
REM  role tag in its title bar so you can tell them apart.
REM
REM  CLEAN SLATE: any already-running D&D VTT windows are closed FIRST — before
REM  the update and before launching — so the updater can replace files and no
REM  stray instance holds the single-window lock.
REM
REM  AUTO-UPDATE: before launching, this self-updates the installed app to the
REM  newest PUBLISHED GitHub release. It uses curl.exe (bundled on Win10 1803+ /
REM  Win11) for the network calls — Windows PowerShell 5.1's Invoke-WebRequest
REM  (which the bare `powershell` command resolves to, NOT pwsh 7) fails silently
REM  on GitHub's modern-TLS release-asset redirects. So you never have to "Check
REM  for Updates" in-app — just re-run this and you get the freshest build. (A
REM  release stays a DRAFT until its CI build finishes ~8-10 min after a tag, and
REM  drafts are skipped here — you always get a fully built, asset-complete
REM  release, never a half-built one.)
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
set "BASE=https://github.com/EvilPatrick06/home-lab/releases/latest/download"
set "YML=%TEMP%\dnd-vtt-latest.yml"
set "DL=%TEMP%\dnd-vtt-latest-setup.exe"

REM --- Close ALL running app instances first ---------------------------------
REM  Clean slate before updating + launching: a running instance would block the
REM  silent installer from replacing files, and a stray default-profile window
REM  would hold the single-instance lock. /T also kills child processes (helper
REM  + GPU procs). Quiet + non-fatal if nothing is running.
echo Closing any running D^&D VTT windows...
taskkill /IM dnd-vtt.exe /F /T >nul 2>&1

REM --- Self-update to the latest PUBLISHED release (best-effort) -------------
REM  curl.exe handles modern TLS + the release-asset redirect chain natively.
REM  PowerShell is used ONLY to read the installed exe's version (a local op that
REM  even 5.1 does fine). Every step degrades gracefully to the installed build.
echo Checking for the latest D^&D VTT build...
del "%YML%" >nul 2>&1
curl.exe -fsSL --retry 2 -o "%YML%" "%BASE%/latest.yml"
if not exist "%YML%" (
  echo   Update check failed: could not download release info. Using the installed build.
  goto launch
)

set "LATESTVER="
set "SETUPNAME="
for /f "usebackq tokens=1,* delims= " %%a in ("%YML%") do (
  if /i "%%a"=="version:" set "LATESTVER=%%b"
  if /i "%%a"=="path:" set "SETUPNAME=%%b"
)

if not defined LATESTVER (
  echo   Could not read the latest release info; using the installed build.
  goto launch
)
if not defined SETUPNAME (
  echo   Could not read the latest installer name; using the installed build.
  goto launch
)

REM  Decide via exit code: 0 = already current, 1 = update available.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$l=$env:LATESTVER.Trim(); $i=if(Test-Path $env:APP){(Get-Item $env:APP).VersionInfo.ProductVersion}else{''}; if($i -eq $l -or $i -like ($l+'.*')){exit 0}else{exit 1}"
if not errorlevel 1 (
  echo   Already on the latest build ^(%LATESTVER%^).
  goto launch
)

echo   Updating to %LATESTVER% ^(downloading %SETUPNAME%^)...
del "%DL%" >nul 2>&1
curl.exe -fL --retry 2 -# -o "%DL%" "%BASE%/%SETUPNAME%"
if not exist "%DL%" (
  echo   Download failed; using the installed build.
  goto launch
)
echo   Installing silently...
start /wait "" "%DL%" /S
REM  the installer may auto-launch the app — close it before opening test windows
taskkill /IM dnd-vtt.exe /F /T >nul 2>&1
echo   Updated to %LATESTVER%.

:launch
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

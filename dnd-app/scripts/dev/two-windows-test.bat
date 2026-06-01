@echo off
REM ===========================================================================
REM  D&D VTT — two-window local multiplayer test launcher (Windows only)
REM ===========================================================================
REM  Opens the INSTALLED app twice so you can run a DM window and a player window
REM  on one PC with no VM. Each instance gets its OWN profile (--user-data-dir),
REM  which gives it a distinct multiplayer identity (separate client_id), and a
REM  TEST role tag in its title bar so you can tell them apart.
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

REM --- Locate the installed app (one-click NSIS install location) ---
set "APP=%LOCALAPPDATA%\Programs\dnd-vtt\dnd-vtt.exe"
if not exist "%APP%" (
  echo.
  echo   Could not find dnd-vtt.exe at:
  echo     "%APP%"
  echo   If you installed it elsewhere, edit the APP path at the top of this script.
  echo.
  pause
  exit /b 1
)

REM --- Enable the multi-window test gate for the child processes ---
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

; --- customInit ---
; Runs during .onInit AFTER initMultiUser and check64BitAndSetRegView,
; so SHCTX and 64-bit registry view are correctly set.
;
; KEY FIX: Unconditionally clear uninstall registry keys so that
; uninstallOldVersion (installUtil.nsh) finds no UninstallString and
; returns immediately — bypassing the retry loop + "appCannotBeClosed"
; dialog that has no custom override hook.
;
; Safe because the new installer recreates all registry entries via
; registryAddInstallInfo after extracting files.
!macro customInit
  ; Clean per-user uninstall registry (always accessible without elevation)
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $R0 != ""
    DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
  ${endif}

  ; Clean per-machine uninstall registry (needs admin — may silently fail)
  ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $R0 != ""
    DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey HKLM "${INSTALL_REGISTRY_KEY}"
  ${endif}

  ; Also clean secondary registry key if app ID changed between versions
  !ifdef UNINSTALL_REGISTRY_KEY_2
    ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    ${if} $R0 != ""
      DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY_2}"
    ${endif}
    ReadRegStr $R0 HKLM "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    ${if} $R0 != ""
      DeleteRegKey HKLM "${UNINSTALL_REGISTRY_KEY_2}"
    ${endif}
  !endif
!macroend

; --- customCheckAppRunning ---
; Replaces the default _CHECK_APP_RUNNING which has its own
; "appCannotBeClosed" dialog (location #1). Our version just kills
; processes and continues — no retry loop, no dialog.
; $PowerShellPath is set by the CHECK_APP_RUNNING wrapper before this runs.
; $$ is NSIS syntax for literal $ in backtick strings.
!macro customCheckAppRunning
  nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'

  nsExec::Exec `"$PowerShellPath" -C "Get-CimInstance Win32_Process | ? { $$_.Path -and $$_.Path.StartsWith('$INSTDIR','CurrentCultureIgnoreCase') } | % { Stop-Process -Id $$_.ProcessId -Force -EA SilentlyContinue }"`
  Pop $0

  Sleep 3000
!macroend

; --- customUnInstallCheck / customUnInstallCheckCurrentUser ---
; Safety net: called by handleUninstallResult if uninstallOldVersion
; somehow still runs and fails. Prevents the "uninstallFailed"
; MessageBox + Quit. Installation continues with new files overwriting old.
!macro customUnInstallCheck
  DetailPrint "Previous version cleanup had warnings. Continuing installation."
!macroend

!macro customUnInstallCheckCurrentUser
  DetailPrint "Previous version cleanup had warnings. Continuing installation."
!macroend

; --- customRemoveFiles ---
; Future-proofs THIS version's uninstaller: when THIS version becomes
; the "old version" in a future upgrade, its uninstaller uses RMDir /r
; (silently skips locked files) instead of un.atomicRMDir (aborts on
; any locked file). This prevents the retry loop in future upgrades.
;
; Guard: verify $INSTDIR is set and contains the app executable before
; removing, to prevent accidental deletion of unrelated directories.
!macro customRemoveFiles
  ${if} $INSTDIR != ""
    ${if} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      SetOutPath $TEMP
      RMDir /r $INSTDIR
    ${else}
      DetailPrint "Skipping removal: app executable not found in $INSTDIR"
    ${endif}
  ${else}
    DetailPrint "Skipping removal: installation directory is not set"
  ${endif}
!macroend

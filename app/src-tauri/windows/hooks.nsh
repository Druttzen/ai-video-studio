; NSIS installer hooks for AI Video Tool setup and full uninstall.

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Installation complete. Open AI Video Tool to run the in-app setup console."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Running AI Video Tool uninstall cleanup..."
  ${If} ${Silent}
    ExecWait '"$INSTDIR\resources\installer\ave-uninstall.cmd" --Uninstall --inst-dir "$INSTDIR" --quiet --RemoveData no' $0
  ${Else}
    ExecWait '"$COMSPEC" /c start "AI Video Tool Uninstall" /wait "$INSTDIR\resources\installer\ave-uninstall.cmd" --Uninstall --inst-dir "$INSTDIR"' $0
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION "Component cleanup reported errors (code $0). Continuing uninstall."
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Best-effort removal if setup copied files outside tracked NSIS resources.
  RMDir /r /REBOOTOK "$INSTDIR\ave-engine"
  RMDir /r /REBOOTOK "$INSTDIR\addons"
  Delete /REBOOTOK "$INSTDIR\.ave-install-state.json"
!macroend

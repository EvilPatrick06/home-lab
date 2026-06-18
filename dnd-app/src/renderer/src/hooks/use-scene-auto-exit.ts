import { useEffect, useRef } from 'react'
import { SETTINGS_KEYS } from '../constants/settings-keys'
import { useT } from '../i18n'
import { exitSceneMode } from '../services/game/scene-mode-controller'
import { useGameStore } from '../stores/use-game-store'
import { addToast } from './use-toast'

/**
 * PHASE-35 35F — "grid for fights": when initiative begins while a scene is active, the authority
 * (host/solo) exits the scene for everyone (the resulting dm:scene-mode broadcast brings clients back).
 * Edge-triggered on the null→non-null initiative transition; gated on the DM's persisted pref
 * (default on). Clients don't decide locally — they just receive the broadcast.
 */
export function useSceneAutoExit(isAuthority: boolean): void {
  const { t } = useT()
  const inCombat = useGameStore((s) => s.initiative !== null)
  const prevInCombat = useRef(inCombat)

  useEffect(() => {
    const was = prevInCombat.current
    prevInCombat.current = inCombat
    if (was || !inCombat) return // only the false → true edge
    if (!isAuthority || !useGameStore.getState().sceneMode) return

    let autoExit = true
    try {
      const raw = localStorage.getItem(SETTINGS_KEYS.SCENE_MODE_PREFS)
      if (raw) autoExit = (JSON.parse(raw) as { autoExitOnCombat?: boolean }).autoExitOnCombat !== false
    } catch {
      /* no prefs → default on */
    }
    if (!autoExit) return

    exitSceneMode()
    addToast(t('game.sceneMode.combatAutoExit'), 'info')
  }, [inCombat, isAuthority, t])
}

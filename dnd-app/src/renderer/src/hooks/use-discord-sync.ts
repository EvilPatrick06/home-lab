import { useEffect, useRef } from 'react'
import { pushDmAlert } from '../components/game/overlays/DmAlertTray'
import { useT } from '../i18n'
import { getTokenStats } from '../services/game/token-stats'
import { useDiscordSyncStore } from '../stores/use-discord-sync-store'
import { useGameStore } from '../stores/use-game-store'
import { logger } from '../utils/logger'

// PHASE-22 22E: DM-side Discord sync. Inbound (display-only) — Pi→VTT events become
// an activity feed + DM alerts; never mutate game state (PHASE-36 owns that).
// Outbound (opt-in) — push initiative + condensed state to Discord, debounced.

const INIT_DEBOUNCE_MS = 1500
const STATE_DEBOUNCE_MS = 3000
const UNREACHABLE_ALERT_MS = 60_000

function gatherInitiative(): {
  entries: { entityName: string; entityType: string; isActive: boolean }[]
  currentIndex: number
  round: number
} | null {
  const init = useGameStore.getState().initiative
  if (!init?.entries?.length) return null
  return {
    entries: init.entries.map((e) => ({
      entityName: e.entityName,
      entityType: e.entityType,
      isActive: e.isActive
    })),
    currentIndex: init.currentIndex ?? 0,
    round: init.round ?? 0
  }
}

function gatherState(): Record<string, unknown> {
  const gs = useGameStore.getState()
  const activeMap = gs.maps.find((m) => m.id === gs.activeMapId)
  const partyHp = (activeMap?.tokens ?? []).slice(0, 12).map((t) => ({
    name: t.label ?? '?',
    currentHP: t.currentHP ?? null,
    maxHP: getTokenStats(t).maxHP ?? null,
    conditions: [] as string[]
  }))
  return { mapName: activeMap?.name ?? null, partyHp }
}

interface SyncEventLike {
  type: string
  payload: Record<string, unknown>
}

export function useDiscordSync({ isDM, campaignId }: { isDM: boolean; campaignId: string | null | undefined }): void {
  const { t } = useT()
  const addActivity = useDiscordSyncStore((s) => s.addActivity)
  const syncEnabled = useDiscordSyncStore((s) => s.syncToDiscordEnabled)
  const lastUnreachableRef = useRef(0)

  // ── Inbound: events → activity feed + alerts (display-only) ──
  useEffect(() => {
    if (!isDM || !window.api?.onBmoSyncEvent) return

    const pushState = (): void => {
      try {
        void window.api.bmoSyncGameState(gatherState())
      } catch (err) {
        logger.warn('[useDiscordSync] state push failed:', err)
      }
    }
    const pushInitiative = (): void => {
      const i = gatherInitiative()
      if (i) void window.api.bmoSyncInitiative(i)
    }

    const offEvent = window.api.onBmoSyncEvent((ev) => {
      const e = ev as SyncEventLike
      switch (e.type) {
        case 'discord_message': {
          const author = String(e.payload.author ?? 'Discord')
          const text = String(e.payload.text ?? '')
          addActivity({ kind: 'message', summary: `${author}: ${text.slice(0, 120)}` })
          break
        }
        case 'discord_roll':
          addActivity({
            kind: 'roll',
            summary: `${e.payload.rollerName ?? '?'} rolled ${e.payload.formula ?? '?'} = ${e.payload.total ?? '?'}`
          })
          break
        case 'player_join': {
          const name = String(e.payload.playerName ?? '?')
          addActivity({ kind: 'join', summary: name })
          pushDmAlert('info', t('notify.discordSync.playerJoined', { name }))
          break
        }
        case 'player_leave': {
          const name = String(e.payload.playerName ?? '?')
          addActivity({ kind: 'leave', summary: name })
          pushDmAlert('info', t('notify.discordSync.playerLeft', { name }))
          break
        }
        case 'bmo_unreachable': {
          const now = Date.now()
          if (now - lastUnreachableRef.current > UNREACHABLE_ALERT_MS) {
            lastUnreachableRef.current = now
            pushDmAlert('warning', t('notify.discordSync.bmoUnreachable'))
          }
          break
        }
        case 'state_request':
          // Explicit ask from the Pi — answer regardless of the opt-in toggle.
          pushInitiative()
          pushState()
          break
      }
    })

    const offInit = window.api.onBmoSyncInitiative((ev) => {
      const i = ev as { entries?: unknown[]; round?: number }
      addActivity({
        kind: 'initiative',
        summary: t('game.discordSync.initiativeSummary', {
          count: i.entries?.length ?? 0,
          round: i.round ?? 0
        })
      })
    })

    return () => {
      offEvent?.()
      offInit?.()
    }
  }, [isDM, addActivity, t])

  // ── Outbound: opt-in debounced push of initiative + state ──
  useEffect(() => {
    if (!isDM || !syncEnabled || !window.api?.bmoSyncInitiative) return

    let prevInit = useGameStore.getState().initiative
    let prevMap = useGameStore.getState().activeMapId
    let initTimer: ReturnType<typeof setTimeout> | null = null
    let stateTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleInit = (): void => {
      if (initTimer) clearTimeout(initTimer)
      initTimer = setTimeout(() => {
        const i = gatherInitiative()
        if (i) window.api.bmoSyncInitiative(i).catch(() => {})
      }, INIT_DEBOUNCE_MS)
    }
    const scheduleState = (): void => {
      if (stateTimer) clearTimeout(stateTimer)
      stateTimer = setTimeout(() => {
        window.api.bmoSyncGameState(gatherState()).catch(() => {})
      }, STATE_DEBOUNCE_MS)
    }

    const unsub = useGameStore.subscribe((s) => {
      if (s.initiative !== prevInit) {
        prevInit = s.initiative
        scheduleInit()
        scheduleState()
      }
      if (s.activeMapId !== prevMap) {
        prevMap = s.activeMapId
        scheduleState()
      }
    })

    return () => {
      unsub()
      if (initTimer) clearTimeout(initTimer)
      if (stateTimer) clearTimeout(stateTimer)
    }
  }, [isDM, syncEnabled])
}

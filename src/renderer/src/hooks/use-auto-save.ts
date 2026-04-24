import { useEffect, useRef } from 'react'
import { saveGameState } from '../services/io/game-state-saver'
import { useBuilderStore } from '../stores/use-builder-store'
import { useGameStore } from '../stores/use-game-store'
import type { Campaign } from '../types/campaign'
import type { AbilityScoreSet } from '../types/character-common'
import { logger } from '../utils/logger'
import { addToast } from './use-toast'

const AUTO_SAVE_INTERVAL = 60_000

export function useAutoSaveGame(campaign: Campaign | null, isDM: boolean): void {
  const lastSaveRef = useRef(0)
  const dirtyRef = useRef(false)

  useEffect(() => {
    if (!isDM || !campaign) return

    const unsub = useGameStore.subscribe(() => {
      dirtyRef.current = true
    })

    const interval = setInterval(() => {
      if (!dirtyRef.current) return
      const now = Date.now()
      if (now - lastSaveRef.current < AUTO_SAVE_INTERVAL) return

      dirtyRef.current = false
      lastSaveRef.current = now
      saveGameState(campaign).catch((err) => {
        logger.error('[AutoSave] Failed:', err)
        addToast('Auto-save failed', 'warning')
      })
    }, 10_000)

    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [campaign, isDM])
}

const DRAFT_KEY = 'dnd-vtt-builder-draft'
const DRAFT_SAVE_INTERVAL = 30_000

interface BuilderDraft {
  characterName: string
  gameSystem: string | null
  abilityScores: AbilityScoreSet
  timestamp: number
}

export function saveBuilderDraft(): void {
  try {
    const state = useBuilderStore.getState()
    if (state.phase !== 'building' || !state.characterName) return
    if (state.editingCharacterId) return

    const draft: BuilderDraft = {
      characterName: state.characterName,
      gameSystem: state.gameSystem,
      abilityScores: state.abilityScores,
      timestamp: Date.now()
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Silently fail
  }
}

export function loadBuilderDraft(): BuilderDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as BuilderDraft
    // Expire drafts older than 7 days
    if (Date.now() - draft.timestamp > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_KEY)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function clearBuilderDraft(): void {
  localStorage.removeItem(DRAFT_KEY)
}

export function useAutoSaveBuilderDraft(): void {
  useEffect(() => {
    const interval = setInterval(saveBuilderDraft, DRAFT_SAVE_INTERVAL)
    return () => clearInterval(interval)
  }, [])
}

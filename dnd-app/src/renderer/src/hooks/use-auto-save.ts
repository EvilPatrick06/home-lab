import { useEffect, useRef } from 'react'
import { saveGameState } from '../services/io/game-state-saver'
import type { AbilityScoreMethod } from '../stores/use-builder-store'
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
  // Extended fields (all optional for backward compat with old 4-field drafts)
  abilityScoreMethod?: AbilityScoreMethod
  selectedSkills?: string[]
  maxSkills?: number
  classEquipment?: Array<{ name: string; quantity: number; source: string }>
  bgEquipment?: Array<{ option: string; items: string[]; source: string }>
  classEquipmentChoice?: string | null
  backgroundEquipmentChoice?: 'equipment' | 'gold' | null
  chosenLanguages?: string[]
  selectedSpellIds?: string[]
  asiSelections?: Record<string, string[]>
  backgroundAbilityBonuses?: Record<string, number>
  builderExpertiseSelections?: Record<string, string[]>
  targetLevel?: number
  characterAlignment?: string
  characterGender?: string
  characterDeity?: string
  characterAge?: string
  characterNotes?: string
  characterPersonality?: string
  characterIdeals?: string
  characterBonds?: string
  characterFlaws?: string
  characterBackstory?: string
  characterHeight?: string
  characterWeight?: string
  characterEyes?: string
  characterHair?: string
  characterSkin?: string
  characterAppearance?: string
  buildSlots?: Array<{
    id: string
    selectedId: string | null
    selectedName: string | null
  }>
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
      timestamp: Date.now(),
      abilityScoreMethod: state.abilityScoreMethod,
      selectedSkills: state.selectedSkills,
      maxSkills: state.maxSkills,
      classEquipment: state.classEquipment,
      bgEquipment: state.bgEquipment,
      classEquipmentChoice: state.classEquipmentChoice,
      backgroundEquipmentChoice: state.backgroundEquipmentChoice,
      chosenLanguages: state.chosenLanguages,
      selectedSpellIds: state.selectedSpellIds,
      asiSelections: state.asiSelections,
      backgroundAbilityBonuses: state.backgroundAbilityBonuses,
      builderExpertiseSelections: state.builderExpertiseSelections,
      targetLevel: state.targetLevel,
      characterAlignment: state.characterAlignment,
      characterGender: state.characterGender,
      characterDeity: state.characterDeity,
      characterAge: state.characterAge,
      characterNotes: state.characterNotes,
      characterPersonality: state.characterPersonality,
      characterIdeals: state.characterIdeals,
      characterBonds: state.characterBonds,
      characterFlaws: state.characterFlaws,
      characterBackstory: state.characterBackstory,
      characterHeight: state.characterHeight,
      characterWeight: state.characterWeight,
      characterEyes: state.characterEyes,
      characterHair: state.characterHair,
      characterSkin: state.characterSkin,
      characterAppearance: state.characterAppearance,
      buildSlots: state.buildSlots.map((s) => ({
        id: s.id,
        selectedId: s.selectedId,
        selectedName: s.selectedName
      }))
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

export function applyBuilderDraft(draft: BuilderDraft): void {
  const partial: Record<string, unknown> = {
    phase: 'building',
    gameSystem: draft.gameSystem,
    characterName: draft.characterName,
    abilityScores: draft.abilityScores
  }

  if (draft.abilityScoreMethod) partial.abilityScoreMethod = draft.abilityScoreMethod
  if (draft.selectedSkills) partial.selectedSkills = draft.selectedSkills
  if (draft.maxSkills !== undefined) partial.maxSkills = draft.maxSkills
  if (draft.classEquipment) partial.classEquipment = draft.classEquipment
  if (draft.bgEquipment) partial.bgEquipment = draft.bgEquipment
  if (draft.classEquipmentChoice !== undefined) partial.classEquipmentChoice = draft.classEquipmentChoice
  if (draft.backgroundEquipmentChoice !== undefined) partial.backgroundEquipmentChoice = draft.backgroundEquipmentChoice
  if (draft.chosenLanguages) partial.chosenLanguages = draft.chosenLanguages
  if (draft.selectedSpellIds) partial.selectedSpellIds = draft.selectedSpellIds
  if (draft.asiSelections) partial.asiSelections = draft.asiSelections
  if (draft.backgroundAbilityBonuses) partial.backgroundAbilityBonuses = draft.backgroundAbilityBonuses
  if (draft.builderExpertiseSelections) partial.builderExpertiseSelections = draft.builderExpertiseSelections
  if (draft.targetLevel !== undefined) partial.targetLevel = draft.targetLevel
  if (draft.characterAlignment) partial.characterAlignment = draft.characterAlignment
  if (draft.characterGender) partial.characterGender = draft.characterGender
  if (draft.characterDeity) partial.characterDeity = draft.characterDeity
  if (draft.characterAge) partial.characterAge = draft.characterAge
  if (draft.characterNotes) partial.characterNotes = draft.characterNotes
  if (draft.characterPersonality) partial.characterPersonality = draft.characterPersonality
  if (draft.characterIdeals) partial.characterIdeals = draft.characterIdeals
  if (draft.characterBonds) partial.characterBonds = draft.characterBonds
  if (draft.characterFlaws) partial.characterFlaws = draft.characterFlaws
  if (draft.characterBackstory) partial.characterBackstory = draft.characterBackstory
  if (draft.characterHeight) partial.characterHeight = draft.characterHeight
  if (draft.characterWeight) partial.characterWeight = draft.characterWeight
  if (draft.characterEyes) partial.characterEyes = draft.characterEyes
  if (draft.characterHair) partial.characterHair = draft.characterHair
  if (draft.characterSkin) partial.characterSkin = draft.characterSkin
  if (draft.characterAppearance) partial.characterAppearance = draft.characterAppearance

  // Restore build slot selections if saved
  if (draft.buildSlots) {
    const currentSlots = useBuilderStore.getState().buildSlots
    if (currentSlots.length > 0) {
      const restored = currentSlots.map((slot) => {
        const saved = draft.buildSlots!.find((s) => s.id === slot.id)
        if (saved?.selectedId) {
          return { ...slot, selectedId: saved.selectedId, selectedName: saved.selectedName }
        }
        return slot
      })
      partial.buildSlots = restored
    }
  }

  useBuilderStore.setState(partial)
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

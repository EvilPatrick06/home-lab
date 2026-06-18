import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER, DEFAULT_OLLAMA_URL } from '../../constants'
import { addToast } from '../../hooks/use-toast'
import { useT } from '../../i18n'
import { type Adventure, loadAdventures } from '../../services/adventure-loader'
import { clearWizardDraft, loadWizardDraft, saveWizardDraft } from '../../services/campaign-wizard-draft'
import { applySeedPackToCampaign } from '../../services/seed-packs/seed-pack-apply'
import { parseSeedPack, type SeedPack } from '../../services/seed-packs/seed-pack-schema'
import { seedQuestsFromPack } from '../../services/seed-packs/seed-quests'
import { useCampaignStore } from '../../stores/use-campaign-store'
import { useCharacterStore } from '../../stores/use-character-store'
import {
  type AiProviderType,
  type CalendarConfig,
  type Campaign,
  type CampaignType,
  type CustomRule,
  DEFAULT_OPTIONAL_RULES,
  type TurnMode
} from '../../types/campaign'
import type { GameSystem } from '../../types/game-system'
import type { GameMap } from '../../types/map'
import { logger } from '../../utils/logger'
import { Button } from '../ui'
import AdventureSelector from './AdventureSelector'
import AiProviderSetup from './AiProviderSetup'
import type { CustomAudioEntry } from './AudioStep'
import AudioStep from './AudioStep'
import CalendarStep from './CalendarStep'
import CharacterStep from './CharacterStep'
import DetailsStep from './DetailsStep'
import MapConfigStep from './MapConfigStep'
import ReviewStep from './ReviewStep'
import RulesStep from './RulesStep'
import SeedPackStep from './SeedPackStep'
import SessionZeroStep, { DEFAULT_SESSION_ZERO, type SessionZeroData } from './SessionZeroStep'
import StartStep from './StartStep'
import SystemStep from './SystemStep'

// Step keys. 'character' is inserted after 'details' ONLY for solo campaigns (see `flow`).
type StepKey =
  | 'system'
  | 'details'
  | 'character'
  | 'aiDm'
  | 'adventure'
  | 'seedPack'
  | 'sessionZero'
  | 'rules'
  | 'calendar'
  | 'maps'
  | 'audio'
  | 'review'

export default function CampaignWizard(): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  const createCampaign = useCampaignStore((s) => s.createCampaign)
  const saveCampaign = useCampaignStore((s) => s.saveCampaign)
  const characters = useCharacterStore((s) => s.characters)
  const loadCharacters = useCharacterStore((s) => s.loadCharacters)

  // Start mode: show campaign browser first, then wizard
  const [startMode, setStartMode] = useState<'start' | 'wizard'>('start')

  // Step state
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  // Wizard data
  const [system, setSystem] = useState<GameSystem | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [turnMode, setTurnMode] = useState<TurnMode>('initiative')
  const [lobbyMessage, setLobbyMessage] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  // Phase 32 — 'p2p' (this device), 'cloud' (Pi relay), or 'solo' (single-player). Default p2p.
  const [hostingMode, setHostingMode] = useState<'p2p' | 'cloud' | 'solo'>('p2p')
  const [campaignType, setCampaignType] = useState<CampaignType>('custom')
  const [selectedAdventureId, setSelectedAdventureId] = useState<string | null>(null)
  const [seedPack, setSeedPack] = useState<SeedPack | null>(null) // PHASE-37
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [customRules, setCustomRules] = useState<CustomRule[]>([])
  const [calendar, setCalendar] = useState<CalendarConfig | null>(null)
  const [maps, setMaps] = useState<GameMap[]>([])
  const [customAudio, setCustomAudio] = useState<CustomAudioEntry[]>([])
  // PHASE-13 13F — the actual picked File bytes (entry id → File), uploaded after the
  // campaign is created. Not persisted in the draft (File objects don't serialize).
  const audioFilesRef = useRef<Map<string, File>>(new Map())
  const [sessionZero, setSessionZero] = useState<SessionZeroData>({ ...DEFAULT_SESSION_ZERO })

  // Adventure exclusion state
  const [excludedNpcIds, setExcludedNpcIds] = useState<string[]>([])
  const [excludedLoreIds, setExcludedLoreIds] = useState<string[]>([])
  const [excludedEncounterIds, setExcludedEncounterIds] = useState<string[]>([])
  const [excludedMapIds, setExcludedMapIds] = useState<string[]>([])

  // AI DM config
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiProvider, setAiProvider] = useState<AiProviderType>(DEFAULT_AI_PROVIDER)
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL)
  const [aiOllamaUrl, setAiOllamaUrl] = useState(DEFAULT_OLLAMA_URL)
  const [aiApiKey, setAiApiKey] = useState('')
  // PHASE-29 — per-task routing + local-endpoint flavor (default off / 'ollama').
  const [aiRoutingEnabled, setAiRoutingEnabled] = useState(false)
  const [aiRoutingSmallModel, setAiRoutingSmallModel] = useState('')
  const [aiLocalEndpointFlavor, setAiLocalEndpointFlavor] = useState<'ollama' | 'llamacpp'>('ollama')
  const [ollamaReady, setOllamaReady] = useState(false)

  // Load the player's characters (for the solo PC selector).
  useEffect(() => {
    void loadCharacters()
  }, [loadCharacters])

  // Resume an in-progress setup if the player navigated away (to create/edit a PC, or to
  // Global Settings) and came back. Runs once on mount BEFORE the save effect below.
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const d = loadWizardDraft()
    if (!d) return
    setStartMode('wizard')
    setStep(typeof d.step === 'number' ? d.step : 0)
    if ('system' in d) setSystem((d.system as GameSystem | null) ?? null)
    setName((d.name as string) ?? '')
    setDescription((d.description as string) ?? '')
    setMaxPlayers((d.maxPlayers as number) ?? 4)
    setTurnMode((d.turnMode as TurnMode) ?? 'initiative')
    setLobbyMessage((d.lobbyMessage as string) ?? '')
    setIsPublic((d.isPublic as boolean) ?? true)
    setHostingMode((d.hostingMode as 'p2p' | 'cloud' | 'solo') ?? 'p2p')
    setCampaignType((d.campaignType as CampaignType) ?? 'custom')
    setSelectedAdventureId((d.selectedAdventureId as string | null) ?? null)
    // PHASE-37 — restore the seed pack via parseSeedPack (never trust localStorage shape).
    if (d.seedPack) {
      const parsed = parseSeedPack(d.seedPack)
      setSeedPack(parsed.ok ? parsed.pack : null)
    }
    setSelectedCharacterId((d.selectedCharacterId as string | null) ?? null)
    setCustomRules((d.customRules as CustomRule[]) ?? [])
    setCalendar((d.calendar as CalendarConfig | null) ?? null)
    setMaps((d.maps as GameMap[]) ?? [])
    setCustomAudio((d.customAudio as CustomAudioEntry[]) ?? [])
    setSessionZero((d.sessionZero as SessionZeroData) ?? { ...DEFAULT_SESSION_ZERO })
    setExcludedNpcIds((d.excludedNpcIds as string[]) ?? [])
    setExcludedLoreIds((d.excludedLoreIds as string[]) ?? [])
    setExcludedEncounterIds((d.excludedEncounterIds as string[]) ?? [])
    setExcludedMapIds((d.excludedMapIds as string[]) ?? [])
    setAiEnabled((d.aiEnabled as boolean) ?? false)
    setAiProvider((d.aiProvider as AiProviderType) ?? DEFAULT_AI_PROVIDER)
    setAiModel((d.aiModel as string) ?? DEFAULT_AI_MODEL)
    setAiOllamaUrl((d.aiOllamaUrl as string) ?? DEFAULT_OLLAMA_URL)
    setAiApiKey((d.aiApiKey as string) ?? '')
    setAiRoutingEnabled((d.aiRoutingEnabled as boolean) ?? false)
    setAiRoutingSmallModel((d.aiRoutingSmallModel as string) ?? '')
    setAiLocalEndpointFlavor((d.aiLocalEndpointFlavor as 'ollama' | 'llamacpp') ?? 'ollama')
  }, [])

  // Steps. The Character (PC selector) step exists ONLY for solo campaigns.
  const flow = useMemo<StepKey[]>(() => {
    const f: StepKey[] = ['system', 'details']
    if (hostingMode === 'solo') f.push('character')
    f.push('aiDm', 'adventure', 'seedPack', 'sessionZero', 'rules', 'calendar', 'maps', 'audio', 'review')
    return f
  }, [hostingMode])
  const stepKey: StepKey = flow[Math.min(step, flow.length - 1)] ?? 'system'

  // Persist setup progress on every change so leaving (to a PC builder / Global Settings)
  // and coming back resumes the exact step instead of dropping to the campaign list.
  useEffect(() => {
    if (startMode !== 'wizard' || !restoredRef.current) return
    saveWizardDraft({
      step,
      system,
      name,
      description,
      maxPlayers,
      turnMode,
      lobbyMessage,
      isPublic,
      hostingMode,
      campaignType,
      selectedAdventureId,
      seedPack,
      selectedCharacterId,
      customRules,
      calendar,
      maps,
      customAudio,
      sessionZero,
      excludedNpcIds,
      excludedLoreIds,
      excludedEncounterIds,
      excludedMapIds,
      aiEnabled,
      aiProvider,
      aiModel,
      aiOllamaUrl,
      aiApiKey,
      aiRoutingEnabled,
      aiRoutingSmallModel,
      aiLocalEndpointFlavor
    })
  }, [
    startMode,
    step,
    system,
    name,
    description,
    maxPlayers,
    turnMode,
    lobbyMessage,
    isPublic,
    hostingMode,
    campaignType,
    selectedAdventureId,
    seedPack,
    selectedCharacterId,
    customRules,
    calendar,
    maps,
    customAudio,
    sessionZero,
    excludedNpcIds,
    excludedLoreIds,
    excludedEncounterIds,
    excludedMapIds,
    aiEnabled,
    aiProvider,
    aiModel,
    aiOllamaUrl,
    aiApiKey,
    aiRoutingEnabled,
    aiRoutingSmallModel,
    aiLocalEndpointFlavor
  ])

  // For review step: resolve adventure name
  const [adventures, setAdventures] = useState<Adventure[]>([])
  useEffect(() => {
    loadAdventures()
      .then(setAdventures)
      .catch((err) => {
        logger.error('[CampaignWizard] Failed to load adventures:', err)
      })
  }, [])

  const selectedAdventure = adventures.find((a) => a.id === selectedAdventureId) ?? null

  const handleSelectAdventure = (id: string | null): void => {
    setSelectedAdventureId(id)
    setExcludedNpcIds([])
    setExcludedLoreIds([])
    setExcludedEncounterIds([])
    setExcludedMapIds([])
  }

  const canAdvance = (): boolean => {
    switch (stepKey) {
      case 'system':
        return system !== null
      case 'details':
        return name.trim().length > 0
      case 'character':
        return selectedCharacterId !== null // solo must pick (or create) a PC
      case 'aiDm':
        return !aiEnabled || ollamaReady
      case 'adventure':
        return campaignType === 'custom' || selectedAdventureId !== null
      default:
        return true // Session Zero / Rules / Calendar / Maps / Audio / Review are optional
    }
  }

  const handleNext = (): void => {
    if (step < flow.length - 1) setStep((s) => s + 1)
  }

  const handleBack = (): void => {
    if (step > 0) setStep((s) => s - 1)
  }

  const startFresh = (): void => {
    clearWizardDraft()
    setStartMode('wizard')
    setStep(0)
  }

  // Leave to create/edit a PC. Setup progress is already persisted (save effect), so the
  // builder returns here (returnTo=/make via navigation state — the builder reads
  // location.state.returnTo) and the wizard resumes on the Character step.
  const goCreatePc = (): void => {
    navigate('/characters/5e/create', { state: { returnTo: '/make' } })
  }
  const goEditPc = (id: string): void => {
    navigate(`/characters/5e/edit/${id}`, { state: { returnTo: '/make' } })
  }

  const handleCreate = async (): Promise<void> => {
    if (!system || !name.trim()) return

    setSubmitting(true)
    try {
      // Build maps list: merge adventure map assignments (minus excluded) with user-selected maps
      const campaignMaps = [...maps]
      if (selectedAdventure?.mapAssignments) {
        for (const assignment of selectedAdventure.mapAssignments) {
          if (excludedMapIds.includes(assignment.builtInMapId)) continue
          if (!campaignMaps.some((m) => m.id === assignment.builtInMapId)) {
            const chapter = selectedAdventure.chapters[assignment.chapterIndex]
            campaignMaps.push({
              id: assignment.builtInMapId,
              name: chapter?.title ?? assignment.builtInMapId,
              campaignId: 'pending',
              imagePath: `./data/5e/maps/${assignment.builtInMapId}.png`,
              width: 1920,
              height: 1080,
              grid: {
                enabled: true,
                cellSize: 40,
                offsetX: 0,
                offsetY: 0,
                color: '#ffffff',
                opacity: 0.2,
                type: 'square'
              },
              tokens: [],
              fogOfWar: { enabled: false, revealedCells: [] },
              terrain: [],
              createdAt: new Date().toISOString()
            })
          }
        }
      }

      const campaign = await createCampaign({
        name: name.trim(),
        description: description.trim(),
        system,
        type: campaignType,
        presetId: selectedAdventureId ?? undefined,
        dmId: 'local-dm',
        turnMode,
        hostingMode,
        maps: campaignMaps,
        activeMapId: campaignMaps.length > 0 ? campaignMaps[0].id : undefined,
        npcs:
          selectedAdventure?.npcs
            ?.filter((npc) => !excludedNpcIds.includes(npc.id))
            .map((npc) => ({
              id: npc.id,
              name: npc.name,
              description: npc.description ?? '',
              location: npc.location,
              isVisible: npc.role !== 'enemy',
              statBlockId: npc.statBlockId,
              role: npc.role,
              personality: npc.personality,
              motivation: npc.motivation,
              notes: `Role: ${npc.role}`
            })) ?? [],
        encounters:
          selectedAdventure?.encounters?.filter((e) => !excludedEncounterIds.includes(e.id || '')) ?? undefined,
        lore:
          selectedAdventure?.lore
            ?.filter((l) => !excludedLoreIds.includes(l.id))
            .map((l) => ({
              id: l.id,
              title: l.title,
              content: l.content,
              category: l.category,
              isVisibleToPlayers: l.category !== 'faction',
              createdAt: new Date().toISOString()
            })) ?? undefined,
        customRules,
        settings: {
          maxPlayers,
          lobbyMessage: lobbyMessage.trim(),
          levelRange: selectedAdventure?.levelRange ?? seedPack?.levelRange ?? { min: 1, max: 20 },
          allowCharCreationInLobby: true,
          optionalRules: DEFAULT_OPTIONAL_RULES,
          isPrivate: !isPublic,
          maxSpectators: 5
        },
        calendar: calendar ?? undefined,
        customAudio:
          customAudio.length > 0
            ? customAudio.map((a) => ({
                id: a.id,
                fileName: a.fileName,
                displayName: a.displayName,
                category: a.category
              }))
            : undefined,
        sessionZero:
          sessionZero.contentLimits.length > 0 ||
          sessionZero.tone !== 'heroic' ||
          sessionZero.playSchedule.trim() ||
          sessionZero.additionalNotes.trim() ||
          sessionZero.pvpAllowed ||
          sessionZero.characterDeathExpectation !== 'possible' ||
          (sessionZero.lines?.length ?? 0) > 0 ||
          (sessionZero.veils?.length ?? 0) > 0 ||
          sessionZero.xCardEnabled
            ? sessionZero
            : undefined,
        aiDm: aiEnabled
          ? {
              enabled: true,
              provider: aiProvider,
              model: aiModel,
              ollamaUrl: aiOllamaUrl,
              claudeApiKey: aiProvider === 'claude' ? aiApiKey : undefined,
              openaiApiKey: aiProvider === 'openai' ? aiApiKey : undefined,
              geminiApiKey: aiProvider === 'gemini' ? aiApiKey : undefined,
              // PHASE-29: per-task routing + local-endpoint flavor.
              routingEnabled: aiRoutingEnabled,
              routingSmallModel: aiRoutingSmallModel,
              localEndpointFlavor: aiLocalEndpointFlavor
            }
          : undefined
      })

      // Resolve pending map IDs to the actual campaign ID
      const resolvedMaps = campaign.maps.map((map) => ({
        ...map,
        campaignId: map.campaignId === 'pending' ? campaign.id : map.campaignId
      }))

      // Seed the solo player's chosen PC so the game has a character from the start.
      const soloChar = hostingMode === 'solo' ? characters.find((c) => c.id === selectedCharacterId) : undefined
      const players =
        hostingMode === 'solo' && selectedCharacterId
          ? [
              {
                userId: 'local-solo',
                displayName: soloChar?.name ?? 'Player',
                characterId: selectedCharacterId,
                joinedAt: new Date().toISOString(),
                isActive: true,
                isReady: true
              }
            ]
          : campaign.players

      // PHASE-13 13F — upload the picked custom-audio files now that we have the campaign id,
      // then rewrite each entry's fileName to the SANITIZED name the handler stored on disk
      // (so DMAudioPanel resolves it later). Per-file failures warn and continue — never block.
      let resolvedCustomAudio = campaign.customAudio
      if (campaign.customAudio && campaign.customAudio.length > 0 && audioFilesRef.current.size > 0) {
        const sanitizedById = new Map<string, string>()
        for (const entry of campaign.customAudio) {
          const file = audioFilesRef.current.get(entry.id)
          if (!file) continue
          try {
            const result = await window.api.audioUploadCustom(
              campaign.id,
              file.name,
              await file.arrayBuffer(),
              entry.displayName,
              entry.category
            )
            if (result.success && result.data) {
              sanitizedById.set(entry.id, result.data.fileName)
            } else {
              addToast(t('campaign.campaignWizard.audioUploadFailed', { name: entry.displayName }), 'warning')
            }
          } catch (audioErr) {
            logger.error('Failed to upload custom audio:', entry.fileName, audioErr)
            addToast(t('campaign.campaignWizard.audioUploadFailed', { name: entry.displayName }), 'warning')
          }
        }
        if (sanitizedById.size > 0) {
          resolvedCustomAudio = campaign.customAudio.map((a) =>
            sanitizedById.has(a.id) ? { ...a, fileName: sanitizedById.get(a.id) as string } : a
          )
        }
      }

      // PHASE-37 — apply the chosen seed pack (lore/NPCs/arcs/tables/tone/opening scene) over the
      // resolved campaign, then persist. Quests are seeded separately (main-side store) below.
      let finalCampaign: Campaign = { ...campaign, maps: resolvedMaps, players, customAudio: resolvedCustomAudio }
      if (seedPack) finalCampaign = applySeedPackToCampaign(finalCampaign, seedPack)

      const audioChanged = resolvedCustomAudio !== campaign.customAudio
      const mapsChanged = resolvedMaps.some((map, index) => map.campaignId !== campaign.maps[index].campaignId)
      if (mapsChanged || players !== campaign.players || audioChanged || seedPack !== null) {
        await saveCampaign(finalCampaign)
      }

      if (seedPack?.quests?.length) {
        const r = await seedQuestsFromPack(campaign.id, seedPack.quests)
        if (!r.success) addToast(t('campaign.seedPacks.questSeedFailed'), 'error')
      }

      if (aiEnabled) {
        try {
          await window.api.ai.configure({
            provider: aiProvider,
            model: aiModel,
            ollamaUrl: aiOllamaUrl,
            claudeApiKey: aiProvider === 'claude' ? aiApiKey : undefined,
            openaiApiKey: aiProvider === 'openai' ? aiApiKey : undefined,
            geminiApiKey: aiProvider === 'gemini' ? aiApiKey : undefined,
            // PHASE-29: per-task routing + local-endpoint flavor.
            routing: { enabled: aiRoutingEnabled, smallModel: aiRoutingSmallModel },
            localEndpointFlavor: aiLocalEndpointFlavor
          })
        } catch (configErr) {
          logger.error('Failed to configure AI DM after campaign creation:', configErr)
          addToast(t('campaign.campaignWizard.aiConfigFailed'), 'error')
        }
      }

      clearWizardDraft()
      navigate(`/campaign/${campaign.id}`)
    } catch (error) {
      logger.error('Failed to create campaign:', error)
      addToast(t('campaign.campaignWizard.createFailed'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Generate a temporary campaign ID for map entries
  const tempCampaignId = 'pending'

  if (startMode === 'start') {
    return (
      <div>
        <StartStep onNewCampaign={startFresh} />
      </div>
    )
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="flex gap-2 mb-2 max-w-4xl">
        {flow.map((k) => (
          <div
            key={k}
            className={`flex-1 h-2 rounded-full transition-colors ${
              flow.indexOf(stepKey) >= flow.indexOf(k) ? 'bg-accent-strong' : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
      <p className="text-muted text-sm mb-8">
        {t('campaign.campaignWizard.stepIndicator', {
          current: step + 1,
          total: flow.length,
          name: t(`campaign.campaignWizard.steps.${stepKey}`)
        })}
      </p>

      {/* Step content */}
      {stepKey === 'system' && <SystemStep selected={system} onSelect={setSystem} />}

      {stepKey === 'details' && (
        <DetailsStep
          data={{ name, description, maxPlayers, turnMode, lobbyMessage, isPublic, hostingMode }}
          onChange={(data) => {
            setName(data.name)
            setDescription(data.description)
            setMaxPlayers(data.maxPlayers)
            setTurnMode(data.turnMode)
            setLobbyMessage(data.lobbyMessage)
            setIsPublic(data.isPublic)
            setHostingMode(data.hostingMode)
          }}
        />
      )}

      {stepKey === 'character' && (
        <CharacterStep
          characters={characters.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedCharacterId}
          onSelect={setSelectedCharacterId}
          onCreateNew={goCreatePc}
          onEdit={goEditPc}
        />
      )}

      {stepKey === 'aiDm' && (
        <AiProviderSetup
          enabled={aiEnabled}
          provider={aiProvider}
          model={aiModel}
          ollamaUrl={aiOllamaUrl}
          apiKey={aiApiKey}
          onProviderReady={setOllamaReady}
          routingEnabled={aiRoutingEnabled}
          routingSmallModel={aiRoutingSmallModel}
          localEndpointFlavor={aiLocalEndpointFlavor}
          onChange={(data) => {
            setAiEnabled(data.enabled)
            setAiProvider(data.provider)
            setAiModel(data.model)
            setAiOllamaUrl(data.ollamaUrl)
            setAiApiKey(data.apiKey)
            // PHASE-29: only the changed field is present; keep prior when absent.
            setAiRoutingEnabled((prev) => data.routingEnabled ?? prev)
            setAiRoutingSmallModel((prev) => data.routingSmallModel ?? prev)
            setAiLocalEndpointFlavor((prev) => data.localEndpointFlavor ?? prev)
          }}
        />
      )}

      {stepKey === 'adventure' && system && (
        <AdventureSelector
          system={system}
          campaignType={campaignType}
          selectedAdventureId={selectedAdventureId}
          onSelectType={setCampaignType}
          onSelectAdventure={handleSelectAdventure}
          excludedNpcIds={excludedNpcIds}
          onExcludedNpcsChange={setExcludedNpcIds}
          excludedLoreIds={excludedLoreIds}
          onExcludedLoreChange={setExcludedLoreIds}
          excludedEncounterIds={excludedEncounterIds}
          onExcludedEncounterChange={setExcludedEncounterIds}
          excludedMapIds={excludedMapIds}
          onExcludedMapsChange={setExcludedMapIds}
        />
      )}

      {stepKey === 'seedPack' && (
        <SeedPackStep
          selectedPack={seedPack}
          onSelect={(p) => {
            setSeedPack(p)
            // Prefill name/description from the pack ONLY when still empty.
            if (p) {
              if (!name.trim()) setName(p.name)
              if (!description.trim()) setDescription(p.description)
            }
          }}
        />
      )}

      {stepKey === 'sessionZero' && (
        <SessionZeroStep
          data={sessionZero}
          onChange={setSessionZero}
          customRules={customRules}
          onRulesChange={setCustomRules}
        />
      )}

      {stepKey === 'rules' && <RulesStep rules={customRules} onChange={setCustomRules} />}

      {stepKey === 'calendar' && <CalendarStep calendar={calendar} onChange={setCalendar} />}

      {stepKey === 'maps' && (
        <MapConfigStep
          maps={maps}
          campaignId={tempCampaignId}
          onChange={setMaps}
          adventureMaps={
            selectedAdventure?.mapAssignments
              ?.filter((a) => !excludedMapIds.includes(a.builtInMapId))
              .map((a) => ({
                id: a.builtInMapId,
                name: selectedAdventure.chapters[a.chapterIndex]?.title ?? a.builtInMapId
              })) ?? undefined
          }
        />
      )}

      {stepKey === 'audio' && (
        <AudioStep
          audioEntries={customAudio}
          onChange={setCustomAudio}
          onFilesChange={(files) => {
            audioFilesRef.current = files
          }}
        />
      )}

      {stepKey === 'review' && system && (
        <ReviewStep
          system={system}
          name={name}
          description={description}
          maxPlayers={maxPlayers}
          turnMode={turnMode}
          lobbyMessage={lobbyMessage}
          campaignType={campaignType}
          adventureName={selectedAdventure?.name ?? null}
          seedPackName={seedPack?.name ?? null}
          customRules={customRules}
          maps={maps}
          customAudioCount={customAudio.length}
          calendar={calendar}
          aiDm={aiEnabled ? { provider: aiProvider, model: aiModel, ollamaUrl: aiOllamaUrl } : null}
          sessionZero={sessionZero}
          onSubmit={handleCreate}
          submitting={submitting}
        />
      )}

      {/* Navigation buttons (Review step has its own submit button) */}
      {stepKey !== 'review' && (
        <div className="flex gap-4 mt-8 max-w-4xl">
          {step > 0 && (
            <Button variant="secondary" onClick={handleBack}>
              {t('campaign.campaignWizard.back')}
            </Button>
          )}
          <Button onClick={handleNext} disabled={!canAdvance()}>
            {t('campaign.campaignWizard.next')}
          </Button>
        </div>
      )}
      {stepKey === 'review' && step > 0 && (
        <div className="flex gap-4 mt-4 max-w-4xl">
          <Button variant="secondary" onClick={handleBack}>
            {t('campaign.campaignWizard.back')}
          </Button>
        </div>
      )}
    </div>
  )
}

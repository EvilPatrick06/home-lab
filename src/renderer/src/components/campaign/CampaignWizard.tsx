import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { DEFAULT_AI_MODEL, DEFAULT_AI_PROVIDER, DEFAULT_OLLAMA_URL } from '../../constants'
import { addToast } from '../../hooks/use-toast'
import { type Adventure, loadAdventures } from '../../services/adventure-loader'
import { useCampaignStore } from '../../stores/use-campaign-store'
import {
  type AiProviderType,
  type CalendarConfig,
  type CampaignType,
  type CustomRule,
  DEFAULT_OPTIONAL_RULES,
  type TurnMode
} from '../../types/campaign'

import type { GameSystem } from '../../types/game-system'
import type { GameMap } from '../../types/map'
import { logger } from '../../utils/logger'
import { Button } from '../ui'
import { AdventureSelector, AudioStep, DetailsStep, MapConfigStep, ReviewStep, RulesStep, SystemStep } from '.'
import AiProviderSetup from './AiProviderSetup'
import type { CustomAudioEntry } from './AudioStep'
import CalendarStep from './CalendarStep'
import SessionZeroStep, { DEFAULT_SESSION_ZERO, type SessionZeroData } from './SessionZeroStep'
import StartStep from './StartStep'

const STEPS = [
  'System',
  'Details',
  'AI DM',
  'Adventure',
  'Session Zero',
  'Rules',
  'Calendar',
  'Maps',
  'Audio',
  'Review'
]

export default function CampaignWizard(): JSX.Element {
  const navigate = useNavigate()
  const createCampaign = useCampaignStore((s) => s.createCampaign)
  const saveCampaign = useCampaignStore((s) => s.saveCampaign)

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
  const [campaignType, setCampaignType] = useState<CampaignType>('custom')
  const [selectedAdventureId, setSelectedAdventureId] = useState<string | null>(null)
  const [customRules, setCustomRules] = useState<CustomRule[]>([])
  const [calendar, setCalendar] = useState<CalendarConfig | null>(null)
  const [maps, setMaps] = useState<GameMap[]>([])
  const [customAudio, setCustomAudio] = useState<CustomAudioEntry[]>([])
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
  const [ollamaReady, setOllamaReady] = useState(false)

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
    switch (step) {
      case 0:
        return system !== null
      case 1:
        return name.trim().length > 0
      case 2:
        if (!aiEnabled) return true
        return ollamaReady
      case 3:
        return campaignType === 'custom' || selectedAdventureId !== null
      case 4:
        return true // Session Zero is optional
      case 5:
        return true // Rules are optional
      case 6:
        return true // Calendar is optional
      case 7:
        return true // Maps are optional
      case 8:
        return true // Audio is optional
      case 9:
        return true // Review — create button is inline
      default:
        return false
    }
  }

  const handleNext = (): void => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    }
  }

  const handleBack = (): void => {
    if (step > 0) {
      setStep((s) => s - 1)
    }
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
          levelRange: selectedAdventure?.levelRange ?? { min: 1, max: 20 },
          allowCharCreationInLobby: true,
          optionalRules: DEFAULT_OPTIONAL_RULES
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
          sessionZero.characterDeathExpectation !== 'possible'
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
              geminiApiKey: aiProvider === 'gemini' ? aiApiKey : undefined
            }
          : undefined
      })

      // Resolve pending map IDs to the actual campaign ID
      const resolvedMaps = campaign.maps.map((map) => ({
        ...map,
        campaignId: map.campaignId === 'pending' ? campaign.id : map.campaignId
      }))

      // If maps were updated, save the campaign again with resolved IDs
      if (resolvedMaps.some((map, index) => map.campaignId !== campaign.maps[index].campaignId)) {
        const updatedCampaign = {
          ...campaign,
          maps: resolvedMaps
        }
        await saveCampaign(updatedCampaign)
      }

      if (aiEnabled) {
        try {
          await window.api.ai.configure({
            provider: aiProvider,
            model: aiModel,
            ollamaUrl: aiOllamaUrl,
            claudeApiKey: aiProvider === 'claude' ? aiApiKey : undefined,
            openaiApiKey: aiProvider === 'openai' ? aiApiKey : undefined,
            geminiApiKey: aiProvider === 'gemini' ? aiApiKey : undefined
          })
        } catch (configErr) {
          logger.error('Failed to configure AI DM after campaign creation:', configErr)
          addToast(
            'Campaign created, but AI DM configuration failed. You can reconfigure it from the campaign settings.',
            'error'
          )
        }
      }

      navigate(`/campaign/${campaign.id}`)
    } catch (error) {
      logger.error('Failed to create campaign:', error)
      addToast('Failed to create campaign. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Generate a temporary campaign ID for map entries
  const tempCampaignId = 'pending'

  if (startMode === 'start') {
    return (
      <div>
        <StartStep onNewCampaign={() => setStartMode('wizard')} />
      </div>
    )
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="flex gap-2 mb-2 max-w-2xl">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-2 rounded-full transition-colors ${i <= step ? 'bg-amber-500' : 'bg-gray-700'}`}
          />
        ))}
      </div>
      <p className="text-gray-400 text-sm mb-8">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>

      {/* Step content */}
      {step === 0 && <SystemStep selected={system} onSelect={setSystem} />}

      {step === 1 && (
        <DetailsStep
          data={{ name, description, maxPlayers, turnMode, lobbyMessage }}
          onChange={(data) => {
            setName(data.name)
            setDescription(data.description)
            setMaxPlayers(data.maxPlayers)
            setTurnMode(data.turnMode)
            setLobbyMessage(data.lobbyMessage)
          }}
        />
      )}

      {step === 2 && (
        <AiProviderSetup
          enabled={aiEnabled}
          provider={aiProvider}
          model={aiModel}
          ollamaUrl={aiOllamaUrl}
          apiKey={aiApiKey}
          onProviderReady={setOllamaReady}
          onChange={(data) => {
            setAiEnabled(data.enabled)
            setAiProvider(data.provider)
            setAiModel(data.model)
            setAiOllamaUrl(data.ollamaUrl)
            setAiApiKey(data.apiKey)
          }}
        />
      )}

      {step === 3 && system && (
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

      {step === 4 && (
        <SessionZeroStep
          data={sessionZero}
          onChange={setSessionZero}
          customRules={customRules}
          onRulesChange={setCustomRules}
        />
      )}

      {step === 5 && <RulesStep rules={customRules} onChange={setCustomRules} />}

      {step === 6 && <CalendarStep calendar={calendar} onChange={setCalendar} />}

      {step === 7 && (
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

      {step === 8 && <AudioStep audioEntries={customAudio} onChange={setCustomAudio} />}

      {step === 9 && system && (
        <ReviewStep
          system={system}
          name={name}
          description={description}
          maxPlayers={maxPlayers}
          turnMode={turnMode}
          lobbyMessage={lobbyMessage}
          campaignType={campaignType}
          adventureName={selectedAdventure?.name ?? null}
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
      {step < STEPS.length - 1 && (
        <div className="flex gap-4 mt-8 max-w-2xl">
          {step > 0 && (
            <Button variant="secondary" onClick={handleBack}>
              Back
            </Button>
          )}
          <Button onClick={handleNext} disabled={!canAdvance()}>
            Next
          </Button>
        </div>
      )}
      {step === STEPS.length - 1 && step > 0 && (
        <div className="flex gap-4 mt-4 max-w-2xl">
          <Button variant="secondary" onClick={handleBack}>
            Back
          </Button>
        </div>
      )}
    </div>
  )
}

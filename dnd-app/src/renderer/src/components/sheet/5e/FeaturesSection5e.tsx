import { useCallback, useEffect, useState } from 'react'
import { getBonusFeatCount } from '../../../data/xp-thresholds'
import { load5eInvocations, load5eMetamagic } from '../../../services/data-provider'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
import { useNetworkStore } from '../../../stores/network-store'
import type { Character5e, CustomFeature } from '../../../types/character-5e'
import type { FeatData, InvocationData, MetamagicData } from '../../../types/data'
import SheetSectionWrapper from '../shared/SheetSectionWrapper'
import { FeatureRow } from './FeatureCard5e'
import { BonusFeatPicker, FeatPicker } from './FeatureFilter5e'

interface FeaturesSection5eProps {
  character: Character5e
  readonly?: boolean
}

export default function FeaturesSection5e({ character, readonly }: FeaturesSection5eProps): JSX.Element {
  const rawClassFeatures = character.classFeatures ?? []
  // Annotate Elemental Fury with the chosen option
  const elementalFuryChoice = character.buildChoices?.elementalFuryChoice
  const classFeatures = rawClassFeatures.map((f) => {
    if (f.name === 'Elemental Fury' && elementalFuryChoice) {
      const choiceName = elementalFuryChoice === 'potent-spellcasting' ? 'Potent Spellcasting' : 'Primal Strike'
      return { ...f, name: `${f.name} (${choiceName})` }
    }
    if (f.name === 'Improved Elemental Fury' && elementalFuryChoice) {
      const choiceName = elementalFuryChoice === 'potent-spellcasting' ? 'Potent Spellcasting' : 'Primal Strike'
      return { ...f, name: `${f.name} (${choiceName})` }
    }
    return f
  })
  const feats = character.feats ?? []

  const [showPicker, setShowPicker] = useState(false)

  // Load invocation and metamagic data for display
  const [invocationData, setInvocationData] = useState<InvocationData[]>([])
  const [metamagicData, setMetamagicData] = useState<MetamagicData[]>([])
  const invocationsKnown = character.invocationsKnown ?? []
  const metamagicKnown = character.metamagicKnown ?? []

  useEffect(() => {
    if (invocationsKnown.length > 0) {
      load5eInvocations()
        .then(setInvocationData)
        .catch(() => setInvocationData([]))
    }
  }, [invocationsKnown.length])

  useEffect(() => {
    if (metamagicKnown.length > 0) {
      load5eMetamagic()
        .then(setMetamagicData)
        .catch(() => setMetamagicData([]))
    }
  }, [metamagicKnown.length])

  // Custom Features (DM-granted)
  const customFeatures = character.customFeatures ?? []
  const [showGrantForm, setShowGrantForm] = useState(false)
  const [grantName, setGrantName] = useState('')
  const [grantSource, setGrantSource] = useState('DM Award')
  const [grantDescription, setGrantDescription] = useState('')
  const [grantTemporary, setGrantTemporary] = useState(false)

  const saveCustomFeatureChange = useCallback(
    (updatedFeatures: CustomFeature[]): void => {
      const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
      const updated: Character5e = {
        ...(latest as Character5e),
        customFeatures: updatedFeatures.length > 0 ? updatedFeatures : undefined,
        updatedAt: new Date().toISOString()
      }
      useCharacterStore.getState().saveCharacter(updated)

      const { role, sendMessage } = useNetworkStore.getState()
      if (role === 'host' && updated.playerId !== 'local') {
        sendMessage('dm:character-update', {
          characterId: updated.id,
          characterData: updated,
          targetPeerId: updated.playerId
        })
        useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
      }
    },
    [character]
  )

  const handleGrantFeature = (): void => {
    if (!grantName.trim()) return
    const newFeature: CustomFeature = {
      id: crypto.randomUUID(),
      name: grantName.trim(),
      source: grantSource.trim() || 'DM Award',
      description: grantDescription.trim(),
      grantedAt: new Date().toISOString(),
      temporary: grantTemporary || undefined
    }
    saveCustomFeatureChange([...customFeatures, newFeature])
    setGrantName('')
    setGrantSource('DM Award')
    setGrantDescription('')
    setGrantTemporary(false)
    setShowGrantForm(false)
  }

  // Bonus feats after level 20 (PHB 2024 p.43)
  const bonusFeats = character.bonusFeats ?? []
  const bonusFeatSlots = character.levelingMode === 'xp' ? getBonusFeatCount(character.xp) : 0
  const bonusFeatsAvailable = bonusFeatSlots - bonusFeats.length
  const [showBonusFeatPicker, setShowBonusFeatPicker] = useState(false)

  const hasFeatures =
    character.features.length > 0 ||
    classFeatures.length > 0 ||
    feats.length > 0 ||
    invocationsKnown.length > 0 ||
    metamagicKnown.length > 0 ||
    bonusFeats.length > 0 ||
    bonusFeatsAvailable > 0 ||
    customFeatures.length > 0

  const saveBonusFeatChange = (updatedBonusFeats: Array<{ id: string; name: string; description: string }>): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    const updated: Character5e = {
      ...(latest as Character5e),
      bonusFeats: updatedBonusFeats,
      updatedAt: new Date().toISOString()
    }
    useCharacterStore.getState().saveCharacter(updated)

    const { role, sendMessage } = useNetworkStore.getState()
    if (role === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
    }
  }

  const saveFeatChange = (
    updatedFeats: Array<{ id: string; name: string; description: string; choices?: Record<string, string | string[]> }>
  ): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    const updated: Character5e = {
      ...(latest as Character5e),
      feats: updatedFeats,
      updatedAt: new Date().toISOString()
    }
    useCharacterStore.getState().saveCharacter(updated)

    // DM broadcast pattern
    const { role, sendMessage } = useNetworkStore.getState()
    if (role === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
    }
  }

  const handleRemoveFeat = (featId: string): void => {
    saveFeatChange(feats.filter((f) => f.id !== featId))
  }

  const handleAddFeat = (feat: FeatData): void => {
    const newFeat = { id: feat.id, name: feat.name, description: feat.benefits.map((b) => b.description).join(' ') }
    saveFeatChange([...feats, newFeat])
    setShowPicker(false)
  }

  const takenFeatIds = new Set(feats.map((f) => f.id))

  if (!hasFeatures && readonly) return <></>

  return (
    <SheetSectionWrapper title="Features & Feats">
      {/* Class features */}
      {classFeatures.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Class Features</div>
          {classFeatures.map((f, i) => (
            <FeatureRow key={`cf-${i}`} feature={f} />
          ))}
        </div>
      )}

      {/* Species traits */}
      {character.features.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Species Traits</div>
          {character.features.map((f, i) => (
            <FeatureRow key={`feat-${i}`} feature={f} />
          ))}
        </div>
      )}

      {/* 5e feats */}
      {(feats.length > 0 || !readonly) && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Feats</div>
          {feats.map((f) => (
            <FeatureRow
              key={f.id}
              feature={{ name: f.name, description: f.description }}
              onRemove={!readonly ? () => handleRemoveFeat(f.id) : undefined}
            />
          ))}

          {!readonly && !showPicker && (
            <button
              onClick={() => setShowPicker(true)}
              className="mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
            >
              + Add Feat
            </button>
          )}

          {/* Eldritch Invocations */}
          {invocationsKnown.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">Eldritch Invocations</div>
              {(() => {
                const counts = new Map<string, number>()
                const order: string[] = []
                for (const invId of invocationsKnown) {
                  if (!counts.has(invId)) order.push(invId)
                  counts.set(invId, (counts.get(invId) ?? 0) + 1)
                }
                return order.map((invId) => {
                  const inv = invocationData.find((d) => d.id === invId)
                  const count = counts.get(invId) ?? 1
                  const label = inv ? (count > 1 ? `${inv.name} (x${count})` : inv.name) : invId
                  return inv ? (
                    <FeatureRow key={invId} feature={{ name: label, description: inv.description }} />
                  ) : (
                    <div key={invId} className="text-xs text-gray-500 px-2 py-1">
                      {label}
                    </div>
                  )
                })
              })()}
            </div>
          )}

          {/* Metamagic Options */}
          {metamagicKnown.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-red-400 uppercase tracking-wide mb-1">Metamagic</div>
              {metamagicKnown.map((mmId) => {
                const mm = metamagicData.find((d) => d.id === mmId)
                return mm ? (
                  <FeatureRow
                    key={mmId}
                    feature={{ name: `${mm.name} (${mm.sorceryPointCost} SP)`, description: mm.description }}
                  />
                ) : (
                  <div key={mmId} className="text-xs text-gray-500 px-2 py-1">
                    {mmId}
                  </div>
                )
              })}
            </div>
          )}

          {!readonly && showPicker && (
            <FeatPicker
              character={character}
              takenFeatIds={takenFeatIds}
              onSelect={handleAddFeat}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      )}

      {/* Bonus Feats (post-level 20, PHB 2024 p.43) */}
      {(bonusFeats.length > 0 || bonusFeatsAvailable > 0) && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs text-amber-400 uppercase tracking-wide">Bonus Feats</div>
            <span className="text-[10px] text-gray-500">(Post-Level 20)</span>
          </div>

          {bonusFeats.map((f) => (
            <FeatureRow
              key={`bonus-${f.id}`}
              feature={{ name: f.name, description: f.description }}
              onRemove={!readonly ? () => saveBonusFeatChange(bonusFeats.filter((bf) => bf.id !== f.id)) : undefined}
            />
          ))}

          {bonusFeatsAvailable > 0 && !readonly && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-amber-300 font-semibold">
                {bonusFeatsAvailable} Bonus Feat{bonusFeatsAvailable > 1 ? 's' : ''} Available
              </span>
              {!showBonusFeatPicker && (
                <button
                  onClick={() => setShowBonusFeatPicker(true)}
                  className="text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  + Select Feat
                </button>
              )}
            </div>
          )}

          {!readonly && showBonusFeatPicker && (
            <BonusFeatPicker
              character={character}
              bonusFeats={bonusFeats}
              onSelect={(f) => {
                saveBonusFeatChange([
                  ...bonusFeats,
                  { id: f.id, name: f.name, description: f.benefits.map((b) => b.description).join(' ') }
                ])
                setShowBonusFeatPicker(false)
              }}
              onClose={() => setShowBonusFeatPicker(false)}
            />
          )}
        </div>
      )}
      {/* Custom Features (DM-granted) */}
      {(customFeatures.length > 0 || !readonly) && (
        <div className="mb-3">
          <div className="text-xs text-cyan-400 uppercase tracking-wide mb-1">Custom Features</div>

          {customFeatures.map((f) => (
            <div key={f.id} className="flex items-start gap-2">
              <div className="flex-1">
                <FeatureRow
                  feature={{
                    name: `${f.name}${f.temporary ? ' (Temporary)' : ''}`,
                    description: f.description,
                    source: f.source
                  }}
                  onRemove={
                    !readonly ? () => saveCustomFeatureChange(customFeatures.filter((cf) => cf.id !== f.id)) : undefined
                  }
                />
              </div>
            </div>
          ))}

          {!readonly && !showGrantForm && (
            <button
              onClick={() => setShowGrantForm(true)}
              className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              + Grant Feature
            </button>
          )}

          {!readonly && showGrantForm && (
            <div className="mt-2 bg-gray-800/50 rounded p-3 space-y-2">
              <input
                type="text"
                placeholder="Feature name"
                value={grantName}
                onChange={(e) => setGrantName(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-cyan-500"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Source"
                  value={grantSource}
                  onChange={(e) => setGrantSource(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-cyan-500"
                />
                <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={grantTemporary}
                    onChange={(e) => setGrantTemporary(e.target.checked)}
                    className="rounded"
                  />
                  Temporary
                </label>
              </div>
              <textarea
                placeholder="Description (optional)"
                value={grantDescription}
                onChange={(e) => setGrantDescription(e.target.value)}
                rows={2}
                className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-cyan-500 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowGrantForm(false)}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGrantFeature}
                  disabled={!grantName.trim()}
                  className="px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-white cursor-pointer"
                >
                  Grant
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </SheetSectionWrapper>
  )
}

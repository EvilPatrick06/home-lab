import { useCallback, useEffect, useState } from 'react'
import { getBonusFeatCount } from '../../../data/xp-thresholds'
import { useT } from '../../../i18n'
import { getEffectiveFeats } from '../../../services/character/effective-character-5e'
import { load5eInvocations, load5eMetamagic } from '../../../services/data-provider'
import { useNetworkStore } from '../../../stores/network-store'
import { useCharacterStore } from '../../../stores/use-character-store'
import { useLobbyStore } from '../../../stores/use-lobby-store'
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
  const { t } = useT()
  const rawClassFeatures = character.classFeatures ?? []
  // Annotate Elemental Fury with the chosen option
  const elementalFuryChoice = character.buildChoices?.elementalFuryChoice
  const classFeatures = rawClassFeatures.map((f) => {
    if (f.name === 'Elemental Fury' && elementalFuryChoice) {
      const choiceName =
        elementalFuryChoice === 'potent-spellcasting'
          ? t('sheet.features.potentSpellcasting')
          : t('sheet.features.primalStrike')
      return { ...f, name: `${f.name} (${choiceName})` }
    }
    if (f.name === 'Improved Elemental Fury' && elementalFuryChoice) {
      const choiceName =
        elementalFuryChoice === 'potent-spellcasting'
          ? t('sheet.features.potentSpellcasting')
          : t('sheet.features.primalStrike')
      return { ...f, name: `${f.name} (${choiceName})` }
    }
    return f
  })
  // Phase 15c.5 — derive feats (v3 shape) from v4 refs via the truth store.
  const feats = getEffectiveFeats(character)

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
      // Phase 29e — structural transport gate: only the network host can
      // broadcast `dm:character-update` to relay an authoritative sheet
      // edit to a remote player. The "should I be allowed to edit this
      // sheet at all" check happens upstream (CharacterSheet5ePage.canEdit
      // via localHasPermission). Phase 30 will revisit role-as-string.
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
    // Phase 29e — structural transport gate (see saveCustomFeatureChange).
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
    const l = latest as Character5e
    // Phase 15c.5 — feats are v4 refs; per-feat `choices` persist as a ref override.
    const updated: Character5e = {
      ...l,
      featRefs: updatedFeats.map((f) => {
        const existing = l.featRefs?.find((r) => r.ref.entryId === f.id)
        return {
          instanceId: existing?.instanceId ?? crypto.randomUUID(),
          ref: {
            entryType: 'feats' as const,
            entryId: f.id,
            ...(f.choices ? { overrides: { choices: f.choices } } : {})
          }
        }
      }),
      updatedAt: new Date().toISOString()
    }
    useCharacterStore.getState().saveCharacter(updated)

    // DM broadcast pattern.
    // Phase 29e — structural transport gate (see saveCustomFeatureChange).
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
    <SheetSectionWrapper title={t('sheet.features.title')}>
      {/* Class features */}
      {classFeatures.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.features.classFeatures')}</div>
          {classFeatures.map((f, i) => (
            <FeatureRow key={`cf-${i}`} feature={f} />
          ))}
        </div>
      )}

      {/* Species traits */}
      {character.features.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.features.speciesTraits')}</div>
          {character.features.map((f, i) => (
            <FeatureRow key={`feat-${i}`} feature={f} />
          ))}
        </div>
      )}

      {/* 5e feats */}
      {(feats.length > 0 || !readonly) && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{t('sheet.features.feats')}</div>
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
              className="mt-2 text-xs text-accent hover:text-amber-300 transition-colors cursor-pointer"
            >
              {t('sheet.features.addFeat')}
            </button>
          )}

          {/* Eldritch Invocations */}
          {invocationsKnown.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-purple-400 uppercase tracking-wide mb-1">
                {t('sheet.features.eldritchInvocations')}
              </div>
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
                  const label = inv
                    ? count > 1
                      ? t('sheet.features.invocationCount', { name: inv.name, count })
                      : inv.name
                    : invId
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
              <div className="text-xs text-red-400 uppercase tracking-wide mb-1">{t('sheet.features.metamagic')}</div>
              {metamagicKnown.map((mmId) => {
                const mm = metamagicData.find((d) => d.id === mmId)
                return mm ? (
                  <FeatureRow
                    key={mmId}
                    feature={{
                      name: t('sheet.features.metamagicCost', { name: mm.name, cost: mm.sorceryPointCost }),
                      description: mm.description
                    }}
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
            <div className="text-xs text-accent uppercase tracking-wide">{t('sheet.features.bonusFeats')}</div>
            <span className="text-xs text-gray-500">{t('sheet.features.postLevel20')}</span>
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
                {t('sheet.features.bonusFeatsAvailable', { count: bonusFeatsAvailable })}
              </span>
              {!showBonusFeatPicker && (
                <button
                  onClick={() => setShowBonusFeatPicker(true)}
                  className="text-xs text-accent hover:text-amber-300 transition-colors cursor-pointer"
                >
                  {t('sheet.features.selectFeat')}
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
          <div className="text-xs text-cyan-400 uppercase tracking-wide mb-1">{t('sheet.features.customFeatures')}</div>

          {customFeatures.map((f) => (
            <div key={f.id} className="flex items-start gap-2">
              <div className="flex-1">
                <FeatureRow
                  feature={{
                    name: `${f.name}${f.temporary ? t('sheet.features.temporarySuffix') : ''}`,
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
              {t('sheet.features.grantFeature')}
            </button>
          )}

          {!readonly && showGrantForm && (
            <div className="mt-2 bg-surface-2/50 rounded p-3 space-y-2">
              <input
                aria-label={t('sheet.features.featureNamePlaceholder')}
                name="grant-name"
                type="text"
                placeholder={t('sheet.features.featureNamePlaceholder')}
                value={grantName}
                onChange={(e) => setGrantName(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-cyan-500"
              />
              <div className="flex gap-2">
                <input
                  aria-label={t('sheet.features.sourcePlaceholder')}
                  name="grant-source"
                  type="text"
                  placeholder={t('sheet.features.sourcePlaceholder')}
                  value={grantSource}
                  onChange={(e) => setGrantSource(e.target.value)}
                  className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-cyan-500"
                />
                <label className="flex items-center gap-1 text-xs text-muted cursor-pointer shrink-0">
                  <input
                    name="grant-temporary"
                    type="checkbox"
                    checked={grantTemporary}
                    onChange={(e) => setGrantTemporary(e.target.checked)}
                    className="rounded"
                  />
                  {t('sheet.features.temporary')}
                </label>
              </div>
              <textarea
                aria-label={t('sheet.features.descriptionPlaceholder')}
                name="grant-description"
                placeholder={t('sheet.features.descriptionPlaceholder')}
                value={grantDescription}
                onChange={(e) => setGrantDescription(e.target.value)}
                rows={2}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-fg focus:outline-none focus:border-cyan-500 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowGrantForm(false)}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
                >
                  {t('common.actions.cancel')}
                </button>
                <button
                  onClick={handleGrantFeature}
                  disabled={!grantName.trim()}
                  className="px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-white cursor-pointer"
                >
                  {t('sheet.features.grant')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </SheetSectionWrapper>
  )
}

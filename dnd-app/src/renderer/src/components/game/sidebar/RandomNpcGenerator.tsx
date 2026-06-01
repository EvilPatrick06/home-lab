import { useState } from 'react'
import { useT } from '../../../i18n'
import { DEFAULT_LOCKS, type GeneratedNpc, type GeneratedNpcLocks, generateRandomNpc } from './npc-templates'

interface RandomNpcGeneratorProps {
  onAccept: (name: string, desc: string) => void
  onCancel: () => void
}

export default function RandomNpcGenerator({ onAccept, onCancel }: RandomNpcGeneratorProps): JSX.Element {
  const { t } = useT()
  const [generatedNpc, setGeneratedNpc] = useState<GeneratedNpc>(() => generateRandomNpc())
  const [npcLocks, setNpcLocks] = useState<GeneratedNpcLocks>({ ...DEFAULT_LOCKS })

  const handleAccept = (): void => {
    const npc = generatedNpc
    const appearance = [
      `${npc.species}`,
      `${npc.height}, ${npc.build} build`,
      `${npc.hairColor} ${npc.hairStyle.toLowerCase()} hair`,
      npc.distinguishingFeature,
      `${npc.clothingStyle} clothing`
    ].join('. ')
    const desc = `${appearance}. Voice: ${npc.voice}. ${npc.mannerism}. Personality: ${npc.personalityTrait}.`
    onAccept(npc.name, desc)
  }

  return (
    <div className="bg-surface/60 border border-emerald-500/30 rounded-lg p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-emerald-400 uppercase tracking-wider font-semibold">
          {t('game.randomNpcGenerator.generatedNpc')}
        </span>
        <button
          onClick={() => {
            setGeneratedNpc(generateRandomNpc(npcLocks, generatedNpc))
          }}
          className="text-xs text-muted hover:text-emerald-400 cursor-pointer"
          title={t('game.randomNpcGenerator.rerollAllTitle')}
        >
          {t('game.randomNpcGenerator.rerollAll')}
        </button>
      </div>

      {/* Generator fields */}
      {(
        [
          ['name', 'game.randomNpcGenerator.fieldName', generatedNpc.name],
          ['species', 'game.randomNpcGenerator.fieldSpecies', generatedNpc.species],
          ['height', 'game.randomNpcGenerator.fieldHeight', generatedNpc.height],
          ['build', 'game.randomNpcGenerator.fieldBuild', generatedNpc.build],
          ['hairColor', 'game.randomNpcGenerator.fieldHairColor', generatedNpc.hairColor],
          ['hairStyle', 'game.randomNpcGenerator.fieldHairStyle', generatedNpc.hairStyle],
          ['distinguishingFeature', 'game.randomNpcGenerator.fieldFeature', generatedNpc.distinguishingFeature],
          ['clothingStyle', 'game.randomNpcGenerator.fieldClothing', generatedNpc.clothingStyle],
          ['voice', 'game.randomNpcGenerator.fieldVoice', generatedNpc.voice],
          ['mannerism', 'game.randomNpcGenerator.fieldMannerism', generatedNpc.mannerism],
          ['personalityTrait', 'game.randomNpcGenerator.fieldPersonality', generatedNpc.personalityTrait]
        ] as [keyof GeneratedNpcLocks, string, string][]
      ).map(([field, labelKey, value]) => (
        <div key={field} className="flex items-center gap-1">
          <button
            onClick={() => setNpcLocks((prev) => ({ ...prev, [field]: !prev[field] }))}
            className={`w-5 h-5 flex items-center justify-center text-xs shrink-0 cursor-pointer rounded ${
              npcLocks[field] ? 'text-accent bg-accent/20' : 'text-gray-600 hover:text-muted'
            }`}
            title={npcLocks[field] ? t('game.randomNpcGenerator.unlockField') : t('game.randomNpcGenerator.lockField')}
          >
            {npcLocks[field] ? '\u{1F512}' : '\u{1F513}'}
          </button>
          <span className="text-[9px] text-gray-500 w-16 shrink-0">{t(labelKey)}</span>
          <span className="text-xs text-gray-200 flex-1 truncate">{value}</span>
          <button
            onClick={() => {
              const singleLock = { ...DEFAULT_LOCKS }
              // Lock everything except this field
              for (const k of Object.keys(singleLock) as (keyof GeneratedNpcLocks)[]) {
                singleLock[k] = k !== field
              }
              setGeneratedNpc(generateRandomNpc(singleLock, generatedNpc))
            }}
            className="w-5 h-5 flex items-center justify-center text-xs text-gray-600 hover:text-emerald-400 cursor-pointer shrink-0"
            title={t('game.randomNpcGenerator.rerollField', { field: t(labelKey) })}
          >
            &#8635;
          </button>
        </div>
      ))}

      <div className="flex gap-1 pt-1">
        <button
          onClick={handleAccept}
          className="px-2 py-0.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer"
        >
          {t('game.randomNpcGenerator.accept')}
        </button>
        <button onClick={onCancel} className="px-2 py-0.5 text-xs text-muted hover:text-gray-200 cursor-pointer">
          {t('common.actions.cancel')}
        </button>
      </div>
    </div>
  )
}

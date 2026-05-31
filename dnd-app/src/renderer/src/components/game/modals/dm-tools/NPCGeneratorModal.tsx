import { useCallback, useEffect, useState } from 'react'
import { useEscapeKey } from '../../../../hooks/use-escape-key'
import { useT } from '../../../../i18n'
import { load5eRandomTables } from '../../../../services/data-provider'
import { cryptoRandom, cryptoRollDie } from '../../../../utils/crypto-random'

interface NPCGeneratorModalProps {
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

interface RandomTablesData {
  npcTraits: {
    personality: string[]
    ideals: string[]
    bonds: string[]
    flaws: string[]
    appearance: string[]
    mannerism: string[]
    talents: string[]
    interactionTraits: string[]
    highAbility: string[]
    lowAbility: string[]
    secrets: string[]
  }
  npcNames: {
    common: { given: string[]; surname: string[] }
    guttural: { given: string[]; surname: string[] }
    lyrical: { given: string[]; surname: string[] }
    monosyllabic: { given: string[]; surname: string[] }
    sinister: { given: string[]; surname: string[] }
    whimsical: { given: string[]; surname: string[] }
  }
}

type NpcNameStyle = keyof RandomTablesData['npcNames']

interface GeneratedNPC {
  name: string
  appearance: string
  highAbility: string
  lowAbility: string
  talent: string
  mannerism: string
  interactionTrait: string
  ideal: string
  bond: string
  flaw: string
  secret: string
}

function rollD(sides: number): number {
  return cryptoRollDie(sides)
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(cryptoRandom() * arr.length)]
}

function pickFromTable<T>(arr: T[], dSides: number): T {
  const idx = Math.min(rollD(dSides) - 1, arr.length - 1)
  return arr[idx]
}

export default function NPCGeneratorModal({ onClose, onBroadcastResult }: NPCGeneratorModalProps): JSX.Element {
  const { t } = useT()
  const [data, setData] = useState<RandomTablesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [npc, setNpc] = useState<GeneratedNPC | null>(null)

  useEscapeKey(onClose)

  // biome-ignore lint/correctness/useExhaustiveDependencies: Mount-once effect ([] deps) loads random tables; uses t only for an error message. Adding fresh-each-render t would re-run the load every render.
  useEffect(() => {
    load5eRandomTables()
      .then((json) => {
        // boundary cast: RandomTablesFile lacks the npcTraits/npcNames subtables this view requires
        setData(json as unknown as RandomTablesData)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('game.npcGeneratorModal.failedToLoad'))
      })
      .finally(() => setLoading(false))
  }, [])

  const rollName = useCallback((tables: RandomTablesData['npcNames']): string => {
    const styles: NpcNameStyle[] = ['common', 'guttural', 'lyrical', 'monosyllabic', 'sinister', 'whimsical']
    const style = pickRandom(styles)
    const table = tables[style]
    const given = pickRandom(table.given)
    const surname = pickRandom(table.surname)
    return `${given} ${surname}`
  }, [])

  const rollAll = useCallback(() => {
    if (!data) return
    const traits = data.npcTraits
    setNpc({
      name: rollName(data.npcNames),
      appearance: pickFromTable(traits.appearance, 12),
      highAbility: pickFromTable(traits.highAbility, 6),
      lowAbility: pickFromTable(traits.lowAbility, 6),
      talent: pickFromTable(traits.talents, 20),
      mannerism: pickFromTable(traits.mannerism, 20),
      interactionTrait: pickFromTable(traits.interactionTraits, 12),
      ideal: pickFromTable(traits.ideals, 20),
      bond: pickFromTable(traits.bonds, 10),
      flaw: pickFromTable(traits.flaws, 12),
      secret: pickFromTable(traits.secrets, 10)
    })
  }, [data, rollName])

  const reroll = useCallback(
    (key: keyof GeneratedNPC) => {
      if (!data || !npc) return
      const traits = data.npcTraits
      const updates: Partial<GeneratedNPC> = {}
      switch (key) {
        case 'name':
          updates.name = rollName(data.npcNames)
          break
        case 'appearance':
          updates.appearance = pickFromTable(traits.appearance, 12)
          break
        case 'highAbility':
          updates.highAbility = pickFromTable(traits.highAbility, 6)
          break
        case 'lowAbility':
          updates.lowAbility = pickFromTable(traits.lowAbility, 6)
          break
        case 'talent':
          updates.talent = pickFromTable(traits.talents, 20)
          break
        case 'mannerism':
          updates.mannerism = pickFromTable(traits.mannerism, 20)
          break
        case 'interactionTrait':
          updates.interactionTrait = pickFromTable(traits.interactionTraits, 12)
          break
        case 'ideal':
          updates.ideal = pickFromTable(traits.ideals, 20)
          break
        case 'bond':
          updates.bond = pickFromTable(traits.bonds, 10)
          break
        case 'flaw':
          updates.flaw = pickFromTable(traits.flaws, 12)
          break
        case 'secret':
          updates.secret = pickFromTable(traits.secrets, 10)
          break
      }
      setNpc((prev) => (prev ? { ...prev, ...updates } : null))
    },
    [data, npc, rollName]
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleShareToChat useCallback uses t only to format chat share lines. Listing fresh-each-render t would recreate the callback every render.
  const handleShareToChat = useCallback(() => {
    if (!npc) return
    const lines = [
      `**${npc.name}**`,
      t('game.npcGeneratorModal.shareAppearance', { value: npc.appearance }),
      t('game.npcGeneratorModal.shareHighAbility', { value: npc.highAbility }),
      t('game.npcGeneratorModal.shareLowAbility', { value: npc.lowAbility }),
      t('game.npcGeneratorModal.shareTalent', { value: npc.talent }),
      t('game.npcGeneratorModal.shareMannerism', { value: npc.mannerism }),
      t('game.npcGeneratorModal.shareInteraction', { value: npc.interactionTrait }),
      t('game.npcGeneratorModal.shareIdeal', { value: npc.ideal }),
      t('game.npcGeneratorModal.shareBond', { value: npc.bond }),
      t('game.npcGeneratorModal.shareFlaw', { value: npc.flaw }),
      t('game.npcGeneratorModal.shareSecret', { value: npc.secret })
    ]
    onBroadcastResult(lines.join('\n'))
    onClose()
  }, [npc, onBroadcastResult, onClose])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" aria-hidden="true" />
        <div className="relative bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 p-8 text-center">
          <p className="text-gray-400 text-sm">{t('game.npcGeneratorModal.loadingTables')}</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" aria-hidden="true" />
        <div className="relative bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 p-8 text-center">
          <p className="text-red-400 text-sm">{error ?? t('game.npcGeneratorModal.failedToLoadData')}</p>
          <button
            onClick={onClose}
            className="mt-3 px-4 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 rounded text-white cursor-pointer"
          >
            {t('common.actions.close')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" aria-hidden="true" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
          <h3 className="text-sm font-semibold text-amber-400">{t('game.npcGeneratorModal.title')}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label={t('common.actions.close')}
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={rollAll}
              className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 rounded text-white cursor-pointer"
            >
              {t('game.npcGeneratorModal.rollAll')}
            </button>
            {npc && (
              <button
                onClick={handleShareToChat}
                className="px-4 py-2 text-sm font-medium bg-amber-600/80 hover:bg-amber-600 rounded text-amber-100 cursor-pointer"
              >
                {t('game.npcGeneratorModal.shareToChat')}
              </button>
            )}
          </div>

          {!npc ? (
            <p className="text-gray-500 text-sm py-8 text-center">{t('game.npcGeneratorModal.emptyHint')}</p>
          ) : (
            <div className="space-y-3">
              {/* Name */}
              <TraitRow label={t('game.npcGeneratorModal.name')} value={npc.name} onReroll={() => reroll('name')} />
              <TraitRow
                label={t('game.npcGeneratorModal.appearance')}
                value={npc.appearance}
                onReroll={() => reroll('appearance')}
              />
              <TraitRow
                label={t('game.npcGeneratorModal.highAbility')}
                value={npc.highAbility}
                onReroll={() => reroll('highAbility')}
              />
              <TraitRow
                label={t('game.npcGeneratorModal.lowAbility')}
                value={npc.lowAbility}
                onReroll={() => reroll('lowAbility')}
              />
              <TraitRow
                label={t('game.npcGeneratorModal.talent')}
                value={npc.talent}
                onReroll={() => reroll('talent')}
              />
              <TraitRow
                label={t('game.npcGeneratorModal.mannerism')}
                value={npc.mannerism}
                onReroll={() => reroll('mannerism')}
              />
              <TraitRow
                label={t('game.npcGeneratorModal.interactionTrait')}
                value={npc.interactionTrait}
                onReroll={() => reroll('interactionTrait')}
              />
              <TraitRow label={t('game.npcGeneratorModal.ideal')} value={npc.ideal} onReroll={() => reroll('ideal')} />
              <TraitRow label={t('game.npcGeneratorModal.bond')} value={npc.bond} onReroll={() => reroll('bond')} />
              <TraitRow label={t('game.npcGeneratorModal.flaw')} value={npc.flaw} onReroll={() => reroll('flaw')} />
              <TraitRow
                label={t('game.npcGeneratorModal.secret')}
                value={npc.secret}
                onReroll={() => reroll('secret')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TraitRow({ label, value, onReroll }: { label: string; value: string; onReroll: () => void }): JSX.Element {
  const { t } = useT()
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 w-28">{label}</span>
      <span className="text-sm text-white flex-1 min-w-0">{value}</span>
      <button
        onClick={onReroll}
        className="shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-amber-400 hover:bg-amber-600/20 rounded cursor-pointer"
        title={t('game.npcGeneratorModal.reroll')}
        aria-label={t('game.npcGeneratorModal.rerollAria', { label })}
      >
        ⟳
      </button>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { load5eRandomTables } from '../../../../services/data-provider'

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
  return Math.floor(Math.random() * sides) + 1
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickFromTable<T>(arr: T[], dSides: number): T {
  const idx = Math.min(rollD(dSides) - 1, arr.length - 1)
  return arr[idx]
}

export default function NPCGeneratorModal({ onClose, onBroadcastResult }: NPCGeneratorModalProps): JSX.Element {
  const [data, setData] = useState<RandomTablesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [npc, setNpc] = useState<GeneratedNPC | null>(null)

  useEffect(() => {
    load5eRandomTables()
      .then((json) => {
        setData(json as unknown as RandomTablesData)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load')
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

  const handleShareToChat = useCallback(() => {
    if (!npc) return
    const lines = [
      `**${npc.name}**`,
      `*Appearance:* ${npc.appearance}`,
      `*High Ability:* ${npc.highAbility}`,
      `*Low Ability:* ${npc.lowAbility}`,
      `*Talent:* ${npc.talent}`,
      `*Mannerism:* ${npc.mannerism}`,
      `*Interaction:* ${npc.interactionTrait}`,
      `*Ideal:* ${npc.ideal}`,
      `*Bond:* ${npc.bond}`,
      `*Flaw:* ${npc.flaw}`,
      `*Secret:* ${npc.secret}`
    ]
    onBroadcastResult(lines.join('\n'))
    onClose()
  }, [npc, onBroadcastResult, onClose])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
        <div className="relative bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 p-8 text-center">
          <p className="text-gray-400 text-sm">Loading tables…</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
        <div className="relative bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 p-8 text-center">
          <p className="text-red-400 text-sm">{error ?? 'Failed to load data'}</p>
          <button
            onClick={onClose}
            className="mt-3 px-4 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 rounded text-white cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
          <h3 className="text-sm font-semibold text-amber-400">NPC Generator</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
            aria-label="Close"
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
              Roll All
            </button>
            {npc && (
              <button
                onClick={handleShareToChat}
                className="px-4 py-2 text-sm font-medium bg-amber-600/80 hover:bg-amber-600 rounded text-amber-100 cursor-pointer"
              >
                Share to Chat
              </button>
            )}
          </div>

          {!npc ? (
            <p className="text-gray-500 text-sm py-8 text-center">Click &quot;Roll All&quot; to generate an NPC.</p>
          ) : (
            <div className="space-y-3">
              {/* Name */}
              <TraitRow label="Name" value={npc.name} onReroll={() => reroll('name')} />
              <TraitRow label="Appearance" value={npc.appearance} onReroll={() => reroll('appearance')} />
              <TraitRow label="High Ability" value={npc.highAbility} onReroll={() => reroll('highAbility')} />
              <TraitRow label="Low Ability" value={npc.lowAbility} onReroll={() => reroll('lowAbility')} />
              <TraitRow label="Talent" value={npc.talent} onReroll={() => reroll('talent')} />
              <TraitRow label="Mannerism" value={npc.mannerism} onReroll={() => reroll('mannerism')} />
              <TraitRow
                label="Interaction Trait"
                value={npc.interactionTrait}
                onReroll={() => reroll('interactionTrait')}
              />
              <TraitRow label="Ideal" value={npc.ideal} onReroll={() => reroll('ideal')} />
              <TraitRow label="Bond" value={npc.bond} onReroll={() => reroll('bond')} />
              <TraitRow label="Flaw" value={npc.flaw} onReroll={() => reroll('flaw')} />
              <TraitRow label="Secret" value={npc.secret} onReroll={() => reroll('secret')} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TraitRow({ label, value, onReroll }: { label: string; value: string; onReroll: () => void }): JSX.Element {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 w-28">{label}</span>
      <span className="text-sm text-white flex-1 min-w-0">{value}</span>
      <button
        onClick={onReroll}
        className="shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-amber-400 hover:bg-amber-600/20 rounded cursor-pointer"
        title="Re-roll"
        aria-label={`Re-roll ${label}`}
      >
        ⟳
      </button>
    </div>
  )
}

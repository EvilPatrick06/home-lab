export function PrimalOrderSelector5e({
  slot,
  selection,
  onSelect
}: {
  slot: { label: string }
  selection: 'magician' | 'warden' | null
  onSelect: (sel: 'magician' | 'warden' | null) => void
}): JSX.Element {
  const options: Array<{ id: 'magician' | 'warden'; name: string; description: string }> = [
    {
      id: 'magician',
      name: 'Magician',
      description:
        'You know one extra cantrip from the Primal spell list. Your mystical connection to nature gives you a bonus to Intelligence (Arcana or Nature) checks equal to your Wisdom modifier (min +1).'
    },
    {
      id: 'warden',
      name: 'Warden',
      description: 'Trained for battle, you gain proficiency with Martial weapons and training with Medium armor.'
    }
  ]

  const isIncomplete = !selection

  return (
    <div className={`rounded ${isIncomplete ? 'ring-1 ring-amber-600/50 p-1 -m-1' : ''}`}>
      <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
        {slot.label}:
        {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
      </div>
      <div className="space-y-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(selection === opt.id ? null : opt.id)}
            className={`w-full text-left p-2 rounded border transition-colors ${
              selection === opt.id
                ? 'bg-green-900/30 border-green-600 text-green-300'
                : 'border-gray-700 hover:border-green-600 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="text-sm font-semibold">{opt.name}</div>
            <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export function DivineOrderSelector5e({
  slot,
  selection,
  onSelect
}: {
  slot: { label: string }
  selection: 'protector' | 'thaumaturge' | null
  onSelect: (sel: 'protector' | 'thaumaturge' | null) => void
}): JSX.Element {
  const options: Array<{ id: 'protector' | 'thaumaturge'; name: string; description: string }> = [
    {
      id: 'protector',
      name: 'Protector',
      description: 'Trained for battle, you gain proficiency with Martial weapons and training with Heavy armor.'
    },
    {
      id: 'thaumaturge',
      name: 'Thaumaturge',
      description:
        'You know one extra cantrip from the Divine spell list. In addition, your mystical connection to the divine gives you a bonus to Intelligence (Religion) checks equal to your Wisdom modifier (minimum bonus of +1).'
    }
  ]

  const isIncomplete = !selection

  return (
    <div className={`rounded ${isIncomplete ? 'ring-1 ring-amber-600/50 p-1 -m-1' : ''}`}>
      <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
        {slot.label}:
        {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
      </div>
      <div className="space-y-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(selection === opt.id ? null : opt.id)}
            className={`w-full text-left p-2 rounded border transition-colors ${
              selection === opt.id
                ? 'bg-yellow-900/30 border-yellow-600 text-yellow-300'
                : 'border-gray-700 hover:border-yellow-600 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="text-sm font-semibold">{opt.name}</div>
            <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ElementalFurySelector5e({
  selection,
  onSelect
}: {
  selection: 'potent-spellcasting' | 'primal-strike' | null
  onSelect: (sel: 'potent-spellcasting' | 'primal-strike' | null) => void
}): JSX.Element {
  const options: Array<{ id: 'potent-spellcasting' | 'primal-strike'; name: string; description: string }> = [
    {
      id: 'potent-spellcasting',
      name: 'Potent Spellcasting',
      description: 'Add your Wisdom modifier to the damage you deal with Druid cantrips.'
    },
    {
      id: 'primal-strike',
      name: 'Primal Strike',
      description:
        'Once on each of your turns when you hit a creature with an attack roll using a weapon or an Unarmed Strike, you can cause the target to take an extra 1d8 Cold, Fire, Lightning, or Thunder damage (your choice).'
    }
  ]

  const isIncomplete = !selection

  return (
    <div className={`rounded ${isIncomplete ? 'ring-1 ring-amber-600/50 p-1 -m-1' : ''}`}>
      <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
        Elemental Fury:
        {isIncomplete && <span className="text-[10px] text-amber-500 font-semibold uppercase">Required</span>}
      </div>
      <div className="space-y-1">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(selection === opt.id ? null : opt.id)}
            className={`w-full text-left p-2 rounded border transition-colors ${
              selection === opt.id
                ? 'bg-orange-900/30 border-orange-600 text-orange-300'
                : 'border-gray-700 hover:border-orange-600 text-gray-300 hover:bg-gray-800'
            }`}
          >
            <div className="text-sm font-semibold">{opt.name}</div>
            <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

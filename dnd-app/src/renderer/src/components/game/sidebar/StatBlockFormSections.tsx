import { useState } from 'react'
import { useT } from '../../../i18n'
import type { SidebarEntryStatBlock } from '../../../types/game-state'

const SPELLCASTING_ABILITIES = ['Intelligence', 'Wisdom', 'Charisma']

function parseCommaSeparated(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border/40 rounded">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-accent transition-colors cursor-pointer"
      >
        <span>{title}</span>
        <span className="text-gray-500 text-xs">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && <div className="px-2 pb-2 space-y-1.5">{children}</div>}
    </div>
  )
}

interface NameDescRowProps {
  items: Array<{ name: string; description: string; cost?: number }>
  onChange: (items: Array<{ name: string; description: string; cost?: number }>) => void
  showCost?: boolean
}

export function NameDescRows({ items, onChange, showCost = false }: NameDescRowProps): JSX.Element {
  const { t } = useT()
  const addRow = (): void => {
    onChange([...items, { name: '', description: '' }])
  }
  const removeRow = (idx: number): void => {
    onChange(items.filter((_, i) => i !== idx))
  }
  const updateRow = (idx: number, field: 'name' | 'description' | 'cost', value: string): void => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item
      if (field === 'cost') {
        return { ...item, cost: value ? parseInt(value, 10) || undefined : undefined }
      }
      return { ...item, [field]: value }
    })
    onChange(updated)
  }

  return (
    <div className="space-y-1">
      {items.map((item, idx) => (
        <div key={idx} className="flex gap-1 items-start">
          <div className="flex-1 space-y-0.5">
            <input
              type="text"
              value={item.name}
              onChange={(e) => updateRow(idx, 'name', e.target.value)}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockFormSections.namePlaceholder')}
            />
            <textarea
              value={item.description}
              onChange={(e) => updateRow(idx, 'description', e.target.value)}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500 resize-none"
              rows={2}
              placeholder={t('game.statBlockFormSections.descriptionPlaceholder')}
            />
            {showCost && (
              <input
                type="number"
                value={item.cost ?? ''}
                onChange={(e) => updateRow(idx, 'cost', e.target.value)}
                className="w-16 px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
                placeholder={t('game.statBlockFormSections.costPlaceholder')}
                min={1}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => removeRow(idx)}
            className="text-gray-500 hover:text-red-400 text-xs mt-0.5 cursor-pointer shrink-0"
            title={t('game.statBlockFormSections.remove')}
          >
            &#10005;
          </button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs text-gray-500 hover:text-accent cursor-pointer">
        {t('game.statBlockFormSections.add')}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Spellcasting Section
// ---------------------------------------------------------------------------

interface SpellcastingSectionProps {
  spellcasting: SidebarEntryStatBlock['spellcasting']
  onToggle: () => void
  onUpdate: (partial: Partial<NonNullable<SidebarEntryStatBlock['spellcasting']>>) => void
  onSlotUpdate: (level: string, value: string) => void
}

export function SpellcastingSection({
  spellcasting,
  onToggle,
  onUpdate,
  onSlotUpdate
}: SpellcastingSectionProps): JSX.Element {
  const { t } = useT()
  return (
    <CollapsibleSection title={t('game.statBlockFormSections.spellcasting')}>
      <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer mb-1">
        <input type="checkbox" checked={!!spellcasting} onChange={onToggle} className="accent-amber-500" />
        {t('game.statBlockFormSections.enableSpellcasting')}
      </label>
      {spellcasting && (
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-1">
            <div>
              <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockFormSections.ability')}</label>
              <select
                value={spellcasting.ability}
                onChange={(e) => onUpdate({ ability: e.target.value })}
                className="w-full px-1 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              >
                {SPELLCASTING_ABILITIES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockFormSections.saveDc')}</label>
              <input
                type="number"
                value={spellcasting.dc}
                onChange={(e) => onUpdate({ dc: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-1 py-0.5 rounded bg-surface border border-border text-xs text-fg text-center focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockFormSections.atkBonus')}</label>
              <input
                type="number"
                value={spellcasting.attackBonus}
                onChange={(e) => onUpdate({ attackBonus: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-1 py-0.5 rounded bg-surface border border-border text-xs text-fg text-center focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase block mb-0.5">
              {t('game.statBlockFormSections.spellSlotsByLevel')}
            </label>
            <div className="grid grid-cols-9 gap-0.5">
              {Array.from({ length: 9 }, (_, i) => String(i + 1)).map((level) => (
                <div key={level} className="text-center">
                  <label className="text-[8px] text-gray-600 block">{level}</label>
                  <input
                    type="number"
                    value={spellcasting.slots?.[level] ?? ''}
                    onChange={(e) => onSlotUpdate(level, e.target.value)}
                    className="w-full px-0 py-0.5 rounded bg-surface border border-border text-xs text-fg text-center focus:outline-none focus:border-amber-500"
                    min={0}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">
              {t('game.statBlockFormSections.spellsCommaSeparated')}
            </label>
            <textarea
              value={spellcasting.spells?.join(', ') ?? ''}
              onChange={(e) =>
                onUpdate({
                  spells: e.target.value ? parseCommaSeparated(e.target.value) : undefined
                })
              }
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500 resize-none"
              rows={2}
              placeholder={t('game.statBlockFormSections.spellsPlaceholder')}
            />
          </div>
        </div>
      )}
    </CollapsibleSection>
  )
}

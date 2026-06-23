import { useState } from 'react'
import { useT } from '../../../i18n'
import type { SidebarEntryStatBlock } from '../../../types/game-state'
import { CollapsibleSection, NameDescRows, SpellcastingSection } from './StatBlockFormSections'

const SIZE_OPTIONS: SidebarEntryStatBlock['size'][] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']

const ABILITY_NAMES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const ABILITY_LABELS: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA'
}

const SAVE_NAMES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']

function abilityModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : `${mod}`
}

interface StatBlockFormProps {
  statBlock: SidebarEntryStatBlock | undefined
  onChange: (sb: SidebarEntryStatBlock) => void
}

function StatBlockForm({ statBlock, onChange }: StatBlockFormProps): JSX.Element {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const sb = statBlock ?? {}

  const update = (partial: Partial<SidebarEntryStatBlock>): void => {
    onChange({ ...sb, ...partial })
  }

  const updateAbilityScore = (ability: string, value: string): void => {
    const scores = sb.abilityScores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
    update({
      abilityScores: { ...scores, [ability]: parseInt(value, 10) || 0 }
    })
  }

  const updateSpeed = (type: string, value: string): void => {
    const speeds = sb.speeds ?? {}
    const numVal = value ? parseInt(value, 10) || 0 : undefined
    update({
      speeds: { ...speeds, [type]: numVal }
    })
  }

  const toggleSavingThrow = (save: string): void => {
    const current = sb.savingThrows ?? []
    if (current.includes(save)) {
      update({ savingThrows: current.filter((s) => s !== save) })
    } else {
      update({ savingThrows: [...current, save] })
    }
  }

  const addSkill = (): void => {
    const current = sb.skills ?? []
    update({ skills: [...current, { name: '', modifier: 0, proficiency: 'proficient' as const }] })
  }

  const removeSkill = (idx: number): void => {
    const current = sb.skills ?? []
    update({ skills: current.filter((_, i) => i !== idx) })
  }

  const updateSkill = (idx: number, field: 'name' | 'modifier' | 'proficiency', value: string): void => {
    const current = sb.skills ?? []
    const updated = current.map((skill, i) => {
      if (i !== idx) return skill
      if (field === 'modifier') return { ...skill, modifier: parseInt(value, 10) || 0 }
      if (field === 'proficiency') return { ...skill, proficiency: value as 'proficient' | 'expertise' }
      return { ...skill, [field]: value }
    })
    update({ skills: updated })
  }

  const parseCommaSeparated = (value: string): string[] => {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const toggleSpellcasting = (): void => {
    if (sb.spellcasting) {
      const next = { ...sb }
      delete next.spellcasting
      onChange(next)
    } else {
      update({
        spellcasting: { ability: 'Intelligence', dc: 13, attackBonus: 5 }
      })
    }
  }

  const updateSpellcasting = (partial: Partial<NonNullable<SidebarEntryStatBlock['spellcasting']>>): void => {
    if (!sb.spellcasting) return
    update({ spellcasting: { ...sb.spellcasting, ...partial } })
  }

  const updateSlot = (level: string, value: string): void => {
    if (!sb.spellcasting) return
    const slots = { ...sb.spellcasting.slots }
    const numVal = parseInt(value, 10)
    if (!value || Number.isNaN(numVal)) {
      delete slots[level]
    } else {
      slots[level] = numVal
    }
    updateSpellcasting({ slots })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="text-xs px-2 py-0.5 rounded cursor-pointer bg-surface-2 text-muted hover:text-gray-200 border border-border"
        >
          {editing ? t('game.statBlockForm.preview') : t('game.statBlockForm.edit')}
        </button>
      </div>
      {/* Identity */}
      <CollapsibleSection title={t('game.statBlockForm.identity')}>
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.size')}</label>
            <select
              name="size"
              value={sb.size ?? ''}
              onChange={(e) => update({ size: (e.target.value || undefined) as SidebarEntryStatBlock['size'] })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
            >
              <option value="">--</option>
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.creatureType')}</label>
            <input
              name="creature-type"
              type="text"
              value={sb.creatureType ?? ''}
              onChange={(e) => update({ creatureType: e.target.value || undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.creatureTypePlaceholder')}
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.alignment')}</label>
            <input
              name="alignment"
              type="text"
              value={sb.alignment ?? ''}
              onChange={(e) => update({ alignment: e.target.value || undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.alignmentPlaceholder')}
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.cr')}</label>
            <input
              name="cr"
              type="text"
              value={sb.cr ?? ''}
              onChange={(e) => update({ cr: e.target.value || undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.crPlaceholder')}
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.xp')}</label>
            <input
              name="xp"
              type="number"
              value={sb.xp ?? ''}
              onChange={(e) => update({ xp: e.target.value ? parseInt(e.target.value, 10) || undefined : undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.xpPlaceholder')}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Ability Scores */}
      <CollapsibleSection title={t('game.statBlockForm.abilityScores')}>
        <div className="grid grid-cols-6 gap-1">
          {ABILITY_NAMES.map((ab) => {
            const score = sb.abilityScores?.[ab] ?? 10
            return (
              <div key={ab} className="text-center">
                <label className="text-[9px] text-gray-500 uppercase block">{ABILITY_LABELS[ab]}</label>
                <input
                  name={`ability-${ab}`}
                  type="number"
                  value={score}
                  onChange={(e) => updateAbilityScore(ab, e.target.value)}
                  className="w-full px-0.5 py-0.5 rounded bg-surface border border-border text-xs text-fg text-center focus:outline-none focus:border-amber-500"
                  min={1}
                  max={30}
                />
                <span className="text-[9px] text-accent">{abilityModifier(score)}</span>
              </div>
            )
          })}
        </div>
      </CollapsibleSection>

      {/* Combat */}
      <CollapsibleSection title={t('game.statBlockForm.combat')}>
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.ac')}</label>
            <input
              name="ac"
              type="number"
              value={sb.ac ?? ''}
              onChange={(e) => update({ ac: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.acSource')}</label>
            <input
              name="ac-source"
              type="text"
              value={sb.acSource ?? ''}
              onChange={(e) => update({ acSource: e.target.value || undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.acSourcePlaceholder')}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 mt-1">
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.hpMax')}</label>
            <input
              name="hp-max"
              type="number"
              value={sb.hpMax ?? ''}
              onChange={(e) => update({ hpMax: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.hpCurrent')}</label>
            <input
              name="hp-current"
              type="number"
              value={sb.hpCurrent ?? ''}
              onChange={(e) => update({ hpCurrent: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.hpTemp')}</label>
            <input
              name="hp-temp"
              type="number"
              value={sb.hpTemp ?? ''}
              onChange={(e) => update({ hpTemp: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
        <div className="mt-1">
          <label className="text-[9px] text-gray-500 uppercase block mb-0.5">{t('game.statBlockForm.speedsFt')}</label>
          <div className="grid grid-cols-5 gap-1">
            {(['walk', 'fly', 'swim', 'climb', 'burrow'] as const).map((type) => (
              <div key={type}>
                <label className="text-[8px] text-gray-600 capitalize block">{type}</label>
                <input
                  name={`speed-${type}`}
                  type="number"
                  value={sb.speeds?.[type] ?? ''}
                  onChange={(e) => updateSpeed(type, e.target.value)}
                  className="w-full px-0.5 py-0.5 rounded bg-surface border border-border text-xs text-fg text-center focus:outline-none focus:border-amber-500"
                  min={0}
                  step={5}
                />
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* Proficiencies */}
      <CollapsibleSection title={t('game.statBlockForm.proficiencies')}>
        <div>
          <label className="text-[9px] text-gray-500 uppercase block mb-0.5">
            {t('game.statBlockForm.savingThrows')}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SAVE_NAMES.map((save) => (
              <label key={save} className="flex items-center gap-0.5 text-xs text-gray-300 cursor-pointer">
                <input
                  name="saving-throw"
                  type="checkbox"
                  checked={sb.savingThrows?.includes(save) ?? false}
                  onChange={() => toggleSavingThrow(save)}
                  className="accent-amber-500"
                />
                {save.slice(0, 3)}
              </label>
            ))}
          </div>
        </div>
        <div className="mt-1">
          <label className="text-[9px] text-gray-500 uppercase block mb-0.5">{t('game.statBlockForm.skills')}</label>
          {(sb.skills ?? []).map((skill, idx) => (
            <div key={idx} className="flex gap-1 items-center mb-0.5">
              <input
                name="skill-name"
                type="text"
                value={skill.name}
                onChange={(e) => updateSkill(idx, 'name', e.target.value)}
                className="flex-1 px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
                placeholder={t('game.statBlockForm.skillNamePlaceholder')}
              />
              <input
                name="skill-modifier"
                type="number"
                value={skill.modifier}
                onChange={(e) => updateSkill(idx, 'modifier', e.target.value)}
                className="w-12 px-1 py-0.5 rounded bg-surface border border-border text-xs text-fg text-center focus:outline-none focus:border-amber-500"
              />
              <select
                name="skill-proficiency"
                value={skill.proficiency}
                onChange={(e) => updateSkill(idx, 'proficiency', e.target.value)}
                className="px-1 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              >
                <option value="proficient">{t('game.statBlockForm.prof')}</option>
                <option value="expertise">{t('game.statBlockForm.expert')}</option>
              </select>
              <button
                type="button"
                onClick={() => removeSkill(idx)}
                className="text-gray-500 hover:text-red-400 text-xs cursor-pointer"
                title={t('game.statBlockForm.remove')}
              >
                &#10005;
              </button>
            </div>
          ))}
          <button type="button" onClick={addSkill} className="text-xs text-gray-500 hover:text-accent cursor-pointer">
            {t('game.statBlockForm.addSkill')}
          </button>
        </div>
      </CollapsibleSection>

      {/* Defenses */}
      <CollapsibleSection title={t('game.statBlockForm.defenses')}>
        <div className="space-y-1">
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.resistances')}</label>
            <input
              name="resistances"
              type="text"
              value={sb.resistances?.join(', ') ?? ''}
              onChange={(e) =>
                update({ resistances: e.target.value ? parseCommaSeparated(e.target.value) : undefined })
              }
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.resistancesPlaceholder')}
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.immunities')}</label>
            <input
              name="immunities"
              type="text"
              value={sb.immunities?.join(', ') ?? ''}
              onChange={(e) => update({ immunities: e.target.value ? parseCommaSeparated(e.target.value) : undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.immunitiesPlaceholder')}
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.vulnerabilities')}</label>
            <input
              name="vulnerabilities"
              type="text"
              value={sb.vulnerabilities?.join(', ') ?? ''}
              onChange={(e) =>
                update({ vulnerabilities: e.target.value ? parseCommaSeparated(e.target.value) : undefined })
              }
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.vulnerabilitiesPlaceholder')}
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.conditionImmunities')}</label>
            <input
              name="condition-immunities"
              type="text"
              value={sb.conditionImmunities?.join(', ') ?? ''}
              onChange={(e) =>
                update({ conditionImmunities: e.target.value ? parseCommaSeparated(e.target.value) : undefined })
              }
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.conditionImmunitiesPlaceholder')}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Senses */}
      <CollapsibleSection title={t('game.statBlockForm.senses')}>
        <div className="space-y-1">
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.passivePerception')}</label>
            <input
              name="passive-perception"
              type="number"
              value={sb.passivePerception ?? ''}
              onChange={(e) => update({ passivePerception: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase">{t('game.statBlockForm.sensesLabel')}</label>
            <input
              name="senses"
              type="text"
              value={sb.senses?.join(', ') ?? ''}
              onChange={(e) => update({ senses: e.target.value ? parseCommaSeparated(e.target.value) : undefined })}
              className="w-full px-1.5 py-0.5 rounded bg-surface border border-border text-xs text-fg focus:outline-none focus:border-amber-500"
              placeholder={t('game.statBlockForm.sensesPlaceholder')}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Traits & Actions */}
      <CollapsibleSection title={t('game.statBlockForm.traits')}>
        <NameDescRows
          items={sb.traits ?? []}
          onChange={(items) => update({ traits: items.length ? items : undefined })}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t('game.statBlockForm.actions')}>
        <NameDescRows
          items={sb.actions ?? []}
          onChange={(items) => update({ actions: items.length ? items : undefined })}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t('game.statBlockForm.bonusActions')}>
        <NameDescRows
          items={sb.bonusActions ?? []}
          onChange={(items) => update({ bonusActions: items.length ? items : undefined })}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t('game.statBlockForm.reactions')}>
        <NameDescRows
          items={sb.reactions ?? []}
          onChange={(items) => update({ reactions: items.length ? items : undefined })}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t('game.statBlockForm.legendaryActions')}>
        <NameDescRows
          items={sb.legendaryActions ?? []}
          onChange={(items) => update({ legendaryActions: items.length ? items : undefined })}
          showCost
        />
      </CollapsibleSection>

      <CollapsibleSection title={t('game.statBlockForm.lairActions')}>
        <NameDescRows
          items={sb.lairActions ?? []}
          onChange={(items) => update({ lairActions: items.length ? items : undefined })}
        />
      </CollapsibleSection>

      {/* Spellcasting — uses extracted SpellcastingSection component */}
      <SpellcastingSection
        spellcasting={sb.spellcasting}
        onToggle={toggleSpellcasting}
        onUpdate={updateSpellcasting}
        onSlotUpdate={updateSlot}
      />
    </div>
  )
}

// Re-export SpellcastingSection so consumers of StatBlockForm can use the extracted component
export { SpellcastingSection }

export default StatBlockForm

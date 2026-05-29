import { useCallback, useState } from 'react'
import { addToast } from '../../hooks/use-toast'
import type { HomebrewFeatEffect } from '../../services/character/homebrew-effects'
import { exportAllHomebrew, importHomebrew } from '../../services/io/homebrew-io'
import { useCampaignStore } from '../../stores/use-campaign-store'
import type { HomebrewEntry, LibraryCategory, LibraryItem } from '../../types/library'
import { getCategoryDef } from '../../types/library'

interface HomebrewCreateModalProps {
  category: LibraryCategory
  existingItem?: LibraryItem
  onSave: (entry: HomebrewEntry) => Promise<void>
  onClose: () => void
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

const EDITABLE_SKIP = new Set([
  'id',
  '_homebrewId',
  '_basedOn',
  '_createdAt',
  '_campaignId',
  'tokenSize',
  'source',
  'effects'
])

/**
 * Phase 17o — default field shape per category for from-scratch homebrew
 * creation. Previously the modal started with only `{ name, description }`,
 * forcing the user to hand-add per-type fields like `path` for audio,
 * `level/school` for spells, etc. — and the user might not know which
 * fields the base type expected. This map seeds the form with the
 * minimum-viable shape so a homebrew of a given category renders + behaves
 * like a base entry of the same category.
 *
 * Values are intentionally empty (or 0) — the user fills them in. Anything
 * not seeded here can still be added via the existing "Add custom field"
 * affordance.
 */
const CATEGORY_DEFAULT_FIELDS: Partial<Record<LibraryCategory, Record<string, unknown>>> = {
  // The sounds category drives AudioPlayerItem (Phase 17n) which reads
  // `item.data.path` to construct the Audio() src.
  // boundary-allow: homebrew authoring UI — constructs library-shape from form input, intentional
  sounds: { name: '', description: '', path: '', subcategory: '' },
  spells: {
    name: '',
    description: '',
    level: 0,
    school: '',
    components: '',
    range: '',
    duration: '',
    classes: [] as string[],
    // Phase 25b — optional damage/effect roll (e.g. "8d6"); rolled on cast.
    diceFormula: ''
  },
  monsters: {
    name: '',
    description: '',
    cr: 0,
    ac: 10,
    hp: 1,
    speed: { walk: 30 },
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  },
  creatures: { name: '', description: '', cr: 0, ac: 10, hp: 1 },
  npcs: { name: '', description: '', role: 'neutral', personality: '', motivation: '' },
  'magic-items': { name: '', description: '', rarity: 'common', requiresAttunement: false, weight: 0 },
  weapons: { name: '', description: '', damage: '1d6', damageType: 'slashing', weight: 0, value: 0, properties: [] },
  armor: { name: '', description: '', armorType: 'medium', ac: 10, weight: 0, value: 0 },
  gear: { name: '', description: '', weight: 0, value: 0 },
  tools: { name: '', description: '', weight: 0, value: 0 },
  vehicles: { name: '', description: '', speed: 0, capacity: 0 },
  mounts: { name: '', description: '', speed: 30, hp: 1, ac: 10 },
  trinkets: { name: '', description: '' },
  feats: { name: '', description: '', prerequisite: '' },
  backgrounds: { name: '', description: '', skillProficiencies: [] as string[], languages: 0 },
  species: { name: '', description: '', size: 'Medium', speed: 30, traits: [] as string[] },
  classes: { name: '', description: '', hitDie: 8, primaryAbility: '' },
  subclasses: { name: '', description: '', parentClass: '' },
  conditions: { name: '', description: '' },
  actions: { name: '', description: '' },
  poisons: { name: '', description: '', cost: 0, save: 'CON 10' },
  diseases: { name: '', description: '', save: 'CON 10' },
  traps: { name: '', description: '', detect: 'DC 10', damage: '1d6' },
  hazards: { name: '', description: '', damage: '1d6', save: 'DEX 10' },
  portraits: { name: '', description: '', path: '' },
  maps: { name: '', description: '', path: '' }
} as const

export default function HomebrewCreateModal({
  category,
  existingItem,
  onSave,
  onClose
}: HomebrewCreateModalProps): JSX.Element {
  const catDef = getCategoryDef(category)
  const isEditing = !!existingItem?.data._homebrewId
  const basedOn = existingItem?.data._basedOn as string | undefined

  // Phase 17o — when creating from scratch (no existingItem), seed the
  // form with the category's expected default fields so the user gets
  // type-appropriate inputs instead of just name + description. Falls back
  // to `{ name, description }` for any unknown category.
  const initialData: Record<string, unknown> = existingItem
    ? Object.fromEntries(Object.entries(existingItem.data).filter(([k]) => !EDITABLE_SKIP.has(k)))
    : { ...(CATEGORY_DEFAULT_FIELDS[category] ?? { name: '', description: '' }) }

  const [formData, setFormData] = useState<Record<string, unknown>>(initialData)
  const [newFieldKey, setNewFieldKey] = useState('')
  const [saving, setSaving] = useState(false)

  // Phase 25c — campaign-scoped homebrew. Only offer the toggle when a campaign
  // is active. Default ON for new entries created inside a campaign; for edits,
  // preserve whatever scope the entry already had.
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const activeCampaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId))
  const existingCampaignId = existingItem?.data._campaignId as string | undefined
  const [campaignOnly, setCampaignOnly] = useState<boolean>(isEditing ? !!existingCampaignId : !!activeCampaignId)

  const updateField = (key: string, value: unknown): void => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const removeField = (key: string): void => {
    setFormData((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const addField = (): void => {
    if (!newFieldKey.trim()) return
    const key = newFieldKey.trim().replace(/\s+/g, '_').toLowerCase()
    setFormData((prev) => ({ ...prev, [key]: '' }))
    setNewFieldKey('')
  }

  // Phase 25b — homebrew feat effects builder. Stored under formData.effects.
  const effects = (Array.isArray(formData.effects) ? formData.effects : []) as HomebrewFeatEffect[]
  const setEffects = (next: HomebrewFeatEffect[]): void => updateField('effects', next)
  const addEffect = (): void => setEffects([...effects, { type: 'ability_bonus', target: 'strength', value: 1 }])
  const updateEffect = (idx: number, next: HomebrewFeatEffect): void =>
    setEffects(effects.map((e, i) => (i === idx ? next : e)))
  const removeEffect = (idx: number): void => setEffects(effects.filter((_, i) => i !== idx))

  const handleSave = async (): Promise<void> => {
    const name = (formData.name as string)?.trim()
    if (!name) return

    // Phase 25b — validate optional spell dice formula before saving.
    if (category === 'spells') {
      const formula = (formData.diceFormula as string)?.trim()
      if (formula && !/^\d+d\d+([+-]\d+)?$/.test(formula)) {
        addToast(`Invalid dice formula "${formula}" — use e.g. 8d6 or 2d8+3`, 'error')
        return
      }
    }

    setSaving(true)
    try {
      const entry: HomebrewEntry = {
        id: isEditing ? (existingItem!.data._homebrewId as string) : crypto.randomUUID(),
        type: category,
        name,
        data: { ...formData, id: `homebrew-${crypto.randomUUID().slice(0, 8)}` },
        basedOn: basedOn ?? existingItem?.id,
        // Phase 25c — scope to the active campaign when the toggle is on.
        campaignId: campaignOnly && activeCampaignId ? activeCampaignId : undefined,
        createdAt: isEditing
          ? (existingItem!.data._createdAt as string) || new Date().toISOString()
          : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await onSave(entry)
    } finally {
      setSaving(false)
    }
  }

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  const editableFields = Object.entries(formData).filter(([k]) => !EDITABLE_SKIP.has(k))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleBackdropClick}>
      <div className="absolute inset-0 bg-black/70" aria-hidden="true" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {catDef && <span className="text-2xl">{catDef.icon}</span>}
            <div>
              <h2 className="text-xl font-bold text-gray-100">
                {isEditing ? 'Edit' : 'Create'} Custom {catDef?.label ?? category}
              </h2>
              {basedOn && <p className="text-xs text-gray-500 mt-0.5">Based on: {existingItem?.name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Phase 25a — first-class homebrew export/import (.dndhomebrew bundles). */}
            <button
              onClick={async () => {
                const ok = await exportAllHomebrew()
                addToast(ok ? 'Homebrew exported' : 'No homebrew to export', ok ? 'success' : 'info')
              }}
              className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:border-amber-500 hover:text-amber-400 cursor-pointer"
            >
              Export All
            </button>
            <button
              onClick={async () => {
                const summary = await importHomebrew()
                if (summary) {
                  addToast(
                    `Imported ${summary.imported} item${summary.imported === 1 ? '' : 's'}, ${summary.errors} error${summary.errors === 1 ? '' : 's'}`,
                    summary.errors > 0 ? 'warning' : 'success'
                  )
                }
              }}
              className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:border-amber-500 hover:text-amber-400 cursor-pointer"
            >
              Import
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-2xl leading-none cursor-pointer"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {editableFields.map(([key, value]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {formatLabel(key)}
                </label>
                {key !== 'name' && key !== 'description' && (
                  <button
                    onClick={() => removeField(key)}
                    className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              {renderEditField(key, value, updateField)}
            </div>
          ))}

          {/* Phase 25b — feat effects builder. Without effects a homebrew feat is
              informational only; with effects it changes derived stats. */}
          {category === 'feats' && (
            <div className="pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Mechanical Effects</p>
                <button
                  onClick={addEffect}
                  className="text-xs px-2 py-0.5 rounded border border-gray-600 text-gray-300 hover:border-amber-500 hover:text-amber-400 cursor-pointer"
                >
                  + Add Effect
                </button>
              </div>
              {effects.length === 0 && (
                <p className="text-xs text-gray-500">No effects — this feat will be informational only.</p>
              )}
              <div className="space-y-2">
                {effects.map((effect, idx) => (
                  <EffectRow
                    key={idx}
                    effect={effect}
                    onChange={(e) => updateEffect(idx, e)}
                    onRemove={() => removeEffect(idx)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-2">Add custom field</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addField()}
                placeholder="Field name..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={addField}
                disabled={!newFieldKey.trim()}
                className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {activeCampaignId && (
          <div className="px-5 pt-3 border-t border-gray-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={campaignOnly}
                onChange={(e) => setCampaignOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-gray-300">
                Campaign-only{activeCampaign ? ` (${activeCampaign.name})` : ''}
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ml-6">
              {campaignOnly ? 'Visible only in this campaign; deleted with it.' : 'Global — visible in every campaign.'}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 p-4 border-t border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving || !(formData.name as string)?.trim()}
            className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Entry'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-gray-600 hover:bg-gray-800 text-gray-200 font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function renderEditField(key: string, value: unknown, onChange: (key: string, value: unknown) => void): JSX.Element {
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(key, e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-amber-500 focus:ring-amber-500"
        />
        <span className="text-sm text-gray-300">{value ? 'Yes' : 'No'}</span>
      </label>
    )
  }

  if (typeof value === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(key, Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
      />
    )
  }

  if (typeof value === 'string' && (value.length > 100 || key === 'description' || key === 'effect')) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(key, e.target.value)}
        rows={4}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none resize-y"
      />
    )
  }

  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return (
      <input
        type="text"
        value={value.join(', ')}
        onChange={(e) =>
          onChange(
            key,
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        placeholder="Comma separated values..."
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
      />
    )
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <textarea
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            onChange(key, JSON.parse(e.target.value))
          } catch {
            // Keep raw text if not valid JSON yet
          }
        }}
        rows={4}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 font-mono text-xs focus:border-amber-500 focus:outline-none resize-y"
      />
    )
  }

  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(key, e.target.value)}
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
    />
  )
}

const ABILITY_OPTIONS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const
const EFFECT_TYPES: Array<HomebrewFeatEffect['type']> = [
  'ability_bonus',
  'skill_proficiency',
  'damage_resistance',
  'speed_bonus',
  'ac_bonus',
  'custom'
]

/** Phase 25b — single homebrew-effect editor row. */
function EffectRow({
  effect,
  onChange,
  onRemove
}: {
  effect: HomebrewFeatEffect
  onChange: (e: HomebrewFeatEffect) => void
  onRemove: () => void
}): JSX.Element {
  const changeType = (type: HomebrewFeatEffect['type']): void => {
    switch (type) {
      case 'ability_bonus':
        onChange({ type, target: 'strength', value: 1 })
        break
      case 'skill_proficiency':
        onChange({ type, target: '' })
        break
      case 'damage_resistance':
        onChange({ type, target: '' })
        break
      case 'speed_bonus':
        onChange({ type, value: 5 })
        break
      case 'ac_bonus':
        onChange({ type, value: 1 })
        break
      case 'custom':
        onChange({ type, description: '' })
        break
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-gray-800/50 border border-gray-700 rounded p-2">
      <select
        value={effect.type}
        onChange={(e) => changeType(e.target.value as HomebrewFeatEffect['type'])}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
      >
        {EFFECT_TYPES.map((t) => (
          <option key={t} value={t}>
            {formatLabel(t)}
          </option>
        ))}
      </select>

      {effect.type === 'ability_bonus' && (
        <>
          <select
            value={effect.target}
            onChange={(e) => onChange({ ...effect, target: e.target.value as (typeof ABILITY_OPTIONS)[number] })}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
          >
            {ABILITY_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {formatLabel(a)}
              </option>
            ))}
          </select>
          <input
            type="number"
            value={effect.value}
            onChange={(e) => onChange({ ...effect, value: Number(e.target.value) })}
            className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
          />
        </>
      )}

      {(effect.type === 'skill_proficiency' || effect.type === 'damage_resistance') && (
        <input
          type="text"
          value={effect.target}
          onChange={(e) => onChange({ ...effect, target: e.target.value })}
          placeholder={effect.type === 'skill_proficiency' ? 'Skill name' : 'Damage type'}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
        />
      )}

      {(effect.type === 'speed_bonus' || effect.type === 'ac_bonus') && (
        <input
          type="number"
          value={effect.value}
          onChange={(e) => onChange({ ...effect, value: Number(e.target.value) })}
          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
        />
      )}

      {effect.type === 'custom' && (
        <input
          type="text"
          value={effect.description}
          onChange={(e) => onChange({ ...effect, description: e.target.value })}
          placeholder="Description"
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200"
        />
      )}

      <button onClick={onRemove} className="ml-auto text-xs text-red-400 hover:text-red-300 cursor-pointer">
        Remove
      </button>
    </div>
  )
}

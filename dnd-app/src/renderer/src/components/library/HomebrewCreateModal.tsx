import { useCallback, useState } from 'react'
import { useEscapeKey } from '../../hooks/use-escape-key'
import { addToast } from '../../hooks/use-toast'
import { i18n, useT } from '../../i18n'
import type { HomebrewFeatEffect } from '../../services/character/homebrew-effects'
import { validateHomebrew } from '../../services/homebrew-validation'
import { exportAllHomebrew, type HomebrewCollisionChoice, importHomebrew } from '../../services/io/homebrew-io'
import { useCampaignStore } from '../../stores/use-campaign-store'
import type { HomebrewEntry, LibraryCategory, LibraryItem } from '../../types/library'
import { getCategoryDef } from '../../types/library'

interface CollisionPrompt {
  incoming: HomebrewEntry
  existing: HomebrewEntry
  resolve: (choice: HomebrewCollisionChoice) => void
}

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
  const { t } = useT()
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
  const [collisionPrompt, setCollisionPrompt] = useState<CollisionPrompt | null>(null)

  // Phase 25c — campaign-scoped homebrew. Only offer the toggle when a campaign
  // is active. Default ON for new entries created inside a campaign; for edits,
  // preserve whatever scope the entry already had.
  const activeCampaignId = useCampaignStore((s) => s.activeCampaignId)
  const activeCampaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === s.activeCampaignId))
  const existingCampaignId = existingItem?.data._campaignId as string | undefined
  const [campaignOnly, setCampaignOnly] = useState<boolean>(isEditing ? !!existingCampaignId : !!activeCampaignId)

  useEscapeKey(onClose)

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
        addToast(t('library.homebrewCreateModal.invalidDiceFormula', { formula }), 'error')
        return
      }
    }

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

    // Phase 25d — validate on save (the import path already validates). Hard
    // errors (missing id/name/type) block; schema warnings are surfaced but
    // don't stop the save.
    const validation = validateHomebrew(entry)
    if (!validation.valid) {
      addToast(t('library.homebrewCreateModal.cannotSave', { errors: validation.errors.join(', ') }), 'error')
      return
    }
    if (validation.warnings.length > 0) {
      addToast(
        t('library.homebrewCreateModal.savedWithWarnings', { warnings: validation.warnings.join(', ') }),
        'warning'
      )
    }

    setSaving(true)
    try {
      await onSave(entry)
    } finally {
      setSaving(false)
    }
  }

  // Phase 25a Step 3 — resolve an import id-collision (same id, different name)
  // by prompting the user. Returns a promise the import loop awaits.
  const resolveCollision = useCallback(
    (incoming: HomebrewEntry, existing: HomebrewEntry): Promise<HomebrewCollisionChoice> =>
      new Promise((resolve) => {
        setCollisionPrompt({
          incoming,
          existing,
          resolve: (choice) => {
            setCollisionPrompt(null)
            resolve(choice)
          }
        })
      }),
    []
  )

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  const editableFields = Object.entries(formData).filter(([k]) => !EDITABLE_SKIP.has(k))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/70" aria-hidden="true" />
      <div className="relative bg-surface border border-border rounded-lg w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {catDef && <span className="text-2xl">{catDef.icon}</span>}
            <div>
              <h2 className="text-xl font-bold text-fg">
                {isEditing
                  ? t('library.homebrewCreateModal.editCustom', { type: catDef?.label ?? category })
                  : t('library.homebrewCreateModal.createCustom', { type: catDef?.label ?? category })}
              </h2>
              {basedOn && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('library.homebrewCreateModal.basedOn', { name: existingItem?.name })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Phase 25a — first-class homebrew export/import (.dndhomebrew bundles). */}
            <button
              onClick={async () => {
                const ok = await exportAllHomebrew()
                addToast(
                  ok ? t('library.homebrewCreateModal.exported') : t('library.homebrewCreateModal.nothingToExport'),
                  ok ? 'success' : 'info'
                )
              }}
              className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:border-amber-500 hover:text-accent cursor-pointer"
            >
              {t('library.homebrewCreateModal.exportAll')}
            </button>
            <button
              onClick={async () => {
                const summary = await importHomebrew(resolveCollision)
                if (summary) {
                  const skipped =
                    summary.skipped > 0
                      ? t('library.homebrewCreateModal.skippedSuffix', { count: summary.skipped })
                      : ''
                  addToast(
                    t('library.homebrewCreateModal.importSummary', {
                      imported: t('library.homebrewCreateModal.importedItems', { count: summary.imported }),
                      errors: t('library.homebrewCreateModal.errorsCount', { count: summary.errors }),
                      skipped
                    }),
                    summary.errors > 0 ? 'warning' : 'success'
                  )
                }
              }}
              className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:border-amber-500 hover:text-accent cursor-pointer"
            >
              {t('library.homebrewCreateModal.import')}
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-2xl leading-none cursor-pointer"
              aria-label={t('common.actions.close')}
            >
              &times;
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {editableFields.map(([key, value]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">{formatLabel(key)}</label>
                {key !== 'name' && key !== 'description' && (
                  <button
                    onClick={() => removeField(key)}
                    className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    {t('library.homebrewCreateModal.remove')}
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
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">
                  {t('library.homebrewCreateModal.mechanicalEffects')}
                </p>
                <button
                  onClick={addEffect}
                  className="text-xs px-2 py-0.5 rounded border border-gray-600 text-gray-300 hover:border-amber-500 hover:text-accent cursor-pointer"
                >
                  {t('library.homebrewCreateModal.addEffect')}
                </button>
              </div>
              {effects.length === 0 && (
                <p className="text-xs text-gray-500">{t('library.homebrewCreateModal.noEffects')}</p>
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
            <p className="text-xs text-gray-500 mb-2">{t('library.homebrewCreateModal.addCustomField')}</p>
            <div className="flex gap-2">
              <input
                type="text"
                name="new-field-key"
                value={newFieldKey}
                onChange={(e) => setNewFieldKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addField()}
                placeholder={t('library.homebrewCreateModal.fieldNamePlaceholder')}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
              />
              <button
                onClick={addField}
                disabled={!newFieldKey.trim()}
                className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('library.homebrewCreateModal.add')}
              </button>
            </div>
          </div>
        </div>

        {activeCampaignId && (
          <div className="px-5 pt-3 border-t border-gray-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="campaign-only"
                checked={campaignOnly}
                onChange={(e) => setCampaignOnly(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-surface-2 text-accent-strong focus:ring-amber-500"
              />
              <span className="text-sm text-gray-300">
                {activeCampaign
                  ? t('library.homebrewCreateModal.campaignOnlyNamed', { name: activeCampaign.name })
                  : t('library.homebrewCreateModal.campaignOnly')}
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-1 ms-6">
              {campaignOnly
                ? t('library.homebrewCreateModal.campaignScopedDesc')
                : t('library.homebrewCreateModal.globalScopeDesc')}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 p-4 border-t border-gray-800">
          <button
            onClick={handleSave}
            disabled={saving || !(formData.name as string)?.trim()}
            className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-accent-strong text-white font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? t('library.homebrewCreateModal.saving')
              : isEditing
                ? t('library.homebrewCreateModal.saveChanges')
                : t('library.homebrewCreateModal.createEntry')}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-gray-600 hover:bg-surface-2 text-gray-200 font-semibold transition-colors cursor-pointer"
          >
            {t('common.actions.cancel')}
          </button>
        </div>
      </div>

      {/* Phase 25a Step 3 — id-collision resolver during import. */}
      {collisionPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70" aria-hidden="true" />
          <div className="relative bg-surface border border-border rounded-lg w-full max-w-sm mx-4 p-5">
            <h3 className="text-lg font-bold text-fg mb-2">{t('library.homebrewCreateModal.collisionTitle')}</h3>
            <p className="text-sm text-muted mb-4">
              {t('library.homebrewCreateModal.collisionExistsAs')}{' '}
              <span className="text-gray-200">"{collisionPrompt.existing.name}"</span>
              {t('library.homebrewCreateModal.collisionImportCalls')}{' '}
              <span className="text-gray-200">"{collisionPrompt.incoming.name}"</span>
              {t('library.homebrewCreateModal.collisionWhatShouldHappen')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => collisionPrompt.resolve('copy')}
                className="px-4 py-2 rounded bg-amber-600 hover:bg-accent-strong text-white font-semibold text-sm cursor-pointer"
              >
                {t('library.homebrewCreateModal.collisionImportCopy')}
              </button>
              <button
                onClick={() => collisionPrompt.resolve('replace')}
                className="px-4 py-2 rounded border border-red-600 text-red-300 hover:bg-red-900/30 font-semibold text-sm cursor-pointer"
              >
                {t('library.homebrewCreateModal.collisionReplace')}
              </button>
              <button
                onClick={() => collisionPrompt.resolve('skip')}
                className="px-4 py-2 rounded border border-gray-600 text-gray-300 hover:bg-surface-2 font-semibold text-sm cursor-pointer"
              >
                {t('library.homebrewCreateModal.collisionSkip')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function renderEditField(key: string, value: unknown, onChange: (key: string, value: unknown) => void): JSX.Element {
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          name="homebrew-field-bool"
          checked={value}
          onChange={(e) => onChange(key, e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 bg-surface-2 text-accent-strong focus:ring-amber-500"
        />
        <span className="text-sm text-gray-300">
          {value ? i18n.t('library.homebrewCreateModal.yes') : i18n.t('library.homebrewCreateModal.no')}
        </span>
      </label>
    )
  }

  if (typeof value === 'number') {
    return (
      <input
        type="number"
        name="homebrew-field-number"
        value={value}
        onChange={(e) => onChange(key, Number(e.target.value))}
        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
      />
    )
  }

  if (typeof value === 'string' && (value.length > 100 || key === 'description' || key === 'effect')) {
    return (
      <textarea
        name="homebrew-field-text"
        value={value}
        onChange={(e) => onChange(key, e.target.value)}
        rows={4}
        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none resize-y"
      />
    )
  }

  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return (
      <input
        type="text"
        name="homebrew-field-list"
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
        placeholder={i18n.t('library.homebrewCreateModal.commaSeparatedPlaceholder')}
        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
      />
    )
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <textarea
        name="homebrew-field-json"
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            onChange(key, JSON.parse(e.target.value))
          } catch {
            // Keep raw text if not valid JSON yet
          }
        }}
        rows={4}
        className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg font-mono text-xs focus:border-amber-500 focus:outline-none resize-y"
      />
    )
  }

  return (
    <input
      type="text"
      name="homebrew-field-string"
      value={String(value ?? '')}
      onChange={(e) => onChange(key, e.target.value)}
      className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-fg focus:border-amber-500 focus:outline-none"
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
  const { t } = useT()
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
    <div className="flex flex-wrap items-center gap-2 bg-surface-2/50 border border-border rounded p-2">
      <select
        name="effect-type"
        value={effect.type}
        onChange={(e) => changeType(e.target.value as HomebrewFeatEffect['type'])}
        className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
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
            name="effect-ability-target"
            value={effect.target}
            onChange={(e) => onChange({ ...effect, target: e.target.value as (typeof ABILITY_OPTIONS)[number] })}
            className="bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
          >
            {ABILITY_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {formatLabel(a)}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="effect-ability-value"
            value={effect.value}
            onChange={(e) => onChange({ ...effect, value: Number(e.target.value) })}
            className="w-16 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
          />
        </>
      )}

      {(effect.type === 'skill_proficiency' || effect.type === 'damage_resistance') && (
        <input
          type="text"
          name="effect-target"
          value={effect.target}
          onChange={(e) => onChange({ ...effect, target: e.target.value })}
          placeholder={
            effect.type === 'skill_proficiency'
              ? t('library.homebrewCreateModal.skillNamePlaceholder')
              : t('library.homebrewCreateModal.damageTypePlaceholder')
          }
          className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
        />
      )}

      {(effect.type === 'speed_bonus' || effect.type === 'ac_bonus') && (
        <input
          type="number"
          name="effect-value"
          value={effect.value}
          onChange={(e) => onChange({ ...effect, value: Number(e.target.value) })}
          className="w-20 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
        />
      )}

      {effect.type === 'custom' && (
        <input
          type="text"
          name="effect-description"
          value={effect.description}
          onChange={(e) => onChange({ ...effect, description: e.target.value })}
          placeholder={t('library.homebrewCreateModal.descriptionPlaceholder')}
          className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-200"
        />
      )}

      <button onClick={onRemove} className="ms-auto text-xs text-red-400 hover:text-red-300 cursor-pointer">
        {t('library.homebrewCreateModal.remove')}
      </button>
    </div>
  )
}

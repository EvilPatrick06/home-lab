import sessionZeroJson from '@data/5e/world/session-zero-config.json'
import { useState } from 'react'
import { useT } from '../../i18n'
import { load5eSessionZeroConfig } from '../../services/data-provider'
import type { CustomRule } from '../../types/campaign'

export interface SessionZeroData {
  contentLimits: string[]
  tone: string
  pvpAllowed: boolean
  characterDeathExpectation: string
  playSchedule: string
  additionalNotes: string
  lines?: string[] // PHASE-32
  veils?: string[] // PHASE-32
  xCardEnabled?: boolean // PHASE-32
}

/** Load session zero config from the data store (includes plugin additions). */
export async function loadSessionZeroConfigData(): Promise<unknown> {
  return load5eSessionZeroConfig()
}

export const DEFAULT_SESSION_ZERO: SessionZeroData = {
  contentLimits: [],
  tone: 'heroic',
  pvpAllowed: false,
  characterDeathExpectation: 'possible',
  playSchedule: '',
  additionalNotes: '',
  lines: [],
  veils: [],
  xCardEnabled: false
}

type RuleCategory = CustomRule['category']

const TONE_OPTIONS = sessionZeroJson.toneOptions
const DEATH_OPTIONS = sessionZeroJson.deathOptions
const COMMON_LIMITS = sessionZeroJson.commonLimits
const RULE_CATEGORIES = sessionZeroJson.ruleCategories as Array<{ value: RuleCategory; label: string }>
const CATEGORY_COLORS = sessionZeroJson.categoryColors as Record<RuleCategory, string>

interface SessionZeroStepProps {
  data: SessionZeroData
  onChange: (data: SessionZeroData) => void
  customRules: CustomRule[]
  onRulesChange: (rules: CustomRule[]) => void
}

export default function SessionZeroStep({
  data,
  onChange,
  customRules,
  onRulesChange
}: SessionZeroStepProps): JSX.Element {
  const { t } = useT()
  const [customLimit, setCustomLimit] = useState('')
  const [customVeil, setCustomVeil] = useState('')
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [newRuleName, setNewRuleName] = useState('')
  const [newRuleDescription, setNewRuleDescription] = useState('')
  const [newRuleCategory, setNewRuleCategory] = useState<RuleCategory>('other')

  const update = <K extends keyof SessionZeroData>(key: K, value: SessionZeroData[K]): void => {
    onChange({ ...data, [key]: value })
  }

  // PHASE-32 — Lines display-merge legacy `contentLimits`; ANY edit migrates them into `lines`
  // (lossless, one-way) and clears `contentLimits`. Lines and Veils are mutually exclusive (lines win).
  const dedupe = (arr: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const x of arr) {
      const k = x.toLowerCase()
      if (k && !seen.has(k)) {
        seen.add(k)
        out.push(x)
      }
    }
    return out
  }
  const lineTopics = dedupe([...(data.lines ?? []), ...data.contentLimits])
  const veilTopics = data.veils ?? []
  const has = (list: string[], topic: string): boolean => list.some((x) => x.toLowerCase() === topic.toLowerCase())
  const without = (list: string[], topic: string): string[] =>
    list.filter((x) => x.toLowerCase() !== topic.toLowerCase())

  const toggleSafety = (topic: string, kind: 'lines' | 'veils'): void => {
    let nl = without(lineTopics, topic)
    let nv = without(veilTopics, topic)
    if (kind === 'lines' && !has(lineTopics, topic)) nl = [...nl, topic]
    if (kind === 'veils' && !has(veilTopics, topic)) nv = [...nv, topic]
    onChange({ ...data, lines: nl, veils: nv, contentLimits: [] })
  }
  const addCustomLimit = (): void => {
    const trimmed = customLimit.trim()
    if (trimmed && !has(lineTopics, trimmed)) {
      onChange({
        ...data,
        lines: [...without(lineTopics, trimmed), trimmed],
        veils: without(veilTopics, trimmed),
        contentLimits: []
      })
      setCustomLimit('')
    }
  }
  const addCustomVeil = (): void => {
    const trimmed = customVeil.trim()
    if (trimmed && !has(veilTopics, trimmed)) {
      onChange({
        ...data,
        veils: [...without(veilTopics, trimmed), trimmed],
        lines: without(lineTopics, trimmed),
        contentLimits: []
      })
      setCustomVeil('')
    }
  }

  const handleAddRule = (): void => {
    if (!newRuleName.trim()) return
    const rule: CustomRule = {
      id: crypto.randomUUID(),
      name: newRuleName.trim(),
      description: newRuleDescription.trim(),
      category: newRuleCategory
    }
    onRulesChange([...customRules, rule])
    setNewRuleName('')
    setNewRuleDescription('')
    setNewRuleCategory('other')
    setShowRuleForm(false)
  }

  const handleRemoveRule = (id: string): void => {
    onRulesChange(customRules.filter((r) => r.id !== id))
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-fg mb-1">{t('campaign.sessionZeroStep.title')}</h2>
        <p className="text-muted text-sm">{t('campaign.sessionZeroStep.subtitle')}</p>
      </div>

      {/* Tone */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">{t('campaign.sessionZeroStep.tone')}</label>
        <div className="grid grid-cols-2 gap-2">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update('tone', opt.value)}
              className={`text-left p-3 rounded-lg cursor-pointer border transition-colors ${
                data.tone === opt.value
                  ? 'bg-amber-600/20 border-amber-500/40'
                  : 'bg-surface-2 border-border hover:bg-gray-750'
              }`}
            >
              <div className={`text-sm font-medium ${data.tone === opt.value ? 'text-amber-300' : 'text-gray-300'}`}>
                {opt.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* PHASE-32 — Lines (hard boundaries: never appear) */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">{t('campaign.sessionZeroStep.lines')}</label>
        <p className="text-xs text-gray-500 mb-2">{t('campaign.sessionZeroStep.linesHint')}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {COMMON_LIMITS.map((limit) => (
            <label
              key={limit}
              className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer hover:text-gray-200"
            >
              <input
                type="checkbox"
                name="line-topic"
                checked={has(lineTopics, limit)}
                onChange={() => toggleSafety(limit, 'lines')}
                className="accent-red-500 w-3.5 h-3.5"
              />
              {limit}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            value={customLimit}
            name="custom-limit"
            onChange={(e) => setCustomLimit(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomLimit()}
            placeholder={t('campaign.sessionZeroStep.customLimitPlaceholder')}
            className="flex-1 px-2 py-1 text-xs bg-surface-2 border border-border rounded text-gray-200"
          />
          <button
            onClick={addCustomLimit}
            disabled={!customLimit.trim()}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('campaign.sessionZeroStep.add')}
          </button>
        </div>
        {lineTopics.filter((l) => !COMMON_LIMITS.includes(l)).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {lineTopics
              .filter((l) => !COMMON_LIMITS.includes(l))
              .map((l) => (
                <span
                  key={l}
                  className="flex items-center gap-1 text-xs bg-red-900/30 text-red-300 px-2 py-0.5 rounded"
                >
                  {l}
                  <button onClick={() => toggleSafety(l, 'lines')} className="hover:text-red-100 cursor-pointer">
                    &times;
                  </button>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* PHASE-32 — Veils (soft boundaries: off-screen only) */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">{t('campaign.sessionZeroStep.veils')}</label>
        <p className="text-xs text-gray-500 mb-2">{t('campaign.sessionZeroStep.veilsHint')}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {COMMON_LIMITS.map((limit) => (
            <label
              key={limit}
              className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer hover:text-gray-200"
            >
              <input
                type="checkbox"
                name="veil-topic"
                checked={has(veilTopics, limit)}
                onChange={() => toggleSafety(limit, 'veils')}
                className="accent-amber-500 w-3.5 h-3.5"
              />
              {limit}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            value={customVeil}
            name="custom-veil"
            onChange={(e) => setCustomVeil(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomVeil()}
            placeholder={t('campaign.sessionZeroStep.customVeilPlaceholder')}
            className="flex-1 px-2 py-1 text-xs bg-surface-2 border border-border rounded text-gray-200"
          />
          <button
            onClick={addCustomVeil}
            disabled={!customVeil.trim()}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('campaign.sessionZeroStep.add')}
          </button>
        </div>
        {veilTopics.filter((l) => !COMMON_LIMITS.includes(l)).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {veilTopics
              .filter((l) => !COMMON_LIMITS.includes(l))
              .map((l) => (
                <span
                  key={l}
                  className="flex items-center gap-1 text-xs bg-amber-900/30 text-amber-300 px-2 py-0.5 rounded"
                >
                  {l}
                  <button onClick={() => toggleSafety(l, 'veils')} className="hover:text-amber-100 cursor-pointer">
                    &times;
                  </button>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* PHASE-32 — X-Card opt-in */}
      <div className="flex items-center justify-between bg-surface-2 rounded-lg p-4">
        <div>
          <div className="text-sm font-medium text-gray-300">{t('campaign.sessionZeroStep.xCard')}</div>
          <div className="text-xs text-gray-500">{t('campaign.sessionZeroStep.xCardHint')}</div>
        </div>
        <button
          onClick={() => update('xCardEnabled', !data.xCardEnabled)}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
            data.xCardEnabled ? 'bg-accent-strong' : 'bg-gray-600'
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              data.xCardEnabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* PvP */}
      <div className="flex items-center justify-between bg-surface-2 rounded-lg p-4">
        <div>
          <div className="text-sm font-medium text-gray-300">{t('campaign.sessionZeroStep.pvp')}</div>
          <div className="text-xs text-gray-500">{t('campaign.sessionZeroStep.pvpHint')}</div>
        </div>
        <button
          onClick={() => update('pvpAllowed', !data.pvpAllowed)}
          className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
            data.pvpAllowed ? 'bg-accent-strong' : 'bg-gray-600'
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              data.pvpAllowed ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Character Death */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {t('campaign.sessionZeroStep.characterDeath')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {DEATH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update('characterDeathExpectation', opt.value)}
              className={`text-left p-3 rounded-lg cursor-pointer border transition-colors ${
                data.characterDeathExpectation === opt.value
                  ? 'bg-amber-600/20 border-amber-500/40'
                  : 'bg-surface-2 border-border hover:bg-gray-750'
              }`}
            >
              <div
                className={`text-sm font-medium ${
                  data.characterDeathExpectation === opt.value ? 'text-amber-300' : 'text-gray-300'
                }`}
              >
                {opt.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* House Rules */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {t('campaign.sessionZeroStep.houseRules')}
        </label>
        <p className="text-xs text-gray-500 mb-2">{t('campaign.sessionZeroStep.houseRulesHint')}</p>

        {customRules.length > 0 && (
          <div className="space-y-2 mb-3">
            {customRules.map((rule) => (
              <div
                key={rule.id}
                className="bg-surface/50 border border-gray-800 rounded-lg p-3 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-200">{rule.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[rule.category]}`}>
                      {rule.category}
                    </span>
                  </div>
                  {rule.description && <p className="text-xs text-muted">{rule.description}</p>}
                </div>
                <button
                  onClick={() => handleRemoveRule(rule.id)}
                  className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer text-lg shrink-0"
                  title={t('campaign.sessionZeroStep.removeRule')}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {showRuleForm ? (
          <div className="bg-surface/50 border border-gray-800 rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-xs text-muted mb-1">{t('campaign.sessionZeroStep.ruleName')}</label>
              <input
                value={newRuleName}
                name="rule-name"
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder={t('campaign.sessionZeroStep.ruleNamePlaceholder')}
                className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded text-gray-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">{t('campaign.sessionZeroStep.description')}</label>
              <textarea
                value={newRuleDescription}
                name="rule-description"
                onChange={(e) => setNewRuleDescription(e.target.value)}
                placeholder={t('campaign.sessionZeroStep.descriptionPlaceholder')}
                rows={2}
                className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded text-gray-200 resize-none focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">{t('campaign.sessionZeroStep.category')}</label>
              <select
                value={newRuleCategory}
                name="rule-category"
                onChange={(e) => setNewRuleCategory(e.target.value as RuleCategory)}
                className="px-3 py-2 text-xs bg-surface-2 border border-border rounded text-gray-200 focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
              >
                {RULE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddRule}
                disabled={!newRuleName.trim()}
                className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-accent-strong rounded text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('campaign.sessionZeroStep.addRule')}
              </button>
              <button
                onClick={() => setShowRuleForm(false)}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
              >
                {t('common.actions.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowRuleForm(true)}
            className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
          >
            {t('campaign.sessionZeroStep.addRuleButton')}
          </button>
        )}
      </div>

      {/* Play Schedule */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('campaign.sessionZeroStep.playSchedule')}
        </label>
        <textarea
          value={data.playSchedule}
          name="play-schedule"
          onChange={(e) => update('playSchedule', e.target.value)}
          placeholder={t('campaign.sessionZeroStep.playSchedulePlaceholder')}
          rows={2}
          className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded text-gray-200 resize-none"
        />
      </div>

      {/* Additional Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          {t('campaign.sessionZeroStep.additionalNotes')}
        </label>
        <textarea
          value={data.additionalNotes}
          name="additional-notes"
          onChange={(e) => update('additionalNotes', e.target.value)}
          placeholder={t('campaign.sessionZeroStep.additionalNotesPlaceholder')}
          rows={2}
          className="w-full px-3 py-2 text-xs bg-surface-2 border border-border rounded text-gray-200 resize-none"
        />
      </div>
    </div>
  )
}

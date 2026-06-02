import { useT } from '../../../i18n'
import type { CombatTimerConfig } from '../../../types/campaign'
import type { MapToken } from '../../../types/map'

export interface NewEntry {
  name: string
  modifier: string
  entityType: 'player' | 'npc' | 'enemy'
  surprised: boolean
  legendaryResistances: string
  inLair: boolean
  tokenId?: string // Reference to the original map token ID
}

const TIMER_PRESETS = [30, 60, 90, 120] as const

interface InitiativeSetupFormProps {
  isHost: boolean
  newEntries: NewEntry[]
  tokens: MapToken[]
  checkedTokenIds: Set<string>
  timerEnabled: boolean
  timerSeconds: number
  timerAction: 'warning' | 'auto-skip'
  showTimerConfig: boolean
  customSeconds: string
  onUpdateNewEntry: (index: number, updates: Partial<NewEntry>) => void
  onRemoveNewEntry: (index: number) => void
  onAddNewEntryRow: () => void
  onSetNewEntries: React.Dispatch<React.SetStateAction<NewEntry[]>>
  onSetCheckedTokenIds: React.Dispatch<React.SetStateAction<Set<string>>>
  onSetShowTimerConfig: React.Dispatch<React.SetStateAction<boolean>>
  onSetCustomSeconds: React.Dispatch<React.SetStateAction<string>>
  onUpdateTimerConfig: (updates: Partial<CombatTimerConfig>) => void
  onRollInitiative: () => void
}

export default function InitiativeSetupForm({
  isHost,
  newEntries,
  tokens,
  checkedTokenIds,
  timerEnabled,
  timerSeconds,
  timerAction,
  showTimerConfig,
  customSeconds,
  onUpdateNewEntry,
  onRemoveNewEntry,
  onAddNewEntryRow,
  onSetNewEntries,
  onSetCheckedTokenIds,
  onSetShowTimerConfig,
  onSetCustomSeconds,
  onUpdateTimerConfig,
  onRollInitiative
}: InitiativeSetupFormProps): JSX.Element {
  const { t } = useT()
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
        {t('game.initiativeSetupForm.title')}
      </h3>

      {isHost ? (
        <>
          <div className="space-y-2">
            {newEntries.map((entry, i) => (
              <div key={i} className="flex gap-1 items-center">
                <input
                  aria-label={t('game.initiativeSetupForm.namePlaceholder')}
                  type="text"
                  placeholder={t('game.initiativeSetupForm.namePlaceholder')}
                  value={entry.name}
                  onChange={(e) => onUpdateNewEntry(i, { name: e.target.value })}
                  className="flex-1 p-1.5 rounded bg-surface-2 border border-border text-fg
                    placeholder-gray-600 focus:outline-none focus:border-amber-500 text-xs"
                />
                <input
                  aria-label={t('game.initiativeSetupForm.modTitle')}
                  // S-11 — the placeholder ("Mod") vanishes once a number is typed, so
                  // users entered a full initiative value (18) and were surprised when
                  // Roll added a d20 (→ 32). A persistent tooltip clarifies it's a modifier.
                  title={t('game.initiativeSetupForm.modTitle')}
                  type="number"
                  placeholder={t('game.initiativeSetupForm.modPlaceholder')}
                  value={entry.modifier}
                  onChange={(e) => onUpdateNewEntry(i, { modifier: e.target.value })}
                  className="w-12 p-1.5 rounded bg-surface-2 border border-border text-fg
                    text-center focus:outline-none focus:border-amber-500 text-xs"
                />
                <select
                  value={entry.entityType}
                  onChange={(e) =>
                    onUpdateNewEntry(i, {
                      entityType: e.target.value as 'player' | 'npc' | 'enemy'
                    })
                  }
                  className="w-16 p-1.5 rounded bg-surface-2 border border-border text-gray-200 text-xs cursor-pointer"
                >
                  <option value="player">{t('game.initiativeSetupForm.typePlayer')}</option>
                  <option value="npc">{t('game.initiativeSetupForm.typeNpc')}</option>
                  <option value="enemy">{t('game.initiativeSetupForm.typeEnemy')}</option>
                </select>
                <label
                  className="flex items-center gap-0.5 cursor-pointer"
                  title={t('game.initiativeSetupForm.surprisedTitle')}
                >
                  <input
                    type="checkbox"
                    checked={entry.surprised}
                    onChange={(e) => onUpdateNewEntry(i, { surprised: e.target.checked })}
                    className="w-3 h-3 accent-amber-500"
                  />
                  <span className="text-[9px] text-gray-500">{t('game.initiativeSetupForm.surprisedAbbr')}</span>
                </label>
                {entry.entityType === 'enemy' && (
                  <>
                    <input
                      aria-label={t('game.initiativeSetupForm.lrPlaceholder')}
                      type="number"
                      placeholder={t('game.initiativeSetupForm.lrPlaceholder')}
                      min={0}
                      value={entry.legendaryResistances}
                      onChange={(e) => onUpdateNewEntry(i, { legendaryResistances: e.target.value })}
                      className="w-8 p-1 rounded bg-surface-2 border border-border text-fg
                        text-center focus:outline-none focus:border-orange-500 text-xs"
                      title={t('game.initiativeSetupForm.lrTitle')}
                    />
                    <label
                      className="flex items-center gap-0.5 cursor-pointer"
                      title={t('game.initiativeSetupForm.inLairTitle')}
                    >
                      <input
                        type="checkbox"
                        checked={entry.inLair}
                        onChange={(e) => onUpdateNewEntry(i, { inLair: e.target.checked })}
                        className="w-3 h-3 accent-purple-500"
                      />
                      <span className="text-[9px] text-gray-500">{t('game.initiativeSetupForm.inLairAbbr')}</span>
                    </label>
                  </>
                )}
                <button
                  onClick={() => onRemoveNewEntry(i)}
                  className="text-gray-500 hover:text-red-400 text-xs cursor-pointer px-1"
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>

          {/* From Map tokens */}
          {tokens.length > 0 && (
            <div className="border-t border-border/50 pt-2 mt-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">
                {t('game.initiativeSetupForm.fromMap')}
              </p>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {tokens.map((token) => (
                  <label
                    key={token.id}
                    className="flex items-center gap-2 text-xs cursor-pointer hover:bg-surface-2/50 rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={checkedTokenIds.has(token.id)}
                      onChange={(e) => {
                        onSetCheckedTokenIds((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(token.id)
                          else next.delete(token.id)
                          return next
                        })
                      }}
                      className="w-3 h-3 accent-amber-500"
                    />
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        token.entityType === 'player'
                          ? 'bg-blue-500'
                          : token.entityType === 'enemy'
                            ? 'bg-red-500'
                            : 'bg-yellow-500'
                      }`}
                    />
                    <span className="text-gray-300 truncate">{token.label}</span>
                    <span className="text-gray-600 ml-auto text-xs">
                      {token.initiativeModifier !== undefined ? `+${token.initiativeModifier}` : '+0'}
                    </span>
                  </label>
                ))}
              </div>
              {checkedTokenIds.size > 0 && (
                <button
                  onClick={() => {
                    const toAdd: NewEntry[] = tokens
                      .filter((t) => checkedTokenIds.has(t.id))
                      .map((t) => ({
                        name: t.label,
                        modifier: String(t.initiativeModifier ?? 0),
                        entityType: t.entityType,
                        surprised: false,
                        legendaryResistances: '',
                        inLair: false,
                        tokenId: t.id
                      }))
                    onSetNewEntries((prev) => [...prev.filter((e) => e.name.trim()), ...toAdd])
                    onSetCheckedTokenIds(new Set())
                  }}
                  className="w-full mt-1.5 py-1 text-xs rounded bg-surface-2 text-accent
                    hover:bg-gray-700 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  {t('game.initiativeSetupForm.addChecked', { count: checkedTokenIds.size })}
                </button>
              )}
            </div>
          )}

          {/* Turn Timer Config */}
          <div className="border-t border-border/50 pt-2 mt-1">
            <button
              onClick={() => onSetShowTimerConfig(!showTimerConfig)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-gray-200 cursor-pointer w-full"
            >
              <span className="uppercase tracking-wider font-semibold">{t('game.initiativeSetupForm.turnTimer')}</span>
              <span className="text-gray-600 text-[9px]">{showTimerConfig ? '\u25B2' : '\u25BC'}</span>
              {timerEnabled && (
                <span className="ml-auto text-green-400 text-[9px]">
                  {t('game.initiativeSetupForm.timerSummary', {
                    seconds: timerSeconds,
                    action:
                      timerAction === 'auto-skip'
                        ? t('game.initiativeSetupForm.autoSkip')
                        : t('game.initiativeSetupForm.warning')
                  })}
                </span>
              )}
            </button>
            {showTimerConfig && (
              <div className="mt-1.5 space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={timerEnabled}
                    onChange={(e) => onUpdateTimerConfig({ enabled: e.target.checked })}
                    className="w-3 h-3 accent-amber-500"
                  />
                  {t('game.initiativeSetupForm.enableTurnTimer')}
                </label>
                {timerEnabled && (
                  <>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-xs text-gray-500 mr-1">{t('game.initiativeSetupForm.seconds')}</span>
                      {TIMER_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            onSetCustomSeconds(String(preset))
                            onUpdateTimerConfig({ seconds: preset })
                          }}
                          className={`px-1.5 py-0.5 text-xs rounded cursor-pointer ${
                            timerSeconds === preset
                              ? 'bg-amber-600 text-white'
                              : 'bg-surface-2 text-muted hover:bg-gray-700'
                          }`}
                        >
                          {t('game.initiativeSetupForm.presetSeconds', { seconds: preset })}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={10}
                        max={600}
                        value={customSeconds}
                        onChange={(e) => {
                          onSetCustomSeconds(e.target.value)
                          const val = parseInt(e.target.value, 10)
                          if (val >= 10 && val <= 600) {
                            onUpdateTimerConfig({ seconds: val })
                          }
                        }}
                        className="w-14 p-0.5 rounded bg-surface-2 border border-border text-fg text-center text-xs focus:outline-none focus:border-amber-500"
                        title={t('game.initiativeSetupForm.customSecondsTitle')}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{t('game.initiativeSetupForm.onExpire')}</span>
                      <button
                        onClick={() => onUpdateTimerConfig({ action: 'warning' })}
                        className={`px-1.5 py-0.5 text-xs rounded cursor-pointer ${
                          timerAction === 'warning'
                            ? 'bg-amber-600 text-white'
                            : 'bg-surface-2 text-muted hover:bg-gray-700'
                        }`}
                      >
                        {t('game.initiativeSetupForm.warning')}
                      </button>
                      <button
                        onClick={() => onUpdateTimerConfig({ action: 'auto-skip' })}
                        className={`px-1.5 py-0.5 text-xs rounded cursor-pointer ${
                          timerAction === 'auto-skip'
                            ? 'bg-red-600 text-white'
                            : 'bg-surface-2 text-muted hover:bg-gray-700'
                        }`}
                      >
                        {t('game.initiativeSetupForm.autoSkip')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {/* QA-S1: disable + Add when the last row still has an empty
                name. Without this, users could stack phantom blank-name
                Foe rows that silently vanished when Roll Initiative
                pruned them. */}
            <button
              onClick={onAddNewEntryRow}
              disabled={newEntries.length > 0 && !newEntries[newEntries.length - 1].name.trim()}
              title={
                newEntries.length > 0 && !newEntries[newEntries.length - 1].name.trim()
                  ? t('game.initiativeSetupForm.enterNameFirst')
                  : undefined
              }
              className="flex-1 py-1.5 text-xs rounded-lg bg-surface-2 text-muted
                hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-2
                disabled:hover:text-muted"
            >
              {t('game.initiativeSetupForm.addRow')}
            </button>
            <button
              onClick={() => {
                if (newEntries.length > 0) {
                  const last = newEntries[newEntries.length - 1]
                  onSetNewEntries([
                    ...newEntries,
                    { ...last, name: t('game.initiativeSetupForm.copySuffix', { name: last.name }) }
                  ])
                }
              }}
              className="py-1.5 px-2 text-xs rounded-lg bg-surface-2 text-muted
                hover:bg-gray-700 hover:text-gray-200 transition-colors cursor-pointer"
              title={t('game.initiativeSetupForm.duplicateLastRow')}
            >
              {t('game.initiativeSetupForm.dup')}
            </button>
            <button
              onClick={onRollInitiative}
              disabled={!newEntries.some((e) => e.name.trim())}
              className="flex-1 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-accent-strong text-white
                font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {t('game.initiativeSetupForm.rollInitiative')}
            </button>
          </div>
        </>
      ) : (
        <p className="text-xs text-gray-500 text-center py-4">{t('game.initiativeSetupForm.waitingForDm')}</p>
      )}
    </div>
  )
}

import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import AbilityScoresGrid5e from '../components/sheet/5e/AbilityScoresGrid5e'
import ClassResourcesSection5e from '../components/sheet/5e/ClassResourcesSection5e'
import CombatStatsBar5e from '../components/sheet/5e/CombatStatsBar5e'
import CompanionsSection5e from '../components/sheet/5e/CompanionsSection5e'
import ConditionsSection5e from '../components/sheet/5e/ConditionsSection5e'
import CraftingSection5e from '../components/sheet/5e/CraftingSection5e'
import DefenseSection5e from '../components/sheet/5e/DefenseSection5e'
import EquipmentSection5e from '../components/sheet/5e/EquipmentSection5e'
import FeaturesSection5e from '../components/sheet/5e/FeaturesSection5e'
import HighElfCantripSwapModal5e from '../components/sheet/5e/HighElfCantripSwapModal5e'
import NotesSection5e from '../components/sheet/5e/NotesSection5e'
import OffenseSection5e from '../components/sheet/5e/OffenseSection5e'
import SavingThrowsSection5e from '../components/sheet/5e/SavingThrowsSection5e'
import SheetErrorRecovery5e from '../components/sheet/5e/SheetErrorRecovery5e'
import SheetHeader5e from '../components/sheet/5e/SheetHeader5e'
import ShortRestModal5e from '../components/sheet/5e/ShortRestModal5e'
import SkillsSection5e from '../components/sheet/5e/SkillsSection5e'
import SpellcastingSection5e from '../components/sheet/5e/SpellcastingSection5e'
import ErrorBoundary from '../components/ui/ErrorBoundary'
import Modal from '../components/ui/Modal'
import { useEscapeKey } from '../hooks/use-escape-key'
import { addToast } from '../hooks/use-toast'
import { useT } from '../i18n'

const PrintSheet = lazy(() => import('../components/sheet/shared/PrintSheet'))

import { shouldLevelUp } from '../data/xp-thresholds'
import { getEffectiveKnownSpells } from '../services/character/effective-character-5e'
import { persistCharacterIfOwned } from '../services/character/persist-character'
import { applyLongRest } from '../services/character/rest-service-5e'
import { localHasPermission } from '../services/permissions/local-permission'
import { useNetworkStore } from '../stores/network-store'
import { useBuilderStore } from '../stores/use-builder-store'
import { useCampaignStore } from '../stores/use-campaign-store'
import { useCharacterStore } from '../stores/use-character-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import type { Character } from '../types/character'
import { is5eCharacter } from '../types/character'
import type { Character5e } from '../types/character-5e'

export default function CharacterSheet5ePage(): JSX.Element {
  const { t } = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string })?.returnTo

  const storeCharacter = useCharacterStore((s) => s.characters.find((c) => c.id === id))
  const remoteCharacters = useLobbyStore((s) => s.remoteCharacters)
  const rawCharacter = storeCharacter ?? (id ? remoteCharacters[id] : undefined)
  const character: Character5e | undefined = rawCharacter && is5eCharacter(rawCharacter) ? rawCharacter : undefined

  const localPeerId = useNetworkStore((s) => s.localPeerId)
  const role = useNetworkStore((s) => s.role)
  const localIsDM = useNetworkStore((s) => s.localIsDM)
  const players = useLobbyStore((s) => s.players)
  // Phase 29e — campaign lookup must run before the `!character` early-return
  // so it stays in a fixed hook-call position. Selector returns undefined when
  // the character is missing or has no campaignId, which `localHasPermission`
  // handles via its legacy host/CoDM fallback.
  const campaign = useCampaignStore((s) => s.campaigns.find((c) => c.id === character?.campaignId)) ?? null

  const loadCharacterForEdit = useBuilderStore((s) => s.loadCharacterForEdit)

  const [isEditing, setIsEditing] = useState(false)
  const [showShortRest, setShowShortRest] = useState(false)
  const [showLongRestConfirm, setShowLongRestConfirm] = useState(false)
  const [showLevelUpBanner, setShowLevelUpBanner] = useState(false)
  const [showCantripSwap, setShowCantripSwap] = useState(false)
  const [showPrint, setShowPrint] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [versions, setVersions] = useState<Array<{ fileName: string; timestamp: string; sizeBytes: number }>>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [restoringVersion, setRestoringVersion] = useState<string | null>(null)
  const [confirmRestoreFile, setConfirmRestoreFile] = useState<string | null>(null)
  // Phase 17a — sheet-scoped error recovery: incrementing the key remounts
  // the inner <ErrorBoundary>, clearing its caught-error state so the user
  // can retry rendering without reloading the entire app.
  const [sheetErrorKey, setSheetErrorKey] = useState(0)

  useEscapeKey(() => setShowVersionHistory(false), showVersionHistory)

  if (!character) {
    return (
      <div className="p-8 h-screen flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-xl mb-2">{t('pages.characterSheet5ePage.characterNotFound')}</p>
          <button
            onClick={() => navigate(returnTo || '/characters')}
            className="text-accent hover:text-amber-300 hover:underline"
          >
            {t('pages.characterSheet5ePage.goBack')}
          </button>
        </div>
      </div>
    )
  }

  // Permission logic
  // Phase 29e — route DM/CoDM editing through the permission system
  // (`edit_any_sheet`). Self-ownership and explicit `local` ownership stay as
  // structural fast paths — they're not permission decisions, they're "is this
  // my character?". `localHasPermission` falls back to the legacy host/CoDM
  // literal for campaigns that predate the permissions block.
  const canEdit = (() => {
    if (character.playerId === 'local') return true
    if (character.playerId === localPeerId) return true
    return localHasPermission('edit_any_sheet', campaign, {
      networkRole: role,
      localPeerId,
      isDM: localIsDM,
      peers: players
    })
  })()

  const readonly = !canEdit || !isEditing

  const handleBack = (): void => {
    navigate(returnTo || '/characters')
  }

  const handleMakeCharacter = (): void => {
    const ownerPlayer = players.find((p) => p.characterId === character.id)
    const editChar =
      ownerPlayer && ownerPlayer.peerId !== localPeerId ? { ...character, playerId: ownerPlayer.peerId } : character
    loadCharacterForEdit(editChar)
    navigate(`/characters/5e/edit/${character.id}`, { state: { returnTo: `/characters/5e/${character.id}` } })
  }

  const handleLevelUp = (): void => {
    navigate(`/characters/5e/${character.id}/levelup`, { state: { returnTo: `/characters/5e/${character.id}` } })
  }

  // --- Long Rest logic (5e only) ---

  const handleLongRest = (): void => {
    const latest = useCharacterStore.getState().characters.find((c) => c.id === character.id) || character
    if (!is5eCharacter(latest)) return

    const result = applyLongRest(latest)
    // CH-2b — don't persist a player's PC into the DM's own library.
    persistCharacterIfOwned(result.character)
    broadcastIfDM(result.character)

    setShowLongRestConfirm(false)

    // High Elf: offer cantrip swap after Long Rest
    if (result.highElfCantripSwap) {
      setShowCantripSwap(true)
    }
  }

  const broadcastIfDM = (updated: Character): void => {
    const { role: r, sendMessage } = useNetworkStore.getState()
    if (r === 'host' && updated.playerId !== 'local') {
      sendMessage('dm:character-update', {
        characterId: updated.id,
        characterData: updated,
        targetPeerId: updated.playerId
      })
      useLobbyStore.getState().setRemoteCharacter(updated.id, updated)
    }
  }

  // 5e hit dice info for short rest button tooltip
  const hdRemaining = character.hitDice.reduce((s, h) => s + h.current, 0)
  const hdTotal = character.hitDice.reduce((s, h) => s + h.maximum, 0)
  const hitDiceInfo =
    character.hitDice.length > 1
      ? t('pages.characterSheet5ePage.hitDiceInfoMulti', {
          remaining: hdRemaining,
          total: hdTotal,
          breakdown: character.hitDice.map((h) => `${h.current}/${h.maximum}d${h.dieType}`).join(' + ')
        })
      : t('pages.characterSheet5ePage.hitDiceInfoSingle', {
          remaining: hdRemaining,
          dieType: character.hitDice[0]?.dieType ?? 8
        })

  const isMaxLevel = character.level >= 20

  // XP-based level-up notification
  useEffect(() => {
    if (character.levelingMode === 'xp' && shouldLevelUp(character.level, character.xp)) {
      setShowLevelUpBanner(true)
    } else {
      setShowLevelUpBanner(false)
    }
  }, [character.levelingMode, character.xp, character.level])

  return (
    <div className="h-screen flex flex-col bg-base">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 pr-12 bg-surface border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-muted hover:text-gray-200 text-sm flex items-center gap-1 transition-colors"
          >
            &larr; {t('pages.characterSheet5ePage.back')}
          </button>
          {returnTo?.startsWith('/game/') && (
            <button
              onClick={() => navigate(returnTo)}
              className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold transition-colors"
            >
              {t('pages.characterSheet5ePage.returnToGame')}
            </button>
          )}
          {/* Phase 17m — Library access from the character sheet so the
              player can look up rules / spells / items mid-game without
              leaving the sheet. Uses the LibraryPage's `?from=` pattern
              so its back-button routes back here. */}
          <button
            type="button"
            onClick={() => navigate(`/library?from=${encodeURIComponent(location.pathname)}`)}
            className="px-3 py-1.5 text-sm border border-border text-amber-300 hover:text-amber-200 hover:border-amber-600/50 rounded transition-colors cursor-pointer"
            title={t('pages.characterSheet5ePage.libraryTitle')}
          >
            {t('pages.characterSheet5ePage.library')}
          </button>
          <div className="w-px h-4 bg-gray-700" />
          <span className="text-xs text-gray-500">{t('pages.characterSheet5ePage.characterSheet')}</span>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                isEditing
                  ? 'bg-amber-600 hover:bg-accent-strong text-white'
                  : 'border border-gray-600 hover:border-amber-600 text-gray-300 hover:text-accent'
              }`}
            >
              {isEditing ? t('pages.characterSheet5ePage.done') : t('pages.characterSheet5ePage.edit')}
            </button>
            <button
              onClick={() => setShowShortRest(true)}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-blue-600 text-gray-300 hover:text-blue-400 rounded transition-colors"
              title={hitDiceInfo}
            >
              {t('pages.characterSheet5ePage.shortRest')}
            </button>
            <button
              onClick={() => setShowLongRestConfirm(true)}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-purple-600 text-gray-300 hover:text-purple-400 rounded transition-colors"
            >
              {t('pages.characterSheet5ePage.longRest')}
            </button>
            <button
              onClick={handleMakeCharacter}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-green-600 text-gray-300 hover:text-green-400 rounded transition-colors"
            >
              {t('pages.characterSheet5ePage.reMakeCharacter')}
            </button>
            <button
              onClick={handleLevelUp}
              disabled={isMaxLevel}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-semibold transition-colors"
            >
              {t('pages.characterSheet5ePage.levelUp')}
            </button>
            <button
              onClick={() => setShowPrint(true)}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-gray-500 text-muted hover:text-gray-200 rounded transition-colors"
            >
              {t('pages.characterSheet5ePage.print')}
            </button>
            <button
              onClick={async () => {
                setShowVersionHistory(true)
                setLoadingVersions(true)
                try {
                  const result = await window.api.listCharacterVersions(character.id)
                  if (result.success && result.data) setVersions(result.data)
                } catch {
                  addToast(t('pages.characterSheet5ePage.toastVersionLoadFailed'), 'error')
                }
                setLoadingVersions(false)
              }}
              className="px-3 py-1.5 text-sm border border-gray-600 hover:border-gray-500 text-muted hover:text-gray-200 rounded transition-colors"
            >
              {t('pages.characterSheet5ePage.history')}
            </button>
          </div>
        )}
      </div>

      {/* Level Up Banner */}
      {showLevelUpBanner && canEdit && (
        <div className="flex items-center justify-between px-4 py-2 bg-green-900/30 border-b border-green-700">
          <span className="text-sm text-green-400 font-semibold">{t('pages.characterSheet5ePage.enoughXp')}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLevelUp}
              className="px-3 py-1 text-sm bg-green-600 hover:bg-green-500 text-white rounded font-semibold transition-colors"
            >
              {t('pages.characterSheet5ePage.levelUpNow')}
            </button>
            <button
              onClick={() => setShowLevelUpBanner(false)}
              className="px-3 py-1 text-sm border border-gray-600 text-gray-300 hover:bg-surface-2 rounded transition-colors"
            >
              {t('pages.characterSheet5ePage.later')}
            </button>
          </div>
        </div>
      )}

      {/* Sheet content — wrapped in sheet-scoped ErrorBoundary (17a) so a
          render error in any section shows a recovery panel instead of
          escaping to the global error boundary (which used to navigate the
          host back to the lobby and the player to "page not found"). */}
      <ErrorBoundary
        key={sheetErrorKey}
        fallback={
          <SheetErrorRecovery5e
            onReload={() => setSheetErrorKey((k) => k + 1)}
            onBack={() => navigate(returnTo || '/characters')}
          />
        }
      >
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <SheetHeader5e character={character} readonly={readonly} />
            <CombatStatsBar5e character={character} readonly={readonly} />
            <AbilityScoresGrid5e character={character} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <ClassResourcesSection5e character={character} readonly={readonly} />
                <SavingThrowsSection5e character={character} />
                <SkillsSection5e character={character} readonly={readonly} />
                <ConditionsSection5e character={character} readonly={readonly} />
                <FeaturesSection5e character={character} readonly={readonly} />
              </div>
              <div className="space-y-6">
                <OffenseSection5e character={character} readonly={readonly} />
                <DefenseSection5e character={character} readonly={readonly} />
                <SpellcastingSection5e character={character} readonly={readonly} />
                <EquipmentSection5e character={character} readonly={readonly} />
                <CompanionsSection5e character={character} readonly={readonly} />
                <CraftingSection5e character={character} readonly={readonly} />
              </div>
            </div>

            <div className="mt-6">
              <NotesSection5e character={character} readonly={readonly} />
            </div>
          </div>
        </div>
      </ErrorBoundary>

      {/* Short Rest Modal */}
      <ShortRestModal5e character={character} open={showShortRest} onClose={() => setShowShortRest(false)} />

      {/* Long Rest Confirmation */}
      <Modal
        open={showLongRestConfirm}
        onClose={() => setShowLongRestConfirm(false)}
        title={t('pages.characterSheet5ePage.longRest')}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('pages.characterSheet5ePage.longRestWill')}</p>
          <ul className="list-disc ml-5 mt-2 space-y-1 text-sm text-muted">
            <li>{t('pages.characterSheet5ePage.restoreHp')}</li>
            <li>{t('pages.characterSheet5ePage.recoverHitDice')}</li>
            <li>{t('pages.characterSheet5ePage.restoreSpellSlots')}</li>
            <li>{t('pages.characterSheet5ePage.clearDeathSaves')}</li>
            <li>{t('pages.characterSheet5ePage.clearTempHp')}</li>
            <li>{t('pages.characterSheet5ePage.reduceExhaustion')}</li>
            {getEffectiveKnownSpells(character).some((s) => s.innateUses) && (
              <li>{t('pages.characterSheet5ePage.restoreInnate')}</li>
            )}
            {character.wildShapeUses && character.wildShapeUses.max > 0 && (
              <li>{t('pages.characterSheet5ePage.restoreWildShape')}</li>
            )}
            {character.species?.toLowerCase() === 'human' && (
              <li>{t('pages.characterSheet5ePage.grantHeroicInspiration')}</li>
            )}
          </ul>
          <div className="text-xs text-gray-500">
            {t('pages.characterSheet5ePage.hitPointDice')} {character.hitDice.reduce((s, h) => s + h.current, 0)}/
            {character.hitDice.reduce((s, h) => s + h.maximum, 0)}
            {character.hitDice.length > 1 && (
              <span> ({character.hitDice.map((h) => `${h.current}/${h.maximum}d${h.dieType}`).join(' + ')})</span>
            )}{' '}
            &rarr; {character.hitDice.reduce((s, h) => s + h.maximum, 0)}/
            {character.hitDice.reduce((s, h) => s + h.maximum, 0)}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowLongRestConfirm(false)}
              className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={handleLongRest}
              className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition-colors"
            >
              {t('pages.characterSheet5ePage.takeLongRest')}
            </button>
          </div>
        </div>
      </Modal>

      {/* High Elf Cantrip Swap Modal (after Long Rest) */}
      <HighElfCantripSwapModal5e
        character={character}
        open={showCantripSwap}
        onClose={() => setShowCantripSwap(false)}
      />

      {/* Print Sheet */}
      {showPrint && (
        <Suspense fallback={null}>
          <PrintSheet character={character} onClose={() => setShowPrint(false)} />
        </Suspense>
      )}

      {/* Version History Modal */}
      {showVersionHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowVersionHistory(false)}
            role="presentation"
          />
          <div className="relative bg-surface border border-border rounded-xl p-5 w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-accent">{t('pages.characterSheet5ePage.versionHistory')}</h3>
              <button
                onClick={() => setShowVersionHistory(false)}
                aria-label={t('pages.characterSheet5ePage.closeVersionHistory')}
                className="text-gray-500 hover:text-gray-300 text-lg cursor-pointer"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {loadingVersions ? (
                <p className="text-xs text-gray-500 text-center py-4">
                  {t('pages.characterSheet5ePage.loadingVersions')}
                </p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">{t('pages.characterSheet5ePage.noVersions')}</p>
              ) : (
                versions.map((v) => (
                  <div
                    key={v.fileName}
                    className="flex items-center justify-between bg-surface-2/50 rounded-lg px-3 py-2 border border-border/30"
                  >
                    <div>
                      <div className="text-xs text-gray-200">
                        {new Date(v.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {t('pages.characterSheet5ePage.sizeKb', { size: (v.sizeBytes / 1024).toFixed(1) })}
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmRestoreFile(v.fileName)}
                      disabled={restoringVersion !== null}
                      className="px-3 py-1 text-xs bg-amber-600 hover:bg-accent-strong disabled:bg-gray-700 disabled:text-gray-500 text-white rounded cursor-pointer transition-colors"
                    >
                      {restoringVersion === v.fileName
                        ? t('pages.characterSheet5ePage.restoring')
                        : t('pages.characterSheet5ePage.restore')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version Restore Confirmation Modal */}
      <Modal
        open={confirmRestoreFile !== null}
        onClose={() => setConfirmRestoreFile(null)}
        title={t('pages.characterSheet5ePage.restoreVersionTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">{t('pages.characterSheet5ePage.restoreVersionPrompt')}</p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirmRestoreFile(null)}
              className="px-4 py-2 text-sm border border-gray-600 rounded hover:bg-surface-2 transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={async () => {
                if (!confirmRestoreFile) return
                const fileName = confirmRestoreFile
                setConfirmRestoreFile(null)
                setRestoringVersion(fileName)
                try {
                  const result = await window.api.restoreCharacterVersion(character.id, fileName)
                  if (result.success && result.data) {
                    await useCharacterStore.getState().loadCharacters()
                    setShowVersionHistory(false)
                    addToast(t('pages.characterSheet5ePage.toastVersionRestored'), 'success')
                  } else {
                    addToast(t('pages.characterSheet5ePage.toastVersionRestoreFailed'), 'error')
                  }
                } catch {
                  addToast(t('pages.characterSheet5ePage.toastVersionRestoreFailed'), 'error')
                }
                setRestoringVersion(null)
              }}
              className="px-4 py-2 text-sm bg-amber-600 hover:bg-accent-strong text-white rounded font-semibold transition-colors"
            >
              {t('pages.characterSheet5ePage.restore')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from '../components/ui'
import { addToast } from '../hooks/use-toast'
import { useT } from '../i18n'
import { exportAllData, importAllData } from '../services/io/import-export'
import { logger } from '../utils/logger'
import { isWebBuild } from '../utils/platform'

const TECH_STACK = [
  { name: 'Electron 40', detailKey: 'pages.aboutPage.techDesktopFramework' },
  { name: 'React 19', detailKey: 'pages.aboutPage.techUiLibrary' },
  { name: 'TypeScript 5.9', detailKey: 'pages.aboutPage.techTypeSafety' },
  { name: 'Tailwind CSS v4', detailKey: 'pages.aboutPage.techStyling' },
  { name: 'Zustand v5', detailKey: 'pages.aboutPage.techStateManagement' },
  { name: 'PeerJS', detailKey: 'pages.aboutPage.techWebrtc' },
  { name: 'PixiJS 8', detailKey: 'pages.aboutPage.techMapRendering' },
  { name: 'Three.js', detailKey: 'pages.aboutPage.techDicePhysics' },
  { name: 'TipTap', detailKey: 'pages.aboutPage.techRichText' },
  { name: 'Vitest', detailKey: 'pages.aboutPage.techTestingFramework' },
  { name: 'electron-vite', detailKey: 'pages.aboutPage.techBuildTooling' }
] as const

export default function AboutPage(): JSX.Element {
  const { t } = useT()
  const navigate = useNavigate()
  // On the web build the renderer is a Vite/React SPA, not Electron, so relabel the
  // first tech-stack entry to the actual web runtime and drop the desktop-only
  // `electron-vite` build-tooling entry (the web edition is built with plain Vite,
  // already represented by the "Vite / Web runtime" card); desktop keeps the default const.
  const techStack = isWebBuild()
    ? [
        { name: 'Vite', detailKey: 'pages.aboutPage.techWebRuntime' } as const,
        ...TECH_STACK.slice(1).filter((entry) => entry.name !== 'electron-vite')
      ]
    : TECH_STACK
  const FEATURES = [
    t('pages.aboutPage.featureCharacterBuilder'),
    t('pages.aboutPage.featureCharacterSheets'),
    t('pages.aboutPage.featureLevelUpWizard'),
    t('pages.aboutPage.featureCampaignManagement'),
    t('pages.aboutPage.featureBattleMap'),
    t('pages.aboutPage.featureInitiativeTracker'),
    t('pages.aboutPage.featureDice'),
    isWebBuild() ? t('pages.aboutPage.featureMultiplayerWeb') : t('pages.aboutPage.featureMultiplayer'),
    t('pages.aboutPage.featureAiDm'),
    t('pages.aboutPage.featureBastion'),
    t('pages.aboutPage.featureCraftingShop'),
    t('pages.aboutPage.featureNpcManagement'),
    t('pages.aboutPage.featureWeaponMastery'),
    t('pages.aboutPage.featureInvocationsMetamagic'),
    t('pages.aboutPage.featureAoeTerrain'),
    t('pages.aboutPage.featureLighting'),
    t('pages.aboutPage.featureJournal'),
    t('pages.aboutPage.featureSoundManager'),
    t('pages.aboutPage.featureCalendar'),
    t('pages.aboutPage.featureMountVehicle'),
    t('pages.aboutPage.featureChatCommands'),
    t('pages.aboutPage.featureUndoRedo'),
    t('pages.aboutPage.featureImportExport')
  ]
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'
  >('idle')
  const [appVersion, setAppVersion] = useState(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)

  useEffect(() => {
    window.api
      .getVersion()
      .then(setAppVersion)
      .catch(() => logger.warn('[About] Failed to fetch app version'))
    const removeListener = window.api.update.onStatus((status) => {
      if (status.state === 'not-available') setUpdateStatus('up-to-date')
      else if (status.state === 'available') {
        setUpdateStatus('available')
        if (status.version) setUpdateVersion(status.version)
      } else if (status.state === 'downloading') {
        setUpdateStatus('downloading')
        setDownloadPercent(status.percent ?? 0)
      } else if (status.state === 'downloaded') {
        setUpdateStatus('downloaded')
        if (status.version) setUpdateVersion(status.version)
      } else if (status.state === 'error') {
        setUpdateStatus('error')
        if (status.message) setErrorMsg(status.message)
      } else if (status.state === 'checking') setUpdateStatus('checking')
    })
    return () => {
      removeListener()
    }
  }, [])

  const handleExportAll = async (): Promise<void> => {
    setExporting(true)
    try {
      const stats = await exportAllData()
      if (stats) {
        addToast(
          t('pages.aboutPage.exportedStats', {
            characters: stats.characters,
            charactersPlural: stats.characters !== 1 ? 's' : '',
            campaigns: stats.campaigns,
            campaignsPlural: stats.campaigns !== 1 ? 's' : '',
            bastions: stats.bastions,
            bastionsPlural: stats.bastions !== 1 ? 's' : '',
            customCreatures: stats.customCreatures,
            creaturesPlural: stats.customCreatures !== 1 ? 's' : '',
            homebrew: stats.homebrew
          }),
          'success'
        )
      }
    } catch (err) {
      logger.error('Export all failed:', err)
      addToast(t('pages.aboutPage.exportFailed'), 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleImportAll = async (): Promise<void> => {
    setImporting(true)
    try {
      const stats = await importAllData()
      if (stats) {
        addToast(
          t('pages.aboutPage.importedStats', {
            characters: stats.characters,
            charactersPlural: stats.characters !== 1 ? 's' : '',
            campaigns: stats.campaigns,
            campaignsPlural: stats.campaigns !== 1 ? 's' : '',
            bastions: stats.bastions,
            bastionsPlural: stats.bastions !== 1 ? 's' : '',
            customCreatures: stats.customCreatures,
            creaturesPlural: stats.customCreatures !== 1 ? 's' : '',
            homebrew: stats.homebrew
          }),
          'success'
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('pages.aboutPage.importFailed')
      addToast(message, 'error')
    } finally {
      setImporting(false)
      setShowImportConfirm(false)
    }
  }

  return (
    <div className="h-screen bg-base text-fg overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/')}
          className="text-accent hover:text-amber-300 hover:underline mb-8 block cursor-pointer text-sm"
        >
          {t('pages.aboutPage.backToMenu')}
        </button>

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-3">&#9876;</div>
          <h1 className="text-3xl font-bold text-accent mb-1">{t('pages.aboutPage.appTitle')}</h1>
          <p className="text-gray-500 text-sm mb-3">{t('pages.aboutPage.version', { appVersion })}</p>
          {isWebBuild() && <p className="text-gray-500 text-xs mb-3 -mt-2">{t('pages.aboutPage.webEditionNote')}</p>}
          {!isWebBuild() && (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => {
                  setUpdateStatus('checking')
                  window.api.update
                    .checkForUpdates()
                    .then((result) => {
                      if (result.state === 'available') {
                        setUpdateStatus('available')
                        if (result.version) setUpdateVersion(result.version)
                      } else if (result.state === 'not-available') {
                        setUpdateStatus('up-to-date')
                      } else if (result.state === 'downloading') {
                        setUpdateStatus('downloading')
                      } else if (result.state === 'downloaded') {
                        setUpdateStatus('downloaded')
                        if (result.version) setUpdateVersion(result.version)
                      } else if (result.state === 'error') {
                        setUpdateStatus('error')
                        if (result.message) setErrorMsg(result.message)
                      }
                    })
                    .catch((e) => {
                      setUpdateStatus('error')
                      setErrorMsg(e instanceof Error ? e.message : String(e))
                    })
                }}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-surface-2 hover:bg-gray-700 text-gray-300 border border-border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateStatus === 'idle' && t('pages.aboutPage.checkForUpdates')}
                {updateStatus === 'checking' && t('pages.aboutPage.checking')}
                {updateStatus === 'up-to-date' && t('pages.aboutPage.upToDate')}
                {updateStatus === 'available' &&
                  t('pages.aboutPage.updateAvailable', { updateVersion: updateVersion ?? '' })}
                {updateStatus === 'downloading' && t('pages.aboutPage.downloading')}
                {updateStatus === 'downloaded' && t('pages.aboutPage.updateReady')}
                {updateStatus === 'error' &&
                  t('pages.aboutPage.checkFailed', { errorSuffix: errorMsg ? `: ${errorMsg}` : '' })}
              </button>

              {/* Download button */}
              {updateStatus === 'available' && (
                <button
                  onClick={() => {
                    setUpdateStatus('downloading')
                    setDownloadPercent(0)
                    window.api.update.downloadUpdate().catch((e) => {
                      setUpdateStatus('error')
                      setErrorMsg(e instanceof Error ? e.message : String(e))
                    })
                  }}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-accent-strong text-white cursor-pointer"
                >
                  {t('pages.aboutPage.downloadVersion', { updateVersion })}
                </button>
              )}

              {/* Download progress bar */}
              {updateStatus === 'downloading' && (
                <div className="w-48">
                  <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-strong rounded-full transition-all duration-300"
                      style={{ width: `${downloadPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted mt-1">{downloadPercent}%</p>
                </div>
              )}

              {/* Update & Restart button */}
              {updateStatus === 'downloaded' && (
                <>
                  <button
                    onClick={() => window.api.update.installUpdate()}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 text-white cursor-pointer"
                  >
                    {t('pages.aboutPage.updateAndRestart')}
                  </button>
                  <p className="text-xs text-gray-500">{t('pages.aboutPage.installOnClose')}</p>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-gray-300 text-center leading-relaxed mb-10 max-w-xl mx-auto">
          {t('pages.aboutPage.appDescription')}
        </p>

        {/* Data Management */}
        <div className="bg-surface/50 border border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            {t('pages.aboutPage.dataManagement')}
          </h2>
          <p className="text-gray-500 text-sm mb-4">{t('pages.aboutPage.dataManagementDesc')}</p>
          <div className="flex gap-3">
            <button
              onClick={handleExportAll}
              disabled={exporting}
              className="px-5 py-2.5 bg-amber-600 hover:bg-accent-strong text-white rounded-lg
                font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? t('pages.aboutPage.exporting') : t('pages.aboutPage.exportAllData')}
            </button>
            <button
              onClick={() => setShowImportConfirm(true)}
              disabled={importing}
              className="px-5 py-2.5 border border-gray-600 hover:border-amber-600 hover:bg-surface-2
                text-gray-300 hover:text-accent rounded-lg font-semibold text-sm
                transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? t('pages.aboutPage.importing') : t('pages.aboutPage.importData')}
            </button>
          </div>
        </div>

        {/* Supported Systems */}
        <div className="flex gap-4 mb-10 justify-center">
          <div className="bg-surface/60 border border-gray-800 rounded-lg px-5 py-3 text-center">
            <div className="text-2xl mb-1">&#9876;</div>
            <div className="text-sm font-semibold">{t('pages.aboutPage.dnd5e')}</div>
            <div className="text-xs text-green-400 mt-1">{t('pages.aboutPage.fullSupport')}</div>
          </div>
        </div>

        {/* Features */}
        <div className="bg-surface/50 border border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            {t('pages.aboutPage.features')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm">
                <span className="text-green-400 text-xs">&#10003;</span>
                <span className="text-gray-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Stack */}
        <div className="bg-surface/50 border border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            {t('pages.aboutPage.techStack')}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {techStack.map((tech) => (
              <div key={tech.name} className="flex items-center justify-between">
                <span className="text-sm text-gray-200 font-medium">{tech.name}</span>
                <span className="text-xs text-gray-500">{t(tech.detailKey)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Credits */}
        <div className="bg-surface/50 border border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            {t('pages.aboutPage.credits')}
          </h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('pages.aboutPage.createdBy')}</div>
              <div className="text-sm text-gray-300">Gavin Knotts</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{t('pages.aboutPage.builtWith')}</div>
              <div className="text-sm text-gray-300">{t('pages.aboutPage.builtWithDetail')}</div>
            </div>
          </div>
        </div>

        {/* Legal & Licensing */}
        <div className="bg-surface/50 border border-gray-800 rounded-lg p-5 mb-10">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            {t('pages.aboutPage.legalLicensing')}
          </h2>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                {t('pages.aboutPage.srdAttributionLabel')}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                This work includes material taken from the System Reference Document 5.2 (&ldquo;SRD 5.2&rdquo;) by
                Wizards of the Coast LLC. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0
                International License available at{' '}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/legalcode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-amber-300 underline"
                >
                  https://creativecommons.org/licenses/by/4.0/legalcode
                </a>
                .
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                {t('pages.aboutPage.fanContentLabel')}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                D&amp;D Virtual Tabletop is unofficial Fan Content permitted under the{' '}
                <a
                  href="https://company.wizards.com/en/legal/fancontentpolicy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-amber-300 underline"
                >
                  Fan Content Policy
                </a>
                . Not approved/endorsed by Wizards of the Coast. Portions of the materials used are property of Wizards
                of the Coast. &copy;Wizards of the Coast LLC.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                {t('pages.aboutPage.trademarkLabel')}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{t('pages.aboutPage.trademarkNotice')}</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                {t('pages.aboutPage.openSourceLabel')}
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {isWebBuild() ? t('pages.aboutPage.openSourceLibrariesWeb') : t('pages.aboutPage.openSourceLibraries')}
              </p>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-gray-600 pb-6">
          <div>&copy; 2025-2026 Gavin Knotts</div>
          <div className="mt-1">{t('pages.aboutPage.gameContentNotice')}</div>
        </div>
      </div>

      <ConfirmDialog
        open={showImportConfirm}
        title={t('pages.aboutPage.importConfirmTitle')}
        message={t('pages.aboutPage.importConfirmMessage')}
        confirmLabel={t('pages.aboutPage.importConfirmLabel')}
        variant="warning"
        onConfirm={handleImportAll}
        onCancel={() => setShowImportConfirm(false)}
      />
    </div>
  )
}

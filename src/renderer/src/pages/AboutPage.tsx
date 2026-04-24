import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from '../components/ui'
import { addToast } from '../hooks/use-toast'
import { exportAllData, importAllData } from '../services/io/import-export'
import { logger } from '../utils/logger'

const FEATURES = [
  'Character Builder (D&D 5e 2024 PHB rules)',
  'Character Sheets with full stat calculation',
  'Level-Up Wizard (class features, spells, ASIs, feats)',
  'Campaign Management with adventure modules',
  'Interactive Battle Map (PixiJS) with grid, tokens, fog of war',
  'Initiative Tracker with surprise rules',
  '3D Dice with physics engine (Three.js + cannon-es)',
  'P2P Multiplayer via WebRTC',
  'AI Dungeon Master (Ollama)',
  'Bastion System (2024 DMG rules)',
  'Crafting System, Shop System',
  'NPC/Monster/Creature Management with stat blocks',
  'Weapon Mastery, Species heritage/lineage options',
  'Warlock Invocations, Sorcerer Metamagic',
  'Area of Effect templates, Terrain & lighting overlays',
  'Ray-cast lighting, wall system, cover calculation',
  'Journal system (TipTap rich text), handouts',
  'Sound Manager with 60+ sound events',
  'Calendar/time system with day/night cycle',
  'Mount & Vehicle system, Downtime activities',
  '167+ chat commands across 26 command modules',
  'Undo/redo, auto-save, theme system',
  'Import/export characters and campaigns'
]

const TECH_STACK = [
  { name: 'Electron 40', detail: 'Desktop framework' },
  { name: 'React 19', detail: 'UI library' },
  { name: 'TypeScript 5.9', detail: 'Type safety' },
  { name: 'Tailwind CSS v4', detail: 'Styling' },
  { name: 'Zustand v5', detail: 'State management' },
  { name: 'PeerJS', detail: 'WebRTC P2P networking' },
  { name: 'PixiJS 8', detail: 'Map rendering' },
  { name: 'Three.js', detail: '3D dice physics' },
  { name: 'TipTap', detail: 'Rich text editor' },
  { name: 'Vitest', detail: 'Testing framework' },
  { name: 'electron-vite', detail: 'Build tooling' }
]

export default function AboutPage(): JSX.Element {
  const navigate = useNavigate()
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
    window.api.update.onStatus((status) => {
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
      window.api.update.removeStatusListener()
    }
  }, [])

  const handleExportAll = async (): Promise<void> => {
    setExporting(true)
    try {
      const stats = await exportAllData()
      if (stats) {
        addToast(
          `Exported ${stats.characters} character${stats.characters !== 1 ? 's' : ''}, ${stats.campaigns} campaign${stats.campaigns !== 1 ? 's' : ''}, ${stats.bastions} bastion${stats.bastions !== 1 ? 's' : ''}, ${stats.customCreatures} creature${stats.customCreatures !== 1 ? 's' : ''}, ${stats.homebrew} homebrew`,
          'success'
        )
      }
    } catch (err) {
      logger.error('Export all failed:', err)
      addToast('Failed to export data', 'error')
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
          `Imported ${stats.characters} character${stats.characters !== 1 ? 's' : ''}, ${stats.campaigns} campaign${stats.campaigns !== 1 ? 's' : ''}, ${stats.bastions} bastion${stats.bastions !== 1 ? 's' : ''}, ${stats.customCreatures} creature${stats.customCreatures !== 1 ? 's' : ''}, ${stats.homebrew} homebrew`,
          'success'
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import data'
      addToast(message, 'error')
    } finally {
      setImporting(false)
      setShowImportConfirm(false)
    }
  }

  return (
    <div className="h-screen bg-gray-950 text-gray-100 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/')}
          className="text-amber-400 hover:text-amber-300 hover:underline mb-8 block cursor-pointer text-sm"
        >
          &larr; Back to Menu
        </button>

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="text-6xl mb-3">&#9876;</div>
          <h1 className="text-3xl font-bold text-amber-400 mb-1">D&D Virtual Tabletop</h1>
          <p className="text-gray-500 text-sm mb-3">Version {appVersion}</p>
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
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateStatus === 'idle' && 'Check for Updates'}
              {updateStatus === 'checking' && 'Checking...'}
              {updateStatus === 'up-to-date' && 'Up to date'}
              {updateStatus === 'available' && `Update ${updateVersion ?? ''} available!`}
              {updateStatus === 'downloading' && 'Downloading...'}
              {updateStatus === 'downloaded' && 'Update ready!'}
              {updateStatus === 'error' && `Check failed${errorMsg ? `: ${errorMsg}` : ''}`}
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
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
              >
                Download v{updateVersion}
              </button>
            )}

            {/* Download progress bar */}
            {updateStatus === 'downloading' && (
              <div className="w-48">
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${downloadPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{downloadPercent}%</p>
              </div>
            )}

            {/* Update & Restart button */}
            {updateStatus === 'downloaded' && (
              <>
                <button
                  onClick={() => window.api.update.installUpdate()}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 text-white cursor-pointer"
                >
                  Update &amp; Restart
                </button>
                <p className="text-[10px] text-gray-500">Will also install automatically on next app close</p>
              </>
            )}
          </div>
        </div>

        <p className="text-gray-300 text-center leading-relaxed mb-10 max-w-xl mx-auto">
          A desktop application for playing Dungeons & Dragons 5th Edition online with friends. Create characters, build
          campaigns, and adventure together — no browser required.
        </p>

        {/* Data Management */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Data Management</h2>
          <p className="text-gray-500 text-sm mb-4">
            Export all your characters, campaigns, bastions, and preferences to a single backup file, or restore from a
            previous backup.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleExportAll}
              disabled={exporting}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg
                font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting...' : 'Export All Data'}
            </button>
            <button
              onClick={() => setShowImportConfirm(true)}
              disabled={importing}
              className="px-5 py-2.5 border border-gray-600 hover:border-amber-600 hover:bg-gray-800
                text-gray-300 hover:text-amber-400 rounded-lg font-semibold text-sm
                transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? 'Importing...' : 'Import Data'}
            </button>
          </div>
        </div>

        {/* Supported Systems */}
        <div className="flex gap-4 mb-10 justify-center">
          <div className="bg-gray-900/60 border border-gray-800 rounded-lg px-5 py-3 text-center">
            <div className="text-2xl mb-1">&#9876;</div>
            <div className="text-sm font-semibold">D&D 5th Edition</div>
            <div className="text-xs text-green-400 mt-1">Full Support</div>
          </div>
        </div>

        {/* Features */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Features</h2>
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
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Tech Stack</h2>
          <div className="grid grid-cols-2 gap-3">
            {TECH_STACK.map((t) => (
              <div key={t.name} className="flex items-center justify-between">
                <span className="text-sm text-gray-200 font-medium">{t.name}</span>
                <span className="text-xs text-gray-500">{t.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Credits */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Credits</h2>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Created by</div>
              <div className="text-sm text-gray-300">Gavin Knotts</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Built with</div>
              <div className="text-sm text-gray-300">Developed with Cursor AI</div>
            </div>
          </div>
        </div>

        {/* Legal & Licensing */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 mb-10">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Legal &amp; Licensing</h2>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                D&amp;D 5e SRD Attribution (CC-BY-4.0)
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                This work includes material taken from the System Reference Document 5.2 (&ldquo;SRD 5.2&rdquo;) by
                Wizards of the Coast LLC. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0
                International License available at{' '}
                <a
                  href="https://creativecommons.org/licenses/by/4.0/legalcode"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  https://creativecommons.org/licenses/by/4.0/legalcode
                </a>
                .
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Fan Content Policy</div>
              <p className="text-xs text-gray-500 leading-relaxed">
                D&amp;D Virtual Tabletop is unofficial Fan Content permitted under the{' '}
                <a
                  href="https://company.wizards.com/en/legal/fancontentpolicy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  Fan Content Policy
                </a>
                . Not approved/endorsed by Wizards of the Coast. Portions of the materials used are property of Wizards
                of the Coast. &copy;Wizards of the Coast LLC.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Trademark Notice</div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Dungeons &amp; Dragons, D&amp;D, and Wizards of the Coast are trademarks of Wizards of the Coast LLC.
                This application is not affiliated with, endorsed by, or sponsored by Wizards of the Coast. All
                trademarks are property of their respective owners.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Open Source Libraries</div>
              <p className="text-xs text-gray-500 leading-relaxed">
                This application uses open-source libraries under MIT and other permissive licenses, including React,
                Electron, PeerJS, PixiJS, Zustand, Tailwind CSS, and React Router.
              </p>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-gray-600 pb-6">
          <div>&copy; 2025-2026 Gavin Knotts</div>
          <div className="mt-1">Game content used under Creative Commons Attribution 4.0 International License.</div>
        </div>
      </div>

      <ConfirmDialog
        open={showImportConfirm}
        title="Import Data from Backup?"
        message="Importing will restore characters, campaigns, bastions, and preferences from the backup file. Existing data with the same IDs will be overwritten."
        confirmLabel="Import"
        variant="warning"
        onConfirm={handleImportAll}
        onCancel={() => setShowImportConfirm(false)}
      />
    </div>
  )
}

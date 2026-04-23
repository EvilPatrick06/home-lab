import { useEffect, useState } from 'react'
import { getIceConfig, resetIceConfig, setIceConfig } from '../../../../network'

interface TurnEntry {
  urls: string
  username: string
  credential: string
}

const EMPTY_ENTRY: TurnEntry = { urls: '', username: '', credential: '' }

interface NetworkSettingsModalProps {
  onClose: () => void
}

export default function NetworkSettingsModal({ onClose }: NetworkSettingsModalProps): JSX.Element {
  const [entries, setEntries] = useState<TurnEntry[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.loadSettings().then((settings) => {
      if (settings.turnServers && settings.turnServers.length > 0) {
        setEntries(
          settings.turnServers.map((s) => ({
            urls: Array.isArray(s.urls) ? s.urls.join(', ') : s.urls,
            username: s.username ?? '',
            credential: s.credential ?? ''
          }))
        )
      }
    })
  }, [])

  const handleAdd = (): void => {
    setEntries([...entries, { ...EMPTY_ENTRY }])
  }

  const handleRemove = (index: number): void => {
    setEntries(entries.filter((_, i) => i !== index))
  }

  const handleChange = (index: number, field: keyof TurnEntry, value: string): void => {
    const updated = [...entries]
    updated[index] = { ...updated[index], [field]: value }
    setEntries(updated)
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    const turnServers = entries
      .filter((e) => e.urls.trim())
      .map((e) => ({
        urls: e.urls.trim(),
        username: e.username.trim() || undefined,
        credential: e.credential.trim() || undefined
      }))

    await window.api.saveSettings({ turnServers })

    // Apply to peer manager
    if (turnServers.length > 0) {
      setIceConfig(
        turnServers.map((s) => ({
          urls: s.urls,
          username: s.username,
          credential: s.credential
        }))
      )
    } else {
      resetIceConfig()
    }

    setSaving(false)
    onClose()
  }

  const handleReset = (): void => {
    setEntries([])
    resetIceConfig()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl p-5 w-[520px] max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Network Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 cursor-pointer">
            &#10005;
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Configure custom TURN servers for better connectivity behind restrictive firewalls. Default servers are used
          when no custom servers are configured.
        </p>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-gray-300">
            Current: {getIceConfig().length} ICE server{getIceConfig().length !== 1 ? 's' : ''}
          </span>
        </div>

        {entries.length === 0 && (
          <p className="text-sm text-gray-500 mb-4">No custom TURN servers configured. Using defaults.</p>
        )}

        <div className="space-y-3 mb-4">
          {entries.map((entry, i) => (
            <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400 font-medium">Server {i + 1}</span>
                <button
                  onClick={() => handleRemove(i)}
                  className="text-red-400 hover:text-red-300 text-xs cursor-pointer"
                >
                  Remove
                </button>
              </div>
              <input
                value={entry.urls}
                onChange={(e) => handleChange(i, 'urls', e.target.value)}
                placeholder="turn:server.example.com:443"
                className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm mb-2 focus:outline-none focus:border-amber-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={entry.username}
                  onChange={(e) => handleChange(i, 'username', e.target.value)}
                  placeholder="Username (optional)"
                  className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                />
                <input
                  type="password"
                  value={entry.credential}
                  onChange={(e) => handleChange(i, 'credential', e.target.value)}
                  placeholder="Credential (optional)"
                  className="bg-gray-900 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 cursor-pointer"
          >
            + Add Server
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 border border-gray-700 cursor-pointer"
          >
            Reset to Defaults
          </button>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

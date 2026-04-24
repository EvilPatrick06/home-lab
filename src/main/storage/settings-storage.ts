import { app } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

export interface RTCIceServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface UserProfile {
  id: string
  displayName: string
  avatarPath?: string
  createdAt: string
}

export interface AppSettings {
  turnServers?: RTCIceServerConfig[]
  userProfile?: UserProfile
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const content = await readFile(getSettingsPath(), 'utf-8')
    return JSON.parse(content) as AppSettings
  } catch {
    return {}
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const dir = app.getPath('userData')
  await mkdir(dir, { recursive: true })
  await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

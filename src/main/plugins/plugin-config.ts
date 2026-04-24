import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { PluginConfig } from '../../shared/plugin-types'
import { logToFile } from '../log'

function getConfigPath(): string {
  return join(app.getPath('userData'), 'plugin-config.json')
}

async function loadConfig(): Promise<PluginConfig> {
  try {
    const content = await readFile(getConfigPath(), 'utf-8')
    const parsed = JSON.parse(content)
    if (parsed && Array.isArray(parsed.plugins)) {
      return parsed as PluginConfig
    }
    return { plugins: [] }
  } catch {
    return { plugins: [] }
  }
}

async function saveConfig(config: PluginConfig): Promise<void> {
  try {
    // Ensure userData directory exists
    await mkdir(join(app.getPath('userData')), { recursive: true })
    await writeFile(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    logToFile('ERROR', `Failed to save plugin config: ${(err as Error).message}`)
  }
}

export async function getEnabledPluginIds(): Promise<Set<string>> {
  const config = await loadConfig()
  return new Set(config.plugins.filter((p) => p.enabled).map((p) => p.id))
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  const config = await loadConfig()
  const existing = config.plugins.find((p) => p.id === id)
  if (existing) {
    existing.enabled = enabled
  } else {
    config.plugins.push({ id, enabled })
  }
  await saveConfig(config)
}

export async function removePluginConfig(id: string): Promise<void> {
  const config = await loadConfig()
  config.plugins = config.plugins.filter((p) => p.id !== id)
  await saveConfig(config)
}

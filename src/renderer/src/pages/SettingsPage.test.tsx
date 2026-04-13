import { describe, expect, it, vi } from 'vitest'
import SettingsPage from './SettingsPage'

vi.mock('../components/ui/OllamaManagement', () => ({
  default: () => null,
  AvailableModelList: () => null,
  InstalledModelList: () => null
}))
vi.mock('../components/ui/DiscordIntegrationSettings', () => ({
  default: () => null
}))

describe('SettingsPage', () => {
  it('can be imported', () => {
    expect(SettingsPage).toBeDefined()
  })
})

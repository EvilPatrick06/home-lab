import { describe, expect, it } from 'vitest'
import type {
  CodePluginManifest,
  ContentCategory,
  ContentPackManifest,
  GameSystemManifest,
  PluginConfig,
  PluginConfigEntry,
  PluginManifest,
  PluginPermission,
  PluginStatus
} from './plugin-types'

describe('plugin-types', () => {
  it('should export ContentCategory type that accepts valid categories', () => {
    const category: ContentCategory = 'spells'
    expect(category).toBe('spells')
  })

  it('should export ContentPackManifest type', () => {
    const manifest: ContentPackManifest = {
      id: 'test-pack',
      name: 'Test Pack',
      version: '1.0.0',
      description: 'A test content pack',
      author: 'Test Author',
      type: 'content-pack',
      gameSystem: 'dnd5e',
      data: { spells: 'spells.json' }
    }
    expect(manifest.type).toBe('content-pack')
    expect(manifest.id).toBe('test-pack')
  })

  it('should export CodePluginManifest type', () => {
    const manifest: CodePluginManifest = {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'A test plugin',
      author: 'Test Author',
      type: 'plugin',
      gameSystem: 'dnd5e',
      entry: 'main.js',
      permissions: ['commands', 'storage']
    }
    expect(manifest.type).toBe('plugin')
    expect(manifest.entry).toBe('main.js')
  })

  it('should export GameSystemManifest type', () => {
    const manifest: GameSystemManifest = {
      id: 'pf2e',
      name: 'Pathfinder 2e',
      version: '1.0.0',
      description: 'PF2e system',
      author: 'Author',
      type: 'game-system',
      entry: 'index.js',
      permissions: ['game-events']
    }
    expect(manifest.type).toBe('game-system')
  })

  it('should export PluginManifest as a union type', () => {
    const contentPack: PluginManifest = {
      id: 'pack',
      name: 'Pack',
      version: '1.0.0',
      description: '',
      author: '',
      type: 'content-pack',
      gameSystem: 'dnd5e',
      data: {}
    }
    expect(contentPack.type).toBe('content-pack')
  })

  it('should export PluginStatus type', () => {
    const status: PluginStatus = {
      id: 'test-plugin',
      manifest: {
        id: 'test-plugin',
        name: 'Test',
        version: '1.0.0',
        description: '',
        author: '',
        type: 'content-pack',
        gameSystem: 'dnd5e',
        data: {}
      },
      enabled: true,
      loaded: false,
      error: undefined
    }
    expect(status.enabled).toBe(true)
    expect(status.loaded).toBe(false)
  })

  it('should export PluginConfigEntry type', () => {
    const entry: PluginConfigEntry = { id: 'plugin-a', enabled: true }
    expect(entry.id).toBe('plugin-a')
    expect(entry.enabled).toBe(true)
  })

  it('should export PluginConfig type', () => {
    const config: PluginConfig = {
      plugins: [
        { id: 'plugin-a', enabled: true },
        { id: 'plugin-b', enabled: false }
      ]
    }
    expect(config.plugins).toHaveLength(2)
  })

  it('should export PluginPermission type with valid values', () => {
    const permissions: PluginPermission[] = [
      'commands',
      'ui-extensions',
      'game-events',
      'combat-hooks',
      'dm-actions',
      'sounds',
      'storage'
    ]
    expect(permissions).toHaveLength(7)
  })

  it('should verify the module can be dynamically imported', async () => {
    const mod = await import('./plugin-types')
    expect(mod).toBeDefined()
  })
})

/**
 * Shared test helpers for the D&D VTT renderer.
 *
 * Provides common mock factories and setup utilities to reduce duplication
 * across test files. Import only what you need — all exports are tree-shakable.
 */

import { expect, vi } from 'vitest'
import type { CommandContext } from './services/chat-commands/index'
import type { Character5e } from './types/character-5e'

// ---------------------------------------------------------------------------
// Character factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal but valid Character5e object for use in tests.
 * Override any field with the optional `overrides` parameter.
 *
 * @example
 * const char = createMockCharacter({ level: 10, name: 'Gandalf' })
 */
export function createMockCharacter(overrides: Partial<Character5e> = {}): Character5e {
  return {
    id: 'char-1',
    gameSystem: 'dnd5e',
    campaignId: null,
    playerId: 'player-1',
    name: 'Thorin',
    species: 'Dwarf',
    classes: [{ name: 'Fighter', level: 5, subclass: '', hitDie: 10, isStartingClass: true }],
    level: 5,
    background: 'Soldier',
    alignment: 'Lawful Good',
    xp: 6500,
    levelingMode: 'xp',
    abilityScores: {
      strength: 16,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 13,
      charisma: 8
    },
    hitPoints: { maximum: 40, current: 30, temporary: 5 },
    hitDice: [{ dieType: 10, total: 5, used: 0 }],
    armorClass: 16,
    initiative: 1,
    speed: 25,
    speeds: { swim: 0, fly: 0, climb: 0, burrow: 0 },
    senses: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    details: {
      personality: '',
      ideals: '',
      bonds: '',
      flaws: '',
      gender: '',
      age: '',
      height: '',
      weight: '',
      eyes: '',
      hair: '',
      skin: ''
    },
    proficiencies: {
      armor: [],
      weapons: [],
      tools: [],
      languages: [],
      savingThrows: [],
      skills: []
    },
    skills: [],
    equipment: [],
    treasure: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    features: [],
    knownSpells: [],
    preparedSpellIds: [],
    spellSlotLevels: {},
    classFeatures: [],
    weapons: [],
    armor: [],
    feats: [],
    buildChoices: {
      classId: 'fighter',
      subclassId: '',
      backgroundId: 'soldier',
      speciesId: 'dwarf',
      abilityScoreMethod: 'standard'
    },
    status: 'active',
    campaignHistory: [],
    backstory: '',
    notes: '',
    pets: [],
    deathSaves: { successes: 0, failures: 0 },
    attunement: [],
    ...overrides
  } as unknown as Character5e
}

// ---------------------------------------------------------------------------
// Command context factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal CommandContext suitable for chat command tests.
 *
 * Defaults to a DM context. Pass `{ isDM: false, character: createMockCharacter() }`
 * for player contexts.
 *
 * @example
 * const ctx = createCommandContext()
 * const ctx = createCommandContext({ isDM: false, character: createMockCharacter() })
 */
export function createCommandContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    isDM: true,
    playerName: 'DM',
    character: null,
    localPeerId: 'local',
    addSystemMessage: vi.fn(),
    broadcastSystemMessage: vi.fn(),
    addErrorMessage: vi.fn(),
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// window.api mock setup
// ---------------------------------------------------------------------------

/**
 * Stubs `window.api` with sensible defaults for file IO tests.
 * Call this at module scope (not inside a test) so vi.stubGlobal is hoisted
 * before imports.
 *
 * Individual methods can be re-mocked per-test with `vi.mocked(window.api.X).mockResolvedValueOnce(...)`.
 *
 * @example
 * // At the top of a test file, before any imports that use window.api:
 * setupWindowApiMock()
 */
export function setupWindowApiMock(
  overrides: Partial<{
    showOpenDialog: ReturnType<typeof vi.fn>
    showSaveDialog: ReturnType<typeof vi.fn>
    readFile: ReturnType<typeof vi.fn>
    writeFile: ReturnType<typeof vi.fn>
    saveCharacter: ReturnType<typeof vi.fn>
    loadCharacters: ReturnType<typeof vi.fn>
    saveCampaign: ReturnType<typeof vi.fn>
    loadCampaigns: ReturnType<typeof vi.fn>
  }> = {}
): void {
  vi.stubGlobal('window', {
    api: {
      showOpenDialog: vi.fn(() => Promise.resolve('/fake/path/character.json')),
      showSaveDialog: vi.fn(() => Promise.resolve('/fake/path/output.json')),
      readFile: vi.fn(() => Promise.resolve('{}')),
      writeFile: vi.fn(() => Promise.resolve({ success: true })),
      saveCharacter: vi.fn(() => Promise.resolve({ success: true })),
      loadCharacters: vi.fn(() => Promise.resolve({ success: true, data: [] })),
      saveCampaign: vi.fn(() => Promise.resolve({ success: true })),
      loadCampaigns: vi.fn(() => Promise.resolve({ success: true, data: [] })),
      ...overrides
    }
  })
}

// ---------------------------------------------------------------------------
// Logger mock factory
// ---------------------------------------------------------------------------

/**
 * Returns a vi.mock factory for the renderer logger utility.
 * Use inside `vi.mock('../../utils/logger', mockLogger)`.
 *
 * @example
 * vi.mock('../../utils/logger', createLoggerMock())
 */
export function createLoggerMock() {
  return () => ({
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    }
  })
}

// ---------------------------------------------------------------------------
// Command shape assertion helpers
// ---------------------------------------------------------------------------

/**
 * Asserts that every command in the given array has the required ChatCommand
 * shape: name, description, execute, aliases, usage, category, dmOnly.
 *
 * Use inside a `it(...)` block.
 *
 * @example
 * it('every command has required fields', () => assertCommandShape(commands))
 */
export function assertCommandShape(commands: unknown[]): void {
  for (const cmd of commands as Record<string, unknown>[]) {
    expect(cmd).toHaveProperty('name')
    expect(cmd).toHaveProperty('description')
    expect(cmd).toHaveProperty('execute')
    expect(typeof cmd.name).toBe('string')
    expect(typeof cmd.description).toBe('string')
    expect(typeof cmd.execute).toBe('function')
    expect(Array.isArray(cmd.aliases)).toBe(true)
    expect(typeof cmd.usage).toBe('string')
    expect(typeof cmd.category).toBe('string')
    expect(typeof cmd.dmOnly).toBe('boolean')
  }
}

/**
 * Asserts that command names in the array are unique.
 *
 * @example
 * it('names are unique', () => assertUniqueCommandNames(commands))
 */
export function assertUniqueCommandNames(commands: { name: string }[]): void {
  const names = commands.map((c) => c.name)
  expect(new Set(names).size).toBe(names.length)
}

/**
 * Asserts that command names are lowercase and do not begin with a slash.
 *
 * @example
 * it('names are lowercase without leading slash', () => assertCommandNameFormat(commands))
 */
export function assertCommandNameFormat(commands: { name: string }[]): void {
  for (const cmd of commands) {
    expect(cmd.name).not.toMatch(/^\//)
    expect(cmd.name).toBe(cmd.name.toLowerCase())
  }
}

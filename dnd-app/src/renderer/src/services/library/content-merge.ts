/**
 * Homebrew + plugin content merge (PHASE-13 13K — extracted verbatim from
 * use-config-store so the merge logic is importable without the zustand store).
 * Pure functions: given base library data + the homebrew/plugin maps, produce the
 * merged array. The config store's loader calls them with the same args as before.
 */

export type DataCategory =
  | 'species'
  | 'speciesTraits'
  | 'classes'
  | 'backgrounds'
  | 'subclasses'
  | 'feats'
  | 'spells'
  | 'classFeatures'
  | 'equipment'
  | 'crafting'
  | 'diseases'
  | 'encounterBudgets'
  | 'treasureTables'
  | 'randomTables'
  | 'chaseTables'
  | 'encounterPresets'
  | 'npcNames'
  | 'invocations'
  | 'metamagic'
  | 'bastionFacilities'
  | 'magicItems'
  | 'monsters'
  | 'npcs'
  | 'creatures'
  | 'traps'
  | 'hazards'
  | 'poisons'
  | 'environmentalEffects'
  | 'curses'
  | 'supernaturalGifts'
  | 'siegeEquipment'
  | 'settlements'
  | 'mounts'
  | 'vehicles'
  | 'downtime'
  | 'conditions'
  | 'weaponMastery'
  | 'languages'
  | 'skills'
  | 'fightingStyles'
  | 'variantItems'
  | 'lightSources'
  | 'npcAppearance'
  | 'npcMannerisms'
  | 'alignmentDescriptions'
  | 'wearableItems'
  | 'personalityTables'
  | 'xpThresholds'
  | 'startingEquipment'
  | 'bastionEvents'
  | 'sentientItems'
  | 'weatherGeneration'
  | 'calendarPresets'
  | 'effectDefinitions'
  | 'spellSlots'
  | 'trinkets'
  | 'companions'
  | 'deities'
  | 'planes'
  | 'soundEvents'
  | 'speciesSpells'
  | 'classResources'
  | 'speciesResources'
  | 'abilityScoreConfig'
  | 'presetIcons'
  | 'keyboardShortcuts'
  | 'themes'
  | 'diceColors'
  | 'dmTabs'
  | 'notificationTemplates'
  | 'builtInMaps'
  | 'sessionZeroConfig'
  | 'diceTypes'
  | 'lightingTravel'
  | 'currencyConfig'
  | 'moderation'
  | 'adventureSeeds'
  | 'creatureTypes'
  | 'ambientTracks'
  | 'languageD12Table'
  | 'rarityOptions'
  | 'tools'

export function categoryToHomebrewKey(category: DataCategory): string {
  const map: Record<DataCategory, string> = {
    species: 'species',
    speciesTraits: 'species-traits',
    classes: 'classes',
    backgrounds: 'backgrounds',
    subclasses: 'subclasses',
    feats: 'feats',
    spells: 'spells',
    classFeatures: 'class-features',
    equipment: 'equipment',
    crafting: 'crafting',
    diseases: 'diseases',
    encounterBudgets: 'encounter-budgets',
    treasureTables: 'treasure-tables',
    randomTables: 'random-tables',
    chaseTables: 'chase-tables',
    encounterPresets: 'encounter-presets',
    npcNames: 'npc-names',
    invocations: 'invocations',
    metamagic: 'metamagic',
    bastionFacilities: 'bastion-facilities',
    magicItems: 'magic-items',
    monsters: 'monsters',
    npcs: 'npcs',
    creatures: 'creatures',
    traps: 'traps',
    hazards: 'hazards',
    poisons: 'poisons',
    environmentalEffects: 'environmental-effects',
    curses: 'curses',
    supernaturalGifts: 'supernatural-gifts',
    siegeEquipment: 'siege-equipment',
    settlements: 'settlements',
    mounts: 'mounts',
    vehicles: 'vehicles',
    downtime: 'downtime',
    conditions: 'conditions',
    weaponMastery: 'weapon-mastery',
    languages: 'languages',
    skills: 'skills',
    fightingStyles: 'fighting-styles',
    variantItems: 'variant-items',
    lightSources: 'light-sources',
    npcAppearance: 'npc-appearance',
    npcMannerisms: 'npc-mannerisms',
    alignmentDescriptions: 'alignment-descriptions',
    wearableItems: 'wearable-items',
    personalityTables: 'personality-tables',
    xpThresholds: 'xp-thresholds',
    startingEquipment: 'starting-equipment',
    bastionEvents: 'bastion-events',
    sentientItems: 'sentient-items',
    weatherGeneration: 'weather-generation',
    calendarPresets: 'calendar-presets',
    effectDefinitions: 'effect-definitions',
    spellSlots: 'spell-slots',
    trinkets: 'trinkets',
    soundEvents: 'sound-events',
    speciesSpells: 'species-spells',
    classResources: 'class-resources',
    speciesResources: 'species-resources',
    abilityScoreConfig: 'ability-score-config',
    presetIcons: 'preset-icons',
    keyboardShortcuts: 'keyboard-shortcuts',
    themes: 'themes',
    diceColors: 'dice-colors',
    dmTabs: 'dm-tabs',
    notificationTemplates: 'notification-templates',
    builtInMaps: 'built-in-maps',
    sessionZeroConfig: 'session-zero-config',
    diceTypes: 'dice-types',
    lightingTravel: 'lighting-travel',
    currencyConfig: 'currency-config',
    moderation: 'moderation',
    adventureSeeds: 'adventure-seeds',
    creatureTypes: 'creature-types',
    ambientTracks: 'ambient-tracks',
    languageD12Table: 'language-d12-table',
    rarityOptions: 'rarity-options',
    tools: 'tools',
    companions: 'companions',
    deities: 'deities',
    planes: 'planes'
  }
  return map[category]
}

export function mergeHomebrew<T>(
  category: DataCategory,
  baseData: T,
  homebrewByCategory: Map<string, Record<string, unknown>[]>,
  activeCampaignId?: string | null
): T {
  const catKey = categoryToHomebrewKey(category)
  const allEntries = homebrewByCategory.get(catKey)
  if (!allEntries || allEntries.length === 0) return baseData

  if (!Array.isArray(baseData)) return baseData

  // Phase 25c — campaign scope filter. Global entries (no campaignId) are
  // always visible; campaign-scoped entries only when their campaign is active.
  const homebrewEntries = allEntries.filter((e) => {
    const cid = (e as { campaignId?: string }).campaignId
    return cid === undefined || cid === null || cid === activeCampaignId
  })
  if (homebrewEntries.length === 0) return baseData

  const result = [...baseData]

  for (const entry of homebrewEntries) {
    // Homebrew entries wrap actual data under .data — unwrap if present
    const raw =
      entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)
        ? { ...(entry.data as Record<string, unknown>), id: entry.id ?? (entry.data as Record<string, unknown>).id }
        : entry
    const entryWithSource = { ...raw, source: 'homebrew' }
    result.push(entryWithSource as (typeof result)[number])
  }

  return result as T
}

export function mergePluginData<T>(
  category: DataCategory,
  baseData: T,
  pluginDataByCategory: Map<string, Record<string, unknown>[]>
): T {
  const pluginEntries = pluginDataByCategory.get(category)
  if (!pluginEntries || pluginEntries.length === 0) return baseData

  if (!Array.isArray(baseData)) return baseData

  const result = [...baseData]
  for (const entry of pluginEntries) {
    result.push(entry as (typeof result)[number])
  }
  return result as T
}

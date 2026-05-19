import type { z } from 'zod'
import type { LibraryCategory } from '../../../types/library'
import { ActionsSchema } from './actions.schema'
import { AdventureSeedsSchema } from './adventure-seeds.schema'
import { ArmorSchema } from './armor.schema'
import { BackgroundsSchema } from './backgrounds.schema'
import { BastionsSchema } from './bastions.schema'
import { CalendarsSchema } from './calendars.schema'
import { CampaignsSchema } from './campaigns.schema'
import { CharactersSchema } from './characters.schema'
import { ChaseTablesSchema } from './chase-tables.schema'
import { ClassFeaturesSchema } from './class-features.schema'
import { ClassesSchema } from './classes.schema'
import { CompanionsSchema } from './companions.schema'
import { ConditionsSchema } from './conditions.schema'
import { CoverSchema } from './cover.schema'
import { CraftingSchema } from './crafting.schema'
import { CreaturesSchema } from './creatures.schema'
import { CursesSchema } from './curses.schema'
import { DamageTypesSchema } from './damage-types.schema'
import { DcsSchema } from './dcs.schema'
import { DeitiesSchema } from './deities.schema'
import { DiseasesSchema } from './diseases.schema'
import { DowntimeSchema } from './downtime.schema'
import { EncounterPresetsSchema } from './encounter-presets.schema'
import { EnvironmentalEffectsSchema } from './environmental-effects.schema'
import { FeatsSchema } from './feats.schema'
import { FightingStylesSchema } from './fighting-styles.schema'
import { GearSchema } from './gear.schema'
import { HazardsSchema } from './hazards.schema'
import { InvocationsSchema } from './invocations.schema'
import { LanguagesSchema } from './languages.schema'
import { LightSourcesSchema } from './light-sources.schema'
import { MagicItemsSchema } from './magic-items.schema'
import { MapsSchema } from './maps.schema'
import { MetamagicSchema } from './metamagic.schema'
import { MonstersSchema } from './monsters.schema'
import { MountsSchema } from './mounts.schema'
import { NpcNamesSchema } from './npc-names.schema'
import { NpcsSchema } from './npcs.schema'
import { PlanesSchema } from './planes.schema'
import { PoisonsSchema } from './poisons.schema'
import { PortraitsSchema } from './portraits.schema'
import { RandomTablesSchema } from './random-tables.schema'
import { RulesSchema } from './rules.schema'
import { SentientItemsSchema } from './sentient-items.schema'
import { SettlementsSchema } from './settlements.schema'
import { ShopTemplatesSchema } from './shop-templates.schema'
import { SiegeEquipmentSchema } from './siege-equipment.schema'
import { SkillsSchema } from './skills.schema'
import { SoundsSchema } from './sounds.schema'
import { SpeciesSchema } from './species.schema'
import { SpellsSchema } from './spells.schema'
import { SubclassesSchema } from './subclasses.schema'
import { SupernaturalGiftsSchema } from './supernatural-gifts.schema'
import { ToolsSchema } from './tools.schema'
import { TrapsSchema } from './traps.schema'
import { TreasureTablesSchema } from './treasure-tables.schema'
import { TrinketsSchema } from './trinkets.schema'
import { VehiclesSchema } from './vehicles.schema'
import { WeaponMasterySchema } from './weapon-mastery.schema'
import { WeaponsSchema } from './weapons.schema'

export const SCHEMA_REGISTRY = {
  actions: ActionsSchema,
  'adventure-seeds': AdventureSeedsSchema,
  armor: ArmorSchema,
  backgrounds: BackgroundsSchema,
  bastions: BastionsSchema,
  calendars: CalendarsSchema,
  campaigns: CampaignsSchema,
  characters: CharactersSchema,
  'chase-tables': ChaseTablesSchema,
  'class-features': ClassFeaturesSchema,
  classes: ClassesSchema,
  companions: CompanionsSchema,
  conditions: ConditionsSchema,
  cover: CoverSchema,
  crafting: CraftingSchema,
  creatures: CreaturesSchema,
  curses: CursesSchema,
  'damage-types': DamageTypesSchema,
  dcs: DcsSchema,
  deities: DeitiesSchema,
  diseases: DiseasesSchema,
  downtime: DowntimeSchema,
  'encounter-presets': EncounterPresetsSchema,
  'environmental-effects': EnvironmentalEffectsSchema,
  feats: FeatsSchema,
  'fighting-styles': FightingStylesSchema,
  gear: GearSchema,
  hazards: HazardsSchema,
  invocations: InvocationsSchema,
  languages: LanguagesSchema,
  'light-sources': LightSourcesSchema,
  'magic-items': MagicItemsSchema,
  maps: MapsSchema,
  metamagic: MetamagicSchema,
  monsters: MonstersSchema,
  mounts: MountsSchema,
  'npc-names': NpcNamesSchema,
  npcs: NpcsSchema,
  planes: PlanesSchema,
  poisons: PoisonsSchema,
  portraits: PortraitsSchema,
  'random-tables': RandomTablesSchema,
  rules: RulesSchema,
  'sentient-items': SentientItemsSchema,
  settlements: SettlementsSchema,
  'shop-templates': ShopTemplatesSchema,
  'siege-equipment': SiegeEquipmentSchema,
  skills: SkillsSchema,
  sounds: SoundsSchema,
  species: SpeciesSchema,
  spells: SpellsSchema,
  subclasses: SubclassesSchema,
  'supernatural-gifts': SupernaturalGiftsSchema,
  tools: ToolsSchema,
  traps: TrapsSchema,
  'treasure-tables': TreasureTablesSchema,
  trinkets: TrinketsSchema,
  vehicles: VehiclesSchema,
  'weapon-mastery': WeaponMasterySchema,
  weapons: WeaponsSchema
} as const satisfies Record<LibraryCategory, z.ZodTypeAny>

export function validateEntry<C extends LibraryCategory>(
  category: C,
  raw: unknown
): z.infer<(typeof SCHEMA_REGISTRY)[C]> {
  const schema = SCHEMA_REGISTRY[category]
  return schema.parse(raw) as z.infer<(typeof SCHEMA_REGISTRY)[C]>
}

export function safeValidateEntry<C extends LibraryCategory>(
  category: C,
  raw: unknown
): { success: true; data: z.infer<(typeof SCHEMA_REGISTRY)[C]> } | { success: false; error: z.ZodError } {
  const schema = SCHEMA_REGISTRY[category]
  const result = schema.safeParse(raw)
  if (result.success) {
    return { success: true, data: result.data as z.infer<(typeof SCHEMA_REGISTRY)[C]> }
  }
  return { success: false, error: result.error }
}

// Phase 28d — canonical home for the companion types in the `Character5e`
// transitive type closure. These are type-only (no runtime), so they are safe to
// share across the main/renderer process boundary. The full `companion.ts` in
// `src/renderer/src/types/` re-exports these and keeps its own runtime
// (STANDARD_FAMILIAR_FORMS, WILD_SHAPE_TIERS, …) plus renderer-only types.

export type CompanionType = 'familiar' | 'wildShape' | 'steed' | 'summoned'

export interface Companion5e {
  id: string
  type: CompanionType
  name: string
  monsterStatBlockId: string
  currentHP: number
  maxHP: number
  tokenId?: string // linked MapToken.id when placed on map
  ownerId: string // Character5e.id
  dismissed: boolean // familiars can be dismissed to pocket dimension
  sourceSpell?: string // "find-familiar", "find-steed", "summon-beast"
  concentrationCasterId?: string
  createdAt: string
}

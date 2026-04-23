/**
 * Character sheet enforcement, stat change tracking, creature mutations,
 * and difficulty class rules for the DM system prompt.
 */

export const CHARACTER_RULES_PROMPT = `
## Character Sheet Enforcement

When character data is provided in [CHARACTER DATA] blocks, you MUST enforce the character's mechanical state:

### Hit Points
- Track HP changes accurately — always state the new HP total after damage or healing
- Apply temporary HP rules: temp HP absorbs damage first and does NOT stack (keep higher value)
- At 0 HP the character falls unconscious and must make death saving throws
- Massive damage rule: if remaining damage after reaching 0 HP equals or exceeds max HP, instant death

### Spellcasting
- Check spell slot availability BEFORE allowing a spell to be cast
- If a character has no slots at the required level, tell the player
- Enforce concentration: casting a new concentration spell ends the previous one
- Track ritual casting (takes 10 extra minutes, doesn't use a slot if the spell has the ritual tag)
- **One Spell with a Spell Slot per Turn**: A character can expend only one spell slot to cast a spell per turn. On a turn where they cast a spell with a spell slot (whether as an Action, Bonus Action, or Reaction on their own turn), they can still cast a cantrip with a casting time of one Action, but they cannot cast another spell using a spell slot.
- **Casting in Armor**: If a character is wearing armor they lack proficiency with, they cannot cast spells. Check the character's armor proficiencies before allowing spellcasting.
- **Warlock Pact Magic**: Warlock spell slots (Pact Magic) recover on a Short Rest, not just a Long Rest like other caster slots. Pact Magic slots are separate from regular spell slots and scale differently (max 4 slots, up to 5th level). When a multiclass Warlock casts a spell, they choose whether to use a Pact Magic slot or a regular spell slot.

### Proficiencies & Checks
- Reference the character's actual ability scores and modifiers for all checks
- Apply proficiency bonus only when the character is proficient in the relevant skill/save/tool
- For expertise, apply double proficiency bonus
- When a character attempts something with armor/weapons they're not proficient in, note the mechanical consequences

### Combat
- Use the character's actual attack bonus and damage for weapon attacks
- Apply the correct AC based on equipped armor
- Track conditions and their effects (disadvantage, speed reduction, etc.)
- Be explicit about mechanical outcomes: "The goblin hits for 7 slashing damage, bringing you to 23/30 HP"

### Class Resources
- Track expenditure of class-specific resources (rage, ki points, sorcery points, bardic inspiration, etc.)
- Note when a resource is depleted
- Remind the player when they try to use an expended resource

## Stat Change Tracking

When a campaign is active with a loaded character, and your response involves mechanical changes to the character's state (damage taken, spells cast, conditions gained, items acquired, gold spent, etc.), you MUST append a JSON block at the very end of your response:

\`\`\`
[STAT_CHANGES]
{"changes": [
  {"type": "damage", "characterName": "Aria", "value": 7, "damageType": "slashing", "reason": "goblin's scimitar hit"},
  {"type": "expend_spell_slot", "characterName": "Aria", "level": 1, "reason": "cast Shield as reaction"},
  {"type": "add_condition", "characterName": "Aria", "name": "poisoned", "reason": "failed DC 12 CON save vs venom"}
]}
[/STAT_CHANGES]
\`\`\`

### Stat Change Rules
- Only emit this block when events ACTUALLY OCCUR in the narrative (not hypothetical or planned)
- Only emit when the campaign has a loaded character with a characterId
- Include ALL mechanical changes from this response in a single block
- Use the character's actual stats to determine outcomes
- **ALWAYS include "characterName" matching the character's name from [CHARACTER DATA] blocks** — this is required so changes are applied to the correct character, especially in multiplayer
- Valid change types:
  - **damage**: {characterName, value, damageType?, reason} — HP reduction
  - **heal**: {characterName, value, reason} — HP restoration
  - **temp_hp**: {characterName, value, reason} — temporary hit points
  - **add_condition**: {characterName, name, reason} — gain a condition
  - **remove_condition**: {characterName, name, reason} — lose a condition
  - **death_save**: {characterName, success: bool, reason} — death saving throw result
  - **reset_death_saves**: {characterName, reason} — clear death save tallies
  - **expend_spell_slot**: {characterName, level, reason} — use a spell slot
  - **restore_spell_slot**: {characterName, level, count?, reason} — regain a slot
  - **add_item**: {characterName, name, quantity?, description?, reason} — gain equipment
  - **remove_item**: {characterName, name, quantity?, reason} — lose equipment
  - **gold**: {characterName, value (+/-), denomination? (cp/sp/gp/pp), reason} — currency change
  - **xp**: {characterName, value, reason} — experience points gained
  - **use_class_resource**: {characterName, name, amount?, reason} — spend class resource
  - **restore_class_resource**: {characterName, name, amount?, reason} — regain class resource
  - **heroic_inspiration**: {characterName, grant: bool, reason} — inspiration toggle
  - **hit_dice**: {characterName, value (+/-), reason} — hit dice change

### Creature Mutations
When creatures/monsters on the map take damage, gain/lose conditions, or are killed, emit these creature-targeted changes in the SAME [STAT_CHANGES] block:
  - **creature_damage**: {targetLabel, value, damageType?, reason} — damage to a map creature (match targetLabel to creature name on map)
  - **creature_heal**: {targetLabel, value, reason} — heal a map creature
  - **creature_add_condition**: {targetLabel, name, reason} — add condition to creature
  - **creature_remove_condition**: {targetLabel, name, reason} — remove condition from creature
  - **creature_kill**: {targetLabel, reason} — kill a creature (set HP to 0)
  - **set_ability_score**: {characterName, ability, value, reason} — set an ability score (ability: str/dex/con/int/wis/cha, value 1-30)
  - **grant_feature**: {characterName, name, description?, reason} — grant a special feature or permanent effect
  - **revoke_feature**: {characterName, name, reason} — remove a feature or effect

Example with mixed player and creature changes (multiplayer):
\`\`\`
[STAT_CHANGES]
{"changes": [
  {"type": "damage", "characterName": "Thorin", "value": 12, "damageType": "fire", "reason": "dragon's fire breath"},
  {"type": "damage", "characterName": "Aria", "value": 8, "damageType": "fire", "reason": "dragon's fire breath"},
  {"type": "creature_damage", "targetLabel": "Wolf 1", "value": 8, "damageType": "slashing", "reason": "fighter's longsword hit"},
  {"type": "creature_kill", "targetLabel": "Wolf 2", "reason": "rogue's sneak attack finished it off"}
]}
[/STAT_CHANGES]
\`\`\`

## Difficulty Classes (2024 PHB)
Use these standard DCs for ability checks:
- **DC 5**: Very Easy
- **DC 10**: Easy
- **DC 15**: Medium
- **DC 20**: Hard
- **DC 25**: Very Hard
- **DC 30**: Nearly Impossible

Always set a specific DC mentally before asking for a check. State the DC when narrating the outcome.`

export interface StatChangeEvent {
  type:
    | 'damage'
    | 'heal'
    | 'temp_hp'
    | 'add_condition'
    | 'remove_condition'
    | 'death_save'
    | 'reset_death_saves'
    | 'expend_spell_slot'
    | 'restore_spell_slot'
    | 'add_item'
    | 'remove_item'
    | 'gold'
    | 'xp'
    | 'use_class_resource'
    | 'restore_class_resource'
    | 'heroic_inspiration'
    | 'hit_dice'
    | 'set_ability_score'
    | 'grant_feature'
    | 'revoke_feature'
  value?: number
  damageType?: string
  reason: string
  name?: string
  success?: boolean
  level?: number
  count?: number
  quantity?: number
  description?: string
  denomination?: 'cp' | 'sp' | 'gp' | 'pp'
  grant?: boolean
  amount?: number
  ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
}

export interface CreatureMutationEvent {
  type: 'creature_damage' | 'creature_heal' | 'creature_add_condition' | 'creature_remove_condition' | 'creature_kill'
  targetLabel: string
  value: number
  damageType?: string
  reason: string
  name?: string
}

export interface StatChangeSet {
  changes: (StatChangeEvent | CreatureMutationEvent)[]
}

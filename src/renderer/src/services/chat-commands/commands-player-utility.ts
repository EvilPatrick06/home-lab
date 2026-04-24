import { SKILLS_5E } from '../../data/skills'
import { useLobbyStore } from '../../stores/use-lobby-store'
import { useNetworkStore } from '../../stores/use-network-store'
import type { AbilityName } from '../../types/character-common'
import { ABILITY_NAMES, abilityModifier, formatMod } from '../../types/character-common'
import { broadcastDiceResult, getLatestCharacter } from './helpers'
import type { ChatCommand } from './types'

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1
}

const REFERENCE_DATA: Record<string, string> = {
  conditions: [
    '**Conditions Reference**',
    "- **Blinded**: Can't see, auto-fail sight checks, attacks have disadvantage, attacks against have advantage",
    "- **Charmed**: Can't attack charmer, charmer has advantage on social checks",
    "- **Deafened**: Can't hear, auto-fail hearing checks",
    '- **Exhaustion**: Cumulative levels 1-6; -2 per level to d20 rolls, speed reduced, death at 6',
    "- **Frightened**: Disadvantage on checks/attacks while source in sight, can't move closer",
    "- **Grappled**: Speed 0, can't benefit from speed bonuses",
    "- **Incapacitated**: Can't take actions or reactions",
    '- **Invisible**: Impossible to see without magic/special sense, advantage on attacks, attacks against have disadvantage',
    "- **Paralyzed**: Incapacitated, can't move or speak, auto-fail STR/DEX saves, attacks have advantage, melee crits",
    '- **Petrified**: Turned to stone, weight x10, incapacitated, unaware, resistance to all damage',
    '- **Poisoned**: Disadvantage on attacks and ability checks',
    '- **Prone**: Disadvantage on attacks, melee attacks against have advantage, ranged attacks against have disadvantage, must use movement to stand',
    '- **Restrained**: Speed 0, attacks have disadvantage, attacks against have advantage, disadvantage on DEX saves',
    "- **Stunned**: Incapacitated, can't move, auto-fail STR/DEX saves, attacks against have advantage",
    '- **Unconscious**: Incapacitated, prone, drop items, auto-fail STR/DEX saves, attacks have advantage, melee crits'
  ].join('\n'),

  actions: [
    '**Actions in Combat**',
    '- **Attack**: Make one melee or ranged attack (more with Extra Attack)',
    '- **Cast a Spell**: Cast a spell with a casting time of 1 action',
    '- **Dash**: Gain extra movement equal to your speed',
    "- **Disengage**: Movement doesn't provoke opportunity attacks",
    '- **Dodge**: Attacks against you have disadvantage, advantage on DEX saves',
    '- **Help**: Give an ally advantage on next check or attack',
    '- **Hide**: Make a Stealth check to become hidden',
    "- **Influence**: Make a Charisma check to influence an NPC's attitude",
    '- **Magic**: Use a magic item or activate a special magical ability',
    '- **Ready**: Prepare an action to trigger on a condition',
    '- **Search**: Make a Perception or Investigation check to find something',
    '- **Study**: Make an ability check to recall or discern information',
    '- **Utilize**: Use a non-magical object or interact with the environment'
  ].join('\n'),

  cover: [
    '**Cover**',
    '- **Half Cover (+2 AC, +2 DEX saves)**: Obstacle blocks at least half the target',
    '- **Three-Quarters Cover (+5 AC, +5 DEX saves)**: Obstacle blocks at least three-quarters of the target',
    "- **Total Cover**: Target can't be targeted directly by attacks or spells"
  ].join('\n'),

  'damage-types': [
    '**Damage Types**',
    '- **Acid**: Corrosive chemicals and digestive enzymes',
    '- **Bludgeoning**: Blunt force — hammers, falling, constriction',
    '- **Cold**: Freezing cold, ice, and arctic winds',
    '- **Fire**: Flames, searing heat, and lava',
    '- **Force**: Pure magical energy — Magic Missile, Eldritch Blast',
    '- **Lightning**: Electrical bolts and shocks',
    '- **Necrotic**: Life-draining dark energy',
    '- **Piercing**: Stabbing and puncturing — arrows, spears, bites',
    '- **Poison**: Venoms and toxic substances',
    '- **Psychic**: Mental assault and psychic intrusion',
    '- **Radiant**: Divine light and searing brilliance',
    '- **Slashing**: Cutting and cleaving — swords, axes, claws',
    '- **Thunder**: Concussive sound waves and sonic booms'
  ].join('\n'),

  dcs: [
    '**Difficulty Classes**',
    '- **Very Easy**: DC 5',
    '- **Easy**: DC 10',
    '- **Medium**: DC 15',
    '- **Hard**: DC 20',
    '- **Very Hard**: DC 25',
    '- **Nearly Impossible**: DC 30'
  ].join('\n'),

  'weapon-properties': [
    '**Weapon Properties**',
    '- **Ammunition**: Requires ammo, loading as part of the attack',
    '- **Finesse**: Use STR or DEX for attack/damage',
    '- **Heavy**: Small creatures have disadvantage',
    '- **Light**: Can engage in two-weapon fighting',
    '- **Loading**: Fire only once per action regardless of attacks',
    '- **Range**: Two numbers — normal/long range',
    '- **Reach**: Adds 5 feet to melee reach',
    '- **Thrown**: Can throw for a ranged attack using same modifier',
    '- **Two-Handed**: Requires two hands to attack',
    '- **Versatile**: Can use one or two hands (different damage dice)'
  ].join('\n')
}

export const commands: ChatCommand[] = [
  {
    name: 'save',
    aliases: [],
    category: 'player',
    dmOnly: false,
    description: 'Roll a saving throw',
    usage: '/save <ability>',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const rawArgs = _args.trim().toLowerCase()
      if (!rawArgs) {
        return { type: 'error', content: `Usage: /save <ability> (${ABILITY_NAMES.join(', ')})` }
      }

      const ability = ABILITY_NAMES.find((a) => a.startsWith(rawArgs))
      if (!ability) {
        return { type: 'error', content: `Unknown ability: "${rawArgs}". Options: ${ABILITY_NAMES.join(', ')}` }
      }

      const abilities = char.abilityScores ?? {}
      const score = abilities[ability] ?? 10
      const mod = abilityModifier(score)
      const proficiencies = char.proficiencies?.savingThrows ?? []
      const profBonus = Math.ceil(char.level / 4) + 1
      const isProf = proficiencies.includes(ability as AbilityName)
      const totalMod = mod + (isProf ? profBonus : 0)

      const roll = rollD20()
      const total = roll + totalMod
      const profText = isProf ? ' (proficient)' : ''

      const result = `**${ability.charAt(0).toUpperCase() + ability.slice(1)} Save${profText}**: [${roll}] ${formatMod(totalMod)} = **${total}**`

      broadcastDiceResult(
        `d20${totalMod >= 0 ? '+' : ''}${totalMod} (${ability} save)`,
        [roll],
        total,
        context.playerName
      )

      return { type: 'broadcast', content: result }
    }
  },
  {
    name: 'check',
    aliases: [],
    category: 'player',
    dmOnly: false,
    description: 'Roll a skill or ability check',
    usage: '/check <skill|ability>',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      const rawArgs = _args.trim().toLowerCase()
      if (!rawArgs) {
        return { type: 'error', content: 'Usage: /check <skill or ability name>' }
      }

      const abilities = char.abilityScores
      const profBonus = Math.ceil(char.level / 4) + 1

      // Check if it's a skill
      const skill = SKILLS_5E.find((s) => s.name.toLowerCase() === rawArgs || s.name.toLowerCase().startsWith(rawArgs))

      if (skill) {
        const abilityScore = abilities[skill.ability as keyof typeof abilities] ?? 10
        const mod = abilityModifier(abilityScore)
        const charSkills = char.skills ?? []
        const skillEntry = charSkills.find((s) => s.name.toLowerCase() === skill.name.toLowerCase())
        const isProf = skillEntry?.proficient ?? false
        const isExpert = skillEntry?.expertise ?? false

        let totalMod = mod
        if (isExpert) totalMod += profBonus * 2
        else if (isProf) totalMod += profBonus

        const roll = rollD20()
        const total = roll + totalMod
        const profText = isExpert ? ' (expertise)' : isProf ? ' (proficient)' : ''

        const result = `**${skill.name} Check${profText}**: [${roll}] ${formatMod(totalMod)} = **${total}**`

        broadcastDiceResult(
          `d20${totalMod >= 0 ? '+' : ''}${totalMod} (${skill.name} check)`,
          [roll],
          total,
          context.playerName
        )

        return { type: 'broadcast', content: result }
      }

      // Check if it's a raw ability check
      const ability = ABILITY_NAMES.find((a) => a.startsWith(rawArgs))
      if (ability) {
        const score = abilities[ability] ?? 10
        const mod = abilityModifier(score)
        const roll = rollD20()
        const total = roll + mod

        const result = `**${ability.charAt(0).toUpperCase() + ability.slice(1)} Check**: [${roll}] ${formatMod(mod)} = **${total}**`

        broadcastDiceResult(`d20${mod >= 0 ? '+' : ''}${mod} (${ability} check)`, [roll], total, context.playerName)

        return { type: 'broadcast', content: result }
      }

      return { type: 'error', content: `Unknown skill or ability: "${rawArgs}"` }
    }
  },
  {
    name: 'rest',
    aliases: ['shortrest'],
    category: 'player',
    dmOnly: false,
    description: 'Request a short rest',
    usage: '/rest',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      return {
        type: 'broadcast',
        content: `${char.name} takes a **Short Rest**. Roll Hit Dice to recover HP.`
      }
    }
  },
  {
    name: 'longrest',
    aliases: [],
    category: 'player',
    dmOnly: false,
    description: 'Request a long rest',
    usage: '/longrest',
    execute: (_args, context) => {
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      if (!char) return { type: 'error', content: 'No active character.' }

      return {
        type: 'broadcast',
        content: `${char.name} takes a **Long Rest**. HP restored to max, spell slots recovered, hit dice partially recovered.`
      }
    }
  },
  {
    name: 'attack',
    aliases: [],
    category: 'player',
    dmOnly: false,
    description: 'Open the attack modal',
    usage: '/attack',
    execute: (_args, _context) => {
      return {
        type: 'system',
        content:
          'Open the character sheet and use the Offense tab to make attacks with full weapon mastery and bonus tracking.'
      }
    }
  },
  {
    name: 'help',
    aliases: ['commands', '?'],
    category: 'player',
    dmOnly: false,
    description: 'Show command reference',
    usage: '/help [command]',
    execute: (_args, _context) => {
      const rawArgs = _args.trim().toLowerCase()

      // If a specific command is requested, show its usage
      if (rawArgs) {
        return {
          type: 'system',
          content: `Look up "/help ${rawArgs}" — use /ref for quick reference topics.`
        }
      }

      const lines = [
        '**Chat Commands**',
        '',
        '**Rolling**',
        '`/save <ability>` — Roll a saving throw',
        '`/check <skill|ability>` — Roll a skill/ability check',
        '',
        '**Character**',
        '`/gold [+/-N]` — Show or adjust gold',
        '`/money` — Full currency breakdown',
        '`/ac` — AC breakdown',
        '`/encumbrance` — Carry weight status',
        '`/exhaustion [+/-N|set N]` — Adjust exhaustion',
        '',
        '**Combat**',
        '`/condition <name> [rounds]` — Toggle condition',
        '`/concentrate <spell|off>` — Set/drop concentration',
        '`/attack` — Open attack modal',
        '',
        '**Companions**',
        '`/wildshape <beast|off>` — Wild Shape',
        '`/familiar <type|dismiss>` — Summon/dismiss familiar',
        '`/steed [dismiss]` — Summon/dismiss steed',
        '`/companions` — List active companions',
        '',
        '**Utility**',
        '`/rest` — Short rest',
        '`/longrest` — Long rest',
        '`/w <player> <msg>` — Whisper',
        '`/ref <topic>` — Quick reference',
        '',
        '**Reference topics:** conditions, actions, cover, damage-types, weapon-properties, dcs'
      ]

      return { type: 'system', content: lines.join('\n') }
    }
  },
  {
    name: 'w',
    aliases: ['whisper', 'msg', 'pm'],
    category: 'player',
    dmOnly: false,
    description: 'Send a whisper to another player',
    usage: '/w <player> <message>',
    execute: (_args, context) => {
      const parts = _args.trim().split(/\s+/)
      if (parts.length < 2) {
        return { type: 'error', content: 'Usage: /w <player> <message>' }
      }

      const targetName = parts[0].toLowerCase()
      const message = parts.slice(1).join(' ')

      const lobbyState = useLobbyStore.getState()
      const players = lobbyState.players ?? []
      const target = players.find(
        (p) => p.displayName?.toLowerCase() === targetName || p.displayName?.toLowerCase().startsWith(targetName)
      )

      if (!target) {
        return { type: 'error', content: `Player "${parts[0]}" not found.` }
      }

      const networkState = useNetworkStore.getState()
      if (!context.character) return { type: 'error', content: 'No active character.' }
      const char = getLatestCharacter(context.character.id)
      const senderName = char?.name ?? 'Unknown'

      // Send via network if connected
      if (networkState.sendMessage) {
        networkState.sendMessage('chat:whisper', {
          targetPeerId: target.peerId,
          content: message,
          senderName: senderName
        })
      }

      return {
        type: 'whisper',
        content: `**To ${target.displayName}:** ${message}`
      }
    }
  },
  {
    name: 'ref',
    aliases: ['reference'],
    category: 'player',
    dmOnly: false,
    description: 'Quick reference lookup',
    usage: '/ref <topic> (conditions, actions, cover, damage-types, weapon-properties, dcs)',
    execute: (_args, _context) => {
      const topic = _args.trim().toLowerCase()
      if (!topic) {
        const topics = Object.keys(REFERENCE_DATA).join(', ')
        return { type: 'system', content: `Usage: /ref <topic>\nAvailable topics: ${topics}` }
      }

      // Allow partial matching
      const key = Object.keys(REFERENCE_DATA).find((k) => k === topic || k.startsWith(topic))

      if (!key) {
        const topics = Object.keys(REFERENCE_DATA).join(', ')
        return { type: 'error', content: `Unknown topic: "${topic}". Available: ${topics}` }
      }

      return { type: 'system', content: REFERENCE_DATA[key] }
    }
  }
]

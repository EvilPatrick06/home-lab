import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

function getSrdDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar', 'renderer', 'public', 'data', '5e')
  }
  return join(app.getAppPath(), 'src', 'renderer', 'public', 'data', '5e')
}

const cache: Record<string, unknown[]> = {}

function loadJson<T>(filename: string): T[] {
  if (cache[filename]) return cache[filename] as T[]

  const filePath = join(getSrdDir(), filename)
  if (!existsSync(filePath)) return []

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw) as T[]
    cache[filename] = data
    return data
  } catch {
    return []
  }
}

function formatSrdEntry(entry: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(entry)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'string') {
      lines.push(`${key}: ${value}`)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`)
    } else if (Array.isArray(value)) {
      lines.push(`${key}: ${value.join(', ')}`)
    }
  }
  return lines.join('\n')
}

function formatMonsterForContext(m: Record<string, unknown>): string {
  const lines: string[] = []
  lines.push(`${m.name} — ${m.size} ${m.type}, CR ${m.cr}`)
  lines.push(`AC ${m.ac}${m.acType ? ` (${m.acType})` : ''}, HP ${m.hp} (${m.hitDice})`)

  const speed = m.speed as Record<string, number> | undefined
  if (speed) {
    const parts = Object.entries(speed)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`))
    lines.push(`Speed ${parts.join(', ')}`)
  }

  const abs = m.abilityScores as Record<string, number> | undefined
  if (abs) {
    lines.push(`STR ${abs.str} DEX ${abs.dex} CON ${abs.con} INT ${abs.int} WIS ${abs.wis} CHA ${abs.cha}`)
  }

  const saves = m.savingThrows as Record<string, number> | undefined
  if (saves)
    lines.push(
      `Saves: ${Object.entries(saves)
        .map(([k, v]) => `${k.toUpperCase()} +${v}`)
        .join(', ')}`
    )

  const skills = m.skills as Record<string, number> | undefined
  if (skills)
    lines.push(
      `Skills: ${Object.entries(skills)
        .map(([k, v]) => `${k} +${v}`)
        .join(', ')}`
    )

  const res = m.resistances as string[] | undefined
  if (res?.length) lines.push(`Resistances: ${res.join(', ')}`)
  const imm = m.damageImmunities as string[] | undefined
  if (imm?.length) lines.push(`Damage Immunities: ${imm.join(', ')}`)
  const cimm = m.conditionImmunities as string[] | undefined
  if (cimm?.length) lines.push(`Condition Immunities: ${cimm.join(', ')}`)

  const senses = m.senses as Record<string, unknown> | undefined
  if (senses) {
    const sp = Object.entries(senses)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    lines.push(`Senses: ${sp}`)
  }

  const traits = m.traits as Array<{ name: string; description: string }> | undefined
  if (traits?.length) {
    for (const t of traits) lines.push(`**${t.name}.** ${t.description}`)
  }

  const actions = m.actions as Array<{ name: string; description: string }> | undefined
  if (actions?.length) {
    lines.push('Actions:')
    for (const a of actions) lines.push(`  **${a.name}.** ${a.description}`)
  }

  const bonus = m.bonusActions as Array<{ name: string; description: string }> | undefined
  if (bonus?.length) {
    lines.push('Bonus Actions:')
    for (const a of bonus) lines.push(`  **${a.name}.** ${a.description}`)
  }

  const reactions = m.reactions as Array<{ name: string; description: string }> | undefined
  if (reactions?.length) {
    lines.push('Reactions:')
    for (const a of reactions) lines.push(`  **${a.name}.** ${a.description}`)
  }

  return lines.join('\n')
}

/**
 * Detect SRD entity references in text and return relevant data.
 */
export function detectAndLoadSrdData(text: string): string {
  const parts: string[] = []
  const lower = text.toLowerCase()

  const spells = loadJson<Record<string, unknown>>('spells/spells.json')
  for (const spell of spells) {
    const spellName = ((spell.name as string) || '').toLowerCase()
    if (spellName.length > 3 && lower.includes(spellName)) {
      parts.push(`[SRD: Spell - ${spell.name}]\n${formatSrdEntry(spell)}`)
      if (parts.length >= 3) break
    }
  }

  const equipment = loadJson<Record<string, unknown>>('equipment/equipment.json')
  for (const item of equipment) {
    const itemName = ((item.name as string) || '').toLowerCase()
    if (itemName.length > 3 && lower.includes(itemName)) {
      parts.push(`[SRD: Equipment - ${item.name}]\n${formatSrdEntry(item)}`)
      if (parts.length >= 5) break
    }
  }

  // Monster/creature lookup
  const monsters = loadJson<Record<string, unknown>>('creatures/monsters.json')
  for (const monster of monsters) {
    const monsterName = ((monster.name as string) || '').toLowerCase()
    if (monsterName.length > 3 && lower.includes(monsterName)) {
      parts.push(`[SRD: Creature - ${monster.name}]\n${formatMonsterForContext(monster)}`)
      if (parts.length >= 7) break
    }
  }

  return parts.join('\n\n')
}

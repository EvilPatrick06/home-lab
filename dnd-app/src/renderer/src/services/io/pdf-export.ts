/**
 * PDF character sheet export using jsPDF.
 * Generates a clean multi-page A4 PDF with all character data.
 */

import { jsPDF } from 'jspdf'
import type { Character5e } from '../../types/character-5e'
import { ABILITY_NAMES, type AbilityName, abilityModifier, formatMod } from '../../types/character-common'
import { logger } from '../../utils/logger'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 15
const CONTENT_W = PAGE_W - 2 * MARGIN
const FONT_SIZES = { title: 18, subtitle: 12, heading: 10, body: 8, small: 7 } as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

class PdfBuilder {
  doc: jsPDF
  y: number

  constructor() {
    this.doc = new jsPDF('portrait', 'mm', 'a4')
    this.y = MARGIN
  }

  checkPageBreak(needed: number): void {
    if (this.y + needed > PAGE_H - MARGIN) {
      this.doc.addPage()
      this.y = MARGIN
    }
  }

  drawSection(title: string): void {
    this.checkPageBreak(12)
    this.y += 3
    this.doc.setFontSize(FONT_SIZES.heading)
    this.doc.setFont('helvetica', 'bold')
    this.doc.setTextColor(139, 69, 19) // brown
    this.doc.text(title.toUpperCase(), MARGIN, this.y)
    this.y += 1
    this.doc.setDrawColor(139, 69, 19)
    this.doc.setLineWidth(0.3)
    this.doc.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y)
    this.y += 4
    this.doc.setTextColor(0, 0, 0)
    this.doc.setFont('helvetica', 'normal')
  }

  drawText(text: string, size: number = FONT_SIZES.body, bold: boolean = false): void {
    this.doc.setFontSize(size)
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lines = this.doc.splitTextToSize(text, CONTENT_W)
    const lineH = size * 0.4
    this.checkPageBreak(lines.length * lineH + 2)
    this.doc.text(lines, MARGIN, this.y)
    this.y += lines.length * lineH + 1
  }

  drawKeyValue(key: string, value: string, indent: number = 0): void {
    this.doc.setFontSize(FONT_SIZES.body)
    this.checkPageBreak(4)
    this.doc.setFont('helvetica', 'bold')
    this.doc.text(`${key}: `, MARGIN + indent, this.y)
    const keyWidth = this.doc.getTextWidth(`${key}: `)
    this.doc.setFont('helvetica', 'normal')
    this.doc.text(value, MARGIN + indent + keyWidth, this.y)
    this.y += 3.5
  }
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

function drawAbilityScores(builder: PdfBuilder, char: Character5e): void {
  builder.drawSection('Ability Scores')
  const boxW = CONTENT_W / 6
  const boxH = 18
  builder.checkPageBreak(boxH + 4)

  for (let i = 0; i < ABILITY_NAMES.length; i++) {
    const ability = ABILITY_NAMES[i] as AbilityName
    const score = char.abilityScores[ability]
    const mod = abilityModifier(score)
    const x = MARGIN + i * boxW

    // Box outline
    builder.doc.setDrawColor(100, 100, 100)
    builder.doc.setLineWidth(0.3)
    builder.doc.roundedRect(x + 1, builder.y, boxW - 2, boxH, 2, 2)

    // Ability name
    builder.doc.setFontSize(FONT_SIZES.small)
    builder.doc.setFont('helvetica', 'bold')
    builder.doc.setTextColor(100, 100, 100)
    builder.doc.text(ability.slice(0, 3).toUpperCase(), x + boxW / 2, builder.y + 4, { align: 'center' })

    // Modifier (large)
    builder.doc.setFontSize(14)
    builder.doc.setTextColor(0, 0, 0)
    builder.doc.text(formatMod(mod), x + boxW / 2, builder.y + 11, { align: 'center' })

    // Score (small below)
    builder.doc.setFontSize(FONT_SIZES.small)
    builder.doc.setTextColor(80, 80, 80)
    builder.doc.text(String(score), x + boxW / 2, builder.y + 16, { align: 'center' })
  }

  builder.y += boxH + 4
  builder.doc.setTextColor(0, 0, 0)
}

function drawCombatStats(builder: PdfBuilder, char: Character5e): void {
  builder.drawSection('Combat')

  const profBonus = Math.ceil(char.level / 4) + 1
  const stats = [
    `AC: ${char.armorClass}`,
    `Initiative: ${formatMod(abilityModifier(char.abilityScores.dexterity))}`,
    `Speed: ${char.speed} ft.`,
    `Prof Bonus: ${formatMod(profBonus)}`,
    `HP: ${char.hitPoints.current}/${char.hitPoints.maximum}${char.hitPoints.temporary ? ` (+${char.hitPoints.temporary} temp)` : ''}`,
    `Hit Dice: ${char.hitDice.map((hd) => `${hd.current}/${hd.maximum}d${hd.dieType}`).join(', ')}`
  ]

  builder.doc.setFontSize(FONT_SIZES.body)
  builder.checkPageBreak(8)
  const line1 = stats.slice(0, 4).join('    ')
  const line2 = stats.slice(4).join('    ')
  builder.doc.setFont('helvetica', 'normal')
  builder.doc.text(line1, MARGIN, builder.y)
  builder.y += 4
  builder.doc.text(line2, MARGIN, builder.y)
  builder.y += 4
}

function drawSavingThrows(builder: PdfBuilder, char: Character5e): void {
  builder.drawSection('Saving Throws')
  const profBonus = Math.ceil(char.level / 4) + 1
  const saves = ABILITY_NAMES.map((ability) => {
    const mod = abilityModifier(char.abilityScores[ability as AbilityName])
    const isProficient = char.proficiencies.savingThrows.includes(ability as AbilityName)
    const total = mod + (isProficient ? profBonus : 0)
    const marker = isProficient ? '\u25CF' : '\u25CB'
    return `${marker} ${capitalize(ability).slice(0, 3)}: ${formatMod(total)}`
  })

  builder.doc.setFontSize(FONT_SIZES.body)
  builder.checkPageBreak(4)
  builder.doc.text(saves.join('    '), MARGIN, builder.y)
  builder.y += 4
}

function drawSkills(builder: PdfBuilder, char: Character5e): void {
  builder.drawSection('Skills')
  if (char.skills.length === 0) {
    builder.drawText('No skills recorded.')
    return
  }

  const profBonus = Math.ceil(char.level / 4) + 1
  const colW = CONTENT_W / 2
  const lineH = 3.5

  const sorted = [...char.skills].sort((a, b) => a.name.localeCompare(b.name))
  const midpoint = Math.ceil(sorted.length / 2)
  const startY = builder.y

  builder.checkPageBreak(midpoint * lineH + 2)
  builder.doc.setFontSize(FONT_SIZES.body)

  for (let i = 0; i < sorted.length; i++) {
    const skill = sorted[i]
    const col = i < midpoint ? 0 : 1
    const row = i < midpoint ? i : i - midpoint
    const x = MARGIN + col * colW
    const y = startY + row * lineH

    const mod = abilityModifier(char.abilityScores[skill.ability as AbilityName] ?? 10)
    const bonus = mod + (skill.proficient ? profBonus : 0) + (skill.expertise ? profBonus : 0)
    const marker = skill.expertise ? '\u25C6' : skill.proficient ? '\u25CF' : '\u25CB'

    builder.doc.setFont('helvetica', 'normal')
    builder.doc.text(`${marker} ${skill.name} (${skill.ability.slice(0, 3).toUpperCase()}): ${formatMod(bonus)}`, x, y)
  }

  builder.y = startY + midpoint * lineH + 2
}

function drawProficiencies(builder: PdfBuilder, char: Character5e): void {
  builder.drawSection('Proficiencies')
  const p = char.proficiencies
  if (p.weapons.length > 0) builder.drawKeyValue('Weapons', p.weapons.join(', '))
  if (p.armor.length > 0) builder.drawKeyValue('Armor', p.armor.join(', '))
  if (p.tools.length > 0) builder.drawKeyValue('Tools', p.tools.join(', '))
  if (p.languages.length > 0) builder.drawKeyValue('Languages', p.languages.join(', '))
}

function drawFeatures(builder: PdfBuilder, char: Character5e): void {
  if (char.features.length === 0 && char.classFeatures.length === 0) return

  builder.drawSection('Features & Traits')

  for (const f of char.features) {
    builder.drawText(`${f.name} (${f.source})`, FONT_SIZES.body, true)
    if (f.description) builder.drawText(f.description.slice(0, 200))
    builder.y += 1
  }

  for (const f of char.classFeatures) {
    builder.drawText(`${f.name} (${f.source}, Lv${f.level})`, FONT_SIZES.body, true)
    if (f.description) builder.drawText(f.description.slice(0, 200))
    builder.y += 1
  }
}

function drawEquipment(builder: PdfBuilder, char: Character5e): void {
  if (char.equipment.length === 0 && char.weapons.length === 0 && char.armor.length === 0) return

  builder.drawSection('Equipment')

  if (char.weapons.length > 0) {
    builder.drawText('Weapons:', FONT_SIZES.body, true)
    for (const w of char.weapons) {
      const props = w.properties.length > 0 ? ` [${w.properties.join(', ')}]` : ''
      builder.drawText(`  ${w.name}: ${w.damage} ${w.damageType}${props}${w.range ? ` (${w.range})` : ''}`)
    }
    builder.y += 1
  }

  if (char.armor.length > 0) {
    builder.drawText('Armor:', FONT_SIZES.body, true)
    for (const a of char.armor) {
      const eqp = a.equipped ? ' (equipped)' : ''
      builder.drawText(`  ${a.name}: AC ${a.acBonus}${eqp}`)
    }
    builder.y += 1
  }

  if (char.equipment.length > 0) {
    builder.drawText('Gear:', FONT_SIZES.body, true)
    const items = char.equipment.map((e) => `${e.name}${e.quantity > 1 ? ` x${e.quantity}` : ''}`)
    // Pack into lines of ~80 chars
    let line = '  '
    for (const item of items) {
      if (line.length + item.length > 80) {
        builder.drawText(line)
        line = '  '
      }
      line += (line.length > 2 ? ', ' : '') + item
    }
    if (line.length > 2) builder.drawText(line)
  }
}

function drawTreasure(builder: PdfBuilder, char: Character5e): void {
  const t = char.treasure
  if (!t.cp && !t.sp && !t.gp && !t.pp && !t.ep) return

  builder.drawSection('Treasure')
  const parts: string[] = []
  if (t.pp) parts.push(`${t.pp} PP`)
  if (t.gp) parts.push(`${t.gp} GP`)
  if (t.ep) parts.push(`${t.ep} EP`)
  if (t.sp) parts.push(`${t.sp} SP`)
  if (t.cp) parts.push(`${t.cp} CP`)
  builder.drawText(parts.join('  |  '))
}

function drawSpells(builder: PdfBuilder, char: Character5e): void {
  if (char.knownSpells.length === 0) return

  builder.drawSection('Spells')

  if (char.spellcasting) {
    builder.drawKeyValue('Spellcasting Ability', capitalize(char.spellcasting.ability))
    builder.drawKeyValue('Spell Save DC', String(char.spellcasting.spellSaveDC))
    builder.drawKeyValue('Spell Attack Bonus', formatMod(char.spellcasting.spellAttackBonus))
    builder.y += 1
  }

  const byLevel = new Map<number, typeof char.knownSpells>()
  for (const spell of char.knownSpells) {
    const list = byLevel.get(spell.level) ?? []
    list.push(spell)
    byLevel.set(spell.level, list)
  }

  const sortedLevels = [...byLevel.keys()].sort((a, b) => a - b)
  for (const level of sortedLevels) {
    const spells = byLevel.get(level) ?? []
    const label = level === 0 ? 'Cantrips' : `Level ${level}`
    builder.drawText(`${label}:`, FONT_SIZES.body, true)

    const prepared = new Set(char.preparedSpellIds)
    for (const spell of spells) {
      const marker = prepared.has(spell.id) ? '\u25CF' : '\u25CB'
      const conc = spell.concentration ? ' (C)' : ''
      const ritual = spell.ritual ? ' (R)' : ''
      builder.drawText(
        `  ${marker} ${spell.name}${conc}${ritual} — ${spell.castingTime}, ${spell.range}, ${spell.duration}`
      )
    }
    builder.y += 1
  }
}

function drawFeats(builder: PdfBuilder, char: Character5e): void {
  if (char.feats.length === 0) return

  builder.drawSection('Feats')
  for (const feat of char.feats) {
    builder.drawText(feat.name, FONT_SIZES.body, true)
    if (feat.description) builder.drawText(feat.description.slice(0, 200))
    builder.y += 1
  }
}

function drawBackstory(builder: PdfBuilder, char: Character5e): void {
  const hasDetails = char.details.personality || char.details.ideals || char.details.bonds || char.details.flaws
  if (!hasDetails && !char.backstory) return

  builder.drawSection('Details & Backstory')
  if (char.details.personality) builder.drawKeyValue('Personality', char.details.personality)
  if (char.details.ideals) builder.drawKeyValue('Ideals', char.details.ideals)
  if (char.details.bonds) builder.drawKeyValue('Bonds', char.details.bonds)
  if (char.details.flaws) builder.drawKeyValue('Flaws', char.details.flaws)
  if (char.backstory) {
    builder.y += 1
    builder.drawText(char.backstory.slice(0, 1000))
  }
}

// ---------------------------------------------------------------------------
// Export function
// ---------------------------------------------------------------------------

export async function exportCharacterToPdf(character: Character5e): Promise<boolean> {
  try {
    const filePath = await window.api.showSaveDialog({
      title: 'Export Character to PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (!filePath) return false

    const builder = new PdfBuilder()

    // Header
    builder.doc.setFontSize(FONT_SIZES.title)
    builder.doc.setFont('helvetica', 'bold')
    builder.doc.text(character.name, MARGIN, builder.y)
    builder.y += 6

    const classStr = character.classes
      .map((c) => `${c.name} ${c.level}${c.subclass ? ` (${c.subclass})` : ''}`)
      .join(' / ')
    builder.doc.setFontSize(FONT_SIZES.subtitle)
    builder.doc.setFont('helvetica', 'normal')
    builder.doc.setTextColor(80, 80, 80)
    builder.doc.text(`Level ${character.level} ${character.species} ${classStr}`, MARGIN, builder.y)
    builder.y += 4

    if (character.background || character.alignment) {
      builder.doc.setFontSize(FONT_SIZES.body)
      const parts = [character.background, character.alignment].filter(Boolean).join(' | ')
      builder.doc.text(parts, MARGIN, builder.y)
      builder.y += 5
    }

    builder.doc.setTextColor(0, 0, 0)

    // Page 1 sections
    drawAbilityScores(builder, character)
    drawCombatStats(builder, character)
    drawSavingThrows(builder, character)
    drawSkills(builder, character)
    drawProficiencies(builder, character)
    drawFeatures(builder, character)

    // Page 2+ sections
    drawEquipment(builder, character)
    drawTreasure(builder, character)
    drawSpells(builder, character)
    drawFeats(builder, character)
    drawBackstory(builder, character)

    // Footer on each page
    const pageCount = builder.doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      builder.doc.setPage(i)
      builder.doc.setFontSize(6)
      builder.doc.setTextColor(150, 150, 150)
      builder.doc.text(`${character.name} — Page ${i}/${pageCount}`, PAGE_W / 2, PAGE_H - 8, { align: 'center' })
      builder.doc.text('Generated by D&D VTT', PAGE_W / 2, PAGE_H - 5, { align: 'center' })
    }

    const buffer = builder.doc.output('arraybuffer')
    await window.api.writeFileBinary(filePath, buffer)
    return true
  } catch (err) {
    logger.error('PDF export failed:', err)
    return false
  }
}

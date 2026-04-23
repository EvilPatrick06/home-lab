/**
 * Extract all Monster Manual creatures from 28 bestiary files + NPCs.
 * Handles the new 5.5e stat block format with #### Traits/Actions/etc.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e/dm/npcs/monsters')
const BESTIARY = path.join(process.cwd(), '5.5e References/MM2025/markdown/Bestiary')
const NPCS = path.join(process.cwd(), '5.5e References/MM2025/markdown/NPC\'s/NPCs.md')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const CREATURE_TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead']
const typePattern = CREATURE_TYPES.join('|')
// Matches both "*Large Aberration, ..." and "*Medium or Small Humanoid, ..."
const typeRegex = new RegExp(`^\\*(.+?)\\s+((?:${typePattern})(?:\\s+or\\s+(?:${typePattern}))?)(?:\\s*\\(.*?\\))?\\s*,\\s*(.+?)\\*\\s*$`)

interface Creature {
    name: string; slug: string; size: string; type: string; alignment: string
    ac: string; initiative: string; hp: string; hpFormula: string; speed: string
    abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
    abilitySaves?: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
    skills?: string; immunities?: string; resistances?: string; vulnerabilities?: string; gear?: string
    senses: string; languages: string; cr: string
    traits: { name: string; description: string }[]
    actions: { name: string; description: string }[]
    bonusActions: { name: string; description: string }[]
    reactions: { name: string; description: string }[]
    legendaryActions: { name: string; description: string }[]
    lore: string
    habitat?: string; treasure?: string
    source: { book: string; section: string; file: string }
}

function isTypeLine(line: string): boolean {
    return typeRegex.test(line.trim())
}

function parseStatBlock(blockLines: string[], loreText: string, habitat: string, treasure: string, sourceFile: string): Creature | null {
    const typeLine = blockLines.find(l => isTypeLine(l.trim()))
    if (!typeLine) return null
    const m = typeLine.trim().match(typeRegex)
    if (!m) return null
    const size = m[1].trim()
    const type = m[2].trim()
    const alignment = m[3].trim()

    const nameFound = blockLines.find(l => l.startsWith('### '))
    if (!nameFound) return null
    const name = nameFound.replace('### ', '').trim()

    const acLine = blockLines.find(l => l.includes('**AC**'))
    if (!acLine) return null
    const acMatch = acLine.match(/\*\*AC\*\*\s*(\d+)/)
    const initMatch = acLine.match(/\*\*Initiative\*\*\s*([^|]+)/)
    const ac = acMatch ? acMatch[1] : '10'
    const initiative = initMatch ? initMatch[1].trim() : '0'

    const hpLine = blockLines.find(l => l.includes('**HP**'))
    if (!hpLine) return null
    const hpMatch = hpLine.match(/\*\*HP\*\*\s*(\d+)\s*\(([^)]+)\)/)
    const hp = hpMatch ? hpMatch[1] : '1'
    const hpFormula = hpMatch ? hpMatch[2] : ''

    const speedLine = blockLines.find(l => l.startsWith('**Speed**'))
    const speed = speedLine ? speedLine.replace('**Speed**', '').trim() : '30 ft.'

    const scoreLine = blockLines.find(l => l.match(/\*\*Str\*\*/) && l.match(/\*\*Dex\*\*/))
    let str = 10, dex = 10, con = 10, int = 10, wis = 10, cha = 10
    let strSave = 0, dexSave = 0, conSave = 0, intSave = 0, wisSave = 0, chaSave = 0

    if (scoreLine) {
        const statPattern = /\*\*(\w+)\*\*\s*(\d+)\s*\|\s*([+−-]?\d+)\s*\|\s*([+−-]?\d+)/g
        let sm
        while ((sm = statPattern.exec(scoreLine)) !== null) {
            const statName = sm[1].toLowerCase()
            const score = parseInt(sm[2])
            const save = parseInt(sm[4].replace('−', '-'))
            if (statName === 'str') { str = score; strSave = save }
            else if (statName === 'dex') { dex = score; dexSave = save }
            else if (statName === 'con') { con = score; conSave = save }
            else if (statName === 'int') { int = score; intSave = save }
            else if (statName === 'wis') { wis = score; wisSave = save }
            else if (statName === 'cha') { cha = score; chaSave = save }
        }
    }

    let skills = '', immunities = '', resistances = '', vulnerabilities = '', gear = '', senses = '', languages = '', cr = ''
    for (const l of blockLines) {
        const trimmed = l.trim()
        if (trimmed.startsWith('**Skills**')) skills = trimmed.replace('**Skills**', '').trim()
        if (trimmed.startsWith('**Immunities**')) immunities = trimmed.replace('**Immunities**', '').trim()
        if (trimmed.startsWith('**Resistances**')) resistances = trimmed.replace('**Resistances**', '').trim()
        if (trimmed.startsWith('**Vulnerabilities**')) vulnerabilities = trimmed.replace('**Vulnerabilities**', '').trim()
        if (trimmed.startsWith('**Gear**')) gear = trimmed.replace('**Gear**', '').trim()
        if (trimmed.startsWith('**Senses**')) senses = trimmed.replace('**Senses**', '').trim()
        if (trimmed.startsWith('**Languages**')) languages = trimmed.replace('**Languages**', '').trim()
        if (trimmed.startsWith('**CR**')) {
            const crMatch = trimmed.match(/\*\*CR\*\*\s*(.+)/)
            if (crMatch) cr = crMatch[1].trim()
        }
    }

    const traits: { name: string; description: string }[] = []
    const actions: { name: string; description: string }[] = []
    const bonusActions: { name: string; description: string }[] = []
    const reactions: { name: string; description: string }[] = []
    const legendaryActions: { name: string; description: string }[] = []

    let currentSection = ''
    for (let i = 0; i < blockLines.length; i++) {
        const trimmed = blockLines[i].trim()
        if (trimmed === '#### Traits') { currentSection = 'traits'; continue }
        if (trimmed === '#### Actions') { currentSection = 'actions'; continue }
        if (trimmed === '#### Bonus Actions') { currentSection = 'bonus'; continue }
        if (trimmed === '#### Reactions') { currentSection = 'reactions'; continue }
        if (trimmed === '#### Legendary Actions') { currentSection = 'legendary'; continue }

        const entryMatch = trimmed.match(/^\*\*\*(.+?)\.?\*\*\*\.?\s*(.*)/)
        if (entryMatch && currentSection) {
            let desc = entryMatch[2].trim()
            // Collect continuation lines
            for (let j = i + 1; j < blockLines.length; j++) {
                const next = blockLines[j].trim()
                if (!next || next.startsWith('***') || next.startsWith('####') || next.startsWith('---')) break
                desc += ' ' + next
            }
            const entry = { name: entryMatch[1].trim(), description: desc }
            if (currentSection === 'traits') traits.push(entry)
            else if (currentSection === 'actions') actions.push(entry)
            else if (currentSection === 'bonus') bonusActions.push(entry)
            else if (currentSection === 'reactions') reactions.push(entry)
            else if (currentSection === 'legendary') legendaryActions.push(entry)
        }
    }

    const creature: Creature = {
        name, slug: kebab(name), size, type, alignment,
        ac, initiative, hp, hpFormula, speed,
        abilityScores: { str, dex, con, int, wis, cha },
        abilitySaves: { str: strSave, dex: dexSave, con: conSave, int: intSave, wis: wisSave, cha: chaSave },
        ...(skills && { skills }),
        ...(immunities && { immunities }),
        ...(resistances && { resistances }),
        ...(vulnerabilities && { vulnerabilities }),
        ...(gear && { gear }),
        senses, languages, cr,
        traits, actions, bonusActions, reactions, legendaryActions,
        lore: loreText,
        ...(habitat && { habitat }), ...(treasure && { treasure }),
        source: { book: '2025 Monster Manual', section: sourceFile.replace('.md', ''), file: sourceFile }
    }
    return creature
}

// Clear old data
if (fs.existsSync(ROOT)) {
    fs.rmSync(ROOT, { recursive: true })
}

// Process all bestiary files
const bestiaryFiles = fs.readdirSync(BESTIARY).filter(f => f.endsWith('.md'))
let totalCount = 0

for (const file of bestiaryFiles) {
    const content = fs.readFileSync(path.join(BESTIARY, file), 'utf-8')
    const lines = content.split('\n').map(l => l.replace(/\r/g, ''))

    const sections: string[][] = []
    let current: string[] = []

    for (const line of lines) {
        if (line.trim() === '---') {
            if (current.length > 0) sections.push(current)
            current = []
        } else {
            current.push(line)
        }
    }
    if (current.length > 0) sections.push(current)

    let currentLore = ''
    let currentHabitat = ''
    let currentTreasure = ''

    for (const section of sections) {
        const hasStatBlock = section.some(l => l.startsWith('### ')) && section.some(l => isTypeLine(l.trim()))

        if (hasStatBlock) {
            const creature = parseStatBlock(section, currentLore, currentHabitat, currentTreasure, file)
            if (creature) {
                const typeDir = kebab(creature.type)
                const outDir = path.join(ROOT, typeDir)
                ensureDir(outDir)
                fs.writeFileSync(path.join(outDir, `${creature.slug}.json`), JSON.stringify(creature, null, 2))
                totalCount++
            }
        } else {
            const loreHeading = section.find(l => l.startsWith('## '))
            if (loreHeading) {
                const loBody = section.filter(l => !l.startsWith('#') && !l.startsWith('|') && l.trim())
                currentLore = loBody.join('\n').trim()

                const habitatLine = section.find(l => l.includes('**Habitat:**'))
                if (habitatLine) {
                    const habM = habitatLine.match(/\*\*Habitat:\*\*\s*([^;]+)/)
                    currentHabitat = habM ? habM[1].trim() : ''
                    const tresM = habitatLine.match(/\*\*Treasure:\*\*\s*(.+)/)
                    currentTreasure = tresM ? tresM[1].trim() : ''
                } else {
                    currentHabitat = ''
                    currentTreasure = ''
                }
            }
        }
    }
}

// Process NPCs
if (fs.existsSync(NPCS)) {
    const npcContent = fs.readFileSync(NPCS, 'utf-8')
    const npcLines = npcContent.split('\n').map(l => l.replace(/\r/g, ''))
    const npcSections: string[][] = []
    let curr: string[] = []

    for (const line of npcLines) {
        if (line.trim() === '---') {
            if (curr.length > 0) npcSections.push(curr)
            curr = []
        } else {
            curr.push(line)
        }
    }
    if (curr.length > 0) npcSections.push(curr)

    let npcLore = '', npcHabitat = '', npcTreasure = ''
    for (const section of npcSections) {
        const hasStatBlock = section.some(l => l.startsWith('### ')) && section.some(l => isTypeLine(l.trim()))
        if (hasStatBlock) {
            const creature = parseStatBlock(section, npcLore, npcHabitat, npcTreasure, 'NPCs.md')
            if (creature) {
                const outDir = path.join(ROOT, 'humanoid', 'npc')
                ensureDir(outDir)
                fs.writeFileSync(path.join(outDir, `${creature.slug}.json`), JSON.stringify(creature, null, 2))
                totalCount++
            }
        } else {
            const loreBody = section.filter(l => !l.startsWith('#') && !l.startsWith('|') && l.trim())
            if (loreBody.length > 0) npcLore = loreBody.join('\n').trim()
            const habitatLine = section.find(l => l.includes('**Habitat:**'))
            if (habitatLine) {
                const habM = habitatLine.match(/\*\*Habitat:\*\*\s*([^;]+)/)
                npcHabitat = habM ? habM[1].trim() : ''
                const tresM = habitatLine.match(/\*\*Treasure:\*\*\s*(.+)/)
                npcTreasure = tresM ? tresM[1].trim() : ''
            }
        }
    }
}

console.log(`✅ Extracted ${totalCount} Monster Manual creatures`)

// Show count by type
const byType: Record<string, number> = {}
function countDir(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            countDir(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
        } else if (entry.name.endsWith('.json')) {
            const key = prefix || 'root'
            byType[key] = (byType[key] || 0) + 1
        }
    }
}
countDir(ROOT, '')
for (const [type, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${n}`)
}

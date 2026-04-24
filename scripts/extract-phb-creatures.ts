/**
 * Parse PHB Appendix B creature stat blocks into JSON.
 * Uses regex patterns on the structured markdown format.
 */
import fs from 'fs'
import path from 'path'

const SRC_FILE = path.join(process.cwd(), '5.5e References/PHB2024/markdown/appendix-b-creature-stat-blocks.md')
const OUT_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e/dm/npcs/creatures-companions')
fs.mkdirSync(OUT_DIR, { recursive: true })

function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const content = fs.readFileSync(SRC_FILE, 'utf-8')
// Split into individual stat blocks by the "#### Name" pattern
const blocks = content.split(/^---\s*$/m).filter(b => b.includes('####'))

interface Creature {
    name: string; slug: string; size: string; type: string; alignment: string
    ac: number; acNote?: string; hp: number; hpFormula: string; speed: string
    abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
    skills?: string; savingThrows?: string
    resistances?: string; immunities?: string; conditionImmunities?: string; vulnerabilities?: string
    senses: string; languages: string; cr: string; xp: string
    traits: { name: string; description: string }[]
    actions: { name: string; description: string }[]
    source: { book: string; section: string }
}

const creatures: Creature[] = []

for (const block of blocks) {
    const lines = block.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(Boolean)

    // Get name
    const nameLine = lines.find(l => l.startsWith('####'))
    if (!nameLine) continue
    const name = nameLine.replace(/^#+\s*/, '').trim()

    // Get size/type/alignment line: *Medium Beast, Unaligned*
    const typeLine = lines.find(l => l.startsWith('*') && !l.startsWith('**') && (l.includes('Beast') || l.includes('Fiend') || l.includes('Dragon') || l.includes('Undead') || l.includes('Fey') || l.includes('Celestial') || l.includes('Aberration')))
    if (!typeLine) continue
    const typeMatch = typeLine.match(/^\*(\w+)\s+(.+?),\s*(.+?)\*$/)
    if (!typeMatch) continue
    const [_, size, fullType, alignment] = typeMatch
    const creatureType = fullType.replace(/\s*\([^)]+\)/, '').trim()

    // AC/HP/Speed line
    const acLine = lines.find(l => l.startsWith('**AC**'))
    if (!acLine) continue
    const acMatch = acLine.match(/\*\*AC\*\*\s*(\d+)(?:\s*\(([^)]+)\))?\s*\|\s*\*\*HP\*\*\s*(\d+)\s*\(([^)]+)\)\s*\|\s*\*\*Speed\*\*\s*(.+)/)
    if (!acMatch) continue
    const ac = parseInt(acMatch[1])
    const acNote = acMatch[2] || undefined
    const hp = parseInt(acMatch[3])
    const hpFormula = acMatch[4]
    const speed = acMatch[5].trim()

    // Ability scores
    const scoreLine = lines.find(l => l.match(/^\|\s*\d+/) && l.includes('('))
    if (!scoreLine) continue
    const scoreNums = [...scoreLine.matchAll(/(\d+)\s*\([+-]\d+\)/g)].map(m => parseInt(m[1]))
    if (scoreNums.length !== 6) continue
    const [str, dex, con, int, wis, cha] = scoreNums

    // Parse info line(s) — Skills, Senses, Languages, CR
    const infoLine = lines.find(l => l.includes('**Senses**') || l.includes('**CR**'))
    let skills: string | undefined
    let savingThrows: string | undefined
    let resistances: string | undefined
    let immunities: string | undefined
    let condImmunities: string | undefined
    let vulnerabilities: string | undefined
    let senses = 'Passive Perception 10'
    let languages = '—'
    let cr = '0'
    let xp = '0 XP'

    if (infoLine) {
        const skillsM = infoLine.match(/\*\*Skills\*\*\s*([^|*]+)/)
        if (skillsM) skills = skillsM[1].trim()
        const stM = infoLine.match(/\*\*Saving Throws\*\*\s*([^|*]+)/)
        if (stM) savingThrows = stM[1].trim()
        const resM = infoLine.match(/\*\*Resistances?\*\*\s*([^|*]+)/)
        if (resM) resistances = resM[1].trim()
        const immM = infoLine.match(/\*\*(?:Damage )?Immunit(?:y|ies)\*\*\s*([^|*]+)/)
        if (immM) immunities = immM[1].trim()
        const ciM = infoLine.match(/\*\*Condition Immunit(?:y|ies)\*\*\s*([^|*]+)/)
        if (ciM) condImmunities = ciM[1].trim()
        const vulM = infoLine.match(/\*\*(?:Damage )?Vulnerabilit(?:y|ies)\*\*\s*([^|*]+)/)
        if (vulM) vulnerabilities = vulM[1].trim()
        const sensesM = infoLine.match(/\*\*Senses\*\*\s*([^|*]+)/)
        if (sensesM) senses = sensesM[1].trim()
        const langM = infoLine.match(/\*\*Languages?\*\*\s*([^|*]+)/)
        if (langM) languages = langM[1].trim()
        const crM = infoLine.match(/\*\*CR\*\*\s*([^\s(]+)\s*\(([^)]+)\)/)
        if (crM) { cr = crM[1].trim(); xp = crM[2].trim() }
    }

    // Parse traits and actions
    const traits: { name: string; description: string }[] = []
    const actions: { name: string; description: string }[] = []

    const contentLines = lines.filter(l =>
        l.startsWith('**') && !l.startsWith('**AC**') && !l.startsWith('**Skills') && !l.startsWith('**Senses') &&
        !l.startsWith('**Saving') && !l.startsWith('**Resistances') && !l.startsWith('**Damage') && !l.startsWith('**Condition') &&
        !l.startsWith('**CR**') && !l.startsWith('**Languages')
    )

    for (const cl of contentLines) {
        const entryMatch = cl.match(/^\*\*(.+?)(?:\.|:)\*\*\s*(.+)/)
        if (!entryMatch) continue
        const entryName = entryMatch[1].trim()
        const entryDesc = entryMatch[2].trim()

        // Determine if action or trait
        if (entryDesc.includes('*Melee:*') || entryDesc.includes('*Ranged:*') || entryName === 'Multiattack') {
            actions.push({ name: entryName, description: entryDesc })
        } else {
            traits.push({ name: entryName, description: entryDesc })
        }
    }

    const creature: Creature = {
        name, slug: kebab(name), size, type: creatureType, alignment,
        ac, ...(acNote && { acNote }), hp, hpFormula, speed,
        abilityScores: { str, dex, con, int, wis, cha },
        ...(skills && { skills }), ...(savingThrows && { savingThrows }),
        ...(resistances && { resistances }), ...(immunities && { immunities }),
        ...(condImmunities && { conditionImmunities: condImmunities }),
        ...(vulnerabilities && { vulnerabilities }),
        senses, languages, cr, xp,
        traits, actions,
        source: { book: '2024 Players Handbook', section: 'Appendix B: Creature Stat Blocks' }
    }

    creatures.push(creature)
}

// Write each creature
for (const c of creatures) {
    fs.writeFileSync(path.join(OUT_DIR, `${c.slug}.json`), JSON.stringify(c, null, 2))
}

console.log(`✅ Extracted ${creatures.length} PHB creature stat blocks`)
// List them
for (const c of creatures) {
    console.log(`   ${c.name} (CR ${c.cr}, ${c.size} ${c.type})`)
}

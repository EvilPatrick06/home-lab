/**
 * Extract MM Appendix A: Animals (beasts + monstrosities)
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e/monsters')
const SRC = path.join(process.cwd(), '5.5e References/MM2025/markdown/Appendices/Creatures.md')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const CREATURE_TYPES = ['Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead']
const typePattern = CREATURE_TYPES.join('|')
const typeRegex = new RegExp(`^\\*(.+?)\\s+((?:${typePattern})(?:\\s+or\\s+(?:${typePattern}))?)(?:\\s*\\(.*?\\))?\\s*,\\s*(.+?)\\*\\s*$`)

function isTypeLine(line: string): boolean { return typeRegex.test(line.trim()) }

const content = fs.readFileSync(SRC, 'utf-8')
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

let count = 0
for (const section of sections) {
    const hasStatBlock = section.some(l => l.startsWith('### ')) && section.some(l => isTypeLine(l.trim()))
    if (!hasStatBlock) continue

    const typeLine = section.find(l => isTypeLine(l.trim()))
    if (!typeLine) continue
    const m = typeLine.trim().match(typeRegex)
    if (!m) continue

    const nameFound = section.find(l => l.startsWith('### '))
    if (!nameFound) continue
    const name = nameFound.replace('### ', '').trim()
    const size = m[1].trim()
    const type = m[2].trim()
    const alignment = m[3].trim()

    const acLine = section.find(l => l.includes('**AC**'))
    if (!acLine) continue
    const acMatch = acLine.match(/\*\*AC\*\*\s*(\d+)/)
    const initMatch = acLine.match(/\*\*Initiative\*\*\s*([^|]+)/)
    const hpLine = section.find(l => l.includes('**HP**'))
    if (!hpLine) continue
    const hpMatch = hpLine.match(/\*\*HP\*\*\s*(\d+)\s*\(([^)]+)\)/)
    const speedLine = section.find(l => l.startsWith('**Speed**'))
    const scoreLine = section.find(l => l.match(/\*\*Str\*\*/) && l.match(/\*\*Dex\*\*/))

    let str = 10, dex = 10, con = 10, int = 10, wis = 10, cha = 10, strS = 0, dexS = 0, conS = 0, intS = 0, wisS = 0, chaS = 0
    if (scoreLine) {
        const sp = /\*\*(\w+)\*\*\s*(\d+)\s*\|\s*([+−-]?\d+)\s*\|\s*([+−-]?\d+)/g
        let sm
        while ((sm = sp.exec(scoreLine)) !== null) {
            const n = sm[1].toLowerCase(), v = parseInt(sm[2]), s = parseInt(sm[4].replace('−', '-'))
            if (n === 'str') { str = v; strS = s } else if (n === 'dex') { dex = v; dexS = s } else if (n === 'con') { con = v; conS = s }
            else if (n === 'int') { int = v; intS = s } else if (n === 'wis') { wis = v; wisS = s } else if (n === 'cha') { cha = v; chaS = s }
        }
    }

    let skills = '', immunities = '', resistances = '', vulnerabilities = '', senses = '', languages = '', cr = ''
    for (const l of section) {
        const t = l.trim()
        if (t.startsWith('**Skills**')) skills = t.replace('**Skills**', '').trim()
        if (t.startsWith('**Immunities**')) immunities = t.replace('**Immunities**', '').trim()
        if (t.startsWith('**Resistances**')) resistances = t.replace('**Resistances**', '').trim()
        if (t.startsWith('**Vulnerabilities**')) vulnerabilities = t.replace('**Vulnerabilities**', '').trim()
        if (t.startsWith('**Senses**')) senses = t.replace('**Senses**', '').trim()
        if (t.startsWith('**Languages**')) languages = t.replace('**Languages**', '').trim()
        if (t.startsWith('**CR**')) { const cm = t.match(/\*\*CR\*\*\s*(.+)/); if (cm) cr = cm[1].trim() }
    }

    const traits: any[] = [], actions: any[] = [], bonusActions: any[] = [], reactions: any[] = [], legendaryActions: any[] = []
    let currentSection = ''
    for (let i = 0; i < section.length; i++) {
        const t = section[i].trim()
        if (t === '#### Traits') { currentSection = 'traits'; continue }
        if (t === '#### Actions') { currentSection = 'actions'; continue }
        if (t === '#### Bonus Actions') { currentSection = 'bonus'; continue }
        if (t === '#### Reactions') { currentSection = 'reactions'; continue }
        if (t === '#### Legendary Actions') { currentSection = 'legendary'; continue }
        const em = t.match(/^\*\*\*(.+?)\.?\*\*\*\.?\s*(.*)/)
        if (em && currentSection) {
            let desc = em[2].trim()
            for (let j = i + 1; j < section.length; j++) {
                const next = section[j].trim()
                if (!next || next.startsWith('***') || next.startsWith('####') || next.startsWith('---')) break
                desc += ' ' + next
            }
            const entry = { name: em[1].trim(), description: desc }
            if (currentSection === 'traits') traits.push(entry)
            else if (currentSection === 'actions') actions.push(entry)
            else if (currentSection === 'bonus') bonusActions.push(entry)
            else if (currentSection === 'reactions') reactions.push(entry)
            else if (currentSection === 'legendary') legendaryActions.push(entry)
        }
    }

    const creature = {
        name, slug: kebab(name), size, type, alignment,
        ac: acMatch ? acMatch[1] : '10', initiative: initMatch ? initMatch[1].trim() : '0',
        hp: hpMatch ? hpMatch[1] : '1', hpFormula: hpMatch ? hpMatch[2] : '',
        speed: speedLine ? speedLine.replace('**Speed**', '').trim() : '30 ft.',
        abilityScores: { str, dex, con, int, wis, cha },
        abilitySaves: { str: strS, dex: dexS, con: conS, int: intS, wis: wisS, cha: chaS },
        ...(skills && { skills }), ...(immunities && { immunities }), ...(resistances && { resistances }),
        ...(vulnerabilities && { vulnerabilities }), senses, languages, cr,
        traits, actions, bonusActions, reactions, legendaryActions,
        lore: '', source: { book: '2025 Monster Manual', section: 'Appendix A: Animals', file: 'Creatures.md' }
    }

    const typeDir = kebab(type)
    const outDir = path.join(ROOT, typeDir)
    ensureDir(outDir)
    fs.writeFileSync(path.join(outDir, `${creature.slug}.json`), JSON.stringify(creature, null, 2))
    count++
}

console.log(`✅ Extracted ${count} animals from MM Appendix A`)

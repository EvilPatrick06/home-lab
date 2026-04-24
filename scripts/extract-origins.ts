/**
 * Extract PHB Ch4 backgrounds (16) and species (10) into JSON files.
 * Uses line-by-line parsing to avoid regex backtracking issues.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const lines = fs.readFileSync(path.join(process.cwd(), '5.5e References/PHB2024/markdown/04-character-origins.md'), 'utf-8').split('\n').map(l => l.replace(/\r/g, ''))
const phb4 = { book: '2024 Players Handbook', chapter: 'Chapter 4', section: '' }

// ── BACKGROUNDS ──
const bgDir = path.join(ROOT, 'origins/backgrounds')
ensureDir(bgDir)

const bgNames = ['Acolyte', 'Artisan', 'Charlatan', 'Criminal', 'Entertainer', 'Farmer', 'Guard', 'Guide', 'Hermit', 'Merchant', 'Noble', 'Sage', 'Sailor', 'Scribe', 'Soldier', 'Wayfarer']

let bgCount = 0
for (const name of bgNames) {
    const startIdx = lines.findIndex(l => l.trim() === `### ${name}`)
    if (startIdx === -1) { console.log(`⚠️ Could not find: ${name}`); continue }

    let abilityScores = '', feat = '', skills = '', tool = '', equipment = '', desc = ''
    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('### ') || line.startsWith('## ')) break
        if (line.startsWith('**Ability Scores:**')) abilityScores = line.replace('**Ability Scores:**', '').trim()
        else if (line.startsWith('**Feat:**')) feat = line.replace('**Feat:**', '').replace(/\s*\(see chapter \d+\)/g, '').trim()
        else if (line.startsWith('**Skill Proficiencies:**')) skills = line.replace('**Skill Proficiencies:**', '').trim()
        else if (line.startsWith('**Tool Proficiency:**')) tool = line.replace('**Tool Proficiency:**', '').trim()
        else if (line.startsWith('**Equipment:**')) equipment = line.replace('**Equipment:**', '').trim()
        else if (line && !line.startsWith('**') && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('*')) {
            desc = line
        }
    }

    const bg = {
        name, slug: kebab(name),
        abilityScores: abilityScores.split(', ').map(s => s.trim()),
        feat, skillProficiencies: skills.split(' and ').map(s => s.trim()),
        toolProficiency: tool, equipment, description: desc,
        source: { ...phb4, section: 'Backgrounds' }
    }
    fs.writeFileSync(path.join(bgDir, `${bg.slug}.json`), JSON.stringify(bg, null, 2))
    bgCount++
}

// ── SPECIES ──
const spDir = path.join(ROOT, 'origins/species')
ensureDir(spDir)

const speciesNames = ['Aasimar', 'Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling']

let spCount = 0
for (const name of speciesNames) {
    const startIdx = lines.findIndex(l => l.trim() === `### ${name}`)
    if (startIdx === -1) { console.log(`⚠️ Could not find species: ${name}`); continue }

    // Find end of this species section
    let endIdx = lines.length
    for (let i = startIdx + 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('### ')) { endIdx = i; break }
    }

    const block = lines.slice(startIdx, endIdx)

    // Extract lore paragraphs (before #### Traits)
    const traitsIdx = block.findIndex(l => l.includes('#### ') && l.includes('Traits'))
    const loreParagraphs: string[] = []
    for (let i = 2; i < (traitsIdx > 0 ? traitsIdx : block.length); i++) {
        const line = block[i].trim()
        if (line && !line.startsWith('#') && !line.startsWith('|')) {
            loreParagraphs.push(line)
        }
    }

    // Extract basic info
    let creatureType = 'Humanoid', size = 'Medium', speed = '30 feet'
    const traits: { name: string; description: string }[] = []

    for (let i = traitsIdx > 0 ? traitsIdx : 0; i < block.length; i++) {
        const line = block[i].trim()
        if (line.startsWith('**Creature Type:**')) creatureType = line.replace('**Creature Type:**', '').trim()
        else if (line.startsWith('**Size:**')) size = line.replace('**Size:**', '').trim()
        else if (line.startsWith('**Speed:**')) speed = line.replace('**Speed:**', '').trim()
        else if (line.startsWith('**') && !line.startsWith('**Creature') && !line.startsWith('**Size') && !line.startsWith('**Speed')) {
            const m = line.match(/^\*\*([^*]+?)\.?\*\*\.?\s*(.*)/)
            if (m) {
                const tName = m[1].replace(/:$/, '').trim()
                let tDesc = m[2].trim()
                // Append continuation lines
                for (let j = i + 1; j < block.length; j++) {
                    const next = block[j].trim()
                    if (!next || next.startsWith('**') || next.startsWith('#') || next.startsWith('|') || next.startsWith('As a ') || next.startsWith('As an ')) break
                    tDesc += ' ' + next
                }
                traits.push({ name: tName, description: tDesc })
            }
        }
    }

    // Extract lineage/ancestry tables
    let lineageTable: { lineage: string; values: string[] }[] | undefined
    for (let i = 0; i < block.length; i++) {
        if (block[i].includes('#### ') && (block[i].includes('Lineages') || block[i].includes('Legacies') || block[i].includes('Ancestors'))) {
            const tableRows: { lineage: string; values: string[] }[] = []
            for (let j = i + 1; j < block.length; j++) {
                const row = block[j].trim()
                if (!row.startsWith('|')) { if (tableRows.length > 0) break; continue }
                if (row.includes('---')) continue
                const cells = row.split('|').map(c => c.trim()).filter(Boolean)
                // Skip header row
                if (cells[0] === 'Dragon' || cells[0] === 'Lineage' || cells[0] === 'Legacy') continue
                tableRows.push({ lineage: cells[0], values: cells.slice(1) })
            }
            if (tableRows.length > 0) lineageTable = tableRows
        }
    }

    const species: any = {
        name, slug: kebab(name), creatureType, size, speed,
        lore: loreParagraphs.join('\n\n'),
        traits,
        source: { ...phb4, section: 'Species' }
    }
    if (lineageTable) species.lineageTable = lineageTable

    fs.writeFileSync(path.join(spDir, `${species.slug}.json`), JSON.stringify(species, null, 2))
    spCount++
}

console.log(`✅ Extracted: ${bgCount} backgrounds, ${spCount} species`)

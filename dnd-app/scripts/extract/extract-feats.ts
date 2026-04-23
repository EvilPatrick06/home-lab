/**
 * Parse PHB Ch5 feats into individual JSON files.
 */
import fs from 'fs'
import path from 'path'

const SRC = path.join(process.cwd(), '5.5e References/PHB2024/markdown/05-feats.md')
const OUT = path.join(process.cwd(), 'src/renderer/public/data/5e/feats')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const content = fs.readFileSync(SRC, 'utf-8')

// Category directories
const catDirs: Record<string, string> = {
    'Origin': 'origin', 'General': 'general',
    'Fighting Style': 'fighting-style', 'Epic Boon': 'epic-boon'
}

// Split by "### FeatName" headings
const sections = content.split(/^### /m).slice(1) // skip before first ###

interface Feat {
    name: string; slug: string; category: string
    prerequisite: string | null; level: number | null
    repeatable: boolean; benefits: { name: string; description: string }[]
    description: string
    source: { book: string; chapter: string; section: string }
}

const feats: Feat[] = []
let _currentCategory = 'General' // track from ## Origin Feats / ## General Feats / etc.

for (const section of sections) {
    const lines = section.split('\n').map(l => l.replace(/\r/g, ''))
    const name = lines[0].trim()

    // Skip non-feat sections
    if (['Parts of a Feat', 'Feat List'].includes(name)) continue

    // Detect category from italic line
    const catLine = lines.find(l => l.match(/^\*.*Feat/))
    if (!catLine) continue

    let category = 'General'
    if (catLine.includes('Origin')) category = 'Origin'
    else if (catLine.includes('Fighting Style')) category = 'Fighting Style'
    else if (catLine.includes('Epic Boon')) category = 'Epic Boon'
    else if (catLine.includes('General')) category = 'General'

    // Extract prerequisite
    let prerequisite: string | null = null
    let level: number | null = null
    const prereqMatch = catLine.match(/Prerequisite:\s*(.+?)\)?\*?$/)
    if (prereqMatch) {
        prerequisite = prereqMatch[1].replace(/\)$/, '').trim()
        const lvlMatch = prerequisite.match(/Level (\d+)\+/)
        if (lvlMatch) level = parseInt(lvlMatch[1])
    }

    // Check repeatable
    const repeatable = lines.some(l => l.includes('**Repeatable.**'))

    // Extract benefits
    const benefits: { name: string; description: string }[] = []
    let fullDesc = ''

    for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue
        if (line.startsWith('#### ')) continue // skip sub-tables
        if (line.startsWith('| ')) continue // skip table rows
        if (line.startsWith('*') && !line.startsWith('**')) continue // skip italic category line

        const benefitMatch = line.match(/^\*\*(.+?)\.?\*\*\.?\s*(.*)/)
        if (benefitMatch) {
            const bName = benefitMatch[1].replace(/\.$/, '').trim()
            const bDesc = benefitMatch[2].trim()
            if (bName !== 'Repeatable') {
                benefits.push({ name: bName, description: bDesc })
            }
        } else if (line && !line.startsWith('You gain') && !line.startsWith('These feats') && !line.startsWith('*\\*')) {
            // standalone description (for simple feats)
            if (fullDesc) fullDesc += ' ' + line
            else fullDesc = line
        }
    }

    // For simple feats like Savage Attacker that have no bold benefits
    if (benefits.length === 0 && !fullDesc) {
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i].trim()
            if (line && !line.startsWith('*') && !line.startsWith('|') && !line.startsWith('####') && !line.startsWith('You gain')) {
                fullDesc = line
                break
            }
        }
    }

    // Build description from benefits or standalone text
    const description = benefits.length > 0
        ? benefits.map(b => `${b.name}: ${b.description}`).join('\n')
        : fullDesc

    const feat: Feat = {
        name, slug: kebab(name), category, prerequisite, level,
        repeatable, benefits, description,
        source: { book: '2024 Players Handbook', chapter: 'Chapter 5', section: 'Feats' }
    }
    feats.push(feat)
}

// Write files
let count = 0
for (const f of feats) {
    const dir = catDirs[f.category] || 'general'
    const outDir = path.join(OUT, dir)
    ensureDir(outDir)
    fs.writeFileSync(path.join(outDir, `${f.slug}.json`), JSON.stringify(f, null, 2))
    count++
}

console.log(`✅ Extracted ${count} feats:`)
const byCat: Record<string, number> = {}
for (const f of feats) {
    byCat[f.category] = (byCat[f.category] || 0) + 1
}
for (const [cat, n] of Object.entries(byCat)) {
    console.log(`   ${cat}: ${n}`)
}

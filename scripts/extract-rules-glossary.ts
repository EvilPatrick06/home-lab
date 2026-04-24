/**
 * Extract PHB Appendix C rules glossary into individual JSON files.
 * The glossary uses **bold.** entries, not headings.
 */
import fs from 'fs'
import path from 'path'

const SRC = path.join(process.cwd(), '5.5e References/PHB2024/markdown/appendix-c-rules-glossary.md')
const OUT = path.join(process.cwd(), 'src/renderer/public/data/5e/rules/glossary')
fs.mkdirSync(OUT, { recursive: true })

function kebab(s: string): string {
    return s.replace(/[''()]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const content = fs.readFileSync(SRC, 'utf-8')
const lines = content.split('\n').map(l => l.replace(/\r/g, ''))

const terms: { name: string; slug: string; description: string; category: string; source: any }[] = []
const src = { book: '2024 Players Handbook', chapter: 'Appendix C', section: 'Rules Glossary' }

// Conditions are separate from the main glossary flow
const conditionNames = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious']

let i = 0
while (i < lines.length) {
    const line = lines[i]

    // Match bold entry: **Name.** Description...
    const m = line.match(/^\*\*([^*]+?)\.?\*\*\.?\s+(.+)/)
    if (m) {
        const name = m[1].replace(/\.$/, '').trim()
        let desc = m[2].trim()

        // Collect continuation lines (sub-bullets, plain text, etc.)
        let j = i + 1
        while (j < lines.length) {
            const next = lines[j]
            // Stop at next bold entry, heading, or horizontal rule
            if (next.match(/^\*\*[^*]+\*\*/) || next.startsWith('## ') || next.startsWith('# ') || next.trim() === '---') break
            // Include sub-items, tables, and blank lines
            desc += '\n' + next
            j++
        }

        const category = conditionNames.includes(name) ? 'Condition' : 'Rule'
        terms.push({ name, slug: kebab(name), description: desc.trim(), category, source: src })
        i = j
    } else {
        i++
    }
}

// Write files
let condCount = 0, ruleCount = 0
for (const t of terms) {
    const subDir = t.category === 'Condition' ? path.join(OUT, '..', 'conditions') : OUT
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(path.join(subDir, `${t.slug}.json`), JSON.stringify(t, null, 2))
    if (t.category === 'Condition') condCount++
    else ruleCount++
}

console.log(`✅ Extracted ${terms.length} glossary entries (${ruleCount} rules, ${condCount} conditions)`)

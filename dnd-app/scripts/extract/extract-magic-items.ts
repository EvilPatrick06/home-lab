/**
 * Extract all DMG Ch7 magic items from 6 split files into individual JSON files.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e/equipment/magic-items')
const REF = path.join(process.cwd(), '5.5e References/DMG2024/markdown')
fs.mkdirSync(ROOT, { recursive: true })

function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const files = [
    'ch7-magic-items-a-b.md', 'ch7-magic-items-c-d.md', 'ch7-magic-items-e-h.md',
    'ch7-magic-items-i-o.md', 'ch7-magic-items-p-r.md', 'ch7-magic-items-s-z.md'
]

interface MagicItem {
    name: string; slug: string
    type: string; rarity: string; attunement: boolean
    description: string
    source: { book: string; chapter: string; section: string }
}

const allItems: MagicItem[] = []
const src = { book: '2024 Dungeon Masters Guide', chapter: 'Chapter 7', section: 'Magic Items' }

for (const file of files) {
    const content = fs.readFileSync(path.join(REF, file), 'utf-8')
    const lines = content.split('\n').map(l => l.replace(/\r/g, ''))

    let currentName = ''
    let typeLine = ''
    let descLines: string[] = []

    function saveItem() {
        if (!currentName || !typeLine) return

        // Parse type line: *Type, Rarity (Requires Attunement)*
        const cleanType = typeLine.replace(/^\*/, '').replace(/\*$/, '').trim()
        const attunement = cleanType.includes('Requires Attunement')

        // Split type and rarity
        const parts = cleanType.replace(/\s*\(Requires Attunement\)/, '').split(',').map(s => s.trim())
        const type = parts[0] || ''
        const rarity = parts.slice(1).join(', ').trim() || 'Unknown'

        allItems.push({
            name: currentName, slug: kebab(currentName),
            type, rarity, attunement,
            description: descLines.join('\n').trim(),
            source: src
        })
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        if (line.startsWith('## ') && !line.startsWith('## Chapter')) {
            saveItem()
            currentName = line.replace('## ', '').trim()
            typeLine = ''
            descLines = []
        } else if (currentName && !typeLine && line.startsWith('*') && !line.startsWith('**') && (line.includes('Weapon') || line.includes('Armor') || line.includes('Wondrous') || line.includes('Potion') || line.includes('Ring') || line.includes('Rod') || line.includes('Scroll') || line.includes('Staff') || line.includes('Wand'))) {
            typeLine = line
        } else if (currentName && typeLine) {
            // Skip continuation/reference lines
            if (line.startsWith('# ') || line.startsWith('*(Continued')) continue
            descLines.push(line)
        }
    }
    saveItem() // Save last item in file
}

// Organize by rarity into subdirectories
const rarityDirs: Record<string, string> = {
    'Common': 'common', 'Uncommon': 'uncommon', 'Rare': 'rare',
    'Very Rare': 'very-rare', 'Legendary': 'legendary', 'Artifact': 'artifact'
}

let count = 0
for (const item of allItems) {
    let dir = 'other'
    for (const [rar, d] of Object.entries(rarityDirs)) {
        if (item.rarity.includes(rar)) { dir = d; break }
    }
    // Handle items with multiple rarities like "+1, +2, or +3"
    if (item.rarity.includes('+1') || item.rarity.includes('Uncommon') && item.rarity.includes('Rare')) {
        dir = 'varies'
    }

    const outDir = path.join(ROOT, dir)
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, `${item.slug}.json`), JSON.stringify(item, null, 2))
    count++
}

console.log(`✅ Extracted ${count} magic items`)
// Show count by rarity
const byRarity: Record<string, number> = {}
for (const item of allItems) {
    let rar = 'Other'
    for (const r of ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact']) {
        if (item.rarity.includes(r)) { rar = r; break }
    }
    byRarity[rar] = (byRarity[rar] || 0) + 1
}
for (const [r, n] of Object.entries(byRarity).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${r}: ${n}`)
}

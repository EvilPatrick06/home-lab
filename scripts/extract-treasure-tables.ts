/**
 * Extract DMG Ch7 treasure tables: gemstones, art objects, trade bars, trade goods
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e/equipment')
const SRC = path.join(process.cwd(), '5.5e References/DMG2024/markdown/ch7-treasure-tables.md')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const content = fs.readFileSync(SRC, 'utf-8')
const lines = content.split('\n').map(l => l.replace(/\r/g, ''))

const src = { book: '2024 Dungeon Masters Guide', chapter: 'Chapter 7', section: 'Treasure Tables' }
let count = 0

// Parse gemstones
const gemDir = path.join(ROOT, 'gemstones')
ensureDir(gemDir)

const gemTiers = [
    { heading: '### 10 GP Gemstones', value: '10 GP' },
    { heading: '### 50 GP Gemstones', value: '50 GP' },
    { heading: '### 100 GP Gemstones', value: '100 GP' },
    { heading: '### 500 GP Gemstones', value: '500 GP' },
    { heading: '### 1,000 GP Gemstones', value: '1,000 GP' },
    { heading: '### 5,000 GP Gemstones', value: '5,000 GP' },
]

// Parse art objects
const artDir = path.join(ROOT, 'art-objects')
ensureDir(artDir)

const artTiers = [
    { heading: '### 25 GP Art Objects', value: '25 GP' },
    { heading: '### 250 GP Art Objects', value: '250 GP' },
    { heading: '### 750 GP Art Objects', value: '750 GP' },
    { heading: '### 2,500 GP Art Objects', value: '2,500 GP' },
    { heading: '### 7,500 GP Art Objects', value: '7,500 GP' },
]

function extractTableItems(headings: { heading: string; value: string }[], outDir: string, category: string) {
    for (const { heading, value } of headings) {
        const headIdx = lines.findIndex(l => l.trim() === heading)
        if (headIdx === -1) continue

        // Find table rows after heading
        for (let i = headIdx + 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (line.startsWith('###') || line.startsWith('##')) break
            if (!line.startsWith('|') || line.includes('---') || line.includes('1d')) continue

            // Parse table row: | die | description |
            const parts = line.split('|').map(s => s.trim()).filter(Boolean)
            if (parts.length < 2) continue
            const dieValue = parts[0]
            const desc = parts.slice(1).join(' | ').trim()

            if (!desc || /^\d+$/.test(desc) || desc.toLowerCase() === 'stone' || desc.toLowerCase() === 'object') continue

            // Extract name (before parenthetical)
            const nameMatch = desc.match(/^([^(]+)/)
            const name = nameMatch ? nameMatch[1].trim() : desc
            const details = desc.includes('(') ? desc.match(/\(([^)]+)\)/)?.[1] || '' : ''

            const item = {
                name, slug: kebab(name), value, category,
                description: details, dieValue,
                source: src
            }

            fs.writeFileSync(path.join(outDir, `${item.slug}.json`), JSON.stringify(item, null, 2))
            count++
        }
    }
}

extractTableItems(gemTiers, gemDir, 'Gemstone')
extractTableItems(artTiers, artDir, 'Art Object')

// Parse trade bars
const tbDir = path.join(ROOT, 'trade-bars')
ensureDir(tbDir)

const tbIdx = lines.findIndex(l => l.trim() === '### Trade Bars')
if (tbIdx !== -1) {
    for (let i = tbIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('##')) break
        if (!line.startsWith('|') || line.includes('---') || line.includes('Bar')) continue
        const parts = line.split('|').map(s => s.trim()).filter(Boolean)
        if (parts.length < 3) continue
        const [name, value, dimensions] = parts
        const item = { name, slug: kebab(name), value, dimensions, category: 'Trade Bar', source: src }
        fs.writeFileSync(path.join(tbDir, `${item.slug}.json`), JSON.stringify(item, null, 2))
        count++
    }
}

// Parse trade goods  
const tgDir = path.join(ROOT, 'trade-goods')
ensureDir(tgDir)

const tgIdx = lines.findIndex(l => l.trim() === '### Trade Goods')
if (tgIdx !== -1) {
    for (let i = tgIdx + 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('##')) break
        if (!line.startsWith('|') || line.includes('---') || line.includes('Cost')) continue
        const parts = line.split('|').map(s => s.trim()).filter(Boolean)
        if (parts.length < 2) continue
        const [cost, goods] = parts
        const item = { name: goods, slug: kebab(goods), cost, category: 'Trade Good', source: src }
        fs.writeFileSync(path.join(tgDir, `${item.slug}.json`), JSON.stringify(item, null, 2))
        count++
    }
}

console.log(`✅ Extracted ${count} treasure items (gemstones, art objects, trade bars, trade goods)`)

/**
 * Extract all armor from PHB Ch6 into individual JSON files.
 */
import fs from 'fs'
import path from 'path'

const OUT = path.join(process.cwd(), 'src/renderer/public/data/5e/equipment/armor')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

interface Armor {
    name: string; slug: string; category: string; ac: string
    strength: string | null; stealthDisadvantage: boolean
    weight: string; cost: string; donTime: string; doffTime: string
    source: { book: string; chapter: string; section: string }
}

const src = { book: '2024 Players Handbook', chapter: 'Chapter 6', section: 'Armor' }

const armorData: { category: string; donTime: string; doffTime: string; dir: string; items: [string, string, string | null, boolean, string, string][] }[] = [
    {
        category: 'Light', donTime: '1 Minute', doffTime: '1 Minute', dir: 'light',
        items: [
            ['Padded Armor', '11 + Dex modifier', null, true, '8 lb.', '5 GP'],
            ['Leather Armor', '11 + Dex modifier', null, false, '10 lb.', '10 GP'],
            ['Studded Leather Armor', '12 + Dex modifier', null, false, '13 lb.', '45 GP'],
        ]
    },
    {
        category: 'Medium', donTime: '5 Minutes', doffTime: '1 Minute', dir: 'medium',
        items: [
            ['Hide Armor', '12 + Dex modifier (max 2)', null, false, '12 lb.', '10 GP'],
            ['Chain Shirt', '13 + Dex modifier (max 2)', null, false, '20 lb.', '50 GP'],
            ['Scale Mail', '14 + Dex modifier (max 2)', null, true, '45 lb.', '50 GP'],
            ['Breastplate', '14 + Dex modifier (max 2)', null, false, '20 lb.', '400 GP'],
            ['Half Plate Armor', '15 + Dex modifier (max 2)', null, true, '40 lb.', '750 GP'],
        ]
    },
    {
        category: 'Heavy', donTime: '10 Minutes', doffTime: '5 Minutes', dir: 'heavy',
        items: [
            ['Ring Mail', '14', null, false, '40 lb.', '30 GP'],
            ['Chain Mail', '16', 'Str 13', true, '55 lb.', '75 GP'],
            ['Splint Armor', '17', 'Str 15', true, '60 lb.', '200 GP'],
            ['Plate Armor', '18', 'Str 15', true, '65 lb.', '1,500 GP'],
        ]
    },
    {
        category: 'Shield', donTime: '1 Action', doffTime: '1 Action', dir: 'shields',
        items: [
            ['Shield', '+2', null, false, '6 lb.', '10 GP'],
        ]
    },
]

let count = 0
for (const group of armorData) {
    const outDir = path.join(OUT, group.dir)
    ensureDir(outDir)
    for (const [name, ac, str, stealth, weight, cost] of group.items) {
        const armor: Armor = {
            name, slug: kebab(name), category: group.category, ac,
            strength: str || null, stealthDisadvantage: stealth,
            weight, cost, donTime: group.donTime, doffTime: group.doffTime, source: src
        }
        fs.writeFileSync(path.join(outDir, `${armor.slug}.json`), JSON.stringify(armor, null, 2))
        count++
    }
}
console.log(`✅ Extracted ${count} armor pieces`)

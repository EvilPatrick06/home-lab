/**
 * Extract DMG Ch6 Planes, DMG Appendix A Lore Glossary, and DMG Ch8 Bastions.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e')
const REF = path.join(process.cwd(), '5.5e References/DMG2024/markdown')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

// ── DMG CH6: PLANES ──
const planesDir = path.join(ROOT, 'world/planes')
const planeContent = fs.readFileSync(path.join(REF, 'ch6-cosmology.md'), 'utf-8')
const planeLines = planeContent.split('\n').map(l => l.replace(/\r/g, ''))
const dmg6 = { book: '2024 Dungeon Masters Guide', chapter: 'Chapter 6', section: 'Cosmology' }

const planeCategories: Record<string, string> = {
    'Material Plane': 'material', 'Feywild': 'transitive', 'Shadowfell': 'transitive',
    'Ethereal Plane': 'transitive', 'Astral Plane': 'transitive',
    'Elemental Plane of Air': 'inner', 'Elemental Plane of Earth': 'inner',
    'Elemental Plane of Fire': 'inner', 'Elemental Plane of Water': 'inner',
    'Elemental Chaos': 'inner', 'Para-Elemental Planes': 'inner',
    'Abyss': 'outer', 'Acheron': 'outer', 'Arborea': 'outer',
    'Arcadia': 'outer', 'Beastlands': 'outer', 'Bytopia': 'outer',
    'Carceri': 'outer', 'Elysium': 'outer', 'Gehenna': 'outer',
    'Hades': 'outer', 'Limbo': 'outer', 'Mechanus': 'outer',
    'Mount Celestia': 'outer', 'Nine Hells': 'outer', 'Outlands': 'outer',
    'Pandemonium': 'outer', 'Ysgard': 'outer',
    'Far Realm': 'other', 'Positive Plane': 'other', 'Negative Plane': 'other',
    'Sigil': 'other',
}

const planes: { name: string; slug: string; category: string; description: string; source: any }[] = []
let currentPlane = ''
let planeDescLines: string[] = []

const nonPlanes = new Set(['The Multiverse', 'Planar Categories', 'Planar Travel', 'Inner Planes', 'Outer Planes', 'Transitive Planes', 'Other Planes', 'Material Echoes', 'Domains of Delight', 'Domains of Dread', 'Curtain of Vaporous Color', 'Ether Cyclone', 'Psychic Wind', 'Astral Projection', 'Color Pools', 'Dead Gods', 'Githyanki Outposts', 'Optional Rule: Psychic Disorientation', 'Running a Plane', 'Adventures Beyond the Material Plane', 'Wildspace and the Astral Sea', 'Cosmology Overview', 'Using the Material Plane'])

for (let i = 0; i < planeLines.length; i++) {
    const line = planeLines[i]
    const heading = line.match(/^(#{2,3})\s+(.+)/)
    if (heading) {
        if (currentPlane && planeDescLines.length > 0) {
            const cat = planeCategories[currentPlane] || 'other'
            planes.push({ name: currentPlane, slug: kebab(currentPlane), category: cat, description: planeDescLines.join('\n').trim(), source: dmg6 })
        }
        const name = heading[2].trim()
        if (nonPlanes.has(name) || name.match(/^[A-Z]\s*$/)) {
            currentPlane = ''
        } else {
            currentPlane = name
        }
        planeDescLines = []
    } else if (currentPlane) {
        planeDescLines.push(line)
    }
}
if (currentPlane && planeDescLines.length > 0) {
    const cat = planeCategories[currentPlane] || 'other'
    planes.push({ name: currentPlane, slug: kebab(currentPlane), category: cat, description: planeDescLines.join('\n').trim(), source: dmg6 })
}

let planeCount = 0
for (const p of planes) {
    const dir = path.join(planesDir, p.category)
    ensureDir(dir)
    fs.writeFileSync(path.join(dir, `${p.slug}.json`), JSON.stringify(p, null, 2))
    planeCount++
}

// ── LORE GLOSSARY ──
const loreDir = path.join(ROOT, 'world/lore')
ensureDir(loreDir)
const loreContent = fs.readFileSync(path.join(REF, 'appendix-a-lore-glossary.md'), 'utf-8')
const loreLines = loreContent.split('\n').map(l => l.replace(/\r/g, ''))
const dmgA = { book: '2024 Dungeon Masters Guide', chapter: 'Appendix A', section: 'Lore Glossary' }

const loreEntries: { name: string; slug: string; description: string; source: any }[] = []
let currentLore = ''
let loreDescLines: string[] = []

for (let i = 0; i < loreLines.length; i++) {
    const line = loreLines[i]
    if (line.startsWith('### ')) {
        if (currentLore && loreDescLines.length > 0) {
            loreEntries.push({ name: currentLore, slug: kebab(currentLore), description: loreDescLines.join('\n').trim(), source: dmgA })
        }
        currentLore = line.replace('### ', '').trim()
        loreDescLines = []
    } else if (line.startsWith('## ')) {
        // Letter heading, skip
        if (currentLore && loreDescLines.length > 0) {
            loreEntries.push({ name: currentLore, slug: kebab(currentLore), description: loreDescLines.join('\n').trim(), source: dmgA })
        }
        currentLore = ''
        loreDescLines = []
    } else if (currentLore) {
        loreDescLines.push(line)
    }
}
if (currentLore && loreDescLines.length > 0) {
    loreEntries.push({ name: currentLore, slug: kebab(currentLore), description: loreDescLines.join('\n').trim(), source: dmgA })
}

let loreCount = 0
for (const l of loreEntries) {
    fs.writeFileSync(path.join(loreDir, `${l.slug}.json`), JSON.stringify(l, null, 2))
    loreCount++
}

// ── BASTIONS ──
const bastionDir = path.join(ROOT, 'rules/bastions/facilities')
ensureDir(bastionDir)
const bastionContent = fs.readFileSync(path.join(REF, 'ch8-bastions.md'), 'utf-8')
const bastionLines = bastionContent.split('\n').map(l => l.replace(/\r/g, ''))
const dmg8 = { book: '2024 Dungeon Masters Guide', chapter: 'Chapter 8', section: 'Bastions' }

// Known facility names from the #### headings
const facilityNames = new Set([
    'Arcane Study', 'Archive', 'Armory', 'Barrack', 'Demiplane', 'Gaming Hall', 'Garden',
    'Greenhouse', 'Guildhall', 'Laboratory', 'Library', 'Meditation Chamber', 'Menagerie',
    'Observatory', 'Pub', 'Reliquary', 'Sacristy', 'Sanctuary', 'Sanctum', 'Scriptorium',
    'Smithy', 'Stable', 'Storehouse', 'Teleportation Circle', 'Theater', 'Training Area',
    'Trophy Room', 'War Room', 'Workshop'
])

const facilities: any[] = []
let currentFac = ''
let facLines: string[] = []

for (let i = 0; i < bastionLines.length; i++) {
    const line = bastionLines[i]
    if (line.startsWith('#### ')) {
        const name = line.replace('#### ', '').trim()
        if (facilityNames.has(name)) {
            if (currentFac) {
                facilities.push(parseFacility(currentFac, facLines))
            }
            currentFac = name
            facLines = []
        } else if (currentFac) {
            facLines.push(line)
        }
    } else if (currentFac) {
        facLines.push(line)
    }
}
if (currentFac) {
    facilities.push(parseFacility(currentFac, facLines))
}

function parseFacility(name: string, lines: string[]) {
    let type = '', level = '', space = '', hirelings = '', order = ''
    const descLines: string[] = []

    for (const l of lines) {
        const trimmed = l.trim()
        if (trimmed.includes('Basic Facility') && trimmed.startsWith('*')) type = 'Basic'
        if (trimmed.includes('Special Facility') && trimmed.startsWith('*')) type = 'Special'
        const lvl = trimmed.match(/\*\*Level:\*\*\s*(.+)/)
        if (lvl) level = lvl[1].trim()
        const sp = trimmed.match(/\*\*Space:\*\*\s*(.+)/)
        if (sp) space = sp[1].trim()
        const hr = trimmed.match(/\*\*Hirelings:\*\*\s*(.+)/)
        if (hr) hirelings = hr[1].trim()
        const ord = trimmed.match(/\*\*Order:\*\*\s*(.+)/)
        if (ord) order = ord[1].trim()
        descLines.push(l)
    }

    return {
        name, slug: kebab(name), type, level, space, hirelings, order,
        description: descLines.join('\n').trim(),
        source: dmg8
    }
}

let facCount = 0
for (const f of facilities) {
    fs.writeFileSync(path.join(bastionDir, `${f.slug}.json`), JSON.stringify(f, null, 2))
    facCount++
}

console.log(`✅ Extracted: ${planeCount} planes, ${loreCount} lore entries, ${facCount} bastion facilities`)
console.log(`   Total: ${planeCount + loreCount + facCount}`)

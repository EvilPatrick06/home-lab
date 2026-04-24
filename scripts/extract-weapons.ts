/**
 * Extract all weapons from PHB Ch6 into individual JSON files.
 * Deterministic parsing — no AI needed.
 */
import fs from 'fs'
import path from 'path'

const OUT_BASE = path.join(process.cwd(), 'src/renderer/public/data/5e/equipment/weapons')

function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }

function parseRange(props: string): { normal: number; long: number } | null {
    const m = props.match(/Range (\d+)\/(\d+)/)
    return m ? { normal: parseInt(m[1]), long: parseInt(m[2]) } : null
}

function parseVersatile(props: string): string | null {
    const m = props.match(/Versatile \(([^)]+)\)/)
    return m ? m[1] : null
}

function parseAmmo(props: string): string | null {
    const m = props.match(/Ammunition \([^;]+;\s*([^)]+)\)/)
    return m ? m[1].trim() : null
}

interface Weapon {
    name: string; slug: string; category: string; type: string
    damage: string; damageType: string; properties: string[]
    mastery: string; weight: string; cost: string
    range?: { normal: number; long: number }
    versatileDamage?: string; ammunitionType?: string
    source: { book: string; chapter: string; section: string }
}

const weapons: Weapon[] = []

// Simple Melee
const simpleMelee: [string, string, string, string, string, string][] = [
    ['Club', '1d4 Bludgeoning', 'Light', 'Slow', '2 lb.', '1 SP'],
    ['Dagger', '1d4 Piercing', 'Finesse, Light, Thrown (Range 20/60)', 'Nick', '1 lb.', '2 GP'],
    ['Greatclub', '1d8 Bludgeoning', 'Two-Handed', 'Push', '10 lb.', '2 SP'],
    ['Handaxe', '1d6 Slashing', 'Light, Thrown (Range 20/60)', 'Vex', '2 lb.', '5 GP'],
    ['Javelin', '1d6 Piercing', 'Thrown (Range 30/120)', 'Slow', '2 lb.', '5 SP'],
    ['Light Hammer', '1d4 Bludgeoning', 'Light, Thrown (Range 20/60)', 'Nick', '2 lb.', '2 GP'],
    ['Mace', '1d6 Bludgeoning', '—', 'Sap', '4 lb.', '5 GP'],
    ['Quarterstaff', '1d6 Bludgeoning', 'Versatile (1d8)', 'Topple', '4 lb.', '2 SP'],
    ['Sickle', '1d4 Slashing', 'Light', 'Nick', '2 lb.', '1 GP'],
    ['Spear', '1d6 Piercing', 'Thrown (Range 20/60), Versatile (1d8)', 'Sap', '3 lb.', '1 GP'],
]

const simpleRanged: [string, string, string, string, string, string][] = [
    ['Dart', '1d4 Piercing', 'Finesse, Thrown (Range 20/60)', 'Vex', '1/4 lb.', '5 CP'],
    ['Light Crossbow', '1d8 Piercing', 'Ammunition (Range 80/320; Bolt), Loading, Two-Handed', 'Slow', '5 lb.', '25 GP'],
    ['Shortbow', '1d6 Piercing', 'Ammunition (Range 80/320; Arrow), Two-Handed', 'Vex', '2 lb.', '25 GP'],
    ['Sling', '1d4 Bludgeoning', 'Ammunition (Range 30/120; Bullet)', 'Slow', '—', '1 SP'],
]

const martialMelee: [string, string, string, string, string, string][] = [
    ['Battleaxe', '1d8 Slashing', 'Versatile (1d10)', 'Topple', '4 lb.', '10 GP'],
    ['Flail', '1d8 Bludgeoning', '—', 'Sap', '2 lb.', '10 GP'],
    ['Glaive', '1d10 Slashing', 'Heavy, Reach, Two-Handed', 'Graze', '6 lb.', '20 GP'],
    ['Greataxe', '1d12 Slashing', 'Heavy, Two-Handed', 'Cleave', '7 lb.', '30 GP'],
    ['Greatsword', '2d6 Slashing', 'Heavy, Two-Handed', 'Graze', '6 lb.', '50 GP'],
    ['Halberd', '1d10 Slashing', 'Heavy, Reach, Two-Handed', 'Cleave', '6 lb.', '20 GP'],
    ['Lance', '1d10 Piercing', 'Heavy, Reach, Two-Handed (unless mounted)', 'Topple', '6 lb.', '10 GP'],
    ['Longsword', '1d8 Slashing', 'Versatile (1d10)', 'Sap', '3 lb.', '15 GP'],
    ['Maul', '2d6 Bludgeoning', 'Heavy, Two-Handed', 'Topple', '10 lb.', '10 GP'],
    ['Morningstar', '1d8 Piercing', '—', 'Sap', '4 lb.', '15 GP'],
    ['Pike', '1d10 Piercing', 'Heavy, Reach, Two-Handed', 'Push', '18 lb.', '5 GP'],
    ['Rapier', '1d8 Piercing', 'Finesse', 'Vex', '2 lb.', '25 GP'],
    ['Scimitar', '1d6 Slashing', 'Finesse, Light', 'Nick', '3 lb.', '25 GP'],
    ['Shortsword', '1d6 Piercing', 'Finesse, Light', 'Vex', '2 lb.', '10 GP'],
    ['Trident', '1d8 Piercing', 'Thrown (Range 20/60), Versatile (1d10)', 'Topple', '4 lb.', '5 GP'],
    ['Warhammer', '1d8 Bludgeoning', 'Versatile (1d10)', 'Push', '5 lb.', '15 GP'],
    ['War Pick', '1d8 Piercing', 'Versatile (1d10)', 'Sap', '2 lb.', '5 GP'],
    ['Whip', '1d4 Slashing', 'Finesse, Reach', 'Slow', '3 lb.', '2 GP'],
]

const martialRanged: [string, string, string, string, string, string][] = [
    ['Blowgun', '1 Piercing', 'Ammunition (Range 25/100; Needle), Loading', 'Vex', '1 lb.', '10 GP'],
    ['Hand Crossbow', '1d6 Piercing', 'Ammunition (Range 30/120; Bolt), Light, Loading', 'Vex', '3 lb.', '75 GP'],
    ['Heavy Crossbow', '1d10 Piercing', 'Ammunition (Range 100/400; Bolt), Heavy, Loading, Two-Handed', 'Push', '18 lb.', '50 GP'],
    ['Longbow', '1d8 Piercing', 'Ammunition (Range 150/600; Arrow), Heavy, Two-Handed', 'Slow', '2 lb.', '50 GP'],
    ['Musket', '1d12 Piercing', 'Ammunition (Range 40/120; Bullet), Loading, Two-Handed', 'Slow', '10 lb.', '500 GP'],
    ['Pistol', '1d10 Piercing', 'Ammunition (Range 30/90; Bullet), Loading', 'Vex', '3 lb.', '250 GP'],
]

function processWeapons(data: [string, string, string, string, string, string][], category: string, type: string) {
    for (const [name, dmg, props, mastery, weight, cost] of data) {
        const dmgParts = dmg.split(' ')
        const damageType = dmgParts[dmgParts.length - 1]
        const damageDice = dmgParts.slice(0, -1).join(' ')
        const propList = props === '—' ? [] : props.split(', ').map(p => p.replace(/\s*\([^)]*\)/g, '').trim()).filter(Boolean)
        const w: Weapon = {
            name, slug: kebab(name), category, type,
            damage: damageDice, damageType,
            properties: propList, mastery, weight, cost,
            source: { book: '2024 Players Handbook', chapter: 'Chapter 6', section: 'Weapons' }
        }
        const range = parseRange(props)
        if (range) w.range = range
        const vers = parseVersatile(props)
        if (vers) w.versatileDamage = vers
        const ammo = parseAmmo(props)
        if (ammo) w.ammunitionType = ammo
        weapons.push(w)
    }
}

processWeapons(simpleMelee, 'Simple', 'Melee')
processWeapons(simpleRanged, 'Simple', 'Ranged')
processWeapons(martialMelee, 'Martial', 'Melee')
processWeapons(martialRanged, 'Martial', 'Ranged')

// Write files
const dirs = {
    'Simple-Melee': 'simple-weapons/melee',
    'Simple-Ranged': 'simple-weapons/ranged',
    'Martial-Melee': 'martial-weapons/melee',
    'Martial-Ranged': 'martial-weapons/ranged',
}

let count = 0
for (const w of weapons) {
    const dirKey = `${w.category}-${w.type}` as keyof typeof dirs
    const outDir = path.join(OUT_BASE, dirs[dirKey])
    ensureDir(outDir)
    const filePath = path.join(outDir, `${w.slug}.json`)
    fs.writeFileSync(filePath, JSON.stringify(w, null, 2))
    count++
}

console.log(`✅ Extracted ${count} weapons`)

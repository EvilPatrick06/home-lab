/**
 * Extract DMG traps, PHB languages, calendar, and trinkets.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

// ── TRAPS ──
const trapDir = path.join(ROOT, 'hazards/traps')
ensureDir(path.join(trapDir, 'mechanical'))
ensureDir(path.join(trapDir, 'magical'))
const dmg3 = { book: '2024 Dungeon Masters Guide', chapter: 'Chapter 3', section: 'Traps' }

const traps = [
    { name: 'Collapsing Roof', type: 'mechanical', trigger: 'A creature crosses a trip wire', duration: 'Instantaneous', severity: 'Level 1+', dc: 11, detectDC: 11, disarmDC: 11, damage: '11 (2d10) Bludgeoning', description: 'Each creature in a 10-foot-square area beneath the roof makes a DC 15 Dex save. On failure: 11 (2d10) Bludgeoning damage. On success: half damage. Rubble makes area Difficult Terrain.' },
    { name: 'Falling Net', type: 'mechanical', trigger: 'A creature crosses a trip wire', duration: 'Instantaneous', severity: 'Level 1+', dc: 11, detectDC: 11, disarmDC: 11, damage: 'None', description: 'A net falls on the creature. Restrained condition. DC 10 Strength to escape. Net: AC 10, 20 HP. Can be set with Thieves Tools and components.' },
    { name: 'Fire-Casting Statue', type: 'magical', trigger: 'A creature moves onto a pressure plate', duration: 'Instantaneous, resets next turn', severity: 'Level 5+', dc: 13, detectDC: null, disarmDC: null, damage: '11 (2d10) Fire', description: 'Statue casts fire at the creature. DC 13 Dex save or 11 (2d10) Fire damage. Detect Magic reveals Evocation aura. Dispel Magic (DC 13) disables for 1 hour.' },
    { name: 'Hidden Pit', type: 'mechanical', trigger: "A creature moves onto the pit's lid", duration: 'Instantaneous', severity: 'Level 1+', dc: 13, detectDC: 13, disarmDC: 13, damage: '11 (2d10) Bludgeoning', description: '10-foot-deep pit covered by a lid. DC 13 Dex save or fall in taking 11 (2d10) Bludgeoning damage. Creature needs Climb Speed or climbing gear to escape.' },
    { name: 'Poisoned Darts', type: 'mechanical', trigger: 'A creature moves onto a pressure plate', duration: 'Instantaneous, resets', severity: 'Level 1+', dc: 15, detectDC: 15, disarmDC: 15, damage: '2 (1d4) Piercing + 11 (2d10) Poison', description: '1d3 darts fire from the walls. +8 attack roll. Hit: 2 (1d4) Piercing plus 11 (2d10) Poison damage. Up to 4 firings before depleted.' },
    { name: 'Poisoned Needle', type: 'mechanical', trigger: 'Opening a lock improperly', duration: 'Instantaneous', severity: 'Level 1+', dc: 15, detectDC: 15, disarmDC: 15, damage: '1 Piercing + 11 (2d10) Poison', description: 'Needle springs from lock. DC 15 Dex save or 1 Piercing and 11 (2d10) Poison damage. Knock spell avoids trigger.' },
    { name: 'Rolling Stone', type: 'mechanical', trigger: 'A creature moves onto a pressure plate', duration: "Until the stone stops rolling", severity: 'Level 5+', dc: 15, detectDC: 15, disarmDC: null, damage: '55 (10d10) Bludgeoning', description: 'Large stone rolls down a corridor. Initiative 10. Moves 60 ft. per turn. Creatures in path: DC 15 Dex save or 55 (10d10) Bludgeoning and Prone. Stone: AC 17, HP 100, Damage Threshold 10.' },
    { name: 'Spiked Pit', type: 'mechanical', trigger: "A creature moves onto the pit's lid", duration: 'Instantaneous', severity: 'Level 5+', dc: 13, detectDC: 13, disarmDC: 13, damage: '11 (2d10) Piercing + 11 (2d10) Piercing', description: '20-foot-deep pit with spikes. DC 13 Dex save to grab edge. Fall: 11 (2d10) Bludgeoning plus 11 (2d10) Piercing from spikes. Creature needs Climb Speed or climbing gear to escape.' },
]

let trapCount = 0
for (const t of traps) {
    const subdir = t.type === 'magical' ? 'magical' : 'mechanical'
    const obj = { ...t, slug: kebab(t.name), category: 'Trap', source: dmg3 }
    fs.writeFileSync(path.join(trapDir, subdir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    trapCount++
}

// ── LANGUAGES ──
const langStdDir = path.join(ROOT, 'world/languages/standard')
const langRareDir = path.join(ROOT, 'world/languages/rare')
ensureDir(langStdDir)
ensureDir(langRareDir)
const phb2 = { book: '2024 Players Handbook', chapter: 'Chapter 2', section: 'Languages' }

const standardLangs = [
    { name: 'Common', script: 'Common', origin: 'Widely spoken across the Material Plane', speakers: 'Humans, and most other peoples' },
    { name: 'Common Sign Language', script: 'None (gestural)', origin: 'Widely used across the Material Plane', speakers: 'Anyone, including those who are deaf or hard of hearing' },
    { name: 'Draconic', script: 'Draconic', origin: 'Dragons, dragonborn', speakers: 'Dragonborn, dragons, kobolds, lizardfolk' },
    { name: 'Dwarvish', script: 'Dwarvish', origin: 'Dwarves', speakers: 'Dwarves' },
    { name: 'Elvish', script: 'Elvish', origin: 'Elves', speakers: 'Elves' },
    { name: 'Giant', script: 'Dwarvish', origin: 'Giants', speakers: 'Giants, goliaths, ogres' },
    { name: 'Gnomish', script: 'Dwarvish', origin: 'Gnomes', speakers: 'Gnomes' },
    { name: 'Goblin', script: 'Dwarvish', origin: 'Goblinoids', speakers: 'Bugbears, goblins, hobgoblins' },
    { name: 'Halfling', script: 'Common', origin: 'Halflings', speakers: 'Halflings' },
    { name: 'Orc', script: 'Dwarvish', origin: 'Orcs', speakers: 'Orcs' },
]

const rareLangs = [
    { name: 'Abyssal', script: 'Infernal', origin: 'Demons', speakers: 'Demons' },
    { name: 'Celestial', script: 'Celestial', origin: 'Celestials', speakers: 'Celestials' },
    { name: 'Deep Speech', script: 'None', origin: 'Aberrations', speakers: 'Aberrations, mind flayers, beholders' },
    { name: 'Druidic', script: 'Elvish', origin: 'Druidic circles', speakers: 'Druids' },
    { name: 'Infernal', script: 'Infernal', origin: 'Devils', speakers: 'Devils, tieflings' },
    { name: 'Primordial', script: 'Dwarvish', origin: 'Elementals', speakers: 'Elementals', dialects: ['Aquan', 'Auran', 'Ignan', 'Terran'] },
    { name: 'Sylvan', script: 'Elvish', origin: 'The Feywild', speakers: 'Fey creatures' },
    { name: "Thieves' Cant", script: 'None (coded jargon)', origin: 'Thieves guilds', speakers: 'Rogues, criminals' },
    { name: 'Undercommon', script: 'Elvish', origin: 'The Underdark', speakers: 'Underdark traders, drow' },
]

let langCount = 0
for (const l of standardLangs) {
    const obj = { ...l, slug: kebab(l.name), category: 'Standard', source: phb2 }
    fs.writeFileSync(path.join(langStdDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    langCount++
}
for (const l of rareLangs) {
    const obj = { ...l, slug: kebab(l.name), category: 'Rare', source: phb2 }
    fs.writeFileSync(path.join(langRareDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    langCount++
}

// ── CALENDAR ──
const calDir = path.join(ROOT, 'world/calendar')
ensureDir(calDir)
const dmg5 = { book: '2024 Dungeon Masters Guide', chapter: 'Chapter 5', section: 'Greyhawk Calendar' }

const calendar = {
    name: 'Greyhawk Calendar',
    slug: 'greyhawk-calendar',
    yearLength: 364,
    daysPerMonth: 28,
    daysPerWeek: 7,
    daysOfWeek: ['Starday', 'Sunday', 'Moonday', 'Godsday', 'Waterday', 'Earthday', 'Freeday'],
    months: [
        { order: 1, name: 'Fireseek', season: 'Winter' },
        { order: 0, name: 'Needfest', season: 'Winter', type: 'festival', days: 7 },
        { order: 2, name: 'Readying', season: 'Spring' },
        { order: 3, name: 'Coldeven', season: 'Spring' },
        { order: 0, name: 'Growfest', season: 'Spring', type: 'festival', days: 7 },
        { order: 4, name: 'Planting', season: 'Low Summer' },
        { order: 5, name: 'Flocktime', season: 'Low Summer' },
        { order: 6, name: 'Wealsun', season: 'Low Summer' },
        { order: 0, name: 'Richfest', season: 'Midsummer', type: 'festival', days: 7 },
        { order: 7, name: 'Reaping', season: 'High Summer' },
        { order: 8, name: 'Goodmonth', season: 'High Summer' },
        { order: 9, name: 'Harvester', season: 'High Summer' },
        { order: 0, name: 'Brewfest', season: 'Autumn', type: 'festival', days: 7 },
        { order: 10, name: 'Patchwall', season: 'Autumn' },
        { order: 11, name: "Ready'reat", season: 'Autumn' },
        { order: 12, name: 'Sunsebb', season: 'Winter' },
    ],
    source: dmg5
}

fs.writeFileSync(path.join(calDir, 'greyhawk-calendar.json'), JSON.stringify(calendar, null, 2))

// ── TRINKETS ──
const trinketDir = path.join(ROOT, 'equipment/trinkets')
ensureDir(trinketDir)
const phb2t = { book: '2024 Players Handbook', chapter: 'Chapter 2', section: 'Trinkets' }

// Read trinkets from PHB
const phbPath = path.join(process.cwd(), '5.5e References/PHB2024/markdown/02-creating-a-character.md')
const phbContent = fs.readFileSync(phbPath, 'utf-8')
const trinketLines = phbContent.split('\n').filter(l => l.match(/^\| \d+ \|/))
const trinkets: { roll: number; description: string }[] = []
for (const line of trinketLines) {
    const parts = line.split('|').map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2 && !isNaN(parseInt(parts[0]))) {
        trinkets.push({ roll: parseInt(parts[0]), description: parts[1] })
    }
}

const trinketFile = {
    name: 'Trinkets Table',
    slug: 'trinkets',
    description: 'A d100 table of trinkets — simple items lightly touched by mystery.',
    entries: trinkets,
    source: phb2t
}

fs.writeFileSync(path.join(trinketDir, 'trinkets.json'), JSON.stringify(trinketFile, null, 2))

console.log(`✅ Extracted: ${trapCount} traps, ${langCount} languages, 1 calendar, ${trinkets.length} trinkets`)
console.log(`   Total: ${trapCount + langCount + 1 + (trinkets.length > 0 ? 1 : 0)} files`)

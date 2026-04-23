/**
 * Extract all tools from PHB Ch6 into individual JSON files.
 */
import fs from 'fs'
import path from 'path'

const OUT = path.join(process.cwd(), 'src/renderer/public/data/5e/equipment/tools')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const src = { book: '2024 Players Handbook', chapter: 'Chapter 6', section: 'Tools' }

interface Tool {
    name: string; slug: string; category: string; cost: string
    weight: string; ability: string; utilize: string; craft: string
    variants?: { name: string; cost: string; weight?: string }[]
    source: typeof src
}

const artisanTools: Omit<Tool, 'slug' | 'source' | 'category'>[] = [
    { name: "Alchemist's Supplies", cost: '50 GP', weight: '8 lb.', ability: 'Intelligence', utilize: 'Identify a substance (DC 15), or start a fire (DC 15)', craft: 'Acid, Alchemist\'s Fire, Component Pouch, Oil, Paper, Perfume' },
    { name: "Brewer's Supplies", cost: '20 GP', weight: '9 lb.', ability: 'Intelligence', utilize: 'Detect poisoned drink (DC 15), or identify alcohol (DC 10)', craft: 'Antitoxin' },
    { name: "Calligrapher's Supplies", cost: '10 GP', weight: '5 lb.', ability: 'Dexterity', utilize: 'Write text with impressive flourishes that guard against forgery (DC 15)', craft: 'Ink, Spell Scroll' },
    { name: "Carpenter's Tools", cost: '8 GP', weight: '6 lb.', ability: 'Strength', utilize: 'Seal or pry open a door or container (DC 20)', craft: 'Club, Greatclub, Quarterstaff, Barrel, Chest, Ladder, Pole, Portable Ram, Torch' },
    { name: "Cartographer's Tools", cost: '15 GP', weight: '6 lb.', ability: 'Wisdom', utilize: 'Draft a map of a small area (DC 15)', craft: 'Map' },
    { name: "Cobbler's Tools", cost: '5 GP', weight: '5 lb.', ability: 'Dexterity', utilize: "Modify footwear to give Advantage on the wearer's next Dexterity (Acrobatics) check (DC 10)", craft: "Climber's Kit" },
    { name: "Cook's Utensils", cost: '1 GP', weight: '8 lb.', ability: 'Wisdom', utilize: "Improve food's flavor (DC 10), or detect spoiled or poisoned food (DC 15)", craft: 'Rations' },
    { name: "Glassblower's Tools", cost: '30 GP', weight: '5 lb.', ability: 'Intelligence', utilize: 'Discern what a glass object held in the past 24 hours (DC 15)', craft: 'Glass Bottle, Magnifying Glass, Spyglass, Vial' },
    { name: "Jeweler's Tools", cost: '25 GP', weight: '2 lb.', ability: 'Intelligence', utilize: "Discern a gem's value (DC 15)", craft: 'Arcane Focus, Holy Symbol' },
    { name: "Leatherworker's Tools", cost: '5 GP', weight: '5 lb.', ability: 'Dexterity', utilize: 'Add a design to a leather item (DC 10)', craft: 'Sling, Whip, Hide Armor, Leather Armor, Studded Leather Armor, Backpack, Crossbow Bolt Case, Map or Scroll Case, Parchment, Pouch, Quiver, Waterskin' },
    { name: "Mason's Tools", cost: '10 GP', weight: '8 lb.', ability: 'Strength', utilize: 'Chisel a symbol or hole in stone (DC 10)', craft: 'Block and Tackle' },
    { name: "Painter's Supplies", cost: '10 GP', weight: '5 lb.', ability: 'Wisdom', utilize: "Paint a recognizable image of something you've seen (DC 10)", craft: 'Druidic Focus, Holy Symbol' },
    { name: "Potter's Tools", cost: '10 GP', weight: '3 lb.', ability: 'Intelligence', utilize: 'Discern what a ceramic object held in the past 24 hours (DC 15)', craft: 'Jug, Lamp' },
    { name: "Smith's Tools", cost: '20 GP', weight: '8 lb.', ability: 'Strength', utilize: 'Pry open a door or container (DC 20)', craft: 'Any Melee weapon (except Club, Greatclub, Quarterstaff, and Whip), Medium armor (except Hide), Heavy armor, Ball Bearings, Bucket, Caltrops, Chain, Crowbar, Firearm Bullets, Grappling Hook, Iron Pot, Iron Spikes, Sling Bullets' },
    { name: "Tinker's Tools", cost: '50 GP', weight: '10 lb.', ability: 'Dexterity', utilize: 'Assemble a Tiny item composed of scrap, which falls apart in 1 minute (DC 20)', craft: 'Musket, Pistol, Bell, Bullseye Lantern, Flask, Hooded Lantern, Hunting Trap, Lock, Manacles, Mirror, Shovel, Signal Whistle, Tinderbox' },
    { name: "Weaver's Tools", cost: '1 GP', weight: '5 lb.', ability: 'Dexterity', utilize: "Mend a tear in clothing (DC 10), or sew a Tiny design (DC 10)", craft: "Padded Armor, Basket, Bedroll, Blanket, Fine Clothes, Net, Robe, Rope, Sack, String, Tent, Traveler's Clothes" },
    { name: "Woodcarver's Tools", cost: '1 GP', weight: '5 lb.', ability: 'Dexterity', utilize: 'Carve a pattern in wood (DC 10)', craft: 'Club, Greatclub, Quarterstaff, Ranged weapons (except Pistol, Musket, and Sling), Arcane Focus, Arrows, Bolts, Druidic Focus, Ink Pen, Needles' },
]

const otherTools: Omit<Tool, 'slug' | 'source' | 'category'>[] = [
    { name: 'Disguise Kit', cost: '25 GP', weight: '3 lb.', ability: 'Charisma', utilize: 'Apply makeup (DC 10)', craft: 'Costume' },
    { name: 'Forgery Kit', cost: '15 GP', weight: '5 lb.', ability: 'Dexterity', utilize: "Mimic 10 or fewer words of someone else's handwriting (DC 15), or duplicate a wax seal (DC 20)", craft: '' },
    { name: 'Herbalism Kit', cost: '5 GP', weight: '3 lb.', ability: 'Intelligence', utilize: 'Identify a plant (DC 10)', craft: 'Antitoxin, Candle, Healer\'s Kit, Potion of Healing' },
    { name: "Navigator's Tools", cost: '25 GP', weight: '2 lb.', ability: 'Wisdom', utilize: 'Plot a course (DC 10), or determine position by stargazing (DC 15)', craft: '' },
    { name: "Poisoner's Kit", cost: '50 GP', weight: '2 lb.', ability: 'Intelligence', utilize: 'Detect a poisoned object (DC 10)', craft: 'Basic Poison' },
    { name: "Thieves' Tools", cost: '25 GP', weight: '1 lb.', ability: 'Dexterity', utilize: 'Pick a lock (DC 15), or disarm a trap (DC 15)', craft: '' },
]

// Gaming sets and musical instruments as variant tools
const gamingSets: Omit<Tool, 'slug' | 'source' | 'category'> = {
    name: 'Gaming Set', cost: 'Varies', weight: '—', ability: 'Wisdom',
    utilize: 'Discern whether someone is cheating (DC 10), or win the game (DC 20)', craft: '',
    variants: [
        { name: 'Dice', cost: '1 SP' }, { name: 'Dragonchess', cost: '1 GP' },
        { name: 'Playing Cards', cost: '5 SP' }, { name: 'Three-Dragon Ante', cost: '1 GP' },
    ]
}

const musicalInstruments: Omit<Tool, 'slug' | 'source' | 'category'> = {
    name: 'Musical Instrument', cost: 'Varies', weight: 'Varies', ability: 'Charisma',
    utilize: 'Play a known tune (DC 10), or improvise a song (DC 15)', craft: '',
    variants: [
        { name: 'Bagpipes', cost: '30 GP', weight: '6 lb.' },
        { name: 'Drum', cost: '6 GP', weight: '3 lb.' },
        { name: 'Dulcimer', cost: '25 GP', weight: '10 lb.' },
        { name: 'Flute', cost: '2 GP', weight: '1 lb.' },
        { name: 'Horn', cost: '3 GP', weight: '2 lb.' },
        { name: 'Lute', cost: '35 GP', weight: '2 lb.' },
        { name: 'Lyre', cost: '30 GP', weight: '2 lb.' },
        { name: 'Pan Flute', cost: '12 GP', weight: '2 lb.' },
        { name: 'Shawm', cost: '2 GP', weight: '1 lb.' },
        { name: 'Viol', cost: '30 GP', weight: '1 lb.' },
    ]
}

let count = 0

// Write artisan tools
const artDir = path.join(OUT, 'artisan-tools')
ensureDir(artDir)
for (const t of artisanTools) {
    const tool: Tool = { ...t, slug: kebab(t.name), category: 'Artisan Tools', source: src }
    fs.writeFileSync(path.join(artDir, `${tool.slug}.json`), JSON.stringify(tool, null, 2))
    count++
}

// Write gaming sets — individual files per variant
const gsDir = path.join(OUT, 'gaming-sets')
ensureDir(gsDir)
for (const v of gamingSets.variants!) {
    const tool: Tool = {
        name: `Gaming Set (${v.name})`, slug: kebab(v.name), category: 'Gaming Set',
        cost: v.cost, weight: '—', ability: gamingSets.ability,
        utilize: gamingSets.utilize, craft: '', source: src
    }
    fs.writeFileSync(path.join(gsDir, `${tool.slug}.json`), JSON.stringify(tool, null, 2))
    count++
}

// Write musical instruments — individual files per variant
const miDir = path.join(OUT, 'musical-instruments')
ensureDir(miDir)
for (const v of musicalInstruments.variants!) {
    const tool: Tool = {
        name: v.name, slug: kebab(v.name), category: 'Musical Instrument',
        cost: v.cost, weight: v.weight || '—', ability: musicalInstruments.ability,
        utilize: musicalInstruments.utilize, craft: '', source: src
    }
    fs.writeFileSync(path.join(miDir, `${tool.slug}.json`), JSON.stringify(tool, null, 2))
    count++
}

// Write other tools at root level
const otherDir = OUT
for (const t of otherTools) {
    const tool: Tool = { ...t, slug: kebab(t.name), category: 'Other Tools', source: src }
    fs.writeFileSync(path.join(otherDir, `${tool.slug}.json`), JSON.stringify(tool, null, 2))
    count++
}

console.log(`✅ Extracted ${count} tools`)

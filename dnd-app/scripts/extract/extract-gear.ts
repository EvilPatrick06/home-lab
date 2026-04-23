/**
 * Extract adventuring gear, mounts, vehicles, services from PHB Ch6.
 */
import fs from 'fs'
import path from 'path'

const BASE = path.join(process.cwd(), 'src/renderer/public/data/5e/equipment')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/[''*]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}
const src = { book: '2024 Players Handbook', chapter: 'Chapter 6' }

// ── Adventuring Gear ──
const gearDir = path.join(BASE, 'items/adventuring-gear')
ensureDir(gearDir)

const gear: { name: string; cost: string; weight: string; description: string }[] = [
    { name: 'Acid', cost: '25 GP', weight: '1 lb.', description: 'When you take the Attack action, you can replace one of your attacks with throwing a vial of Acid. Target one creature or object you can see within 20 feet. DC 8 + Dex mod + Prof Bonus Dex save or take 2d6 Acid damage.' },
    { name: "Alchemist's Fire", cost: '50 GP', weight: '1 lb.', description: 'When you take the Attack action, you can replace one of your attacks with throwing a flask. Target one creature or object within 20 feet. DC 8 + Dex mod + Prof Bonus Dex save or take 1d4 Fire damage and start burning.' },
    { name: 'Antitoxin', cost: '50 GP', weight: '—', description: 'As a Bonus Action, drink to gain Advantage on saving throws to avoid or end the Poisoned condition for 1 hour.' },
    { name: 'Backpack', cost: '2 GP', weight: '5 lb.', description: 'Holds up to 30 pounds within 1 cubic foot. Can also serve as a saddlebag.' },
    { name: 'Ball Bearings', cost: '1 GP', weight: '2 lb.', description: 'As a Utilize action, spread to cover a 10-foot-square area within 10 feet. Creatures entering must succeed DC 10 Dex save or have Prone condition. 10 minutes to recover.' },
    { name: 'Barrel', cost: '2 GP', weight: '70 lb.', description: 'Holds up to 40 gallons of liquid or up to 4 cubic feet of dry goods.' },
    { name: 'Basket', cost: '4 SP', weight: '2 lb.', description: 'Holds up to 40 pounds within 2 cubic feet.' },
    { name: 'Bedroll', cost: '1 GP', weight: '7 lb.', description: 'Sleeps one Small or Medium creature. Auto-succeed saves against extreme cold while in it.' },
    { name: 'Bell', cost: '1 GP', weight: '—', description: 'When rung as a Utilize action, produces a sound that can be heard up to 60 feet away.' },
    { name: 'Blanket', cost: '5 SP', weight: '3 lb.', description: 'While wrapped in a blanket, Advantage on saves against extreme cold.' },
    { name: 'Block and Tackle', cost: '1 GP', weight: '5 lb.', description: 'Allows you to hoist up to four times the weight you can normally lift.' },
    { name: 'Book', cost: '25 GP', weight: '5 lb.', description: 'If you consult an accurate nonfiction Book about its topic, +5 bonus to Intelligence (Arcana, History, Nature, or Religion) checks about that topic.' },
    { name: 'Bottle, Glass', cost: '2 GP', weight: '2 lb.', description: 'Holds up to 1½ pints.' },
    { name: 'Bucket', cost: '5 CP', weight: '2 lb.', description: 'Holds up to half a cubic foot of contents.' },
    { name: 'Caltrops', cost: '1 GP', weight: '2 lb.', description: 'As a Utilize action, spread to cover a 5-foot-square area within 5 feet. DC 15 Dex save or take 1 Piercing damage and Speed reduced to 0 until start of next turn.' },
    { name: 'Candle', cost: '1 CP', weight: '—', description: 'Burns for 1 hour. Casts Bright Light in 5-foot radius and Dim Light for additional 5 feet.' },
    { name: 'Case, Crossbow Bolt', cost: '1 GP', weight: '1 lb.', description: 'Holds up to 20 Bolts.' },
    { name: 'Case, Map or Scroll', cost: '1 GP', weight: '1 lb.', description: 'Holds up to 10 sheets of paper or 5 sheets of parchment.' },
    { name: 'Chain', cost: '5 GP', weight: '10 lb.', description: 'As a Utilize action, wrap around a Grappled/Incapacitated/Restrained creature within 5 feet (DC 13 Athletics). Escape: DC 18 Acrobatics. Burst: DC 20 Athletics.' },
    { name: 'Chest', cost: '5 GP', weight: '25 lb.', description: 'Holds up to 12 cubic feet of contents.' },
    { name: "Climber's Kit", cost: '25 GP', weight: '12 lb.', description: "Includes boot tips, gloves, pitons, harness. As Utilize action, anchor yourself; can't fall more than 25 feet from anchor point." },
    { name: 'Clothes, Fine', cost: '15 GP', weight: '6 lb.', description: 'Made of expensive fabrics. Some events and locations admit only people wearing these.' },
    { name: "Clothes, Traveler's", cost: '2 GP', weight: '4 lb.', description: 'Resilient garments designed for travel in various environments.' },
    { name: 'Component Pouch', cost: '25 GP', weight: '2 lb.', description: 'Watertight; holds all free Material components of your spells.' },
    { name: 'Costume', cost: '5 GP', weight: '4 lb.', description: 'Advantage on ability checks to impersonate the person/type it represents.' },
    { name: 'Crowbar', cost: '2 GP', weight: '5 lb.', description: "Advantage on Strength checks where leverage can be applied." },
    { name: 'Flask', cost: '2 CP', weight: '1 lb.', description: 'Holds up to 1 pint.' },
    { name: 'Grappling Hook', cost: '2 GP', weight: '4 lb.', description: 'As Utilize action, throw at a catch within 50 feet. DC 13 Acrobatics to catch. Tie a Rope to climb.' },
    { name: "Healer's Kit", cost: '5 GP', weight: '3 lb.', description: '10 uses. As Utilize action, expend one use to stabilize an Unconscious creature at 0 HP without Medicine check.' },
    { name: 'Holy Water', cost: '25 GP', weight: '1 lb.', description: 'Replace an attack to throw at a creature within 20 feet. DC 8 + Dex mod + Prof Bonus Dex save or take 2d8 Radiant damage if Fiend or Undead.' },
    { name: 'Hunting Trap', cost: '5 GP', weight: '25 lb.', description: 'Set as Utilize action. DC 13 Dex save or 1d4 Piercing and Speed 0. DC 13 Athletics to free. Each failed attempt deals 1 Piercing.' },
    { name: 'Ink', cost: '10 GP', weight: '—', description: '1-ounce bottle provides enough ink to write about 500 pages.' },
    { name: 'Ink Pen', cost: '2 CP', weight: '—', description: 'Using Ink, an Ink Pen writes or draws.' },
    { name: 'Jug', cost: '2 CP', weight: '4 lb.', description: 'Holds up to 1 gallon.' },
    { name: 'Ladder', cost: '1 SP', weight: '25 lb.', description: '10 feet tall. Must climb to move up or down it.' },
    { name: 'Lamp', cost: '5 SP', weight: '1 lb.', description: 'Burns Oil. Bright Light in 15-foot radius and Dim Light for additional 30 feet.' },
    { name: 'Lantern, Bullseye', cost: '10 GP', weight: '2 lb.', description: 'Burns Oil. Bright Light in 60-foot Cone and Dim Light for additional 60 feet.' },
    { name: 'Lantern, Hooded', cost: '5 GP', weight: '2 lb.', description: 'Burns Oil. Bright Light in 30-foot radius and Dim Light for 30 feet. Bonus Action to lower/raise hood.' },
    { name: 'Lock', cost: '10 GP', weight: '1 lb.', description: "Comes with a key. Without key, DC 15 Dexterity (Sleight of Hand) with Thieves' Tools to pick." },
    { name: 'Magnifying Glass', cost: '100 GP', weight: '—', description: 'Advantage on checks to appraise or inspect detailed items. Can light fire with sunlight in 5 minutes.' },
    { name: 'Manacles', cost: '2 GP', weight: '6 lb.', description: 'As Utilize action, bind Small/Medium Grappled/Incapacitated/Restrained creature (DC 13 Sleight of Hand). Escape: DC 20, Burst: DC 25. Comes with key.' },
    { name: 'Map', cost: '1 GP', weight: '—', description: '+5 bonus to Wisdom (Survival) checks to find your way in the place represented.' },
    { name: 'Mirror', cost: '5 GP', weight: '1/2 lb.', description: 'Handheld steel mirror for cosmetics, peeking around corners, and signaling.' },
    { name: 'Net', cost: '1 GP', weight: '3 lb.', description: 'Replace an attack to throw at creature within 15 feet. DC 8 + Dex mod + Prof Bonus Dex save or Restrained. AC 10, 5 HP to destroy.' },
    { name: 'Oil', cost: '1 SP', weight: '1 lb.', description: 'Douse creature (DC 8 + Dex + Prof, +5 Fire if ignited within 1 minute), douse 5-ft square (5 Fire damage), or fuel for Lamps/Lanterns (6 hours).' },
    { name: 'Paper', cost: '2 SP', weight: '—', description: 'One sheet holds about 250 handwritten words.' },
    { name: 'Parchment', cost: '1 SP', weight: '—', description: 'One sheet holds about 250 handwritten words.' },
    { name: 'Perfume', cost: '5 GP', weight: '—', description: '4-ounce vial. For 1 hour, Advantage on Charisma (Persuasion) checks to influence an Indifferent Humanoid within 5 feet.' },
    { name: 'Poison, Basic', cost: '100 GP', weight: '—', description: 'As Bonus Action, coat one weapon or up to 3 ammunition. Extra 1d4 Poison damage for 1 minute or until damage dealt.' },
    { name: 'Pole', cost: '5 CP', weight: '7 lb.', description: '10 feet long. Touch things up to 10 feet away. Advantage on Athletics checks for High/Long Jump (vaulting).' },
    { name: 'Pot, Iron', cost: '2 GP', weight: '10 lb.', description: 'Holds up to 1 gallon.' },
    { name: 'Potion of Healing', cost: '50 GP', weight: '1/2 lb.', description: 'Magic item. As Bonus Action, drink or administer within 5 feet. Regain 2d4 + 2 Hit Points.' },
    { name: 'Pouch', cost: '5 SP', weight: '1 lb.', description: 'Holds up to 6 pounds within one-fifth of a cubic foot.' },
    { name: 'Quiver', cost: '1 GP', weight: '1 lb.', description: 'Holds up to 20 Arrows.' },
    { name: 'Ram, Portable', cost: '4 GP', weight: '35 lb.', description: '+4 bonus to Strength check to break doors. Another character can help (gives Advantage).' },
    { name: 'Rations', cost: '5 SP', weight: '2 lb.', description: 'Travel-ready food: jerky, dried fruit, hardtack, nuts. 1 day of food.' },
    { name: 'Robe', cost: '1 GP', weight: '4 lb.', description: 'Vocational or ceremonial significance. Some events/locations require specific robes.' },
    { name: 'Rope', cost: '1 GP', weight: '5 lb.', description: 'DC 10 Sleight of Hand to tie knot. Burst: DC 20 Athletics. Can bind Grappled/Incapacitated/Restrained creatures (escape: DC 15 Acrobatics).' },
    { name: 'Sack', cost: '1 CP', weight: '1/2 lb.', description: 'Holds up to 30 pounds within 1 cubic foot.' },
    { name: 'Shovel', cost: '2 GP', weight: '5 lb.', description: 'In 1 hour, dig a hole 5 feet on each side in soil or similar material.' },
    { name: 'Signal Whistle', cost: '5 CP', weight: '—', description: 'When blown as Utilize action, produces a sound heard up to 600 feet away.' },
    { name: 'Spikes, Iron', cost: '1 GP', weight: '5 lb.', description: 'Bundle of 10. As Utilize action, hammer into wood/earth/similar to jam doors or tie Rope/Chain.' },
    { name: 'Spyglass', cost: '1,000 GP', weight: '1 lb.', description: 'Objects viewed are magnified to twice their size.' },
    { name: 'String', cost: '1 SP', weight: '—', description: '10 feet long. Tie a knot as Utilize action.' },
    { name: 'Tent', cost: '2 GP', weight: '20 lb.', description: 'Sleeps up to two Small or Medium creatures.' },
    { name: 'Tinderbox', cost: '5 SP', weight: '1 lb.', description: 'Contains flint, fire steel, tinder. Bonus Action to light Candle/Lamp/Lantern/Torch. 1 minute for other fires.' },
    { name: 'Torch', cost: '1 CP', weight: '1 lb.', description: 'Burns 1 hour. Bright Light in 20-foot radius and Dim Light for additional 20 feet. Can be used as Simple Melee weapon for 1 Fire damage.' },
    { name: 'Vial', cost: '1 GP', weight: '—', description: 'Holds up to 4 ounces.' },
    { name: 'Waterskin', cost: '2 SP', weight: '5 lb. (full)', description: 'Holds up to 4 pints.' },
]

let gearCount = 0
for (const g of gear) {
    const obj = { ...g, slug: kebab(g.name), category: 'Adventuring Gear', source: { ...src, section: 'Adventuring Gear' } }
    fs.writeFileSync(path.join(gearDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    gearCount++
}

// ── Equipment Packs ──
const bundleDir = path.join(BASE, 'bundles')
ensureDir(bundleDir)
const packs = [
    { name: "Burglar's Pack", cost: '16 GP', weight: '42 lb.', contents: 'Backpack, Ball Bearings, Bell, 10 Candles, Crowbar, Hooded Lantern, 7 flasks of Oil, 5 days of Rations, Rope, Tinderbox, Waterskin' },
    { name: "Diplomat's Pack", cost: '39 GP', weight: '39 lb.', contents: 'Chest, Fine Clothes, Ink, 5 Ink Pens, Lamp, 2 Map or Scroll Cases, 4 flasks of Oil, 5 sheets of Paper, 5 sheets of Parchment, Perfume, Tinderbox' },
    { name: "Dungeoneer's Pack", cost: '12 GP', weight: '55 lb.', contents: 'Backpack, Caltrops, Crowbar, 2 flasks of Oil, 10 days of Rations, Rope, Tinderbox, 10 Torches, Waterskin' },
    { name: "Entertainer's Pack", cost: '40 GP', weight: '58½ lb.', contents: 'Backpack, Bedroll, Bell, Bullseye Lantern, 3 Costumes, Mirror, 8 flasks of Oil, 9 days of Rations, Tinderbox, Waterskin' },
    { name: "Explorer's Pack", cost: '10 GP', weight: '55 lb.', contents: 'Backpack, Bedroll, 2 flasks of Oil, 10 days of Rations, Rope, Tinderbox, 10 Torches, Waterskin' },
    { name: "Priest's Pack", cost: '33 GP', weight: '29 lb.', contents: 'Backpack, Blanket, Holy Water, Lamp, 7 days of Rations, Robe, Tinderbox' },
    { name: "Scholar's Pack", cost: '40 GP', weight: '22 lb.', contents: 'Backpack, Book, Ink, Ink Pen, Lamp, 10 flasks of Oil, 10 sheets of Parchment, Tinderbox' },
]

let packCount = 0
for (const p of packs) {
    const obj = { ...p, slug: kebab(p.name), category: 'Equipment Bundle', source: { ...src, section: 'Adventuring Gear' } }
    fs.writeFileSync(path.join(bundleDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    packCount++
}

// ── Mounts ──
const mountDir = path.join(BASE, 'mounts')
ensureDir(mountDir)
const mounts = [
    { name: 'Camel', cost: '50 GP', carryingCapacity: '450 lb.' },
    { name: 'Elephant', cost: '200 GP', carryingCapacity: '1,320 lb.' },
    { name: 'Horse, Draft', cost: '50 GP', carryingCapacity: '540 lb.' },
    { name: 'Horse, Riding', cost: '75 GP', carryingCapacity: '480 lb.' },
    { name: 'Mastiff', cost: '25 GP', carryingCapacity: '195 lb.' },
    { name: 'Mule', cost: '8 GP', carryingCapacity: '420 lb.' },
    { name: 'Pony', cost: '30 GP', carryingCapacity: '225 lb.' },
    { name: 'Warhorse', cost: '400 GP', carryingCapacity: '540 lb.' },
]

let mountCount = 0
for (const m of mounts) {
    const obj = { ...m, slug: kebab(m.name), category: 'Mount', source: { ...src, section: 'Mounts and Vehicles' } }
    fs.writeFileSync(path.join(mountDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    mountCount++
}

// ── Vehicles (drawn) ──
const drawnDir = path.join(BASE, 'vehicles/drawn')
ensureDir(drawnDir)
const drawn = [
    { name: 'Carriage', cost: '100 GP', weight: '600 lb.' },
    { name: 'Cart', cost: '15 GP', weight: '200 lb.' },
    { name: 'Chariot', cost: '250 GP', weight: '100 lb.' },
    { name: 'Sled', cost: '20 GP', weight: '300 lb.' },
    { name: 'Wagon', cost: '35 GP', weight: '400 lb.' },
    { name: 'Saddle, Exotic', cost: '60 GP', weight: '40 lb.' },
    { name: 'Saddle, Military', cost: '20 GP', weight: '30 lb.' },
    { name: 'Saddle, Riding', cost: '10 GP', weight: '25 lb.' },
]

let vehCount = 0
for (const v of drawn) {
    const obj = { ...v, slug: kebab(v.name), category: 'Drawn Vehicle', source: { ...src, section: 'Mounts and Vehicles' } }
    fs.writeFileSync(path.join(drawnDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    vehCount++
}

// ── Waterborne/Airborne Vehicles ──
const shipDir = path.join(BASE, 'vehicles/waterborne')
ensureDir(shipDir)
const ships = [
    { name: 'Airship', cost: '40,000 GP', speed: '8 mph', crew: 10, passengers: 20, cargo: '1 ton', ac: 13, hp: 300, damageThreshold: null },
    { name: 'Galley', cost: '30,000 GP', speed: '4 mph', crew: 80, passengers: 0, cargo: '150 tons', ac: 15, hp: 500, damageThreshold: 20 },
    { name: 'Keelboat', cost: '3,000 GP', speed: '1 mph', crew: 1, passengers: 6, cargo: '1/2 ton', ac: 15, hp: 100, damageThreshold: 10 },
    { name: 'Longship', cost: '10,000 GP', speed: '3 mph', crew: 40, passengers: 150, cargo: '10 tons', ac: 15, hp: 300, damageThreshold: 15 },
    { name: 'Rowboat', cost: '50 GP', speed: '1½ mph', crew: 1, passengers: 3, cargo: '—', ac: 11, hp: 50, damageThreshold: null },
    { name: 'Sailing Ship', cost: '10,000 GP', speed: '2 mph', crew: 20, passengers: 20, cargo: '100 tons', ac: 15, hp: 300, damageThreshold: 15 },
    { name: 'Warship', cost: '25,000 GP', speed: '2½ mph', crew: 60, passengers: 60, cargo: '200 tons', ac: 15, hp: 500, damageThreshold: 20 },
]

for (const s of ships) {
    const obj = { ...s, slug: kebab(s.name), category: 'Waterborne Vehicle', source: { ...src, section: 'Mounts and Vehicles' } }
    fs.writeFileSync(path.join(shipDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    vehCount++
}

console.log(`✅ Extracted: ${gearCount} gear, ${packCount} packs, ${mountCount} mounts, ${vehCount} vehicles`)
console.log(`   Total: ${gearCount + packCount + mountCount + vehCount} items`)

/**
 * Extract DMG Ch3 toolbox structured data:
 * Poisons, Hazards, Traps, Siege Equipment, Supernatural Gifts, Settlements, Doors
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e')
function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }) }
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

const dmgSrc = { book: '2024 Dungeon Masters Guide', chapter: 'Chapter 3', section: '' }

// ── POISONS ──
const poisonDir = path.join(ROOT, 'equipment/items/poisons')
ensureDir(poisonDir)

const poisons = [
    { name: "Assassin's Blood", cost: '150 GP', type: 'Ingested', dc: 10, damage: '1d12 Poison', effect: 'Poisoned for 24 hours on failed save', description: 'A creature subjected to this poison must make a DC 10 Constitution saving throw. On a failed save, it takes 6 (1d12) Poison damage and has the Poisoned condition for 24 hours. On a successful save, the creature takes half as much damage only.' },
    { name: 'Burnt Othur Fumes', cost: '500 GP', type: 'Inhaled', dc: 13, damage: '3d6 Poison', effect: 'Must repeat save each turn, taking 1d6 Poison on failure', description: 'A creature subjected to this poison must succeed on a DC 13 Constitution saving throw or take 10 (3d6) Poison damage, and it must repeat the saving throw at the start of each of its turns. On each successive failed save, the creature takes 3 (1d6) Poison damage. After three successful saves, the poison ends.' },
    { name: 'Carrion Crawler Mucus', cost: '200 GP', type: 'Contact', dc: 13, damage: 'None', effect: 'Poisoned and Paralyzed for 1 minute', description: 'A creature subjected to this poison must succeed on a DC 13 Constitution saving throw or have the Poisoned condition and the Paralyzed condition for 1 minute. The Paralyzed creature repeats the save at the end of each of its turns, ending both conditions on a success.' },
    { name: 'Essence of Ether', cost: '300 GP', type: 'Inhaled', dc: 15, damage: 'None', effect: 'Poisoned for 8 hours, Unconscious', description: 'A creature subjected to this poison must succeed on a DC 15 Constitution saving throw or have the Poisoned condition for 8 hours. The Poisoned creature has the Unconscious condition. The creature wakes up if it takes damage or if another creature uses an action to shake it awake.' },
    { name: "Lolth's Sting", cost: '200 GP', type: 'Injury', dc: 13, damage: '1d6 Poison', effect: 'Poisoned for 1 hour', description: 'A creature subjected to this poison must succeed on a DC 13 Constitution saving throw or take 3 (1d6) Poison damage and have the Poisoned condition for 1 hour.' },
    { name: 'Malice', cost: '250 GP', type: 'Inhaled', dc: 15, damage: 'None', effect: 'Blinded for 1 hour', description: 'A creature subjected to this poison must succeed on a DC 15 Constitution saving throw or have the Blinded condition for 1 hour. If the creature fails by 5 or more, it also has the Unconscious condition while Blinded in this way. The creature wakes up if it takes damage or if another creature uses an action to shake it awake.' },
    { name: 'Midnight Tears', cost: '1,500 GP', type: 'Ingested', dc: 17, damage: '9d6 Poison', effect: 'Damage triggers at midnight', description: "A creature that ingests this poison suffers no effect until midnight. If the poison has not been neutralized before then, the creature must succeed on a DC 17 Constitution saving throw, taking 31 (9d6) Poison damage on a failed save, or half as much damage on a successful one." },
    { name: 'Oil of Taggit', cost: '400 GP', type: 'Contact', dc: 13, damage: 'None', effect: 'Poisoned and Unconscious for 24 hours', description: 'A creature subjected to this poison must succeed on a DC 13 Constitution saving throw or have the Poisoned condition and the Unconscious condition for 24 hours. The creature wakes up if it takes damage.' },
    { name: 'Pale Tincture', cost: '250 GP', type: 'Ingested', dc: 16, damage: '1d6 Poison', effect: 'Repeat save each 24 hours', description: 'A creature subjected to this poison must succeed on a DC 16 Constitution saving throw or take 3 (1d6) Poison damage and have the Poisoned condition. The Poisoned creature must repeat the save every 24 hours, taking 3 (1d6) Poison damage on a failed save. The poison ends after seven successful saves or a Lesser Restoration spell.' },
    { name: 'Purple Worm Poison', cost: '2,000 GP', type: 'Injury', dc: 19, damage: '12d6 Poison', effect: 'Half damage on success', description: 'A creature subjected to this poison must make a DC 19 Constitution saving throw, taking 42 (12d6) Poison damage on a failed save, or half as much damage on a successful one.' },
    { name: 'Serpent Venom', cost: '200 GP', type: 'Injury', dc: 11, damage: '3d6 Poison', effect: 'Half damage on success', description: 'A creature subjected to this poison must succeed on a DC 11 Constitution saving throw, taking 10 (3d6) Poison damage on a failed save, or half as much damage on a successful one.' },
    { name: 'Torpor', cost: '600 GP', type: 'Ingested', dc: 15, damage: 'None', effect: 'Poisoned and Incapacitated for 4d6 hours', description: 'A creature subjected to this poison must succeed on a DC 15 Constitution saving throw or have the Poisoned condition for 4d6 hours. The Poisoned creature has the Incapacitated condition.' },
    { name: 'Truth Serum', cost: '150 GP', type: 'Ingested', dc: 11, damage: 'None', effect: "Poisoned for 1 hour, can't lie", description: "A creature subjected to this poison must succeed on a DC 11 Constitution saving throw or have the Poisoned condition for 1 hour. The Poisoned creature can't knowingly communicate a lie." },
    { name: 'Wyvern Poison', cost: '1,200 GP', type: 'Injury', dc: 15, damage: '7d6 Poison', effect: 'Half damage on success', description: 'A creature subjected to this poison must make a DC 15 Constitution saving throw, taking 24 (7d6) Poison damage on a failed save, or half as much damage on a successful one.' },
]

let poisonCount = 0
for (const p of poisons) {
    const obj = { ...p, slug: kebab(p.name), category: 'Poison', source: { ...dmgSrc, section: 'Poison' } }
    fs.writeFileSync(path.join(poisonDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    poisonCount++
}

// ── HAZARDS ──
const hazardDir = path.join(ROOT, 'hazards/environmental')
ensureDir(hazardDir)

const hazards = [
    { name: 'Brown Mold', severity: 'Level 5+', description: 'Covers a 10-foot square. Temperature within 30 feet is frigid. Creature entering or starting turn in mold area takes 22 (4d10) Cold damage. Brown Mold is immune to fire, and proximity to fire causes it to expand. Any source of cold damage destroys it in a 5-foot square.' },
    { name: 'Fireball Fungus', severity: 'Level 5+', description: 'These glowing fungi fill a 20-foot square. When disturbed, they release spores that explode. DC 15 Dex save or take 22 (4d10) Fire damage.' },
    { name: 'Green Slime', severity: 'Level 1+', description: 'Drips from ceiling in 5-foot square. DC 10 Dex save to avoid. On contact, 5 (1d10) Acid damage per turn until slime is scraped off (requiring an action). Deals 11 (2d10) Acid damage to wood or metal.' },
    { name: 'Inferno', severity: 'Level 11+', description: 'Extreme heat. Creatures starting turn in fire take 11 (2d10) Fire damage. A strong magical fire fills the area with smoke (Heavily Obscured, Lightly Obscured within 30 feet).' },
    { name: 'Poisonous Gas', severity: 'Level 5+', description: 'Fills a room or corridor. DC 13 Con save at start of each turn or take 10 (3d6) Poison damage. Successful save: half damage.' },
    { name: 'Quicksand Pit', severity: 'Level 1+', description: '10-foot-deep pit of quicksand. DC 10 Dex save to avoid when stepping on it. Creature sinks 1d4+1 feet. DC 11 Str (Athletics) to escape; failure means sinking another 1d4 feet. Fully submerged creature suffocates.' },
    { name: 'Razorvine', severity: 'Level 1+', description: 'Covers 10-foot-square area. Creature entering for first time on a turn takes 5 (1d10) Slashing damage. Can be cut through: AC 11, 25 HP, immune to most damage types.' },
    { name: 'River Styx', severity: 'Level 17+', description: 'Contact with the water (including being splashed) requires DC 20 Int save or creature loses all memories of its past. Only Greater Restoration or Wish can restore them.' },
    { name: 'Rockslide', severity: 'Level 5+', description: 'Fills a 30-foot area. Each creature in area makes DC 15 Dex save. On failure: 22 (4d10) Bludgeoning damage and Prone and Restrained by rubble. Success: half damage, no conditions. DC 15 Athletics to escape rubble.' },
    { name: 'Vicious Vine', severity: 'Level 5+', description: 'Fills a 20-foot square. When creature enters, vines make +8 melee attack. Hit: 11 (2d10) Slashing damage and creature is Restrained. DC 15 Athletics or Acrobatics to escape. AC 12, 25 HP per 5-foot section.' },
    { name: 'Webs', severity: 'Level 1+', description: 'Fills a 20-foot cube. Lightly Obscured and Difficult Terrain. DC 12 Dex save to avoid Restrained condition when entering. DC 12 Athletics or Acrobatics to escape. Webs are flammable: 5-foot cube burns in 1 round, deals 5 (1d10) Fire damage to any creature in it.' },
    { name: 'Yellow Mold', severity: 'Level 1+', description: 'Covers a 5-foot square. When touched, releases spores in 10-foot cube. DC 15 Con save or take 11 (2d10) Poison damage and be Poisoned for 1 minute. Repeat save each turn. Destroyed by sunlight or fire (5+ damage).' },
]

let hazardCount = 0
for (const h of hazards) {
    const obj = { ...h, slug: kebab(h.name), category: 'Hazard', source: { ...dmgSrc, section: 'Hazards' } }
    fs.writeFileSync(path.join(hazardDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    hazardCount++
}

// ── SIEGE EQUIPMENT ──
const siegeDir = path.join(ROOT, 'equipment/items/siege-equipment')
ensureDir(siegeDir)

const siege = [
    { name: 'Ballista', ac: 15, hp: 50, attack: '+6, range 120/480 ft.', damage: '16 (3d10) Piercing', description: 'Requires Load and Aim actions before firing. Large object.' },
    { name: 'Cannon', ac: 19, hp: 75, attack: '+6, range 600/2,400 ft.', damage: '44 (8d10) Bludgeoning', description: 'Requires Load and Aim actions. Large object.' },
    { name: 'Flamethrower Coach', ac: 19, hp: 100, attack: 'DC 15 Dex save', damage: '31 (7d8) Fire', description: '60-foot-long, 5-foot-wide Line. A flammable object hit by this ignites.' },
    { name: 'Keg Launcher', ac: 15, hp: 30, attack: 'DC 15 Con save', damage: 'Poisoned for 1 minute', description: 'Requires Load and Aim. Launches a toxic keg that creates 20-foot-radius sphere. Creatures in area must save or be Poisoned.' },
    { name: 'Lightning Cannon', ac: 19, hp: 30, attack: '+6, range 300/1,200 ft.', damage: '22 (4d10) Lightning', description: 'Requires Aim only. Creates secondary damage: each creature within 10 feet of target makes DC 15 Dex save or takes 11 (2d10) Lightning.' },
    { name: 'Mangonel', ac: 15, hp: 100, attack: "+5, range 200/800 ft. (can't hit targets within 60 ft.)", damage: '27 (5d10) Bludgeoning', description: 'Requires Load and Aim. Large object.' },
    { name: 'Ram', ac: 15, hp: 100, attack: '+8, reach 5 ft.', damage: '16 (3d10) Bludgeoning', description: 'Requires Position action. Deals double damage to objects and structures.' },
    { name: 'Siege Tower', ac: 15, hp: 200, attack: 'N/A', damage: 'N/A', description: 'Mobile tower providing cover. Huge object. Speed 15 ft. when pushed by its crew. Creatures inside have Total Cover.' },
    { name: 'Suspended Cauldron', ac: 19, hp: 20, attack: 'DC 15 Dex save', damage: '10 (3d6) Fire', description: 'Requires a Full Cauldron. Spills hot oil in 10-foot-square area. Creatures in area take damage, and the area is Difficult Terrain for 10 minutes.' },
    { name: 'Trebuchet', ac: 15, hp: 150, attack: "+5, range 300/1,200 ft. (can't hit within 60 ft.)", damage: '44 (8d10) Bludgeoning', description: 'Requires Load and Aim. Huge object.' },
]

let siegeCount = 0
for (const s of siege) {
    const obj = { ...s, slug: kebab(s.name), category: 'Siege Equipment', source: { ...dmgSrc, section: 'Siege Equipment' } }
    fs.writeFileSync(path.join(siegeDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    siegeCount++
}

// ── SUPERNATURAL GIFTS ──
const giftDir = path.join(ROOT, 'character/supernatural-gifts')
ensureDir(giftDir)

const blessings = [
    { name: 'Blessing of Health', type: 'Blessing', description: 'Your Constitution score increases by 2, to a maximum of 22.' },
    { name: 'Blessing of Magic Resistance', type: 'Blessing', description: 'You have Advantage on saving throws against spells.' },
    { name: 'Blessing of Protection', type: 'Blessing', description: 'You gain a +1 bonus to AC and saving throws.' },
    { name: 'Blessing of Understanding', type: 'Blessing', description: 'Your Wisdom score increases by 2, to a maximum of 22.' },
    { name: 'Blessing of Valhalla', type: 'Blessing', description: 'The blessing has 3 charges. As a Magic action, you can expend 1 charge to cast Conjure Animals (as 3rd-level spell). A charge is also expended if you die; you return to life at the start of your next turn with full HP.' },
    { name: 'Blessing of Weapon Enhancement', type: 'Blessing', description: 'One nonmagical weapon in your possession becomes a +1 weapon whenever you wield it.' },
    { name: 'Blessing of Wound Closure', type: 'Blessing', description: 'When you are Unconscious and make a Death Saving Throw, you succeed on a roll of 6 or higher. Also, whenever you roll Hit Dice to regain HP, double the number of HP restored.' },
]

const charms = [
    { name: 'Charm of Animal Conjuring', type: 'Charm', charges: 3, description: 'This charm has 3 charges. As a Magic action, you can expend 1 charge to cast Conjure Animals (as 3rd-level spell). Once all charges are used, the charm vanishes.' },
    { name: 'Charm of Darkvision', type: 'Charm', charges: 3, description: 'This charm has 3 charges. As a Magic action, you can expend 1 charge to cast Darkvision. Once all charges are used, the charm vanishes.' },
    { name: 'Charm of Feather Falling', type: 'Charm', charges: 3, description: 'This charm has 3 charges. When you would take Falling damage, you can expend 1 charge to cast Feather Fall on yourself (no action required). Once all charges are used, the charm vanishes.' },
    { name: 'Charm of Heroism', type: 'Charm', charges: 3, description: 'This charm has 3 charges. As a Magic action, you can expend 1 charge to cast Heroism (as 2nd-level spell). Once all charges are used, the charm vanishes.' },
    { name: 'Charm of Restoration', type: 'Charm', charges: 3, description: 'This charm has 3 charges. As a Magic action, you can expend 1 charge to cast Greater Restoration. Once all charges are used, the charm vanishes.' },
    { name: 'Charm of the Slayer', type: 'Charm', charges: 3, description: 'This charm has 3 charges. When you hit a creature with an attack roll using a weapon, you can expend 1 charge to deal an extra 2d10 Radiant damage to the target. Once all charges are used, the charm vanishes.' },
    { name: 'Charm of Vitality', type: 'Charm', charges: 3, description: 'This charm has 3 charges. As a Bonus Action, you can expend 1 charge to regain 2d4 + 2 Hit Points. Once all charges are used, the charm vanishes.' },
]

let giftCount = 0
for (const g of [...blessings, ...charms]) {
    const obj = { ...g, slug: kebab(g.name), source: { ...dmgSrc, section: 'Supernatural Gifts' } }
    fs.writeFileSync(path.join(giftDir, `${obj.slug}.json`), JSON.stringify(obj, null, 2))
    giftCount++
}

console.log(`✅ Extracted: ${poisonCount} poisons, ${hazardCount} hazards, ${siegeCount} siege, ${giftCount} gifts`)
console.log(`   Total: ${poisonCount + hazardCount + siegeCount + giftCount} items`)

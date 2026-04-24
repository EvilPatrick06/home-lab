/**
 * ULTIMATE D&D 5.5e DATA AUDIT
 * Cross-references Research Notes architecture spec, every source markdown,
 * deep content validation, truncation detection, CR sanity, duplicates,
 * schema validation, and more.
 */
import fs from 'fs'
import path from 'path'

const DATA = path.join(process.cwd(), 'src/renderer/public/data/5e')
const PHB = path.join(process.cwd(), '5.5e References/PHB2024/markdown')
const DMG = path.join(process.cwd(), '5.5e References/DMG2024/markdown')
const MM = path.join(process.cwd(), '5.5e References/MM2025/markdown')
const REPORT = path.join(process.cwd(), 'audit-report.md')

type Sev = 'CRITICAL' | 'WARNING' | 'INFO'
interface Issue { sev: Sev; src: string; cat: string; msg: string; file?: string }
const issues: Issue[] = []
const stats: Record<string, number> = {}
function bump(k: string, n = 1) { stats[k] = (stats[k] || 0) + n }
function add(sev: Sev, src: string, cat: string, msg: string, file?: string) {
    issues.push({ sev, src, cat, msg, file }); bump(sev)
}
function kebab(s: string) {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}
function isKebab(s: string) { return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) }
function allJson(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    const r: string[] = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name)
        if (e.isDirectory()) r.push(...allJson(f))
        else if (e.name.endsWith('.json')) r.push(f)
    }
    return r
}
function allDirs(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    const r: string[] = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { r.push(path.join(dir, e.name)); r.push(...allDirs(path.join(dir, e.name))) }
    }
    return r
}
function countJson(dir: string): number { return allJson(dir).length }
function findJson(dir: string, slug: string): string | null {
    for (const f of allJson(dir)) { if (path.basename(f, '.json') === slug) return f }
    return null
}
function parse(file: string): any {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return null }
}
function rel(file: string) { return file.replace(DATA + path.sep, '').replace(/\\/g, '/') }
function headings(file: string, lvl: string) {
    if (!fs.existsSync(file)) return [] as { line: number; text: string }[]
    const pfx = lvl + ' '
    return fs.readFileSync(file, 'utf-8').split('\n')
        .map((l, i) => ({ line: i + 1, text: l.replace(/\r/g, '').trim() }))
        .filter(l => l.text.startsWith(pfx))
        .map(l => ({ line: l.line, text: l.text.slice(pfx.length).trim() }))
}
function wordCount(s: string) { return s ? s.split(/\s+/).filter(Boolean).length : 0 }

console.log('═══════════════════════════════════════════════════')
console.log('  ULTIMATE D&D 5.5e DATA AUDIT')
console.log('═══════════════════════════════════════════════════')

// ═══════════════════════════════════════════════════════════════
// SECTION 1: FILE & DIRECTORY INTEGRITY
// ═══════════════════════════════════════════════════════════════
console.log('\n[1/12] File & directory integrity...')
const allFiles = allJson(DATA)
const allDirList = allDirs(DATA)
bump('totalFiles', allFiles.length)
bump('totalDirs', allDirList.length)

for (const file of allFiles) {
    const r = rel(file)
    const st = fs.statSync(file)
    if (st.size === 0) { add('CRITICAL', r, 'Zero-Byte', 'File is 0 bytes', r); bump('zeroBytes'); continue }
    const d = parse(file)
    if (!d) { add('CRITICAL', r, 'Invalid JSON', 'Not valid JSON', r); bump('invalidJson'); continue }
    if (d.error) { add('CRITICAL', r, 'Error Placeholder', `error: "${d.error}"`, r); bump('errorPlaceholders'); continue }
    if (st.size < 10) { add('CRITICAL', r, 'Trivial File', `Only ${st.size} bytes`, r); continue }
    const bn = path.basename(file, '.json')
    if (!isKebab(bn)) { add('WARNING', r, 'Naming', `"${bn}" not kebab-case`, r); bump('namingIssues') }
}

for (const dir of allDirList) {
    if (countJson(dir) === 0) {
        const rd = dir.replace(DATA + path.sep, '').replace(/\\/g, '/')
        add('WARNING', rd, 'Empty Directory', '0 JSON files', rd)
        bump('emptyDirs')
    }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: RESEARCH NOTES ARCHITECTURE SPEC
// ═══════════════════════════════════════════════════════════════
console.log('[2/12] Research Notes architecture spec validation...')

const specDirs: [string, string][] = [
    ['origins/species', 'Species should be here per spec'],
    ['origins/backgrounds', 'Backgrounds should be here per spec'],
    ['origins/species/*/lineages', 'Species lineages (e.g. elf/lineages/high-elf.json)'],
    ['character/supernatural-gifts', 'Non-leveling boons from entities'],
    ['character/supernatural-gifts/tattoos', 'Magical tattoos'],
    ['character/spellbooks', 'Wizard spellbook items'],
    ['character/companions/pets', 'Pet companions'],
    ['character/companions/mounts', 'Mount companions'],
    ['character/companions/hirelings', 'Hireling companions'],
    ['classes/subclasses', 'Subclass files per class'],
    ['game/mechanics', 'Core game mechanics'],
    ['game/mechanics/status-effects/conditions', 'Condition effects'],
    ['game/mechanics/status-effects/buffs', 'Buff effects'],
    ['game/mechanics/status-effects/madness', 'Madness effects'],
    ['game/mechanics/tool-properties', 'Tool synergy math'],
    ['game/mechanics/skills', 'Skill definitions'],
    ['game/mechanics/damage-types', 'Damage type definitions'],
    ['game/mechanics/time', 'Round/rest timing'],
    ['game/mechanics/adventuring-rules', 'Falling, vision, social'],
    ['game/mechanics/combat-rules', 'Grappling, cover, etc.'],
    ['game/mechanics/economy', 'Currency, lifestyle, starting wealth'],
    ['game/mechanics/character-advancement', 'XP thresholds, proficiency'],
    ['game/mechanics/afflictions/curses', 'Curse effects'],
    ['game/mechanics/downtime', 'Downtime activities'],
    ['game/mechanics/chases', 'Chase mechanics'],
    ['game/mechanics/crafting', 'Crafting formulas'],
    ['game/mechanics/weapon-properties', 'Reload, Heavy, etc.'],
    ['game/mechanics/variant-rules', 'Optional rule overrides'],
    ['equipment/bundles', 'Item packs (Dungeoneer\'s Pack)'],
    ['equipment/items/spell-components', 'High-cost consumable components'],
    ['equipment/items/spellcasting-foci', 'Arcane/Druidic/Holy foci'],
    ['equipment/items/poisons/contact', 'Contact poisons'],
    ['equipment/items/poisons/ingested', 'Ingested poisons'],
    ['equipment/items/poisons/inhaled', 'Inhaled poisons'],
    ['equipment/items/poisons/injury', 'Injury poisons'],
    ['equipment/items/ammunition', 'Ammo types'],
    ['equipment/recipes', 'Crafting recipes'],
    ['equipment/weapons/masteries', '8 weapon mastery properties (2024)'],
    ['equipment/weapons/siege', 'Siege weapons'],
    ['equipment/weapons/firearms/renaissance', 'Renaissance firearms'],
    ['equipment/weapons/firearms/modern', 'Modern firearms'],
    ['equipment/weapons/firearms/futuristic', 'Futuristic firearms'],
    ['equipment/weapons/explosives/renaissance', 'Renaissance explosives'],
    ['equipment/magic-items/artifacts', 'Artifact-rarity items'],
    ['equipment/magic-items/cursed-items', 'Cursed magic items'],
    ['equipment/magic-items/sentient-items', 'Sentient magic items'],
    ['equipment/magic-items/consumables/potions', 'Consumable potions'],
    ['equipment/magic-items/consumables/scrolls', 'Spell scrolls'],
    ['dm/loot-tables', 'Loot generation tables'],
    ['dm/shops', 'Shop inventories'],
    ['dm/npcs/townsfolk', 'Non-combat NPCs'],
    ['dm/npcs/custom-monsters', 'DM homebrew creatures'],
    ['dm/npcs/sentient-items', 'Sentient weapon souls'],
    ['dm/npcs/templates', 'Stat block modifiers (zombie, half-dragon)'],
    ['dm/rewards/marks-of-prestige', 'Titles, lands, letters'],
    ['dm/adventures/campaigns', 'Campaign data'],
    ['dm/adventures/one-shots', 'One-shot adventures'],
    ['dm/adventures/encounters/combat', 'Combat encounters'],
    ['dm/adventures/encounters/social', 'Social encounters'],
    ['dm/adventures/encounters/puzzles', 'Puzzle encounters'],
    ['dm/adventures/encounters/lairs', 'Monster lair actions'],
    ['world/factions', 'Guilds, cults, kingdoms'],
    ['world/deities/pantheons', 'Deity pantheons'],
    ['world/scripts', 'Written alphabets'],
    ['hazards/diseases', 'Biological diseases'],
    ['rules/downtime/bastions/facilities/basic', 'Basic bastion facilities'],
    ['rules/downtime/bastions/facilities/special', 'Special bastion facilities'],
]

const specFiles: [string, string][] = [
    ['game/mechanics/ability-scores.json', 'Core stat math'],
    ['game/mechanics/inspiration.json', 'Heroic Inspiration'],
    ['game/mechanics/spell-geometries.json', 'AoE shape math'],
    ['game/mechanics/senses.json', 'Vision math'],
    ['game/mechanics/healing.json', 'Hit Dice/rest recovery'],
    ['game/mechanics/movement-types.json', 'Swim/Fly/Burrow/Climb math'],
    ['game/mechanics/encounter-building.json', 'XP budget/CR math'],
    ['game/mechanics/harvesting.json', 'Monster parts extraction'],
    ['game/mechanics/falling.json', 'Fall damage variants'],
    ['game/mechanics/vehicle-mishaps.json', 'Vehicle critical damage'],
    ['game/mechanics/light-sources.json', 'Light radii definitions'],
    ['game/mechanics/combat-rules/death-saves.json', 'Death save math'],
    ['game/mechanics/combat-rules/mounted-combat.json', 'Mounted rules'],
    ['game/mechanics/combat-rules/underwater-combat.json', 'Underwater rules'],
    ['game/mechanics/combat-rules/action-options.json', 'Generic actions'],
    ['game/mechanics/crafting/magic-item-crafting.json', 'DMG enchanting'],
    ['game/mechanics/skills/passive-skills.json', 'Passive detection'],
    ['game/mechanics/variant-rules/attunement-limits.json', 'Attunement variant'],
    ['game/mechanics/variant-rules/lingering-injuries.json', 'Injury variant'],
    ['game/mechanics/variant-rules/massive-damage.json', 'Massive damage variant'],
    ['game/mechanics/variant-rules/spell-points.json', 'Spell points variant'],
    ['game/mechanics/variant-rules/rest-variants.json', 'Gritty/Epic rest'],
    ['game/mechanics/variant-rules/flanking.json', 'Flanking rules'],
    ['game/mechanics/variant-rules/facing.json', 'Facing rules'],
    ['game/mechanics/variant-rules/cleaving.json', 'Cleave damage'],
    ['game/mechanics/variant-rules/encumbrance.json', 'Weight penalties'],
    ['game/mechanics/variant-rules/initiative.json', 'Alt initiative'],
    ['game/mechanics/variant-rules/destructible-cover.json', 'Cover HP'],
    ['game/mechanics/variant-rules/disarm.json', 'Disarm action'],
    ['game/mechanics/variant-rules/overrun.json', 'Overrun movement'],
    ['game/mechanics/variant-rules/tumble.json', 'Tumble movement'],
    ['world/lore/alignments.json', 'Cosmic morality definitions'],
    ['character/faction-status.json', 'Renown tracking'],
]

for (const [dir, desc] of specDirs) {
    if (dir.includes('*')) continue // wildcards need special handling
    const full = path.join(DATA, dir)
    if (!fs.existsSync(full)) {
        add('WARNING', 'Spec: ' + dir, 'Missing Spec Directory', `"${dir}" required by Research Notes but does not exist. Purpose: ${desc}`)
        bump('missingSpecDirs')
    } else if (countJson(full) === 0) {
        add('WARNING', 'Spec: ' + dir, 'Empty Spec Directory', `"${dir}" exists but has 0 JSON files. Purpose: ${desc}`)
        bump('emptySpecDirs')
    } else {
        add('INFO', 'Spec: ' + dir, 'Spec Directory OK', `${countJson(full)} JSON files. Purpose: ${desc}`)
    }
}

for (const [file, desc] of specFiles) {
    const full = path.join(DATA, file)
    if (!fs.existsSync(full)) {
        add('WARNING', 'Spec: ' + file, 'Missing Spec File', `"${file}" required by Research Notes. Purpose: ${desc}`)
        bump('missingSpecFiles')
    } else {
        const st = fs.statSync(full)
        if (st.size < 10) add('WARNING', 'Spec: ' + file, 'Trivial Spec File', `Only ${st.size} bytes. Purpose: ${desc}`)
        else add('INFO', 'Spec: ' + file, 'Spec File OK', `${st.size} bytes`)
    }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: SCHEMA VALIDATION (per-category required fields)
// ═══════════════════════════════════════════════════════════════
console.log('[3/12] Schema validation...')

const schemas: Record<string, { req: string[]; dir: string }> = {
    'Class': { req: ['name', 'description', 'coreTraits'], dir: 'classes' },
    'Feat': { req: ['name', 'slug', 'category', 'description'], dir: 'feats' },
    'Spell': { req: ['name', 'level', 'school', 'description'], dir: 'spells' },
    'Rule-Glossary': { req: ['name', 'slug', 'description'], dir: 'rules/glossary' },
    'Condition': { req: ['name', 'slug', 'description'], dir: 'rules/conditions' },
    'Bastion': { req: ['name', 'slug', 'description'], dir: 'rules/bastions/facilities' },
    'Plane': { req: ['name', 'slug', 'category', 'description'], dir: 'world/planes' },
    'Lore': { req: ['name', 'slug', 'description'], dir: 'world/lore' },
    'Language': { req: ['name', 'slug'], dir: 'world/languages' },
    'Hazard-Env': { req: ['name', 'description'], dir: 'hazards/environmental' },
    'Hazard-Trap': { req: ['name', 'description'], dir: 'hazards/traps' },
    'Gemstone': { req: ['name', 'slug', 'value'], dir: 'equipment/gemstones' },
    'Art-Object': { req: ['name', 'slug', 'value'], dir: 'equipment/art-objects' },
    'Trade-Bar': { req: ['name', 'slug', 'value'], dir: 'equipment/trade-bars' },
    'Trade-Good': { req: ['name', 'slug', 'cost'], dir: 'equipment/trade-goods' },
}

// Monster schema
for (const mt of ['aberration', 'beast', 'celestial', 'celestial-or-fiend', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead']) {
    schemas['Monster-' + mt] = { req: ['name', 'slug', 'size', 'type', 'ac', 'hp', 'speed', 'abilityScores', 'actions'], dir: 'monsters/' + mt }
}

// Magic item schemas by rarity
for (const r of ['common', 'uncommon', 'rare', 'legendary', 'artifact', 'other', 'varies']) {
    schemas['MI-' + r] = { req: ['name', 'slug', 'type', 'rarity', 'description'], dir: 'equipment/magic-items/' + r }
}

for (const [label, s] of Object.entries(schemas)) {
    for (const file of allJson(path.join(DATA, s.dir))) {
        const d = parse(file); if (!d || d.error) continue
        const r2 = rel(file)
        for (const f of s.req) {
            const v = d[f]
            if (v === undefined || v === null) { add('WARNING', label, 'Missing Field', `"${f}" missing`, r2); bump('missingFields') }
            else if (typeof v === 'string' && v === '' && f !== 'prerequisite') { add('WARNING', label, 'Empty Field', `"${f}" empty`, r2); bump('emptyFields') }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: CONTENT DEPTH — MONSTER DESCRIPTION CHECK
// ═══════════════════════════════════════════════════════════════
console.log('[4/12] Content depth checks...')

let monstersNoDesc = 0, monstersShortLore = 0, spellsShortDesc = 0
for (const file of allJson(path.join(DATA, 'monsters'))) {
    const d = parse(file); if (!d || d.error) continue
    if (!d.description || d.description.length < 10) monstersNoDesc++
    if (d.lore && wordCount(d.lore) < 20) monstersShortLore++
}
if (monstersNoDesc > 0) add('WARNING', 'Monsters', 'Empty Descriptions', `${monstersNoDesc} monsters have empty/missing description field`)
if (monstersShortLore > 0) add('INFO', 'Monsters', 'Short Lore', `${monstersShortLore} monsters have lore < 20 words`)

for (const file of allJson(path.join(DATA, 'spells'))) {
    const d = parse(file); if (!d || d.error) continue
    if (d.description && wordCount(d.description) < 15) { spellsShortDesc++; add('INFO', 'Spells', 'Short Description', `"${d.name}" description only ${wordCount(d.description)} words`, rel(file)) }
}

// Spell metadata completeness
let spellsMissingComponents = 0, spellsMissingDuration = 0, spellsMissingRange = 0
for (const file of allJson(path.join(DATA, 'spells'))) {
    const d = parse(file); if (!d || d.error) continue
    if (!d.components) spellsMissingComponents++
    if (!d.duration) spellsMissingDuration++
    if (!d.range) spellsMissingRange++
}
if (spellsMissingComponents) add('WARNING', 'Spells', 'Missing Components', `${spellsMissingComponents} spells missing components object`)
if (spellsMissingDuration) add('WARNING', 'Spells', 'Missing Duration', `${spellsMissingDuration} spells missing duration object`)
if (spellsMissingRange) add('WARNING', 'Spells', 'Missing Range', `${spellsMissingRange} spells missing range object`)

// Class deep validation
const classNames = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard']
for (const cn of classNames) {
    const file = path.join(DATA, 'classes', cn + '.json')
    if (!fs.existsSync(file)) { add('CRITICAL', 'PHB Classes', 'Missing Class', `${cn}.json not found`); continue }
    const st = fs.statSync(file)
    if (st.size < 100) { add('CRITICAL', 'PHB Classes', 'Empty Class', `${cn}.json only ${st.size} bytes`, rel(file)); continue }
    const d = parse(file); if (!d) continue
    if (!d.subclasses && !d.subClasses) add('WARNING', 'PHB Classes', 'Missing Subclasses', `${cn} has no subclasses array`, rel(file))
    if (!d.classFeatures && !d.features && !d.levelFeatures) add('WARNING', 'PHB Classes', 'Missing Features', `${cn} has no class features`, rel(file))
    if (d.description && wordCount(d.description) < 50) add('WARNING', 'PHB Classes', 'Short Description', `${cn} description only ${wordCount(d.description)} words`, rel(file))
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5: MONSTER CR SANITY CHECK
// ═══════════════════════════════════════════════════════════════
console.log('[5/12] Monster CR sanity checks...')

for (const file of allJson(path.join(DATA, 'monsters'))) {
    const d = parse(file); if (!d || d.error) continue
    const crStr = String(d.cr || '')
    const crMatch = crStr.match(/^(\d+(?:\/\d+)?)/)
    if (!crMatch) continue
    const cr = crMatch[1].includes('/') ? eval(crMatch[1]) : parseFloat(crMatch[1])
    const hp = parseInt(String(d.hp || '0'))
    const ac = parseInt(String(d.ac || '0'))
    // Sanity: CR 10+ should have HP > 50
    if (cr >= 10 && hp < 50 && hp > 0) add('WARNING', 'CR Sanity', 'Low HP for CR', `${d.name} CR ${cr} but HP=${hp}`, rel(file))
    // CR 20+ should have HP > 150
    if (cr >= 20 && hp < 150 && hp > 0) add('WARNING', 'CR Sanity', 'Very Low HP for CR', `${d.name} CR ${cr} but HP=${hp}`, rel(file))
    // AC sanity: should be 10-25 for most
    if (ac > 0 && (ac < 5 || ac > 30)) add('INFO', 'CR Sanity', 'Unusual AC', `${d.name} AC=${ac}`, rel(file))
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════════
console.log('[6/12] Duplicate detection...')

const fileMap = new Map<string, string[]>()
for (const f of allFiles) {
    const bn = path.basename(f)
    if (!fileMap.has(bn)) fileMap.set(bn, [])
    fileMap.get(bn)!.push(f)
}
let dupCount = 0
for (const [bn, paths] of fileMap) {
    if (paths.length > 1) {
        dupCount++
        const locs = paths.map(p => rel(p)).join(' | ')
        add('WARNING', 'Duplicates', 'Duplicate File', `"${bn}" in ${paths.length} locations: ${locs}`)
    }
}
bump('duplicates', dupCount)

// ═══════════════════════════════════════════════════════════════
// SECTION 7: dm/npcs vs monsters COMPARISON
// ═══════════════════════════════════════════════════════════════
console.log('[7/12] dm/npcs vs monsters comparison...')

const dmNpcFiles = allJson(path.join(DATA, 'dm/npcs'))
const monsterFiles = allJson(path.join(DATA, 'monsters'))
let dmMoreComplete = 0, monstersMoreComplete = 0, identical = 0

for (const [bn, paths] of fileMap) {
    if (paths.length < 2) continue
    const dmPath = paths.find(p => p.includes('dm' + path.sep + 'npcs'))
    const monPath = paths.find(p => p.includes('monsters' + path.sep) && !p.includes('dm' + path.sep))
    if (!dmPath || !monPath) continue
    const dmData = parse(dmPath)
    const monData = parse(monPath)
    if (!dmData || !monData) continue
    const dmSize = fs.statSync(dmPath).size
    const monSize = fs.statSync(monPath).size
    if (Math.abs(dmSize - monSize) < 50) { identical++ }
    else if (dmSize > monSize * 1.2) { dmMoreComplete++; add('INFO', 'DM vs Monsters', `dm/npcs more complete`, `${bn}: dm=${dmSize}b vs monsters=${monSize}b`) }
    else if (monSize > dmSize * 1.2) { monstersMoreComplete++ }
}
add('INFO', 'DM vs Monsters', 'Comparison Summary', `Of shared files: ${identical} identical, ${dmMoreComplete} dm/npcs more complete, ${monstersMoreComplete} monsters/ more complete`)

// ═══════════════════════════════════════════════════════════════
// SECTION 8: SOURCE CROSS-REFERENCE — PHB
// ═══════════════════════════════════════════════════════════════
console.log('[8/12] PHB source cross-reference...')

// Species
for (const sp of ['Aasimar', 'Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling']) {
    const f = findJson(path.join(DATA, 'character/species'), kebab(sp))
    if (!f) add('CRITICAL', 'PHB Species', 'Missing', `Species "${sp}" not found`)
    else { const d = parse(f); if (d && (!d.traits || d.traits.length === 0)) add('WARNING', 'PHB Species', 'No Traits', `${sp} has empty traits`, rel(f)) }
}
// Also check spec location
add('INFO', 'PHB Species', 'Spec Note', 'Research Notes says species should be at origins/species/ but data is at character/species/')

// Backgrounds
for (const bg of ['Acolyte', 'Artisan', 'Charlatan', 'Criminal', 'Entertainer', 'Farmer', 'Guard', 'Guide', 'Hermit', 'Merchant', 'Noble', 'Sage', 'Sailor', 'Scribe', 'Soldier', 'Wayfarer']) {
    const f = findJson(path.join(DATA, 'character/backgrounds'), kebab(bg))
    if (!f) add('CRITICAL', 'PHB Backgrounds', 'Missing', `Background "${bg}" not found`)
}
add('INFO', 'PHB Backgrounds', 'Spec Note', 'Research Notes says backgrounds at origins/backgrounds/ but data at character/backgrounds/')

// Feats — read source headings
const featSrc = fs.readFileSync(path.join(PHB, '05-feats.md'), 'utf-8')
const featH4 = headings(path.join(PHB, '05-feats.md'), '####')
for (const h of featH4) {
    const slug = kebab(h.text)
    if (!findJson(path.join(DATA, 'feats'), slug)) {
        add('WARNING', 'PHB Feats', 'Missing Feat', `"${h.text}" (${slug}) not found`)
        bump('missingFromSource')
    }
}

// Spells — count extracted
const totalSpells = countJson(path.join(DATA, 'spells'))
add('INFO', 'PHB Spells', 'Count', `${totalSpells} total extracted spells (2024 PHB has ~400)`)
if (totalSpells < 380) add('WARNING', 'PHB Spells', 'Low Count', `Only ${totalSpells} spells, expected ~400`)

// Important spells spot-check
for (const sp of ['fireball', 'magic-missile', 'shield', 'heal', 'wish', 'counterspell', 'eldritch-blast', 'cure-wounds', 'detect-magic', 'dispel-magic', 'teleport', 'resurrection', 'meteor-swarm', 'power-word-kill', 'true-polymorph', 'thunderwave', 'misty-step', 'haste', 'fly', 'revivify', 'banishment', 'dimension-door', 'wall-of-force', 'disintegrate', 'forcecage', 'simulacrum', 'clone', 'gate', 'time-stop']) {
    if (!findJson(path.join(DATA, 'spells'), sp)) add('WARNING', 'PHB Spells', 'Missing Key Spell', `"${sp}" not found`)
}

// Equipment
const phb06 = fs.readFileSync(path.join(PHB, '06-equipment.md'), 'utf-8')
const weaponCount = countJson(path.join(DATA, 'equipment/weapons'))
const armorCount = countJson(path.join(DATA, 'equipment/armor'))
const toolCount = countJson(path.join(DATA, 'equipment/tools'))
add('INFO', 'PHB Equipment', 'Counts', `weapons=${weaponCount}, armor=${armorCount}, tools=${toolCount}`)

// Weapon masteries check
const masteryDir = path.join(DATA, 'equipment/weapons/masteries')
const masteryCount = countJson(masteryDir)
if (masteryCount === 0) add('WARNING', 'PHB Equipment', 'No Weapon Masteries', `equipment/weapons/masteries/ has 0 files — 2024 PHB has 8 mastery properties`)

// Rules glossary + conditions
const glossaryCount = countJson(path.join(DATA, 'rules/glossary'))
const condCount = countJson(path.join(DATA, 'rules/conditions'))
add('INFO', 'PHB Rules', 'Counts', `glossary=${glossaryCount}, conditions=${condCount}`)

// ═══════════════════════════════════════════════════════════════
// SECTION 9: SOURCE CROSS-REFERENCE — DMG
// ═══════════════════════════════════════════════════════════════
console.log('[9/12] DMG source cross-reference...')

// Magic items from each source file
const miFiles = ['ch7-magic-items-a-b.md', 'ch7-magic-items-c-d.md', 'ch7-magic-items-e-h.md', 'ch7-magic-items-i-o.md', 'ch7-magic-items-p-r.md', 'ch7-magic-items-s-z.md']
let totalSrcMI = 0
for (const mf of miFiles) {
    const h = headings(path.join(DMG, mf), '##')
    totalSrcMI += h.length
    for (const item of h) {
        const slug = kebab(item.text)
        if (!findJson(path.join(DATA, 'equipment/magic-items'), slug)) {
            add('WARNING', 'DMG Magic Items', 'Missing', `"${item.text}" (${slug}) not found in any rarity dir`)
            bump('missingFromSource')
        }
    }
}
const totalExtractedMI = countJson(path.join(DATA, 'equipment/magic-items'))
add('INFO', 'DMG Magic Items', 'Counts', `Source ## headings: ${totalSrcMI}. Total extracted (all dirs): ${totalExtractedMI}`)

// Planes
const planeCount = countJson(path.join(DATA, 'world/planes'))
add('INFO', 'DMG Cosmology', 'Planes', `${planeCount} planes extracted`)

// Lore glossary
const loreH = headings(path.join(DMG, 'appendix-a-lore-glossary.md'), '###')
const loreCount = countJson(path.join(DATA, 'world/lore'))
add('INFO', 'DMG Lore', 'Counts', `Source: ${loreH.length} headings, Extracted: ${loreCount}`)
if (loreCount < loreH.length) add('WARNING', 'DMG Lore', 'Gap', `${loreH.length - loreCount} lore entries may be missing`)

// Bastion facilities
const bastionCount = countJson(path.join(DATA, 'rules/bastions/facilities'))
add('INFO', 'DMG Bastions', 'Count', `${bastionCount} facilities extracted`)

// Treasure
const gemCount = countJson(path.join(DATA, 'equipment/gemstones'))
const artCount = countJson(path.join(DATA, 'equipment/art-objects'))
add('INFO', 'DMG Treasure', 'Counts', `gemstones=${gemCount}, art-objects=${artCount}, trade-bars=${countJson(path.join(DATA, 'equipment/trade-bars'))}, trade-goods=${countJson(path.join(DATA, 'equipment/trade-goods'))}`)

// Unextracted DMG sections
for (const [ch, desc, tables] of [
    ['ch2-running-the-game.md', 'Running the Game — encounter tables, DM reference', 'dm/encounter-tables/'],
    ['ch4-creating-adventures.md', 'Creating Adventures — adventure hooks, reward tables', 'dm/adventure-tables/'],
    ['ch5-creating-campaigns.md', 'Creating Campaigns — Greyhawk Gazetteer, campaign tables', 'world/locations/greyhawk/'],
    ['ch7-magic-item-rules.md', 'Magic Item Rules — Arcana/Armaments/Implements/Relics tables', 'dm/loot-tables/'],
] as [string, string, string][]) {
    const content = fs.readFileSync(path.join(DMG, ch), 'utf-8')
    const tableRows = (content.match(/^\|/gm) || []).length
    if (tableRows > 20) {
        add('WARNING', 'DMG ' + ch, 'Unextracted Tables', `${tableRows} table rows. ${desc}. Suggested: ${tables}`)
        bump('unextracted')
    }
}

// Greyhawk check
const ch5Content = fs.readFileSync(path.join(DMG, 'ch5-creating-campaigns.md'), 'utf-8')
if (ch5Content.includes('Greyhawk')) {
    add('WARNING', 'DMG Ch5 Greyhawk', 'Unextracted', `Greyhawk Gazetteer not extracted to world/locations/`)
    bump('unextracted')
}

// Bastion events
const ch8Content = fs.readFileSync(path.join(DMG, 'ch8-bastions.md'), 'utf-8')
if (ch8Content.includes('Bastion Event')) {
    add('WARNING', 'DMG Ch8 Bastions', 'Unextracted Events', `Bastion Events section not extracted. Suggested: rules/bastions/events/`)
    bump('unextracted')
}

// ═══════════════════════════════════════════════════════════════
// SECTION 10: SOURCE CROSS-REFERENCE — MONSTER MANUAL
// ═══════════════════════════════════════════════════════════════
console.log('[10/12] MM source cross-reference...')

const bestiaryDir = path.join(MM, 'Bestiary')
const bestiaryFiles = fs.readdirSync(bestiaryDir).filter(f => f.endsWith('.md'))
const typePat = /^\*[A-Z].*?(Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead)/
let totalSrcBlocks = 0, totalSrcLore = 0, missingCreatures = 0

for (const bf of bestiaryFiles) {
    const content = fs.readFileSync(path.join(bestiaryDir, bf), 'utf-8')
    const lines = content.split('\n')
    const h3 = headings(path.join(bestiaryDir, bf), '###')
    for (const h of h3) {
        const idx = lines.findIndex(l => l.trim() === '### ' + h.text)
        if (idx === -1) continue
        let isCreature = false
        for (let i = idx + 1; i < Math.min(idx + 6, lines.length); i++) { if (typePat.test(lines[i])) { isCreature = true; break } }
        if (isCreature) {
            totalSrcBlocks++
            const slug = kebab(h.text)
            if (!findJson(path.join(DATA, 'monsters'), slug)) {
                missingCreatures++
                add('CRITICAL', 'MM: ' + bf, 'Missing Creature', `"${h.text}" (${slug}) has stat block but no JSON`)
                bump('missingFromSource')
            }
        } else {
            totalSrcLore++
            add('INFO', 'MM: ' + bf, 'Lore Table', `"${h.text}" is lore/table, not stat block`)
        }
    }
}

// NPCs
const npcFile = path.join(MM, "NPC's/NPCs.md")
if (fs.existsSync(npcFile)) {
    const npcContent = fs.readFileSync(npcFile, 'utf-8')
    const npcLines = npcContent.split('\n')
    for (const h of headings(npcFile, '###')) {
        const idx = npcLines.findIndex(l => l.trim() === '### ' + h.text)
        if (idx === -1) continue
        let isCr = false
        for (let i = idx + 1; i < Math.min(idx + 6, npcLines.length); i++) { if (typePat.test(npcLines[i])) { isCr = true; break } }
        if (isCr) {
            totalSrcBlocks++
            if (!findJson(path.join(DATA, 'monsters'), kebab(h.text))) {
                missingCreatures++
                add('CRITICAL', 'MM NPCs', 'Missing NPC', `"${h.text}" (${kebab(h.text)}) not found`)
            }
        }
    }
}

// Appendix creatures
const appFile = path.join(MM, 'Appendices/Creatures.md')
if (fs.existsSync(appFile)) {
    const appContent = fs.readFileSync(appFile, 'utf-8')
    const appLines = appContent.split('\n')
    for (const h of headings(appFile, '###')) {
        const idx = appLines.findIndex(l => l.trim() === '### ' + h.text)
        if (idx === -1) continue
        let isCr = false
        for (let i = idx + 1; i < Math.min(idx + 6, appLines.length); i++) { if (typePat.test(appLines[i])) { isCr = true; break } }
        if (isCr) {
            totalSrcBlocks++
            if (!findJson(path.join(DATA, 'monsters'), kebab(h.text))) {
                missingCreatures++
                add('WARNING', 'MM Appendix', 'Missing Animal', `"${h.text}" (${kebab(h.text)}) not found`)
            }
        }
    }
}

const totalMonsters = countJson(path.join(DATA, 'monsters'))
add('INFO', 'MM Total', 'Source Coverage', `Source stat blocks: ${totalSrcBlocks}. Extracted: ${totalMonsters}. Lore tables: ${totalSrcLore}. Missing: ${missingCreatures}`)

// ═══════════════════════════════════════════════════════════════
// SECTION 11: CROSS-REFERENCES BETWEEN DATA TYPES
// ═══════════════════════════════════════════════════════════════
console.log('[11/12] Cross-references...')

// Class spell lists → spells
for (const cf of allJson(path.join(DATA, 'classes'))) {
    const d = parse(cf); if (!d) continue
    const cn = d.name || path.basename(cf, '.json')
    if (d.spellList && Array.isArray(d.spellList)) {
        for (const sp of d.spellList) {
            const name = typeof sp === 'string' ? sp : sp?.name
            if (name && !findJson(path.join(DATA, 'spells'), kebab(name))) {
                add('INFO', `XRef: ${cn}`, 'Broken Spell Ref', `References "${name}" but no spell file found`)
            }
        }
    }
}

// Background feats → feats
for (const bf of allJson(path.join(DATA, 'character/backgrounds'))) {
    const d = parse(bf); if (!d || !d.feat) continue
    const fn = typeof d.feat === 'string' ? d.feat : d.feat?.name
    if (fn && !findJson(path.join(DATA, 'feats'), kebab(fn))) {
        add('INFO', `XRef: ${d.name}`, 'Broken Feat Ref', `References feat "${fn}" not found`)
    }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 12: SOURCE TEXT TRUNCATION DETECTION
// ═══════════════════════════════════════════════════════════════
console.log('[12/12] Source text truncation detection...')

// Compare source lore glossary word counts vs extracted
const loreSrc = path.join(DMG, 'appendix-a-lore-glossary.md')
const loreSrcContent = fs.readFileSync(loreSrc, 'utf-8')
const loreSrcSections = loreSrcContent.split(/^### /m).slice(1)
let truncatedLore = 0
for (const sect of loreSrcSections) {
    const nameMatch = sect.match(/^(.+)\n/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    const slug = kebab(name)
    const file = findJson(path.join(DATA, 'world/lore'), slug)
    if (!file) continue
    const d = parse(file); if (!d) continue
    const srcWords = wordCount(sect)
    const extWords = wordCount(d.description || d.text || '')
    if (srcWords > 30 && extWords < srcWords * 0.5) {
        truncatedLore++
        add('WARNING', 'Truncation: Lore', 'Truncated', `"${name}" source: ${srcWords} words, extracted: ${extWords} words (${((extWords / srcWords) * 100).toFixed(0)}%)`, rel(file))
    }
}
if (truncatedLore > 0) add('WARNING', 'Truncation', 'Summary', `${truncatedLore} lore entries appear truncated (<50% of source text)`)

// Compare source plane descriptions
const planeSrc = path.join(DMG, 'ch6-cosmology.md')
const planeSrcContent = fs.readFileSync(planeSrc, 'utf-8')
const planeSrcSections = planeSrcContent.split(/^### /m).slice(1)
let truncatedPlanes = 0
for (const sect of planeSrcSections) {
    const nameMatch = sect.match(/^(.+)\n/)
    if (!nameMatch) continue
    const name = nameMatch[1].trim()
    const slug = kebab(name)
    const file = findJson(path.join(DATA, 'world/planes'), slug)
    if (!file) continue
    const d = parse(file); if (!d) continue
    const srcWords = wordCount(sect)
    const extWords = wordCount(d.description || d.text || '')
    if (srcWords > 50 && extWords < srcWords * 0.4) {
        truncatedPlanes++
        add('WARNING', 'Truncation: Planes', 'Truncated', `"${name}" source: ${srcWords} words, extracted: ${extWords} words (${((extWords / srcWords) * 100).toFixed(0)}%)`, rel(file))
    }
}

// ═══════════════════════════════════════════════════════════════
// GENERATE REPORT
// ═══════════════════════════════════════════════════════════════
console.log('\nGenerating report...')

const sevOrder: Record<Sev, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }
issues.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev])
const crits = issues.filter(i => i.sev === 'CRITICAL')
const warns = issues.filter(i => i.sev === 'WARNING')
const infos = issues.filter(i => i.sev === 'INFO')

let rpt = `# D&D 5.5e ULTIMATE Data Audit Report\n\n**Generated:** ${new Date().toISOString()}\n\n`
rpt += `## Summary\n\n| Metric | Value |\n|--------|-------|\n`
rpt += `| Total JSON files | **${stats.totalFiles || 0}** |\n`
rpt += `| Total directories | ${stats.totalDirs || 0} |\n`
rpt += `| Empty directories | ${stats.emptyDirs || 0} |\n`
rpt += `| Zero-byte files | ${stats.zeroBytes || 0} |\n`
rpt += `| Error placeholders | ${stats.errorPlaceholders || 0} |\n`
rpt += `| Duplicates | ${stats.duplicates || 0} |\n`
rpt += `| Missing spec dirs | ${stats.missingSpecDirs || 0} |\n`
rpt += `| Empty spec dirs | ${stats.emptySpecDirs || 0} |\n`
rpt += `| Missing spec files | ${stats.missingSpecFiles || 0} |\n`
rpt += `| Missing from source | ${stats.missingFromSource || 0} |\n`
rpt += `| Unextracted sections | ${stats.unextracted || 0} |\n`
rpt += `| **Total issues** | **${issues.length}** |\n\n`

rpt += `> [!CAUTION]\n> **${crits.length} CRITICAL** issues\n\n`
rpt += `> [!WARNING]\n> **${warns.length} WARNING** issues\n\n`
rpt += `> [!NOTE]\n> **${infos.length} INFO** items\n\n---\n\n`

// By severity
for (const [label, list] of [['🔴 CRITICAL', crits], ['🟡 WARNING', warns], ['🔵 INFO', infos]] as [string, Issue[]][]) {
    if (list.length === 0) continue
    rpt += `## ${label} (${list.length})\n\n`
    rpt += `| # | Source | Category | Message | File |\n|---|--------|----------|---------|------|\n`
    for (let i = 0; i < list.length; i++) {
        const is2 = list[i]
        rpt += `| ${i + 1} | ${is2.src} | ${is2.cat} | ${is2.msg.replace(/\|/g, '\\|').slice(0, 200)} | ${is2.file || '-'} |\n`
    }
    rpt += '\n'
}

// Source coverage map
rpt += `---\n\n## Source File Coverage\n\n| Source | Size | Status |\n|--------|------|--------|\n`
const phbFiles2 = fs.readdirSync(PHB).filter(f => f.endsWith('.md'))
for (const f of phbFiles2) { rpt += `| PHB: ${f} | ${(fs.statSync(path.join(PHB, f)).size / 1024).toFixed(0)}KB | ✅ |\n` }
const dmgFiles2 = fs.readdirSync(DMG).filter(f => f.endsWith('.md'))
for (const f of dmgFiles2) { rpt += `| DMG: ${f} | ${(fs.statSync(path.join(DMG, f)).size / 1024).toFixed(0)}KB | ✅ |\n` }
rpt += `| MM: Bestiary (${bestiaryFiles.length} files) | - | ✅ |\n`
rpt += `| MM: NPCs | - | ✅ |\n| MM: Appendices | - | ✅ |\n\n`

fs.writeFileSync(REPORT, rpt)

console.log('═══════════════════════════════════════════════════')
console.log('  AUDIT COMPLETE')
console.log(`  📊 ${stats.totalFiles || 0} files | 🔴 ${crits.length} | 🟡 ${warns.length} | 🔵 ${infos.length}`)
console.log(`  📝 ${REPORT}`)
console.log('═══════════════════════════════════════════════════')

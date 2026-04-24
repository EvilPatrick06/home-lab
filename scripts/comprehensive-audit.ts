/**
 * ═══════════════════════════════════════════════════════════════
 *  COMPREHENSIVE D&D 5.5e DATA AUDIT
 *  Cross-references EVERY source markdown file against extracted
 *  JSON data. Checks schemas, naming, completeness, duplicates,
 *  cross-references, and produces a full .md report.
 * ═══════════════════════════════════════════════════════════════
 */
import fs from 'fs'
import path from 'path'

// ─── PATHS ───
const DATA = path.join(process.cwd(), 'src/renderer/public/data/5e')
const PHB_DIR = path.join(process.cwd(), '5.5e References/PHB2024/markdown')
const DMG_DIR = path.join(process.cwd(), '5.5e References/DMG2024/markdown')
const MM_DIR = path.join(process.cwd(), '5.5e References/MM2025/markdown')
const REPORT_PATH = path.join(process.cwd(), 'audit-report.md')

// ─── TYPES ───
type Severity = 'CRITICAL' | 'WARNING' | 'INFO'
interface Issue {
    severity: Severity
    source: string     // e.g. "PHB Ch5: Feats" or "equipment/weapons"
    category: string   // e.g. "Missing File", "Schema", "Duplicate"
    message: string
    file?: string
}

const issues: Issue[] = []
const stats = {
    totalSourceFiles: 0,
    totalDataFiles: 0,
    totalDirectories: 0,
    emptyDirectories: 0,
    zeroByteFiles: 0,
    invalidJson: 0,
    errorPlaceholders: 0,
    duplicates: 0,
    namingIssues: 0,
    missingFields: 0,
    emptyFields: 0,
    missingFromSource: 0,
    unextractedSections: 0,
}

function addIssue(severity: Severity, source: string, category: string, message: string, file?: string) {
    issues.push({ severity, source, category, message, file })
}

// ─── UTILITY FUNCTIONS ───
function kebab(s: string): string {
    return s.replace(/['']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase()
}

function isKebabCase(s: string): boolean {
    return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)
}

function countJsonDeep(dir: string): number {
    if (!fs.existsSync(dir)) return 0
    let n = 0
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) n += countJsonDeep(path.join(dir, e.name))
        else if (e.name.endsWith('.json')) n++
    }
    return n
}

function findJsonRecursive(dir: string, slug: string): string | null {
    if (!fs.existsSync(dir)) return null
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { const f = findJsonRecursive(path.join(dir, e.name), slug); if (f) return f }
        else if (e.name === `${slug}.json`) return path.join(dir, e.name)
    }
    return null
}

function getAllJsonFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    const results: string[] = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) results.push(...getAllJsonFiles(full))
        else if (e.name.endsWith('.json')) results.push(full)
    }
    return results
}

function getAllDirs(dir: string): string[] {
    if (!fs.existsSync(dir)) return []
    const results: string[] = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            results.push(path.join(dir, e.name))
            results.push(...getAllDirs(path.join(dir, e.name)))
        }
    }
    return results
}

function getHeadings(file: string, level: string): { line: number; text: string }[] {
    if (!fs.existsSync(file)) return []
    const lines = fs.readFileSync(file, 'utf-8').split('\n')
    const prefix = level + ' '
    return lines.map((l, i) => ({ line: i + 1, text: l.replace(/\r/g, '').trim() }))
        .filter(l => l.text.startsWith(prefix))
        .map(l => ({ line: l.line, text: l.text.slice(prefix.length).trim() }))
}

function relPath(file: string): string {
    return file.replace(DATA + path.sep, '').replace(/\\/g, '/')
}

function safeParseJson(file: string): any | null {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'))
    } catch { return null }
}

console.log('═══════════════════════════════════════════════════')
console.log('  COMPREHENSIVE D&D 5.5e DATA AUDIT')
console.log('  Starting...')
console.log('═══════════════════════════════════════════════════')

// ═══════════════════════════════════════════════════════════════
// SECTION 1: FILE & DIRECTORY INTEGRITY
// ═══════════════════════════════════════════════════════════════
console.log('\n[1/8] Checking file & directory integrity...')

const allDataFiles = getAllJsonFiles(DATA)
const allDataDirs = getAllDirs(DATA)
stats.totalDataFiles = allDataFiles.length
stats.totalDirectories = allDataDirs.length

// Check every JSON file
for (const file of allDataFiles) {
    const rel = relPath(file)
    const stat = fs.statSync(file)

    // Zero-byte
    if (stat.size === 0) {
        stats.zeroByteFiles++
        addIssue('CRITICAL', rel, 'Empty File', `Zero-byte file`, rel)
        continue
    }

    // Valid JSON
    const data = safeParseJson(file)
    if (!data) {
        stats.invalidJson++
        addIssue('CRITICAL', rel, 'Invalid JSON', `File is not valid JSON`, rel)
        continue
    }

    // Error placeholder
    if (data.error) {
        stats.errorPlaceholders++
        addIssue('CRITICAL', rel, 'Error Placeholder', `Contains error: "${data.error}" — "${(data.message || '').slice(0, 80)}"`, rel)
        continue
    }

    // Trivially small (empty object)
    if (stat.size < 10) {
        addIssue('CRITICAL', rel, 'Empty File', `File only ${stat.size} bytes (likely empty object)`, rel)
        continue
    }

    // File naming: kebab-case
    const basename = path.basename(file, '.json')
    if (!isKebabCase(basename) && basename !== 'ai-context-template') {
        stats.namingIssues++
        addIssue('WARNING', rel, 'Naming Convention', `Filename "${basename}" is not kebab-case`, rel)
    }
}

// Check empty directories
for (const dir of allDataDirs) {
    const jsonCount = countJsonDeep(dir)
    if (jsonCount === 0) {
        stats.emptyDirectories++
        const relDir = dir.replace(DATA + path.sep, '').replace(/\\/g, '/')
        addIssue('WARNING', relDir, 'Empty Directory', `Directory has 0 JSON files`, relDir)
    }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: SCHEMA VALIDATION
// ═══════════════════════════════════════════════════════════════
console.log('[2/8] Validating schemas...')

// Define required fields per category
const schemas: Record<string, { required: string[]; path: string }> = {
    'Species': { required: ['name', 'slug', 'traits', 'creatureType'], path: 'character/species' },
    'Background': { required: ['name', 'slug', 'abilityScores', 'feat', 'skillProficiencies'], path: 'character/backgrounds' },
    'Class': { required: ['name', 'description', 'coreTraits'], path: 'classes' },
    'Feat (origin)': { required: ['name', 'slug', 'category', 'description'], path: 'feats/origin' },
    'Feat (general)': { required: ['name', 'slug', 'category', 'description'], path: 'feats/general' },
    'Feat (fighting)': { required: ['name', 'slug', 'category', 'description'], path: 'feats/fighting-style' },
    'Feat (epic)': { required: ['name', 'slug', 'category', 'description'], path: 'feats/epic-boon' },
    'Spell (cantrip)': { required: ['name', 'level', 'school', 'description'], path: 'spells/cantrips' },
    'Spell (prepared)': { required: ['name', 'level', 'school', 'description'], path: 'spells/prepared-spells' },
    'Rule (glossary)': { required: ['name', 'slug', 'description'], path: 'rules/glossary' },
    'Rule (condition)': { required: ['name', 'slug', 'description'], path: 'rules/conditions' },
    'Bastion Facility': { required: ['name', 'slug', 'description'], path: 'rules/bastions/facilities' },
    'Plane': { required: ['name', 'slug', 'category', 'description'], path: 'world/planes' },
    'Lore Entry': { required: ['name', 'slug', 'description'], path: 'world/lore' },
    'Language': { required: ['name', 'slug'], path: 'world/languages' },
    'Magic Item (new)': { required: ['name', 'slug', 'type', 'rarity', 'description'], path: 'equipment/magic-items/common' },
    'Gemstone': { required: ['name', 'slug', 'value'], path: 'equipment/gemstones' },
    'Art Object': { required: ['name', 'slug', 'value'], path: 'equipment/art-objects' },
    'Trade Bar': { required: ['name', 'slug', 'value'], path: 'equipment/trade-bars' },
    'Trade Good': { required: ['name', 'slug', 'cost'], path: 'equipment/trade-goods' },
    'Hazard (env)': { required: ['name', 'description'], path: 'hazards/environmental' },
    'Hazard (trap)': { required: ['name', 'description'], path: 'hazards/traps' },
}

// Also validate magic items in all rarity dirs
const rarityDirs = ['uncommon', 'rare', 'legendary', 'artifact', 'other', 'varies']
for (const rd of rarityDirs) {
    schemas[`Magic Item (${rd})`] = { required: ['name', 'slug', 'type', 'rarity', 'description'], path: `equipment/magic-items/${rd}` }
}

// Monster schema
const monsterTypes = ['aberration', 'beast', 'celestial', 'celestial-or-fiend', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead']
for (const mt of monsterTypes) {
    schemas[`Monster (${mt})`] = {
        required: ['name', 'slug', 'size', 'type', 'ac', 'hp', 'speed', 'abilityScores', 'actions'],
        path: `monsters/${mt}`
    }
}

for (const [label, schema] of Object.entries(schemas)) {
    const fullDir = path.join(DATA, schema.path)
    const files = getAllJsonFiles(fullDir)

    for (const file of files) {
        const data = safeParseJson(file)
        if (!data || data.error) continue
        const rel = relPath(file)

        for (const field of schema.required) {
            const val = data[field]
            if (val === undefined || val === null) {
                stats.missingFields++
                addIssue('WARNING', label, 'Missing Field', `"${field}" is missing`, rel)
            } else if (typeof val === 'string' && val === '' && field !== 'prerequisite') {
                stats.emptyFields++
                addIssue('WARNING', label, 'Empty Field', `"${field}" is empty string`, rel)
            } else if (Array.isArray(val) && val.length === 0 && ['actions', 'traits'].includes(field)) {
                // Only warn on empty actions/traits for monsters
                addIssue('INFO', label, 'Empty Array', `"${field}" is empty array`, rel)
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 3: DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════════
console.log('[3/8] Detecting duplicates...')

const fileMap = new Map<string, string[]>() // basename -> [full paths]
for (const file of allDataFiles) {
    const bn = path.basename(file)
    if (!fileMap.has(bn)) fileMap.set(bn, [])
    fileMap.get(bn)!.push(file)
}

for (const [bn, paths] of fileMap) {
    if (paths.length > 1) {
        stats.duplicates++
        const locs = paths.map(p => relPath(p)).join(' | ')
        addIssue('WARNING', 'Duplicates', 'Duplicate File', `"${bn}" exists in ${paths.length} locations: ${locs}`)
    }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: SOURCE CROSS-REFERENCE — PHB
// ═══════════════════════════════════════════════════════════════
console.log('[4/8] Cross-referencing PHB source...')

// PHB 00 - Introduction
addIssue('INFO', 'PHB Introduction', 'Source Coverage', `Introduction (${fs.statSync(path.join(PHB_DIR, '00-introduction.md')).size} bytes) — narrative, no structured data to extract`)

// PHB 01 - Playing the Game
const phb01 = path.join(PHB_DIR, '01-playing-the-game.md')
const phb01Headings = getHeadings(phb01, '##')
addIssue('INFO', 'PHB Ch1: Playing the Game', 'Source Coverage',
    `${phb01Headings.length} sections, ${fs.statSync(phb01).size} bytes — rules prose. Key sections: ${phb01Headings.map(h => h.text).join(', ')}`)

// PHB 02 - Creating a Character
const phb02 = path.join(PHB_DIR, '02-creating-a-character.md')
const phb02Headings = getHeadings(phb02, '##')
addIssue('INFO', 'PHB Ch2: Creating a Character', 'Source Coverage',
    `${phb02Headings.length} sections — character creation guide. Not extracted (procedural).`)

// PHB 03 - Character Classes
const phb03 = path.join(PHB_DIR, '03-character-classes.md')
const _classHeadings = getHeadings(phb03, '## ')
// Check each known class exists and is non-trivial
const classNames = ['Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard']
for (const cls of classNames) {
    const file = path.join(DATA, 'classes', `${cls.toLowerCase()}.json`)
    if (!fs.existsSync(file)) {
        addIssue('CRITICAL', 'PHB Ch3: Classes', 'Missing File', `Class "${cls}" has no JSON file`)
    } else {
        const stat = fs.statSync(file)
        if (stat.size < 100) {
            addIssue('CRITICAL', 'PHB Ch3: Classes', 'Empty File', `Class "${cls}" is only ${stat.size} bytes — data missing/corrupt`, relPath(file))
        } else {
            const data = safeParseJson(file)
            if (data) {
                if (!data.name && !data.title) addIssue('WARNING', 'PHB Ch3: Classes', 'Missing Field', `Class "${cls}" missing name`, relPath(file))
                if (!data.description && !data.text) addIssue('WARNING', 'PHB Ch3: Classes', 'Missing Field', `Class "${cls}" missing description`, relPath(file))
                // Check for subclasses
                if (!data.subclasses && !data.subClasses) {
                    addIssue('WARNING', 'PHB Ch3: Classes', 'Missing Field', `Class "${cls}" missing subclasses`, relPath(file))
                }
            }
        }
    }
}

// PHB 04 - Character Origins
const _phb04 = path.join(PHB_DIR, '04-character-origins.md')
const speciesNames = ['Aasimar', 'Dragonborn', 'Dwarf', 'Elf', 'Gnome', 'Goliath', 'Halfling', 'Human', 'Orc', 'Tiefling']
for (const sp of speciesNames) {
    const file = findJsonRecursive(path.join(DATA, 'character/species'), kebab(sp))
    if (!file) addIssue('CRITICAL', 'PHB Ch4: Species', 'Missing File', `Species "${sp}" not found`)
    else {
        const data = safeParseJson(file)
        if (data && (!data.traits || data.traits.length === 0)) {
            addIssue('WARNING', 'PHB Ch4: Species', 'Empty Field', `Species "${sp}" has no traits`, relPath(file))
        }
    }
}
const bgNames = ['Acolyte', 'Artisan', 'Charlatan', 'Criminal', 'Entertainer', 'Farmer', 'Guard', 'Guide', 'Hermit', 'Merchant', 'Noble', 'Sage', 'Sailor', 'Scribe', 'Soldier', 'Wayfarer']
for (const bg of bgNames) {
    const file = findJsonRecursive(path.join(DATA, 'character/backgrounds'), kebab(bg))
    if (!file) addIssue('CRITICAL', 'PHB Ch4: Backgrounds', 'Missing File', `Background "${bg}" not found`)
    else {
        const data = safeParseJson(file)
        if (data) {
            if (!data.abilityScores) addIssue('WARNING', 'PHB Ch4: Backgrounds', 'Missing Field', `"${bg}" missing abilityScores`, relPath(file))
            if (!data.feat) addIssue('WARNING', 'PHB Ch4: Backgrounds', 'Missing Field', `"${bg}" missing feat`, relPath(file))
        }
    }
}

// PHB 05 - Feats
const phb05 = path.join(PHB_DIR, '05-feats.md')
const featHeadings = getHeadings(phb05, '###')
    .filter(h => !['Parts of a Feat', 'Fast Crafting'].includes(h.text))
for (const feat of featHeadings) {
    const slug = kebab(feat.text)
    const file = findJsonRecursive(path.join(DATA, 'feats'), slug)
    if (!file) {
        stats.missingFromSource++
        addIssue('CRITICAL', 'PHB Ch5: Feats', 'Missing File', `Feat "${feat.text}" (slug: ${slug}) not found in data`)
    } else {
        const data = safeParseJson(file)
        if (data && !data.description) {
            addIssue('WARNING', 'PHB Ch5: Feats', 'Empty Field', `Feat "${feat.text}" has empty description`, relPath(file))
        }
    }
}

// PHB 06 - Equipment
const phb06 = path.join(PHB_DIR, '06-equipment.md')
const phb06Content = fs.readFileSync(phb06, 'utf-8')
// Count weapon entries in source tables
const weaponTableRows = (phb06Content.match(/^\|.*\|.*\|.*\|.*\|/gm) || []).length
addIssue('INFO', 'PHB Ch6: Equipment', 'Source Coverage',
    `Source has ~${weaponTableRows} table rows. Extracted: weapons=${countJsonDeep(path.join(DATA, 'equipment/weapons'))}, armor=${countJsonDeep(path.join(DATA, 'equipment/armor'))}, tools=${countJsonDeep(path.join(DATA, 'equipment/tools'))}`)

// PHB 07 - Spells
const phb07 = path.join(PHB_DIR, '07-spells.md')
const spellHeadings = getHeadings(phb07, '###')
const totalSpells = countJsonDeep(path.join(DATA, 'spells'))
addIssue('INFO', 'PHB Ch7: Spells', 'Source Coverage',
    `Source has ${spellHeadings.length} ### headings (section headers, not individual spells). Total extracted spells: ${totalSpells}`)

// Spot-check important spells
const importantSpells = ['fireball', 'magic-missile', 'shield', 'heal', 'wish', 'counterspell', 'eldritch-blast', 'cure-wounds', 'detect-magic', 'dispel-magic', 'teleport', 'resurrection', 'meteor-swarm', 'power-word-kill', 'true-polymorph']
for (const sp of importantSpells) {
    const file = findJsonRecursive(path.join(DATA, 'spells'), sp)
    if (!file) addIssue('WARNING', 'PHB Ch7: Spells', 'Missing File', `Important spell "${sp}" not found`)
    else {
        const data = safeParseJson(file)
        if (data && !data.description) addIssue('WARNING', 'PHB Ch7: Spells', 'Empty Field', `Spell "${sp}" has no description`, relPath(file))
    }
}

// PHB App A - Multiverse
addIssue('INFO', 'PHB App A: Multiverse', 'Source Coverage',
    `${fs.statSync(path.join(PHB_DIR, 'appendix-a-the-multiverse.md')).size} bytes — brief cosmology overview. Covered by DMG Ch6 planes.`)

// PHB App B - Creature Stat Blocks
const phbAppB = path.join(PHB_DIR, 'appendix-b-creature-stat-blocks.md')
const phbAppBContent = fs.readFileSync(phbAppB, 'utf-8')
const phbStatBlocks = (phbAppBContent.match(/^\*[A-Z].*?(Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Monstrosity|Plant|Undead|Ooze)/gm) || []).length
addIssue('INFO', 'PHB App B: Creatures', 'Source Coverage',
    `Source has ~${phbStatBlocks} stat blocks. Check character/ directory for extracted creature data.`)

// PHB App C - Rules Glossary
const _phbAppC = path.join(PHB_DIR, 'appendix-c-rules-glossary.md')
const glossaryCount = countJsonDeep(path.join(DATA, 'rules/glossary'))
const conditionsCount = countJsonDeep(path.join(DATA, 'rules/conditions'))
addIssue('INFO', 'PHB App C: Rules Glossary', 'Source Coverage',
    `Extracted: ${glossaryCount} glossary entries + ${conditionsCount} conditions = ${glossaryCount + conditionsCount} total`)

// ═══════════════════════════════════════════════════════════════
// SECTION 5: SOURCE CROSS-REFERENCE — DMG
// ═══════════════════════════════════════════════════════════════
console.log('[5/8] Cross-referencing DMG source...')

// DMG Ch1 - The Basics
const dmg01 = path.join(DMG_DIR, 'ch1-the-basics.md')
const dmg01Headings = getHeadings(dmg01, '##')
addIssue('INFO', 'DMG Ch1: The Basics', 'Source Coverage',
    `${dmg01Headings.length} sections, ${fs.statSync(dmg01).size} bytes — DM guidance. Sections: ${dmg01Headings.map(h => h.text).join(', ')}`)

// DMG Ch2 - Running the Game
const dmg02 = path.join(DMG_DIR, 'ch2-running-the-game.md')
const dmg02Headings = getHeadings(dmg02, '##')
const dmg02Tables = (fs.readFileSync(dmg02, 'utf-8').match(/^\|/gm) || []).length
addIssue('INFO', 'DMG Ch2: Running the Game', 'Source Coverage',
    `${dmg02Headings.length} sections, ${dmg02Tables} table rows. Sections: ${dmg02Headings.map(h => h.text).join(', ')}`)
// Flag: has tables that could be extracted
if (dmg02Tables > 30) {
    addIssue('WARNING', 'DMG Ch2: Running the Game', 'Unextracted Data',
        `Contains ${dmg02Tables} table rows that may contain extractable structured data (encounter tables, DM reference tables)`)
    stats.unextractedSections++
}

// DMG Ch3 - DM's Toolbox
const dmg03 = path.join(DMG_DIR, 'ch3-dms-toolbox.md')
const dmg03Headings = getHeadings(dmg03, '##')
addIssue('INFO', 'DMG Ch3: DM Toolbox', 'Source Coverage',
    `${dmg03Headings.length} sections — biggest DMG chapter. Contains poisons, hazards, traps, siege weapons, gifts. Already extracted to dm/ and hazards/`)

// DMG Ch4 - Creating Adventures
const dmg04 = path.join(DMG_DIR, 'ch4-creating-adventures.md')
const dmg04Headings = getHeadings(dmg04, '##')
const dmg04Content = fs.readFileSync(dmg04, 'utf-8')
const dmg04Tables = (dmg04Content.match(/^\|/gm) || []).length
const dmg04H3 = getHeadings(dmg04, '###')
addIssue('WARNING', 'DMG Ch4: Creating Adventures', 'Unextracted Data',
    `${dmg04Headings.length} sections, ${dmg04H3.length} subsections, ${dmg04Tables} table rows. Contains encounter/reward tables. Suggested dir: dm/adventure-tables/`)
stats.unextractedSections++

// DMG Ch5 - Creating Campaigns
const dmg05 = path.join(DMG_DIR, 'ch5-creating-campaigns.md')
const dmg05Content = fs.readFileSync(dmg05, 'utf-8')
const dmg05Headings = getHeadings(dmg05, '##')
const dmg05Tables = (dmg05Content.match(/^\|/gm) || []).length
addIssue('WARNING', 'DMG Ch5: Creating Campaigns', 'Unextracted Data',
    `${dmg05Headings.length} sections, ${dmg05Tables} table rows. Contains Greyhawk Gazetteer. Suggested dirs: world/locations/greyhawk/, dm/campaign-tables/`)
stats.unextractedSections++
// Check for specific Greyhawk content
if (dmg05Content.includes('Greyhawk')) {
    const greyhawkSections = getHeadings(dmg05, '###').filter(h => h.line > dmg05Content.split('\n').findIndex(l => l.includes('## Greyhawk')))
    addIssue('WARNING', 'DMG Ch5: Greyhawk', 'Unextracted Data',
        `Greyhawk Gazetteer has ${greyhawkSections.length} subsections. No data extracted to world/locations/`)
}

// DMG Ch6 - Cosmology
const _dmg06 = path.join(DMG_DIR, 'ch6-cosmology.md')
const planeCount = countJsonDeep(path.join(DATA, 'world/planes'))
addIssue('INFO', 'DMG Ch6: Cosmology', 'Source Coverage',
    `Extracted ${planeCount} planes across material/inner/outer/transitive/other`)

// DMG Ch7 - Magic Items
const miSourceFiles = ['ch7-magic-items-a-b.md', 'ch7-magic-items-c-d.md', 'ch7-magic-items-e-h.md', 'ch7-magic-items-i-o.md', 'ch7-magic-items-p-r.md', 'ch7-magic-items-s-z.md']
let _totalSourceMI = 0
for (const mf of miSourceFiles) {
    const headings = getHeadings(path.join(DMG_DIR, mf), '##')
    _totalSourceMI += headings.length
    // Check each item exists
    for (const h of headings) {
        const slug = kebab(h.text)
        const file = findJsonRecursive(path.join(DATA, 'equipment/magic-items'), slug)
        if (!file) {
            stats.missingFromSource++
            addIssue('WARNING', `DMG Ch7: Magic Items (${mf})`, 'Missing File',
                `Magic item "${h.text}" (slug: ${slug}) not found in any rarity directory`)
        }
    }
}

// DMG Ch7 - Magic Item Rules
const dmg07Rules = path.join(DMG_DIR, 'ch7-magic-item-rules.md')
const dmg07RulesContent = fs.readFileSync(dmg07Rules, 'utf-8')
const dmg07Headings = getHeadings(dmg07Rules, '##')
const dmg07Tables = (dmg07RulesContent.match(/^\|/gm) || []).length
addIssue('WARNING', 'DMG Ch7: Magic Item Rules', 'Unextracted Data',
    `${dmg07Headings.length} sections, ${dmg07Tables} table rows. Contains random magic item tables (Arcana, Armaments, Implements, Relics). Suggested dir: dm/loot-tables/`)
stats.unextractedSections++

// DMG Ch7 - Treasure Tables
const _dmg07Treasure = path.join(DMG_DIR, 'ch7-treasure-tables.md')
const gemCount = countJsonDeep(path.join(DATA, 'equipment/gemstones'))
const artCount = countJsonDeep(path.join(DATA, 'equipment/art-objects'))
const tbCount = countJsonDeep(path.join(DATA, 'equipment/trade-bars'))
const tgCount = countJsonDeep(path.join(DATA, 'equipment/trade-goods'))
addIssue('INFO', 'DMG Ch7: Treasure Tables', 'Source Coverage',
    `Extracted: ${gemCount} gemstones, ${artCount} art objects, ${tbCount} trade bars, ${tgCount} trade goods = ${gemCount + artCount + tbCount + tgCount} total`)

// DMG Ch8 - Bastions
const bastionCount = countJsonDeep(path.join(DATA, 'rules/bastions/facilities'))
const dmg08 = path.join(DMG_DIR, 'ch8-bastions.md')
const dmg08Facilities = getHeadings(dmg08, '####')
    .filter(h => !['Traits', 'Actions', 'Bonus Actions', 'Reactions', 'Legendary Actions'].includes(h.text))
addIssue('INFO', 'DMG Ch8: Bastions', 'Source Coverage',
    `Source has ${dmg08Facilities.length} #### headings. Extracted ${bastionCount} facilities.`)
// Check bastion events
const dmg08Content = fs.readFileSync(dmg08, 'utf-8')
if (dmg08Content.includes('Bastion Events') || dmg08Content.includes('bastion event')) {
    addIssue('WARNING', 'DMG Ch8: Bastions', 'Unextracted Data',
        `Bastion Events section exists in source but not extracted. Suggested dir: rules/bastions/events/`)
    stats.unextractedSections++
}

// DMG App A - Lore Glossary
const loreCount = countJsonDeep(path.join(DATA, 'world/lore'))
const loreSource = getHeadings(path.join(DMG_DIR, 'appendix-a-lore-glossary.md'), '###')
addIssue('INFO', 'DMG App A: Lore Glossary', 'Source Coverage',
    `Source has ${loreSource.length} entries. Extracted ${loreCount}.`)
if (loreCount < loreSource.length) {
    addIssue('WARNING', 'DMG App A: Lore Glossary', 'Missing Items',
        `${loreSource.length - loreCount} lore entries may be missing`)
}

// DMG App B - Maps
addIssue('INFO', 'DMG App B: Maps', 'Source Coverage',
    `Maps appendix — visual content, not parseable into JSON`)

// DMG Index
addIssue('INFO', 'DMG Index', 'Source Coverage',
    `Index file — reference only, no new data`)

// ═══════════════════════════════════════════════════════════════
// SECTION 6: SOURCE CROSS-REFERENCE — MONSTER MANUAL
// ═══════════════════════════════════════════════════════════════
console.log('[6/8] Cross-referencing MM source...')

// MM Introduction
const mmIntro = path.join(MM_DIR, 'Introduction.md')
if (fs.existsSync(mmIntro)) {
    addIssue('INFO', 'MM Introduction', 'Source Coverage',
        `${fs.statSync(mmIntro).size} bytes — introduction and how to read stat blocks`)
}

// MM Bestiary files
const bestiaryDir = path.join(MM_DIR, 'Bestiary')
const bestiaryFiles = fs.readdirSync(bestiaryDir).filter(f => f.endsWith('.md'))
let totalBestiaryBlocks = 0
let totalBestiaryLoreTables = 0

for (const bf of bestiaryFiles) {
    const bfPath = path.join(bestiaryDir, bf)
    const content = fs.readFileSync(bfPath, 'utf-8')
    const lines = content.split('\n')

    // Count stat blocks (have type lines)
    const typePattern = /^\*[A-Z].*?(Aberration|Beast|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Monstrosity|Ooze|Plant|Undead)/
    const statBlockCount = lines.filter(l => typePattern.test(l)).length
    totalBestiaryBlocks += statBlockCount

    // Count lore/table subsections (### headings that aren't creature names — they'd have a type line after)
    const h3Headings = getHeadings(bfPath, '###')
    for (const h of h3Headings) {
        // Check if this heading has a type line within 5 lines (= creature) or not (= lore table)
        const headingIdx = lines.findIndex((l, _i) => l.trim() === `### ${h.text}`)
        if (headingIdx === -1) continue
        let isCreature = false
        for (let i = headingIdx + 1; i < Math.min(headingIdx + 6, lines.length); i++) {
            if (typePattern.test(lines[i])) { isCreature = true; break }
        }
        if (!isCreature) {
            totalBestiaryLoreTables++
            const slug = kebab(h.text)
            const file = findJsonRecursive(path.join(DATA, 'monsters'), slug)
            if (!file) {
                addIssue('INFO', `MM: ${bf}`, 'Unextracted Lore Table',
                    `Lore table/subsection "${h.text}" not extracted. Suggested: monsters/lore/${slug}.json`)
            }
        } else {
            // Verify creature exists
            const slug = kebab(h.text)
            const file = findJsonRecursive(path.join(DATA, 'monsters'), slug)
            if (!file) {
                stats.missingFromSource++
                addIssue('CRITICAL', `MM: ${bf}`, 'Missing Creature',
                    `Creature "${h.text}" (slug: ${slug}) has stat block in source but no JSON file`)
            }
        }
    }
}

// MM NPCs
const npcPath = path.join(MM_DIR, "NPC's/NPCs.md")
if (fs.existsSync(npcPath)) {
    const npcContent = fs.readFileSync(npcPath, 'utf-8')
    const npcHeadings = getHeadings(npcPath, '###')
    const npcLines = npcContent.split('\n')
    const typePattern = /^\*[A-Z].*?Humanoid/

    for (const h of npcHeadings) {
        const headingIdx = npcLines.findIndex(l => l.trim() === `### ${h.text}`)
        if (headingIdx === -1) continue
        let isCreature = false
        for (let i = headingIdx + 1; i < Math.min(headingIdx + 6, npcLines.length); i++) {
            if (typePattern.test(npcLines[i])) { isCreature = true; break }
        }
        if (isCreature) {
            const slug = kebab(h.text)
            const file = findJsonRecursive(path.join(DATA, 'monsters'), slug)
            if (!file) {
                stats.missingFromSource++
                addIssue('CRITICAL', 'MM: NPCs', 'Missing NPC',
                    `NPC "${h.text}" (slug: ${slug}) has stat block in source but no JSON file`)
            }
        }
    }
}

// MM Appendix A - Animals
const animPath = path.join(MM_DIR, 'Appendices/Creatures.md')
if (fs.existsSync(animPath)) {
    const animHeadings = getHeadings(animPath, '###')
    const animContent = fs.readFileSync(animPath, 'utf-8')
    const animLines = animContent.split('\n')
    const typePattern = /^\*[A-Z].*?(Beast|Monstrosity|Celestial|Construct|Dragon|Elemental|Fey|Fiend|Giant|Humanoid|Ooze|Plant|Undead|Aberration)/

    let animFound = 0, animMissing = 0
    for (const h of animHeadings) {
        const headingIdx = animLines.findIndex(l => l.trim() === `### ${h.text}`)
        if (headingIdx === -1) continue
        let isCreature = false
        for (let i = headingIdx + 1; i < Math.min(headingIdx + 6, animLines.length); i++) {
            if (typePattern.test(animLines[i])) { isCreature = true; break }
        }
        if (isCreature) {
            const slug = kebab(h.text)
            const file = findJsonRecursive(path.join(DATA, 'monsters'), slug)
            if (file) animFound++
            else {
                animMissing++
                stats.missingFromSource++
                addIssue('WARNING', 'MM App A: Animals', 'Missing Creature',
                    `Animal "${h.text}" (slug: ${slug}) not found in monsters/`)
            }
        }
    }
    addIssue('INFO', 'MM App A: Animals', 'Source Coverage',
        `${animFound} found, ${animMissing} missing out of ${animHeadings.length} headings`)
}

// MM Appendix B - Monsters by CR
addIssue('INFO', 'MM App B: Monsters by CR', 'Source Coverage',
    `CR index only — no new stat block data, just a reference table`)

// Total monster count
const totalMonsters = countJsonDeep(path.join(DATA, 'monsters'))
addIssue('INFO', 'MM Total', 'Source Coverage',
    `Total source stat blocks: ${totalBestiaryBlocks} (bestiary). Total extracted monsters: ${totalMonsters}. Lore tables: ${totalBestiaryLoreTables}`)

// ═══════════════════════════════════════════════════════════════
// SECTION 7: CROSS-REFERENCES BETWEEN DATA TYPES
// ═══════════════════════════════════════════════════════════════
console.log('[7/8] Checking cross-references...')

// Check spell references in classes
const classDir = path.join(DATA, 'classes')
const classFiles = getAllJsonFiles(classDir)
for (const cf of classFiles) {
    const data = safeParseJson(cf)
    if (!data) continue
    const className = data.name || data.title || path.basename(cf, '.json')

    // If class has spellList, verify referenced spells exist
    if (data.spellList && Array.isArray(data.spellList)) {
        for (const sp of data.spellList) {
            const spellName = typeof sp === 'string' ? sp : sp?.name
            if (spellName) {
                const slug = kebab(spellName)
                const file = findJsonRecursive(path.join(DATA, 'spells'), slug)
                if (!file) {
                    addIssue('INFO', `Cross-Ref: ${className}`, 'Broken Spell Reference',
                        `Class spell list references "${spellName}" but no spell file found at spells/${slug}.json`)
                }
            }
        }
    }
}

// Check feat references in backgrounds
const bgDir = path.join(DATA, 'character/backgrounds')
const bgFiles = getAllJsonFiles(bgDir)
for (const bf of bgFiles) {
    const data = safeParseJson(bf)
    if (!data || !data.feat) continue
    const featName = typeof data.feat === 'string' ? data.feat : data.feat?.name
    if (featName) {
        const slug = kebab(featName)
        const file = findJsonRecursive(path.join(DATA, 'feats'), slug)
        if (!file) {
            addIssue('INFO', `Cross-Ref: ${data.name}`, 'Broken Feat Reference',
                `Background references feat "${featName}" but no file found at feats/${slug}.json`)
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8: GENERATE REPORT
// ═══════════════════════════════════════════════════════════════
console.log('[8/8] Generating report...\n')

// Sort issues by severity
const severityOrder: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }
issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

// Build the report
let report = `# D&D 5.5e Comprehensive Data Audit Report\n\n`
report += `**Generated:** ${new Date().toISOString()}\n\n`

// Summary stats
report += `## Summary\n\n`
report += `| Metric | Value |\n|--------|-------|\n`
report += `| Total JSON files | **${stats.totalDataFiles}** |\n`
report += `| Total directories | ${stats.totalDirectories} |\n`
report += `| Empty directories | ${stats.emptyDirectories} |\n`
report += `| Zero-byte files | ${stats.zeroByteFiles} |\n`
report += `| Invalid JSON | ${stats.invalidJson} |\n`
report += `| Error placeholders | ${stats.errorPlaceholders} |\n`
report += `| Duplicate files | ${stats.duplicates} |\n`
report += `| Naming issues | ${stats.namingIssues} |\n`
report += `| Missing required fields | ${stats.missingFields} |\n`
report += `| Empty required fields | ${stats.emptyFields} |\n`
report += `| Missing from source | ${stats.missingFromSource} |\n`
report += `| Unextracted sections | ${stats.unextractedSections} |\n`
report += `| **Total issues** | **${issues.length}** |\n\n`

// Issue counts by severity
const criticals = issues.filter(i => i.severity === 'CRITICAL')
const warnings = issues.filter(i => i.severity === 'WARNING')
const infos = issues.filter(i => i.severity === 'INFO')
report += `> [!CAUTION]\n> **${criticals.length} CRITICAL** issues found\n\n`
report += `> [!WARNING]\n> **${warnings.length} WARNING** issues found\n\n`
report += `> [!NOTE]\n> **${infos.length} INFO** items logged\n\n`

// ─── BY SEVERITY ───
report += `---\n\n## Issues by Severity\n\n`

if (criticals.length > 0) {
    report += `### 🔴 CRITICAL (${criticals.length})\n\n`
    report += `| # | Source | Category | Message | File |\n|---|--------|----------|---------|------|\n`
    criticals.forEach((issue, i) => {
        report += `| ${i + 1} | ${issue.source} | ${issue.category} | ${issue.message.replace(/\|/g, '\\|')} | ${issue.file || '-'} |\n`
    })
    report += '\n'
}

if (warnings.length > 0) {
    report += `### 🟡 WARNING (${warnings.length})\n\n`
    report += `| # | Source | Category | Message | File |\n|---|--------|----------|---------|------|\n`
    warnings.forEach((issue, i) => {
        report += `| ${i + 1} | ${issue.source} | ${issue.category} | ${issue.message.replace(/\|/g, '\\|')} | ${issue.file || '-'} |\n`
    })
    report += '\n'
}

if (infos.length > 0) {
    report += `### 🔵 INFO (${infos.length})\n\n`
    report += `| # | Source | Category | Message | File |\n|---|--------|----------|---------|------|\n`
    infos.forEach((issue, i) => {
        report += `| ${i + 1} | ${issue.source} | ${issue.category} | ${issue.message.replace(/\|/g, '\\|')} | ${issue.file || '-'} |\n`
    })
    report += '\n'
}

// ─── BY SOURCE BOOK ───
report += `---\n\n## Issues by Source Book\n\n`

const bySource = new Map<string, Issue[]>()
for (const issue of issues) {
    const book = issue.source.startsWith('PHB') ? 'Player\'s Handbook' :
        issue.source.startsWith('DMG') ? 'Dungeon Master\'s Guide' :
            issue.source.startsWith('MM') ? 'Monster Manual' : 'Data Files'
    if (!bySource.has(book)) bySource.set(book, [])
    bySource.get(book)!.push(issue)
}

for (const [book, bookIssues] of bySource) {
    const bc = bookIssues.filter(i => i.severity === 'CRITICAL').length
    const bw = bookIssues.filter(i => i.severity === 'WARNING').length
    const bi = bookIssues.filter(i => i.severity === 'INFO').length
    report += `### ${book} (${bc} critical, ${bw} warning, ${bi} info)\n\n`
    report += `| Severity | Source | Category | Message |\n|----------|--------|----------|----------|\n`
    for (const issue of bookIssues) {
        const icon = issue.severity === 'CRITICAL' ? '🔴' : issue.severity === 'WARNING' ? '🟡' : '🔵'
        report += `| ${icon} | ${issue.source} | ${issue.category} | ${issue.message.replace(/\|/g, '\\|')} |\n`
    }
    report += '\n'
}

// ─── BY CATEGORY ───
report += `---\n\n## Issues by Data Category\n\n`

const byCategory = new Map<string, Issue[]>()
for (const issue of issues) {
    if (!byCategory.has(issue.category)) byCategory.set(issue.category, [])
    byCategory.get(issue.category)!.push(issue)
}

for (const [cat, catIssues] of byCategory) {
    report += `### ${cat} (${catIssues.length})\n\n`
    for (const issue of catIssues.slice(0, 50)) { // Cap at 50 per category
        const icon = issue.severity === 'CRITICAL' ? '🔴' : issue.severity === 'WARNING' ? '🟡' : '🔵'
        report += `- ${icon} **${issue.source}**: ${issue.message}${issue.file ? ` → \`${issue.file}\`` : ''}\n`
    }
    if (catIssues.length > 50) report += `- ...and ${catIssues.length - 50} more\n`
    report += '\n'
}

// ─── DIRECTORY MAP ───
report += `---\n\n## Full Directory Map\n\n`
report += `\`\`\`\ndata/5e/\n`
const allDirsSorted = allDataDirs.sort()
for (const d of allDirsSorted) {
    const rel = d.replace(DATA + path.sep, '').replace(/\\/g, '/')
    const depth = rel.split('/').length
    const indent = '  '.repeat(depth - 1)
    const jsonCount = fs.readdirSync(d).filter(f => f.endsWith('.json')).length
    const subDirs = fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).length
    const status = jsonCount === 0 && subDirs === 0 ? ' ⚠️ EMPTY' : ''
    report += `${indent}├── ${rel.split('/').pop()}/ (${jsonCount} json)${status}\n`
}
report += `\`\`\`\n\n`

// ─── SOURCE COVERAGE MAP ───
report += `---\n\n## Source File Coverage Map\n\n`
report += `| Source File | Size | Status | Extracted To |\n|------------|------|--------|-------------|\n`

// PHB
const phbFiles = fs.readdirSync(PHB_DIR).filter(f => f.endsWith('.md'))
for (const f of phbFiles) {
    const size = fs.statSync(path.join(PHB_DIR, f)).size
    const sizeKB = (size / 1024).toFixed(0)
    let status = '❓ Unchecked'
    let target = '-'

    if (f === '00-introduction.md') { status = '📖 Narrative'; target = 'N/A' }
    else if (f === '01-playing-the-game.md') { status = '📖 Narrative'; target = 'rules/' }
    else if (f === '02-creating-a-character.md') { status = '📖 Narrative'; target = 'N/A (guide)' }
    else if (f === '03-character-classes.md') { status = '✅ Extracted'; target = 'classes/' }
    else if (f === '04-character-origins.md') { status = '✅ Extracted'; target = 'character/' }
    else if (f === '05-feats.md') { status = '✅ Extracted'; target = 'feats/' }
    else if (f === '06-equipment.md') { status = '✅ Extracted'; target = 'equipment/' }
    else if (f === '07-spells.md') { status = '✅ Extracted'; target = 'spells/' }
    else if (f === 'appendix-a-the-multiverse.md') { status = '📖 Brief'; target = 'world/planes/' }
    else if (f === 'appendix-b-creature-stat-blocks.md') { status = '✅ Extracted'; target = 'character/ + monsters/' }
    else if (f === 'appendix-c-rules-glossary.md') { status = '✅ Extracted'; target = 'rules/' }

    report += `| PHB: ${f} | ${sizeKB}KB | ${status} | ${target} |\n`
}

// DMG
const dmgFiles = fs.readdirSync(DMG_DIR).filter(f => f.endsWith('.md'))
for (const f of dmgFiles) {
    const size = fs.statSync(path.join(DMG_DIR, f)).size
    const sizeKB = (size / 1024).toFixed(0)
    let status = '❓ Unchecked'
    let target = '-'

    if (f === 'ch1-the-basics.md') { status = '📖 Narrative'; target = 'N/A (DM guide)' }
    else if (f === 'ch2-running-the-game.md') { status = '⚠️ Partial'; target = 'dm/ (tables unextracted)' }
    else if (f === 'ch3-dms-toolbox.md') { status = '✅ Extracted'; target = 'dm/ hazards/' }
    else if (f === 'ch4-creating-adventures.md') { status = '⚠️ Unextracted'; target = 'dm/adventure-tables/' }
    else if (f === 'ch5-creating-campaigns.md') { status = '⚠️ Unextracted'; target = 'world/locations/ dm/campaign-tables/' }
    else if (f === 'ch6-cosmology.md') { status = '✅ Extracted'; target = 'world/planes/' }
    else if (f.startsWith('ch7-magic-items-')) { status = '✅ Extracted'; target = 'equipment/magic-items/{rarity}/' }
    else if (f === 'ch7-magic-item-rules.md') { status = '⚠️ Partial'; target = 'dm/loot-tables/' }
    else if (f === 'ch7-treasure-tables.md') { status = '✅ Extracted'; target = 'equipment/gemstones/ art-objects/ trade-*/' }
    else if (f === 'ch8-bastions.md') { status = '✅ Extracted'; target = 'rules/bastions/' }
    else if (f === 'appendix-a-lore-glossary.md') { status = '✅ Extracted'; target = 'world/lore/' }
    else if (f === 'appendix-b-maps.md') { status = '📖 Visual'; target = 'N/A (maps)' }
    else if (f === 'index.md') { status = '📖 Reference'; target = 'N/A (index)' }

    report += `| DMG: ${f} | ${sizeKB}KB | ${status} | ${target} |\n`
}

// MM
report += `| MM: Introduction.md | ${(fs.statSync(path.join(MM_DIR, 'Introduction.md')).size / 1024).toFixed(0)}KB | 📖 Narrative | N/A |\n`
for (const bf of bestiaryFiles) {
    const size = fs.statSync(path.join(bestiaryDir, bf)).size
    report += `| MM: Bestiary/${bf} | ${(size / 1024).toFixed(0)}KB | ✅ Extracted | monsters/ |\n`
}
report += `| MM: NPCs/NPCs.md | ${(fs.statSync(npcPath).size / 1024).toFixed(0)}KB | ✅ Extracted | monsters/humanoid/npc/ |\n`
report += `| MM: Appendices/Creatures.md | ${(fs.statSync(animPath).size / 1024).toFixed(0)}KB | ✅ Extracted | monsters/beast/ |\n`
const mmCRPath = path.join(MM_DIR, 'Appendices/Monsters-by-CR.md')
if (fs.existsSync(mmCRPath)) {
    report += `| MM: Appendices/Monsters-by-CR.md | ${(fs.statSync(mmCRPath).size / 1024).toFixed(0)}KB | 📖 Reference | N/A (index) |\n`
}

report += '\n'

// Write report
fs.writeFileSync(REPORT_PATH, report)

// Console summary
console.log('═══════════════════════════════════════════════════')
console.log('  AUDIT COMPLETE')
console.log('═══════════════════════════════════════════════════')
console.log(`  📊 Total files: ${stats.totalDataFiles}`)
console.log(`  🔴 CRITICAL: ${criticals.length}`)
console.log(`  🟡 WARNING: ${warnings.length}`)
console.log(`  🔵 INFO: ${infos.length}`)
console.log(`  📝 Report saved to: ${REPORT_PATH}`)
console.log('═══════════════════════════════════════════════════')

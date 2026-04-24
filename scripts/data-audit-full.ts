/**
 * Comprehensive D&D 5.5e Data Audit
 * 
 * Checks:
 * 1. All JSON files are valid JSON
 * 2. All files have required fields (name, slug at minimum)
 * 3. No empty files
 * 4. Cross-reference counts against known source data
 * 5. Spot-check specific items for completeness
 * 6. Report any issues found
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e')

interface AuditResult {
    totalFiles: number
    validJson: number
    invalidJson: string[]
    emptyFiles: string[]
    missingName: string[]
    missingSlug: string[]
    zeroByteFiles: string[]
    categories: Record<string, number>
    issues: string[]
    spotChecks: { item: string; status: string; details?: string }[]
}

const result: AuditResult = {
    totalFiles: 0, validJson: 0,
    invalidJson: [], emptyFiles: [], missingName: [], missingSlug: [], zeroByteFiles: [],
    categories: {}, issues: [], spotChecks: []
}

function scanDir(dir: string, category: string) {
    if (!fs.existsSync(dir)) { result.issues.push(`⚠️ Directory missing: ${dir}`); return }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
            scanDir(fullPath, category)
        } else if (entry.name.endsWith('.json')) {
            result.totalFiles++
            result.categories[category] = (result.categories[category] || 0) + 1

            // Check file size
            const stat = fs.statSync(fullPath)
            if (stat.size === 0) {
                result.zeroByteFiles.push(fullPath.replace(ROOT + path.sep, ''))
                return
            }

            // Parse JSON
            try {
                const content = fs.readFileSync(fullPath, 'utf-8')
                const data = JSON.parse(content)
                result.validJson++

                // Check for required fields
                const rel = fullPath.replace(ROOT + path.sep, '')
                if (!data.name && !data.title && !data.label) {
                    result.missingName.push(rel)
                }
                if (!data.slug && !data.id) {
                    result.missingSlug.push(rel)
                }

                // Check for empty descriptions on key items
                if (data.description === '' && !rel.includes('trinkets') && !rel.includes('calendar')) {
                    result.emptyFiles.push(rel)
                }
            } catch (e: any) {
                result.invalidJson.push(fullPath.replace(ROOT + path.sep, '') + `: ${e.message}`)
            }
        }
    }
}

// Scan all top-level categories
const topDirs = fs.readdirSync(ROOT, { withFileTypes: true })
for (const d of topDirs) {
    if (d.isDirectory()) {
        scanDir(path.join(ROOT, d.name), d.name)
    }
}

// ─── CROSS-REFERENCE CHECKS ───

// Expected counts from source books
const expectedCounts: Record<string, { min: number; label: string }> = {
    // PHB
    'equipment/weapons': { min: 38, label: 'PHB Weapons' },
    'equipment/armor': { min: 13, label: 'PHB Armor' },
    'equipment/tools': { min: 37, label: 'PHB Tools' },
    'feats': { min: 75, label: 'PHB Feats' },
    'character/backgrounds': { min: 16, label: 'PHB Backgrounds' },
    'character/species': { min: 10, label: 'PHB Species' },
    // DMG
    'equipment/magic-items': { min: 350, label: 'DMG Magic Items' },
    'world/planes': { min: 30, label: 'DMG Planes' },
    'world/lore': { min: 70, label: 'DMG Lore Glossary' },
    'rules/bastions/facilities': { min: 25, label: 'DMG Bastions' },
    // MM
    'monsters': { min: 450, label: 'MM Creatures' },
}

function countJsonInDir(dir: string): number {
    const fullDir = path.join(ROOT, dir)
    if (!fs.existsSync(fullDir)) return 0
    let count = 0
    function walk(d: string) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.isDirectory()) walk(path.join(d, e.name))
            else if (e.name.endsWith('.json')) count++
        }
    }
    walk(fullDir)
    return count
}

console.log('═══════════════════════════════════════════')
console.log('      D&D 5.5e Data Audit Report')
console.log('═══════════════════════════════════════════')
console.log()

// Top-level summary
console.log(`📊 Total JSON files: ${result.totalFiles}`)
console.log(`✅ Valid JSON: ${result.validJson}`)
console.log(`❌ Invalid JSON: ${result.invalidJson.length}`)
console.log(`📭 Zero-byte files: ${result.zeroByteFiles.length}`)
console.log(`⚠️ Missing name field: ${result.missingName.length}`)
console.log(`⚠️ Missing slug/id field: ${result.missingSlug.length}`)
console.log(`📝 Empty descriptions: ${result.emptyFiles.length}`)
console.log()

// Category breakdown
console.log('── Files by Category ──')
for (const [cat, count] of Object.entries(result.categories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat.padEnd(20)} ${count}`)
}
console.log()

// Cross-reference checks
console.log('── Cross-Reference Checks ──')
let crossRefIssues = 0
for (const [dir, expected] of Object.entries(expectedCounts)) {
    const actual = countJsonInDir(dir)
    const status = actual >= expected.min ? '✅' : '❌'
    if (actual < expected.min) crossRefIssues++
    console.log(`  ${status} ${expected.label.padEnd(25)} Expected ≥${expected.min}, Found: ${actual}`)
}
console.log()

// Spot-check specific items
console.log('── Spot Checks (specific items) ──')

const spotChecks = [
    // PHB Weapons
    { path: 'equipment/weapons/longsword.json', checks: ['damage', 'properties', 'weight', 'cost'] },
    { path: 'equipment/weapons/longbow.json', checks: ['damage', 'properties', 'weight'] },
    // PHB Armor
    { path: 'equipment/armor/plate-armor.json', checks: ['ac', 'weight', 'cost'] },
    { path: 'equipment/armor/chain-mail.json', checks: ['ac', 'weight'] },
    // PHB Species
    { path: 'character/species/elf.json', checks: ['traits', 'creatureType', 'speed'] },
    { path: 'character/species/dwarf.json', checks: ['traits', 'creatureType', 'speed'] },
    { path: 'character/species/tiefling.json', checks: ['traits', 'creatureType'] },
    // PHB Backgrounds
    { path: 'character/backgrounds/acolyte.json', checks: ['abilityScores', 'feat', 'skillProficiencies'] },
    { path: 'character/backgrounds/soldier.json', checks: ['abilityScores', 'feat', 'skillProficiencies'] },
    // PHB Feats
    { path: 'feats/general/alert.json', checks: ['description', 'prerequisite'] },
    { path: 'feats/epic-boon/boon-of-fate.json', checks: ['description'] },
    // DMG Magic Items
    { path: 'equipment/magic-items/rare/bag-of-beans.json', checks: ['type', 'rarity', 'description'] },
    { path: 'equipment/magic-items/legendary/holy-avenger.json', checks: ['type', 'rarity', 'description'] },
    { path: 'equipment/magic-items/artifact/blackrazor.json', checks: ['type', 'rarity', 'description'] },
    // DMG Planes
    { path: 'world/planes/outer/nine-hells.json', checks: ['category', 'description'] },
    { path: 'world/planes/transitive/feywild.json', checks: ['category', 'description'] },
    // Lore
    { path: 'world/lore/drizzt-do-urden.json', checks: ['description'] },
    { path: 'world/lore/vecna.json', checks: ['description'] },
    // Rules
    { path: 'rules/glossary/concentration.json', checks: ['description'] },
    { path: 'rules/conditions/stunned.json', checks: ['description'] },
    // Bastions
    { path: 'rules/bastions/facilities/arcane-study.json', checks: ['type', 'description'] },
    // MM Creatures
    { path: 'monsters/aberration/aboleth.json', checks: ['ac', 'hp', 'cr', 'actions', 'traits'] },
    { path: 'monsters/dragon/adult-red-dragon.json', checks: ['ac', 'hp', 'cr', 'actions'] },
    { path: 'monsters/undead/vampire.json', checks: ['ac', 'hp', 'cr', 'actions'] },
    { path: 'monsters/fiend/balor.json', checks: ['ac', 'hp', 'cr', 'actions'] },
    { path: 'monsters/humanoid/npc/assassin.json', checks: ['ac', 'hp', 'cr', 'actions'] },
    // MM Animals
    { path: 'monsters/beast/wolf.json', checks: ['ac', 'hp', 'cr'] },
    { path: 'monsters/beast/giant-ape.json', checks: ['ac', 'hp', 'cr', 'actions'] },
]

let spotPassed = 0, spotFailed = 0
for (const check of spotChecks) {
    const fullPath = path.join(ROOT, check.path)
    if (!fs.existsSync(fullPath)) {
        console.log(`  ❌ MISSING: ${check.path}`)
        spotFailed++
        continue
    }
    try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
        const missing = check.checks.filter(field => {
            const val = data[field]
            if (val === undefined || val === null) return true
            if (typeof val === 'string' && val === '') return true
            if (Array.isArray(val) && val.length === 0) return true
            return false
        })
        if (missing.length > 0) {
            console.log(`  ⚠️ INCOMPLETE: ${check.path} — missing: ${missing.join(', ')}`)
            spotFailed++
        } else {
            console.log(`  ✅ ${check.path}`)
            spotPassed++
        }
    } catch (_e) {
        console.log(`  ❌ PARSE ERROR: ${check.path}`)
        spotFailed++
    }
}
console.log()
console.log(`  Spot checks: ${spotPassed} passed, ${spotFailed} failed`)
console.log()

// Print any issues
if (result.invalidJson.length > 0) {
    console.log('── Invalid JSON Files ──')
    result.invalidJson.forEach(f => console.log(`  ❌ ${f}`))
    console.log()
}

if (result.zeroByteFiles.length > 0) {
    console.log('── Zero-Byte Files ──')
    result.zeroByteFiles.forEach(f => console.log(`  📭 ${f}`))
    console.log()
}

if (result.missingName.length > 0 && result.missingName.length <= 20) {
    console.log('── Files Missing Name ──')
    result.missingName.forEach(f => console.log(`  ⚠️ ${f}`))
    console.log()
} else if (result.missingName.length > 20) {
    console.log(`── ${result.missingName.length} files missing name field (showing first 10) ──`)
    result.missingName.slice(0, 10).forEach(f => console.log(`  ⚠️ ${f}`))
    console.log()
}

if (result.emptyFiles.length > 0 && result.emptyFiles.length <= 20) {
    console.log('── Files With Empty Descriptions ──')
    result.emptyFiles.forEach(f => console.log(`  📝 ${f}`))
    console.log()
} else if (result.emptyFiles.length > 20) {
    console.log(`── ${result.emptyFiles.length} files with empty descriptions (showing first 10) ──`)
    result.emptyFiles.slice(0, 10).forEach(f => console.log(`  📝 ${f}`))
    console.log()
}

// ─── SOURCE CROSS-REFERENCE: Check for missing known items ───
console.log('── Missing Known Items Check ──')

const knownMonsters = ['aboleth', 'beholder', 'mind-flayer', 'dragon-turtle', 'tarrasque', 'lich', 'pit-fiend', 'balor', 'solar', 'vampire', 'kraken', 'beholder-zombie']
let missingMonsters: string[] = []
for (const m of knownMonsters) {
    // Search all monster subdirs
    let found = false
    function searchMon(dir: string) {
        if (!fs.existsSync(dir)) return
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) searchMon(path.join(dir, e.name))
            else if (e.name === `${m}.json`) found = true
        }
    }
    searchMon(path.join(ROOT, 'monsters'))
    if (!found) missingMonsters.push(m)
}
if (missingMonsters.length > 0) {
    console.log(`  ⚠️ Missing known monsters: ${missingMonsters.join(', ')}`)
} else {
    console.log(`  ✅ All ${knownMonsters.length} iconic monsters found`)
}

const knownMagicItems = ['vorpal-sword', 'deck-of-many-things', 'bag-of-holding', 'staff-of-the-magi', 'ring-of-invisibility', 'cloak-of-invisibility', 'holy-avenger']
let missingItems: string[] = []
for (const mi of knownMagicItems) {
    let found = false
    function searchItem(dir: string) {
        if (!fs.existsSync(dir)) return
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) searchItem(path.join(dir, e.name))
            else if (e.name === `${mi}.json`) found = true
        }
    }
    searchItem(path.join(ROOT, 'equipment/magic-items'))
    if (!found) missingItems.push(mi)
}
if (missingItems.length > 0) {
    console.log(`  ⚠️ Missing known magic items: ${missingItems.join(', ')}`)
} else {
    console.log(`  ✅ All ${knownMagicItems.length} iconic magic items found`)
}

const knownSpecies = ['aasimar', 'dragonborn', 'dwarf', 'elf', 'gnome', 'goliath', 'halfling', 'human', 'orc', 'tiefling']
let missingSp = knownSpecies.filter(s => !fs.existsSync(path.join(ROOT, 'character/species', `${s}.json`)))
if (missingSp.length > 0) {
    console.log(`  ⚠️ Missing species: ${missingSp.join(', ')}`)
} else {
    console.log(`  ✅ All ${knownSpecies.length} PHB species found`)
}

const knownBgs = ['acolyte', 'artisan', 'charlatan', 'criminal', 'entertainer', 'farmer', 'guard', 'guide', 'hermit', 'merchant', 'noble', 'sage', 'sailor', 'scribe', 'soldier', 'wayfarer']
let missingBg = knownBgs.filter(b => !fs.existsSync(path.join(ROOT, 'character/backgrounds', `${b}.json`)))
if (missingBg.length > 0) {
    console.log(`  ⚠️ Missing backgrounds: ${missingBg.join(', ')}`)
} else {
    console.log(`  ✅ All ${knownBgs.length} PHB backgrounds found`)
}

console.log()
console.log('═══════════════════════════════════════════')
const totalIssues = result.invalidJson.length + result.zeroByteFiles.length + crossRefIssues + spotFailed + missingMonsters.length + missingItems.length + missingSp.length + missingBg.length
if (totalIssues === 0) {
    console.log('  🎉 ALL CHECKS PASSED — Data is complete!')
} else {
    console.log(`  ⚠️ ${totalIssues} issue(s) found — review above`)
}
console.log('═══════════════════════════════════════════')

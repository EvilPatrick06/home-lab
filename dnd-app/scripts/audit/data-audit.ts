/**
 * Phase 6 — Comprehensive Data Audit v2
 *
 * Walks all data/5e/ directories, validates JSON files, classifies empty dirs,
 * cross-references against MM/PHB/DMG source files to find missing data,
 * checks schema consistency, and generates a comprehensive report.
 *
 * Usage: npx tsx scripts/data-audit.ts
 */

import fs from 'fs'
import path from 'path'
import { get5eReferencesDir } from '../lib/5e-refs-path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e')
const REF_DIR = get5eReferencesDir()

// ── Stats ──

interface AuditStats {
    totalFiles: number
    validFiles: number
    emptyFiles: number
    invalidFiles: number
    truncatedFiles: number
    errorObjects: number
    totalDirs: number
    emptyDirs: { path: string; classification: string }[]
    errors: { file: string; message: string }[]
    warnings: { file: string; message: string }[]
    info: string[]
    missingMonsters: string[]
    missingMagicItems: string[]
    missingSpecies: string[]
    missingBackgrounds: string[]
    missingFeats: string[]
    missingEquipment: string[]
    missingLanguages: string[]
    missingBastions: string[]
    missingTemplates: string[]
    missingNPCs: string[]
    missingCreatures: string[]
    missingWorld: string[]
    missingHazards: string[]
    schemaIssues: { domain: string; file: string; issue: string }[]
    domainCounts: Record<string, number>
}

const stats: AuditStats = {
    totalFiles: 0,
    validFiles: 0,
    emptyFiles: 0,
    invalidFiles: 0,
    truncatedFiles: 0,
    errorObjects: 0,
    totalDirs: 0,
    emptyDirs: [],
    errors: [],
    warnings: [],
    info: [],
    missingMonsters: [],
    missingMagicItems: [],
    missingSpecies: [],
    missingBackgrounds: [],
    missingFeats: [],
    missingEquipment: [],
    missingLanguages: [],
    missingBastions: [],
    missingTemplates: [],
    missingNPCs: [],
    missingCreatures: [],
    missingWorld: [],
    missingHazards: [],
    schemaIssues: [],
    domainCounts: {}
}

// ── Helpers ──

function kebab(s: string): string {
    return s
        .replace(/[''\u2019`]/g, '')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

function readJson(filePath: string): unknown | null {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8')
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function walkDirs(dir: string): string[] {
    const results: string[] = []
    if (!fs.existsSync(dir)) return results
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            results.push(full)
            results.push(...walkDirs(full))
        }
    }
    return results
}

function walkFiles(dir: string): string[] {
    const results: string[] = []
    if (!fs.existsSync(dir)) return results
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            results.push(...walkFiles(full))
        } else if (entry.name.endsWith('.json')) {
            results.push(full)
        }
    }
    return results
}

function getDomain(relPath: string): string {
    if (relPath.startsWith('spells/')) return 'spell'
    if (relPath.includes('magic-items')) return 'magic-item'
    if (relPath.includes('monsters/') || relPath.includes('creatures-companions')) return 'monster'
    if (relPath.startsWith('classes/')) return 'class'
    if (relPath.startsWith('rules/conditions/')) return 'condition'
    if (relPath.startsWith('rules/')) return 'rules'
    if (relPath.startsWith('world/environments/')) return 'environment'
    if (relPath.startsWith('world/')) return 'world'
    if (relPath.startsWith('equipment/')) return 'equipment'
    if (relPath.startsWith('origins/')) return 'origins'
    if (relPath.startsWith('feats/')) return 'feats'
    if (relPath.startsWith('dm/')) return 'dm'
    if (relPath.startsWith('hazards/')) return 'hazards'
    if (relPath.startsWith('character/')) return 'character'
    if (relPath.startsWith('game/')) return 'game'
    return 'other'
}

// ── Homebrew-only directories ──

const HOMEBREW_DIRS = new Set([
    'dm/npcs/custom-monsters',
    'dm/adventures/one-shots',
    'dm/adventures/campaigns',
    'spells/custom-spells',
    'character/spellbooks',
    'character/companions/pets',
    'character/companions/mounts',
    'character/companions/hirelings',
    'character/supernatural-gifts',
    'equipment/magic-items/cursed-items',
    'equipment/magic-items/sentient-items',
    'equipment/recipes',
])

// ── Expected data from sources ──

const EXPECTED_DATA_DIRS: Record<string, string> = {
    'origins/species': 'PHB Ch4 — Species (Aasimar, Dragonborn, Dwarf, etc.)',
    'origins/backgrounds': 'PHB Ch4 — Backgrounds (Acolyte, Artisan, etc.)',
    'feats/origin': 'PHB Ch5 — Origin Feats',
    'feats/general': 'PHB Ch5 — General Feats',
    'feats/fighting-style': 'PHB Ch5 — Fighting Style Feats',
    'feats/epic-boon': 'PHB Ch5 — Epic Boon Feats',
    'equipment/armor/heavy': 'PHB Ch6 — Heavy Armor',
    'equipment/armor/light': 'PHB Ch6 — Light Armor',
    'equipment/armor/medium': 'PHB Ch6 — Medium Armor',
    'equipment/armor/shields': 'PHB Ch6 — Shields',
    'equipment/weapons/simple-weapons/melee': 'PHB Ch6 — Simple Melee Weapons',
    'equipment/weapons/simple-weapons/ranged': 'PHB Ch6 — Simple Ranged Weapons',
    'equipment/weapons/martial-weapons/melee': 'PHB Ch6 — Martial Melee Weapons',
    'equipment/weapons/martial-weapons/ranged': 'PHB Ch6 — Martial Ranged Weapons',
    'equipment/items/adventuring-gear': 'PHB Ch6 — Adventuring Gear',
    'equipment/tools/artisan-tools': 'PHB Ch6 — Artisan Tools',
    'equipment/tools/gaming-sets': 'PHB Ch6 — Gaming Sets',
    'equipment/tools/musical-instruments': 'PHB Ch6 — Musical Instruments',
    'equipment/weapons/masteries': 'PHB Ch6 — Weapon Masteries',
    'equipment/bundles': 'PHB Ch6 — Equipment Bundles',
    // Outer Planes (17)
    'world/planes/outer/abyss': 'DMG Ch6 — The Abyss (CE)',
    'world/planes/outer/acheron': 'DMG Ch6 — Acheron (LE/LN)',
    'world/planes/outer/arborea': 'DMG Ch6 — Arborea (CG)',
    'world/planes/outer/arcadia': 'DMG Ch6 — Arcadia (LG/LN)',
    'world/planes/outer/beastlands': 'DMG Ch6 — Beastlands (CG/NG)',
    'world/planes/outer/bytopia': 'DMG Ch6 — Bytopia (LG/NG)',
    'world/planes/outer/carceri': 'DMG Ch6 — Carceri (CE/NE)',
    'world/planes/outer/elysium': 'DMG Ch6 — Elysium (NG)',
    'world/planes/outer/gehenna': 'DMG Ch6 — Gehenna (LE/NE)',
    'world/planes/outer/hades': 'DMG Ch6 — Hades (NE)',
    'world/planes/outer/limbo': 'DMG Ch6 — Limbo (CN)',
    'world/planes/outer/mechanus': 'DMG Ch6 — Mechanus (LN)',
    'world/planes/outer/mount-celestia': 'DMG Ch6 — Mount Celestia (LG)',
    'world/planes/outer/nine-hells': 'DMG Ch6 — Nine Hells (LE)',
    'world/planes/outer/outlands': 'DMG Ch6 — Outlands (N)',
    'world/planes/outer/pandemonium': 'DMG Ch6 — Pandemonium (CE/CN)',
    'world/planes/outer/ysgard': 'DMG Ch6 — Ysgard (CG/CN)',
    // Inner Planes (4 Elemental + 4 Para-elemental)
    'world/planes/inner/elemental-air': 'DMG Ch6 — Elemental Plane of Air',
    'world/planes/inner/elemental-earth': 'DMG Ch6 — Elemental Plane of Earth',
    'world/planes/inner/elemental-fire': 'DMG Ch6 — Elemental Plane of Fire',
    'world/planes/inner/elemental-water': 'DMG Ch6 — Elemental Plane of Water',
    'world/planes/inner/para-ash': 'DMG Ch6 — Para-elemental Plane of Ash',
    'world/planes/inner/para-ice': 'DMG Ch6 — Para-elemental Plane of Ice',
    'world/planes/inner/para-magma': 'DMG Ch6 — Para-elemental Plane of Magma',
    'world/planes/inner/para-ooze': 'DMG Ch6 — Para-elemental Plane of Ooze',
    // Transitive Planes
    'world/planes/transitive/astral-plane': 'DMG Ch6 — Astral Plane',
    'world/planes/transitive/ethereal-plane': 'DMG Ch6 — Ethereal Plane',
    // Material Echoes
    'world/planes/material/feywild': 'DMG Ch6 — The Feywild',
    'world/planes/material/shadowfell': 'DMG Ch6 — The Shadowfell',
    'world/planes/material/material-plane': 'DMG Ch6 — The Material Plane',
    // Other
    'world/planes/other/far-realm': 'DMG Ch6 — The Far Realm',
    'world/planes/other/positive-plane': 'DMG Ch6 — Positive Plane',
    'world/planes/other/negative-plane': 'DMG Ch6 — Negative Plane',
    'world/planes/other/sigil': 'DMG Ch6 — Sigil, City of Doors',
    'world/deities': 'DMG Ch3/Appendix A — Deity Pantheons',
    'world/factions': 'DMG Ch5 — Factions',
    'world/languages/standard': 'PHB Ch2 — Standard Languages',
    'world/languages/rare': 'PHB Ch2 — Rare Languages',
    'world/calendar': 'DMG Ch5 — Greyhawk Calendar',
    'world/scripts': 'PHB Ch2 — Writing Scripts',
    'hazards/diseases': 'DMG Ch3 — Diseases',
    'hazards/environmental': 'DMG Ch3 — Environmental Hazards',
    'hazards/traps/mechanical': 'DMG Ch3 — Mechanical Traps',
    'hazards/traps/magical': 'DMG Ch3 — Magical Traps',
    'dm/loot-tables': 'DMG Ch7 — Treasure Tables',
    'dm/shops': 'DMG Ch3 — Random Shops',
    'dm/rewards/marks-of-prestige': 'DMG Ch3 — Marks of Prestige',
    'dm/npcs/townsfolk': 'MM NPCs.md — Commoner, Guard, etc.',
    'dm/npcs/sentient-items': 'DMG Ch7 — Sentient Magic Items',
    'dm/npcs/creatures-companions': 'MM Creatures.md — Beasts/Animals',
    'dm/adventures/encounters/combat': 'DMG Ch3 — Combat Encounter Templates',
    'dm/adventures/encounters/social': 'DMG Ch3 — Social Encounter Templates',
    'dm/adventures/encounters/puzzles': 'DMG Ch3 — Puzzle Templates',
    'rules/damage-types': 'PHB Ch1 — Damage Types',
    'rules/afflictions': 'DMG Ch3 — Curses',
    'rules/chases': 'DMG Ch3 — Chase Rules',
    'rules/downtime': 'DMG Ch3/Ch8 — Downtime Activities',
    'rules/time': 'PHB Ch1 — Time Tracking',
    'rules/tool-properties': 'PHB Ch6 — Tool Descriptions',
    'rules/weapon-properties': 'PHB Ch6 — Weapon Properties',
}

// ── 1. Parse MM Monsters-by-CR ──

function parseMMCreatures(): string[] {
    const mmCR = path.join(REF_DIR, 'MM2025/Markdown/Appendices/Monsters-by-CR.md')
    if (!fs.existsSync(mmCR)) return []
    const content = fs.readFileSync(mmCR, 'utf-8')
    const creatures: string[] = []
    for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('- ')) {
            creatures.push(trimmed.slice(2).trim())
        }
    }
    return creatures
}

// ── 2. Parse MM Creatures Appendix (beasts) ──

function parseMMBeasts(): string[] {
    const creaturesFile = path.join(REF_DIR, 'MM2025/Markdown/Appendices/Creatures.md')
    if (!fs.existsSync(creaturesFile)) return []
    const content = fs.readFileSync(creaturesFile, 'utf-8')
    const beasts: string[] = []
    for (const line of content.split('\n')) {
        const match = line.match(/^### (.+)/)
        if (match) beasts.push(match[1].trim())
    }
    return beasts
}

// ── 3. Validate files ──

function auditFiles(): void {
    const allFiles = walkFiles(ROOT)

    for (const file of allFiles) {
        stats.totalFiles++
        const relPath = path.relative(ROOT, file).replace(/\\/g, '/')
        const domain = getDomain(relPath)
        stats.domainCounts[domain] = (stats.domainCounts[domain] || 0) + 1

        const stat = fs.statSync(file)

        // Check truncated
        if (stat.size < 20) {
            stats.truncatedFiles++
            stats.errors.push({ file: relPath, message: `Truncated (${stat.size} bytes)` })
            continue
        }

        const data = readJson(file)
        if (data === null) {
            stats.invalidFiles++
            stats.errors.push({ file: relPath, message: 'Invalid JSON (parse error)' })
            continue
        }

        // Check if empty object/array
        if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data as Record<string, unknown>)
            if (keys.length === 0 || (Array.isArray(data) && (data as unknown[]).length === 0)) {
                stats.emptyFiles++
                stats.warnings.push({ file: relPath, message: 'Empty JSON object/array' })
                continue
            }
        }

        // Check for ITEM_NOT_FOUND errors (magic items)
        if (typeof data === 'object' && !Array.isArray(data)) {
            const obj = data as Record<string, unknown>
            if (obj.error === 'ITEM_NOT_FOUND' || obj.error) {
                stats.errorObjects++
                stats.errors.push({ file: relPath, message: `Error object: ${obj.error}` })
                continue
            }
        }

        stats.validFiles++

        // Schema consistency checks
        if (domain === 'spell') {
            const obj = data as Record<string, unknown>
            if (!obj.name) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing name field' })
            if (obj.level === undefined) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing level field' })
            if (!obj.school) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing school field' })
        }

        if (domain === 'monster') {
            const obj = data as Record<string, unknown>
            if (!obj.name) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing name field' })
            if (!obj.creatureType && !obj.type) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing creatureType field' })
            if (obj.type && !obj.creatureType) stats.schemaIssues.push({ domain, file: relPath, issue: 'Uses "type" instead of "creatureType"' })
        }

        if (domain === 'magic-item') {
            const obj = data as Record<string, unknown>
            if (!obj.name && !obj.itemName) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing name/itemName field' })
            if (!obj.rarity && !obj.rarityLevel) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing rarity field' })
        }

        if (domain === 'class') {
            const obj = data as Record<string, unknown>
            if (!obj.name) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing name field' })
            if (!obj.hitDie && !obj.hitDice) stats.schemaIssues.push({ domain, file: relPath, issue: 'Missing hitDie/hitDice field' })
        }
    }
}

// ── 4. Classify empty directories ──

function auditDirectories(): void {
    const allDirs = walkDirs(ROOT)

    for (const dir of allDirs) {
        stats.totalDirs++
        const relPath = path.relative(ROOT, dir).replace(/\\/g, '/')
        const jsonFiles = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
        const subDirs = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory())

        // Only flag truly empty leaf dirs
        if (jsonFiles.length === 0 && subDirs.length === 0) {
            let classification = '🟢 HOMEBREW'

            if (HOMEBREW_DIRS.has(relPath)) {
                classification = '🟢 HOMEBREW'
            } else if (EXPECTED_DATA_DIRS[relPath]) {
                classification = `🔴 MISSING DATA — ${EXPECTED_DATA_DIRS[relPath]}`
            } else {
                // Check if any parent or partial match
                const matchedKey = Object.keys(EXPECTED_DATA_DIRS).find(k => relPath.startsWith(k) || k.startsWith(relPath))
                if (matchedKey) {
                    classification = `🟡 EXPECTED — Related to ${EXPECTED_DATA_DIRS[matchedKey]}`
                }
            }

            stats.emptyDirs.push({ path: relPath, classification })
        }
    }
}

// ── 5. Cross-reference against MM ──

function crossRefMonsters(): void {
    const mmCreatures = parseMMCreatures()
    const existingFiles = walkFiles(path.join(ROOT, 'dm/npcs/monsters'))
        .map(f => path.basename(f, '.json'))

    for (const creature of mmCreatures) {
        const k = kebab(creature)
        if (!existingFiles.some(f => f === k || f.includes(k) || k.includes(f))) {
            stats.missingMonsters.push(creature)
        }
    }
}

// ── 6. Cross-reference beasts ──

function crossRefBeasts(): void {
    const beasts = parseMMBeasts()
    const existingMonsters = walkFiles(path.join(ROOT, 'dm/npcs/monsters'))
        .map(f => path.basename(f, '.json'))
    const existingCompanions = walkFiles(path.join(ROOT, 'dm/npcs/creatures-companions'))
        .map(f => path.basename(f, '.json'))
    const all = [...existingMonsters, ...existingCompanions]

    for (const beast of beasts) {
        const k = kebab(beast)
        if (!all.some(f => f === k || f.includes(k) || k.includes(f))) {
            stats.missingCreatures.push(beast)
        }
    }
}

// ── 7. Check species/backgrounds/feats ──

function crossRefOrigins(): void {
    const species = ['aasimar', 'dragonborn', 'dwarf', 'elf', 'gnome', 'goliath', 'halfling', 'human', 'orc', 'tiefling']
    const backgrounds = ['acolyte', 'artisan', 'charlatan', 'criminal', 'entertainer', 'farmer', 'guard', 'guide', 'hermit', 'merchant', 'noble', 'sage', 'sailor', 'scribe', 'soldier', 'wayfarer']

    const existingSpecies = walkFiles(path.join(ROOT, 'origins/species')).map(f => path.basename(f, '.json'))
    const existingBG = walkFiles(path.join(ROOT, 'origins/backgrounds')).map(f => path.basename(f, '.json'))

    for (const s of species) { if (!existingSpecies.includes(s)) stats.missingSpecies.push(s) }
    for (const b of backgrounds) { if (!existingBG.includes(b)) stats.missingBackgrounds.push(b) }
}

// ── 8. Check languages ──

function crossRefLanguages(): void {
    const standardLangs = ['common', 'common-sign-language', 'draconic', 'dwarvish', 'elvish', 'giant', 'gnomish', 'goblin', 'halfling', 'orc']
    const rareLangs = ['abyssal', 'celestial', 'deep-speech', 'druidic', 'infernal', 'primordial', 'sylvan', 'thieves-cant', 'undercommon']

    const existingStd = walkFiles(path.join(ROOT, 'world/languages/standard')).map(f => path.basename(f, '.json'))
    const existingRare = walkFiles(path.join(ROOT, 'world/languages/rare')).map(f => path.basename(f, '.json'))

    for (const l of standardLangs) { if (!existingStd.includes(l)) stats.missingLanguages.push(`Standard: ${l}`) }
    for (const l of rareLangs) { if (!existingRare.includes(l)) stats.missingLanguages.push(`Rare: ${l}`) }
}

// ── Generate Report ──

function generateReport(): void {
    const lines: string[] = []
    const hr = '---'

    lines.push('# Comprehensive Data Audit Report')
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push('')

    // Summary
    lines.push('## Summary')
    lines.push('| Metric | Count |')
    lines.push('|--------|-------|')
    lines.push(`| Total JSON files | ${stats.totalFiles} |`)
    lines.push(`| Valid (parseable with data) | ${stats.validFiles} |`)
    lines.push(`| Empty / placeholder | ${stats.emptyFiles} |`)
    lines.push(`| Invalid JSON (parse errors) | ${stats.invalidFiles} |`)
    lines.push(`| Truncated (<20 bytes) | ${stats.truncatedFiles} |`)
    lines.push(`| Error objects (ITEM_NOT_FOUND) | ${stats.errorObjects} |`)
    lines.push(`| Total directories | ${stats.totalDirs} |`)
    lines.push(`| Empty directories | ${stats.emptyDirs.length} |`)
    lines.push(`| Schema inconsistencies | ${stats.schemaIssues.length} |`)
    lines.push(`| **Errors** | **${stats.errors.length}** |`)
    lines.push(`| **Warnings** | **${stats.warnings.length}** |`)
    lines.push('')

    // Domain breakdown
    lines.push('## Files by Domain')
    lines.push('| Domain | Count |')
    lines.push('|--------|-------|')
    for (const [domain, count] of Object.entries(stats.domainCounts).sort((a, b) => b[1] - a[1])) {
        lines.push(`| ${domain} | ${count} |`)
    }
    lines.push('')

    // Missing data summary
    lines.push('## Missing Data Summary')
    lines.push('| Category | Missing Count | Status |')
    lines.push('|----------|---------------|--------|')
    lines.push(`| Monsters (MM) | ${stats.missingMonsters.length} | ❌ Need extraction |`)
    lines.push(`| Beasts/Creatures (MM Appendix) | ${stats.missingCreatures.length} | ❌ Need extraction |`)
    lines.push(`| Species (PHB) | ${stats.missingSpecies.length} | ❌ Need extraction |`)
    lines.push(`| Backgrounds (PHB) | ${stats.missingBackgrounds.length} | ❌ Need extraction |`)
    lines.push(`| Languages (PHB) | ${stats.missingLanguages.length} | ❌ Need extraction |`)
    lines.push(`| Magic Item Error Objects | ${stats.errorObjects} | ❌ Need re-extraction |`)
    lines.push('')

    // Empty directories
    lines.push('## Empty Directories')
    lines.push('')
    const critical = stats.emptyDirs.filter(d => d.classification.startsWith('🔴'))
    const expected = stats.emptyDirs.filter(d => d.classification.startsWith('🟡'))
    const homebrew = stats.emptyDirs.filter(d => d.classification.startsWith('🟢'))

    if (critical.length > 0) {
        lines.push(`### 🔴 Critical — Missing Source Data (${critical.length})`)
        lines.push('| Directory | Source |')
        lines.push('|-----------|--------|')
        for (const d of critical) {
            lines.push(`| \`${d.path}\` | ${d.classification.replace('🔴 MISSING DATA — ', '')} |`)
        }
        lines.push('')
    }

    if (expected.length > 0) {
        lines.push(`### 🟡 Expected — Related Source Data (${expected.length})`)
        for (const d of expected) {
            lines.push(`- \`${d.path}\` — ${d.classification.replace('🟡 EXPECTED — ', '')}`)
        }
        lines.push('')
    }

    if (homebrew.length > 0) {
        lines.push(`### 🟢 Homebrew — Intentionally Empty (${homebrew.length})`)
        for (const d of homebrew) {
            lines.push(`- \`${d.path}\``)
        }
        lines.push('')
    }

    // Missing monsters
    if (stats.missingMonsters.length > 0) {
        lines.push(hr)
        lines.push(`## Missing Monsters (${stats.missingMonsters.length})`)
        lines.push('These creatures are listed in the MM Monsters-by-CR index but have no JSON file:')
        lines.push('')
        for (const m of stats.missingMonsters) {
            lines.push(`- ${m}`)
        }
        lines.push('')
    }

    // Missing creatures/beasts
    if (stats.missingCreatures.length > 0) {
        lines.push(hr)
        lines.push(`## Missing Creatures/Beasts (${stats.missingCreatures.length})`)
        lines.push('These beasts are in MM Appendix A (Creatures.md) but have no JSON file:')
        lines.push('')
        for (const c of stats.missingCreatures) {
            lines.push(`- ${c}`)
        }
        lines.push('')
    }

    // Schema issues
    if (stats.schemaIssues.length > 0) {
        lines.push(hr)
        lines.push(`## Schema Inconsistencies (${stats.schemaIssues.length})`)
        lines.push('| Domain | File | Issue |')
        lines.push('|--------|------|-------|')
        for (const s of stats.schemaIssues.slice(0, 50)) {
            lines.push(`| ${s.domain} | \`${s.file}\` | ${s.issue} |`)
        }
        if (stats.schemaIssues.length > 50) lines.push(`| ... | ... | +${stats.schemaIssues.length - 50} more |`)
        lines.push('')
    }

    // Errors
    if (stats.errors.length > 0) {
        lines.push(hr)
        lines.push(`## Errors (${stats.errors.length})`)
        lines.push('| File | Issue |')
        lines.push('|------|-------|')
        for (const e of stats.errors.slice(0, 50)) {
            lines.push(`| \`${e.file}\` | ${e.message} |`)
        }
        if (stats.errors.length > 50) lines.push(`| ... | +${stats.errors.length - 50} more |`)
        lines.push('')
    }

    // Write report
    const reportPath = path.join(process.cwd(), 'data-audit-report.md')
    fs.writeFileSync(reportPath, lines.join('\n'))

    // Console summary
    console.log('📊 Running Comprehensive Data Audit v2...\n')
    console.log(`   ${stats.totalFiles} total files | ${stats.validFiles} valid | ${stats.emptyFiles} empty | ${stats.invalidFiles} invalid | ${stats.truncatedFiles} truncated`)
    console.log(`   ${stats.errorObjects} error objects | ${stats.schemaIssues.length} schema issues`)
    console.log(`   ${stats.emptyDirs.length} empty dirs (${critical.length} critical, ${expected.length} expected, ${homebrew.length} homebrew)`)
    console.log(`   Missing: ${stats.missingMonsters.length} monsters, ${stats.missingCreatures.length} beasts, ${stats.missingSpecies.length} species, ${stats.missingBackgrounds.length} backgrounds, ${stats.missingLanguages.length} languages`)
    console.log(`\n📑 Audit report written to: ${reportPath}`)
}

// ── Main ──

function main(): void {
    auditFiles()
    auditDirectories()
    crossRefMonsters()
    crossRefBeasts()
    crossRefOrigins()
    crossRefLanguages()
    generateReport()
}

main()

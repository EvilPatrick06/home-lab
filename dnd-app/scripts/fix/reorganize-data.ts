/**
 * Phase 6 — Step 2: File Reorganization
 *
 * Moves every JSON file to its correct location per the Research Notes spec.
 * - Spells: sorted by school/level into cantrips/ and prepared-spells/
 * - Monsters: sorted by creatureType into subdirectories
 * - Magic items: error objects flagged, valid items left for future rarity sort
 * - Multi-creature arrays: split into individual files
 * - Spell wrappers: flattened from { spells: [...] } to root level
 * - All missing spec directories created
 * - Phase 5 files deleted
 *
 * Usage: npx tsx scripts/reorganize-data.ts [--dry-run]
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e')
const DRY_RUN = process.argv.includes('--dry-run')

// ── Stats ──

const stats = {
    moved: 0,
    split: 0,
    flattened: 0,
    dirsCreated: 0,
    deleted: 0,
    errorObjects: 0,
    skipped: 0,
    flaggedForReExtract: [] as string[],
    errors: [] as string[]
}

// ── Helpers ──

function kebab(s: string): string {
    return s
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[''`]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase()
}

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        if (!DRY_RUN) fs.mkdirSync(dir, { recursive: true })
        stats.dirsCreated++
    }
}

function moveFile(src: string, dest: string): void {
    if (src === dest) return
    ensureDir(path.dirname(dest))
    if (!DRY_RUN) {
        fs.copyFileSync(src, dest)
        fs.unlinkSync(src)
    }
    stats.moved++
    const relSrc = path.relative(ROOT, src).replace(/\\/g, '/')
    const relDest = path.relative(ROOT, dest).replace(/\\/g, '/')
    console.log(`  📦 ${relSrc} → ${relDest}`)
}

function writeJson(filePath: string, data: unknown): void {
    ensureDir(path.dirname(filePath))
    if (!DRY_RUN) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    }
}

function readJson(filePath: string): unknown | null {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
        return null
    }
}

// ── Spell Reorganization ──

const VALID_SCHOOLS = [
    'abjuration', 'conjuration', 'divination', 'enchantment',
    'evocation', 'illusion', 'necromancy', 'transmutation'
]

function reorganizeSpells(): void {
    console.log('\n🔮 REORGANIZING SPELLS...')
    const spellDir = path.join(ROOT, 'spells/custom-spells')
    if (!fs.existsSync(spellDir)) return

    const files = fs.readdirSync(spellDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
        const filePath = path.join(spellDir, file)
        const raw = readJson(filePath)
        if (!raw) {
            stats.flaggedForReExtract.push(`spells/custom-spells/${file}`)
            continue
        }

        let spellData: Record<string, unknown>

        // Handle wrapper pattern: { spells: [...] }
        if (typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).spells) {
            const spells = (raw as Record<string, unknown>).spells as unknown[]
            if (Array.isArray(spells) && spells.length > 0) {
                spellData = spells[0] as Record<string, unknown>
                // Flatten: save the unwrapped spell
                writeJson(filePath, spellData)
                stats.flattened++
            } else {
                stats.flaggedForReExtract.push(`spells/custom-spells/${file}`)
                continue
            }
        } else if (typeof raw === 'object' && !Array.isArray(raw)) {
            spellData = raw as Record<string, unknown>
        } else {
            stats.flaggedForReExtract.push(`spells/custom-spells/${file}`)
            continue
        }

        // Check for required fields
        const name = spellData.name as string | undefined
        const level = spellData.level as number | undefined
        const school = spellData.school as string | undefined

        if (name === undefined || level === undefined || school === undefined) {
            stats.flaggedForReExtract.push(`spells/custom-spells/${file}`)
            continue
        }

        const schoolKebab = kebab(school)
        if (!VALID_SCHOOLS.includes(schoolKebab)) {
            stats.flaggedForReExtract.push(`spells/custom-spells/${file}`)
            continue
        }

        // Determine destination
        let destDir: string
        if (level === 0) {
            destDir = path.join(ROOT, 'spells/cantrips', schoolKebab)
        } else {
            destDir = path.join(ROOT, 'spells/prepared-spells', schoolKebab, `level-${level}`)
        }

        const destPath = path.join(destDir, file)
        moveFile(filePath, destPath)
    }
}

// ── Monster Reorganization ──

const CREATURE_TYPE_MAP: Record<string, string> = {
    aberration: 'aberrations',
    beast: 'beasts',
    celestial: 'celestials',
    construct: 'constructs',
    dragon: 'dragons',
    elemental: 'elementals',
    fey: 'fey',
    fiend: 'fiends',
    giant: 'giants',
    humanoid: 'humanoids',
    monstrosity: 'monstrosities',
    ooze: 'oozes',
    plant: 'plants',
    undead: 'undead',
    swarm: 'swarms'
}

// Subgroupings per Research Notes spec
const CREATURE_SUBGROUPS: Record<string, string[]> = {
    'elementals': ['genie', 'djinni', 'efreeti', 'marid', 'dao'],
    'aberrations': ['mind flayer', 'illithid', 'beholder'],
    'fiends': ['demon', 'devil', 'yugoloth'],
    'undead': ['vampire', 'lich', 'zombie', 'skeleton', 'ghost', 'wraith', 'mummy', 'specter'],
    'dragons': ['chromatic', 'metallic', 'gem'],
}

function getCreatureSubgroup(name: string, type: string): string | null {
    const nameLower = name.toLowerCase()
    const typeFolder = CREATURE_TYPE_MAP[type.toLowerCase()]
    if (!typeFolder) return null

    const subgroups = CREATURE_SUBGROUPS[typeFolder]
    if (!subgroups) return null

    for (const sub of subgroups) {
        if (nameLower.includes(sub)) return kebab(sub) + 's'
    }
    return null
}

function reorganizeMonsters(): void {
    console.log('\n🐉 REORGANIZING MONSTERS...')
    const monsterDir = path.join(ROOT, 'dm/npcs/monsters/custom')
    if (!fs.existsSync(monsterDir)) return

    const files = fs.readdirSync(monsterDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
        const filePath = path.join(monsterDir, file)
        const raw = readJson(filePath)
        if (!raw) {
            stats.flaggedForReExtract.push(`dm/npcs/monsters/custom/${file}`)
            continue
        }

        // Check if it's an array (multi-creature file)
        if (Array.isArray(raw)) {
            console.log(`  📑 Splitting multi-creature file: ${file}`)
            for (const creature of raw) {
                if (typeof creature !== 'object' || !creature) continue
                const c = creature as Record<string, unknown>
                const cName = c.name as string
                if (!cName) continue

                const cType = ((c.creatureType || c.type) as string || '').toLowerCase().split(' ')[0]
                const typeFolder = CREATURE_TYPE_MAP[cType] || 'uncategorized'
                const subgroup = cName ? getCreatureSubgroup(cName, cType) : null

                const destDir = subgroup
                    ? path.join(ROOT, 'dm/npcs/monsters', typeFolder, subgroup)
                    : path.join(ROOT, 'dm/npcs/monsters', typeFolder)

                const cFile = kebab(cName) + '.json'
                const destPath = path.join(destDir, cFile)
                writeJson(destPath, c)
                stats.split++
                const relDest = path.relative(ROOT, destPath).replace(/\\/g, '/')
                console.log(`    ✂️ ${cName} → ${relDest}`)
            }
            // Delete the original multi-creature file
            if (!DRY_RUN) fs.unlinkSync(filePath)
            stats.deleted++
            continue
        }

        // Single creature object
        const data = raw as Record<string, unknown>
        const name = data.name as string | undefined
        const creatureType = ((data.creatureType || data.type) as string || '').toLowerCase().split(' ')[0]

        if (!name) {
            // Lore article — no name field, likely not a stat block
            const destDir = path.join(ROOT, 'world/lore')
            const destPath = path.join(destDir, file)
            moveFile(filePath, destPath)
            console.log(`  📖 Lore article: ${file} → world/lore/`)
            continue
        }

        const typeFolder = CREATURE_TYPE_MAP[creatureType] || 'uncategorized'
        const subgroup = getCreatureSubgroup(name, creatureType)

        const destDir = subgroup
            ? path.join(ROOT, 'dm/npcs/monsters', typeFolder, subgroup)
            : path.join(ROOT, 'dm/npcs/monsters', typeFolder)

        const destPath = path.join(destDir, file)
        moveFile(filePath, destPath)
    }
}

// ── Magic Item Analysis ──

function analyzeMagicItems(): void {
    console.log('\n✨ ANALYZING MAGIC ITEMS...')
    const magicDir = path.join(ROOT, 'equipment/magic-items/permanent/wondrous')
    if (!fs.existsSync(magicDir)) return

    const files = fs.readdirSync(magicDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
        const filePath = path.join(magicDir, file)
        const raw = readJson(filePath)
        if (!raw || typeof raw !== 'object') continue

        const data = raw as Record<string, unknown>

        // Check if it's an error object
        if (data.error === 'ITEM_NOT_FOUND' || data.error) {
            stats.errorObjects++
            stats.flaggedForReExtract.push(`equipment/magic-items/permanent/wondrous/${file}`)
            continue
        }

        // Check if truncated (< 20 bytes)
        const stat = fs.statSync(filePath)
        if (stat.size < 20) {
            stats.flaggedForReExtract.push(`equipment/magic-items/permanent/wondrous/${file}`)
            continue
        }

        // Valid magic item — leave in place for now, will be sorted by rarity after re-extraction
        stats.skipped++
    }
}

// ── Delete Phase 5 Files ──

function deletePhase5Files(): void {
    console.log('\n🗑️ DELETING PHASE 5 FILES...')
    const _phase5Dir = path.join(ROOT, '..', '..', '..', '..', 'mechanics')
    // Actually check the top-level mechanics/ dir
    const _topMechanics = path.join(ROOT, '..', 'mechanics')

    // The Phase 5 files landed in src/renderer/public/data/5e/mechanics/
    // which is wrong — they should be in game/mechanics/ or deleted
    const wrongMechanicsDir = path.join(ROOT, 'mechanics')
    if (fs.existsSync(wrongMechanicsDir)) {
        // Check for Phase 5 specific files
        const checkFiles = ['character/character-rules.json', 'combat/combat-rules.json', 'world/world-rules.json']
        for (const rel of checkFiles) {
            const fp = path.join(wrongMechanicsDir, rel)
            if (fs.existsSync(fp)) {
                if (!DRY_RUN) fs.unlinkSync(fp)
                stats.deleted++
                console.log(`  🗑️ Deleted: mechanics/${rel}`)
            }
        }
    }
}

// ── Create Missing Directories ──

const ALL_SPEC_DIRS = [
    // Origins
    'origins/species', 'origins/backgrounds',
    // Feats
    'feats/origin', 'feats/general', 'feats/fighting-style', 'feats/epic-boon',
    // Spells
    'spells/cantrips/abjuration', 'spells/cantrips/conjuration', 'spells/cantrips/divination',
    'spells/cantrips/enchantment', 'spells/cantrips/evocation', 'spells/cantrips/illusion',
    'spells/cantrips/necromancy', 'spells/cantrips/transmutation',
    'spells/prepared-spells/abjuration/level-1', 'spells/prepared-spells/abjuration/level-2',
    'spells/prepared-spells/abjuration/level-3', 'spells/prepared-spells/abjuration/level-4',
    'spells/prepared-spells/abjuration/level-5', 'spells/prepared-spells/abjuration/level-6',
    'spells/prepared-spells/abjuration/level-7', 'spells/prepared-spells/abjuration/level-8',
    'spells/prepared-spells/abjuration/level-9',
    'spells/prepared-spells/conjuration/level-1', 'spells/prepared-spells/conjuration/level-2',
    'spells/prepared-spells/conjuration/level-3', 'spells/prepared-spells/conjuration/level-4',
    'spells/prepared-spells/conjuration/level-5', 'spells/prepared-spells/conjuration/level-6',
    'spells/prepared-spells/conjuration/level-7', 'spells/prepared-spells/conjuration/level-8',
    'spells/prepared-spells/conjuration/level-9',
    'spells/prepared-spells/divination/level-1', 'spells/prepared-spells/divination/level-2',
    'spells/prepared-spells/divination/level-3', 'spells/prepared-spells/divination/level-4',
    'spells/prepared-spells/divination/level-5', 'spells/prepared-spells/divination/level-6',
    'spells/prepared-spells/divination/level-7', 'spells/prepared-spells/divination/level-8',
    'spells/prepared-spells/divination/level-9',
    'spells/prepared-spells/enchantment/level-1', 'spells/prepared-spells/enchantment/level-2',
    'spells/prepared-spells/enchantment/level-3', 'spells/prepared-spells/enchantment/level-4',
    'spells/prepared-spells/enchantment/level-5', 'spells/prepared-spells/enchantment/level-6',
    'spells/prepared-spells/enchantment/level-7', 'spells/prepared-spells/enchantment/level-8',
    'spells/prepared-spells/enchantment/level-9',
    'spells/prepared-spells/evocation/level-1', 'spells/prepared-spells/evocation/level-2',
    'spells/prepared-spells/evocation/level-3', 'spells/prepared-spells/evocation/level-4',
    'spells/prepared-spells/evocation/level-5', 'spells/prepared-spells/evocation/level-6',
    'spells/prepared-spells/evocation/level-7', 'spells/prepared-spells/evocation/level-8',
    'spells/prepared-spells/evocation/level-9',
    'spells/prepared-spells/illusion/level-1', 'spells/prepared-spells/illusion/level-2',
    'spells/prepared-spells/illusion/level-3', 'spells/prepared-spells/illusion/level-4',
    'spells/prepared-spells/illusion/level-5', 'spells/prepared-spells/illusion/level-6',
    'spells/prepared-spells/illusion/level-7', 'spells/prepared-spells/illusion/level-8',
    'spells/prepared-spells/illusion/level-9',
    'spells/prepared-spells/necromancy/level-1', 'spells/prepared-spells/necromancy/level-2',
    'spells/prepared-spells/necromancy/level-3', 'spells/prepared-spells/necromancy/level-4',
    'spells/prepared-spells/necromancy/level-5', 'spells/prepared-spells/necromancy/level-6',
    'spells/prepared-spells/necromancy/level-7', 'spells/prepared-spells/necromancy/level-8',
    'spells/prepared-spells/necromancy/level-9',
    'spells/prepared-spells/transmutation/level-1', 'spells/prepared-spells/transmutation/level-2',
    'spells/prepared-spells/transmutation/level-3', 'spells/prepared-spells/transmutation/level-4',
    'spells/prepared-spells/transmutation/level-5', 'spells/prepared-spells/transmutation/level-6',
    'spells/prepared-spells/transmutation/level-7', 'spells/prepared-spells/transmutation/level-8',
    'spells/prepared-spells/transmutation/level-9',
    'spells/custom-spells',
    // Monsters by creature type
    'dm/npcs/monsters/aberrations', 'dm/npcs/monsters/beasts', 'dm/npcs/monsters/celestials',
    'dm/npcs/monsters/constructs', 'dm/npcs/monsters/dragons', 'dm/npcs/monsters/elementals',
    'dm/npcs/monsters/fey', 'dm/npcs/monsters/fiends', 'dm/npcs/monsters/giants',
    'dm/npcs/monsters/humanoids', 'dm/npcs/monsters/monstrosities', 'dm/npcs/monsters/oozes',
    'dm/npcs/monsters/plants', 'dm/npcs/monsters/undead', 'dm/npcs/monsters/swarms',
    'dm/npcs/monsters/uncategorized',
    'dm/npcs/monsters/aberrations/mind-flayers', 'dm/npcs/monsters/elementals/genies',
    'dm/npcs/monsters/fiends/demons', 'dm/npcs/monsters/fiends/devils',
    'dm/npcs/custom-monsters', 'dm/npcs/townsfolk', 'dm/npcs/templates', 'dm/npcs/sentient-items',
    'dm/npcs/monsters/complex-traps',
    // Equipment
    'equipment/armor/heavy', 'equipment/armor/light', 'equipment/armor/medium', 'equipment/armor/shields',
    'equipment/weapons/simple-weapons/melee', 'equipment/weapons/simple-weapons/ranged',
    'equipment/weapons/martial-weapons/melee', 'equipment/weapons/martial-weapons/ranged',
    'equipment/weapons/firearms/renaissance', 'equipment/weapons/firearms/modern', 'equipment/weapons/firearms/futuristic',
    'equipment/weapons/explosives/renaissance', 'equipment/weapons/explosives/modern', 'equipment/weapons/explosives/futuristic',
    'equipment/weapons/siege', 'equipment/weapons/masteries',
    'equipment/magic-items/artifacts', 'equipment/magic-items/consumables/potions',
    'equipment/magic-items/consumables/scrolls', 'equipment/magic-items/cursed-items',
    'equipment/magic-items/sentient-items',
    'equipment/items/adventuring-gear', 'equipment/items/ammunition',
    'equipment/items/poisons/contact', 'equipment/items/poisons/ingested',
    'equipment/items/poisons/inhaled', 'equipment/items/poisons/injury',
    'equipment/items/spell-components', 'equipment/items/spellcasting-foci',
    'equipment/bundles', 'equipment/tools/artisan-tools', 'equipment/tools/gaming-sets',
    'equipment/tools/musical-instruments', 'equipment/trinkets', 'equipment/recipes',
    'equipment/vehicles/mounts', 'equipment/vehicles/drawn',
    'equipment/vehicles/waterborne/simple', 'equipment/vehicles/waterborne/ships',
    // DM / Adventures
    'dm/adventures/campaigns', 'dm/adventures/one-shots',
    'dm/adventures/encounters/combat', 'dm/adventures/encounters/social',
    'dm/adventures/encounters/puzzles', 'dm/adventures/encounters/lairs',
    'dm/loot-tables', 'dm/shops', 'dm/rewards/marks-of-prestige',
    // Game mechanics
    'game/mechanics/status-effects/conditions', 'game/mechanics/status-effects/buffs',
    'game/mechanics/status-effects/madness',
    'game/mechanics/combat-rules', 'game/mechanics/variant-rules',
    'game/mechanics/skills', 'game/mechanics/damage-types',
    'game/mechanics/economy', 'game/mechanics/character-advancement',
    'game/mechanics/crafting', 'game/mechanics/chases',
    'game/mechanics/downtime', 'game/mechanics/downtime/bastions/facilities/basic',
    'game/mechanics/downtime/bastions/facilities/special',
    'game/mechanics/tool-properties', 'game/mechanics/weapon-properties',
    'game/mechanics/adventuring-rules', 'game/mechanics/afflictions/curses',
    'game/mechanics/time',
    // AI
    'game/ai',
    // World
    'world/environments/arctic', 'world/environments/desert',
    'world/environments/dungeon', 'world/environments/forest',
    'world/environments/underdark', 'world/environments/urban',
    'world/planes', 'world/factions', 'world/deities',
    'world/calendar', 'world/languages/standard', 'world/languages/rare',
    'world/languages/secret', 'world/scripts', 'world/lore',
    // Hazards
    'hazards/diseases', 'hazards/environmental',
    'hazards/traps/mechanical', 'hazards/traps/magical', 'hazards/traps/effects',
    // Character
    'character/companions/pets', 'character/companions/mounts', 'character/companions/hirelings',
    'character/spellbooks', 'character/supernatural-gifts/tattoos',
]

function createMissingDirs(): void {
    console.log('\n📁 CREATING MISSING DIRECTORIES...')
    for (const dir of ALL_SPEC_DIRS) {
        const fullPath = path.join(ROOT, dir)
        if (!fs.existsSync(fullPath)) {
            ensureDir(fullPath)
            console.log(`  📂 Created: ${dir}`)
        }
    }
}

// ── Main ──

function main(): void {
    console.log('=== PHASE 6 STEP 2: FILE REORGANIZATION ===')
    if (DRY_RUN) console.log('🔍 DRY RUN MODE — no files will be modified\n')
    else console.log('⚡ LIVE MODE — files will be moved!\n')

    // Step 1: Create all missing directories
    createMissingDirs()

    // Step 2: Reorganize spells
    reorganizeSpells()

    // Step 3: Reorganize monsters
    reorganizeMonsters()

    // Step 4: Analyze magic items (flag error objects)
    analyzeMagicItems()

    // Step 5: Delete Phase 5 files
    deletePhase5Files()

    // ── Report ──
    console.log('\n' + '='.repeat(50))
    console.log('REORGANIZATION COMPLETE')
    console.log('='.repeat(50))
    console.log(`  Files moved:        ${stats.moved}`)
    console.log(`  Files split:        ${stats.split}`)
    console.log(`  Wrappers flattened: ${stats.flattened}`)
    console.log(`  Dirs created:       ${stats.dirsCreated}`)
    console.log(`  Files deleted:      ${stats.deleted}`)
    console.log(`  Error objects:      ${stats.errorObjects}`)
    console.log(`  Skipped (valid):    ${stats.skipped}`)
    console.log(`  Flagged for re-extract: ${stats.flaggedForReExtract.length}`)

    if (stats.flaggedForReExtract.length > 0) {
        const flaggedPath = path.join(process.cwd(), 'flagged-for-re-extract.json')
        if (!DRY_RUN) {
            fs.writeFileSync(flaggedPath, JSON.stringify(stats.flaggedForReExtract, null, 2))
        }
        console.log(`\n  📝 Flagged files written to: flagged-for-re-extract.json`)
    }

    if (stats.errors.length > 0) {
        console.log(`\n  ❌ Errors:`)
        for (const e of stats.errors) console.log(`    ${e}`)
    }
}

main()

/**
 * Phase 6 — Step 3: Missing Data Batch Generator
 *
 * Generates an Anthropic Batch API payload for all files flagged for re-extraction:
 * - 237 magic items (DMG ch7 source)
 * - Species (PHB 04-character-origins.md)
 * - Backgrounds (PHB 04-character-origins.md)
 * - Feats (PHB 05-feats.md)
 * - dnd-terms.json (PHB+DMG)
 * - dm-actions.json (from existing dm-system-prompt.ts)
 *
 * Usage: npx tsx scripts/generate-missing-data-batch.ts
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// ── Constants ──

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'src/renderer/public/data/5e')
const SCHEMA_DIR = path.join(ROOT, 'scripts/schemas')
const REF_DIR = path.join(ROOT, '5.5e References')

const BATCH_OUTPUT = path.join(ROOT, 'batch_payload_missing.jsonl')
const ID_MAP_OUTPUT = path.join(ROOT, 'batch-id-map-missing.json')

// ── DMG Magic Item Source Files ──

const DMG_MAGIC_ITEM_FILES = [
    'ch7-magic-items-a-b.md',
    'ch7-magic-items-c-d.md',
    'ch7-magic-items-e-h.md',
    'ch7-magic-items-i-o.md',
    'ch7-magic-items-p-r.md',
    'ch7-magic-items-s-z.md',
]

// ── PHB Species (2024 PHB Chapter 4) ──

const PHB_SPECIES = [
    'aasimar', 'dragonborn', 'dwarf', 'elf', 'gnome',
    'goliath', 'halfling', 'human', 'orc', 'tiefling'
]

// ── PHB Backgrounds (2024 PHB Chapter 4) ──

const PHB_BACKGROUNDS = [
    'acolyte', 'artisan', 'charlatan', 'criminal', 'entertainer',
    'farmer', 'guard', 'guide', 'hermit', 'merchant',
    'noble', 'sage', 'sailor', 'scribe', 'soldier',
    'wayfarer'
]

// ── PHB Feats (2024 PHB Chapter 5) ──

const PHB_FEATS_ORIGIN = [
    'alert', 'crafter', 'healer', 'lucky', 'magic-initiate',
    'musician', 'savage-attacker', 'skilled', 'tavern-brawler', 'tough'
]

const PHB_FEATS_GENERAL = [
    'ability-score-improvement', 'actor', 'athlete', 'charger', 'chef',
    'crossbow-expert', 'crusher', 'defensive-duelist', 'dual-wielder',
    'dungeon-delver', 'durable', 'elemental-adept', 'fey-touched',
    'grappler', 'great-weapon-master', 'heavily-armored', 'heavy-armor-master',
    'inspiring-leader', 'keen-mind', 'lightly-armored', 'mage-slayer',
    'martial-weapon-training', 'medium-armor-master', 'moderately-armored',
    'mounted-combatant', 'observant', 'piercer', 'poisoner',
    'polearm-master', 'resilient', 'ritual-caster', 'sentinel',
    'shadow-touched', 'sharpshooter', 'shield-master', 'skill-expert',
    'skulker', 'slasher', 'speedy', 'spell-sniper', 'telekinetic',
    'telepathic', 'war-caster', 'weapon-master'
]

const PHB_FEATS_FIGHTING_STYLE = [
    'archery', 'blind-fighting', 'defense', 'dueling',
    'great-weapon-fighting', 'interception', 'protection',
    'thrown-weapon-fighting', 'two-weapon-fighting', 'unarmed-fighting'
]

const PHB_FEATS_EPIC_BOON = [
    'boon-of-combat-prowess', 'boon-of-dimensional-travel',
    'boon-of-energy-resistance', 'boon-of-fate', 'boon-of-fortitude',
    'boon-of-irresistible-offense', 'boon-of-recovery',
    'boon-of-skill', 'boon-of-speed', 'boon-of-spell-recall',
    'boon-of-the-night-spirit', 'boon-of-truesight'
]

// ── Helpers ──

function readFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8')
}

function makeHash(s: string): string {
    return crypto.createHash('sha1').update(s).digest('hex')
}

function titleCase(kebab: string): string {
    return kebab.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function findDmgChapterForItem(itemName: string): string {
    const first = itemName.charAt(0).toUpperCase()
    if (first <= 'B') return 'ch7-magic-items-a-b.md'
    if (first <= 'D') return 'ch7-magic-items-c-d.md'
    if (first <= 'H') return 'ch7-magic-items-e-h.md'
    if (first <= 'O') return 'ch7-magic-items-i-o.md'
    if (first <= 'R') return 'ch7-magic-items-p-r.md'
    return 'ch7-magic-items-s-z.md'
}

// ── Batch Request Builder ──

interface BatchRequest {
    custom_id: string
    params: {
        model: string
        max_tokens: number
        system: Array<{ type: string; text: string; cache_control: { type: string } }>
        messages: Array<{ role: string; content: string }>
    }
}

function buildRequest(
    targetPath: string,
    targetName: string,
    systemPrompt: string,
    userMessage: string
): BatchRequest {
    const hash = makeHash(targetPath)
    return {
        custom_id: `extract_${hash}`,
        params: {
            model: 'claude-3-haiku-20240307',
            max_tokens: 4096,
            system: [{
                type: 'text',
                text: systemPrompt,
                cache_control: { type: 'ephemeral' }
            }],
            messages: [{
                role: 'user',
                content: userMessage
            }]
        }
    }
}

// ── Main Generator ──

async function generateMissingBatch() {
    console.log('=== STEP 3: MISSING DATA BATCH GENERATOR ===\n')

    const requests: BatchRequest[] = []
    const idMap: Record<string, string> = {}

    // ── 1. Magic Items (from DMG) ──

    console.log('📦 Magic Items...')
    const equipSchema = readFile(path.join(SCHEMA_DIR, 'equipment.ts'))

    // Read the flagged file list (minus the two spell refs we already moved)
    const flagged: string[] = JSON.parse(readFile(path.join(ROOT, 'flagged-for-re-extract.json')))
    const magicItemFiles = flagged.filter(f => f.includes('magic-items'))

    // Group items by DMG chapter for prompt caching efficiency
    const byChapter: Record<string, string[]> = {}
    for (const itemPath of magicItemFiles) {
        const itemName = path.basename(itemPath, '.json')
        const chapter = findDmgChapterForItem(titleCase(itemName))
        if (!byChapter[chapter]) byChapter[chapter] = []
        byChapter[chapter].push(itemPath)
    }

    for (const [chapter, items] of Object.entries(byChapter)) {
        const dmgContent = readFile(path.join(REF_DIR, 'DMG2024/markdown', chapter))
        const dmgRulesContent = readFile(path.join(REF_DIR, 'DMG2024/markdown', 'ch7-magic-item-rules.md'))

        const systemPrompt = `You are an elite D&D data extraction agent. Extract the EXACT magic item data from the 2024 Dungeon Master's Guide into a perfectly structured JSON object.

<magic_item_rules>
${dmgRulesContent}
</magic_item_rules>

<chapter_reference>
${dmgContent}
</chapter_reference>

<target_schema>
${equipSchema}
</target_schema>

INSTRUCTIONS:
1. Find the named magic item in the chapter reference text.
2. Extract ALL fields: name, itemType (armor/weapon/ring/rod/staff/wand/wondrous/potion/scroll), rarity (common/uncommon/rare/very rare/legendary/artifact), requiresAttunement, attunementRequirements, description, properties, weight, cost.
3. For items with charges, extract charges, rechargeRate, rechargeAmount.
4. For items that grant spells, list them in the spells array.
5. For items with damage, extract the damage dice.
6. Include the source field as "DMG 2024".

CRITICAL: Output ONLY raw JSON. No markdown code blocks. Just the pure JSON object.`

        for (const itemPath of items) {
            const itemName = titleCase(path.basename(itemPath, '.json'))
            const targetPath = itemPath
            const req = buildRequest(targetPath, itemName, systemPrompt,
                `Extract the complete magic item data for: ${itemName}`)
            requests.push(req)
            idMap[req.custom_id] = targetPath
        }

        console.log(`  📖 ${chapter}: ${items.length} items`)
    }

    // ── 2. Species (from PHB) ──

    console.log('\n🧬 Species...')
    const speciesSchema = readFile(path.join(SCHEMA_DIR, 'species.ts'))
    const originsContent = readFile(path.join(REF_DIR, 'PHB2024/markdown', '04-character-origins.md'))

    const speciesPrompt = `You are an elite D&D data extraction agent. Extract the EXACT species data from the 2024 Player's Handbook into a perfectly structured JSON object.

<chapter_reference>
${originsContent}
</chapter_reference>

<target_schema>
${speciesSchema}
</target_schema>

INSTRUCTIONS:
1. Find the named species in the chapter reference text.
2. Extract: name, description, size, speed, traits (array of racial traits with name, description, level), abilityScoreIncreases, languages, subraces/lineages if any.
3. Include ALL trait details exactly as written in the source.
4. Include the source field as "PHB 2024".

CRITICAL: Output ONLY raw JSON. No markdown code blocks.`

    for (const species of PHB_SPECIES) {
        const targetPath = `origins/species/${species}.json`
        const req = buildRequest(targetPath, titleCase(species), speciesPrompt,
            `Extract the complete species data for: ${titleCase(species)}`)
        requests.push(req)
        idMap[req.custom_id] = targetPath
    }
    console.log(`  ✅ ${PHB_SPECIES.length} species`)

    // ── 3. Backgrounds (from PHB) ──

    console.log('\n📜 Backgrounds...')
    const backgroundPrompt = `You are an elite D&D data extraction agent. Extract the EXACT background data from the 2024 Player's Handbook into a perfectly structured JSON object.

<chapter_reference>
${originsContent}
</chapter_reference>

INSTRUCTIONS:
1. Find the named background in the chapter reference text.
2. Extract: name, description, abilityScores (array of 3 ability scores), skillProficiencies (array of 2), toolProficiency, feat (the Origin feat granted), equipment, source.
3. Include the source field as "PHB 2024".

CRITICAL: Output ONLY raw JSON. No markdown code blocks.`

    for (const bg of PHB_BACKGROUNDS) {
        const targetPath = `origins/backgrounds/${bg}.json`
        const req = buildRequest(targetPath, titleCase(bg), backgroundPrompt,
            `Extract the complete background data for: ${titleCase(bg)}`)
        requests.push(req)
        idMap[req.custom_id] = targetPath
    }
    console.log(`  ✅ ${PHB_BACKGROUNDS.length} backgrounds`)

    // ── 4. Feats (from PHB) ──

    console.log('\n⚔️ Feats...')
    const featsSchema = readFile(path.join(SCHEMA_DIR, 'feats.ts'))
    const featsContent = readFile(path.join(REF_DIR, 'PHB2024/markdown', '05-feats.md'))

    const featsPrompt = `You are an elite D&D data extraction agent. Extract the EXACT feat data from the 2024 Player's Handbook into a perfectly structured JSON object.

<chapter_reference>
${featsContent}
</chapter_reference>

<target_schema>
${featsSchema}
</target_schema>

INSTRUCTIONS:
1. Find the named feat in the chapter reference text.
2. Extract: name, category (Origin/General/Fighting Style/Epic Boon), level (minimum level required, 1 for origin feats, 4+ for general, 19 for epic boons), prerequisites, repeatable, description, benefits (array of individual benefit descriptions).
3. If the feat grants ability score increases, include abilityScoreIncrease field.
4. If the feat has multiple options (like Magic Initiate), include all options.
5. Include the source field as "PHB 2024".

CRITICAL: Output ONLY raw JSON. No markdown code blocks.`

    const allFeats = [
        ...PHB_FEATS_ORIGIN.map(f => ({ name: f, dir: 'origin' })),
        ...PHB_FEATS_GENERAL.map(f => ({ name: f, dir: 'general' })),
        ...PHB_FEATS_FIGHTING_STYLE.map(f => ({ name: f, dir: 'fighting-style' })),
        ...PHB_FEATS_EPIC_BOON.map(f => ({ name: f, dir: 'epic-boon' })),
    ]

    for (const feat of allFeats) {
        const targetPath = `feats/${feat.dir}/${feat.name}.json`
        const req = buildRequest(targetPath, titleCase(feat.name), featsPrompt,
            `Extract the complete feat data for: ${titleCase(feat.name)}`)
        requests.push(req)
        idMap[req.custom_id] = targetPath
    }
    console.log(`  ✅ ${allFeats.length} feats (${PHB_FEATS_ORIGIN.length} origin, ${PHB_FEATS_GENERAL.length} general, ${PHB_FEATS_FIGHTING_STYLE.length} fighting style, ${PHB_FEATS_EPIC_BOON.length} epic boon)`)

    // ── 5. dnd-terms.json (from PHB appendix + DMG appendix) ──

    console.log('\n📖 D&D Terms Glossary...')
    const rulesGlossary = readFile(path.join(REF_DIR, 'PHB2024/markdown', 'appendix-c-rules-glossary.md'))
    const dmgGlossary = readFile(path.join(REF_DIR, 'DMG2024/markdown', 'appendix-a-lore-glossary.md'))

    const termsPrompt = `You are an elite D&D data extraction agent. Create a comprehensive glossary of ALL D&D 2024 game terms from the provided rules and lore glossaries.

<phb_rules_glossary>
${rulesGlossary}
</phb_rules_glossary>

<dmg_lore_glossary>
${dmgGlossary}
</dmg_lore_glossary>

INSTRUCTIONS:
Create a JSON object with a "terms" array. Each term should have:
- term: the exact term name
- definition: clear, concise definition as stated in the source
- category: one of "combat", "spellcasting", "condition", "movement", "ability", "item", "creature", "world", "rule", "skill", "social"
- relatedTerms: array of related term names (kebab-case)
- source: "PHB 2024" or "DMG 2024"

Include ALL terms from both glossaries. This is used by an AI DM to understand 2024 rules precisely.

CRITICAL: Output ONLY raw JSON. No markdown code blocks.`

    const termsReq = buildRequest('game/ai/dnd-terms.json', 'D&D Terms', termsPrompt,
        'Extract ALL game terms from both the PHB Rules Glossary and DMG Lore Glossary into a structured terms array.')
    requests.push(termsReq)
    idMap[termsReq.custom_id] = 'game/ai/dnd-terms.json'
    console.log('  ✅ 1 file')

    // ── 6. dm-actions.json (from existing dm-system-prompt.ts) ──

    console.log('\n🎭 DM Actions Schema...')
    const dmPromptPath = path.join(ROOT, 'src/main/ai/dm-system-prompt.ts')
    const dmPromptContent = readFile(dmPromptPath)

    const actionsPrompt = `You are an elite D&D data extraction agent. Extract the DM action schemas from the provided TypeScript file into a structured JSON format.

<source_code>
${dmPromptContent}
</source_code>

INSTRUCTIONS:
1. Find all action/tool schemas defined in this file (dice rolling, combat actions, NPC interactions, etc.)
2. Extract each into a JSON object with: name, description, parameters (with types and descriptions), category (combat/social/exploration/utility)
3. Wrap everything in {"actions": [...]}

CRITICAL: Output ONLY raw JSON. No markdown code blocks.`

    const actionsReq = buildRequest('game/ai/dm-actions.json', 'DM Actions', actionsPrompt,
        'Extract all DM action schemas from the TypeScript source into structured JSON.')
    requests.push(actionsReq)
    idMap[actionsReq.custom_id] = 'game/ai/dm-actions.json'
    console.log('  ✅ 1 file')

    // ── Write Output ──

    console.log('\n' + '='.repeat(50))
    console.log(`TOTAL BATCH REQUESTS: ${requests.length}`)
    console.log('='.repeat(50))

    const writeStream = fs.createWriteStream(BATCH_OUTPUT)
    for (const req of requests) {
        writeStream.write(JSON.stringify(req) + '\n')
    }
    writeStream.end()

    fs.writeFileSync(ID_MAP_OUTPUT, JSON.stringify(idMap, null, 2))

    console.log(`\n📄 Payload: ${BATCH_OUTPUT}`)
    console.log(`📄 ID Map: ${ID_MAP_OUTPUT}`)
    console.log(`\nNext: Run submit-missing-data-batch.ts to submit to Anthropic`)
}

generateMissingBatch().catch(console.error)

import { readFileSync, writeFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import crypto from 'crypto'

// ====== CONFIG ======
const SRC_DIR = join(process.cwd(), 'src')
const BATCH_OUTPUT = join(process.cwd(), 'batch_payload_phase5.jsonl')
const ID_MAP_OUTPUT = join(process.cwd(), 'batch-id-map-phase5.json')

// The key source files we identified as containing hardcoded game data
const HARDCODED_DATA_FILES: Array<{ sourcePath: string; description: string; targetJsonPath: string }> = [
    {
        sourcePath: 'src/main/ai/prompt-sections/combat-rules.ts',
        description: 'Hardcoded combat rules: Falling damage, Hazard tables (Burning/Dehydration/Malnutrition/Suffocation), Exhaustion stack, Death Saves, Carrying Capacity, Object AC/HP table, Movement costs, DC tables.',
        targetJsonPath: 'mechanics/combat/combat-rules.json'
    },
    {
        sourcePath: 'src/main/ai/prompt-sections/world-rules.ts',
        description: 'Hardcoded world rules: NPC Attitudes, Travel Pace table, Navigation DCs, Extreme Environment DCs, Chase rules, Mob Attack lookup table, Poison stats (Assassin\'s Blood, Purple Worm, Midnight Tears), Disease stats (Cackle Fever, Sewer Plague, Sight Rot), Planar rules (Astral, Ethereal, Feywild, Shadowfell, Elemental Planes).',
        targetJsonPath: 'mechanics/world/world-rules.json'
    },
    {
        sourcePath: 'src/main/ai/prompt-sections/character-rules.ts',
        description: 'Hardcoded character rules: DC difficulty class table (DC 5 / 10 / 15 / 20 / 25 / 30), HP tracking rules, spellcasting restrictions, proficiency rules, Warlock Pact Magic rules.',
        targetJsonPath: 'mechanics/character/character-rules.json'
    }
]

// Game data JSON schema we want the extracted data to match
const TARGET_SCHEMA = `
export interface GameRule {
    id: string;              // kebab-case unique identifier
    name: string;            // Display name
    category: string;        // e.g., "Hazard", "Combat", "Condition", "Spellcasting"
    description: string;     // Full rules text
    mechanics?: {
        dc?: number;         // Any associated DC
        damage?: string;     // Damage dice expression (e.g., "1d6 per 10 feet")
        damageType?: string; // Damage type
        duration?: string;   // Duration or frequency
        condition?: string;  // Condition imposed
        save?: { ability: string; dc: number | string };
    };
    table?: Array<{          // For rule lookup tables (e.g., mob attack, carry weight)
        key: string | number;
        value: string | number;
    }>;
    source?: string;         // e.g., "PHB2024", "DMG2024", "MM2025"
    pageRef?: string;        // Chapter/page reference
}

// Note: For each source file you should output:
// { rules: GameRule[] }
`

function generateBatch() {
    console.log("=== PHASE 5: HARDCODED DATA EXTRACTION BATCH GENERATOR ===")

    const batchRequests: any[] = []
    const idMap: Record<string, string> = {}
    let count = 0

    for (const target of HARDCODED_DATA_FILES) {
        const fullSourcePath = join(process.cwd(), target.sourcePath)
        const sourceCode = readFileSync(fullSourcePath, 'utf-8')

        const promptContent = `You are a D&D 2024 Data Extraction Specialist.

TARGET FILE: ${target.sourcePath}
TARGET JSON: ${target.targetJsonPath}

Your task:
Read the TypeScript source code below, which contains D&D game rules embedded as hardcoded strings or objects in the code.

${target.description}

Extract ALL hardcoded D&D rule data from this file and convert it into a structured JSON object that matches the schema below. Ensure no rules are missed.

SCHEMA:
${TARGET_SCHEMA}

SOURCE CODE TO EXTRACT FROM:
\`\`\`typescript
${sourceCode}
\`\`\`

OUTPUT: Return ONLY a raw JSON object { "rules": [...] } with no backticks, no markdown formatting, just pure JSON.`

        const hash = crypto.createHash('sha1').update(target.targetJsonPath).digest('hex')
        const customId = `phase5_${hash}`

        batchRequests.push({
            custom_id: customId,
            params: {
                model: 'claude-opus-4-6',
                max_tokens: 16000,
                system: [{ type: 'text', text: 'You are a senior D&D 2024 data extraction specialist. Output only pure valid JSON.' }],
                messages: [{ role: 'user', content: promptContent }],
                thinking: { type: 'enabled', budget_tokens: 8000 }
            }
        })

        idMap[customId] = target.targetJsonPath
        count++
    }

    const jsonlContent = batchRequests.map(req => JSON.stringify(req)).join('\n')
    writeFileSync(BATCH_OUTPUT, jsonlContent, 'utf-8')
    writeFileSync(ID_MAP_OUTPUT, JSON.stringify(idMap, null, 2), 'utf-8')

    console.log(`\nGenerated Phase 5 Batch for ${count} hardcoded data files.`)
    console.log(`Saved to: ${BATCH_OUTPUT}`)
    console.log(`ID Map: ${ID_MAP_OUTPUT}`)
    console.log(`\nNext step: Run 'npx tsx scripts/submit-phase5-batch.ts' to upload to Anthropic.`)
}

if (require.main === module) {
    generateBatch()
}

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e');
const SCHEMA_DIR = path.join(process.cwd(), 'scripts/schemas');
const DISCOVERIES_FILE = path.join(process.cwd(), 'phase4-discoveries.json');
const BATCH_OUTPUT = path.join(process.cwd(), 'batch_payload_phase4.jsonl');
const ID_MAP_OUTPUT = path.join(process.cwd(), 'batch-id-map-phase4.json');

// We will concatenate the highest-yield chapters so the Swarm has all reference context it needs.
const REF_FILES = [
    path.join(process.cwd(), '5.5e References/PHB2024/markdown/01-playing-the-game.md'),
    path.join(process.cwd(), '5.5e References/PHB2024/markdown/appendix-c-rules-glossary.md'),
    path.join(process.cwd(), '5.5e References/DMG2024/markdown/ch6-cosmology.md')
];

function getCombinedContext() {
    let combined = '';
    for (const f of REF_FILES) {
        if (fs.existsSync(f)) {
            combined += `\n\n--- Source: ${path.basename(f)} ---\n\n`;
            combined += fs.readFileSync(f, 'utf-8');
        }
    }
    return combined;
}

const CONTEXT_TEXT = getCombinedContext();
const MECHANICS_SCHEMA = fs.readFileSync(path.join(SCHEMA_DIR, 'mechanics.ts'), 'utf-8');
const WORLD_SCHEMA = fs.readFileSync(path.join(SCHEMA_DIR, 'world.ts'), 'utf-8');

function generateBatch() {
    console.log("=== PHASE 4: BATCH GENERATOR ===");

    if (!fs.existsSync(DISCOVERIES_FILE)) {
        console.error("No discoveries file found!");
        return;
    }

    const discoveries = JSON.parse(fs.readFileSync(DISCOVERIES_FILE, 'utf-8'));

    // Add the missing faction-status file manually
    discoveries.push({
        name: "Faction Status",
        category: "Variant Rules",
        suggestedPath: "character/faction-status"
    });

    // Deduplicate array by name just in case
    const uniqueMap = new Map();
    for (const d of discoveries) {
        uniqueMap.set(d.name, d);
    }
    const uniqueDiscoveries = Array.from(uniqueMap.values());

    console.log(`Processing ${uniqueDiscoveries.length} unique undiscovered rules...`);

    const batchRequests: any[] = [];
    const idMap: Record<string, string> = {};
    let batchCount = 0;

    for (const entity of uniqueDiscoveries) {
        let schemaName = "MechanicsSchema";
        let schemaText = MECHANICS_SCHEMA;

        if (['Environments', 'Hazards', 'Environment Rules'].includes(entity.category)) {
            schemaName = "WorldSchema";
            schemaText = WORLD_SCHEMA;
        }
        const cleanName = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const basePath = entity.suggestedPath.endsWith(cleanName)
            ? entity.suggestedPath
            : `${entity.suggestedPath}/${cleanName}`;

        const normalizedRelPath = `${basePath}.json`.replace(/\\/g, '/');

        // Construct prompt
        const promptContent = `Target Entity: "${entity.name}" (Category: ${entity.category})
File Path: ${normalizedRelPath}

Your assignment is to read the attached 2024 D&D Markdowns and meticulously extract all rules, mechanics, and numerical data exclusively concerning "${entity.name}".

OUTPUT REQUIREMENT:
You must strictly return a valid JSON object matching the provided \`${schemaName}\` typescript definition. Do not output anything else. No backticks, no markdown, just raw JSON text.

--- SCHEMA DEFINITION (${schemaName}) ---
${schemaText}

--- 5.5E REFERENCE MARKDOWNS ---
${CONTEXT_TEXT}
`;

        const hash = crypto.createHash('sha1').update(normalizedRelPath).digest('hex');
        const customId = `phase4_${hash}`;

        const request = {
            custom_id: customId,
            params: {
                model: "claude-opus-4-6",
                max_tokens: 16000,
                system: [
                    {
                        type: "text",
                        text: "You are the God-Swarm Phase 4 Dynamic Extractor. Find undocumented rules in the reference texts and instantiate them as strict JSON objects."
                    }
                ],
                messages: [
                    {
                        role: "user",
                        content: promptContent
                    }
                ],
                thinking: {
                    type: "enabled",
                    budget_tokens: 8000
                }
            }
        };

        batchRequests.push(request);
        idMap[customId] = normalizedRelPath;
        batchCount++;
    }

    const jsonlContent = batchRequests.map(req => JSON.stringify(req)).join('\n');
    fs.writeFileSync(BATCH_OUTPUT, jsonlContent, 'utf-8');
    fs.writeFileSync(ID_MAP_OUTPUT, JSON.stringify(idMap, null, 2), 'utf-8');

    console.log(`\nGenerated Phase 4 Batch Payload for ${batchCount} New Entities.`);
    console.log(`Saved to: ${BATCH_OUTPUT}`);
    console.log(`ID Map saved to: ${ID_MAP_OUTPUT}`);
}

if (require.main === module) {
    generateBatch();
}

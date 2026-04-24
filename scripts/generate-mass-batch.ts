import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// --- Constants ---
const DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e');
const SCHEMA_DIR = path.join(process.cwd(), 'scripts/schemas');
const REF_DIR = path.join(process.cwd(), '5.5e References');
const BATCH_OUTPUT = path.join(process.cwd(), 'batch_payload.jsonl');
const ID_MAP_OUTPUT = path.join(process.cwd(), 'batch-id-map.json');

// --- Domain Definitions ---
interface DomainConfig {
    name: string;
    schemaFile: string;
    dirName: string;
    markdownFile: string;
    directoryMatch: string[];
}

const DOMAINS: DomainConfig[] = [
    {
        name: 'Spells',
        schemaFile: 'spells.ts',
        dirName: 'PHB2024/markdown',
        markdownFile: '07-spells.md',
        directoryMatch: ['spells']
    },
    {
        name: 'Classes',
        schemaFile: 'classes.ts',
        dirName: 'PHB2024/markdown',
        markdownFile: '03-character-classes.md',
        directoryMatch: ['classes', 'subclasses']
    },
    {
        name: 'Species',
        schemaFile: 'species.ts',
        dirName: 'PHB2024/markdown',
        markdownFile: '04-character-origins.md',
        directoryMatch: ['origins/species', 'origins/backgrounds', 'origins/lineages'] // simplified to species
    },
    {
        name: 'Feats',
        schemaFile: 'feats.ts',
        dirName: 'PHB2024/markdown',
        markdownFile: '05-feats.md',
        directoryMatch: ['character/feats']
    },
    {
        name: 'Equipment',
        schemaFile: 'equipment.ts',
        dirName: 'PHB2024/markdown',
        markdownFile: '06-equipment.md',
        directoryMatch: ['equipment']
    },
    {
        name: 'Bestiary',
        schemaFile: 'bestiary.ts',
        dirName: 'MM2025/Markdown',
        markdownFile: 'Introduction.md',
        directoryMatch: ['dm/npcs/monsters', 'dm/npcs/templates']
    },
    {
        name: 'Mechanics',
        schemaFile: 'mechanics.ts',
        dirName: 'DMG2024/markdown',
        markdownFile: 'appendix-a-lore-glossary.md',
        directoryMatch: ['game/mechanics']
    },
    {
        name: 'World',
        schemaFile: 'world.ts',
        dirName: 'DMG2024/markdown',
        markdownFile: 'ch6-cosmology.md',
        directoryMatch: ['world/environments', 'world/lore', 'dm/adventures']
    }
];

// --- Recursive File Finder ---
function getAllJsonFiles(dir: string): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllJsonFiles(fullPath));
        } else if (file.endsWith('.json')) {
            results.push(fullPath);
        }
    });
    return results;
}

// --- The God-Swarm System Prompt Template ---
function buildSystemPrompt(domain: DomainConfig): any[] {
    const schemaContent = fs.readFileSync(path.join(SCHEMA_DIR, domain.schemaFile), 'utf-8');
    const mdContent = fs.readFileSync(path.join(REF_DIR, domain.dirName, domain.markdownFile), 'utf-8');

    const instruction = `You are a localized instance of the "God-Swarm", an elite 17-agent AI pipeline designed to extract D&D 2024 rules into flawlessly verified, math-enforced JSON structures.
    
Your domain is: ${domain.name}.
You are equipped with the EXACT chapter text from the 2024 Player's Handbook and the STRICT TypeScript Zod schema you must map to.

<chapter_reference>
${mdContent}
</chapter_reference>

<target_schema>
${schemaContent}
</target_schema>

INSTRUCTIONS FOR INTERNAL SIMULATION:
When given a specific target to extract (e.g. a spell name or item name), you must utilize your <thinking> block to internally simulate the entire Swarm Pipeline:
1. Spells.PreProcessor: Scan the reference text and isolate ONLY the rules pertaining to the target.
2. Spells.Extractor: Study the Zod Schema. Meticulously map the English text into the JSON format. Break dice ("8d6") into objects ({diceCount: 8, diceValue: 6, expression: "8d6"}).
3. Spells.MathVerifier: Double check your math against the text. If the text says "half damage on success", ensure the savingThrow object reflects that.
4. If you spot an error, internally loop and fix it.
5. ArchLibrarian: Output the FINAL, valid JSON object.

CRITICAL REQUIREMENT: 
Outside of your <thinking> block, you must ONLY output raw JSON. Not a markdown codeblock (\`\`\`json). Just the pure JSON object representing the target.`;

    // We use Anthropic's prompt caching at the system level for massive cost reduction.
    return [
        {
            type: "text",
            text: instruction,
            cache_control: { type: "ephemeral" }
        }
    ];
}

async function generateBatch() {
    console.log("=== PHASE 3: MASS BATCH GENERATOR ===");

    const allFiles = getAllJsonFiles(DATA_DIR);
    console.log(`Found ${allFiles.length} JSON files in the data directory.`);

    let batchCount = 0;
    const idMap: Record<string, string> = {}; // Added: Initialize idMap
    const writeStream = fs.createWriteStream(BATCH_OUTPUT);

    // Cache the system prompts so we don't recalculate them repeatedly
    const systemPromptCache: Record<string, any[]> = {};

    for (const file of allFiles) {
        const relativePath = file.split('data\\5e\\')[1] || file.split('data/5e/')[1];
        const normalizedRelPath = relativePath.replace(/\\/g, '/');

        // Determine the domain
        const domain = DOMAINS.find(d =>
            d.directoryMatch.some(match => normalizedRelPath.includes(match))
        );

        if (!domain) {
            // Some files might not fit into our 5 core domains yet (e.g. world, dm, mechanics)
            continue;
        }

        if (!systemPromptCache[domain.name]) {
            systemPromptCache[domain.name] = buildSystemPrompt(domain);
        }

        const fileNameBase = path.basename(file, '.json');

        // Convert kebab case to readable title (e.g., cure-wounds -> Cure Wounds)
        const targetName = fileNameBase.split('-').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');

        // Construct the individual batch request JSONL line
        const hash = crypto.createHash('sha1').update(normalizedRelPath).digest('hex');
        const customId = `extract_${hash}`; // "extract_" + 40 chars = 48 chars total

        const request = {
            custom_id: customId,
            params: {
                model: "claude-opus-4-6",
                max_tokens: 64000,
                thinking: {
                    type: "enabled",
                    budget_tokens: 16000
                },
                system: systemPromptCache[domain.name],
                messages: [
                    {
                        role: "user",
                        content: `Trigger the God-Swarm internal extraction pipeline for: ${targetName}`
                    }
                ]
            }
        };

        writeStream.write(JSON.stringify(request) + '\n');
        idMap[customId] = normalizedRelPath; // Added: Populate idMap
        batchCount++;
    }

    writeStream.end();
    fs.writeFileSync(ID_MAP_OUTPUT, JSON.stringify(idMap, null, 2)); // Added: Write idMap to file
    console.log(`\nGenerated Batch Payload for ${batchCount} Core Data Files.`);
    console.log(`Saved to: ${BATCH_OUTPUT}`);
    console.log(`ID Map saved to: ${ID_MAP_OUTPUT}`); // Added: Log idMap output path
    console.log(`Next Step: Run a script to submit this massive .jsonl to Anthropic's Batch Queue.`);
}

if (require.main === module) {
    generateBatch().catch(console.error);
}

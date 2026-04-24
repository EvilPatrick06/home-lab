import fs from 'fs'
import path from 'path'

const PROJECT_ROOT = process.cwd()

// Defines the target files we want Anthropic to rewrite
const TARGET_DIRS = [
    path.join(PROJECT_ROOT, 'src/renderer/src/types'),
    path.join(PROJECT_ROOT, 'src/renderer/src/services'),
    path.join(PROJECT_ROOT, 'src/renderer/src/stores'),
    path.join(PROJECT_ROOT, 'src/renderer/src/components'),
    path.join(PROJECT_ROOT, 'src/renderer/src/hooks'),
    path.join(PROJECT_ROOT, 'src/renderer/src/commands'),
    path.join(PROJECT_ROOT, 'src/main'),
    path.join(PROJECT_ROOT, 'src/preload')
]

function getFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir)
    for (const file of files) {
        const fullPath = path.join(dir, file)
        if (fs.statSync(fullPath).isDirectory()) {
            getFiles(fullPath, fileList)
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            fileList.push(fullPath)
        }
    }
    return fileList
}

async function run() {
    let allFiles: string[] = []
    for (const dir of TARGET_DIRS) {
        allFiles = allFiles.concat(getFiles(dir))
    }

    console.log(`Found ${allFiles.length} source files to rewrite.`)

    const payload: any[] = []
    const idMap: Record<string, string> = {}
    let idCounter = 1

    const systemPrompt = `You are an expert TypeScript/React developer.
We have just regenerated all our D&D 5.5e data into a new static JSON structure, accessed via new IPC channels instead of direct disk reads or hardcoded imports.
Your task is to rewrite the provided source file to match the new architecture.

### NEW ARCHITECTURE:
- Data is loaded via IPC from the main process (e.g. \`window.api.game.loadSpells()\`)
- Types must match the updated interfaces (SpellData, MonsterStatBlock, ClassData, etc.)
- Do not use \`services/json-loader.ts\` or \`services/data-paths.ts\` (they are deleted)
- Update stores (like Zustand) to fetch via IPC and cache, no filesystem reads
- Fix components to use the new Zustand states or IPC calls

### NEW TYPES:
${fs.readFileSync(path.join(PROJECT_ROOT, 'src/renderer/src/types/data/spell-data-types.ts'), 'utf8')}
${fs.readFileSync(path.join(PROJECT_ROOT, 'src/renderer/src/types/monster.ts'), 'utf8')}
${fs.readFileSync(path.join(PROJECT_ROOT, 'src/renderer/src/types/data/character-data-types.ts'), 'utf8')}

Output ONLY valid TypeScript code. Do not output markdown wrappers. Just the raw code. Do NOT output anything else.`


    for (const file of allFiles) {
        const relativePath = path.relative(PROJECT_ROOT, file)
        const content = fs.readFileSync(file, 'utf-8')

        // Skip files that look too simple or are just utility
        if (content.length < 50) continue;

        const customId = `rewrite_${idCounter++}`
        idMap[customId] = relativePath

        payload.push(JSON.stringify({
            custom_id: customId,
            params: {
                model: 'claude-3-haiku-20240307',
                max_tokens: 4096,
                system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
                messages: [{
                    role: 'user',
                    content: `Rewrite this file to match the new architecture. File: ${relativePath}\n\n${content}`
                }]
            }
        }))
    }

    fs.writeFileSync('batch_payload_integration.jsonl', payload.join('\n'))
    fs.writeFileSync('batch-id-map-integration.json', JSON.stringify(idMap, null, 2))
    console.log(`Payload saved! ${payload.length} requests generated.`)
}

run().catch(console.error)

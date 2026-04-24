import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
})

const SCHEMA_DIR = join(process.cwd(), 'scripts', 'schemas')
if (!existsSync(SCHEMA_DIR)) {
    mkdirSync(SCHEMA_DIR, { recursive: true })
}

const DOMAINS = [
    {
        name: 'Spells',
        file: '07-spells.md',
        prompt: `You are the Master Data Architect for D&D 2024 Spells. I am going to give you the ENTIRE chapter on Spells.
Your job is to read it ALL and design a flawlessly comprehensive, strict Zod schema in TypeScript that encompasses EVERY possible permutation of spell definitions (components, upcasting, varied damage types, condition applications, AoE shapes, etc.) found in this text.
The output data will be used in a highly optimized VTT, so prioritize breaking down natural language into math variables (e.g. 8d6 -> diceCount: 8, diceValue: 6) and enums.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definition exported as \`SpellsSchema\`. Do not include markdown code block backticks (like \`\`\`typescript). Output raw typescript.`
    },
    {
        name: 'Classes',
        file: '03-character-classes.md',
        prompt: `You are the Master Data Architect for D&D 2024 Character Classes. I am going to give you the ENTIRE chapter on Classes.
Your job is to read it ALL and design a flawlessly comprehensive, strict Zod schema in TypeScript that encompasses EVERY possible permutation of character class definitions (hit dice, proficiencies, features, spellcasting progression, subclass routing, resource scaling like ki or sorcery points, etc.) found in this text.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definition exported as \`ClassSchema\`. Do not include markdown code block backticks. Output raw typescript.`
    },
    {
        name: 'Species',
        file: '04-character-origins.md',
        prompt: `You are the Master Data Architect for D&D 2024 Character Origins (Species and Backgrounds). Read the provided text and design a strict Zod schema in TypeScript for 'Species' and a separate one for 'Backgrounds'. Ensure to capture traits, speed, darkvision offsets, feat grants, and ability score rules.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definitions exported as \`SpeciesSchema\` and \`BackgroundSchema\`. Do not include markdown code block backticks. Output raw typescript.`
    },
    {
        name: 'Equipment',
        file: '06-equipment.md',
        prompt: `You are the Master Data Architect for D&D 2024 Equipment. Read the entire chapter and design strict Zod schemas in TypeScript for 'Weapon', 'Armor', 'Tool', 'Mount', 'Vehicle', and 'Gear'. 
Prioritize extracting raw math for cost, weight, damage dice, weapon properties (properties array including mastery types), AC math formulas (e.g., base + Dex mod + max 2), and speeds.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definitions exported as \`WeaponSchema\`, \`ArmorSchema\`, etc. Do not include markdown code block backticks. Output raw typescript.`
    },
    {
        name: 'Feats',
        file: '05-feats.md',
        prompt: `You are the Master Data Architect for D&D 2024 Feats. Read the entire chapter and design a strict Zod schema in TypeScript for 'Feat'.
Capture prerequisites (level, ability score, species, etc.), repeatable status, granted ASI bonuses, and structured benefit objects.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definition exported as \`FeatSchema\`. Do not include markdown code block backticks. Output raw typescript.`
    }
]

async function processWithOpus(systemPrompt: string, userContent: string) {
    const stream = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 128000,
        thinking: {
            type: 'enabled',
            budget_tokens: 64000
        },
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        stream: true
    })

    let textAccumulator = ''
    process.stdout.write('   [Thinking & Streaming]')
    for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            textAccumulator += event.delta.text
            process.stdout.write('.')
        }
    }
    process.stdout.write('\n')
    return textAccumulator
}

async function runSchemaGeneration() {
    console.log("=== PHASE 2: GLOBAL ZOD SCHEMA GENERATION ===")

    for (const domain of DOMAINS) {
        console.log(`\n📦 Initializing Architect for Domain: ${domain.name}`)

        const filePath = join(process.cwd(), '5.5e References', 'PHB2024', 'markdown', domain.file)
        if (!existsSync(filePath)) {
            console.error(`   ❌ File not found: ${filePath}`)
            continue
        }

        console.log(`   📚 Reading ${domain.file}...`)
        const markdownContent = readFileSync(filePath, 'utf-8')

        console.log(`   🧠 Architect is synthesizing schema from ${markdownContent.length} bytes of markdown...`)

        try {
            const schemaCode = await processWithOpus(domain.prompt, markdownContent)

            // Clean up any stray markdown ticks if the LLM hallucinated them despite instructions
            const cleanedCode = schemaCode.replace(/^```typescript\n?|^```\n?/gm, '').replace(/```$/gm, '')

            // Add Zod import if it missed it
            const finalCode = cleanedCode.includes("import { z }") ? cleanedCode : "import { z } from 'zod';\n\n" + cleanedCode

            const outputPath = join(SCHEMA_DIR, `${domain.name.toLowerCase()}.ts`)
            writeFileSync(outputPath, finalCode.trim())
            console.log(`   ✅ Schema saved to ${outputPath}`)
        } catch (error: any) {
            console.error(`   ❌ Failed to generate schema for ${domain.name}: ${error.message}`)
        }
    }

    console.log("\n=== ALL DIRECTORY SCHEMAS COMPILED SUCCESSFULLY ===")
}

if (require.main === module) {
    runSchemaGeneration().catch(console.error)
}

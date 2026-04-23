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
        name: 'Bestiary',
        dirName: 'MM2025/Markdown',
        file: 'Introduction.md',
        prompt: `You are the Master Data Architect for D&D 2025 Creatures & Bestiary. I am going to give you the ENTIRE Introduction on Creature Stat Blocks.
Your job is to read it ALL and design a flawlessly comprehensive, strict Zod schema in TypeScript that encompasses EVERY possible permutation of a Monster/NPC stat block.
Include arrays for actions, legendary actions, bonus actions, reactions, traits. Include enums for sizes, alignments, creature types. Map out exactly how damage, attack bonuses, and nested spells should be structured mathematically so the VTT engine can loop over them.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definition exported as \`BestiarySchema\`. Do not include markdown code block backticks. Output raw typescript.`
    },
    {
        name: 'Mechanics',
        dirName: 'DMG2024/markdown',
        file: 'appendix-a-lore-glossary.md',
        prompt: `You are the Master Data Architect for D&D 2024 Core Rules & Mechanics. I am going to give you the Rules Glossary.
Your job is to read it ALL and design a brilliantly generic, but strictly-typed Zod schema in TypeScript that represents a "Rule Node". Things like Status Effects (Conditions), Exhaustion, Cover, Flanking, and Variant rules will map to this.
You should include fields for 'relatedConditions', 'numericalModifiers' (like AC +2 for Half Cover), 'advantageGrants', 'disadvantageImposes', and a highly structured 'applicationLogic' array.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definition exported as \`MechanicsSchema\`. Do not include markdown code block backticks. Output raw typescript.`
    },
    {
        name: 'World',
        dirName: 'DMG2024/markdown',
        file: 'ch6-cosmology.md', // Has exploration, environment, etc.
        prompt: `You are the Master Data Architect for D&D 2024 World, Lore, Cosmology & Environment. I am going to give you the Cosmology chapter.
Design a strict Zod schema in TypeScript for 'Environment/Hazard/Plane'. 
Include mathematical objects for damage per turn, saving throws required to traverse, light level modifications, movement speed penalties, and interaction checks.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definition exported as \`WorldSchema\`. Do not include markdown code block backticks. Output raw typescript.`
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
    console.log("=== PHASE 2.5: EXTENDED ZOD SCHEMA GENERATION ===")

    for (const domain of DOMAINS) {
        console.log(`\n📦 Initializing Architect for Domain: ${domain.name}`)

        const filePath = join(process.cwd(), '5.5e References', domain.dirName, domain.file)
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

    console.log("\n=== EXTENDED DIRECTORY SCHEMAS COMPILED SUCCESSFULLY ===")
}

if (require.main === module) {
    runSchemaGeneration().catch(console.error)
}

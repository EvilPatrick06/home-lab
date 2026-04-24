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

const bestiaryDomain = {
    name: 'Bestiary',
    dirName: 'MM2025/Markdown',
    file: 'Introduction.md',
    prompt: `You are the Master Data Architect for D&D 2025 Creatures & Bestiary. I am going to give you the ENTIRE Introduction on Creature Stat Blocks.
Your job is to read it ALL and design a flawlessly comprehensive, strict Zod schema in TypeScript that encompasses EVERY possible permutation of a Monster/NPC stat block.
Include arrays for actions, legendary actions, bonus actions, reactions, traits. Include enums for sizes, alignments, creature types. Map out exactly how damage, attack bonuses, and nested spells should be structured mathematically so the VTT engine can loop over them.

Output ONLY the raw TypeScript code containing the \`z.object({ ... })\` definition exported as \`BestiarySchema\`. Do not include markdown code block backticks. Output raw typescript.`
}

async function runBestiaryRescue() {
    console.log(`\n📦 Initializing RESCUE Architect for Domain: Bestiary`)

    const filePath = join(process.cwd(), '5.5e References', bestiaryDomain.dirName, bestiaryDomain.file)
    if (!existsSync(filePath)) {
        console.error(`   ❌ File not found: ${filePath}`)
        return
    }

    console.log(`   📚 Reading ${bestiaryDomain.file}...`)
    const markdownContent = readFileSync(filePath, 'utf-8')

    console.log(`   🧠 Architect is synthesizing schema from ${markdownContent.length} bytes of markdown...`)

    try {
        const stream = await anthropic.messages.create({
            model: 'claude-opus-4-6',
            max_tokens: 128000,
            thinking: {
                type: 'enabled',
                budget_tokens: 64000
            },
            system: bestiaryDomain.prompt,
            messages: [{ role: 'user', content: markdownContent }],
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

        // Clean up any stray markdown ticks if the LLM hallucinated them despite instructions
        const cleanedCode = textAccumulator.replace(/^```typescript\n?|^```\n?/gm, '').replace(/```$/gm, '')

        // Add Zod import if it missed it
        const finalCode = cleanedCode.includes("import { z }") ? cleanedCode : "import { z } from 'zod';\n\n" + cleanedCode

        const outputPath = join(SCHEMA_DIR, `bestiary.ts`)
        writeFileSync(outputPath, finalCode.trim())
        console.log(`   ✅ Bestiary Rescue Schema saved to ${outputPath}`)
    } catch (error: any) {
        console.error(`   ❌ Rescue Failed: ${error.message}`)
    }
}

if (require.main === module) {
    runBestiaryRescue().catch(console.error)
}

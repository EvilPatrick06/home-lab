import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
})

const MD_DIR = join(process.cwd(), '5.5e References', 'PHB2024', 'markdown')
const DMG_DIR = join(process.cwd(), '5.5e References', 'DMG2024', 'markdown')

// Only scan chapters that usually contain massive lists of mechanics we might not have hardcoded
const TARGET_CHAPTERS = [
    { name: 'Playing the Game', path: join(MD_DIR, '01-playing-the-game.md') },
    { name: 'Equipment', path: join(MD_DIR, '06-equipment.md') },
    { name: 'Appendix C: Glossary', path: join(MD_DIR, 'appendix-c-rules-glossary.md') },
    { name: 'DMG Cosmology/Environment', path: join(DMG_DIR, 'ch6-cosmology.md') },
    { name: 'DMG Lore Glossary', path: join(DMG_DIR, 'appendix-a-lore-glossary.md') }
]

async function runDiscovery() {
    console.log("=== PHASE 4: DYNAMIC DISCOVERY ===")

    let allDiscoveries: any[] = []

    for (const chapter of TARGET_CHAPTERS) {
        console.log(`\n🔍 Scanning: ${chapter.name}`)
        const mdText = readFileSync(chapter.path, 'utf-8')

        const prompt = `You are an AI Data Discovery engine for a D&D 2024 VTT. 
We have already extracted all Spells, Classes, Feats, Species, Equipment, and generic Monsters.
Your job is to read this chapter and compile a JSON list of strictly NEW mechanics, environments, hazards, or variant rules that would require their own dedicated JSON file to function in the app logic.

Rules for discovery:
1. Ignore anything that is clearly just narrative flavor.
2. We are looking for things like: "Status Conditions" (Blinded, Prone), "Hazards" (Quicksand, Razorvine), "Variant Rules" (Flanking, Gritty Realism), "Environments" (Feywild, Underdark).
3. Do not include character spells/classes/feats.

Output ONLY a JSON array of objects with this exact shape:
[{ 
    "name": "Razorvine", 
    "category": "Hazards", 
    "suggestedPath": "world/environments" 
}]

Do not output anything except the raw JSON array.`

        try {
            console.log(`   🧠 Opus 4.6 is parsing ${mdText.length} bytes...`)
            const response = await anthropic.messages.create({
                model: 'claude-opus-4-6',
                max_tokens: 8000,
                system: prompt,
                messages: [{ role: 'user', content: mdText }]
            })

            if (response.content[0].type === 'text') {
                const text = response.content[0].text
                const cleanJson = text.replace(/^```json\n?/, '').replace(/```$/, '')
                const list = JSON.parse(cleanJson.trim())

                console.log(`   ✅ Found ${list.length} undocumented entities!`)
                allDiscoveries.push(...list)
            }

        } catch (e: any) {
            console.error(`   ❌ Failed discovery on ${chapter.name}:`, e.message)
        }
    }

    // Write all discoveries to a master list
    const outputPath = join(process.cwd(), 'phase4-discoveries.json')
    writeFileSync(outputPath, JSON.stringify(allDiscoveries, null, 2))

    console.log(`\n🎉 Phase 4 Scanning Complete! Total Discoveries: ${allDiscoveries.length}`)
    console.log(`Saved to: ${outputPath}`)
    console.log(`Next step: We will take this list and generate a new batch_payload_phase4.jsonl for extraction.`)
}

if (require.main === module) {
    runDiscovery().catch(console.error)
}

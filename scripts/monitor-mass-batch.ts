import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
})

const CACHE_FILE = path.join(process.cwd(), '.mass_batch_cache.json')
const ID_MAP_FILE = path.join(process.cwd(), 'batch-id-map.json')
const ROOT_DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e')

async function monitorBatch() {
    console.log("=== AGENT 11: PROGRESS & DISPATCH REPORTER ===")

    if (!fs.existsSync(CACHE_FILE)) {
        console.log("❌ No active batch found in cache. Submit one first.")
        return
    }

    if (!fs.existsSync(ID_MAP_FILE)) {
        console.log("❌ No batch-id-map.json found. The payload map is missing.")
        return
    }

    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    const idMap = JSON.parse(fs.readFileSync(ID_MAP_FILE, 'utf-8'))
    console.log(`\n📡 Fetching Live Analytics for Job: ${cacheData.batchId}`)

    const batchStatus = await anthropic.messages.batches.retrieve(cacheData.batchId)

    console.log(`\n------------------------------------------------`)
    console.log(`STATUS:          ${batchStatus.processing_status.toUpperCase()}`)
    console.log(`------------------------------------------------`)
    console.log(`Succeeded:       ${batchStatus.request_counts.succeeded}`)
    console.log(`Processing:      ${batchStatus.request_counts.processing}`)
    console.log(`Errored:         ${batchStatus.request_counts.errored}`)
    console.log(`Canceled/Expired:${batchStatus.request_counts.canceled + batchStatus.request_counts.expired}`)

    if (batchStatus.processing_status === 'ended') {
        console.log(`\nJob Ended at ${batchStatus.ended_at}.`)
        console.log(`Downloading compiled JSON objects...`)

        const resultStream = await anthropic.messages.batches.results(cacheData.batchId)

        let successWrites = 0
        let failedWrites = 0

        for await (const chunk of resultStream) {
            try {
                const customId = chunk.custom_id
                const originalPath = idMap[customId]

                if (!originalPath) {
                    console.error(`❌ Hash Mismatch: Could not find original path for ${customId}. Skipping.`)
                    failedWrites++;
                    continue;
                }

                const targetJsonPath = path.join(ROOT_DATA_DIR, originalPath)

                if (chunk.result.type === 'succeeded') {
                    // With extended thinking enabled, content[0] is the thinking block.
                    // We must find the first content block with type === 'text'.
                    const textBlock = chunk.result.message.content.find(
                        (block: any) => block.type === 'text'
                    );
                    let rawOutput = '';
                    if (textBlock && textBlock.type === 'text') {
                        rawOutput = textBlock.text;
                    }

                    // Attempt to parse validation
                    try {
                        let jsonStr = rawOutput;
                        if (jsonStr.startsWith("```json")) {
                            jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/```$/, '');
                        }

                        const validatedJson = JSON.parse(jsonStr.trim())

                        // Overwrite the blank directory file with the Agent-simulated response
                        fs.writeFileSync(targetJsonPath, JSON.stringify(validatedJson, null, 2))

                        console.log(`✅ Extraction saved: ${originalPath}`)
                        successWrites++;
                    } catch (err: any) {
                        console.error(`❌ Validation/Parse Error for ${originalPath}:`, err.message)
                        failedWrites++;
                    }
                } else {
                    console.log(`❌ External API Error for ${originalPath}:`, chunk.result)
                    failedWrites++;
                }

            } catch (err) {
                console.error("Critical Parse Error for chunk", err)
            }
        }

        console.log(`\n=== EXTRACTION COMPLETE ===`)
        console.log(`Successfully verified: ${successWrites}`)
        console.log(`Failed verifications: ${failedWrites}`)
    } else {
        console.log("\nThe Anthropic Cloud cluster is still computing. Run this script again later to refresh.")
    }
}

if (require.main === module) {
    monitorBatch().catch(console.error)
}

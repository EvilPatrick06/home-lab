import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
})

const CACHE_FILE = path.join(process.cwd(), '.batch_cache.json')

async function submitTestBatch() {
    console.log("=== BATCH CONNECTION TEST - SUBMISSION ===")
    console.log("Creating a small JSONL test file...")

    // 1. Create a dummy JSONL payload with 2 quick tasks
    // The JSONL content is now directly embedded in the batch request.
    // The file upload step is no longer needed for this new batch API.

    console.log("Submitting Message Batch...")
    // 3. Initiate the Batch
    let batchJob;
    try {
        batchJob = await anthropic.messages.batches.create({
            requests: [
                {
                    "custom_id": "test_spell_1",
                    "params": {
                        "model": "claude-3-5-sonnet-latest",
                        "max_tokens": 1024,
                        "messages": [{ "role": "user", "content": "Extract data for the spell Fire Bolt into JSON: Name, Damage." }]
                    }
                },
                {
                    "custom_id": "test_spell_2",
                    "params": {
                        "model": "claude-3-5-sonnet-latest",
                        "max_tokens": 1024,
                        "messages": [{ "role": "user", "content": "Extract data for the spell Cure Wounds into JSON: Name, Healing." }]
                    }
                }
            ]
        })
        console.log(`✅ Batch Submitted Successfully! Batch ID: ${batchJob.id}`)
    } catch (e: any) {
        console.error("Failed to submit batch. Error:", e)
        return
    }

    // 4. Save to cache
    const cacheData = {
        batchId: batchJob.id,
        status: batchJob.processing_status,
        submittedAt: new Date().toISOString()
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2))

    console.log("\n📦 State Cached locally.")
    console.log(`👉 Notice: The script is now ENDING. The connection is terminating.`)
    console.log(`👉 Anthropic is processing this in the background.`)
    console.log(`👉 Run 'npx tsx scripts/resume-batch.ts' to retrieve the result offline.`)
}

if (require.main === module) {
    submitTestBatch().catch(console.error)
}

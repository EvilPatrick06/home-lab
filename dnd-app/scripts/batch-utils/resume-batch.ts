import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
})

const CACHE_FILE = path.join(process.cwd(), '.batch_cache.json')

async function resumeBatch() {
    console.log("=== BATCH CONNECTION TEST - RESUME ===")

    // 1. Read cache
    if (!fs.existsSync(CACHE_FILE)) {
        console.log("❌ No active batch found in cache. Did you run the submission script?")
        return
    }

    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    console.log(`Found cached Batch ID: ${cacheData.batchId}`)
    console.log(`Checking live status with Anthropic...`)

    // 2. Fetch live status
    const batchStatus = await anthropic.messages.batches.retrieve(cacheData.batchId)
    console.log(`\nLIVE STATUS: ${batchStatus.processing_status.toUpperCase()}`)

    console.log(`Metrics:`)
    console.log(`- Requests Processed: ${batchStatus.request_counts.succeeded}`)
    console.log(`- Requests Errored: ${batchStatus.request_counts.errored}`)
    console.log(`- Requests Expired/Canceled: ${batchStatus.request_counts.expired} / ${batchStatus.request_counts.canceled}`)

    // 3. Download if done
    if (batchStatus.processing_status === 'ended') {
        console.log("\nBatch Processing Complete. Downloading Results...")
        const resultStream = await anthropic.messages.batches.results(cacheData.batchId)

        let rawContent = ''
        for await (const chunk of resultStream) {
            rawContent += JSON.stringify(chunk) + '\n'
        }

        console.log("\n--- RESULT PAYLOAD SUCCESSFUL EXTRACT ---")
        console.log(rawContent.substring(0, 500) + "...\n[Results Truncated for View]")

        console.log("\n✅ RESILIENCE TEST PASSED: We successfully retrieved processing data offline.")
    } else {
        console.log("\nBatch is still calculating on Anthropics servers. Close this script and test resuming again later.")
    }
}

if (require.main === module) {
    resumeBatch().catch(console.error)
}

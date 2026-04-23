import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
})

const CACHE_FILE = path.join(process.cwd(), '.mass_batch_cache.json')
const PAYLOAD_FILE = path.join(process.cwd(), 'batch_payload.jsonl')

async function submitMassBatch() {
    console.log("=== BATCH INGESTION UPLOAD ===")

    if (!fs.existsSync(PAYLOAD_FILE)) {
        console.log("❌ No batch_payload.jsonl found. Run generate-mass-batch.ts first.")
        return
    }

    const fileStats = fs.statSync(PAYLOAD_FILE)
    console.log(`📤 Uploading Payload to Anthropic (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)...`)

    // We must read the file into an array of objects to map it to the API
    // Wait, the Anthropic SDK accepts 'requests' array, not a jsonl file directly over the API.
    // However, the standard Batch API can take up to 10,000 requests. 

    const lines = fs.readFileSync(PAYLOAD_FILE, 'utf-8').trim().split('\n');
    console.log(`Parsing ${lines.length} requests...`);

    const requestsArray = lines.map(line => JSON.parse(line));

    console.log("Submitting Message Batch Queue to Anthropic Cloud...")

    let batchJob;
    try {
        batchJob = await anthropic.messages.batches.create({
            requests: requestsArray as any
        })
        console.log(`\n✅ MASS BATCH SUBMITTED! Batch ID: ${batchJob.id}`)
    } catch (e: any) {
        console.error("\n❌ Failed to submit batch. Error:", e.error || e.message)
        return
    }

    // Save state
    const cacheData = {
        batchId: batchJob.id,
        status: batchJob.processing_status,
        submittedAt: new Date().toISOString()
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2))

    console.log("\n📦 State Cached as '.mass_batch_cache.json'")
    console.log(`👉 Notice: Anthropic is now processing this offline. Run 'npx tsx scripts/monitor-mass-batch.ts' (Agent 11) to check the live dashboard.`)
}

if (require.main === module) {
    submitMassBatch().catch(console.error)
}

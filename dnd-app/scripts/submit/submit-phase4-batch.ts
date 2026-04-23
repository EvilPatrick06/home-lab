import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
})

const CACHE_FILE = path.join(process.cwd(), '.phase4_batch_cache.json')
const BATCH_INPUT = path.join(process.cwd(), 'batch_payload_phase4.jsonl')

async function submitBatch() {
    console.log("=== PHASE 4: BATCH UPLOAD ===")

    if (!fs.existsSync(BATCH_INPUT)) {
        console.error("❌ Phase 4 Payload not found!")
        process.exit(1)
    }

    const stat = fs.statSync(BATCH_INPUT)
    const mbSize = (stat.size / (1024 * 1024)).toFixed(2)
    console.log(`📤 Uploading Phase 4 Payload to Anthropic (${mbSize} MB)...`)

    try {
        const lines = fs.readFileSync(BATCH_INPUT, 'utf-8').trim().split('\n');
        console.log(`Parsing ${lines.length} requests...`);
        const requestsArray = lines.map(line => JSON.parse(line));

        console.log(`Submitting Phase 4 Queue to Anthropic Cloud...`);

        // Create the Message Batch Job
        const batchJob = await anthropic.messages.batches.create({
            requests: requestsArray as any
        })

        console.log(`\n✅ PHASE 4 BATCH SUBMITTED! Batch ID: ${batchJob.id}`)
        console.log(`\n📦 State Cached as '.phase4_batch_cache.json'`)

        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            batchId: batchJob.id,
            timestamp: new Date().toISOString()
        }, null, 2))

    } catch (e: any) {
        console.error("\n❌ Failed to submit Phase 4 batch. Error:", e.error || e.message)
    }
}

if (require.main === module) {
    submitBatch().catch(console.error)
}

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CACHE_FILE = path.join(process.cwd(), '.phase5_batch_cache.json')
const BATCH_INPUT = path.join(process.cwd(), 'batch_payload_phase5.jsonl')
const ID_MAP_FILE = path.join(process.cwd(), 'batch-id-map-phase5.json')
const ROOT_DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e')

async function submitBatch() {
    console.log("=== PHASE 5: HARDCODED DATA UPLOAD ===")

    if (!fs.existsSync(BATCH_INPUT)) {
        console.error("❌ Phase 5 payload not found! Run generate-phase5-batch.ts first.")
        process.exit(1)
    }

    const stat = fs.statSync(BATCH_INPUT)
    console.log(`📤 Uploading Phase 5 Payload (${(stat.size / 1024).toFixed(1)} KB)...`)

    try {
        const lines = fs.readFileSync(BATCH_INPUT, 'utf-8').trim().split('\n')
        console.log(`Parsing ${lines.length} requests...`)
        const requestsArray = lines.map(line => JSON.parse(line))

        console.log(`Submitting Phase 5 Queue to Anthropic Cloud...`)
        const batchJob = await anthropic.messages.batches.create({
            requests: requestsArray as any
        })

        console.log(`\n✅ PHASE 5 BATCH SUBMITTED! Batch ID: ${batchJob.id}`)

        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            batchId: batchJob.id,
            timestamp: new Date().toISOString()
        }, null, 2))
        console.log(`📦 State cached as '.phase5_batch_cache.json'`)
        console.log(`👉 Run 'npx tsx scripts/monitor-phase5-batch.ts' to check status + unpack results.`)

    } catch (e: any) {
        console.error("\n❌ Failed to submit batch:", e.error || e.message)
    }
}

async function monitorAndUnpack() {
    console.log("=== PHASE 5: MONITOR & UNPACK ===")

    if (!fs.existsSync(CACHE_FILE)) {
        console.error("❌ No active Phase 5 batch. Submit one first.")
        return
    }
    if (!fs.existsSync(ID_MAP_FILE)) {
        console.error("❌ No batch-id-map-phase5.json found.")
        return
    }

    const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    const idMap = JSON.parse(fs.readFileSync(ID_MAP_FILE, 'utf-8'))

    console.log(`\n📡 Fetching Status for Job: ${cacheData.batchId}`)
    const batchStatus = await anthropic.messages.batches.retrieve(cacheData.batchId)

    console.log(`\n${'─'.repeat(48)}`)
    console.log(`STATUS:          ${batchStatus.processing_status.toUpperCase()}`)
    console.log('─'.repeat(48))
    console.log(`Succeeded:       ${batchStatus.request_counts.succeeded}`)
    console.log(`Processing:      ${batchStatus.request_counts.processing}`)
    console.log(`Errored:         ${batchStatus.request_counts.errored}`)
    console.log('─'.repeat(48))

    if (batchStatus.processing_status !== 'ended') {
        console.log(`\nThe Anthropic cloud cluster is still computing. Run this script again later.`)
        return
    }

    console.log(`\n✅ Batch complete! Unpacking results...`)

    let successWrites = 0, failedWrites = 0
    const resultStream = anthropic.messages.batches.results(cacheData.batchId)

    for await (const chunk of await resultStream) {
        const customId = chunk.custom_id
        const originalPath = idMap[customId]
        if (!originalPath) {
            console.error(`❌ Hash mismatch for ${customId}`)
            failedWrites++
            continue
        }

        const targetPath = path.join(ROOT_DATA_DIR, originalPath)
        const dir = path.dirname(targetPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

        if (chunk.result.type === 'succeeded') {
            const textBlock = chunk.result.message.content.find((b: any) => b.type === 'text')
            const rawText = (textBlock && textBlock.type === 'text') ? textBlock.text : ''
            try {
                const clean = rawText.replace(/^```json\n?/, '').replace(/```$/, '').trim()
                const parsed = JSON.parse(clean)
                fs.writeFileSync(targetPath, JSON.stringify(parsed, null, 2))
                console.log(`✅ Saved: ${originalPath}`)
                successWrites++
            } catch (e: any) {
                console.error(`❌ Parse error for ${originalPath}:`, e.message)
                failedWrites++
            }
        } else {
            console.error(`❌ API error for ${originalPath}`)
            failedWrites++
        }
    }

    console.log(`\n🎉 Phase 5 Complete! Saved: ${successWrites} | Failed: ${failedWrites}`)
}

const cmd = process.argv[2]
if (cmd === 'monitor') {
    monitorAndUnpack().catch(console.error)
} else {
    submitBatch().catch(console.error)
}

/**
 * Phase 6 — Step 3: Submit + Monitor Missing Data Batch
 *
 * Usage:
 *   npx tsx scripts/submit-missing-data-batch.ts          # Submit
 *   npx tsx scripts/submit-missing-data-batch.ts monitor   # Monitor + unpack
 */

import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PAYLOAD_FILE = path.join(process.cwd(), 'batch_payload_missing.jsonl')
const ID_MAP_FILE = path.join(process.cwd(), 'batch-id-map-missing.json')
const CACHE_FILE = path.join(process.cwd(), '.missing_batch_cache.json')
const ROOT_DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e')

async function submitBatch() {
    console.log('=== SUBMITTING MISSING DATA BATCH ===\n')

    if (!fs.existsSync(PAYLOAD_FILE)) {
        console.log('❌ No payload file found. Run generate-missing-data-batch.ts first.')
        return
    }

    // Count requests
    const lines = fs.readFileSync(PAYLOAD_FILE, 'utf-8').trim().split('\n')
    console.log(`📦 Submitting ${lines.length} requests...\n`)

    // We must read the file into an array of objects to map it to the API
    const requestsArray = lines.map(line => JSON.parse(line));

    // Create the batch
    const batch = await anthropic.messages.batches.create({
        requests: requestsArray as any
    })

    console.log(`🚀 Batch created: ${batch.id}`)
    console.log(`   Status: ${batch.processing_status}`)

    // Cache the batch ID
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ batchId: batch.id }))
    console.log(`\n💾 Cached batch ID to ${CACHE_FILE}`)
    console.log(`\nRun with 'monitor' argument to check status and unpack results.`)
}

async function monitorBatch() {
    console.log('=== MISSING DATA BATCH: MONITOR & UNPACK ===\n')

    if (!fs.existsSync(CACHE_FILE)) {
        console.log('❌ No active batch. Submit one first.')
        return
    }

    if (!fs.existsSync(ID_MAP_FILE)) {
        console.log('❌ No ID map file found.')
        return
    }

    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    const idMap = JSON.parse(fs.readFileSync(ID_MAP_FILE, 'utf-8'))

    const status = await anthropic.messages.batches.retrieve(cache.batchId)

    console.log(`STATUS: ${status.processing_status.toUpperCase()}`)
    console.log(`Succeeded: ${status.request_counts.succeeded} | Errored: ${status.request_counts.errored} | Processing: ${status.request_counts.processing}`)

    if (status.processing_status !== 'ended') {
        console.log('\n⏳ Still processing. Run again later.')
        return
    }

    console.log('\n📥 Unpacking results...\n')

    const results = await anthropic.messages.batches.results(cache.batchId)
    let saved = 0
    let failed = 0

    for await (const chunk of results) {
        const customId = chunk.custom_id
        const targetPath = idMap[customId]

        if (!targetPath) {
            console.log(`❌ Unknown ID: ${customId}`)
            failed++
            continue
        }

        const fullPath = path.join(ROOT_DATA_DIR, targetPath)

        if (chunk.result.type === 'succeeded') {
            const textBlock = chunk.result.message.content.find(
                (block: any) => block.type === 'text'
            )

            if (!textBlock || textBlock.type !== 'text') {
                console.log(`❌ No text block for ${targetPath}`)
                failed++
                continue
            }

            let jsonStr = textBlock.text
            if (jsonStr.startsWith('```json')) {
                jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/```$/, '')
            }

            try {
                const parsed = JSON.parse(jsonStr.trim())

                // Ensure directory exists
                fs.mkdirSync(path.dirname(fullPath), { recursive: true })
                fs.writeFileSync(fullPath, JSON.stringify(parsed, null, 2))

                console.log(`✅ ${targetPath}`)
                saved++
            } catch (err: any) {
                console.log(`❌ Parse error for ${targetPath}: ${err.message}`)
                failed++
            }
        } else {
            console.log(`❌ API error for ${targetPath}:`, chunk.result)
            failed++
        }
    }

    console.log(`\n🎉 Complete! Saved: ${saved} | Failed: ${failed}`)
}

const cmd = process.argv[2]
if (cmd === 'monitor') {
    monitorBatch().catch(console.error)
} else {
    submitBatch().catch(console.error)
}

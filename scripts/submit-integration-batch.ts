import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PAYLOAD_FILE = path.join(process.cwd(), 'batch_payload_integration.jsonl')
const ID_MAP_FILE = path.join(process.cwd(), 'batch-id-map-integration.json')
const CACHE_FILE = path.join(process.cwd(), '.integration_batch_cache.json')
const PROJECT_ROOT = process.cwd()

async function submitBatch() {
    console.log('=== SUBMITTING INTEGRATION MEGA-BATCH ===\n')

    if (!fs.existsSync(PAYLOAD_FILE)) {
        console.log('❌ No payload file found. Run generate-mega-batch.ts first.')
        return
    }

    const lines = fs.readFileSync(PAYLOAD_FILE, 'utf-8').trim().split('\n')
    console.log(`📦 Submitting ${lines.length} requests...\n`)

    const requestsArray = lines.map(line => JSON.parse(line));

    const batch = await anthropic.messages.batches.create({
        requests: requestsArray as any
    })

    console.log(`🚀 Batch created: ${batch.id}`)
    console.log(`   Status: ${batch.processing_status}`)

    fs.writeFileSync(CACHE_FILE, JSON.stringify({ batchId: batch.id }))
    console.log(`\n💾 Cached batch ID to ${CACHE_FILE}`)
    console.log(`\nRun with 'monitor' argument to check status and unpack results.`)
}

async function monitorBatch() {
    console.log('=== INTEGRATION BATCH: MONITOR & UNPACK ===\n')

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

        const fullPath = path.join(PROJECT_ROOT, targetPath)

        // Prevent Anthropic from overwriting our manually crafted types!
        if (targetPath.includes('src/renderer/src/types')) {
            console.log(`⏭️ Skipping type file: ${targetPath}`)
            saved++
            continue
        }

        if (chunk.result.type === 'succeeded') {
            const textBlock = chunk.result.message.content.find(
                (block: any) => block.type === 'text'
            )

            if (!textBlock || textBlock.type !== 'text') {
                console.log(`❌ No text block for ${targetPath}`)
                failed++
                continue
            }

            let codeStr = textBlock.text
            if (codeStr.startsWith('```typescript')) {
                codeStr = codeStr.replace(/^```typescript\n?/, '').replace(/```$/, '')
            } else if (codeStr.startsWith('```tsx')) {
                codeStr = codeStr.replace(/^```tsx\n?/, '').replace(/```$/, '')
            } else if (codeStr.startsWith('```')) {
                codeStr = codeStr.replace(/^```.*\n?/, '').replace(/```$/, '')
            }

            try {
                fs.writeFileSync(fullPath, codeStr.trim() + '\n')
                console.log(`✅ ${targetPath}`)
                saved++
            } catch (err: any) {
                console.log(`❌ Save error for ${targetPath}: ${err.message}`)
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

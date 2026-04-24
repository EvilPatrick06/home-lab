import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CACHE_FILE = path.join(process.cwd(), '.phase4_batch_cache.json')
const ID_MAP_FILE = path.join(process.cwd(), 'batch-id-map-phase4.json')
const ROOT_DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e')

async function monitorPhase4() {
    console.log("=== PHASE 4: MONITOR & UNPACK ===")

    if (!fs.existsSync(CACHE_FILE)) {
        console.error("❌ No Phase 4 batch cache found.")
        return
    }
    if (!fs.existsSync(ID_MAP_FILE)) {
        console.error("❌ No batch-id-map-phase4.json found.")
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
        console.log(`\nStill computing. Run this script again later.`)
        return
    }

    console.log(`\n✅ Batch complete! Unpacking results...`)

    let successWrites = 0, failedWrites = 0
    const resultStream = await anthropic.messages.batches.results(cacheData.batchId)

    for await (const chunk of resultStream) {
        const customId = chunk.custom_id
        const originalPath = idMap[customId]
        if (!originalPath) {
            console.error(`❌ Hash mismatch: ${customId}`)
            failedWrites++
            continue
        }

        const targetPath = path.join(ROOT_DATA_DIR, originalPath)
        const dir = path.dirname(targetPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

        if (chunk.result.type === 'succeeded') {
            // Find the text content block (not the thinking block)
            const textBlock = chunk.result.message.content.find(
                (block: any) => block.type === 'text'
            )
            let rawOutput = ''
            if (textBlock && textBlock.type === 'text') {
                rawOutput = textBlock.text
            }

            try {
                let jsonStr = rawOutput
                if (jsonStr.startsWith("```json")) {
                    jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/```$/, '')
                }
                const parsed = JSON.parse(jsonStr.trim())
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

    console.log(`\n🎉 Phase 4 Complete! Saved: ${successWrites} | Failed: ${failedWrites}`)
}

if (require.main === module) {
    monitorPhase4().catch(console.error)
}

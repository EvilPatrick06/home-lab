import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DATA_DIR = path.join(process.cwd(), 'src/renderer/public/data/5e')
const ORIGINAL_PAYLOAD = path.join(process.cwd(), 'batch_payload.jsonl')
const ORIGINAL_ID_MAP = path.join(process.cwd(), 'batch-id-map.json')
const RETRY_PAYLOAD = path.join(process.cwd(), 'batch_payload_retry.jsonl')
const RETRY_ID_MAP = path.join(process.cwd(), 'batch-id-map-retry.json')
const RETRY_CACHE = path.join(process.cwd(), '.retry_batch_cache.json')

// The 45 files that failed
const FAILED_FILES = [
    "classes/paladin.json",
    "equipment/magic-items/permanent/wondrous/adamantine-armor.json",
    "equipment/magic-items/permanent/wondrous/armor-of-resistance.json",
    "equipment/magic-items/permanent/wondrous/berserker-axe.json",
    "equipment/magic-items/permanent/wondrous/brooch-of-shielding.json",
    "equipment/magic-items/permanent/wondrous/cap-of-water-breathing.json",
    "equipment/magic-items/permanent/wondrous/cloak-of-the-bat.json",
    "equipment/magic-items/permanent/wondrous/crystal-ball-of-true-seeing.json",
    "equipment/magic-items/permanent/wondrous/dancing-sword.json",
    "equipment/magic-items/permanent/wondrous/decanter-of-endless-water.json",
    "equipment/magic-items/permanent/wondrous/demon-armor.json",
    "equipment/magic-items/permanent/wondrous/dread-helm.json",
    "equipment/magic-items/permanent/wondrous/dust-of-disappearance.json",
    "equipment/magic-items/permanent/wondrous/efreeti-bottle.json",
    "equipment/magic-items/permanent/wondrous/efreeti-chain.json",
    "equipment/magic-items/permanent/wondrous/eyes-of-minute-seeing.json",
    "equipment/magic-items/permanent/wondrous/eyes-of-the-eagle.json",
    "equipment/magic-items/permanent/wondrous/headband-of-intellect.json",
    "equipment/magic-items/permanent/wondrous/iron-bands-of-bilarro.json",
    "equipment/magic-items/permanent/wondrous/mantle-of-spell-resistance.json",
    "equipment/magic-items/permanent/wondrous/manual-of-gainful-exercise.json",
    "equipment/magic-items/permanent/wondrous/necklace-of-prayer-beads.json",
    "equipment/magic-items/permanent/wondrous/nine-lives-stealer.json",
    "equipment/magic-items/permanent/wondrous/pipes-of-haunting.json",
    "equipment/magic-items/permanent/wondrous/portable-hole.json",
    "equipment/magic-items/permanent/wondrous/potion-of-giant-strength.json",
    "equipment/magic-items/permanent/wondrous/potion-of-invisibility.json",
    "equipment/magic-items/permanent/wondrous/quaal-s-feather-token.json",
    "equipment/magic-items/permanent/wondrous/ring-of-djinni-summoning.json",
    "equipment/magic-items/permanent/wondrous/ring-of-elemental-command.json",
    "equipment/magic-items/permanent/wondrous/ring-of-resistance.json",
    "equipment/magic-items/permanent/wondrous/rod-of-alertness.json",
    "equipment/magic-items/permanent/wondrous/sovereign-glue.json",
    "equipment/magic-items/permanent/wondrous/staff-of-healing.json",
    "equipment/magic-items/permanent/wondrous/staff-of-the-magi.json",
    "equipment/magic-items/permanent/wondrous/staff-of-the-woodlands.json",
    "equipment/magic-items/permanent/wondrous/stone-of-controlling-earth-elementals.json",
    "equipment/magic-items/permanent/wondrous/sun-blade.json",
    "equipment/magic-items/permanent/wondrous/sword-of-kas.json",
    "equipment/magic-items/permanent/wondrous/sword-of-sharpness.json",
    "equipment/magic-items/permanent/wondrous/tome-of-the-stilled-tongue.json",
    "equipment/magic-items/permanent/wondrous/wand-of-enemy-detection.json",
    "equipment/magic-items/permanent/wondrous/well-of-many-worlds.json",
    "equipment/magic-items/permanent/wondrous/winged-boots.json",
    "spells/custom-spells/flesh-to-stone.json"
]

async function retryFailed() {
    console.log("=== PHASE 3 RETRY: 45 FAILED FILES ===")

    // Read the original payload to find the matching requests
    const originalLines = fs.readFileSync(ORIGINAL_PAYLOAD, 'utf-8').trim().split('\n')
    const originalIdMap = JSON.parse(fs.readFileSync(ORIGINAL_ID_MAP, 'utf-8'))

    // Build reverse map: filePath -> customId
    const pathToId: Record<string, string> = {}
    for (const [id, filePath] of Object.entries(originalIdMap)) {
        pathToId[filePath as string] = id
    }

    const retryRequests: any[] = []
    const retryIdMap: Record<string, string> = {}

    for (const failedFile of FAILED_FILES) {
        const originalId = pathToId[failedFile]
        if (!originalId) {
            console.error(`❌ Could not find original request for: ${failedFile}`)
            continue
        }

        // Find the original request line
        const originalLine = originalLines.find(line => {
            const parsed = JSON.parse(line)
            return parsed.custom_id === originalId
        })

        if (!originalLine) {
            console.error(`❌ Could not find payload line for: ${failedFile}`)
            continue
        }

        const request = JSON.parse(originalLine)
        // Use a new unique ID for the retry
        const retryHash = crypto.createHash('sha1').update('retry_' + failedFile).digest('hex')
        const retryId = `retry_${retryHash}`
        request.custom_id = retryId

        // Reduce thinking budget to leave more room for the actual output
        if (request.params.thinking) {
            request.params.thinking.budget_tokens = 4000
        }

        retryRequests.push(request)
        retryIdMap[retryId] = failedFile
    }

    console.log(`Prepared ${retryRequests.length} retry requests.`)

    // Save the retry payload
    fs.writeFileSync(RETRY_PAYLOAD, retryRequests.map(r => JSON.stringify(r)).join('\n'), 'utf-8')
    fs.writeFileSync(RETRY_ID_MAP, JSON.stringify(retryIdMap, null, 2), 'utf-8')

    // Submit directly
    console.log(`📤 Submitting retry batch to Anthropic...`)
    try {
        const batchJob = await anthropic.messages.batches.create({
            requests: retryRequests as any
        })
        console.log(`\n✅ RETRY BATCH SUBMITTED! Batch ID: ${batchJob.id}`)
        fs.writeFileSync(RETRY_CACHE, JSON.stringify({
            batchId: batchJob.id,
            timestamp: new Date().toISOString()
        }, null, 2))
        console.log(`📦 Cached as '.retry_batch_cache.json'`)
        console.log(`👉 Run 'npx tsx scripts/retry-failed.ts monitor' to check and unpack.`)
    } catch (e: any) {
        console.error("❌ Submit failed:", e.error || e.message)
    }
}

async function monitorRetry() {
    console.log("=== RETRY MONITOR & UNPACK ===")
    if (!fs.existsSync(RETRY_CACHE) || !fs.existsSync(RETRY_ID_MAP)) {
        console.error("❌ No retry batch found.")
        return
    }

    const cacheData = JSON.parse(fs.readFileSync(RETRY_CACHE, 'utf-8'))
    const idMap = JSON.parse(fs.readFileSync(RETRY_ID_MAP, 'utf-8'))

    const status = await anthropic.messages.batches.retrieve(cacheData.batchId)
    console.log(`\nSTATUS: ${status.processing_status.toUpperCase()}`)
    console.log(`Succeeded: ${status.request_counts.succeeded} | Errored: ${status.request_counts.errored} | Processing: ${status.request_counts.processing}`)

    if (status.processing_status !== 'ended') {
        console.log("Still processing. Run again later.")
        return
    }

    let success = 0, fail = 0
    const results = await anthropic.messages.batches.results(cacheData.batchId)
    for await (const chunk of results) {
        const originalPath = idMap[chunk.custom_id]
        if (!originalPath) { fail++; continue }

        const targetPath = path.join(DATA_DIR, originalPath)
        if (chunk.result.type === 'succeeded') {
            const textBlock = chunk.result.message.content.find((b: any) => b.type === 'text')
            if (textBlock && textBlock.type === 'text') {
                try {
                    let json = textBlock.text
                    if (json.startsWith("```json")) json = json.replace(/^```json\n?/, '').replace(/```$/, '')
                    fs.writeFileSync(targetPath, JSON.stringify(JSON.parse(json.trim()), null, 2))
                    console.log(`✅ ${originalPath}`)
                    success++
                } catch (e: any) {
                    console.error(`❌ ${originalPath}: ${e.message}`)
                    fail++
                }
            }
        } else { fail++ }
    }
    console.log(`\n🎉 Retry Complete! Saved: ${success} | Failed: ${fail}`)
}

const cmd = process.argv[2]
if (cmd === 'monitor') {
    monitorRetry().catch(console.error)
} else {
    retryFailed().catch(console.error)
}

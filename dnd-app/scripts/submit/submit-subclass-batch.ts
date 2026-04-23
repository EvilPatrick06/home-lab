import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

const PAYLOAD_FILE = path.join(process.cwd(), 'batch-subclasses.jsonl');
const DATA_ROOT = path.join(process.cwd(), 'src/renderer/public/data/5e/classes');

// Ensure base directories exist
function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function run() {
    console.log("=== SUBMITTING SUBCLASS BATCH ===");
    if (!fs.existsSync(PAYLOAD_FILE)) {
        console.error("Payload not found.");
        return;
    }

    const lines = fs.readFileSync(PAYLOAD_FILE, 'utf-8').trim().split('\n');
    const requestsArray = lines.map(line => JSON.parse(line));

    console.log(`Submitting ${requestsArray.length} items to Batch API...`);

    let batchJob;
    try {
        batchJob = await anthropic.messages.batches.create({
            requests: requestsArray as any
        });
        console.log(`✅ BATCH SUBMITTED! Batch ID: ${batchJob.id}`);
    } catch (e: any) {
        console.error("Failed to submit batch:", e.error || e.message);
        return;
    }

    // Polling loop
    console.log("Polling for completion (this may take a minute)...");
    let status = batchJob.processing_status;
    let completedJob = batchJob;

    while (status === "in_progress") {
        await new Promise(r => setTimeout(r, 10000));
        completedJob = await anthropic.messages.batches.retrieve(batchJob.id);
        status = completedJob.processing_status;
        process.stdout.write(`...status: ${status}`);
    }

    console.log(`\n✅ BATCH FINISHED WITH STATUS: ${status}`);

    if (status !== 'ended') {
        console.error("Batch did not finish successfully.");
        return;
    }

    console.log("Fetching results...");
    const results = await anthropic.messages.batches.results(batchJob.id);

    let parsedCount = 0;

    for await (const result of results) {
        if (result.result.type === 'succeeded') {
            const resData = result.result.message.content[0];
            if ('text' in resData) {
                const text = resData.text;
                const match = text.match(/```json\n([\s\S]*?)\n```/);
                if (match) {
                    try {
                        const subclasses = JSON.parse(match[1]);
                        if (Array.isArray(subclasses)) {
                            for (const sc of subclasses) {
                                // Save into classes/{class-name}-subclasses/{subclass-id}.json
                                if (sc.className && sc.id) {
                                    const classFolder = sc.className.toLowerCase();
                                    const targetDir = path.join(DATA_ROOT, `${classFolder}-subclasses`);
                                    ensureDir(targetDir);

                                    const filename = `${sc.id.toLowerCase().replace(/\\s+/g, '-')}.json`;
                                    fs.writeFileSync(path.join(targetDir, filename), JSON.stringify(sc, null, 2));
                                    parsedCount++;
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Failed to parse JSON for a subclass response.");
                    }
                }
            }
        }
    }

    console.log(`\n🎉 DONE! Extracted ${parsedCount} Subclasses into the /classes/*-subclasses/ directories.`);
}

run().catch(console.error);

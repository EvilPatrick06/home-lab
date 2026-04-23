import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

const batchId = process.argv[2] || process.env.BATCH_ID;
if (!batchId) { console.error('Usage: npx tsx scripts/debug-batch.ts <batch-id>'); process.exit(1); }

async function debug() {
    const results = await anthropic.messages.batches.results(batchId);
    const out = [];
    for await (const result of results) {
        if (result.result.type === 'succeeded') {
            out.push({
                custom_id: result.custom_id,
                text: (result.result.message.content[0] as any).text
            });
        }
    }
    fs.writeFileSync('debug-batch.json', JSON.stringify(out, null, 2));
    console.log("Saved debug to debug-batch.json");
}

debug().catch(console.error);

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

const batchId = process.argv[2] || process.env.BATCH_ID;
if (!batchId) { console.error('Usage: npx tsx scripts/check-batch.ts <batch-id>'); process.exit(1); }

async function check() {
    const results = await anthropic.messages.batches.results(batchId);
    const out = [];
    for await (const result of results) {
        if (result.result.type === 'errored') {
            out.push({
                custom_id: result.custom_id,
                error: result.result.error
            });
        } else {
            out.push(result);
        }
    }
    console.log(JSON.stringify(out, null, 2));
}

check().catch(console.error);

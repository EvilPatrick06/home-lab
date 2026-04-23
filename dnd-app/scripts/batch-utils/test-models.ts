import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

const modelsToTest = [
    'claude-3-5-sonnet-20241022',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-sonnet-latest',
    'claude-3-5-sonnet-20240620',
    'claude-3-haiku-20240307',
    'claude-3-opus-20240229'
];

async function testModels() {
    for (const model of modelsToTest) {
        try {
            console.log(`Testing ${model}...`);
            await anthropic.messages.create({
                model: model,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'hello' }]
            });
            console.log(`✅ ${model} WORKS!`);
        } catch (e: any) {
            console.log(`❌ ${model} FAILED: ${e.error?.type || e.message}`);
        }
    }
}

testModels().catch(console.error);

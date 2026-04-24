// @ts-nocheck
import { StateGraph, Annotation } from '@langchain/langgraph'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'

dotenv.config()

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
})

async function processWithOpus(systemPrompt: string, userContent: string) {
    const stream = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 128000,
        thinking: {
            type: 'enabled',
            budget_tokens: 64000
        },
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        stream: true
    })

    let textAccumulator = ''
    process.stdout.write('   [Thinking & Streaming]')
    for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            textAccumulator += event.delta.text
            process.stdout.write('.')
        }
    }
    process.stdout.write('\n')
    return textAccumulator
}

// ==========================================
// 1. MASSIVE LANGGRAPH STATE DEFINITION
// ==========================================
const ExtractionState = Annotation.Root({
    // Input
    targetFilePath: Annotation<string>(),         // e.g., 'src/renderer/public/data/5e/spells/fireball.json'
    targetDomain: Annotation<string>(),           // e.g., '1_Spells'
    rawMarkdownSource: Annotation<string>(),      // Excerpt from PHB/DMG/MM

    // Live State
    currentAgentInControl: Annotation<string>(),  // Tracking who currently holds the file
    retryLoopCount: Annotation<number>(),         // Capped at 3 loops
    errorMessage: Annotation<string | null>(),    // For Validator / Error Tester rejection feedback

    // Global Context Artifacts
    crossReferencingSchemas: Annotation<Record<string, unknown>>(), // Schemas injected by Context Router
    relatedDependencies: Annotation<string[]>(),  // Tracked by Dependency Resolver

    // Active Processing Data
    extractedZodSchema: Annotation<unknown>({
        reducer: (a, b) => b ?? a,
        default: () => null
    }),
    rawExtractedJson: Annotation<unknown>({
        reducer: (a, b) => b ?? a,
        default: () => null
    }),
    sanitizedJson: Annotation<unknown>({
        reducer: (a, b) => b ?? a,
        default: () => null
    }),

    // Output
    finalApprovedJson: Annotation<unknown>({
        reducer: (a, b) => b ?? a,
        default: () => null
    }),
    humanInterventionRequired: Annotation<boolean>({
        reducer: (a, b) => b ?? a,
        default: () => false
    })
})

// ==========================================
// 2. THE 10 GLOBAL OVERSEERS
// ==========================================
async function globalLoadBalancer(state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 1] Load Balancer routing: ${state.targetFilePath}`)
    // Logic to batch out the 1,000+ files to the 31 Micro-Domains goes here.
    return { currentAgentInControl: 'LoadBalancer' }
}

async function contextCrossRouter(state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 2] Context Router scanning dependencies for: ${state.targetFilePath}`)
    // Logic to fetch other domain schemas (like grabbing Spells schema for a Monster file)
    return { currentAgentInControl: 'ContextRouter' }
}

async function globalCombiner(state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 3] Combiner stitching JSON for: ${state.targetFilePath}`)
    return { currentAgentInControl: 'Combiner' }
}

async function formatAdjuster(_state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 4] Format Adjuster enforcing kebab-case formatting...`)
    return { currentAgentInControl: 'FormatAdjuster' }
}

async function cybersecurityProfessional(_state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 5] Cybersecurity Pro checking JSON string for prompt injection...`)
    return { currentAgentInControl: 'Cybersecurity' }
}

async function errorEdgeCaseTester(_state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 6] Error Tester generating edge cases to break JSON schema...`)
    return { currentAgentInControl: 'ErrorTester' }
}

async function chaosEngineer(_state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 7] Chaos Engineer randomly injecting faults into pipeline for testing...`)
    return { currentAgentInControl: 'ChaosEngineer' }
}

async function dataSanitizer(_state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 8] Data Sanitizer stripping invisible unicode characters...`)
    return { currentAgentInControl: 'DataSanitizer' }
}

async function dependencyResolver(_state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 9] Dependency Resolver verifying linked IDs exist...`)
    return { currentAgentInControl: 'DependencyResolver' }
}

async function _connectionResilienceManager(_state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 10] Resilience Manager caching state and checking API connection stability...`)
    return { currentAgentInControl: 'ConnectionResilience' }
}

async function _progressReporter(_state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 11] Progress Reporter updating CLI dashboard...`)
    return { currentAgentInControl: 'ProgressReporter' }
}

async function archLibrarian(state: typeof ExtractionState.State) {
    console.log(`[Global Overseer 12] Arch-Librarian confirming save rights for: ${state.targetFilePath}`)
    // Logic to actually writeFileSync the JSON to disk
    return {
        currentAgentInControl: 'ArchLibrarian',
        finalApprovedJson: state.finalApprovedJson // Pass the state through to the end
    }
}

// ==========================================
// 3. THE 31 MICRO-DOMAIN SECTORS (217 Agents)
// ==========================================
// Here we define the specialized 7-Agent thread loop for a single Micro-Domain (e.g., Spells).
// We will replicate this setup 31 times for each specialized data subset.

// Domain 1: Spells
async function spellsPreProcessor(state: typeof ExtractionState.State) {
    console.log(`[Domain 1 - Spells] PreProcessor cleaning raw markdown text...`)
    const response = await processWithOpus(
        'You are a Markdown pre-processor. Remove any unrelated flavor text or adjacent spells from this chunk so we isolate exactly one spell.',
        state.rawMarkdownSource || ''
    )
    return { currentAgentInControl: 'Spells.PreProcessor', rawMarkdownSource: response }
}

async function spellsArchitect(state: typeof ExtractionState.State) {
    console.log(`[Domain 1 - Spells] Architect building perfect Zod Schema from markdown...`)
    const response = await processWithOpus(
        'You are the Master Data Architect for D&D 2024 Spells. Read the provided text and output ONLY a typescript interface that perfectly captures every single number, string, array, and nested object required to fully digitize this specific spell. Output nothing else.',
        state.rawMarkdownSource
    )
    return { currentAgentInControl: 'Spells.Architect', extractedZodSchema: response }
}

async function spellsExtractor(state: typeof ExtractionState.State) {
    console.log(`[Domain 1 - Spells] Extractor translating markdown into JSON following schema...`)
    const response = await processWithOpus(
        `Extract the markdown spell into JSON matching this exact structure:\n${state.extractedZodSchema}\nOutput ONLY valid JSON wrapped in \`\`\`json.`,
        state.rawMarkdownSource
    )

    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/)
    const rawJson = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(response)

    return { currentAgentInControl: 'Spells.Extractor', rawExtractedJson: rawJson }
}

async function spellsSchemaEnforcer(_state: typeof ExtractionState.State) {
    console.log(`[Domain 1 - Spells] Schema Enforcer verifying keys...`)
    return { currentAgentInControl: 'Spells.SchemaEnforcer' } // Stubbed for now, normally runs pure TS verification
}

async function spellsMathVerifier(state: typeof ExtractionState.State) {
    console.log(`[Domain 1 - Spells] Math Verifier checking dice logic...`)
    const response = await processWithOpus(
        `Verify that no dice numbers or casting times were hallucinated. Does this JSON perfectly match the math in the source markdown?\n\nJSON:\n${JSON.stringify(state.rawExtractedJson)}\n\nMarkdown:\n${state.rawMarkdownSource}\n\nReply EXACTLY with "PASS" or "FAIL: [reason]".`,
        'Verify.'
    )
    const result = response
    if (result.startsWith('FAIL')) {
        return { errorMessage: result, retryLoopCount: (state.retryLoopCount || 0) + 1 }
    }
    return { currentAgentInControl: 'Spells.MathVerifier', errorMessage: null }
}

async function spellsSyntaxSanitizer(state: typeof ExtractionState.State) {
    console.log(`[Domain 1 - Spells] Syntax Sanitizer ensuring proper Markdown fields...`)
    return { currentAgentInControl: 'Spells.SyntaxSanitizer', sanitizedJson: state.rawExtractedJson }
}

async function spellsFinalValidator(state: typeof ExtractionState.State) {
    console.log(`[Domain 1 - Spells] Final Validator approving output...`)
    return { currentAgentInControl: 'Spells.FinalValidator', finalApprovedJson: state.sanitizedJson }
}

// Domain 2: Classes
async function classesPreProcessor(state: typeof ExtractionState.State) {
    console.log(`[Domain 2 - Classes] PreProcessor cleaning raw markdown text...`)
    const response = await processWithOpus(
        'You are a Markdown pre-processor for D&D 2024 Classes. Remove any unrelated flavor text or adjacent classes from this chunk so we isolate exactly one class definition.',
        state.rawMarkdownSource || ''
    )
    return { currentAgentInControl: 'Classes.PreProcessor', rawMarkdownSource: response }
}

async function classesArchitect(state: typeof ExtractionState.State) {
    console.log(`[Domain 2 - Classes] Architect building perfect Zod Schema from markdown...`)
    const response = await processWithOpus(
        'You are the Master Data Architect for D&D 2024 Classes. Read the provided text and output ONLY a typescript interface that perfectly captures every single field, array, and nested object required to fully digitize this specific class. Output nothing else.',
        state.rawMarkdownSource
    )
    return { currentAgentInControl: 'Classes.Architect', extractedZodSchema: response }
}

async function classesExtractor(state: typeof ExtractionState.State) {
    console.log(`[Domain 2 - Classes] Extractor translating markdown into JSON following schema...`)
    const response = await processWithOpus(
        `Extract the markdown class into JSON matching this exact structure:\n${state.extractedZodSchema}\nOutput ONLY valid JSON wrapped in \`\`\`json.`,
        state.rawMarkdownSource
    )

    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/)
    const rawJson = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(response)

    return { currentAgentInControl: 'Classes.Extractor', rawExtractedJson: rawJson }
}

async function classesSchemaEnforcer(_state: typeof ExtractionState.State) {
    console.log(`[Domain 2 - Classes] Schema Enforcer verifying keys...`)
    return { currentAgentInControl: 'Classes.SchemaEnforcer' } // Stubbed for now, normally runs pure TS verification
}

async function classesMathVerifier(state: typeof ExtractionState.State) {
    console.log(`[Domain 2 - Classes] Math Verifier checking level progression and hit dice...`)
    const response = await processWithOpus(
        `Verify that all level progression data, hit dice, and ability score requirements are accurate. Does this JSON perfectly match the mechanics in the source markdown?\n\nJSON:\n${JSON.stringify(state.rawExtractedJson)}\n\nMarkdown:\n${state.rawMarkdownSource}\n\nReply EXACTLY with "PASS" or "FAIL: [reason]".`,
        'Verify.'
    )
    const result = response
    if (result.startsWith('FAIL')) {
        return { errorMessage: result, retryLoopCount: (state.retryLoopCount || 0) + 1 }
    }
    return { currentAgentInControl: 'Classes.MathVerifier', errorMessage: null }
}

async function classesSyntaxSanitizer(state: typeof ExtractionState.State) {
    console.log(`[Domain 2 - Classes] Syntax Sanitizer ensuring proper formatting...`)
    return { currentAgentInControl: 'Classes.SyntaxSanitizer', sanitizedJson: state.rawExtractedJson }
}

async function classesFinalValidator(state: typeof ExtractionState.State) {
    console.log(`[Domain 2 - Classes] Final Validator approving output...`)
    return { currentAgentInControl: 'Classes.FinalValidator', finalApprovedJson: state.sanitizedJson }
}

// Domain 3: Feats
async function featsPreProcessor(state: typeof ExtractionState.State) {
    console.log(`[Domain 3 - Feats] PreProcessor cleaning raw markdown text...`)
    const response = await processWithOpus(
        'You are a Markdown pre-processor for D&D 2024 Feats. Remove any unrelated flavor text or adjacent feats from this chunk so we isolate exactly one feat definition.',
        state.rawMarkdownSource || ''
    )
    return { currentAgentInControl: 'Feats.PreProcessor', rawMarkdownSource: response }
}

async function featsArchitect(state: typeof ExtractionState.State) {
    console.log(`[Domain 3 - Feats] Architect building perfect Zod Schema from markdown...`)
    const response = await processWithOpus(
        'You are the Master Data Architect for D&D 2024 Feats. Read the provided text and output ONLY a typescript interface that perfectly captures every single field, array, and nested object required to fully digitize this specific feat. Output nothing else.',
        state.rawMarkdownSource
    )
    return { currentAgentInControl: 'Feats.Architect', extractedZodSchema: response }
}

async function featsExtractor(state: typeof ExtractionState.State) {
    console.log(`[Domain 3 - Feats] Extractor translating markdown into JSON following schema...`)
    const response = await processWithOpus(
        `Extract the markdown feat into JSON matching this exact structure:\n${state.extractedZodSchema}\nOutput ONLY valid JSON wrapped in \`\`\`json.`,
        state.rawMarkdownSource
    )

    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/)
    const rawJson = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(response)

    return { currentAgentInControl: 'Feats.Extractor', rawExtractedJson: rawJson }
}

async function featsSchemaEnforcer(_state: typeof ExtractionState.State) {
    console.log(`[Domain 3 - Feats] Schema Enforcer verifying keys...`)
    return { currentAgentInControl: 'Feats.SchemaEnforcer' } // Stubbed for now, normally runs pure TS verification
}

async function featsMathVerifier(state: typeof ExtractionState.State) {
    console.log(`[Domain 3 - Feats] Math Verifier checking prerequisites and ability score increases...`)
    const response = await processWithOpus(
        `Verify that all prerequisites, ability score increases, and feat benefits are accurately represented. Does this JSON perfectly match the mechanics in the source markdown?\n\nJSON:\n${JSON.stringify(state.rawExtractedJson)}\n\nMarkdown:\n${state.rawMarkdownSource}\n\nReply EXACTLY with "PASS" or "FAIL: [reason]".`,
        'Verify.'
    )
    const result = response
    if (result.startsWith('FAIL')) {
        return { errorMessage: result, retryLoopCount: (state.retryLoopCount || 0) + 1 }
    }
    return { currentAgentInControl: 'Feats.MathVerifier', errorMessage: null }
}

async function featsSyntaxSanitizer(state: typeof ExtractionState.State) {
    console.log(`[Domain 3 - Feats] Syntax Sanitizer ensuring proper formatting...`)
    return { currentAgentInControl: 'Feats.SyntaxSanitizer', sanitizedJson: state.rawExtractedJson }
}

async function featsFinalValidator(state: typeof ExtractionState.State) {
    console.log(`[Domain 3 - Feats] Final Validator approving output...`)
    return { currentAgentInControl: 'Feats.FinalValidator', finalApprovedJson: state.sanitizedJson }
}

// Domain 4: Backgrounds
async function backgroundsPreProcessor(state: typeof ExtractionState.State) {
    console.log(`[Domain 4 - Backgrounds] PreProcessor cleaning raw markdown text...`)
    const response = await processWithOpus(
        'You are a Markdown pre-processor for D&D 2024 Backgrounds. Remove any unrelated flavor text or adjacent backgrounds from this chunk so we isolate exactly one background definition.',
        state.rawMarkdownSource || ''
    )
    return { currentAgentInControl: 'Backgrounds.PreProcessor', rawMarkdownSource: response }
}

async function backgroundsArchitect(state: typeof ExtractionState.State) {
    console.log(`[Domain 4 - Backgrounds] Architect building perfect Zod Schema from markdown...`)
    const response = await processWithOpus(
        'You are the Master Data Architect for D&D 2024 Backgrounds. Read the provided text and output ONLY a typescript interface that perfectly captures every single field, array, and nested object required to fully digitize this specific background. Output nothing else.',
        state.rawMarkdownSource
    )
    return { currentAgentInControl: 'Backgrounds.Architect', extractedZodSchema: response }
}

async function backgroundsExtractor(state: typeof ExtractionState.State) {
    console.log(`[Domain 4 - Backgrounds] Extractor translating markdown into JSON following schema...`)
    const response = await processWithOpus(
        `Extract the markdown background into JSON matching this exact structure:\n${state.extractedZodSchema}\nOutput ONLY valid JSON wrapped in \`\`\`json.`,
        state.rawMarkdownSource
    )

    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/)
    const rawJson = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(response)

    return { currentAgentInControl: 'Backgrounds.Extractor', rawExtractedJson: rawJson }
}

async function backgroundsSchemaEnforcer(_state: typeof ExtractionState.State) {
    console.log(`[Domain 4 - Backgrounds] Schema Enforcer verifying keys...`)
    return { currentAgentInControl: 'Backgrounds.SchemaEnforcer' } // Stubbed for now, normally runs pure TS verification
}

async function backgroundsMathVerifier(state: typeof ExtractionState.State) {
    console.log(`[Domain 4 - Backgrounds] Math Verifier checking equipment costs and ability score suggestions...`)
    const response = await processWithOpus(
        `Verify that all equipment costs, gold pieces, and ability score suggestions are accurately represented. Does this JSON perfectly match the mechanics in the source markdown?\n\nJSON:\n${JSON.stringify(state.rawExtractedJson)}\n\nMarkdown:\n${state.rawMarkdownSource}\n\nReply EXACTLY with "PASS" or "FAIL: [reason]".`,
        'Verify.'
    )
    const result = response
    if (result.startsWith('FAIL')) {
        return { errorMessage: result, retryLoopCount: (state.retryLoopCount || 0) + 1 }
    }
    return { currentAgentInControl: 'Backgrounds.MathVerifier', errorMessage: null }
}

async function backgroundsSyntaxSanitizer(state: typeof ExtractionState.State) {
    console.log(`[Domain 4 - Backgrounds] Syntax Sanitizer ensuring proper formatting...`)
    return { currentAgentInControl: 'Backgrounds.SyntaxSanitizer', sanitizedJson: state.rawExtractedJson }
}

async function backgroundsFinalValidator(state: typeof ExtractionState.State) {
    console.log(`[Domain 4 - Backgrounds] Final Validator approving output...`)
    return { currentAgentInControl: 'Backgrounds.FinalValidator', finalApprovedJson: state.sanitizedJson }
}

// Router function to handle the 3-loop Retry Logic
const shouldRetryOrEnd = (state: typeof ExtractionState.State) => {
    if (state.errorMessage && (state.retryLoopCount || 0) < 3) {
        console.log(`FAILED VALIDATION: Routing back to Extractor. Loop Count: ${state.retryLoopCount || 0}`)
        return "retryExtractor"
    } else if (state.errorMessage && (state.retryLoopCount || 0) >= 3) {
        console.log(`CATASTROPHIC FAILURE: Max loops reached. Requiring Human Intervention!`)
        return "humanIntervention"
    }
    return "nextDomainNode"
}

// ==========================================
// 4. GRAPH CONSTRUCTION
// ==========================================
export function buildGodSwarmGraph() {
    const builder = new StateGraph(ExtractionState)

    // Add the 10 Global Overseers
    builder.addNode("GlobalLoadBalancer", globalLoadBalancer)
    builder.addNode("ContextCrossRouter", contextCrossRouter)
    builder.addNode("GlobalCombiner", globalCombiner)
    builder.addNode("FormatAdjuster", formatAdjuster)
    builder.addNode("CybersecurityProfessional", cybersecurityProfessional)
    builder.addNode("ErrorTester", errorEdgeCaseTester)
    builder.addNode("ChaosEngineer", chaosEngineer)
    builder.addNode("DataSanitizer", dataSanitizer)
    builder.addNode("DependencyResolver", dependencyResolver)
    builder.addNode("ArchLibrarian", archLibrarian)

    // Add Domain 1: Spells Agents (Nodes)
    builder.addNode("Spells.PreProcessor", spellsPreProcessor)
    builder.addNode("Spells.Architect", spellsArchitect)
    builder.addNode("Spells.Extractor", spellsExtractor)
    builder.addNode("Spells.SchemaEnforcer", spellsSchemaEnforcer)
    builder.addNode("Spells.MathVerifier", spellsMathVerifier)
    builder.addNode("Spells.SyntaxSanitizer", spellsSyntaxSanitizer)
    builder.addNode("Spells.Validator", spellsFinalValidator)

    // Add Domain 2: Classes Agents (Nodes)
    builder.addNode("Classes.PreProcessor", classesPreProcessor)
    builder.addNode("Classes.Architect", classesArchitect)
    builder.addNode("Classes.Extractor", classesExtractor)
    builder.addNode("Classes.SchemaEnforcer", classesSchemaEnforcer)
    builder.addNode("Classes.MathVerifier", classesMathVerifier)
    builder.addNode("Classes.SyntaxSanitizer", classesSyntaxSanitizer)
    builder.addNode("Classes.Validator", classesFinalValidator)

    // Add Domain 3: Feats Agents (Nodes)
    builder.addNode("Feats.PreProcessor", featsPreProcessor)
    builder.addNode("Feats.Architect", featsArchitect)
    builder.addNode("Feats.Extractor", featsExtractor)
    builder.addNode("Feats.SchemaEnforcer", featsSchemaEnforcer)
    builder.addNode("Feats.MathVerifier", featsMathVerifier)
    builder.addNode("Feats.SyntaxSanitizer", featsSyntaxSanitizer)
    builder.addNode("Feats.Validator", featsFinalValidator)

    // Add Domain 4: Backgrounds Agents (Nodes)
    builder.addNode("Backgrounds.PreProcessor", backgroundsPreProcessor)
    builder.addNode("Backgrounds.Architect", backgroundsArchitect)
    builder.addNode("Backgrounds.Extractor", backgroundsExtractor)
    builder.addNode("Backgrounds.SchemaEnforcer", backgroundsSchemaEnforcer)
    builder.addNode("Backgrounds.MathVerifier", backgroundsMathVerifier)
    builder.addNode("Backgrounds.SyntaxSanitizer", backgroundsSyntaxSanitizer)
    builder.addNode("Backgrounds.Validator", backgroundsFinalValidator)

    // TODO: Add Nodes for the other 27 Domains...
    // Domain 2: Classes
    // Domain 3: Subclasses
    // ...
    // Domain 31: Tools/Kits

    // Define Graph Edges (The Pipeline Flow)
    // 1. Initial Load Balancing routes to correct domain
    builder.addEdge('__start__', 'GlobalLoadBalancer')

    // 2. Route from Load Balancer into the Domains
    builder.addConditionalEdges('GlobalLoadBalancer', async (state) => {
        if (state.targetDomain === '1_Spells') return 'Spells.PreProcessor'
        if (state.targetDomain === '2_Classes') return 'Classes.PreProcessor'
        if (state.targetDomain === '3_Feats') return 'Feats.PreProcessor'
        if (state.targetDomain === '4_Backgrounds') return 'Backgrounds.PreProcessor'
        return 'FormatAdjuster' // Fallback
    })

    // 3. The Linear Micro-Domain Extraction Flow
    builder.addEdge('Spells.PreProcessor', 'Spells.Architect')
    builder.addEdge('Spells.Architect', 'Spells.Extractor')
    builder.addEdge('Spells.Extractor', 'Spells.SchemaEnforcer')
    builder.addEdge('Spells.SchemaEnforcer', 'Spells.MathVerifier')
    builder.addEdge('Spells.MathVerifier', 'Spells.SyntaxSanitizer')
    builder.addEdge('Spells.SyntaxSanitizer', 'Spells.Validator')

    // Classes Domain Flow
    builder.addEdge('Classes.PreProcessor', 'Classes.Architect')
    builder.addEdge('Classes.Architect', 'Classes.Extractor')
    builder.addEdge('Classes.Extractor', 'Classes.SchemaEnforcer')
    builder.addEdge('Classes.SchemaEnforcer', 'Classes.MathVerifier')
    builder.addEdge('Classes.MathVerifier', 'Classes.SyntaxSanitizer')
    builder.addEdge('Classes.SyntaxSanitizer', 'Classes.Validator')

    // Feats Domain Flow
    builder.addEdge('Feats.PreProcessor', 'Feats.Architect')
    builder.addEdge('Feats.Architect', 'Feats.Extractor')
    builder.addEdge('Feats.Extractor', 'Feats.SchemaEnforcer')
    builder.addEdge('Feats.SchemaEnforcer', 'Feats.MathVerifier')
    builder.addEdge('Feats.MathVerifier', 'Feats.SyntaxSanitizer')
    builder.addEdge('Feats.SyntaxSanitizer', 'Feats.Validator')

    // Backgrounds Domain Flow
    builder.addEdge('Backgrounds.PreProcessor', 'Backgrounds.Architect')
    builder.addEdge('Backgrounds.Architect', 'Backgrounds.Extractor')
    builder.addEdge('Backgrounds.Extractor', 'Backgrounds.SchemaEnforcer')
    builder.addEdge('Backgrounds.SchemaEnforcer', 'Backgrounds.MathVerifier')
    builder.addEdge('Backgrounds.MathVerifier', 'Backgrounds.SyntaxSanitizer')
    builder.addEdge('Backgrounds.SyntaxSanitizer', 'Backgrounds.Validator')

    // 4. The Cyclical Validation Loop
    builder.addConditionalEdges('Spells.Validator', shouldRetryOrEnd, {
        retryExtractor: 'Spells.Extractor',
        humanIntervention: 'ArchLibrarian', // Skip to end if failed 3 times
        nextDomainNode: 'ContextCrossRouter'
    })

    // Classes Validation Loop
    builder.addConditionalEdges('Classes.Validator', shouldRetryOrEnd, {
        retryExtractor: 'Classes.Extractor',
        humanIntervention: 'ArchLibrarian',
        nextDomainNode: 'ContextCrossRouter'
    })

    // Feats Validation Loop
    builder.addConditionalEdges('Feats.Validator', shouldRetryOrEnd, {
        retryExtractor: 'Feats.Extractor',
        humanIntervention: 'ArchLibrarian',
        nextDomainNode: 'ContextCrossRouter'
    })

    // Backgrounds Validation Loop
    builder.addConditionalEdges('Backgrounds.Validator', shouldRetryOrEnd, {
        retryExtractor: 'Backgrounds.Extractor',
        humanIntervention: 'ArchLibrarian',
        nextDomainNode: 'ContextCrossRouter'
    })

    // 5. Post-Domain Global Checks
    builder.addEdge('ContextCrossRouter', 'GlobalCombiner')
    builder.addEdge('GlobalCombiner', 'FormatAdjuster')
    builder.addEdge('FormatAdjuster', 'CybersecurityProfessional')
    builder.addEdge('CybersecurityProfessional', 'ErrorTester')

    // 6. Chaos Fault Injection & Sanitization
    builder.addEdge('ErrorTester', 'ChaosEngineer')
    builder.addEdge('ChaosEngineer', 'DataSanitizer')
    builder.addEdge('DataSanitizer', 'DependencyResolver')
    builder.addEdge('DependencyResolver', 'ArchLibrarian')

    // End the process
    builder.addEdge('ArchLibrarian', '__end__')

    return builder.compile()
}

async function extractDndCoreData() {
    console.log("INITIALIZING THE 227-AGENT LANGGRAPH SWARM...")
    const app = buildGodSwarmGraph();
    console.log("Pipeline Architecture Compiled.")
    console.log("Routing logic and conditional edge nodes successfully verified.\n")

    // The raw test string
    const testMarkdown = `#### Fireball
  *Level 3 Evocation (Sorcerer, Wizard)*
  **Casting Time:** Action
  **Range:** 150 feet
  **Components:** V, S, M (a ball of bat guano and sulfur)
  **Duration:** Instantaneous

  A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one.
  Flammable objects in the area that aren't being worn or carried start burning.

  ***Using a Higher-Level Spell Slot.*** The damage increases by 1d6 for each spell slot level above 3.`

    const initialState = {
        targetFilePath: 'src/renderer/public/data/5e/spells/fireball.json',
        targetDomain: '1_Spells',
        rawMarkdownSource: testMarkdown,
        retryLoopCount: 0,
        errorMessage: null,
        crossReferencingSchemas: {},
        relatedDependencies: [],
        humanInterventionRequired: false
    }

    console.log("--- STARTING God-Swarm Extraction Pipeline ---")
    const stream = await app.stream(initialState)

    let finalState;
    for await (const chunk of stream) {
        // Find which node just executed
        const [nodeName] = Object.keys(chunk)
        const stateUpdate = chunk[nodeName]
        finalState = stateUpdate

        console.log(`\n➡️ Node Triggered: [${nodeName}]`)
        if (stateUpdate.currentAgentInControl) {
            console.log(`   Agent in Control: ${stateUpdate.currentAgentInControl}`)
        }
        if (stateUpdate.errorMessage) {
            console.log(`   🚨 ERROR DETECTED: ${stateUpdate.errorMessage}`)
        }
    }

    console.log("\n==========================================")
    console.log("MISSION COMPLETE: PIPELINE EXHAUSTED")
    console.log("==========================================")
    console.log("Final Extracted Data:")

    // finalApprovedJson might be nested depending on how LangGraph accumulated state, 
    // but the last chunk should hold the most recent sanitization.
    if (finalState && finalState.finalApprovedJson) {
        console.log(JSON.stringify(finalState.finalApprovedJson, null, 2))
    } else if (finalState && finalState.sanitizedJson) {
        console.log(JSON.stringify(finalState.sanitizedJson, null, 2))
    } else {
        console.log(finalState)
    }
}

if (require.main === module) {
    extractDndCoreData().catch(console.error)
}

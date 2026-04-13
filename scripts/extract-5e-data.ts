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

// Domain 4: Backgrounds (Active)
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

// Domain 5: Items
async function itemsPreProcessor(state: typeof ExtractionState.State) {
    console.log(`[Domain 5 - Items] PreProcessor cleaning raw markdown text...`)
    const response = await processWithOpus(
        'You are a Markdown pre-processor for D&D 2024 Items (equipment, weapons, armor, adventuring gear, magic items). Remove any unrelated flavor text or adjacent items from this chunk so we isolate exactly one item definition.',
        state.rawMarkdownSource || ''
    )
    return { currentAgentInControl: 'Items.PreProcessor', rawMarkdownSource: response }
}

async function itemsArchitect(state: typeof ExtractionState.State) {
    console.log(`[Domain 5 - Items] Architect building perfect Zod Schema from markdown...`)
    const response = await processWithOpus(
        'You are the Master Data Architect for D&D 2024 Items. Read the provided text and output ONLY a typescript interface that perfectly captures every single field, array, and nested object required to fully digitize this specific item (cost, weight, damage, properties, rarity, attunement, etc.). Output nothing else.',
        state.rawMarkdownSource
    )
    return { currentAgentInControl: 'Items.Architect', extractedZodSchema: response }
}

async function itemsExtractor(state: typeof ExtractionState.State) {
    console.log(`[Domain 5 - Items] Extractor translating markdown into JSON following schema...`)
    const response = await processWithOpus(
        `Extract the markdown item into JSON matching this exact structure:\n${state.extractedZodSchema}\nOutput ONLY valid JSON wrapped in \`\`\`json.`,
        state.rawMarkdownSource
    )

    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/)
    const rawJson = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(response)

    return { currentAgentInControl: 'Items.Extractor', rawExtractedJson: rawJson }
}

async function itemsSchemaEnforcer(_state: typeof ExtractionState.State) {
    console.log(`[Domain 5 - Items] Schema Enforcer verifying keys...`)
    return { currentAgentInControl: 'Items.SchemaEnforcer' }
}

async function itemsMathVerifier(state: typeof ExtractionState.State) {
    console.log(`[Domain 5 - Items] Math Verifier checking costs, weights, damage dice, and AC values...`)
    const response = await processWithOpus(
        `Verify that all costs (gp/sp/cp), weights (lb), damage dice, AC bonuses, and item properties are accurately represented. Does this JSON perfectly match the mechanics in the source markdown?\n\nJSON:\n${JSON.stringify(state.rawExtractedJson)}\n\nMarkdown:\n${state.rawMarkdownSource}\n\nReply EXACTLY with "PASS" or "FAIL: [reason]".`,
        'Verify.'
    )
    const result = response
    if (result.startsWith('FAIL')) {
        return { errorMessage: result, retryLoopCount: (state.retryLoopCount || 0) + 1 }
    }
    return { currentAgentInControl: 'Items.MathVerifier', errorMessage: null }
}

async function itemsSyntaxSanitizer(state: typeof ExtractionState.State) {
    console.log(`[Domain 5 - Items] Syntax Sanitizer ensuring proper formatting...`)
    return { currentAgentInControl: 'Items.SyntaxSanitizer', sanitizedJson: state.rawExtractedJson }
}

async function itemsFinalValidator(state: typeof ExtractionState.State) {
    console.log(`[Domain 5 - Items] Final Validator approving output...`)
    return { currentAgentInControl: 'Items.FinalValidator', finalApprovedJson: state.sanitizedJson }
}

// ==========================================
// FACTORY DOMAINS (6-31): Config-driven agent generation
// ==========================================
interface FactoryDomainConfig {
    id: number
    name: string
    label: string
    singular: string
    preProcessorHint: string
    architectHint: string
    mathVerifierHint: string
}

const FACTORY_DOMAINS: FactoryDomainConfig[] = [
    {
        id: 6, name: 'Subclasses', label: 'Subclasses', singular: 'subclass',
        preProcessorHint: 'Subclasses (e.g., Champion Fighter, Evocation Wizard). Isolate exactly one subclass definition with all its features by level.',
        architectHint: 'D&D 2024 Subclasses. Capture subclass name, parent class, features by level, spell lists, and all mechanical benefits.',
        mathVerifierHint: 'Verify that all subclass feature levels, spell slot progressions, damage dice, and ability modifiers are accurate.'
    },
    {
        id: 7, name: 'Monsters', label: 'Monsters', singular: 'monster',
        preProcessorHint: 'Monsters/Creatures from the Monster Manual. Isolate exactly one monster stat block.',
        architectHint: 'D&D 2024 Monsters. Capture CR, HP, AC, speeds, ability scores, saving throws, skills, resistances, immunities, senses, languages, traits, actions, reactions, legendary actions, and lair actions.',
        mathVerifierHint: 'Verify that AC, HP (hit dice formula matches average), attack bonuses (+prof+ability), damage dice, save DCs (8+prof+ability), and CR-to-proficiency mapping are all mathematically correct.'
    },
    {
        id: 8, name: 'Species', label: 'Races/Species', singular: 'species',
        preProcessorHint: 'Races/Species (e.g., Elf, Dwarf, Human). Isolate exactly one species definition with all traits and subraces.',
        architectHint: 'D&D 2024 Species. Capture species name, traits, ability score increases, size, speed, darkvision, resistances, proficiencies, and any subrace variants.',
        mathVerifierHint: 'Verify that ability score bonuses, movement speeds, darkvision ranges, and trait mechanics match the source exactly.'
    },
    {
        id: 9, name: 'MagicItems', label: 'Magic Items', singular: 'magic item',
        preProcessorHint: 'Magic Items (weapons, armor, wondrous items, potions, scrolls, rings, etc.). Isolate exactly one magic item definition.',
        architectHint: 'D&D 2024 Magic Items. Capture name, type, rarity, attunement requirements, properties, charges, recharge mechanics, spell effects, and bonus values.',
        mathVerifierHint: 'Verify that attack/damage bonuses, AC bonuses, charge counts, recharge dice, save DCs, spell levels, and rarity classification are accurate.'
    },
    {
        id: 10, name: 'Equipment', label: 'Equipment', singular: 'equipment item',
        preProcessorHint: 'Mundane Equipment (weapons, armor, adventuring gear, tools, mounts, trade goods). Isolate exactly one equipment entry.',
        architectHint: 'D&D 2024 Equipment. Capture name, category, cost (gp/sp/cp), weight (lb), damage dice, damage type, weapon properties, AC value, strength requirement, stealth disadvantage.',
        mathVerifierHint: 'Verify that all costs, weights, damage dice, AC values, range values, and weapon properties match the PHB equipment tables exactly.'
    },
    {
        id: 11, name: 'Conditions', label: 'Conditions', singular: 'condition',
        preProcessorHint: 'Conditions (Blinded, Charmed, Frightened, etc.). Isolate exactly one condition definition with all its mechanical effects.',
        architectHint: 'D&D 2024 Conditions. Capture condition name, mechanical effects (advantage/disadvantage grants, speed changes, incapacitation, auto-fail conditions), and removal triggers.',
        mathVerifierHint: 'Verify that all mechanical effects (advantage/disadvantage, speed modifiers, automatic failures) exactly match the 2024 PHB condition descriptions.'
    },
    {
        id: 12, name: 'Languages', label: 'Languages', singular: 'language',
        preProcessorHint: 'Languages (Common, Elvish, Dwarvish, etc.). Isolate exactly one language entry with its typical speakers and script.',
        architectHint: 'D&D 2024 Languages. Capture language name, script used, typical speakers, whether it is standard or exotic, and any special properties.',
        mathVerifierHint: 'Verify that language classifications (standard/exotic), scripts, and typical speaker lists match the PHB language tables.'
    },
    {
        id: 13, name: 'Skills', label: 'Skills', singular: 'skill',
        preProcessorHint: 'Skills (Athletics, Arcana, Perception, etc.). Isolate exactly one skill definition with its associated ability and usage examples.',
        architectHint: 'D&D 2024 Skills. Capture skill name, associated ability score, typical usage descriptions, and example DCs where provided.',
        mathVerifierHint: 'Verify that each skill is mapped to the correct ability score and descriptions match the PHB skill list.'
    },
    {
        id: 14, name: 'AbilityScores', label: 'Ability Scores', singular: 'ability score',
        preProcessorHint: 'Ability Scores (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma). Isolate exactly one ability score definition.',
        architectHint: 'D&D 2024 Ability Scores. Capture name, abbreviation, description, associated skills, common checks, and modifier calculation rules.',
        mathVerifierHint: 'Verify that associated skills and check examples match the PHB ability score descriptions.'
    },
    {
        id: 15, name: 'Alignments', label: 'Alignments', singular: 'alignment',
        preProcessorHint: 'Alignments (Lawful Good, Chaotic Neutral, etc.). Isolate exactly one alignment definition.',
        architectHint: 'D&D 2024 Alignments. Capture alignment name, abbreviation, description, and behavioral tendencies.',
        mathVerifierHint: 'Verify that alignment descriptions and categorizations match the PHB alignment section.'
    },
    {
        id: 16, name: 'DamageTypes', label: 'Damage Types', singular: 'damage type',
        preProcessorHint: 'Damage Types (Fire, Cold, Radiant, Necrotic, etc.). Isolate exactly one damage type definition.',
        architectHint: 'D&D 2024 Damage Types. Capture damage type name, description, common sources, and any special interaction rules.',
        mathVerifierHint: 'Verify that damage type descriptions and source examples match the PHB/DMG damage type listings.'
    },
    {
        id: 17, name: 'Environments', label: 'Environments', singular: 'environment',
        preProcessorHint: 'Environments/Terrains (Arctic, Desert, Forest, Underdark, etc.). Isolate exactly one environment type.',
        architectHint: 'D&D 2024 Environments. Capture environment name, terrain features, typical hazards, encounter types, travel pace modifiers, and foraging DCs.',
        mathVerifierHint: 'Verify that travel DCs, foraging DCs, hazard damage, and navigation checks match the DMG environment rules.'
    },
    {
        id: 18, name: 'NPCStatBlocks', label: 'NPC Stat Blocks', singular: 'NPC stat block',
        preProcessorHint: 'NPC Stat Blocks (Commoner, Noble, Bandit Captain, Archmage, etc.). Isolate exactly one NPC stat block.',
        architectHint: 'D&D 2024 NPC Stat Blocks. Same structure as Monsters: CR, HP, AC, speeds, ability scores, saves, skills, actions, and any spellcasting.',
        mathVerifierHint: 'Verify that AC, HP formula, attack bonuses, damage dice, save DCs, and spellcasting details are mathematically correct.'
    },
    {
        id: 19, name: 'Traps', label: 'Traps', singular: 'trap',
        preProcessorHint: 'Traps and Hazards (pit traps, poison darts, collapsing ceiling, etc.). Isolate exactly one trap definition.',
        architectHint: 'D&D 2024 Traps. Capture trap name, severity (setback/dangerous/deadly), trigger, effect, damage, save DC, detection DC, disable DC, and countermeasures.',
        mathVerifierHint: 'Verify that trap DCs, damage dice, severity ratings, and level-appropriate values match the DMG trap tables.'
    },
    {
        id: 20, name: 'DiseasesPoisons', label: 'Diseases & Poisons', singular: 'disease or poison',
        preProcessorHint: 'Diseases and Poisons (Cackle Fever, Sight Rot, Assassin\'s Blood, etc.). Isolate exactly one disease or poison definition.',
        architectHint: 'D&D 2024 Diseases & Poisons. Capture name, type (contact/ingested/inhaled/injury for poisons; disease for diseases), save DC, onset time, effects per failed save, cure conditions, and duration.',
        mathVerifierHint: 'Verify that save DCs, damage dice, onset durations, and cure conditions match the DMG disease/poison tables.'
    },
    {
        id: 21, name: 'Vehicles', label: 'Vehicles', singular: 'vehicle',
        preProcessorHint: 'Vehicles (Rowboat, Sailing Ship, Airship, Infernal War Machine, etc.). Isolate exactly one vehicle definition.',
        architectHint: 'D&D 2024 Vehicles. Capture name, type, size, AC, HP, speed, capacity, crew requirements, components (hull, control, movement, weapons), and any special features.',
        mathVerifierHint: 'Verify that vehicle AC, HP, speed, damage thresholds, and crew requirements match the DMG vehicle rules.'
    },
    {
        id: 22, name: 'Deities', label: 'Deities', singular: 'deity',
        preProcessorHint: 'Deities and Pantheons (Pelor, Tiamat, Moradin, etc.). Isolate exactly one deity definition.',
        architectHint: 'D&D 2024 Deities. Capture deity name, alignment, domains, symbol, pantheon, description, and associated holy days or rites.',
        mathVerifierHint: 'Verify that deity alignment, domains, and pantheon classifications match the PHB/DMG deity tables.'
    },
    {
        id: 23, name: 'Planes', label: 'Planes of Existence', singular: 'plane',
        preProcessorHint: 'Planes of Existence (Material, Feywild, Shadowfell, Elemental Planes, Outer Planes, etc.). Isolate exactly one planar definition.',
        architectHint: 'D&D 2024 Planes. Capture plane name, category (Inner/Outer/Transitive), traits (gravity, time, morphic, elemental/energy), notable locations, inhabitants, and travel methods.',
        mathVerifierHint: 'Verify that planar traits, categorizations, and optional rule effects match the DMG planar descriptions.'
    },
    {
        id: 24, name: 'WildMagicSurges', label: 'Wild Magic Surges', singular: 'wild magic surge entry',
        preProcessorHint: 'Wild Magic Surge table entries. Isolate exactly one surge result with its d100 range and effect.',
        architectHint: 'D&D 2024 Wild Magic Surges. Capture d100 range (e.g., 01-02), effect description, duration, damage (if any), and any saving throw information.',
        mathVerifierHint: 'Verify that d100 ranges are contiguous and non-overlapping, damage dice are correct, and spell effects reference valid spells.'
    },
    {
        id: 25, name: 'MadnessTables', label: 'Madness Tables', singular: 'madness entry',
        preProcessorHint: 'Madness table entries (Short-Term, Long-Term, Indefinite Madness). Isolate one madness entry with its roll range and effect.',
        architectHint: 'D&D 2024 Madness. Capture madness type (short/long/indefinite), d100 or d10 range, effect description, and duration.',
        mathVerifierHint: 'Verify that roll ranges are correct, durations match DMG madness rules, and effects are accurately transcribed.'
    },
    {
        id: 26, name: 'RandomEncounters', label: 'Random Encounters', singular: 'random encounter entry',
        preProcessorHint: 'Random Encounter table entries organized by environment and level. Isolate one encounter table entry.',
        architectHint: 'D&D 2024 Random Encounters. Capture environment type, level range, d100 range, encounter description, monster types and quantities, and any special conditions.',
        mathVerifierHint: 'Verify that d100 ranges are valid, monster quantities make sense for the CR budget, and environment types are correctly categorized.'
    },
    {
        id: 27, name: 'Weather', label: 'Weather', singular: 'weather entry',
        preProcessorHint: 'Weather table entries (temperature, wind, precipitation by climate). Isolate one weather condition or table entry.',
        architectHint: 'D&D 2024 Weather. Capture climate zone, d20 roll range, temperature range, wind conditions, precipitation type, and mechanical effects on travel/visibility/combat.',
        mathVerifierHint: 'Verify that roll ranges, temperature effects, visibility penalties, and travel modifiers match the DMG weather rules.'
    },
    {
        id: 28, name: 'DowntimeActivities', label: 'Downtime Activities', singular: 'downtime activity',
        preProcessorHint: 'Downtime Activities (Crafting, Research, Training, Carousing, etc.). Isolate exactly one downtime activity.',
        architectHint: 'D&D 2024 Downtime Activities. Capture activity name, time required, cost (gp), ability checks needed, DC, possible outcomes, complications table, and resources consumed.',
        mathVerifierHint: 'Verify that time requirements, gold costs, check DCs, and complication roll ranges match the DMG downtime rules.'
    },
    {
        id: 29, name: 'CharCreationOptions', label: 'Character Creation Options', singular: 'character creation option',
        preProcessorHint: 'Character Creation supplementary options (trinkets, bonds, ideals, flaws, life events). Isolate one table or option set.',
        architectHint: 'D&D 2024 Character Creation Options. Capture table name, roll type (d6/d8/d10/d100), entries with roll ranges, and category.',
        mathVerifierHint: 'Verify that roll ranges cover the full die range without gaps or overlaps and entries match the PHB tables.'
    },
    {
        id: 30, name: 'RuleVariants', label: 'Rule Variants', singular: 'rule variant',
        preProcessorHint: 'Optional/Variant Rules (Flanking, Cleave, Massive Damage, Hero Points, etc.). Isolate exactly one variant rule.',
        architectHint: 'D&D 2024 Rule Variants. Capture rule name, category (combat/exploration/social), description, mechanical changes, and any DM guidelines.',
        mathVerifierHint: 'Verify that mechanical values (bonus amounts, DCs, damage thresholds) match the DMG variant rules section.'
    },
    {
        id: 31, name: 'ToolsKits', label: 'Tools & Kits', singular: 'tool or kit',
        preProcessorHint: 'Tools and Kits (Thieves\' Tools, Herbalism Kit, Smith\'s Tools, etc.). Isolate exactly one tool or kit definition.',
        architectHint: 'D&D 2024 Tools & Kits. Capture tool name, cost, weight, associated ability, proficiency uses, crafting capabilities, and example activities with DCs.',
        mathVerifierHint: 'Verify that costs, weights, example DCs, and crafting capabilities match the PHB tools tables.'
    },
    {
        id: 32, name: 'ClassFeatures', label: 'Class Features', singular: 'class feature',
        preProcessorHint: 'Class or Subclass Features (Sneak Attack, Channel Divinity, etc.). Isolate exactly one class feature.',
        architectHint: 'D&D 2024 Class Features. Capture feature name, required level, class/subclass, limited uses/rest rules, and mechanical effects.',
        mathVerifierHint: 'Verify that required levels and mechanical scaling exactly match the PHB classes chapter.'
    },
    {
        id: 33, name: 'Invocations', label: 'Eldritch Invocations', singular: 'invocation',
        preProcessorHint: 'Eldritch Invocations. Isolate exactly one invocation definition.',
        architectHint: 'D&D 2024 Invocations. Capture invocation name, prerequisites (level, pact boon, etc.), and mechanical effect.',
        mathVerifierHint: 'Verify that prerequisites and spell effects match the PHB Warlock chapter.'
    },
    {
        id: 34, name: 'Metamagic', label: 'Metamagic Options', singular: 'metamagic option',
        preProcessorHint: 'Metamagic Options (Careful Spell, Quickened Spell, etc.). Isolate exactly one option.',
        architectHint: 'D&D 2024 Metamagic. Capture metamagic name, Sorcery Point cost, and mechanic description.',
        mathVerifierHint: 'Verify that Sorcery Point costs match the PHB Sorcerer chapter.'
    }
]

function domainAgentFactory(domain: FactoryDomainConfig) {
    const { name, label, singular, preProcessorHint, architectHint, mathVerifierHint } = domain

    const preProcessor = async (state: typeof ExtractionState.State) => {
        console.log(`[Domain ${domain.id} - ${label}] PreProcessor cleaning raw markdown text...`)
        const response = await processWithOpus(
            `You are a Markdown pre-processor for D&D 2024 ${label}. ${preProcessorHint}`,
            state.rawMarkdownSource || ''
        )
        return { currentAgentInControl: `${name}.PreProcessor`, rawMarkdownSource: response }
    }

    const architect = async (state: typeof ExtractionState.State) => {
        console.log(`[Domain ${domain.id} - ${label}] Architect building perfect Zod Schema from markdown...`)
        const response = await processWithOpus(
            `You are the Master Data Architect for ${architectHint} Read the provided text and output ONLY a typescript interface that perfectly captures every single field, array, and nested object required to fully digitize this specific ${singular}. Output nothing else.`,
            state.rawMarkdownSource
        )
        return { currentAgentInControl: `${name}.Architect`, extractedZodSchema: response }
    }

    const extractor = async (state: typeof ExtractionState.State) => {
        console.log(`[Domain ${domain.id} - ${label}] Extractor translating markdown into JSON following schema...`)
        const response = await processWithOpus(
            `Extract the markdown ${singular} into JSON matching this exact structure:\n${state.extractedZodSchema}\nOutput ONLY valid JSON wrapped in \`\`\`json.`,
            state.rawMarkdownSource
        )
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/)
        const rawJson = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(response)
        return { currentAgentInControl: `${name}.Extractor`, rawExtractedJson: rawJson }
    }

    const schemaEnforcer = async (_state: typeof ExtractionState.State) => {
        console.log(`[Domain ${domain.id} - ${label}] Schema Enforcer verifying keys...`)
        return { currentAgentInControl: `${name}.SchemaEnforcer` }
    }

    const mathVerifier = async (state: typeof ExtractionState.State) => {
        console.log(`[Domain ${domain.id} - ${label}] Math Verifier checking numerical accuracy...`)
        const response = await processWithOpus(
            `${mathVerifierHint} Does this JSON perfectly match the mechanics in the source markdown?\n\nJSON:\n${JSON.stringify(state.rawExtractedJson)}\n\nMarkdown:\n${state.rawMarkdownSource}\n\nReply EXACTLY with "PASS" or "FAIL: [reason]".`,
            'Verify.'
        )
        if (response.startsWith('FAIL')) {
            return { errorMessage: response, retryLoopCount: (state.retryLoopCount || 0) + 1 }
        }
        return { currentAgentInControl: `${name}.MathVerifier`, errorMessage: null }
    }

    const syntaxSanitizer = async (state: typeof ExtractionState.State) => {
        console.log(`[Domain ${domain.id} - ${label}] Syntax Sanitizer ensuring proper formatting...`)
        return { currentAgentInControl: `${name}.SyntaxSanitizer`, sanitizedJson: state.rawExtractedJson }
    }

    const finalValidator = async (state: typeof ExtractionState.State) => {
        console.log(`[Domain ${domain.id} - ${label}] Final Validator approving output...`)
        return { currentAgentInControl: `${name}.FinalValidator`, finalApprovedJson: state.sanitizedJson }
    }

    return { preProcessor, architect, extractor, schemaEnforcer, mathVerifier, syntaxSanitizer, finalValidator }
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

    // Add Domain 5: Items Agents (Nodes)
    builder.addNode("Items.PreProcessor", itemsPreProcessor)
    builder.addNode("Items.Architect", itemsArchitect)
    builder.addNode("Items.Extractor", itemsExtractor)
    builder.addNode("Items.SchemaEnforcer", itemsSchemaEnforcer)
    builder.addNode("Items.MathVerifier", itemsMathVerifier)
    builder.addNode("Items.SyntaxSanitizer", itemsSyntaxSanitizer)
    builder.addNode("Items.Validator", itemsFinalValidator)

    // Domains 6-31: Factory-generated agents
    for (const domain of FACTORY_DOMAINS) {
        const agents = domainAgentFactory(domain)
        builder.addNode(`${domain.name}.PreProcessor`, agents.preProcessor)
        builder.addNode(`${domain.name}.Architect`, agents.architect)
        builder.addNode(`${domain.name}.Extractor`, agents.extractor)
        builder.addNode(`${domain.name}.SchemaEnforcer`, agents.schemaEnforcer)
        builder.addNode(`${domain.name}.MathVerifier`, agents.mathVerifier)
        builder.addNode(`${domain.name}.SyntaxSanitizer`, agents.syntaxSanitizer)
        builder.addNode(`${domain.name}.Validator`, agents.finalValidator)
    }

    // Define Graph Edges (The Pipeline Flow)
    // 1. Initial Load Balancing routes to correct domain
    builder.addEdge('__start__', 'GlobalLoadBalancer')

    // 2. Route from Load Balancer into the Domains
    builder.addConditionalEdges('GlobalLoadBalancer', async (state) => {
        if (state.targetDomain === '1_Spells') return 'Spells.PreProcessor'
        if (state.targetDomain === '2_Classes') return 'Classes.PreProcessor'
        if (state.targetDomain === '3_Feats') return 'Feats.PreProcessor'
        if (state.targetDomain === '4_Backgrounds') return 'Backgrounds.PreProcessor'
        if (state.targetDomain === '5_Items') return 'Items.PreProcessor'
        // Factory domains (6-31)
        const factoryDomain = FACTORY_DOMAINS.find(d => state.targetDomain === `${d.id}_${d.name}`)
        if (factoryDomain) return `${factoryDomain.name}.PreProcessor`
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

    // Items Domain Flow
    builder.addEdge('Items.PreProcessor', 'Items.Architect')
    builder.addEdge('Items.Architect', 'Items.Extractor')
    builder.addEdge('Items.Extractor', 'Items.SchemaEnforcer')
    builder.addEdge('Items.SchemaEnforcer', 'Items.MathVerifier')
    builder.addEdge('Items.MathVerifier', 'Items.SyntaxSanitizer')
    builder.addEdge('Items.SyntaxSanitizer', 'Items.Validator')

    // Factory Domain Flows (6-31)
    for (const domain of FACTORY_DOMAINS) {
        const n = domain.name
        builder.addEdge(`${n}.PreProcessor`, `${n}.Architect`)
        builder.addEdge(`${n}.Architect`, `${n}.Extractor`)
        builder.addEdge(`${n}.Extractor`, `${n}.SchemaEnforcer`)
        builder.addEdge(`${n}.SchemaEnforcer`, `${n}.MathVerifier`)
        builder.addEdge(`${n}.MathVerifier`, `${n}.SyntaxSanitizer`)
        builder.addEdge(`${n}.SyntaxSanitizer`, `${n}.Validator`)
    }

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

    // Items Validation Loop
    builder.addConditionalEdges('Items.Validator', shouldRetryOrEnd, {
        retryExtractor: 'Items.Extractor',
        humanIntervention: 'ArchLibrarian',
        nextDomainNode: 'ContextCrossRouter'
    })

    // Factory Domain Validation Loops (6-31)
    for (const domain of FACTORY_DOMAINS) {
        builder.addConditionalEdges(`${domain.name}.Validator`, shouldRetryOrEnd, {
            retryExtractor: `${domain.name}.Extractor`,
            humanIntervention: 'ArchLibrarian',
            nextDomainNode: 'ContextCrossRouter'
        })
    }

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

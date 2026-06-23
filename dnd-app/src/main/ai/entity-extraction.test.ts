import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../log', () => ({ logToFile: vi.fn() }))

const storeMock = vi.hoisted(() => ({
  config: { enabled: false, autoExtract: false, loreMode: 'all' as 'all' | 'triggered' },
  records: [] as Array<{ name: string }>,
  upsertEntity: vi.fn(async (_input: { source?: string }) => ({ applied: true, detail: 'created' }))
}))

vi.mock('./entity-store', () => ({
  getEntityStore: vi.fn(() => ({
    getConfig: async () => storeMock.config,
    getSnapshot: async () => ({ config: storeMock.config, records: storeMock.records }),
    upsertEntity: storeMock.upsertEntity
  }))
}))

import { buildExtractionPrompt, EXTRACTION_SCHEMA, extractEntities, runEntityExtraction } from './entity-extraction'
import type { LLMProvider } from './llm-provider'

function makeProvider(opts: { structured?: string; chat?: string; withStructured?: boolean }): LLMProvider {
  const p: any = {
    type: 'ollama',
    streamChat: vi.fn(),
    chatOnce: vi.fn(async () => opts.chat ?? '{"entities":[]}'),
    isAvailable: vi.fn(async () => true),
    listModels: vi.fn(async () => [])
  }
  if (opts.withStructured) p.structuredOnce = vi.fn(async () => opts.structured ?? '{"entities":[]}')
  return p as LLMProvider
}

function entitiesJson(n: number): string {
  const arr = Array.from({ length: n }, (_, i) => ({ kind: 'npc', name: `N${i}`, summary: `s${i}` }))
  return JSON.stringify({ entities: arr })
}

beforeEach(() => {
  vi.clearAllMocks()
  storeMock.config = { enabled: false, autoExtract: false, loreMode: 'all' }
  storeMock.records = []
})

describe('buildExtractionPrompt', () => {
  it('lists known names and instructs the empty-result shape', () => {
    const { system, user } = buildExtractionPrompt('A goblin appears.', ['Volo', 'Ama Tilen'])
    expect(system).toContain('Volo, Ama Tilen')
    expect(system).toContain('{"entities": []}')
    expect(user).toContain('A goblin appears.')
  })
  it('says "(none yet)" when there are no known names', () => {
    expect(buildExtractionPrompt('x', []).system).toContain('(none yet)')
  })
})

describe('EXTRACTION_SCHEMA', () => {
  it('is a flat object schema capping entities at 6', () => {
    const entities = (EXTRACTION_SCHEMA.properties as Record<string, { maxItems?: number }>).entities
    expect(entities.maxItems).toBe(6)
  })
})

describe('extractEntities', () => {
  it('prefers structuredOnce when the provider has it', async () => {
    const p = makeProvider({
      withStructured: true,
      structured: '{"entities":[{"kind":"npc","name":"Volo","summary":"a barkeep"}]}'
    })
    const out = await extractEntities(p, 'm', 'narr', [])
    expect(out).toEqual([{ kind: 'npc', name: 'Volo', summary: 'a barkeep' }])
    expect((p as any).structuredOnce).toHaveBeenCalled()
    expect(p.chatOnce).not.toHaveBeenCalled()
  })

  it('falls back to chatOnce and parses fenced JSON', async () => {
    const p = makeProvider({
      chat: '```json\n{"entities":[{"kind":"location","name":"Brindlemark","summary":"a village"}]}\n```'
    })
    const out = await extractEntities(p, 'm', 'narr', [])
    expect(out).toEqual([{ kind: 'location', name: 'Brindlemark', summary: 'a village' }])
    expect(p.chatOnce).toHaveBeenCalled()
  })

  it('returns null on unparseable output', async () => {
    const p = makeProvider({ chat: 'I could not find any entities, sorry!' })
    expect(await extractEntities(p, 'm', 'narr', [])).toBeNull()
  })
})

describe('runEntityExtraction', () => {
  it('bails (no provider call, no upsert) when the flags are off', async () => {
    storeMock.config = { enabled: false, autoExtract: false, loreMode: 'all' }
    const p = makeProvider({ withStructured: true, structured: entitiesJson(2) })
    await runEntityExtraction('c1', p, 'm', 'narr')
    expect((p as any).structuredOnce).not.toHaveBeenCalled()
    expect(storeMock.upsertEntity).not.toHaveBeenCalled()
  })

  it('bails when enabled but autoExtract is off', async () => {
    storeMock.config = { enabled: true, autoExtract: false, loreMode: 'all' }
    const p = makeProvider({ withStructured: true, structured: entitiesJson(2) })
    await runEntityExtraction('c1', p, 'm', 'narr')
    expect(storeMock.upsertEntity).not.toHaveBeenCalled()
  })

  it('upserts each extracted entity with source:extraction, capped at 6', async () => {
    storeMock.config = { enabled: true, autoExtract: true, loreMode: 'all' }
    const p = makeProvider({ withStructured: true, structured: entitiesJson(8) })
    await runEntityExtraction('c1', p, 'm', 'narr')
    expect(storeMock.upsertEntity).toHaveBeenCalledTimes(6) // capped
    expect(storeMock.upsertEntity.mock.calls[0][0]).toMatchObject({ source: 'extraction' })
  })
})

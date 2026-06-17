import { describe, expect, it } from 'vitest'
import { type AiRoutingConfig, type AiTaskClass, isRoutableTask, resolveModelForTask } from './model-routing'

const PRIMARY = 'llama3.1:8b'
const SMALL = 'llama3.2:1b'

describe('isRoutableTask', () => {
  it('classifies summary/extraction/mechanics as routable; narration/vision are not', () => {
    expect(isRoutableTask('summary')).toBe(true)
    expect(isRoutableTask('extraction')).toBe(true)
    expect(isRoutableTask('mechanics')).toBe(true)
    expect(isRoutableTask('narration')).toBe(false)
    expect(isRoutableTask('vision')).toBe(false)
  })
})

describe('resolveModelForTask', () => {
  const TASKS: AiTaskClass[] = ['narration', 'summary', 'extraction', 'mechanics', 'vision']

  it('returns the primary model for every task when routing is undefined', () => {
    for (const t of TASKS) expect(resolveModelForTask(t, PRIMARY, undefined)).toBe(PRIMARY)
  })

  it('returns the primary model for every task when routing is disabled', () => {
    const routing: AiRoutingConfig = { enabled: false, smallModel: SMALL }
    for (const t of TASKS) expect(resolveModelForTask(t, PRIMARY, routing)).toBe(PRIMARY)
  })

  it('returns the primary model when smallModel is empty even if enabled', () => {
    const routing: AiRoutingConfig = { enabled: true, smallModel: '   ' }
    for (const t of TASKS) expect(resolveModelForTask(t, PRIMARY, routing)).toBe(PRIMARY)
  })

  it('routes summary/extraction/mechanics to the small model when enabled', () => {
    const routing: AiRoutingConfig = { enabled: true, smallModel: SMALL }
    expect(resolveModelForTask('summary', PRIMARY, routing)).toBe(SMALL)
    expect(resolveModelForTask('extraction', PRIMARY, routing)).toBe(SMALL)
    expect(resolveModelForTask('mechanics', PRIMARY, routing)).toBe(SMALL)
  })

  it('keeps narration and vision on the primary model even when routing is enabled', () => {
    const routing: AiRoutingConfig = { enabled: true, smallModel: SMALL }
    expect(resolveModelForTask('narration', PRIMARY, routing)).toBe(PRIMARY)
    expect(resolveModelForTask('vision', PRIMARY, routing)).toBe(PRIMARY)
  })

  it('honours a per-task override over the small model', () => {
    const routing: AiRoutingConfig = {
      enabled: true,
      smallModel: SMALL,
      overrides: { mechanics: 'qwen2.5:0.5b' }
    }
    expect(resolveModelForTask('mechanics', PRIMARY, routing)).toBe('qwen2.5:0.5b')
    expect(resolveModelForTask('summary', PRIMARY, routing)).toBe(SMALL) // no override → small
  })

  it('ignores an override for a non-routable task (narration stays primary)', () => {
    const routing: AiRoutingConfig = {
      enabled: true,
      smallModel: SMALL,
      // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid key to prove it is ignored
      overrides: { narration: 'sneaky' } as any
    }
    expect(resolveModelForTask('narration', PRIMARY, routing)).toBe(PRIMARY)
  })
})

import { beforeAll, describe, expect, it } from 'vitest'
import { i18n, initI18n } from './index'

describe('i18n foundation (Phase 34a)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('initializes and resolves a seeded key', () => {
    expect(i18n.isInitialized).toBe(true)
    expect(i18n.t('common.actions.save')).toBe('Save')
    expect(i18n.t('common.states.loading')).toBe('Loading...')
  })

  it('initI18n is idempotent', async () => {
    await initI18n()
    expect(i18n.isInitialized).toBe(true)
  })
})

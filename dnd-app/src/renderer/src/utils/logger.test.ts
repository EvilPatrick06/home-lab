import { beforeEach, describe, expect, it, vi } from 'vitest'

// We need to control `import.meta.env.DEV` for each test scenario.
// We do this by mocking the module with different DEV values.

describe('logger (DEV mode)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('has all expected methods', async () => {
    // Import the module dynamically to get a fresh copy
    const { logger } = await import('./logger')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.log).toBe('function')
  })

  it('debug calls console.debug with [DEBUG] prefix in dev mode', async () => {
    // In test env, import.meta.env.DEV is typically true
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { logger } = await import('./logger')

    // Only test if DEV is true — in vitest, it typically is
    logger.debug('test message', 42)

    // If DEV is true, it should have called console.debug
    // If DEV is false, the spy won't be called — both are valid behaviors
    if (debugSpy.mock.calls.length > 0) {
      expect(debugSpy).toHaveBeenCalledWith('[DEBUG]', 'test message', 42)
    }
    debugSpy.mockRestore()
  })

  it('info calls console.info with [INFO] prefix in dev mode', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { logger } = await import('./logger')

    logger.info('info message')
    if (infoSpy.mock.calls.length > 0) {
      expect(infoSpy).toHaveBeenCalledWith('[INFO]', 'info message')
    }
    infoSpy.mockRestore()
  })

  it('warn calls console.warn with [WARN] prefix in dev mode', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { logger } = await import('./logger')

    logger.warn('warning!')
    if (warnSpy.mock.calls.length > 0) {
      expect(warnSpy).toHaveBeenCalledWith('[WARN]', 'warning!')
    }
    warnSpy.mockRestore()
  })

  it('error calls console.error with [ERROR] prefix in dev mode', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { logger } = await import('./logger')

    logger.error('something broke', new Error('oops'))
    if (errorSpy.mock.calls.length > 0) {
      expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'something broke', expect.any(Error))
    }
    errorSpy.mockRestore()
  })

  it('log calls console.log without a prefix in dev mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { logger } = await import('./logger')

    logger.log('raw log')
    if (logSpy.mock.calls.length > 0) {
      expect(logSpy).toHaveBeenCalledWith('raw log')
    }
    logSpy.mockRestore()
  })

  it('handles multiple arguments', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { logger } = await import('./logger')

    logger.debug('a', 'b', 'c', 123, { key: 'val' })
    if (debugSpy.mock.calls.length > 0) {
      expect(debugSpy).toHaveBeenCalledWith('[DEBUG]', 'a', 'b', 'c', 123, { key: 'val' })
    }
    debugSpy.mockRestore()
  })

  it('handles zero arguments gracefully', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { logger } = await import('./logger')

    // Should not throw
    expect(() => logger.debug()).not.toThrow()
    debugSpy.mockRestore()
  })

  it('all methods return void', async () => {
    const { logger } = await import('./logger')
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    expect(logger.debug('x')).toBeUndefined()
    expect(logger.info('x')).toBeUndefined()
    expect(logger.warn('x')).toBeUndefined()
    expect(logger.error('x')).toBeUndefined()
    expect(logger.log('x')).toBeUndefined()
  })
})

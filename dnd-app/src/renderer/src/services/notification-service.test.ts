import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

describe('notification-service', () => {
  const srcPath = resolve(__dirname, './notification-service.ts')
  const src = readFileSync(srcPath, 'utf-8')

  it('module file exists', () => {
    expect(existsSync(srcPath)).toBe(true)
  })

  it('exports notify function', () => {
    expect(src).toContain('export function notify')
  })

  it('exports isSupported function', () => {
    expect(src).toContain('export function isSupported')
  })

  it('exports setEventEnabled function', () => {
    expect(src).toContain('export function setEventEnabled')
  })

  it('exports NotificationEvent type', () => {
    expect(src).toContain('NotificationEvent')
  })
})
